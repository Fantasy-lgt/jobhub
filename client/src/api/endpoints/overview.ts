import { http } from '../http'
import { USE_MOCK } from '../config'
import type { OverviewData } from '../../types'

const MOCK_OVERVIEW: OverviewData = {
  hero: {
    greeting: '下午好，社招选手 👋',
    stage_label: '冲刺期',
    slogan: '后端开发 · 目标 35K/月 · 上海 / 杭州',
    today_tip: '有 3 家停在面试环节，今天花 30 分钟把高频题再过一遍。',
  },
  metrics: {
    active: 12,
    interviewing: 3,
    offers: 1,
    hit_rate: { rate: 33, interviewed: 4, applied: 12 },
  },
  todos: [
    {
      id: 't1',
      type: 'follow_up',
      title: '跟进「星野科技」二面结果',
      note: '已 5 天没回音，今天发消息',
      target_id: '1',
    },
    {
      id: 't2',
      type: 'prepare_interview',
      title: '准备「云杉信息」三面',
      note: '明天 14:00 视频面',
      target_id: '2',
    },
    {
      id: 't3',
      type: 'review_due',
      title: '复盘「青禾数据」一面失分点',
      note: '缺 Action、全段无数字',
      target_id: '3',
    },
    {
      id: 't4',
      type: 'offer_deadline',
      title: '「星河网络」Offer 年包算清楚',
      note: '答复截止还有 3 天',
      target_id: '1',
    },
  ],
  week: {
    applications: { now: 4, last: 3 },
    interviews: { now: 2, last: 1 },
    reviews: { now: 1, last: 2 },
    checkins: { now: 4, last: 5 },
  },
  sprint: {
    done: 7,
    total: 18,
    streak: { current: 4, best: 9 },
  },
}

export const overviewApi = {
  /** GET /overview —— 聚合接口：今日提示 + 4 指标 + 今天要做 + 本周节奏 */
  async get(): Promise<OverviewData> {
    if (USE_MOCK) return MOCK_OVERVIEW
    return http.get<OverviewData>('/overview')
  },
}
