/**
 * 岗位池 service：11 态状态机 + 流转时间轴（app_events）+ 6 阶段组统计。
 * 状态变更必须事务写 app_events，前端不得直改 status。
 */
import type { Knex } from 'knex';
import { db } from '../db';
import { notFound } from '../lib/http';
import { todayStr, addDays } from '../lib/date';
import {
  APP_STATUSES,
  APP_STATUS_LABELS,
  STAGE_GROUPS,
  STATUS_TO_GROUP,
  type AppStatus,
} from '../constants';
import type { AppEventRow, AppRow, Paginated } from '../types';

export interface AppCreateInput {
  company: string;
  role: string;
  channel: string;
  city: string;
  work_mode: string;
  salary_min: number;
  salary_max: number;
  interest: number;
  jd_url: string;
  applied_at?: string | null;
  resume_id?: number | null;
  contact_name: string;
  contact_role: string;
  contact_info: string;
  status: AppStatus;
  next_action: string;
  next_action_at?: string | null;
  need_bg_check: boolean;
  need_leave: boolean;
  note: string;
}

export interface AppFilters {
  status?: string;
  channel?: string;
  interest?: number;
  overdue?: boolean;
  q?: string;
}

function groupStatuses(status: string): AppStatus[] {
  const group = STAGE_GROUPS.find((g) => g.key === status);
  if (group) return [...group.statuses];
  if ((APP_STATUSES as readonly string[]).includes(status)) return [status as AppStatus];
  return [];
}

async function insertEvent(
  trx: { insert: (values: unknown) => Promise<unknown> },
  appId: number,
  userId: number,
  fromStatus: string,
  toStatus: string,
  source: string,
): Promise<void> {
  await trx.insert({
    app_id: appId,
    user_id: userId,
    from_status: fromStatus,
    to_status: toStatus,
    source,
    at: new Date(),
  });
}

export async function createApp(userId: number, input: AppCreateInput): Promise<AppRow> {
  const appliedAt = input.applied_at ?? (input.status !== 'pending' ? todayStr() : null);

  const created = await db.transaction(async (trx) => {
    const [id] = await trx('apps').insert({
      user_id: userId,
      company: input.company,
      role: input.role,
      channel: input.channel,
      city: input.city,
      work_mode: input.work_mode,
      salary_min: input.salary_min,
      salary_max: input.salary_max,
      interest: input.interest,
      jd_url: input.jd_url,
      applied_at: appliedAt,
      resume_id: input.resume_id ?? null,
      contact_name: input.contact_name,
      contact_role: input.contact_role,
      contact_info: input.contact_info,
      status: input.status,
      next_action: input.next_action,
      next_action_at: input.next_action_at ?? null,
      need_bg_check: input.need_bg_check,
      need_leave: input.need_leave,
      note: input.note,
      created_at: new Date(),
      updated_at: new Date(),
    });

    if (input.status !== 'pending') {
      await insertEvent(trx, Number(id), userId, 'pending', input.status, 'manual');
    }
    return id;
  });

  return (await db<AppRow>('apps').where({ id: Number(created) }).first())!;
}

export async function getApp(userId: number, id: number): Promise<{ app: AppRow; events: AppEventRow[] }> {
  const app = await db<AppRow>('apps').where({ id, user_id: userId }).whereNull('deleted_at').first();
  if (!app) throw notFound('岗位不存在');

  const events = await db<AppEventRow>('app_events')
    .where({ app_id: id, user_id: userId })
    .orderBy('at', 'asc');
  return { app, events };
}

export async function updateApp(userId: number, id: number, patch: Partial<AppCreateInput>): Promise<AppRow> {
  const existing = await db<AppRow>('apps').where({ id, user_id: userId }).whereNull('deleted_at').first();
  if (!existing) throw notFound('岗位不存在');

  // 状态不可经 PUT 直改，必须走 PATCH /status（写时间轴）
  const data: Record<string, unknown> = { updated_at: new Date() };
  const map: Record<string, keyof AppCreateInput> = {
    company: 'company',
    role: 'role',
    channel: 'channel',
    city: 'city',
    work_mode: 'work_mode',
    salary_min: 'salary_min',
    salary_max: 'salary_max',
    interest: 'interest',
    jd_url: 'jd_url',
    resume_id: 'resume_id',
    contact_name: 'contact_name',
    contact_role: 'contact_role',
    contact_info: 'contact_info',
    next_action: 'next_action',
    need_bg_check: 'need_bg_check',
    need_leave: 'need_leave',
    note: 'note',
  };
  for (const [dbCol, inputKey] of Object.entries(map)) {
    if (patch[inputKey] !== undefined) data[dbCol] = patch[inputKey];
  }
  if (patch.applied_at !== undefined) data.applied_at = patch.applied_at ?? null;
  if (patch.next_action_at !== undefined) data.next_action_at = patch.next_action_at ?? null;

  await db('apps').where({ id }).update(data);
  return (await db<AppRow>('apps').where({ id }).first())!;
}

export async function changeStatus(
  userId: number,
  id: number,
  toStatus: AppStatus,
  source = 'manual',
): Promise<{ app: AppRow; event: AppEventRow }> {
  const app = await db<AppRow>('apps').where({ id, user_id: userId }).whereNull('deleted_at').first();
  if (!app) throw notFound('岗位不存在');

  if (app.status === toStatus) {
    return { app, event: (await db<AppEventRow>('app_events').where({ app_id: id }).orderBy('at', 'desc').first())! };
  }

  const now = new Date();
  await db.transaction(async (trx) => {
    await trx('app_events').insert({
      app_id: id,
      user_id: userId,
      from_status: app.status,
      to_status: toStatus,
      source,
      at: now,
    });

    const update: Record<string, unknown> = { status: toStatus, updated_at: now };
    // 离开 pending 且尚无投递日期 → 记录投递日期
    if (app.status === 'pending' && toStatus !== 'pending' && !app.applied_at) {
      update.applied_at = todayStr();
    }
    await trx('apps').where({ id }).update(update);
  });

  const updated = (await db<AppRow>('apps').where({ id }).first())!;
  const event = (await db<AppEventRow>('app_events').where({ app_id: id }).orderBy('at', 'desc').first())!;
  return { app: updated, event };
}

export async function deleteApp(userId: number, id: number): Promise<void> {
  const app = await db<AppRow>('apps').where({ id, user_id: userId }).whereNull('deleted_at').first();
  if (!app) throw notFound('岗位不存在');
  await db('apps').where({ id }).update({ deleted_at: new Date(), updated_at: new Date() });
}

export async function listApps(userId: number, filters: AppFilters, page = 1, pageSize = 20): Promise<Paginated<AppRow>> {
  const statuses = filters.status ? groupStatuses(filters.status) : [];

  function applyFilters(query: Knex.QueryBuilder): Knex.QueryBuilder {
    let q = query;
    if (statuses.length > 0) q = q.whereIn('status', statuses);
    if (filters.channel) q = q.where('channel', filters.channel);
    if (filters.interest) q = q.where('interest', filters.interest);
    if (filters.overdue) {
      const today = todayStr();
      q = q.where((b) => {
        b.where('next_action_at', '<', today).orWhere(function nested() {
          this.where('status', 'applied').where('applied_at', '<=', addDays(today, -7));
        });
      });
    }
    if (filters.q) {
      const kw = `%${filters.q}%`;
      q = q.where((b) => {
        b.where('company', 'like', kw).orWhere('role', 'like', kw);
      });
    }
    return q;
  }

  const baseQuery = (): Knex.QueryBuilder => db('apps').where({ user_id: userId }).whereNull('deleted_at');

  const totalRow = await applyFilters(baseQuery()).count('* as c').first();
  const total = Number(totalRow?.c ?? 0);

  const items = await applyFilters(baseQuery())
    .select('*')
    .orderBy([{ column: 'updated_at', order: 'desc' }, { column: 'id', order: 'desc' }])
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  return { items: items as AppRow[], total, page, pageSize };
}

export interface BoardStat {
  group: string;
  count: number;
}

export async function boardStats(userId: number): Promise<BoardStat[]> {
  const rows = (await db('apps')
    .where({ user_id: userId })
    .whereNull('deleted_at')
    .select('status')
    .groupBy('status')
    .count('* as c')) as unknown as { status: string; c: number | string }[];

  const countByStatus = new Map<string, number>();
  rows.forEach((r) => {
    countByStatus.set(r.status, Number(r.c));
  });

  return STAGE_GROUPS.map((group) => ({
    group: group.label,
    count: group.statuses.reduce((acc, s) => acc + (countByStatus.get(s) ?? 0), 0),
  }));
}

export { APP_STATUS_LABELS, STATUS_TO_GROUP };
