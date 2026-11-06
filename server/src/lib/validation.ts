/**
 * 请求体/查询参数 zod schema（配合 Fastify 路由层，替代手写 if 校验）。
 * 金额字段一律为「分」（整数），日期 YYYY-MM-DD。
 */
import { z } from 'zod';
import { APP_STATUSES, ANALYSIS_STATUSES } from '../constants';

// ---------- 通用 ----------
export const idParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const qidParamSchema = z.object({
  qid: z.coerce.number().int().positive(),
});

export const interviewIdParamSchema = z.object({
  interviewId: z.coerce.number().int().positive(),
});

export const jobIdParamSchema = z.object({
  jobId: z.string().min(1).max(64),
});

export const weekStartParamSchema = z.object({
  weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

const money = z.number().int().nonnegative();

// ---------- 鉴权 ----------
export const loginSchema = z.object({
  username: z.string().trim().min(1).max(64),
  password: z.string().min(1).max(255),
});

export const changePasswordSchema = z.object({
  oldPassword: z.string().min(1).max(255),
  newPassword: z.string().min(6).max(255),
});

// ---------- 求职定位 ----------
const strengthItem = z.object({
  tag: z.string().trim().min(1).max(64),
  evidence: z.string().trim().min(1).max(500),
});
const gapItem = z.object({
  gap: z.string().trim().min(1).max(200),
  action: z.string().trim().min(1).max(500),
});

export const profileSchema = z.object({
  self_intro: z.string().trim().max(120).default(''),
  primary_role: z.string().trim().max(120).default(''),
  backup_roles: z.array(z.string().trim().max(120)).max(2).default([]),
  industries: z.array(z.string().trim().max(120)).default([]),
  company_types: z.array(z.string().trim().max(120)).default([]),
  cities: z.array(z.string().trim().max(64)).default([]),
  current_salary_base: money.default(0),
  current_salary_months: z.number().int().min(1).max(24).default(12),
  expect_floor: money.default(0),
  expect_target: money.default(0),
  strengths: z.array(strengthItem).min(3).max(5),
  gaps: z.array(gapItem).min(1).max(3),
});

// ---------- 简历 ----------
export const resumeCreateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  target_role: z.string().trim().max(120).default(''),
});

export const resumeUpdateSchema = resumeCreateSchema.partial();

// ---------- 岗位池 ----------
export const appCreateSchema = z.object({
  company: z.string().trim().min(1).max(120),
  role: z.string().trim().min(1).max(120),
  channel: z.string().trim().max(32).default('其他'),
  city: z.string().trim().max(64).default(''),
  work_mode: z.string().trim().max(16).default('坐班'),
  salary_min: money.default(0),
  salary_max: money.default(0),
  interest: z.number().int().min(1).max(5).default(3),
  jd_url: z.string().trim().max(500).default(''),
  applied_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  resume_id: z.number().int().positive().nullable().optional(),
  contact_name: z.string().trim().max(64).default(''),
  contact_role: z.string().trim().max(32).default(''),
  contact_info: z.string().trim().max(255).default(''),
  status: z.enum(APP_STATUSES).default('pending'),
  next_action: z.string().trim().max(255).default(''),
  next_action_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  need_bg_check: z.boolean().default(false),
  need_leave: z.boolean().default(false),
  note: z.string().max(20000).default(''),
});

export const appUpdateSchema = appCreateSchema.omit({ status: true }).partial();

export const appStatusSchema = z
  .object({
    to_status: z.enum(APP_STATUSES).optional(),
    toStatus: z.enum(APP_STATUSES).optional(),
    source: z.enum(['manual', 'round', 'import']).default('manual'),
  })
  .refine((d) => !!d.to_status || !!d.toStatus, { message: 'to_status 必填' });

export const appsQuerySchema = z.object({
  status: z.string().optional(),
  channel: z.string().optional(),
  interest: z.coerce.number().int().min(1).max(5).optional(),
  overdue: z.string().optional(),
  q: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

// ---------- 面试复盘 ----------
export const interviewCreateSchema = z.object({
  app_id: z.number().int().positive().nullable().optional(),
  company: z.string().trim().min(1).max(120),
  role: z.string().trim().min(1).max(120),
  round: z.string().trim().max(32).default('一面'),
  scheduled_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  format: z.string().trim().max(16).default('视频'),
  interviewer: z.string().trim().max(255).default(''),
  result: z.string().trim().max(16).default('等通知'),
});

export const interviewUpdateSchema = interviewCreateSchema.partial();

export const questionCreateSchema = z.object({
  question: z.string().trim().min(1).max(10000),
  my_answer: z.string().trim().max(20000).default(''),
  better_answer: z.string().trim().max(20000).default(''),
  tag: z.string().trim().max(32).default('专业题'),
  s_context: z.string().trim().max(5000).nullable().optional(),
  t_task: z.string().trim().max(5000).nullable().optional(),
  a_action: z.string().trim().max(5000).nullable().optional(),
  r_result: z.string().trim().max(5000).nullable().optional(),
});

export const recallSchema = z.object({
  text: z.string().trim().min(1).max(50000),
});

export const selfAssessSchema = z.object({
  content: z.number().int().min(1).max(5),
  expression: z.number().int().min(1).max(5),
  mindset: z.number().int().min(1).max(5),
  interaction: z.number().int().min(1).max(5),
});

export const summarySchema = z.object({
  done_right: z.string().max(20000).default(''),
  pitfall: z.string().max(20000).default(''),
  next_step: z.string().max(20000).default(''),
  one_line: z.string().trim().max(80).default(''),
});

// ---------- 题库 ----------
export const linkCreateSchema = z
  .object({
    a_id: z.number().int().positive().optional(),
    b_id: z.number().int().positive().optional(),
    aId: z.number().int().positive().optional(),
    bId: z.number().int().positive().optional(),
    type: z.enum(['merge', 'split']),
  })
  .refine((d) => (!!d.a_id || !!d.aId) && (!!d.b_id || !!d.bId), { message: 'a_id/b_id 必填' });

export const linkDeleteParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const groupParamSchema = z.object({
  id: z.string(),
});

// ---------- Offer ----------
const offerWeightsSchema = z.object({
  money: z.number().int().min(0).max(100),
  growth: z.number().int().min(0).max(100),
  stability: z.number().int().min(0).max(100),
  life: z.number().int().min(0).max(100),
});

const offerScoresSchema = z.object({
  money: z.number().int().min(1).max(5),
  growth: z.number().int().min(1).max(5),
  stability: z.number().int().min(1).max(5),
  life: z.number().int().min(1).max(5),
});

export const offerCreateSchema = z.object({
  app_id: z.number().int().positive().nullable().optional(),
  company: z.string().trim().min(1).max(120),
  role: z.string().trim().min(1).max(120),
  city: z.string().trim().max(64).default(''),
  base_salary: money.default(0),
  salary_months: z.number().int().min(1).max(24).default(12),
  bonus_months: z.number().min(0).max(48).default(0),
  sign_bonus: money.default(0),
  equity_value: z.number().int().nonnegative().default(0), // 期权估值 元
  equity_years: z.number().int().min(1).max(10).default(4),
  allowance: money.default(0),
  fund_rate: z.number().min(0).max(100).default(0),
  deadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  weights: offerWeightsSchema.default({ money: 40, growth: 25, stability: 20, life: 15 }),
  scores: offerScoresSchema.default({ money: 3, growth: 3, stability: 3, life: 3 }),
  top_concern: z.string().trim().max(255).default(''),
  notice_period: z.string().trim().max(32).default(''),
  non_compete: z.boolean().default(false),
  social_security: z.boolean().default(false),
  note: z.string().max(20000).default(''),
});

export const offerUpdateSchema = offerCreateSchema.partial();

export const compareQuerySchema = z.object({
  ids: z.string().min(1),
});

// ---------- 数据复盘 ----------
export const indicatorsQuerySchema = z.object({
  range: z.enum(['week', '7d', '30d', 'all']).default('week'),
});

export const trendUpdateSchema = z.object({
  apply: z.number().int().nonnegative().nullable().optional(),
  interview: z.number().int().nonnegative().nullable().optional(),
  offer: z.number().int().nonnegative().nullable().optional(),
});

export const weeklyReviewSchema = z.object({
  did_right: z.string().max(20000).default(''),
  did_wrong: z.string().max(20000).default(''),
  next_plan: z.string().max(20000).default(''),
});

// ---------- 路线图 ----------
export const taskCreateSchema = z.object({
  title: z.string().trim().min(1).max(255),
});

export const taskUpdateSchema = z.object({
  title: z.string().trim().min(1).max(255).optional(),
  done: z.boolean().optional(),
});

export const stageParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const taskParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

// ---------- AI ----------
export const analysisStatusSchema = z.enum(ANALYSIS_STATUSES);
