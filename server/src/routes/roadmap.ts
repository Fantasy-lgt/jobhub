import type { FastifyInstance } from 'fastify';
import { ok, badRequest } from '../lib/http';
import { stageParamSchema, taskCreateSchema, taskParamSchema, taskUpdateSchema } from '../lib/validation';
import { addTask, deleteTask, getRoadmap, getStreak, updateTask } from '../services/roadmap.service';

export async function roadmapRoutes(app: FastifyInstance): Promise<void> {
  app.get('/roadmap', async (request) => {
    return ok(await getRoadmap(request.userId));
  });

  app.get('/roadmap/streak', async (request) => {
    return ok(await getStreak(request.userId));
  });

  app.post('/roadmap/stages/:id/tasks', async (request) => {
    const { id } = stageParamSchema.parse(request.params);
    const body = taskCreateSchema.parse(request.body);
    const task = await addTask(request.userId, id, body.title);
    return ok(task, '已添加');
  });

  app.put('/roadmap/tasks/:id', async (request) => {
    const { id } = taskParamSchema.parse(request.params);
    const body = taskUpdateSchema.parse(request.body);
    const task = await updateTask(request.userId, id, body);
    return ok(task, '已更新');
  });

  app.delete('/roadmap/tasks/:id', async (request) => {
    const { id } = taskParamSchema.parse(request.params);
    await deleteTask(request.userId, id);
    return ok(null, '已删除');
  });
}
