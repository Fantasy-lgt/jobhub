/**
 * 领域实体类型（与 DB 列 snake_case 对齐）+ 少量 DTO。
 * 金额单位分；日期 YYYY-MM-DD；时间戳 ISO/UTC。
 */
import type { AppStatus, WeaknessCode } from '../constants';

// ---------- 账号 ----------
export interface UserRow {
  id: number;
  username: string;
  password_hash: string;
  created_at: string | Date;
}

export interface PublicUser {
  id: number;
  username: string;
}

// ---------- 求职定位 ----------
export interface StrengthItem {
  tag: string;
  evidence: string;
}

export interface GapItem {
  gap: string;
  action: string;
}

export interface ProfileRow {
  user_id: number;
  self_intro: string;
  primary_role: string;
  backup_roles: string[];
  industries: string[];
  company_types: string[];
  cities: string[];
  current_salary_base: number;
  current_salary_months: number;
  expect_floor: number;
  expect_target: number;
  strengths: StrengthItem[];
  gaps: GapItem[];
  updated_at: string | Date;
}

// ---------- 简历版本 ----------
export interface ResumeRow {
  id: number;
  user_id: number;
  name: string;
  target_role: string;
  is_primary: boolean;
  deleted_at: string | Date | null;
  created_at: string | Date;
}

// ---------- 岗位池 ----------
export interface AppRow {
  id: number;
  user_id: number;
  company: string;
  role: string;
  channel: string;
  city: string;
  work_mode: string;
  salary_min: number;
  salary_max: number;
  interest: number;
  jd_url: string;
  applied_at: string | null;
  resume_id: number | null;
  contact_name: string;
  contact_role: string;
  contact_info: string;
  status: AppStatus;
  next_action: string;
  next_action_at: string | null;
  need_bg_check: boolean;
  need_leave: boolean;
  note: string;
  deleted_at: string | Date | null;
  created_at: string | Date;
  updated_at: string | Date;
}

export interface AppEventRow {
  id: number;
  app_id: number;
  user_id: number;
  from_status: string;
  to_status: string;
  source: string;
  at: string | Date;
}

// ---------- 面试复盘 ----------
export interface SelfScores {
  content: number;
  expression: number;
  mindset: number;
  interaction: number;
}

export interface InterviewRow {
  id: number;
  user_id: number;
  app_id: number | null;
  company: string;
  role: string;
  round: string;
  scheduled_at: string | null;
  format: string;
  interviewer: string;
  result: string;
  self_scores: SelfScores | null;
  done_right: string;
  pitfall: string;
  next_step: string;
  one_line: string;
  deleted_at: string | Date | null;
  created_at: string | Date;
}

export interface InterviewQuestionRow {
  id: number;
  interview_id: number;
  user_id: number;
  question: string;
  my_answer: string;
  better_answer: string;
  tag: string;
  s_context: string | null;
  t_task: string | null;
  a_action: string | null;
  r_result: string | null;
  has_number: boolean;
  weakness_codes: WeaknessCode[];
  is_overlong: boolean;
  sort_order: number;
  created_at: string | Date;
}

// ---------- AI 逐题分析 ----------
export interface QuestionAnalysisRow {
  id: number;
  question_id: number;
  user_id: number;
  examine_point: string;
  inferred_flags: string[];
  keep_text: string;
  rewrite_text: string;
  need_numbers: string;
  model: string;
  status: 'pending' | 'running' | 'done' | 'failed';
  error_msg: string;
  created_at: string | Date;
  updated_at: string | Date;
}

// ---------- 题目手动合并/拆分 ----------
export interface QuestionLinkRow {
  id: number;
  user_id: number;
  question_a_id: number;
  question_b_id: number;
  link_type: 'merge' | 'split';
  created_at: string | Date;
}

// ---------- Offer ----------
export interface OfferWeights {
  money: number;
  growth: number;
  stability: number;
  life: number;
}

export interface OfferScores {
  money: number;
  growth: number;
  stability: number;
  life: number;
}

export interface OfferRow {
  id: number;
  user_id: number;
  app_id: number | null;
  company: string;
  role: string;
  city: string;
  base_salary: number;
  salary_months: number;
  bonus_months: number | string;
  sign_bonus: number;
  equity_value: number;
  equity_years: number;
  allowance: number;
  fund_rate: number | string;
  deadline: string | null;
  weights: OfferWeights;
  scores: OfferScores;
  top_concern: string;
  notice_period: string;
  non_compete: boolean;
  social_security: boolean;
  note: string;
  deleted_at: string | Date | null;
  created_at: string | Date;
  updated_at: string | Date;
}

// ---------- 周复盘 ----------
export interface WeeklyReviewRow {
  id: number;
  user_id: number;
  week_start: string;
  apply_override: number | null;
  interview_override: number | null;
  offer_override: number | null;
  did_right: string;
  did_wrong: string;
  next_plan: string;
  created_at: string | Date;
  updated_at: string | Date;
}

// ---------- 路线图 ----------
export interface RoadmapStageRow {
  id: number;
  user_id: number;
  stage_order: number;
  title: string;
  description: string;
  expected_done_at: string | null;
  created_at: string | Date;
}

export interface RoadmapTaskRow {
  id: number;
  user_id: number;
  stage_id: number;
  title: string;
  done: boolean;
  done_at: string | Date | null;
  sort_order: number;
  created_at: string | Date;
}

export interface CheckinRow {
  id: number;
  user_id: number;
  checkin_date: string;
  created_at: string | Date;
}

// ---------- DTO ----------
export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface OfferComputation {
  /** 年包（分）＝ 月薪×薪月数 + 绩效月数×月薪 + 签字费 + 补贴×12 */
  total_cents: number;
  base_cents: number;
  bonus_cents: number;
  sign_cents: number;
  allowance_cents: number;
  /** 期权估值（分，仅展示不计入年包） */
  equity_cents: number;
  /** 期权年均值（元/年） */
  equity_yuan_per_year: number;
  /** 加权总分（0–5） */
  weighted_score: number;
}
