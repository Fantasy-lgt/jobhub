/**
 * 求职定位 + 简历版本 service。
 * 简历命中率不落库，由 apps/interviews 源表实时计算。
 */
import { db, toJson } from '../db';
import { badRequest, notFound } from '../lib/http';
import { INTERVIEW_STATUSES } from '../constants';
import type { ProfileRow, ResumeRow } from '../types';

export interface ProfileInput {
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
  strengths: { tag: string; evidence: string }[];
  gaps: { gap: string; action: string }[];
}

export function defaultProfile(userId: number): ProfileRow {
  return {
    user_id: userId,
    self_intro: '',
    primary_role: '',
    backup_roles: [],
    industries: [],
    company_types: [],
    cities: [],
    current_salary_base: 0,
    current_salary_months: 12,
    expect_floor: 0,
    expect_target: 0,
    strengths: [],
    gaps: [],
    updated_at: new Date(),
  };
}

export async function getProfile(userId: number): Promise<ProfileRow> {
  const row = await db<ProfileRow>('profiles').where({ user_id: userId }).first();
  return row ?? defaultProfile(userId);
}

export async function upsertProfile(userId: number, input: ProfileInput): Promise<ProfileRow> {
  if (input.expect_target > 0 && input.expect_floor > input.expect_target) {
    throw badRequest('期望底线不能高于期望目标');
  }

  const data = {
    user_id: userId,
    self_intro: input.self_intro,
    primary_role: input.primary_role,
    backup_roles: toJson(input.backup_roles, '[]')!,
    industries: toJson(input.industries, '[]')!,
    company_types: toJson(input.company_types, '[]')!,
    cities: toJson(input.cities, '[]')!,
    current_salary_base: input.current_salary_base,
    current_salary_months: input.current_salary_months,
    expect_floor: input.expect_floor,
    expect_target: input.expect_target,
    strengths: toJson(input.strengths, '[]')!,
    gaps: toJson(input.gaps, '[]')!,
    updated_at: new Date(),
  };

  const existing = await db<ProfileRow>('profiles').where({ user_id: userId }).first();
  if (existing) {
    await db('profiles').where({ user_id: userId }).update(data);
  } else {
    await db('profiles').insert(data);
  }
  return getProfile(userId);
}

// ---------- 简历版本 ----------

export interface ResumeWithHitRate extends ResumeRow {
  hit_rate: number | null; // 0-1；投递数为 0 时 null
  applied_count: number;
  interview_count: number;
}

/** 某版本是否「产生面试」：该投递关联了面试记录，或状态已进入面试阶段。 */
async function computeHitRates(userId: number, resumes: ResumeRow[]): Promise<ResumeWithHitRate[]> {
  if (resumes.length === 0) return [];

  const resumeIds = resumes.map((r) => r.id);
  const apps = await db('apps')
    .where({ user_id: userId })
    .whereNull('deleted_at')
    .whereIn('resume_id', resumeIds)
    .select('id', 'resume_id', 'status');

  const appIds = apps.map((a: { id: number }) => a.id);
  const interviewAppIds = new Set<number>();
  if (appIds.length > 0) {
    const interviews = await db('interviews')
      .where({ user_id: userId })
      .whereNull('deleted_at')
      .whereIn('app_id', appIds)
      .select('app_id');
    interviews.forEach((iv: { app_id: number | null }) => {
      if (iv.app_id) interviewAppIds.add(iv.app_id);
    });
  }

  const appliedByResume = new Map<number, number>();
  const interviewByResume = new Map<number, number>();
  for (const app of apps) {
    const rid = app.resume_id as number;
    if (!appliedByResume.has(rid)) appliedByResume.set(rid, 0);
    if (!interviewByResume.has(rid)) interviewByResume.set(rid, 0);
    // 已投递：离开 pending
    if (app.status !== 'pending') appliedByResume.set(rid, appliedByResume.get(rid)! + 1);
    // 产生面试：有面试记录 或 进入面试阶段
    const reachedInterview =
      interviewAppIds.has(app.id) || (INTERVIEW_STATUSES as string[]).includes(app.status);
    if (reachedInterview) interviewByResume.set(rid, interviewByResume.get(rid)! + 1);
  }

  return resumes.map((r) => {
    const applied = appliedByResume.get(r.id) ?? 0;
    const interviewed = interviewByResume.get(r.id) ?? 0;
    return {
      ...r,
      applied_count: applied,
      interview_count: interviewed,
      hit_rate: applied > 0 ? interviewed / applied : null,
    };
  });
}

export async function listResumes(userId: number): Promise<ResumeWithHitRate[]> {
  const resumes = await db<ResumeRow>('resumes')
    .where({ user_id: userId })
    .whereNull('deleted_at')
    .orderBy([{ column: 'is_primary', order: 'desc' }, { column: 'created_at', order: 'desc' }]);
  return computeHitRates(userId, resumes);
}

export async function createResume(userId: number, name: string, targetRole: string): Promise<ResumeRow> {
  const count = await db('resumes').where({ user_id: userId }).whereNull('deleted_at').count('* as c').first();
  const [id] = await db('resumes').insert({
    user_id: userId,
    name,
    target_role: targetRole,
    is_primary: Number(count?.c ?? 0) === 0, // 首个自动设为主用
  });
  const row = await db<ResumeRow>('resumes').where({ id }).first();
  return row!;
}

export async function updateResume(userId: number, id: number, patch: { name?: string; target_role?: string }): Promise<ResumeRow> {
  const row = await db<ResumeRow>('resumes').where({ id, user_id: userId }).whereNull('deleted_at').first();
  if (!row) throw notFound('简历版本不存在');
  await db('resumes').where({ id }).update({
    ...(patch.name !== undefined ? { name: patch.name } : {}),
    ...(patch.target_role !== undefined ? { target_role: patch.target_role } : {}),
  });
  return (await db<ResumeRow>('resumes').where({ id }).first())!;
}

export async function deleteResume(userId: number, id: number): Promise<void> {
  const row = await db<ResumeRow>('resumes').where({ id, user_id: userId }).whereNull('deleted_at').first();
  if (!row) throw notFound('简历版本不存在');
  await db('resumes').where({ id }).update({ deleted_at: new Date() });
}

export async function setPrimaryResume(userId: number, id: number): Promise<ResumeRow> {
  const row = await db<ResumeRow>('resumes').where({ id, user_id: userId }).whereNull('deleted_at').first();
  if (!row) throw notFound('简历版本不存在');

  await db.transaction(async (trx) => {
    await trx('resumes').where({ user_id: userId }).whereNull('deleted_at').update({ is_primary: false });
    await trx('resumes').where({ id }).update({ is_primary: true });
  });

  return (await db<ResumeRow>('resumes').where({ id }).first())!;
}
