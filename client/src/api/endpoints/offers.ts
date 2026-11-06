import { http } from '../http'
import { USE_MOCK } from '../config'
import type { Offer, OfferDetail } from '../../types'

export const offersApi = {
  /** GET /offers 列表（含年包、排名） */
  async list(): Promise<Offer[]> {
    if (USE_MOCK) return []
    return http.get<Offer[]>('/offers')
  },

  /** POST /offers 新建 */
  async create(data: Partial<Offer>): Promise<Offer> {
    if (USE_MOCK) return data as Offer
    return http.post<Offer>('/offers', data)
  },

  /** GET /offers/:id 详情（含年包计算过程） */
  async detail(id: number): Promise<OfferDetail> {
    if (USE_MOCK) {
      return {
        offer: {} as Offer,
        calc: {
          total_cents: 0,
          base_cents: 0,
          bonus_cents: 0,
          sign_cents: 0,
          allowance_cents: 0,
          equity_cents: 0,
          equity_yuan_per_year: 0,
          weighted_score: 0,
        },
      }
    }
    return http.get<OfferDetail>(`/offers/${id}`)
  },

  /** PUT /offers/:id 更新（校验权重合计=100） */
  async update(id: number, data: Partial<Offer>): Promise<Offer> {
    if (USE_MOCK) return data as Offer
    return http.put<Offer>(`/offers/${id}`, data)
  },

  /** DELETE /offers/:id 软删除 */
  async remove(id: number): Promise<void> {
    if (USE_MOCK) return
    await http.del<void>(`/offers/${id}`)
  },

  /** GET /offers/compare 2–4 个 Offer 对比 */
  async compare(ids: number[]): Promise<Offer[]> {
    if (USE_MOCK) return []
    return http.get<Offer[]>('/offers/compare', { ids: ids.join(',') })
  },
}
