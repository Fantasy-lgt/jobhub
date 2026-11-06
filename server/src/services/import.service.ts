/**
 * 批量导入 service：把外部产出的 JSON（如按文档生成的求职数据）一次性落库。
 *
 * 契约要点：
 * - 入参 camelCase，内部映射到既有 snake_case 列；字段/枚举以 lib/validation.ts 与 migrations 为准，不自创新字段。
 * - 关联靠「外部 id」：resumes[].externalId → apps[].resumeExternalId；
 *   apps[].externalId → interviews[].appExternalId / offers[].appExternalId；
 *   interviews[].questions[].externalId → questionAnalyses[].interviewQuestionExternalId / questionLinks[].{a,b}ExternalId；
 *   roadmapTasks[] 用 (stageOrder, title) 定位模板任务。
 * - dryRun=true：完整 zod 校验 + 关联解析 + 去重预演，全部只读，不写库。
 * - mode=append：按业务键去重，已存在则跳过（同一份数据重复导入不会产生重复行）。
 * - mode=replace：同一事务内清空 13 张用户数据表（保留 users / roadmap_stages / roadmap_tasks）后全量写入。
 * - 校验/关联错误统一收集进 errors[]，任何错误都不写库（路由层返回 422）。
 */
import { z } from 'zod';
import type { Knex } from 'knex';
import { db, toJson } from '../db';
import { machineCheck } from '../lib/machine-check';
import { ANALYSIS_STATUSES, APP_STATUSES, WEAKNESS_CODES } from '../constants';
import { todayStr } from '../lib/date';

// ---------- 统计与错误结构 ----------

export const IMPORT_STAT_KEYS = [
  'profile',
  'resumes',
  'apps',
  'appEvents',
  'interviews',
  'questions',
  'questionAnalyses',
  'questionLinks',
  'offers',
  'weeklyReviews',
  'checkins',
  'roadmapTasks',
] as const;

export type ImportStatKey = (typeof IMPORT_STAT_KEYS)[number];
export type ImportStats = Record<ImportStatKey, number>;

export interface ImportError {
  path: string;
  message: string;
}

export interface ImportResult {
  mode: ImportMode;
  dryRun: boolean;
  /** 实际写入（新增）条数 */
  created: ImportStats;
  /** 就地更新条数（analyses upsert / roadmap 任务勾选） */
  updated: ImportStats;
  /** 未写入条数（重复去重 / 找不到目标） */
  skipped: ImportStats;
  /** 仅 mode=replace 返回：本次清除的行数（table → rows） */
  cleared?: Record<string, number>;
  errors: ImportError[];
  warnings: string[];
}

export function zeroStats(): ImportStats {
  return IMPORT_STAT_KEYS.reduce((acc, key) => {
    acc[key] = 0;
    return acc;
  }, {} as ImportStats);
}

// ---------- zod：camelCase 入参 schema ----------

const money = z.number().int().nonnegative();
const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '日期格式须为 YYYY-MM-DD');
const externalIdSchema = z.string().trim().min(1).max(64);
/** 时间戳：接受 'YYYY-MM-DD'、'YYYY-MM-DD HH:mm(:ss)' 或 ISO 字符串 */
const timestampSchema = z
  .string()
  .trim()
  .min(1)
  .max(40)
  .refine((v) => !Number.isNaN(parseTimestamp(v).getTime()), '时间格式无法解析');

function parseTimestamp(value: string): Date {
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? `${value}T00:00:00`
    : value.replace(' ', 'T');
  return new Date(normalized);
}

const strengthItemSchema = z.object({
  tag: z.string().trim().min(1).max(64),
  evidence: z.string().trim().min(1).max(500),
});

const gapItemSchema = z.object({
  gap: z.string().trim().min(1).max(200),
  action: z.string().trim().min(1).max(500),
});

/** 求职定位：与 profileSchema 同约束（1:1，最多 1 条） */
const profileImportSchema = z.object({
  selfIntro: z.string().trim().max(120).default(''),
  primaryRole: z.string().trim().max(120).default(''),
  backupRoles: z.array(z.string().trim().max(120)).max(2).default([]),
  industries: z.array(z.string().trim().max(120)).default([]),
  companyTypes: z.array(z.string().trim().max(120)).default([]),
  cities: z.array(z.string().trim().max(64)).default([]),
  currentSalaryBase: money.default(0),
  currentSalaryMonths: z.number().int().min(1).max(24).default(12),
  expectFloor: money.default(0),
  expectTarget: money.default(0),
  strengths: z.array(strengthItemSchema).min(3).max(5),
  gaps: z.array(gapItemSchema).min(1).max(3),
});

const resumeImportSchema = z.object({
  externalId: externalIdSchema.optional(),
  name: z.string().trim().min(1).max(120),
  targetRole: z.string().trim().max(120).default(''),
  isPrimary: z.boolean().default(false),
  createdAt: timestampSchema.optional(),
});

const appEventImportSchema = z.object({
  fromStatus: z.enum(APP_STATUSES).default('pending'),
  toStatus: z.enum(APP_STATUSES),
  source: z.string().trim().max(32).default('import'),
  at: timestampSchema.optional(),
});

const appImportSchema = z.object({
  externalId: externalIdSchema.optional(),
  company: z.string().trim().min(1).max(120),
  role: z.string().trim().min(1).max(120),
  channel: z.string().trim().max(32).default('其他'),
  city: z.string().trim().max(64).default(''),
  workMode: z.string().trim().max(16).default('坐班'),
  salaryMin: money.default(0),
  salaryMax: money.default(0),
  interest: z.number().int().min(1).max(5).default(3),
  jdUrl: z.string().trim().max(500).default(''),
  appliedAt: dateStr.nullable().optional(),
  resumeExternalId: externalIdSchema.optional(),
  contactName: z.string().trim().max(64).default(''),
  contactRole: z.string().trim().max(32).default(''),
  contactInfo: z.string().trim().max(255).default(''),
  status: z.enum(APP_STATUSES).default('pending'),
  nextAction: z.string().trim().max(255).default(''),
  nextActionAt: dateStr.nullable().optional(),
  needBgCheck: z.boolean().default(false),
  needLeave: z.boolean().default(false),
  note: z.string().max(20000).default(''),
  createdAt: timestampSchema.optional(),
  events: z.array(appEventImportSchema).max(50).optional(),
});

const questionImportSchema = z.object({
  /** 供 questionAnalyses / questionLinks 引用 */
  externalId: externalIdSchema.optional(),
  question: z.string().trim().min(1).max(10000),
  myAnswer: z.string().trim().max(20000).default(''),
  betterAnswer: z.string().trim().max(20000).default(''),
  tag: z.string().trim().max(32).default('专业题'),
  sContext: z.string().trim().max(5000).nullable().optional(),
  tTask: z.string().trim().max(5000).nullable().optional(),
  aAction: z.string().trim().max(5000).nullable().optional(),
  rResult: z.string().trim().max(5000).nullable().optional(),
  /** 显式弱点码优先；缺省由机检（lib/machine-check）计算 */
  weaknessCodes: z.array(z.enum(WEAKNESS_CODES)).max(8).optional(),
  sortOrder: z.number().int().min(0).max(9999).optional(),
});

const selfScoresSchema = z.object({
  content: z.number().int().min(1).max(5),
  expression: z.number().int().min(1).max(5),
  mindset: z.number().int().min(1).max(5),
  interaction: z.number().int().min(1).max(5),
});

const interviewImportSchema = z.object({
  externalId: externalIdSchema.optional(),
  appExternalId: externalIdSchema.optional(),
  company: z.string().trim().min(1).max(120),
  role: z.string().trim().min(1).max(120),
  round: z.string().trim().max(32).default('一面'),
  scheduledAt: dateStr.nullable().optional(),
  format: z.string().trim().max(16).default('视频'),
  interviewer: z.string().trim().max(255).default(''),
  result: z.string().trim().max(16).default('等通知'),
  selfScores: selfScoresSchema.nullable().optional(),
  doneRight: z.string().max(20000).default(''),
  pitfall: z.string().max(20000).default(''),
  nextStep: z.string().max(20000).default(''),
  oneLine: z.string().trim().max(80).default(''),
  createdAt: timestampSchema.optional(),
  questions: z.array(questionImportSchema).max(200).optional(),
});

/** AI 逐题分析（question_analyses 对 question_id 唯一，导入即 upsert） */
const questionAnalysisImportSchema = z.object({
  interviewQuestionExternalId: externalIdSchema,
  examinePoint: z.string().trim().min(1).max(10000),
  inferredFlags: z.array(z.string().trim().max(200)).max(20).default([]),
  keepText: z.string().max(20000).default(''),
  rewriteText: z.string().max(20000).default(''),
  needNumbers: z.string().trim().max(500).default(''),
  model: z.string().trim().max(64).default('deepseek-chat'),
  status: z.enum(ANALYSIS_STATUSES).default('done'),
  errorMsg: z.string().trim().max(500).default(''),
});

/** 题目手动合并/拆分（两端口径均为已导入题目） */
const questionLinkImportSchema = z
  .object({
    aExternalId: externalIdSchema,
    bExternalId: externalIdSchema,
    type: z.enum(['merge', 'split']).default('merge'),
  })
  .refine((link) => link.aExternalId !== link.bExternalId, {
    message: 'aExternalId 与 bExternalId 不能相同',
  });

/** 路线图任务勾选：按 (stageOrder, title) 定位模板任务，不新建阶段/任务 */
const roadmapTaskImportSchema = z.object({
  stageOrder: z.number().int().min(1).max(5),
  title: z.string().trim().min(1).max(255),
  done: z.boolean().default(true),
  doneAt: timestampSchema.optional(),
});

const offerWeightsSchema = z
  .object({
    money: z.number().int().min(0).max(100),
    growth: z.number().int().min(0).max(100),
    stability: z.number().int().min(0).max(100),
    life: z.number().int().min(0).max(100),
  })
  .refine((w) => w.money + w.growth + w.stability + w.life === 100, {
    message: '四维权重合计必须为 100',
  });

const offerScoresSchema = z.object({
  money: z.number().int().min(1).max(5),
  growth: z.number().int().min(1).max(5),
  stability: z.number().int().min(1).max(5),
  life: z.number().int().min(1).max(5),
});

const offerImportSchema = z.object({
  externalId: externalIdSchema.optional(),
  appExternalId: externalIdSchema.optional(),
  company: z.string().trim().min(1).max(120),
  role: z.string().trim().min(1).max(120),
  city: z.string().trim().max(64).default(''),
  baseSalary: money.default(0),
  salaryMonths: z.number().int().min(1).max(24).default(12),
  bonusMonths: z.number().min(0).max(48).default(0),
  signBonus: money.default(0),
  /** 期权估值，单位「元」（与 offers.equity_value 一致） */
  equityValue: z.number().int().nonnegative().default(0),
  equityYears: z.number().int().min(1).max(10).default(4),
  allowance: money.default(0),
  fundRate: z.number().min(0).max(100).default(0),
  deadline: dateStr.nullable().optional(),
  weights: offerWeightsSchema.default({ money: 40, growth: 25, stability: 20, life: 15 }),
  scores: offerScoresSchema.default({ money: 3, growth: 3, stability: 3, life: 3 }),
  topConcern: z.string().trim().max(255).default(''),
  noticePeriod: z.string().trim().max(32).default(''),
  nonCompete: z.boolean().default(false),
  socialSecurity: z.boolean().default(false),
  note: z.string().max(20000).default(''),
  createdAt: timestampSchema.optional(),
});

const weeklyReviewImportSchema = z.object({
  weekStart: dateStr,
  applyOverride: z.number().int().nonnegative().nullable().optional(),
  interviewOverride: z.number().int().nonnegative().nullable().optional(),
  offerOverride: z.number().int().nonnegative().nullable().optional(),
  didRight: z.string().max(20000).default(''),
  didWrong: z.string().max(20000).default(''),
  nextPlan: z.string().max(20000).default(''),
});

const checkinImportSchema = z.object({
  checkinDate: dateStr,
});

const importDataSchema = z.object({
  profile: profileImportSchema.optional(),
  resumes: z.array(resumeImportSchema).max(200).optional(),
  apps: z.array(appImportSchema).max(2000).optional(),
  interviews: z.array(interviewImportSchema).max(2000).optional(),
  questionAnalyses: z.array(questionAnalysisImportSchema).max(5000).optional(),
  questionLinks: z.array(questionLinkImportSchema).max(5000).optional(),
  offers: z.array(offerImportSchema).max(200).optional(),
  weeklyReviews: z.array(weeklyReviewImportSchema).max(500).optional(),
  checkins: z.array(checkinImportSchema).max(2000).optional(),
  roadmapTasks: z.array(roadmapTaskImportSchema).max(200).optional(),
});

export const importRequestSchema = z.object({
  mode: z.enum(['append', 'replace']).default('append'),
  /** 安全默认：不显式传 false 就只做演练，绝不写库 */
  dryRun: z.boolean().default(true),
  data: importDataSchema,
});

/** data 支持的顶层分节（用于提示未识别的分节，避免静默丢弃） */
export const IMPORT_DATA_SECTIONS: readonly string[] = [
  'profile',
  'resumes',
  'apps',
  'interviews',
  'questionAnalyses',
  'questionLinks',
  'offers',
  'weeklyReviews',
  'checkins',
  'roadmapTasks',
];

export type ImportMode = 'append' | 'replace';
export type ImportRequest = z.infer<typeof importRequestSchema>;
export type ImportData = ImportRequest['data'];

/** zod issue path → 'data.apps[0].company' 形式，便于调用方定位。 */
export function formatIssuePath(path: (string | number)[]): string {
  return path.reduce<string>((acc, segment) => {
    if (typeof segment === 'number') return `${acc}[${segment}]`;
    return acc ? `${acc}.${segment}` : segment;
  }, '');
}

export function toImportErrors(error: z.ZodError): ImportError[] {
  return error.issues.map((issue) => ({
    path: formatIssuePath(issue.path as (string | number)[]),
    message: issue.message,
  }));
}

// ---------- 业务键（append 去重 / 幂等） ----------

const SEP = '\u0001';

function normalizePart(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

function appKey(company: string, role: string, appliedAt: string | null | undefined): string {
  return [normalizePart(company), normalizePart(role), appliedAt ?? ''].join(SEP);
}

function interviewKey(company: string, role: string, scheduledAt: string | null | undefined): string {
  return [normalizePart(company), normalizePart(role), scheduledAt ?? ''].join(SEP);
}

function resumeKey(name: string, targetRole: string | null | undefined): string {
  return [normalizePart(name), normalizePart(targetRole)].join(SEP);
}

function offerKey(company: string, role: string): string {
  return [normalizePart(company), normalizePart(role)].join(SEP);
}

/**
 * replace 时需要清空的 13 张用户数据表（保留 users / roadmap_stages / roadmap_tasks），
 * 子表在前避免外键冲突。roadmap_tasks 属模板数据，不在此列（只按 (stage_order,title) 更新）。
 */
export const CLEAR_ORDER: readonly string[] = [
  'question_analyses',
  'interview_questions',
  'question_links',
  'app_events',
  'offers',
  'interviews',
  'apps',
  'resumes',
  'profiles',
  'weekly_reviews',
  'checkins',
];

interface ExistingState {
  profileExists: boolean;
  resumeKeys: Set<string>;
  appKeys: Set<string>;
  appIdByKey: Map<string, number>;
  interviewKeys: Set<string>;
  interviewIdByKey: Map<string, number>;
  offerKeys: Set<string>;
  weeklyKeys: Set<string>;
  checkinKeys: Set<string>;
}

function emptyExisting(): ExistingState {
  return {
    profileExists: false,
    resumeKeys: new Set(),
    appKeys: new Set(),
    appIdByKey: new Map(),
    interviewKeys: new Set(),
    interviewIdByKey: new Map(),
    offerKeys: new Set(),
    weeklyKeys: new Set(),
    checkinKeys: new Set(),
  };
}

/** 读取既有业务键（append 去重依据）；replace 模式不读，视为空集。 */
async function loadExisting(userId: number): Promise<ExistingState> {
  const state = emptyExisting();

  const [profile, resumes, apps, interviews, offers, weekly, checkins] = await Promise.all([
    db('profiles').where({ user_id: userId }).first(),
    db('resumes').where({ user_id: userId }).whereNull('deleted_at').select('name', 'target_role'),
    db('apps')
      .where({ user_id: userId })
      .whereNull('deleted_at')
      .select('id', 'company', 'role', 'applied_at'),
    db('interviews')
      .where({ user_id: userId })
      .whereNull('deleted_at')
      .select('id', 'company', 'role', 'scheduled_at'),
    db('offers').where({ user_id: userId }).whereNull('deleted_at').select('company', 'role'),
    db('weekly_reviews').where({ user_id: userId }).select('week_start'),
    db('checkins').where({ user_id: userId }).select('checkin_date'),
  ]);

  state.profileExists = Boolean(profile);
  (resumes as { name: string; target_role: string }[]).forEach((r) =>
    state.resumeKeys.add(resumeKey(r.name, r.target_role)),
  );
  (
    apps as { id: number; company: string; role: string; applied_at: string | null }[]
  ).forEach((a) => {
    const key = appKey(a.company, a.role, a.applied_at);
    state.appKeys.add(key);
    state.appIdByKey.set(key, Number(a.id));
  });
  (
    interviews as { id: number; company: string; role: string; scheduled_at: string | null }[]
  ).forEach((iv) => {
    const key = interviewKey(iv.company, iv.role, iv.scheduled_at);
    state.interviewKeys.add(key);
    state.interviewIdByKey.set(key, Number(iv.id));
  });
  (offers as { company: string; role: string }[]).forEach((o) =>
    state.offerKeys.add(offerKey(o.company, o.role)),
  );
  (weekly as { week_start: string }[]).forEach((w) => state.weeklyKeys.add(w.week_start));
  (checkins as { checkin_date: string }[]).forEach((c) => state.checkinKeys.add(c.checkin_date));

  return state;
}

// ---------- 写入器（dryRun 用空实现，真实用事务） ----------

interface Writer {
  insert: (table: string, row: Record<string, unknown>) => Promise<number>;
  update: (
    table: string,
    where: Record<string, unknown>,
    patch: Record<string, unknown>,
  ) => Promise<number>;
}

function makeRealWriter(trx: Knex.Transaction): Writer {
  return {
    insert: async (table, row) => {
      const result: unknown = await trx(table).insert(row);
      const id = Array.isArray(result) ? result[0] : result;
      return Number(id);
    },
    update: async (table, where, patch) => Number(await trx(table).where(where).update(patch)),
  };
}

/** dryRun：只记账不落库；update 返回 1 表示「会更新 1 行」。 */
function makeDryWriter(): Writer {
  let seq = 0;
  return {
    insert: async () => {
      seq += 1;
      return seq;
    },
    update: async () => 1,
  };
}

/** 只读查询既有行 id（dryRun 也真实执行，保证预演统计准确）。 */
async function findRowId(
  table: string,
  where: Record<string, unknown>,
): Promise<number | null> {
  const row = (await db(table).where(where).first()) as { id?: number | string } | undefined;
  return row && row.id !== undefined ? Number(row.id) : null;
}

// ---------- 主流程 ----------

interface WorkContext {
  userId: number;
  data: ImportData;
  writer: Writer;
  created: ImportStats;
  updated: ImportStats;
  skipped: ImportStats;
  warnings: string[];
  seen: ExistingState;
  seenLinkPairs: Set<string>;
}

async function applySections(ctx: WorkContext): Promise<void> {
  const { userId, data, writer, created, updated, skipped, seen, warnings } = ctx;

  // 1) 求职定位（1:1）
  if (data.profile) {
    if (seen.profileExists) {
      skipped.profile += 1;
      warnings.push('已存在求职定位，append 模式跳过 profile（如需覆盖请用 mode=replace）');
    } else {
      const p = data.profile;
      await writer.insert('profiles', {
        user_id: userId,
        self_intro: p.selfIntro,
        primary_role: p.primaryRole,
        backup_roles: toJson(p.backupRoles, '[]')!,
        industries: toJson(p.industries, '[]')!,
        company_types: toJson(p.companyTypes, '[]')!,
        cities: toJson(p.cities, '[]')!,
        current_salary_base: p.currentSalaryBase,
        current_salary_months: p.currentSalaryMonths,
        expect_floor: p.expectFloor,
        expect_target: p.expectTarget,
        strengths: toJson(p.strengths, '[]')!,
        gaps: toJson(p.gaps, '[]')!,
        updated_at: new Date(),
      });
      created.profile += 1;
      seen.profileExists = true;
    }
  }

  // 2) 简历版本
  const resumes = data.resumes ?? [];
  const resumeIdByExt = new Map<string, number>();
  const hasPrimaryFlag = resumes.some((r) => r.isPrimary);
  let primaryAssigned = false;
  for (const r of resumes) {
    const key = resumeKey(r.name, r.targetRole);
    if (seen.resumeKeys.has(key)) {
      skipped.resumes += 1;
      continue;
    }
    seen.resumeKeys.add(key);
    // 首个版本自动设为主用（与 profile.service.createResume 的约定一致）
    const isPrimary = r.isPrimary || (!hasPrimaryFlag && !primaryAssigned);
    if (isPrimary) primaryAssigned = true;
    const id = await writer.insert('resumes', {
      user_id: userId,
      name: r.name,
      target_role: r.targetRole,
      is_primary: isPrimary,
      created_at: r.createdAt ? parseTimestamp(r.createdAt) : new Date(),
    });
    if (r.externalId) resumeIdByExt.set(r.externalId, id);
    created.resumes += 1;
  }

  // 3) 岗位池 + 流转时间轴
  const appIdByExt = new Map<string, number>();
  for (const a of data.apps ?? []) {
    const appliedAt = a.appliedAt ?? (a.status !== 'pending' ? todayStr() : null);
    const key = appKey(a.company, a.role, appliedAt);
    if (seen.appKeys.has(key)) {
      skipped.apps += 1;
      const existingId = seen.appIdByKey.get(key);
      if (a.externalId && existingId) appIdByExt.set(a.externalId, existingId);
      continue;
    }
    seen.appKeys.add(key);

    const resumeId = a.resumeExternalId ? resumeIdByExt.get(a.resumeExternalId) ?? null : null;
    const id = await writer.insert('apps', {
      user_id: userId,
      company: a.company,
      role: a.role,
      channel: a.channel,
      city: a.city,
      work_mode: a.workMode,
      salary_min: a.salaryMin,
      salary_max: a.salaryMax,
      interest: a.interest,
      jd_url: a.jdUrl,
      applied_at: appliedAt,
      resume_id: resumeId,
      contact_name: a.contactName,
      contact_role: a.contactRole,
      contact_info: a.contactInfo,
      status: a.status,
      next_action: a.nextAction,
      next_action_at: a.nextActionAt ?? null,
      need_bg_check: a.needBgCheck,
      need_leave: a.needLeave,
      note: a.note,
      created_at: a.createdAt ? parseTimestamp(a.createdAt) : new Date(),
      updated_at: new Date(),
    });
    if (a.externalId) appIdByExt.set(a.externalId, id);
    created.apps += 1;

    // 约定：状态变更必写事件。提供了 events 就按 events 落，否则补一条 pending → status。
    const events =
      a.events && a.events.length > 0
        ? a.events
        : a.status !== 'pending'
          ? [
              {
                fromStatus: 'pending' as const,
                toStatus: a.status,
                source: 'import',
                at: appliedAt ? `${appliedAt}T00:00:00` : undefined,
              },
            ]
          : [];
    for (const ev of events) {
      await writer.insert('app_events', {
        app_id: id,
        user_id: userId,
        from_status: ev.fromStatus,
        to_status: ev.toStatus,
        source: ev.source,
        at: ev.at ? parseTimestamp(ev.at) : new Date(),
      });
      created.appEvents += 1;
    }
  }

  // 4) 面试复盘 + 逐题（跑机检落库，与 interviews.service.addQuestion 一致）
  const questionIdByExt = new Map<string, number>();
  for (const it of data.interviews ?? []) {
    const key = interviewKey(it.company, it.role, it.scheduledAt ?? null);
    if (seen.interviewKeys.has(key)) {
      skipped.interviews += 1;
      skipped.questions += it.questions?.length ?? 0;
      // 面试已存在：回查其题目 id，供 questionAnalyses / questionLinks 引用
      const existingInterviewId = seen.interviewIdByKey.get(key);
      if (existingInterviewId && it.questions && it.questions.length > 0) {
        const rows = (await db('interview_questions')
          .where({ interview_id: existingInterviewId, user_id: userId })
          .select('id', 'question')) as { id: number | string; question: string }[];
        const idByText = new Map(rows.map((row) => [row.question, Number(row.id)]));
        for (const q of it.questions) {
          const qid = idByText.get(q.question);
          if (q.externalId && qid) questionIdByExt.set(q.externalId, qid);
        }
      }
      continue;
    }
    seen.interviewKeys.add(key);

    const appId = it.appExternalId ? appIdByExt.get(it.appExternalId) ?? null : null;
    const id = await writer.insert('interviews', {
      user_id: userId,
      app_id: appId,
      company: it.company,
      role: it.role,
      round: it.round,
      scheduled_at: it.scheduledAt ?? null,
      format: it.format,
      interviewer: it.interviewer,
      result: it.result,
      self_scores: toJson(it.selfScores ?? null, null),
      done_right: it.doneRight,
      pitfall: it.pitfall,
      next_step: it.nextStep,
      one_line: it.oneLine,
      created_at: it.createdAt ? parseTimestamp(it.createdAt) : new Date(),
    });
    created.interviews += 1;

    for (const [index, q] of (it.questions ?? []).entries()) {
      const check = machineCheck({
        s_context: q.sContext,
        t_task: q.tTask,
        a_action: q.aAction,
        r_result: q.rResult,
        my_answer: q.myAnswer,
      });
      const questionId = await writer.insert('interview_questions', {
        interview_id: id,
        user_id: userId,
        question: q.question,
        my_answer: q.myAnswer,
        better_answer: q.betterAnswer,
        tag: q.tag,
        s_context: q.sContext ?? null,
        t_task: q.tTask ?? null,
        a_action: q.aAction ?? null,
        r_result: q.rResult ?? null,
        has_number: check.hasNumber,
        weakness_codes: toJson(q.weaknessCodes ?? check.weaknessCodes, '[]')!,
        is_overlong: check.isOverlong,
        sort_order: q.sortOrder ?? index + 1,
      });
      if (q.externalId) questionIdByExt.set(q.externalId, questionId);
      created.questions += 1;
    }
  }

  // 5) AI 逐题分析（question_analyses 对 question_id 唯一 → 存在即就地更新）
  for (const [index, a] of (data.questionAnalyses ?? []).entries()) {
    const questionId = questionIdByExt.get(a.interviewQuestionExternalId);
    if (!questionId) {
      skipped.questionAnalyses += 1;
      warnings.push(
        `questionAnalyses[${index}] 未定位到题目（interviewQuestionExternalId=${a.interviewQuestionExternalId}），已跳过`,
      );
      continue;
    }
    const payload = {
      examine_point: a.examinePoint,
      inferred_flags: toJson(a.inferredFlags, '[]')!,
      keep_text: a.keepText,
      rewrite_text: a.rewriteText,
      need_numbers: a.needNumbers,
      model: a.model,
      status: a.status,
      error_msg: a.errorMsg,
      updated_at: new Date(),
    };
    const existingId = await findRowId('question_analyses', { question_id: questionId });
    if (existingId) {
      await writer.update('question_analyses', { id: existingId }, payload);
      updated.questionAnalyses += 1;
    } else {
      await writer.insert('question_analyses', {
        question_id: questionId,
        user_id: userId,
        ...payload,
        created_at: new Date(),
      });
      created.questionAnalyses += 1;
    }
  }

  // 6) 题目手动合并/拆分（重复链接跳过）
  for (const [index, link] of (data.questionLinks ?? []).entries()) {
    const aId = questionIdByExt.get(link.aExternalId);
    const bId = questionIdByExt.get(link.bExternalId);
    if (!aId || !bId) {
      skipped.questionLinks += 1;
      warnings.push(
        `questionLinks[${index}] 未定位到题目（a=${link.aExternalId}, b=${link.bExternalId}），已跳过`,
      );
      continue;
    }
    const lowId = Math.min(aId, bId);
    const highId = Math.max(aId, bId);
    const pairKey = `${lowId}${SEP}${highId}`;
    if (ctx.seenLinkPairs.has(pairKey)) {
      skipped.questionLinks += 1;
      continue;
    }
    ctx.seenLinkPairs.add(pairKey);

    // 既有链接可能以相反顺序存储，两向都查一次，避免重复插入
    const existing = (await db('question_links')
      .where({ user_id: userId })
      .where((builder) => {
        builder
          .where({ question_a_id: lowId, question_b_id: highId })
          .orWhere({ question_a_id: highId, question_b_id: lowId });
      })
      .first()) as { id?: number } | undefined;
    if (existing && existing.id !== undefined) {
      skipped.questionLinks += 1;
      continue;
    }

    await writer.insert('question_links', {
      user_id: userId,
      question_a_id: aId,
      question_b_id: bId,
      link_type: link.type,
      created_at: new Date(),
    });
    created.questionLinks += 1;
  }

  // 7) Offer 决策
  for (const o of data.offers ?? []) {
    const key = offerKey(o.company, o.role);
    if (seen.offerKeys.has(key)) {
      skipped.offers += 1;
      continue;
    }
    seen.offerKeys.add(key);

    const appId = o.appExternalId ? appIdByExt.get(o.appExternalId) ?? null : null;
    await writer.insert('offers', {
      user_id: userId,
      app_id: appId,
      company: o.company,
      role: o.role,
      city: o.city,
      base_salary: o.baseSalary,
      salary_months: o.salaryMonths,
      bonus_months: o.bonusMonths,
      sign_bonus: o.signBonus,
      equity_value: o.equityValue,
      equity_years: o.equityYears,
      allowance: o.allowance,
      fund_rate: o.fundRate,
      deadline: o.deadline ?? null,
      weights: toJson(o.weights, '{}')!,
      scores: toJson(o.scores, '{}')!,
      top_concern: o.topConcern,
      notice_period: o.noticePeriod,
      non_compete: o.nonCompete,
      social_security: o.socialSecurity,
      note: o.note,
      created_at: o.createdAt ? parseTimestamp(o.createdAt) : new Date(),
      updated_at: new Date(),
    });
    created.offers += 1;
  }

  // 8) 周复盘（user_id + week_start 唯一）
  for (const w of data.weeklyReviews ?? []) {
    if (seen.weeklyKeys.has(w.weekStart)) {
      skipped.weeklyReviews += 1;
      continue;
    }
    seen.weeklyKeys.add(w.weekStart);
    await writer.insert('weekly_reviews', {
      user_id: userId,
      week_start: w.weekStart,
      apply_override: w.applyOverride ?? null,
      interview_override: w.interviewOverride ?? null,
      offer_override: w.offerOverride ?? null,
      did_right: w.didRight,
      did_wrong: w.didWrong,
      next_plan: w.nextPlan,
      created_at: new Date(),
      updated_at: new Date(),
    });
    created.weeklyReviews += 1;
  }

  // 9) 打卡（user_id + checkin_date 唯一）
  for (const c of data.checkins ?? []) {
    if (seen.checkinKeys.has(c.checkinDate)) {
      skipped.checkins += 1;
      continue;
    }
    seen.checkinKeys.add(c.checkinDate);
    await writer.insert('checkins', {
      user_id: userId,
      checkin_date: c.checkinDate,
      created_at: new Date(),
    });
    created.checkins += 1;
  }

  // 10) 路线图任务勾选：按 (stageOrder, title) 定位模板任务就地更新，不新建阶段/任务
  for (const [index, t] of (data.roadmapTasks ?? []).entries()) {
    const row = (await db('roadmap_tasks')
      .join('roadmap_stages', 'roadmap_tasks.stage_id', 'roadmap_stages.id')
      .where('roadmap_tasks.user_id', userId)
      .where('roadmap_stages.user_id', userId)
      .where('roadmap_stages.stage_order', t.stageOrder)
      .where('roadmap_tasks.title', t.title)
      .select('roadmap_tasks.id as id')
      .first()) as { id?: number | string } | undefined;

    if (!row || row.id === undefined) {
      skipped.roadmapTasks += 1;
      warnings.push(
        `roadmapTasks[${index}] 未找到模板任务（stageOrder=${t.stageOrder}, title=${t.title}），已跳过`,
      );
      continue;
    }
    await writer.update(
      'roadmap_tasks',
      { id: Number(row.id) },
      {
        done: t.done,
        done_at: t.done ? (t.doneAt ? parseTimestamp(t.doneAt) : new Date()) : null,
      },
    );
    updated.roadmapTasks += 1;
  }
}

/** 关联解析：外部 id 必须能在本次 data 内找到，否则记错误并整体拒绝。 */
function resolveRelations(data: ImportData): ImportError[] {
  const errors: ImportError[] = [];

  const resumeExtIds = new Set((data.resumes ?? []).map((r) => r.externalId).filter(Boolean));
  const appExtIds = new Set((data.apps ?? []).map((a) => a.externalId).filter(Boolean));
  const questionExtIds = new Set<string>();
  for (const interview of data.interviews ?? []) {
    for (const q of interview.questions ?? []) {
      if (q.externalId) questionExtIds.add(q.externalId);
    }
  }

  (data.apps ?? []).forEach((a, index) => {
    if (a.resumeExternalId && !resumeExtIds.has(a.resumeExternalId)) {
      errors.push({
        path: `data.apps[${index}].resumeExternalId`,
        message: `data.resumes 中不存在 externalId「${a.resumeExternalId}」`,
      });
    }
  });

  (data.interviews ?? []).forEach((it, index) => {
    if (it.appExternalId && !appExtIds.has(it.appExternalId)) {
      errors.push({
        path: `data.interviews[${index}].appExternalId`,
        message: `data.apps 中不存在 externalId「${it.appExternalId}」`,
      });
    }
  });

  (data.offers ?? []).forEach((o, index) => {
    if (o.appExternalId && !appExtIds.has(o.appExternalId)) {
      errors.push({
        path: `data.offers[${index}].appExternalId`,
        message: `data.apps 中不存在 externalId「${o.appExternalId}」`,
      });
    }
  });

  (data.questionAnalyses ?? []).forEach((a, index) => {
    if (!questionExtIds.has(a.interviewQuestionExternalId)) {
      errors.push({
        path: `data.questionAnalyses[${index}].interviewQuestionExternalId`,
        message: `data.interviews[].questions[] 中不存在 externalId「${a.interviewQuestionExternalId}」`,
      });
    }
  });

  (data.questionLinks ?? []).forEach((link, index) => {
    for (const [field, value] of [
      ['aExternalId', link.aExternalId],
      ['bExternalId', link.bExternalId],
    ] as const) {
      if (!questionExtIds.has(value)) {
        errors.push({
          path: `data.questionLinks[${index}].${field}`,
          message: `data.interviews[].questions[] 中不存在 externalId「${value}」`,
        });
      }
    }
  });

  return errors;
}

function isEmptyData(data: ImportData): boolean {
  return (
    !data.profile &&
    (data.resumes ?? []).length === 0 &&
    (data.apps ?? []).length === 0 &&
    (data.interviews ?? []).length === 0 &&
    (data.questionAnalyses ?? []).length === 0 &&
    (data.questionLinks ?? []).length === 0 &&
    (data.offers ?? []).length === 0 &&
    (data.weeklyReviews ?? []).length === 0 &&
    (data.checkins ?? []).length === 0 &&
    (data.roadmapTasks ?? []).length === 0
  );
}

/**
 * 执行导入。
 * - errors 非空 → 不写库（调用方按 422 返回）；
 * - dryRun → 走与真实写入完全相同的分支逻辑，但 writer 为空实现（只读），库不变。
 */
export async function runImport(userId: number, payload: ImportRequest): Promise<ImportResult> {
  const { mode, dryRun, data } = payload;
  const created = zeroStats();
  const updated = zeroStats();
  const skipped = zeroStats();
  const warnings: string[] = [];

  if (isEmptyData(data)) {
    return {
      mode,
      dryRun,
      created,
      updated,
      skipped,
      errors: [{ path: 'data', message: '未提供任何可导入数据' }],
      warnings,
    };
  }

  const relationErrors = resolveRelations(data);
  if (relationErrors.length > 0) {
    return { mode, dryRun, created, updated, skipped, errors: relationErrors, warnings };
  }

  const existing = mode === 'replace' ? emptyExisting() : await loadExisting(userId);

  const ctx: WorkContext = {
    userId,
    data,
    writer: makeDryWriter(),
    created,
    updated,
    skipped,
    warnings,
    seen: cloneExisting(existing),
    seenLinkPairs: new Set<string>(),
  };

  if (dryRun) {
    await applySections(ctx);
    return { mode, dryRun, created, updated, skipped, errors: [], warnings };
  }

  let cleared: Record<string, number> | undefined;
  await db.transaction(async (trx) => {
    if (mode === 'replace') {
      const counts: Record<string, number> = {};
      for (const table of CLEAR_ORDER) {
        const deleted = await trx(table).where({ user_id: userId }).del();
        counts[table] = Number(deleted ?? 0);
      }
      cleared = counts;
      // 清空后既有键失效，仅保留 payload 内部去重
      ctx.seen = emptyExisting();
      ctx.seenLinkPairs = new Set<string>();
    }
    ctx.writer = makeRealWriter(trx);
    await applySections(ctx);
  });

  return { mode, dryRun, created, updated, skipped, cleared, errors: [], warnings };
}

/** 复制既有键集合：去重集合会在写入过程中被更新，不能污染原对象。 */
function cloneExisting(source: ExistingState): ExistingState {
  return {
    profileExists: source.profileExists,
    resumeKeys: new Set(source.resumeKeys),
    appKeys: new Set(source.appKeys),
    appIdByKey: new Map(source.appIdByKey),
    interviewKeys: new Set(source.interviewKeys),
    interviewIdByKey: new Map(source.interviewIdByKey),
    offerKeys: new Set(source.offerKeys),
    weeklyKeys: new Set(source.weeklyKeys),
    checkinKeys: new Set(source.checkinKeys),
  };
}
