import type { FastifyInstance } from 'fastify';
import { ok } from '../lib/http';
import {
  idParamSchema,
  interviewCreateSchema,
  interviewUpdateSchema,
  paginationQuerySchema,
  questionCreateSchema,
  recallSchema,
  selfAssessSchema,
  summarySchema,
} from '../lib/validation';
import {
  addQuestion,
  createInterview,
  deleteInterview,
  getInterview,
  listInterviews,
  recallQuestions,
  setSelfAssess,
  setSummary,
  updateInterview,
} from '../services/interviews.service';

export async function interviewsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/interviews', async (request) => {
    const query = paginationQuerySchema.parse(request.query);
    return ok(await listInterviews(request.userId, query.page, query.pageSize));
  });

  app.post('/interviews', async (request) => {
    const body = interviewCreateSchema.parse(request.body);
    const interview = await createInterview(request.userId, body);
    return ok(interview, '已创建');
  });

  app.get('/interviews/:id', async (request) => {
    const { id } = idParamSchema.parse(request.params);
    return ok(await getInterview(request.userId, id));
  });

  app.put('/interviews/:id', async (request) => {
    const { id } = idParamSchema.parse(request.params);
    const body = interviewUpdateSchema.parse(request.body);
    const interview = await updateInterview(request.userId, id, body);
    return ok(interview, '已更新');
  });

  app.delete('/interviews/:id', async (request) => {
    const { id } = idParamSchema.parse(request.params);
    await deleteInterview(request.userId, id);
    return ok(null, '已删除');
  });

  // 逐题录入（同时跑机检并落库）
  app.post('/interviews/:id/questions', async (request) => {
    const { id } = idParamSchema.parse(request.params);
    const body = questionCreateSchema.parse(request.body);
    const question = await addQuestion(request.userId, id, body);
    return ok(question, '已录入并完成机检');
  });

  // 贴回忆 → 纯规则拆题草稿（不落库）
  app.post('/interviews/:id/recall', async (request) => {
    const body = recallSchema.parse(request.body);
    const drafts = recallQuestions(body.text);
    return ok(drafts);
  });

  // 四维自评（手工）
  app.put('/interviews/:id/self-assess', async (request) => {
    const { id } = idParamSchema.parse(request.params);
    const raw = request.body as { scores?: unknown } & Record<string, unknown>;
    const scores = selfAssessSchema.parse(raw.scores ?? raw);
    const interview = await setSelfAssess(request.userId, id, scores);
    return ok(interview, '自评已保存');
  });

  // 三段式总结（手工）
  app.put('/interviews/:id/summary', async (request) => {
    const { id } = idParamSchema.parse(request.params);
    const body = summarySchema.parse(request.body);
    const interview = await setSummary(request.userId, id, body);
    return ok(interview, '总结已保存');
  });
}
