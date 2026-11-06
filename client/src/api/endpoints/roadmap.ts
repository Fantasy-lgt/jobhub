import { http } from '../http'
import { USE_MOCK } from '../config'
import type { RoadmapData, RoadmapTask, Streak } from '../../types'

export const roadmapApi = {
  /** GET /roadmap 5 阶段 + 任务 + 里程碑 + streak */
  async get(): Promise<RoadmapData> {
    if (USE_MOCK) return { stages: [], milestones: [], streak: { current: 0, best: 0 } }
    return http.get<RoadmapData>('/roadmap')
  },

  /** POST /roadmap/stages/:id/tasks */
  async addTask(stageId: number, title: string): Promise<RoadmapTask> {
    if (USE_MOCK) return { id: 1, user_id: 1, stage_id: stageId, title, done: false, done_at: null, sort_order: 0, created_at: new Date().toISOString() }
    return http.post<RoadmapTask>(`/roadmap/stages/${stageId}/tasks`, { title })
  },

  /** PUT /roadmap/tasks/:id 勾选/改任务 */
  async updateTask(id: number, data: Partial<RoadmapTask>): Promise<RoadmapTask> {
    if (USE_MOCK) return data as RoadmapTask
    return http.put<RoadmapTask>(`/roadmap/tasks/${id}`, data)
  },

  /** DELETE /roadmap/tasks/:id */
  async removeTask(id: number): Promise<void> {
    if (USE_MOCK) return
    await http.del<void>(`/roadmap/tasks/${id}`)
  },

  /** GET /roadmap/streak */
  async streak(): Promise<Streak> {
    if (USE_MOCK) return { current: 0, best: 0 }
    return http.get<Streak>('/roadmap/streak')
  },
}
