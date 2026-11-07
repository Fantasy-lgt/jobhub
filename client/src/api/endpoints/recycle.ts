/**
 * 回收站：/api/v1/recycle
 *
 * GET    /recycle                  → 四类软删记录列表（apps/resumes/interviews/offers）
 * POST   /recycle/:type/:id/restore → 恢复（清除 deleted_at，回到原列表）
 * DELETE /recycle/:type/:id        → 彻底删除（物理 DELETE，不可恢复）
 *
 * 响应与通用 http 封装一致（{code,data,message}，cookie 鉴权），直接复用 http。
 */

import { http } from '../http'
import { USE_MOCK } from '../config'

/** 支持回收站的四类业务表（与 server/src/services/recycle.service.ts 对齐）。 */
export type RecycleType = 'apps' | 'resumes' | 'interviews' | 'offers'

export interface RecycleItem {
  id: number
  title: string
  deletedAt: string | null
}

export interface RecycleList {
  apps: RecycleItem[]
  resumes: RecycleItem[]
  interviews: RecycleItem[]
  offers: RecycleItem[]
}

export const RECYCLE_TYPES: RecycleType[] = ['apps', 'resumes', 'interviews', 'offers']

export const RECYCLE_TYPE_LABEL: Record<RecycleType, string> = {
  apps: '岗位',
  resumes: '简历',
  interviews: '面试',
  offers: 'Offer',
}

export const recycleApi = {
  /** GET /recycle 四类软删记录（按删除时间倒序）。 */
  async list(): Promise<RecycleList> {
    if (USE_MOCK) return { apps: [], resumes: [], interviews: [], offers: [] }
    return http.get<RecycleList>('/recycle')
  },

  /** POST /recycle/:type/:id/restore 恢复（清除 deleted_at）。 */
  async restore(type: RecycleType, id: number): Promise<void> {
    if (USE_MOCK) return
    await http.post<void>(`/recycle/${type}/${id}/restore`)
  },

  /** DELETE /recycle/:type/:id 彻底删除（物理删除）。 */
  async purge(type: RecycleType, id: number): Promise<void> {
    if (USE_MOCK) return
    await http.del<void>(`/recycle/${type}/${id}`)
  },
}
