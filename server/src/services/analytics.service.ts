/**
 * 数据复盘 service：漏斗/趋势/渠道/卡点/7 指标/周复盘。
 * 统计单一事实源：全部从 apps/interviews/offers/checkins 实时计算，
 * 唯一例外 weekly_reviews.*_override（用户手工改数）。
 */
import { db } from '../db';
import { badRequest, notFound } from '../lib/http';
import {
  ACTIVE_STATUSES,
  APP_STATUS_LABELS,
  FUNNEL_INTERVIEW_STATUSES,
  FUNNEL_WRITTEN_STATUSES,
  STAGE_GROUPS,
  STALL_THRESHOLD_DAYS,
  STATUS_TO_GROUP,
  type AppStatus,
  type WeaknessCode,
} from '../constants';
import {
  addDays,
  currentWeekStart,
  dateOfTimestamp,
  daysSince,
  todayStr,
  weekStart,
} from '../lib/date';
import { getWeaknesses } from './qbank.service';
import type { AppRow, OfferRow, WeeklyReviewRow } from '../types';

// ---------- 里程碑（由 app_events + 当前状态推导） ----------

interface AppMilestone {
  app: AppRow;
  applied: boolean;
  written: boolean;
  interview: boolean;
  offer: boolean;
  applyDate: string | null;
}

async function loadAppMilestones(userId: number): Promise<AppMilestone[]> {
  const apps = await db<AppRow>('apps').where({ user_id: userId }).whereNull('deleted_at');
  const events = await db('app_events').where({ user_id: userId }).select('app_id', 'to_status', 'at');

  const eventsByApp = new Map<number, { to_status: string; at: string | Date }[]>();
  for (const e of events) {
    if (!eventsByApp.has(e.app_id)) eventsByApp.set(e.app_id, []);
    eventsByApp.get(e.app_id)!.push(e);
  }

  return apps.map((app) => {
    const evs = eventsByApp.get(app.id) ?? [];
    const toStatuses = evs.map((e) => e.to_status);
    const applied = app.status !== 'pending' || toStatuses.some((s) => s !== 'pending');
    const written =
      (FUNNEL_WRITTEN_STATUSES as string[]).includes(app.status) ||
      toStatuses.some((s) => (FUNNEL_WRITTEN_STATUSES as string[]).includes(s));
    const interview =
      (FUNNEL_INTERVIEW_STATUSES as string[]).includes(app.status) ||
      toStatuses.some((s) => (FUNNEL_INTERVIEW_STATUSES as string[]).includes(s));
    const offer = app.status === 'offer' || toStatuses.includes('offer');

    let applyDate: string | null = app.applied_at;
    if (!applyDate) {
      const firstNonPending = evs
        .filter((e) => e.to_status !== 'pending')
        .sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime())[0];
      applyDate = firstNonPending ? dateOfTimestamp(firstNonPending.at) : null;
    }

    return { app, applied, written, interview, offer, applyDate };
  });
}

// ---------- 漏斗 ----------

export interface FunnelData {
  applied: number;
  written: number;
  interview: number;
  offer: number;
  applied_to_written_rate: number | null;
  written_to_interview_rate: number | null;
  interview_to_offer_rate: number | null;
}

function rate(numerator: number, denominator: number): number | null {
  if (denominator === 0) return null;
  return Math.round((numerator / denominator) * 1000) / 10; // 百分比，1 位小数
}

export async function getFunnel(userId: number): Promise<FunnelData> {
  const milestones = await loadAppMilestones(userId);
  const applied = milestones.filter((m) => m.applied).length;
  const written = milestones.filter((m) => m.written).length;
  const interview = milestones.filter((m) => m.interview).length;
  const offer = milestones.filter((m) => m.offer).length;

  return {
    applied,
    written,
    interview,
    offer,
    applied_to_written_rate: rate(written, applied),
    written_to_interview_rate: rate(interview, written),
    interview_to_offer_rate: rate(offer, interview),
  };
}

// ---------- 趋势 ----------

export interface TrendPoint {
  label: string;
  apply: number;
  interview: number;
  offer: number;
}

export async function getTrend(userId: number, lookbackWeeks = 12): Promise<TrendPoint[]> {
  const milestones = await loadAppMilestones(userId);

  const interviews = await db('interviews')
    .where({ user_id: userId })
    .whereNull('deleted_at')
    .select('scheduled_at', 'created_at');
  const offers = await db<OfferRow>('offers')
    .where({ user_id: userId })
    .whereNull('deleted_at')
    .select('created_at');

  const dates: string[] = [];
  milestones.forEach((m) => {
    if (m.applyDate) dates.push(m.applyDate);
  });
  interviews.forEach((iv: { scheduled_at: string | null; created_at: string | Date }) => {
    dates.push(iv.scheduled_at ?? dateOfTimestamp(iv.created_at));
  });
  offers.forEach((o: { created_at: string | Date }) => dates.push(dateOfTimestamp(o.created_at)));
  const validDates = dates.filter((d) => d && /^\d{4}-\d{2}-\d{2}$/.test(d));
  const minDate = validDates.length > 0 ? validDates.sort()[0] : addDays(currentWeekStart(), -7 * (lookbackWeeks - 1));

  const startWeek = weekStart(minDate);
  const endWeek = currentWeekStart();
  const weeks: string[] = [];
  let cursor = startWeek;
  let guard = 0;
  while (cursor <= endWeek && guard < 200) {
    weeks.push(cursor);
    cursor = addDays(cursor, 7);
    guard += 1;
  }

  const appliesByWeek = new Map<string, number>();
  milestones.forEach((m) => {
    if (m.applyDate) {
      const ws = weekStart(m.applyDate);
      appliesByWeek.set(ws, (appliesByWeek.get(ws) ?? 0) + 1);
    }
  });
  const interviewsByWeek = new Map<string, number>();
  interviews.forEach((iv: { scheduled_at: string | null; created_at: string | Date }) => {
    const d = iv.scheduled_at ?? dateOfTimestamp(iv.created_at);
    if (d) {
      const ws = weekStart(d);
      interviewsByWeek.set(ws, (interviewsByWeek.get(ws) ?? 0) + 1);
    }
  });
  const offersByWeek = new Map<string, number>();
  offers.forEach((o: { created_at: string | Date }) => {
    const ws = weekStart(dateOfTimestamp(o.created_at));
    offersByWeek.set(ws, (offersByWeek.get(ws) ?? 0) + 1);
  });

  // overrides
  const overrides = await db<WeeklyReviewRow>('weekly_reviews').where({ user_id: userId });
  const overrideByWeek = new Map(overrides.map((o) => [o.week_start, o]));

  let cumulativeOffers = 0;
  return weeks.map((ws) => {
    cumulativeOffers += offersByWeek.get(ws) ?? 0;
    const ov = overrideByWeek.get(ws);
    return {
      label: ws,
      apply: ov?.apply_override ?? appliesByWeek.get(ws) ?? 0,
      interview: ov?.interview_override ?? interviewsByWeek.get(ws) ?? 0,
      offer: ov?.offer_override ?? cumulativeOffers,
    };
  });
}

export async function updateTrend(
  userId: number,
  weekStartDate: string,
  patch: { apply?: number | null; interview?: number | null; offer?: number | null },
): Promise<WeeklyReviewRow> {
  const existing = await db<WeeklyReviewRow>('weekly_reviews')
    .where({ user_id: userId, week_start: weekStartDate })
    .first();

  const data: Record<string, unknown> = { updated_at: new Date() };
  if (patch.apply !== undefined) data.apply_override = patch.apply;
  if (patch.interview !== undefined) data.interview_override = patch.interview;
  if (patch.offer !== undefined) data.offer_override = patch.offer;

  if (existing) {
    await db('weekly_reviews').where({ id: existing.id }).update(data);
  } else {
    await db('weekly_reviews').insert({
      user_id: userId,
      week_start: weekStartDate,
      apply_override: patch.apply ?? null,
      interview_override: patch.interview ?? null,
      offer_override: patch.offer ?? null,
      did_right: '',
      did_wrong: '',
      next_plan: '',
    });
  }
  return (await db<WeeklyReviewRow>('weekly_reviews').where({ user_id: userId, week_start: weekStartDate }).first())!;
}

// ---------- 渠道效果 ----------

export interface ChannelStat {
  channel: string;
  applied: number;
  interviews: number;
  offers: number;
  rate: number; // 面试率 %（1 位小数）
}

export async function getChannels(userId: number): Promise<ChannelStat[]> {
  const milestones = await loadAppMilestones(userId);
  const byChannel = new Map<string, { applied: number; interviews: number; offers: number }>();

  for (const m of milestones) {
    const channel = m.app.channel || '其他';
    if (!byChannel.has(channel)) byChannel.set(channel, { applied: 0, interviews: 0, offers: 0 });
    const stat = byChannel.get(channel)!;
    if (m.applied) stat.applied += 1;
    if (m.interview) stat.interviews += 1;
    if (m.offer) stat.offers += 1;
  }

  const stats: ChannelStat[] = [...byChannel.entries()].map(([channel, s]) => ({
    channel,
    applied: s.applied,
    interviews: s.interviews,
    offers: s.offers,
    rate: rate(s.interviews, s.applied) ?? 0,
  }));

  stats.sort((a, b) => b.rate - a.rate);
  return stats;
}

// ---------- 卡点诊断 ----------

export async function getBottleneck(userId: number): Promise<{ title: string; detail: string }> {
  const funnel = await getFunnel(userId);

  const segments: { title: string; rate: number | null; detail: string }[] = [
    {
      title: '已投 → 笔试',
      rate: funnel.applied_to_written_rate,
      detail: '投递到笔试转化偏低：优先投与主投岗位高度匹配、JD 明确的岗位，并检查简历关键词命中。',
    },
    {
      title: '笔试 → 面试',
      rate: funnel.written_to_interview_rate,
      detail: '笔试到面试转化偏低：复盘笔试薄弱题型，补一轮专项练习。',
    },
    {
      title: '面试 → Offer',
      rate: funnel.interview_to_offer_rate,
      detail: '面试到 Offer 转化偏低：加强 STAR 复盘与量化表达，针对机检雷区逐项修正。',
    },
  ];

  const valid = segments.filter((s) => s.rate !== null);
  if (valid.length === 0) {
    return { title: '数据不足', detail: '投递与复盘数据积累后，会在此给出最弱环节建议。' };
  }
  const weakest = valid.reduce((a, b) => ((a.rate ?? 1) <= (b.rate ?? 1) ? a : b));
  return { title: weakest.title, detail: weakest.detail };
}

// ---------- 7 指标 ----------

export type IndicatorRange = 'week' | '7d' | '30d' | 'all';

function rangeBounds(range: IndicatorRange): { start?: string; end: string } {
  const today = todayStr();
  if (range === 'week') return { start: currentWeekStart(), end: today };
  if (range === '7d') return { start: addDays(today, -6), end: today };
  if (range === '30d') return { start: addDays(today, -29), end: today };
  return { start: undefined, end: today };
}

function inBounds(date: string | null, bounds: { start?: string; end: string }): boolean {
  if (!date) return false;
  if (bounds.start && date < bounds.start) return false;
  return date <= bounds.end;
}

export interface IndicatorItem {
  key: string;
  label: string;
  value: number;
  unit: string;
  note: string;
}

export async function getIndicators(userId: number, range: IndicatorRange): Promise<IndicatorItem[]> {
  const bounds = rangeBounds(range);
  const milestones = await loadAppMilestones(userId);

  const newApplies = milestones.filter((m) => m.applied && inBounds(m.applyDate, bounds)).length;
  const activeApps = milestones.filter(
    (m) => m.applied && (ACTIVE_STATUSES as string[]).includes(m.app.status) && m.app.status !== 'pending',
  ).length;

  const interviews = await db('interviews')
    .where({ user_id: userId })
    .whereNull('deleted_at')
    .select('scheduled_at', 'created_at', 'id');
  const interviewsInRange = interviews.filter((iv: { scheduled_at: string | null; created_at: string | Date }) =>
    inBounds(iv.scheduled_at ?? dateOfTimestamp(iv.created_at), bounds),
  ).length;

  const questionInterviewIds = new Set<number>();
  if (interviews.length > 0) {
    const qrows = await db('interview_questions')
      .where({ user_id: userId })
      .whereIn('interview_id', interviews.map((i: { id: number }) => i.id))
      .select('interview_id');
    qrows.forEach((q: { interview_id: number }) => questionInterviewIds.add(q.interview_id));
  }
  const reviewSessions = interviews.filter(
    (iv: { id: number; scheduled_at: string | null; created_at: string | Date }) =>
      questionInterviewIds.has(iv.id) && inBounds(iv.scheduled_at ?? dateOfTimestamp(iv.created_at), bounds),
  ).length;

  const stageDistribution = await getStageDistribution(userId);
  const stageTotal = stageDistribution.reduce((acc, g) => acc + g.count, 0);
  const stalled = (await getStalledApps(userId)).length;

  const weaknesses = await getWeaknesses(userId);
  const patternWeaknesses = weaknesses.filter((i) => i.level === 'pattern').length;

  return [
    { key: 'new_applies', label: '本期新增投递', value: newApplies, unit: '', note: '当前时间范围内新进入投递的岗位' },
    { key: 'active_apps', label: '进行中投递', value: activeApps, unit: '', note: '已投且未关闭的岗位' },
    { key: 'interviews_in_range', label: '本期面试', value: interviewsInRange, unit: '', note: '当前时间范围内的面试' },
    { key: 'stage_distribution', label: '各阶段分布', value: stageTotal, unit: '', note: '6 阶段组分布（可下钻）' },
    { key: 'stalled', label: '停滞超阈值', value: stalled, unit: '', note: '超过各状态阈值未更新的岗位' },
    { key: 'review_sessions', label: '复盘场次', value: reviewSessions, unit: '', note: '已录入题目的面试场次' },
    { key: 'pattern_weaknesses', label: '模式级弱点数', value: patternWeaknesses, unit: '', note: '≥2 场次命中的弱点' },
  ];
}

async function getStageDistribution(userId: number): Promise<{ key: string; label: string; count: number }[]> {
  const rows = (await db('apps')
    .where({ user_id: userId })
    .whereNull('deleted_at')
    .select('status')
    .groupBy('status')
    .count('* as c')) as unknown as { status: string; c: number | string }[];
  const countByStatus = new Map<string, number>();
  rows.forEach((r) => countByStatus.set(r.status, Number(r.c)));
  return STAGE_GROUPS.map((g) => ({
    key: g.key,
    label: g.label,
    count: g.statuses.reduce((acc, s) => acc + (countByStatus.get(s) ?? 0), 0),
  }));
}

export interface StalledApp extends AppRow {
  last_activity: string;
  stalled_days: number;
}

async function getStalledApps(userId: number): Promise<StalledApp[]> {
  const milestones = await loadAppMilestones(userId);
  const events = await db('app_events').where({ user_id: userId }).select('app_id', 'at');
  const lastEventByApp = new Map<number, string>();
  for (const e of events) {
    const d = dateOfTimestamp(e.at);
    const prev = lastEventByApp.get(e.app_id);
    if (!prev || d > prev) lastEventByApp.set(e.app_id, d);
  }

  const result: StalledApp[] = [];
  for (const m of milestones) {
    const status = m.app.status as AppStatus;
    if (!(ACTIVE_STATUSES as string[]).includes(status)) continue;
    const lastActivity = lastEventByApp.get(m.app.id) ?? dateOfTimestamp(m.app.updated_at) ?? dateOfTimestamp(m.app.created_at);
    const stalledDays = daysSince(lastActivity);
    const threshold = STALL_THRESHOLD_DAYS[status] ?? 14;
    if (stalledDays > threshold) {
      result.push({ ...m.app, last_activity: lastActivity, stalled_days: stalledDays });
    }
  }
  result.sort((a, b) => b.stalled_days - a.stalled_days);
  return result;
}

// ---------- 指标下钻 ----------

export async function getIndicatorDrilldown(
  userId: number,
  key: string,
  range: IndicatorRange,
): Promise<unknown[]> {
  const bounds = rangeBounds(range);
  const milestones = await loadAppMilestones(userId);

  if (key === 'new_applies') {
    return milestones
      .filter((m) => m.applied && inBounds(m.applyDate, bounds))
      .map((m) => ({ id: m.app.id, company: m.app.company, role: m.app.role, applied_at: m.applyDate, status: m.app.status }));
  }
  if (key === 'active_apps') {
    return milestones
      .filter((m) => m.applied && (ACTIVE_STATUSES as string[]).includes(m.app.status) && m.app.status !== 'pending')
      .map((m) => ({ id: m.app.id, company: m.app.company, role: m.app.role, status: m.app.status }));
  }
  if (key === 'stalled') {
    return getStalledApps(userId);
  }
  if (key === 'interviews_in_range' || key === 'review_sessions') {
    const interviews = await db('interviews')
      .where({ user_id: userId })
      .whereNull('deleted_at')
      .select('id', 'company', 'role', 'round', 'scheduled_at', 'created_at');
    let list = interviews.filter((iv: { scheduled_at: string | null; created_at: string | Date }) =>
      inBounds(iv.scheduled_at ?? dateOfTimestamp(iv.created_at), bounds),
    );
    if (key === 'review_sessions') {
      const withQuestions = await db('interview_questions')
        .where({ user_id: userId })
        .select('interview_id')
        .distinct();
      const ids = new Set(withQuestions.map((q: { interview_id: number }) => q.interview_id));
      list = list.filter((iv: { id: number }) => ids.has(iv.id));
    }
    return list;
  }
  if (key === 'pattern_weaknesses') {
    const weaknesses = await getWeaknesses(userId);
    return weaknesses.filter((w) => w.level === 'pattern');
  }
  if (key === 'stage_distribution') {
    return getStageDistribution(userId);
  }
  throw badRequest('未知指标 key');
}

// ---------- 周复盘 ----------

export async function listWeeklyReviews(userId: number): Promise<WeeklyReviewRow[]> {
  return db<WeeklyReviewRow>('weekly_reviews')
    .where({ user_id: userId })
    .orderBy('week_start', 'desc');
}

export async function upsertWeeklyReview(
  userId: number,
  weekStartDate: string,
  body: { did_right: string; did_wrong: string; next_plan: string },
): Promise<WeeklyReviewRow> {
  const existing = await db<WeeklyReviewRow>('weekly_reviews')
    .where({ user_id: userId, week_start: weekStartDate })
    .first();
  if (existing) {
    await db('weekly_reviews').where({ id: existing.id }).update({
      did_right: body.did_right,
      did_wrong: body.did_wrong,
      next_plan: body.next_plan,
      updated_at: new Date(),
    });
  } else {
    await db('weekly_reviews').insert({
      user_id: userId,
      week_start: weekStartDate,
      did_right: body.did_right,
      did_wrong: body.did_wrong,
      next_plan: body.next_plan,
    });
  }
  return (await db<WeeklyReviewRow>('weekly_reviews').where({ user_id: userId, week_start: weekStartDate }).first())!;
}

export { APP_STATUS_LABELS, STATUS_TO_GROUP };
