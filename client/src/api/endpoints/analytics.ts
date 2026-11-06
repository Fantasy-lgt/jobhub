import { http } from '../http'
import { USE_MOCK } from '../config'
import type {
  ChannelStat,
  FunnelData,
  Indicator,
  TrendPoint,
  WeeklyReview,
} from '../../types'

export const analyticsApi = {
  /** GET /analytics/funnel */
  async funnel(): Promise<FunnelData> {
    if (USE_MOCK) return { applied: 0, written: 0, interview: 0, offer: 0, applied_to_written_rate: null, written_to_interview_rate: null, interview_to_offer_rate: null }
    return http.get<FunnelData>('/analytics/funnel')
  },

  /** GET /analytics/trend 周趋势三线 */
  async trend(): Promise<TrendPoint[]> {
    if (USE_MOCK) return []
    return http.get<TrendPoint[]>('/analytics/trend')
  },

  /** PUT /analytics/trend/:weekStart 点选改数；传 null = 清除该周的手动覆盖，恢复自动统计。 */
  async overrideTrend(
    weekStart: string,
    data: { apply?: number | null; interview?: number | null; offer?: number | null },
  ): Promise<void> {
    if (USE_MOCK) return
    await http.put<void>(`/analytics/trend/${weekStart}`, data)
  },

  /** GET /analytics/channels 渠道效果 */
  async channels(): Promise<ChannelStat[]> {
    if (USE_MOCK) return []
    return http.get<ChannelStat[]>('/analytics/channels')
  },

  /** GET /analytics/bottleneck 卡点诊断 */
  async bottleneck(): Promise<{ title: string; detail: string }> {
    if (USE_MOCK) return { title: '', detail: '' }
    return http.get<{ title: string; detail: string }>('/analytics/bottleneck')
  },

  /** GET /analytics/indicators 7 指标卡 */
  async indicators(range: string = 'week'): Promise<Indicator[]> {
    if (USE_MOCK) return []
    return http.get<Indicator[]>('/analytics/indicators', { range })
  },

  /** GET /analytics/indicators/:key/drilldown（range 与指标卡保持一致） */
  async indicatorDrilldown(key: string, range: string = 'week'): Promise<unknown[]> {
    if (USE_MOCK) return []
    return http.get<unknown[]>(`/analytics/indicators/${key}/drilldown`, { range })
  },

  /** GET /analytics/weekly-reviews */
  async weeklyReviews(): Promise<WeeklyReview[]> {
    if (USE_MOCK) return []
    return http.get<WeeklyReview[]>('/analytics/weekly-reviews')
  },

  /** POST /analytics/weekly-reviews（新建需带 week_start） */
  async createWeeklyReview(data: Partial<WeeklyReview>): Promise<WeeklyReview> {
    if (USE_MOCK) return data as WeeklyReview
    return http.post<WeeklyReview>('/analytics/weekly-reviews', data)
  },

  /** PUT /analytics/weekly-reviews/:weekStart */
  async updateWeeklyReview(weekStart: string, data: Partial<WeeklyReview>): Promise<WeeklyReview> {
    if (USE_MOCK) return data as WeeklyReview
    return http.put<WeeklyReview>(`/analytics/weekly-reviews/${weekStart}`, data)
  },
}
