/**
 * 概览 service：聚合接口（对齐前端 OverviewData 契约）。
 * 全部由源表实时计算，唯一例外 sprint.streak 由 checkins 推导。
 */
import { db } from '../db';
import { ACTIVE_STATUSES, INTERVIEW_STATUSES } from '../constants';
import { fenToKText } from '../lib/money';
import {
  addDays,
  currentWeekStart,
  dateOfTimestamp,
  prevWeekStart,
  todayStr,
  weekStart,
} from '../lib/date';

export type TodoType =
  | 'follow_up'
  | 'prepare_interview'
  | 'offer_deadline'
  | 'review_due'
  | 'checkin'
  | 'resume'
  | 'target';

export interface OverviewTodo {
  id: string;
  type: TodoType;
  title: string;
  note?: string;
  target_id?: string;
}

export interface OverviewMetrics {
  active: number;
  interviewing: number;
  offers: number;
  hit_rate: { rate: number; interviewed: number; applied: number };
}

export interface WeekCell {
  now: number;
  last: number;
}

export interface Streak {
  current: number;
  best: number;
}

export interface OverviewData {
  hero: { greeting: string; stage_label: string; slogan: string; today_tip: string };
  metrics: OverviewMetrics;
  todos: OverviewTodo[];
  week: { applications: WeekCell; interviews: WeekCell; reviews: WeekCell; checkins: WeekCell };
  sprint: { done: number; total: number; streak: Streak };
}

function greetingText(): string {
  const hour = new Date().getHours();
  if (hour < 5) return '夜深了';
  if (hour < 11) return '早上好，社招选手 👋';
  if (hour < 13) return '中午好，社招选手 👋';
  if (hour < 18) return '下午好，社招选手 👋';
  return '晚上好，社招选手 👋';
}

function computeStreak(dates: string[]): Streak {
  const set = new Set(dates.filter(Boolean));
  const sorted = [...set].sort();

  let best = 0;
  let cur = 0;
  let prev: string | null = null;
  for (const d of sorted) {
    if (prev && addDays(prev, 1) === d) cur += 1;
    else cur = 1;
    if (cur > best) best = cur;
    prev = d;
  }

  let current = 0;
  let cursor = todayStr();
  if (!set.has(cursor)) cursor = addDays(cursor, -1);
  while (set.has(cursor)) {
    current += 1;
    cursor = addDays(cursor, -1);
  }
  return { current, best };
}

export async function getOverview(userId: number): Promise<OverviewData> {
  const today = todayStr();
  const thisWeek = currentWeekStart();
  const lastWeek = prevWeekStart();

  // ---- 指标 ----
  const activeCountRow = await db('apps')
    .where({ user_id: userId })
    .whereNull('deleted_at')
    .whereIn('status', [...ACTIVE_STATUSES])
    .count('* as c')
    .first();
  const active = Number(activeCountRow?.c ?? 0);

  const interviewing = Number(
    (
      await db('apps')
        .where({ user_id: userId })
        .whereNull('deleted_at')
        .whereIn('status', [...INTERVIEW_STATUSES])
        .count('* as c')
        .first()
    )?.c ?? 0,
  );

  const offers = Number(
    (
      await db('offers')
        .where({ user_id: userId })
        .whereNull('deleted_at')
        .count('* as c')
        .first()
    )?.c ?? 0,
  );

  const apps = await db('apps')
    .where({ user_id: userId })
    .whereNull('deleted_at')
    .select('id', 'company', 'role', 'status', 'applied_at');
  const applied = apps.filter((a: { status: string }) => a.status !== 'pending').length;
  const interviewed = apps.filter((a: { status: string }) =>
    (INTERVIEW_STATUSES as string[]).includes(a.status),
  ).length;
  const hitRate = applied > 0 ? Math.round((interviewed / applied) * 100) : 0;

  // ---- 本周节奏 ----
  const appsThisWeek = apps.filter(
    (a: { applied_at: string | null }) => a.applied_at && weekStart(a.applied_at) === thisWeek,
  ).length;
  const appsLastWeek = apps.filter(
    (a: { applied_at: string | null }) => a.applied_at && weekStart(a.applied_at) === lastWeek,
  ).length;

  const interviews = await db('interviews')
    .where({ user_id: userId })
    .whereNull('deleted_at')
    .select('id', 'scheduled_at', 'created_at');

  const interviewDates = interviews.map(
    (iv: { scheduled_at: string | null; created_at: string | Date }) =>
      iv.scheduled_at ?? dateOfTimestamp(iv.created_at),
  );
  const interviewsThisWeek = interviewDates.filter((d: string) => d && weekStart(d) === thisWeek).length;
  const interviewsLastWeek = interviewDates.filter((d: string) => d && weekStart(d) === lastWeek).length;

  // 复盘场次 = 有 ≥1 题的面试，按面试日期分周
  const questionRows = await db('interview_questions')
    .where({ user_id: userId })
    .select('interview_id')
    .distinct();
  const reviewedInterviewIds = new Set(questionRows.map((q: { interview_id: number }) => q.interview_id));
  const reviewsThisWeek = interviews.filter(
    (iv: { id: number; scheduled_at: string | null; created_at: string | Date }) =>
      reviewedInterviewIds.has(iv.id) &&
      weekStart(iv.scheduled_at ?? dateOfTimestamp(iv.created_at)) === thisWeek,
  ).length;
  const reviewsLastWeek = interviews.filter(
    (iv: { id: number; scheduled_at: string | null; created_at: string | Date }) =>
      reviewedInterviewIds.has(iv.id) &&
      weekStart(iv.scheduled_at ?? dateOfTimestamp(iv.created_at)) === lastWeek,
  ).length;

  const checkinRows = await db('checkins').where({ user_id: userId }).select('checkin_date');
  const checkinDates = checkinRows.map((c: { checkin_date: string }) => c.checkin_date);
  const checkinsThisWeek = checkinDates.filter((d: string) => weekStart(d) === thisWeek).length;
  const checkinsLastWeek = checkinDates.filter((d: string) => weekStart(d) === lastWeek).length;

  // ---- 今天要做（≤6） ----
  const todos: OverviewTodo[] = [];

  const followUps = await db('apps')
    .where({ user_id: userId })
    .whereNull('deleted_at')
    .whereIn('status', [...ACTIVE_STATUSES])
    .where('applied_at', '<=', addDays(today, -7))
    .orderBy('applied_at', 'asc')
    .limit(6);
  followUps.forEach((a: { id: number; company: string; role: string; applied_at: string | null }) => {
    todos.push({
      id: `followup-${a.id}`,
      type: 'follow_up',
      title: `跟进「${a.company}」${a.role}`,
      note: a.applied_at ? `已投 ${Math.max(1, Math.floor((new Date(today).getTime() - new Date(a.applied_at).getTime()) / 86400000))} 天，该跟进了` : '该跟进了',
      target_id: String(a.id),
    });
  });

  const upcomingInterviews = await db('interviews')
    .where({ user_id: userId })
    .whereNull('deleted_at')
    .whereBetween('scheduled_at', [today, addDays(today, 3)])
    .orderBy('scheduled_at', 'asc')
    .limit(6);
  upcomingInterviews.forEach((iv: { id: number; company: string; role: string; round: string; scheduled_at: string | null }) => {
    todos.push({
      id: `interview-${iv.id}`,
      type: 'prepare_interview',
      title: `准备「${iv.company}」${iv.round}`,
      note: iv.scheduled_at ? `${iv.scheduled_at} · ${iv.role}` : iv.role,
      target_id: String(iv.id),
    });
  });

  const offerDeadlines = await db('offers')
    .where({ user_id: userId })
    .whereNull('deleted_at')
    .whereBetween('deadline', [today, addDays(today, 7)])
    .orderBy('deadline', 'asc')
    .limit(6);
  offerDeadlines.forEach((o: { id: number; company: string; role: string; deadline: string | null }) => {
    const days = o.deadline ? Math.floor((new Date(o.deadline).getTime() - new Date(today).getTime()) / 86400000) : null;
    todos.push({
      id: `offer-${o.id}`,
      type: 'offer_deadline',
      title: `「${o.company}」Offer 年包算清楚`,
      note: days === 0 ? '今天截止答复' : days ? `答复截止还有 ${days} 天` : undefined,
      target_id: String(o.id),
    });
  });

  const todayCheckin = await db('checkins').where({ user_id: userId, checkin_date: today }).first();
  if (!todayCheckin) {
    todos.push({
      id: 'checkin-today',
      type: 'checkin',
      title: '今日打卡',
      note: '完成任意 1 个任务即可打卡',
    });
  }

  // ---- 冲刺进度 ----
  const taskRows = await db('roadmap_tasks').where({ user_id: userId }).select('done');
  const sprintDone = taskRows.filter((t: { done: boolean }) => t.done).length;
  const sprintTotal = taskRows.length;
  const streak = computeStreak(checkinDates);

  // ---- hero ----
  let stageLabel: string;
  if (offers > 0) stageLabel = '收获期';
  else if (interviewing > 0 || interviews.length > 0) stageLabel = '冲刺期';
  else if (applied > 0) stageLabel = '冲刺期';
  else if (active === 0 && apps.length >= 3) stageLabel = '收尾期';
  else stageLabel = '蓄力期';

  const profile = await db('profiles').where({ user_id: userId }).first();
  const slogan = profile
    ? `${profile.primary_role || '目标岗位待定'} · 目标 ${fenToKText(Number(profile.expect_target) || 0)}/月 · ${
        (profile.cities && profile.cities.length > 0 ? profile.cities.join(' / ') : '城市待定')
      }`
    : '先花 5 分钟写下你的求职定位';

  const waiting = Number(
    (
      await db('apps')
        .where({ user_id: userId })
        .whereNull('deleted_at')
        .whereIn('status', ['applied', 'written'])
        .count('* as c')
        .first()
    )?.c ?? 0,
  );
  let todayTip: string;
  if (active === 0 && apps.length === 0) {
    todayTip = '先花 5 分钟写下你的求职定位，让每一份投递都更准。';
  } else if (applied === 0) {
    todayTip = `岗位池已有 ${active} 个机会，挑一个最匹配的开始投递。`;
  } else {
    todayTip = `已投 ${applied} 家，${waiting} 家在等回音，今天适合跟进 ${followUps.length} 家。`;
  }

  return {
    hero: { greeting: greetingText(), stage_label: stageLabel, slogan, today_tip: todayTip },
    metrics: {
      active,
      interviewing,
      offers,
      hit_rate: { rate: hitRate, interviewed, applied },
    },
    todos: todos.slice(0, 6),
    week: {
      applications: { now: appsThisWeek, last: appsLastWeek },
      interviews: { now: interviewsThisWeek, last: interviewsLastWeek },
      reviews: { now: reviewsThisWeek, last: reviewsLastWeek },
      checkins: { now: checkinsThisWeek, last: checkinsLastWeek },
    },
    sprint: { done: sprintDone, total: sprintTotal, streak },
  };
}
