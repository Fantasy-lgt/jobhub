import { http } from '../http'
import { USE_MOCK } from '../config'
import type {
  Interview,
  InterviewDetail,
  InterviewQuestion,
  PageResult,
  RecallDraft,
  SelfScores,
} from '../../types'

export const interviewsApi = {
  /** GET /interviews 列表（分页 20） */
  async list(page = 1, pageSize = 20): Promise<PageResult<Interview>> {
    if (USE_MOCK) return { items: [], total: 0, page, pageSize }
    return http.get<PageResult<Interview>>('/interviews', { page, pageSize })
  },

  /** POST /interviews 新建 */
  async create(data: Partial<Interview>): Promise<Interview> {
    if (USE_MOCK) return data as Interview
    return http.post<Interview>('/interviews', data)
  },

  /** GET /interviews/:id 详情 */
  async detail(id: number): Promise<InterviewDetail> {
    if (USE_MOCK) return { interview: {} as Interview, questions: [], analyses: {} }
    return http.get<InterviewDetail>(`/interviews/${id}`)
  },

  /** PUT /interviews/:id 更新 */
  async update(id: number, data: Partial<Interview>): Promise<Interview> {
    if (USE_MOCK) return data as Interview
    return http.put<Interview>(`/interviews/${id}`, data)
  },

  /** DELETE /interviews/:id 软删除 */
  async remove(id: number): Promise<void> {
    if (USE_MOCK) return
    await http.del<void>(`/interviews/${id}`)
  },

  /** POST /interviews/:id/questions 逐题录入（机检落库） */
  async addQuestion(id: number, data: Partial<InterviewQuestion>): Promise<InterviewQuestion> {
    if (USE_MOCK) return data as InterviewQuestion
    return http.post<InterviewQuestion>(`/interviews/${id}/questions`, data)
  },

  /** POST /interviews/:id/recall 贴回忆 → 规则拆题草稿（不落库） */
  async recall(id: number, text: string): Promise<RecallDraft[]> {
    if (USE_MOCK) return []
    return http.post<RecallDraft[]>(`/interviews/${id}/recall`, { text })
  },

  /** PUT /interviews/:id/self-assess 四维自评 */
  async selfAssess(id: number, scores: SelfScores): Promise<void> {
    if (USE_MOCK) return
    await http.put<void>(`/interviews/${id}/self-assess`, { scores })
  },

  /** PUT /interviews/:id/summary 三段式总结 */
  async summary(
    id: number,
    data: { done_right: string; pitfall: string; next_step: string },
  ): Promise<void> {
    if (USE_MOCK) return
    await http.put<void>(`/interviews/${id}/summary`, data)
  },
}
