/**
 * 面试复盘 service：面试 CRUD + 逐题录入（跑机检并落库）+ 回忆拆题 + 自评/总结。
 */
import { db, toJson } from '../db';
import { notFound } from '../lib/http';
import { machineCheck } from '../lib/machine-check';
import type {
  InterviewQuestionRow,
  InterviewRow,
  QuestionAnalysisRow,
  SelfScores,
} from '../types';

export interface InterviewCreateInput {
  app_id?: number | null;
  company: string;
  role: string;
  round: string;
  scheduled_at?: string | null;
  format: string;
  interviewer: string;
  result: string;
}

export interface QuestionInput {
  question: string;
  my_answer: string;
  better_answer: string;
  tag: string;
  s_context?: string | null;
  t_task?: string | null;
  a_action?: string | null;
  r_result?: string | null;
}

async function assertInterview(userId: number, id: number): Promise<InterviewRow> {
  const interview = await db<InterviewRow>('interviews')
    .where({ id, user_id: userId })
    .whereNull('deleted_at')
    .first();
  if (!interview) throw notFound('面试记录不存在');
  return interview;
}

export async function listInterviews(userId: number, page = 1, pageSize = 20): Promise<{ items: InterviewRow[]; total: number; page: number; pageSize: number }> {
  const base = () => db<InterviewRow>('interviews').where({ user_id: userId }).whereNull('deleted_at');
  const totalRow = (await base().count('* as c').first()) as unknown as { c: number | string } | undefined;
  const total = Number(totalRow?.c ?? 0);
  const items = await base()
    .orderBy([{ column: 'scheduled_at', order: 'desc' }, { column: 'created_at', order: 'desc' }])
    .limit(pageSize)
    .offset((page - 1) * pageSize);
  return { items, total, page, pageSize };
}

export async function createInterview(userId: number, input: InterviewCreateInput): Promise<InterviewRow> {
  const [id] = await db('interviews').insert({
    user_id: userId,
    app_id: input.app_id ?? null,
    company: input.company,
    role: input.role,
    round: input.round,
    scheduled_at: input.scheduled_at ?? null,
    format: input.format,
    interviewer: input.interviewer,
    result: input.result,
    self_scores: null,
    done_right: '',
    pitfall: '',
    next_step: '',
    one_line: '',
  });
  return (await db<InterviewRow>('interviews').where({ id }).first())!;
}

export async function getInterview(
  userId: number,
  id: number,
): Promise<{ interview: InterviewRow; questions: InterviewQuestionRow[]; analyses: Record<number, QuestionAnalysisRow | null> }> {
  const interview = await assertInterview(userId, id);

  const questions = await db<InterviewQuestionRow>('interview_questions')
    .where({ interview_id: id, user_id: userId })
    .orderBy([{ column: 'sort_order', order: 'asc' }, { column: 'id', order: 'asc' }]);

  const analyses = await db<QuestionAnalysisRow>('question_analyses')
    .where({ user_id: userId })
    .whereIn('question_id', questions.map((q) => q.id));

  const analysesByQuestion: Record<number, QuestionAnalysisRow | null> = {};
  for (const q of questions) analysesByQuestion[q.id] = null;
  for (const a of analyses) analysesByQuestion[a.question_id] = a;

  return { interview, questions, analyses: analysesByQuestion };
}

export async function updateInterview(userId: number, id: number, patch: Partial<InterviewCreateInput>): Promise<InterviewRow> {
  await assertInterview(userId, id);
  const data: Record<string, unknown> = {};
  const map: Record<string, keyof InterviewCreateInput> = {
    company: 'company',
    role: 'role',
    round: 'round',
    format: 'format',
    interviewer: 'interviewer',
    result: 'result',
  };
  for (const [dbCol, key] of Object.entries(map)) {
    if (patch[key] !== undefined) data[dbCol] = patch[key];
  }
  if (patch.app_id !== undefined) data.app_id = patch.app_id ?? null;
  if (patch.scheduled_at !== undefined) data.scheduled_at = patch.scheduled_at ?? null;

  if (Object.keys(data).length > 0) {
    await db('interviews').where({ id }).update(data);
  }
  return (await db<InterviewRow>('interviews').where({ id }).first())!;
}

export async function deleteInterview(userId: number, id: number): Promise<void> {
  await assertInterview(userId, id);
  await db('interviews').where({ id }).update({ deleted_at: new Date() });
}

export async function addQuestion(
  userId: number,
  interviewId: number,
  input: QuestionInput,
): Promise<InterviewQuestionRow> {
  await assertInterview(userId, interviewId);

  const check = machineCheck({
    s_context: input.s_context,
    t_task: input.t_task,
    a_action: input.a_action,
    r_result: input.r_result,
    my_answer: input.my_answer,
  });

  const maxOrder = (await db('interview_questions')
    .where({ interview_id: interviewId })
    .max('sort_order as m')
    .first()) as unknown as { m: number | null } | undefined;

  const [id] = await db('interview_questions').insert({
    interview_id: interviewId,
    user_id: userId,
    question: input.question,
    my_answer: input.my_answer,
    better_answer: input.better_answer,
    tag: input.tag,
    s_context: input.s_context ?? null,
    t_task: input.t_task ?? null,
    a_action: input.a_action ?? null,
    r_result: input.r_result ?? null,
    has_number: check.hasNumber,
    weakness_codes: toJson(check.weaknessCodes, '[]')!,
    is_overlong: check.isOverlong,
    sort_order: Number(maxOrder?.m ?? 0) + 1,
  });

  return (await db<InterviewQuestionRow>('interview_questions').where({ id }).first())!;
}

export interface RecallDraft {
  question: string;
  my_answer: string;
}

/**
 * 回忆拆题（纯规则，不落库）：
 * - 按空行拆段落；含「？」的段落切出问句（问号结尾），其后紧跟的叙述并入该题 my_answer；
 * - 无问号的段落：若为开场白（关键词开头 / 过短）则丢弃，否则并入上一题答案；
 * - 首个问句之前的叙述（开场白）不当题目。
 * 返回待确认的题目草稿。
 */
export function recallQuestions(text: string): RecallDraft[] {
  const cleaned = (text || '').trim();
  if (!cleaned) return [];

  const blocks = cleaned
    .split(/\n\s*\n+/)
    .map((b) => b.trim())
    .filter(Boolean);

  const isOpeningRemark = (block: string): boolean => {
    // 只对「无问号」段落判断开场白
    if (/[？?]/.test(block)) return false;
    const t = block.replace(/\s/g, '');
    if (/^(面试官|先让我|简单说了下|自我介绍|聊了聊|接着|然后|首先|一开始)/.test(t)) return true;
    return Array.from(t).length < 30;
  };

  const drafts: RecallDraft[] = [];
  const appendAnswer = (answer: string): void => {
    if (!answer) return;
    if (drafts.length === 0) return;
    const last = drafts[drafts.length - 1];
    last.my_answer = last.my_answer ? `${last.my_answer}\n${answer}` : answer;
  };

  for (const block of blocks) {
    if (!/[？?]/.test(block)) {
      // 无问号段落：开场白丢弃；否则并入上一题答案
      if (drafts.length === 0 || isOpeningRemark(block)) continue;
      appendAnswer(block);
      continue;
    }

    // 含问号段落：按问号切分，「问句 + 紧跟答案」
    const parts = block.split(/(?<=[？?])/);
    for (const raw of parts) {
      const part = raw.trim();
      if (!part) continue;
      const qmIdx = part.search(/[？?]/);
      if (qmIdx >= 0) {
        const question = part.slice(0, qmIdx + 1).trim();
        const answer = part.slice(qmIdx + 1).trim();
        drafts.push({ question, my_answer: answer });
      } else {
        // 无问号尾巴 → 并入上一题答案
        appendAnswer(part);
      }
    }
  }

  return drafts;
}

export async function setSelfAssess(userId: number, interviewId: number, scores: SelfScores): Promise<InterviewRow> {
  await assertInterview(userId, interviewId);
  await db('interviews').where({ id: interviewId }).update({ self_scores: toJson(scores, null) });
  return (await db<InterviewRow>('interviews').where({ id: interviewId }).first())!;
}

export async function setSummary(
  userId: number,
  interviewId: number,
  summary: { done_right: string; pitfall: string; next_step: string; one_line: string },
): Promise<InterviewRow> {
  await assertInterview(userId, interviewId);
  await db('interviews').where({ id: interviewId }).update({
    done_right: summary.done_right,
    pitfall: summary.pitfall,
    next_step: summary.next_step,
    one_line: summary.one_line,
  });
  return (await db<InterviewRow>('interviews').where({ id: interviewId }).first())!;
}
