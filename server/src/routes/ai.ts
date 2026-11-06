/**
 * AI 接口（SSE 流式）：逐题分析 / 三段式总结 / 四维自评 / 批量续跑。
 */
import type { FastifyInstance, FastifyReply } from 'fastify';
import { db } from '../db';
import { notFound } from '../lib/http';
import { qidParamSchema, interviewIdParamSchema, jobIdParamSchema } from '../lib/validation';
import { chatStream, chat } from '../ai/deepseek';
import {
  selfAssessMessages,
  summarizeMessages,
  type ChatMessage,
  type QuestionContext,
} from '../ai/prompts';
import {
  analyzeQuestionWithChat,
  getBatchJob,
  markFailed,
  startBatchAnalysis,
} from '../ai/job-runner';
import type { InterviewQuestionRow, QuestionAnalysisRow } from '../types';

function sseStart(reply: FastifyReply): void {
  reply.hijack();
  reply.raw.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  reply.raw.flushHeaders();
}

function sseSend(reply: FastifyReply, event: string, data: unknown): void {
  reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

async function loadInterviewQuestions(userId: number, interviewId: number): Promise<{ interview: { company: string; role: string }; questions: QuestionContext[] }> {
  const interview = await db('interviews')
    .where({ id: interviewId, user_id: userId })
    .whereNull('deleted_at')
    .first();
  if (!interview) throw notFound('面试记录不存在');

  const questions = await db<InterviewQuestionRow>('interview_questions')
    .where({ interview_id: interviewId, user_id: userId })
    .orderBy([{ column: 'sort_order', order: 'asc' }, { column: 'id', order: 'asc' }]);

  return {
    interview: { company: interview.company, role: interview.role },
    questions: questions.map((q) => ({ question: q.question, my_answer: q.my_answer, better_answer: q.better_answer })),
  };
}

export async function aiRoutes(app: FastifyInstance): Promise<void> {
  /** 单题 AI 分析（SSE 流式，JSON 解析失败自动带修正提示重试一次） */
  app.post('/ai/analyze-question/:qid', async (request, reply) => {
    const { qid } = qidParamSchema.parse(request.params);
    const userId = request.userId;

    const question = await db<InterviewQuestionRow>('interview_questions')
      .where({ id: qid, user_id: userId })
      .first();
    if (!question) throw notFound('题目不存在');

    sseStart(reply);
    sseSend(reply, 'start', { question_id: qid });

    const controller = new AbortController();
    request.raw.on('close', () => controller.abort());

    try {
      const analysis: QuestionAnalysisRow = await analyzeQuestionWithChat(userId, qid, async (messages, attempt) => {
        if (attempt === 0) {
          // 首次：流式逐 delta 转发给客户端
          let full = '';
          await chatStream({ messages, signal: controller.signal }, (delta) => {
            full += delta;
            sseSend(reply, 'delta', { text: delta });
          });
          return full;
        }
        // JSON 解析失败重试：非流式静默重生成，避免客户端 delta 缓冲串台；最终 analysis 由 done 事件携带
        sseSend(reply, 'delta', { text: '\n（返回格式有误，正在重新生成…）' });
        const { content } = await chat({ messages, signal: controller.signal });
        return content;
      });
      sseSend(reply, 'done', { analysis });
    } catch (err) {
      await markFailed(userId, qid, (err as Error).message);
      sseSend(reply, 'error', { message: (err as Error).message });
    } finally {
      reply.raw.end();
    }
  });

  /** 三段式总结（SSE 流式） */
  app.post('/ai/summarize/:interviewId', async (request, reply) => {
    const { interviewId } = interviewIdParamSchema.parse(request.params);
    const userId = request.userId;
    const { interview, questions } = await loadInterviewQuestions(userId, interviewId);

    sseStart(reply);
    sseSend(reply, 'start', { interview_id: interviewId });
    const controller = new AbortController();
    request.raw.on('close', () => controller.abort());

    try {
      const messages: ChatMessage[] = summarizeMessages(interview.company, interview.role, questions);
      let full = '';
      await chatStream({ messages, signal: controller.signal }, (delta) => {
        full += delta;
        sseSend(reply, 'delta', { text: delta });
      });
      const parsed = JSON.parse(full.slice(full.indexOf('{'), full.lastIndexOf('}') + 1)) as {
        done_right?: string; pitfall?: string; next_step?: string; one_line?: string;
      };
      await db('interviews').where({ id: interviewId }).update({
        done_right: String(parsed.done_right ?? '').slice(0, 20000),
        pitfall: String(parsed.pitfall ?? '').slice(0, 20000),
        next_step: String(parsed.next_step ?? '').slice(0, 20000),
        one_line: String(parsed.one_line ?? '').slice(0, 80),
      });
      sseSend(reply, 'done', { summary: parsed });
    } catch (err) {
      sseSend(reply, 'error', { message: (err as Error).message });
    } finally {
      reply.raw.end();
    }
  });

  /** 四维自评（SSE 流式） */
  app.post('/ai/self-assess/:interviewId', async (request, reply) => {
    const { interviewId } = interviewIdParamSchema.parse(request.params);
    const userId = request.userId;
    const { interview, questions } = await loadInterviewQuestions(userId, interviewId);

    sseStart(reply);
    sseSend(reply, 'start', { interview_id: interviewId });
    const controller = new AbortController();
    request.raw.on('close', () => controller.abort());

    try {
      const messages: ChatMessage[] = selfAssessMessages(interview.company, interview.role, questions);
      let full = '';
      await chatStream({ messages, signal: controller.signal }, (delta) => {
        full += delta;
        sseSend(reply, 'delta', { text: delta });
      });
      const parsed = JSON.parse(full.slice(full.indexOf('{'), full.lastIndexOf('}') + 1)) as {
        content?: number; expression?: number; mindset?: number; interaction?: number;
      };
      const clamp = (n: unknown) => Math.min(5, Math.max(1, Math.round(Number(n) || 1)));
      const scores = {
        content: clamp(parsed.content),
        expression: clamp(parsed.expression),
        mindset: clamp(parsed.mindset),
        interaction: clamp(parsed.interaction),
      };
      await db('interviews').where({ id: interviewId }).update({ self_scores: JSON.stringify(scores) });
      sseSend(reply, 'done', { scores });
    } catch (err) {
      sseSend(reply, 'error', { message: (err as Error).message });
    } finally {
      reply.raw.end();
    }
  });

  /** 批量分析（返回 jobId，逐题续跑） */
  app.post('/ai/batch-analyze/:interviewId', async (request, reply) => {
    const { interviewId } = interviewIdParamSchema.parse(request.params);
    const job = await startBatchAnalysis(request.userId, interviewId);
    return reply.send({ code: 0, data: { jobId: job.id, total: job.total }, message: '批量任务已启动' });
  });

  /** 批量任务进度 */
  app.get('/ai/jobs/:jobId', async (request, reply) => {
    const { jobId } = jobIdParamSchema.parse(request.params);
    const job = getBatchJob(jobId);
    if (!job) return reply.send({ code: 0, data: null, message: '任务不存在或已过期' });
    return reply.send({ code: 0, data: job, message: 'ok' });
  });
}
