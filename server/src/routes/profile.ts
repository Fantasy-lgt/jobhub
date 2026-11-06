import type { FastifyInstance } from 'fastify';
import { ok } from '../lib/http';
import {
  idParamSchema,
  profileSchema,
  resumeCreateSchema,
  resumeUpdateSchema,
} from '../lib/validation';
import {
  createResume,
  deleteResume,
  getProfile,
  listResumes,
  setPrimaryResume,
  updateResume,
  upsertProfile,
} from '../services/profile.service';

export async function profileRoutes(app: FastifyInstance): Promise<void> {
  // ---- 求职定位 ----
  app.get('/profile', async (request) => {
    const profile = await getProfile(request.userId);
    return ok(profile);
  });

  app.put('/profile', async (request) => {
    const body = profileSchema.parse(request.body);
    const profile = await upsertProfile(request.userId, body);
    return ok(profile, '已保存');
  });

  // ---- 简历版本 ----
  app.get('/resumes', async (request) => {
    const resumes = await listResumes(request.userId);
    return ok(resumes);
  });

  app.post('/resumes', async (request) => {
    const body = resumeCreateSchema.parse(request.body);
    const resume = await createResume(request.userId, body.name, body.target_role);
    return ok(resume, '已创建');
  });

  app.put('/resumes/:id', async (request) => {
    const { id } = idParamSchema.parse(request.params);
    const body = resumeUpdateSchema.parse(request.body);
    const resume = await updateResume(request.userId, id, body);
    return ok(resume, '已更新');
  });

  app.delete('/resumes/:id', async (request) => {
    const { id } = idParamSchema.parse(request.params);
    await deleteResume(request.userId, id);
    return ok(null, '已删除');
  });

  app.put('/resumes/:id/primary', async (request) => {
    const { id } = idParamSchema.parse(request.params);
    const resume = await setPrimaryResume(request.userId, id);
    return ok(resume, '已设为主用');
  });
}
