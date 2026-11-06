import { http } from '../http'
import { USE_MOCK } from '../config'
import type {
  App,
  AppDetail,
  AppEvent,
  AppListQuery,
  BoardStat,
  PageResult,
} from '../../types'

export const appsApi = {
  /** GET /apps 列表 */
  async list(query: AppListQuery = {}): Promise<PageResult<App>> {
    if (USE_MOCK) return { items: [], total: 0, page: query.page ?? 1, pageSize: 20 }
    return http.get<PageResult<App>>('/apps', query as Record<string, unknown>)
  },

  /** POST /apps 新建 */
  async create(data: Partial<App>): Promise<App> {
    if (USE_MOCK) return data as App
    return http.post<App>('/apps', data)
  },

  /** GET /apps/:id 详情（含流转时间轴） */
  async detail(id: number): Promise<AppDetail> {
    if (USE_MOCK) return { app: {} as App, events: [] }
    return http.get<AppDetail>(`/apps/${id}`)
  },

  /** PUT /apps/:id 更新字段 */
  async update(id: number, data: Partial<App>): Promise<App> {
    if (USE_MOCK) return data as App
    return http.put<App>(`/apps/${id}`, data)
  },

  /** PATCH /apps/:id/status 改状态（后端事务写 app_events，返回 { app, event }） */
  async changeStatus(
    id: number,
    toStatus: string,
    source: string = 'manual',
  ): Promise<{ app: App; event: AppEvent }> {
    if (USE_MOCK) return { app: { id, status: toStatus } as App, event: {} as AppEvent }
    return http.patch<{ app: App; event: AppEvent }>(`/apps/${id}/status`, { toStatus, source })
  },

  /** DELETE /apps/:id 软删除 */
  async remove(id: number): Promise<void> {
    if (USE_MOCK) return
    await http.del<void>(`/apps/${id}`)
  },

  /** GET /apps/stats/board 6 阶段组统计 */
  async boardStats(): Promise<BoardStat[]> {
    if (USE_MOCK) return []
    return http.get<BoardStat[]>('/apps/stats/board')
  },
}
