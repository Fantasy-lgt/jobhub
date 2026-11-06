/**
 * AI 任务运行器：单题隔离 + 状态机 pending→running→done/failed + 批量续跑。
 * 反编造校验在落库前生效；失败标 failed + error_msg，机检与原文不受影响。
 */
import crypto from 'crypto';
import { db, toJson } from '../db';
import { config } from '../config';
import { notFound } from '../lib/http';
import { chat } from './deepseek';
import { analyzeMessages, type ChatMessage } from './prompts';
import { sanitizeRewrite, validateRewrite } from './anti-fabrication';
import type { InterviewQuestionRow, QuestionAnalysisRow } from '../types';

export interface AnalysisPayload {
  examine_point: string;
  inferred_flags: string[];
  keep_text: string;
  rewrite_text: string;
  need_numbers: string;
}

/** JSON 解析失败信号（供上层触发带修正提示的一次重试）。 */
export class ModelJsonParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ModelJsonParseError';
  }
}

/** 解析失败后追加给模型的修正提示。 */
export const JSON_CORRECTION_PROMPT =
  '你上一次返回的 JSON 不合法，无法解析。请只输出一个合法的 JSON 对象：键名用双引号包裹、不要尾逗号、不要输出 JSON 以外的任何文字。';

/**
 * 从模型输出中稳健提取 JSON：
 * 去 BOM → 去 markdown 围栏 → 截取首个 { 到最后一个 } → 去尾逗号 → JSON.parse。
 * 仍失败则抛 ModelJsonParseError（未引号键/缺逗号等结构性错误交给「修正重试」兜底）。
 */
export function parseModelJson(text: string): Record<string, unknown> {
  let t = (text || '').trim().replace(/^\uFEFF/, '');
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start >= 0 && end > start) t = t.slice(start, end + 1);
  // 去尾逗号（对象/数组末尾的 ,} 或 ,]）
  t = t.replace(/,\s*([}\]])/g, '$1');
  try {
    return JSON.parse(t) as Record<string, unknown>;
  } catch (err) {
    throw new ModelJsonParseError(`AI 返回 JSON 无法解析：${(err as Error).message}`);
  }
}

function normalizePayload(parsed: Record<string, unknown>): AnalysisPayload {
  return {
    examine_point: String(parsed.examine_point ?? '').slice(0, 2000),
    inferred_flags: Array.isArray(parsed.inferred_flags)
      ? parsed.inferred_flags.map((f) => String(f).slice(0, 200))
      : [],
    keep_text: String(parsed.keep_text ?? '').slice(0, 8000),
    rewrite_text: String(parsed.rewrite_text ?? '').slice(0, 8000),
    need_numbers: String(parsed.need_numbers ?? '').slice(0, 500),
  };
}

export async function markRunning(userId: number, questionId: number): Promise<void> {
  await db('question_analyses')
    .insert({
      question_id: questionId,
      user_id: userId,
      examine_point: '',
      inferred_flags: '[]',
      keep_text: '',
      rewrite_text: '',
      need_numbers: '',
      model: config.deepseek.model,
      status: 'running',
      error_msg: '',
    })
    .onConflict('question_id')
    .merge({ status: 'running', error_msg: '', updated_at: new Date() });
}

export async function markFailed(userId: number, questionId: number, message: string): Promise<void> {
  await db('question_analyses')
    .insert({
      question_id: questionId,
      user_id: userId,
      examine_point: '',
      inferred_flags: '[]',
      keep_text: '',
      rewrite_text: '',
      need_numbers: '',
      model: config.deepseek.model,
      status: 'failed',
      error_msg: message.slice(0, 500),
    })
    .onConflict('question_id')
    .merge({ status: 'failed', error_msg: message.slice(0, 500), updated_at: new Date() });
}

/** 反编造校验 + 落库（status=done）。 */
export async function storeAnalysis(
  userId: number,
  questionId: number,
  payload: AnalysisPayload,
): Promise<QuestionAnalysisRow> {
  const question = await db<InterviewQuestionRow>('interview_questions')
    .where({ id: questionId, user_id: userId })
    .first();
  if (!question) throw notFound('题目不存在');

  const original = `题目：${question.question}\n我的回答：${question.my_answer}`;
  const { safe, violations } = validateRewrite(original, payload.rewrite_text);

  let rewrite = payload.rewrite_text;
  let needNumbers = payload.need_numbers;
  if (!safe) {
    rewrite = sanitizeRewrite(rewrite, violations);
    const extra = violations.map((v) => v.reason).join('；');
    needNumbers = needNumbers ? `${needNumbers}；${extra}` : extra;
  }

  const data = {
    question_id: questionId,
    user_id: userId,
    examine_point: payload.examine_point,
    inferred_flags: toJson(payload.inferred_flags, '[]')!,
    keep_text: payload.keep_text,
    rewrite_text: rewrite,
    need_numbers: needNumbers,
    model: config.deepseek.model,
    status: 'done' as const,
    error_msg: '',
    updated_at: new Date(),
  };

  const existing = await db<QuestionAnalysisRow>('question_analyses').where({ question_id: questionId }).first();
  if (existing) {
    await db('question_analyses').where({ question_id: questionId }).update(data);
  } else {
    await db('question_analyses').insert(data);
  }
  return (await db<QuestionAnalysisRow>('question_analyses').where({ question_id: questionId }).first())!;
}

/**
 * 单题分析通用流程：markRunning → runChat 取原始文本 → 解析+反编造+落库。
 * 首次 JSON 解析失败时，追加修正提示再重试一次（带 attempt 参数供上层区分流式/非流式）。
 * runChat(messages, attempt)：attempt=0 首次，attempt=1 修正重试。
 */
export async function analyzeQuestionWithChat(
  userId: number,
  questionId: number,
  runChat: (messages: ChatMessage[], attempt: number) => Promise<string>,
): Promise<QuestionAnalysisRow> {
  const question = await db<InterviewQuestionRow>('interview_questions')
    .where({ id: questionId, user_id: userId })
    .first();
  if (!question) throw notFound('题目不存在');

  await markRunning(userId, questionId);

  const baseMessages: ChatMessage[] = analyzeMessages(question.question, question.my_answer);
  const correctionMessage: ChatMessage = { role: 'user', content: JSON_CORRECTION_PROMPT };
  let lastError: unknown;
  for (let attempt = 0; attempt <= 1; attempt += 1) {
    const messages = attempt === 0 ? baseMessages : [...baseMessages, correctionMessage];
    try {
      const raw = await runChat(messages, attempt);
      return await finalizeAnalysisFromText(userId, questionId, raw);
    } catch (err) {
      lastError = err;
      // 仅「JSON 解析失败」且是首次时，带修正提示重试一次
      if (err instanceof ModelJsonParseError && attempt === 0) {
        continue;
      }
      break;
    }
  }
  throw lastError;
}

/** 单题分析（非流式，批量/续跑用）。 */
export async function analyzeQuestion(userId: number, questionId: number): Promise<QuestionAnalysisRow> {
  try {
    return await analyzeQuestionWithChat(userId, questionId, async (messages) => {
      const { content } = await chat({ messages });
      return content;
    });
  } catch (err) {
    await markFailed(userId, questionId, (err as Error).message);
    throw err;
  }
}

/** 流式累积完成后：解析 JSON + 反编造 + 落库。 */
export async function finalizeAnalysisFromText(
  userId: number,
  questionId: number,
  rawText: string,
): Promise<QuestionAnalysisRow> {
  const parsed = normalizePayload(parseModelJson(rawText));
  return storeAnalysis(userId, questionId, parsed);
}

// ---------- 批量任务（内存进度，单进程） ----------

export interface BatchJob {
  id: string;
  status: 'running' | 'done';
  total: number;
  done: number;
  failed: number;
  current: number | null;
  questionIds: number[];
}

const jobs = new Map<string, BatchJob>();

export async function startBatchAnalysis(userId: number, interviewId: number): Promise<BatchJob> {
  const interview = await db('interviews').where({ id: interviewId, user_id: userId }).whereNull('deleted_at').first();
  if (!interview) throw notFound('面试记录不存在');

  const questions = await db<InterviewQuestionRow>('interview_questions')
    .where({ interview_id: interviewId, user_id: userId })
    .orderBy([{ column: 'sort_order', order: 'asc' }, { column: 'id', order: 'asc' }]);

  const analyses = await db<QuestionAnalysisRow>('question_analyses')
    .where({ user_id: userId })
    .whereIn('question_id', questions.map((q) => q.id));
  const doneIds = new Set(analyses.filter((a) => a.status === 'done').map((a) => a.question_id));

  // 重试只跑未完成（pending/running/failed/无记录）项
  const pending = questions.filter((q) => !doneIds.has(q.id));

  const job: BatchJob = {
    id: crypto.randomUUID(),
    status: 'running',
    total: pending.length,
    done: 0,
    failed: 0,
    current: null,
    questionIds: pending.map((q) => q.id),
  };
  jobs.set(job.id, job);

  void (async () => {
    for (const qid of job.questionIds) {
      job.current = qid;
      try {
        await analyzeQuestion(userId, qid);
        job.done += 1;
      } catch {
        job.failed += 1;
      }
    }
    job.status = 'done';
    job.current = null;
    // 10 分钟后清理内存进度
    setTimeout(() => jobs.delete(job.id), 10 * 60 * 1000).unref?.();
  })();

  return job;
}

export function getBatchJob(jobId: string): BatchJob | null {
  return jobs.get(jobId) ?? null;
}
