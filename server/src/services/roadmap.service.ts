/**
 * 冲刺路线图 service：5 阶段 + 任务勾选（done 时写 checkins）+ streak（连续打卡）。
 */
import { db } from '../db';
import { notFound } from '../lib/http';
import { addDays, todayStr } from '../lib/date';
import type { CheckinRow, RoadmapStageRow, RoadmapTaskRow } from '../types';

export interface RoadmapTaskWithStatus extends RoadmapTaskRow {
  checkin_date?: string;
}

export interface StageWithTasks extends RoadmapStageRow {
  tasks: RoadmapTaskRow[];
  progress: number; // 0-1
  total: number;
  doneCount: number;
}

export interface Milestone {
  label: string;
  achieved: boolean;
}

export interface Streak {
  current: number;
  best: number;
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
  if (!set.has(cursor)) cursor = addDays(cursor, -1); // 今天尚未打卡也算连续
  while (set.has(cursor)) {
    current += 1;
    cursor = addDays(cursor, -1);
  }
  return { current, best };
}

export async function getStreak(userId: number): Promise<Streak> {
  const rows = await db<CheckinRow>('checkins').where({ user_id: userId }).select('checkin_date');
  return computeStreak(rows.map((r) => r.checkin_date));
}

async function buildMilestones(userId: number): Promise<Milestone[]> {
  const profile = await db('profiles').where({ user_id: userId }).first();
  const appCount = await db('apps').where({ user_id: userId }).whereNull('deleted_at').count('* as c').first();
  const interviewCount = await db('interviews').where({ user_id: userId }).whereNull('deleted_at').count('* as c').first();
  const offerCount = await db('offers').where({ user_id: userId }).whereNull('deleted_at').count('* as c').first();

  const hasProfile = !!profile && !!profile.primary_role;
  const apps = Number(appCount?.c ?? 0);
  const interviews = Number(interviewCount?.c ?? 0);
  const offers = Number(offerCount?.c ?? 0);

  return [
    { label: '写下求职定位', achieved: hasProfile },
    { label: '投递满 5 家', achieved: apps >= 5 },
    { label: '拿到 3 场面试', achieved: interviews >= 3 },
    { label: '拿到第 1 个 Offer', achieved: offers >= 1 },
  ];
}

export async function getRoadmap(userId: number): Promise<{
  stages: (RoadmapStageRow & { tasks: RoadmapTaskRow[] })[];
  streak: Streak;
  milestones: Milestone[];
}> {
  const stages = await db<RoadmapStageRow>('roadmap_stages')
    .where({ user_id: userId })
    .orderBy('stage_order', 'asc');
  const tasks = await db<RoadmapTaskRow>('roadmap_tasks')
    .where({ user_id: userId })
    .orderBy([{ column: 'sort_order', order: 'asc' }, { column: 'id', order: 'asc' }]);

  const tasksByStage = new Map<number, RoadmapTaskRow[]>();
  for (const t of tasks) {
    if (!tasksByStage.has(t.stage_id)) tasksByStage.set(t.stage_id, []);
    tasksByStage.get(t.stage_id)!.push(t);
  }

  const stageList = stages.map((s) => ({
    ...s,
    tasks: tasksByStage.get(s.id) ?? [],
  }));

  const [streak, milestones] = await Promise.all([getStreak(userId), buildMilestones(userId)]);
  return { stages: stageList, streak, milestones };
}

export async function addTask(userId: number, stageId: number, title: string): Promise<RoadmapTaskRow> {
  const stage = await db<RoadmapStageRow>('roadmap_stages').where({ id: stageId, user_id: userId }).first();
  if (!stage) throw notFound('阶段不存在');

  const maxOrder = (await db('roadmap_tasks')
    .where({ stage_id: stageId })
    .max('sort_order as m')
    .first()) as unknown as { m: number | null } | undefined;
  const [id] = await db('roadmap_tasks').insert({
    user_id: userId,
    stage_id: stageId,
    title,
    done: false,
    done_at: null,
    sort_order: Number(maxOrder?.m ?? 0) + 1,
  });
  return (await db<RoadmapTaskRow>('roadmap_tasks').where({ id }).first())!;
}

export async function updateTask(
  userId: number,
  id: number,
  patch: { title?: string; done?: boolean },
): Promise<RoadmapTaskRow> {
  const task = await db<RoadmapTaskRow>('roadmap_tasks').where({ id, user_id: userId }).first();
  if (!task) throw notFound('任务不存在');

  const data: Record<string, unknown> = {};
  if (patch.title !== undefined) data.title = patch.title;
  if (patch.done !== undefined) {
    data.done = patch.done;
    if (patch.done && !task.done) {
      data.done_at = new Date();
      // 每天完成 ≥1 个任务即打卡
      await db('checkins')
        .insert({ user_id: userId, checkin_date: todayStr() })
        .onConflict(['user_id', 'checkin_date'])
        .ignore();
    } else if (!patch.done) {
      data.done_at = null;
    }
  }

  if (Object.keys(data).length > 0) {
    await db('roadmap_tasks').where({ id }).update(data);
  }
  return (await db<RoadmapTaskRow>('roadmap_tasks').where({ id }).first())!;
}

export async function deleteTask(userId: number, id: number): Promise<void> {
  const task = await db<RoadmapTaskRow>('roadmap_tasks').where({ id, user_id: userId }).first();
  if (!task) throw notFound('任务不存在');
  await db('roadmap_tasks').where({ id }).delete();
}
