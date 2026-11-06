/**
 * API 响应 / 分页 / 各聚合接口 DTO（与 §5 API 契约对齐）。
 */

import type {
  App,
  AppEvent,
  Interview,
  InterviewQuestion,
  Offer,
  Profile,
  Resume,
  RoadmapStage,
  RoadmapTask,
  Streak,
  User,
  WeeklyReview,
  QuestionAnalysis,
} from './entities'
import type { AppStatus, WeaknessCode } from './enums'

// 统一响应包裹：{code, data, message}，code=0 成功
export interface ApiResponse<T> {
  code: number
  data: T
  message: string
}

// 列表分页（20 条/页；与后端 Paginated<T> 对齐，items 为列表字段）
export interface PageResult<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
}

// ---------- 鉴权 ----------
export interface LoginPayload {
  username: string
  password: string
}
/**
 * 登录响应：token 只经 httpOnly cookie 下发，body 仅返回 user。
 * 与后端 /auth/login 契约对齐（不再声明过期的 token 字段）。
 */
export interface LoginResult {
  user: User
}

// ---------- 概览 ----------
/** 今日待办类型：前端据此映射跳转路由与配色，后端只给语义。 */
export type TodoType =
  | 'follow_up' // 跟进某岗位
  | 'prepare_interview' // 准备面试
  | 'offer_deadline' // Offer 截止
  | 'review_due' // 该做复盘
  | 'checkin' // 今日打卡
  | 'resume' // 简历相关
  | 'target' // 目标推进

export interface OverviewTodo {
  id: string
  type: TodoType
  title: string
  note?: string
  target_id?: string // 关联实体 id（岗位/面试/Offer 等），可空
}
export interface OverviewMetrics {
  active: number // 在投岗位数
  interviewing: number // 面试中
  offers: number // Offer 数
  hit_rate: { rate: number; interviewed: number; applied: number } // 面试命中率
}
export interface WeekCell {
  now: number
  last: number
}
export interface OverviewData {
  hero: {
    greeting: string
    stage_label: string
    slogan: string
    today_tip: string
  }
  metrics: OverviewMetrics
  todos: OverviewTodo[]
  week: {
    applications: WeekCell
    interviews: WeekCell
    reviews: WeekCell
    checkins: WeekCell
  }
  sprint: {
    done: number
    total: number
    streak: Streak
  }
}

// ---------- 岗位池 ----------
export interface AppListQuery {
  /** 单状态（如 first）或阶段组 key（如 interview），后端兼容两种 */
  status?: string
  channel?: string
  interest?: number | ''
  overdue?: boolean
  q?: string
  page?: number
  pageSize?: number
}
export interface AppDetail {
  app: App
  events: AppEvent[]
}
export interface BoardStat {
  group: string
  count: number
}

// ---------- 面试 ----------
export interface InterviewDetail {
  interview: Interview
  questions: InterviewQuestion[]
  /** 逐题分析，未分析的题为 null */
  analyses: Record<number, QuestionAnalysis | null>
}
/** 贴回忆规则拆题草稿（不落库） */
export interface RecallDraft {
  question: string
  my_answer: string
}

// ---------- 题库 ----------
export interface QbankGroup {
  id: string
  question: string
  occurrences: number
  last_seen: string | null
  weakness_codes: WeaknessCode[]
  missed: number
}
export interface QbankHistoryItem {
  question_id: number
  interview_id: number
  question: string
  my_answer: string
  at: string | null
  result: string
  /** 后端附带：面试公司/轮次（用于「哪场面试」下钻） */
  company?: string
  round?: string
}
export interface QbankGroupDetail {
  group: QbankGroup
  history: QbankHistoryItem[]
  recent_trend: { label: string; value: number }[]
}
export interface WeaknessSummary {
  code: WeaknessCode
  name: string
  desc: string
  hits: number
  examples: string[]
  /** pattern=同一弱点命中 ≥2 个不同场次；watching=只命中 1 场 */
  level: 'pattern' | 'watching'
  /** 该弱点命中的不同面试场次数 */
  distinct_sessions: number
  /** 用户「有 ≥1 题的面试场次」总数 */
  total_sessions: number
}

// ---------- Offer ----------
/** 年包计算过程（与后端 OfferComputation 对齐，单位：分）。 */
export interface OfferComputation {
  total_cents: number
  base_cents: number
  bonus_cents: number
  sign_cents: number
  allowance_cents: number
  equity_cents: number
  /** 期权年均值（元/年），仅展示不计入年包 */
  equity_yuan_per_year: number
  weighted_score: number
}
export interface OfferDetail {
  offer: Offer
  calc: OfferComputation
}

// ---------- 数据复盘 ----------
/** 漏斗：4 个计数 + 3 段转化率（百分比，分母为 0 时给 null，前端显示「—」不显示 0%）。 */
export interface FunnelData {
  applied: number
  written: number
  interview: number
  offer: number
  applied_to_written_rate: number | null
  written_to_interview_rate: number | null
  interview_to_offer_rate: number | null
}
export interface TrendPoint {
  label: string
  apply: number
  interview: number
  /** 累计 Offer（到该周为止的累计值，不是当周新增） */
  offer: number
}
export interface ChannelStat {
  channel: string
  applied: number
  interviews: number
  offers: number
  /** 面试率（百分比数值，如 50 表示 50%） */
  rate: number
}
export interface Indicator {
  key: string
  label: string
  value: number
  unit: string
  note: string
}

// ---------- 路线图 ----------
export interface RoadmapData {
  stages: (RoadmapStage & { tasks: RoadmapTask[] })[]
  milestones: { label: string; achieved: boolean }[]
  streak: Streak
}

// ---------- AI（SSE 命名事件见 api/sse.ts，事件名：start/delta/done/error） ----------

// 汇总（便于统一 import）
export type {
  App,
  AppEvent,
  Interview,
  InterviewQuestion,
  Offer,
  Profile,
  Resume,
  RoadmapStage,
  RoadmapTask,
  Streak,
  User,
  WeeklyReview,
}
