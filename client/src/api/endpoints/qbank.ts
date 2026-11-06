import { http } from '../http'
import { USE_MOCK } from '../config'
import type {
  QbankGroup,
  QbankGroupDetail,
  QuestionLink,
  WeaknessSummary,
} from '../../types'

export const qbankApi = {
  /** GET /qbank/groups bigram 聚合后的题目组 */
  async groups(): Promise<QbankGroup[]> {
    if (USE_MOCK) return []
    return http.get<QbankGroup[]>('/qbank/groups')
  },

  /** GET /qbank/groups/:id 单组历史 */
  async groupDetail(id: string): Promise<QbankGroupDetail> {
    if (USE_MOCK) return { group: {} as QbankGroup, history: [], recent_trend: [] }
    return http.get<QbankGroupDetail>(`/qbank/groups/${id}`)
  },

  /** POST /qbank/links 手动合并/拆分 */
  async createLink(data: {
    aId: number
    bId: number
    type: 'merge' | 'split'
  }): Promise<QuestionLink> {
    if (USE_MOCK) return { ...data, id: 1, user_id: 1, created_at: new Date().toISOString() } as unknown as QuestionLink
    return http.post<QuestionLink>('/qbank/links', data)
  },

  /** DELETE /qbank/links/:id 取消合并 */
  async removeLink(id: number): Promise<void> {
    if (USE_MOCK) return
    await http.del<void>(`/qbank/links/${id}`)
  },

  /** GET /qbank/weaknesses W1–W8 汇总 */
  async weaknesses(): Promise<WeaknessSummary[]> {
    if (USE_MOCK) return []
    return http.get<WeaknessSummary[]>('/qbank/weaknesses')
  },
}
