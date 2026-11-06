/**
 * 领域实体类型 —— 与后端 14 张表对齐。
 *
 * 约定：wire format 使用 snake_case，字段名与 DB 列名一一对应（无映射层），
 * 金额一律 int（分）、日期 YYYY-MM-DD、JSON 列展开为强类型。
 * tinyint(1) 后端统一序列化为 boolean。
 */

import type {
  AppStatus,
  AnalysisStatus,
  InterviewFormat,
  InterviewResult,
  InterviewRound,
  LinkType,
  OfferScoreKey,
  QuestionTag,
  SelfScores,
  WeaknessCode,
} from './enums'

// 1. 账号（PublicUser：不暴露 password_hash）
export interface User {
  id: number
  username: string
}

// 2. 求职定位（1:1）
export interface Strength {
  tag: string
  evidence: string
}
export interface Gap {
  gap: string
  action: string
}
export interface Profile {
  user_id: number
  self_intro: string
  primary_role: string
  backup_roles: string[]
  industries: string[]
  company_types: string[]
  cities: string[]
  current_salary_base: number // 现薪 分/月
  current_salary_months: number
  expect_floor: number // 期望底线 分/月
  expect_target: number // 期望目标 分/月
  strengths: Strength[]
  gaps: Gap[]
  updated_at: string
}

// 3. 简历版本
export interface Resume {
  id: number
  user_id: number
  name: string
  target_role: string
  is_primary: boolean
  created_at: string
  /** 命中率 0–1（投递数为 0 时 null），后端实时聚合不落库 */
  hit_rate?: number | null
  applied_count?: number
  interview_count?: number
}

// 4. 岗位池（11 态）
export interface App {
  id: number
  user_id: number
  company: string
  role: string
  channel: string
  city: string
  work_mode: string
  salary_min: number // 分/月
  salary_max: number
  interest: number // 1-5
  jd_url: string
  applied_at: string | null
  resume_id: number | null
  contact_name: string
  contact_role: string
  contact_info: string
  status: AppStatus
  next_action: string
  next_action_at: string | null
  need_bg_check: boolean
  need_leave: boolean
  note: string
  created_at: string
  updated_at: string
}

// 5. 流转时间轴
export interface AppEvent {
  id: number
  app_id: number
  user_id: number
  from_status: string
  to_status: string
  source: string // manual / round / import（round=面试轮次自动推进；团队 lead 口径，无 dropdown）
  at: string
}

// 6. 面试复盘
export interface Interview {
  id: number
  user_id: number
  app_id: number | null
  company: string
  role: string
  round: InterviewRound
  scheduled_at: string | null
  format: InterviewFormat
  interviewer: string
  result: InterviewResult
  self_scores: SelfScores | null // null=未评
  done_right: string
  pitfall: string
  next_step: string
  one_line: string
  created_at: string
}

// 7. 面试题目（机检结果）
export interface InterviewQuestion {
  id: number
  interview_id: number
  user_id: number
  question: string
  my_answer: string
  better_answer: string
  tag: QuestionTag
  s_context: string | null
  t_task: string | null
  a_action: string | null
  r_result: string | null
  has_number: boolean
  weakness_codes: WeaknessCode[]
  is_overlong: boolean
  sort_order: number
  created_at: string
}

// 8. AI 逐题分析
export interface QuestionAnalysis {
  id: number
  question_id: number
  user_id: number
  examine_point: string
  inferred_flags: string[]
  keep_text: string
  rewrite_text: string
  need_numbers: string
  model: string
  status: AnalysisStatus
  error_msg: string
  created_at: string
  updated_at: string
}

// 9. 题目手动合并/拆分
export interface QuestionLink {
  id: number
  user_id: number
  question_a_id: number
  question_b_id: number
  link_type: LinkType
  created_at: string
}

// 10. Offer 决策
export interface OfferWeights {
  money: number
  growth: number
  stability: number
  life: number
}
export type OfferScores = Record<OfferScoreKey, number>
export interface Offer {
  id: number
  user_id: number
  app_id: number | null
  company: string
  role: string
  city: string
  base_salary: number // 月薪 分
  salary_months: number
  bonus_months: number // 绩效 月数（DECIMAL 4,1）
  sign_bonus: number // 签字费 分
  equity_value: number // 期权估值 元
  equity_years: number // 归属年限
  allowance: number // 补贴 分/月
  fund_rate: number // 公积金比例 %
  deadline: string | null
  weights: OfferWeights
  scores: OfferScores
  top_concern: string
  notice_period: string
  non_compete: boolean
  social_security: boolean
  note: string
  created_at: string
  updated_at: string
  annual_package?: number // 年包 分（实时计算，不落库）
  score?: number // 加权总分（实时计算）
  rank?: number // 排名
}

// 11. 周复盘 + 趋势改数 override
export interface WeeklyReview {
  id: number
  user_id: number
  week_start: string
  apply_override: number | null
  interview_override: number | null
  offer_override: number | null
  did_right: string
  did_wrong: string
  next_plan: string
  created_at: string
  updated_at: string
}

// 12. 路线图阶段
export interface RoadmapStage {
  id: number
  user_id: number
  stage_order: number
  title: string
  description: string
  expected_done_at: string | null
  created_at: string
}

// 13. 路线图任务
export interface RoadmapTask {
  id: number
  user_id: number
  stage_id: number
  title: string
  done: boolean
  done_at: string | null
  sort_order: number
  created_at: string
}

// 14. 每日打卡
export interface Checkin {
  id: number
  user_id: number
  checkin_date: string
  created_at: string
}

// 派生（单一事实源：实时聚合，不落库）
export interface Streak {
  current: number
  best: number
}
