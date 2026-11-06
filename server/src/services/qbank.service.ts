/**
 * 题库弱点 service：bigram 聚合 + 手动合并/拆分 + W1–W8 弱点汇总（模式级判定）。
 * 对齐前端契约：QbankGroup / QbankGroupDetail / WeaknessSummary。
 */
import { db } from '../db';
import { badRequest, notFound } from '../lib/http';
import { computeGroups, type QuestionLink } from '../lib/bigram';
import { detectRedFlags } from '../lib/machine-check';
import { WEAKNESS_CODES, WEAKNESS_DESC, WEAKNESS_LABELS, type WeaknessCode } from '../constants';
import type { InterviewQuestionRow, QuestionLinkRow } from '../types';

export interface QuestionWithInterview extends InterviewQuestionRow {
  interview_company: string;
  interview_role: string;
  interview_round: string;
  interview_result: string;
  scheduled_at: string | null;
}

async function fetchQuestionsWithInterview(userId: number): Promise<QuestionWithInterview[]> {
  const rows = await db('interview_questions as q')
    .join('interviews as i', 'q.interview_id', 'i.id')
    .where('q.user_id', userId)
    .whereNull('i.deleted_at')
    .select(
      'q.*',
      'i.company as interview_company',
      'i.role as interview_role',
      'i.round as interview_round',
      'i.result as interview_result',
      'i.scheduled_at as scheduled_at',
    )
    .orderBy([{ column: 'i.scheduled_at', order: 'desc' }, { column: 'q.id', order: 'asc' }]);
  return rows as QuestionWithInterview[];
}

async function fetchLinks(userId: number): Promise<QuestionLink[]> {
  const rows = await db<QuestionLinkRow>('question_links').where({ user_id: userId });
  return rows.map((r) => ({
    question_a_id: r.question_a_id,
    question_b_id: r.question_b_id,
    link_type: r.link_type,
  }));
}

export interface QbankGroup {
  id: string;
  question: string;
  occurrences: number;
  last_seen: string | null;
  weakness_codes: WeaknessCode[];
  missed: number;
}

function buildGroup(groupKey: string, members: QuestionWithInterview[]): QbankGroup {
  const latest = members[0];
  const weaknessCodes = [...new Set(members.flatMap((m) => m.weakness_codes ?? []))];
  const missed = members.filter((m) => !m.a_action || !m.r_result).length;
  return {
    id: groupKey,
    question: latest.question,
    occurrences: members.length,
    last_seen: latest.scheduled_at,
    weakness_codes: weaknessCodes,
    missed,
  };
}

export async function getGroups(userId: number): Promise<QbankGroup[]> {
  const questions = await fetchQuestionsWithInterview(userId);
  const links = await fetchLinks(userId);

  const groups = computeGroups(
    questions.map((q) => ({ id: q.id, question: q.question })),
    links,
  );

  const byId = new Map(questions.map((q) => [q.id, q]));
  const result: QbankGroup[] = [];
  for (const [groupKey, ids] of groups.entries()) {
    const members = ids.map((id) => byId.get(id)).filter(Boolean) as QuestionWithInterview[];
    if (members.length === 0) continue;
    result.push(buildGroup(groupKey, members));
  }
  result.sort((a, b) => (b.last_seen ?? '').localeCompare(a.last_seen ?? ''));
  return result;
}

export interface QbankHistory {
  question_id: number;
  interview_id: number;
  company: string;
  round: string;
  question: string;
  my_answer: string;
  at: string | null;
  result: string;
}

export interface QbankTrendPoint {
  label: string;
  value: number;
}

export interface QbankGroupDetail {
  group: QbankGroup;
  history: QbankHistory[];
  recent_trend: QbankTrendPoint[];
}

function averageScores(scores: { content: number; expression: number; mindset: number; interaction: number } | null): number | null {
  if (!scores) return null;
  const values = [scores.content, scores.expression, scores.mindset, scores.interaction].filter(
    (v) => typeof v === 'number',
  );
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export async function getGroupDetail(userId: number, groupKey: string): Promise<QbankGroupDetail> {
  const questions = await fetchQuestionsWithInterview(userId);
  const links = await fetchLinks(userId);

  const groups = computeGroups(
    questions.map((q) => ({ id: q.id, question: q.question })),
    links,
  );
  const ids = groups.get(groupKey);
  if (!ids || ids.length === 0) throw notFound('题目组不存在');

  const byId = new Map(questions.map((q) => [q.id, q]));
  const members = ids.map((id) => byId.get(id)).filter(Boolean) as QuestionWithInterview[];

  // 面试自评分数（用于趋势）
  const interviewIds = [...new Set(members.map((m) => m.interview_id))];
  const interviews = await db('interviews').whereIn('id', interviewIds).select('id', 'self_scores');
  const scoreById = new Map(
    interviews.map((i: { id: number; self_scores: unknown }) => [i.id, averageScores(i.self_scores as never)]),
  );

  const history: QbankHistory[] = members.map((m) => ({
    question_id: m.id,
    interview_id: m.interview_id,
    company: m.interview_company,
    round: m.interview_round,
    question: m.question,
    my_answer: Array.from(m.my_answer).slice(0, 150).join(''),
    at: m.scheduled_at,
    result: m.interview_result,
  }));

  const recent_trend: QbankTrendPoint[] = members
    .filter((m) => scoreById.get(m.interview_id) != null)
    .slice(0, 3)
    .map((m, idx) => ({
      label: m.scheduled_at ?? `第${idx + 1}场`,
      value: scoreById.get(m.interview_id) as number,
    }));

  return { group: buildGroup(groupKey, members), history, recent_trend };
}

export async function createLink(
  userId: number,
  aId: number,
  bId: number,
  type: 'merge' | 'split',
): Promise<QuestionLinkRow> {
  if (aId === bId) throw badRequest('不能与自身建立链接');

  const both = await db('interview_questions')
    .where({ user_id: userId })
    .whereIn('id', [aId, bId])
    .count('* as c')
    .first();
  if (Number(both?.c ?? 0) < 2) throw notFound('题目不存在');

  const existing = await db<QuestionLinkRow>('question_links')
    .where({ user_id: userId, question_a_id: aId, question_b_id: bId, link_type: type })
    .first();
  if (existing) return existing;

  const [id] = await db('question_links').insert({
    user_id: userId,
    question_a_id: aId,
    question_b_id: bId,
    link_type: type,
  });
  return (await db<QuestionLinkRow>('question_links').where({ id }).first())!;
}

export async function deleteLink(userId: number, id: number): Promise<void> {
  const link = await db<QuestionLinkRow>('question_links').where({ id, user_id: userId }).first();
  if (!link) throw notFound('链接不存在');
  await db('question_links').where({ id }).delete();
}

// ---------- 弱点汇总 ----------

export interface WeaknessSummary {
  code: WeaknessCode;
  name: string;
  desc: string;
  hits: number;
  examples: string[];
  /** pattern=同一弱点命中 ≥2 个不同场次；watching=只命中 1 场 */
  level: 'pattern' | 'watching';
  /** 该弱点命中的不同场次数（N 场） */
  distinct_sessions: number;
  /** 用户总场次数（有 ≥1 题的面试场次） */
  total_sessions: number;
}

export async function getWeaknesses(userId: number): Promise<WeaknessSummary[]> {
  const questions = await fetchQuestionsWithInterview(userId);
  const totalSessions = new Set(questions.map((q) => q.interview_id)).size;

  const hitsByCode = new Map<WeaknessCode, QuestionWithInterview[]>();
  const examplesByCode = new Map<WeaknessCode, string[]>();
  for (const code of WEAKNESS_CODES) {
    hitsByCode.set(code, []);
    examplesByCode.set(code, []);
  }

  for (const q of questions) {
    const codes = new Set<WeaknessCode>(q.weakness_codes ?? []);
    const redFlags = detectRedFlags(q.my_answer);
    for (const code of WEAKNESS_CODES) {
      if (!codes.has(code)) continue;
      hitsByCode.get(code)!.push(q);
      let example = '';
      if (code === 'W4' || code === 'W5' || code === 'W6' || code === 'W7') {
        example = redFlags.find((h) => h.code === code)?.sentence ?? '';
      }
      if (!example) example = Array.from(q.my_answer).slice(0, 60).join('');
      if (example && examplesByCode.get(code)!.length < 3) {
        examplesByCode.get(code)!.push(example);
      }
    }
  }

  const items: WeaknessSummary[] = WEAKNESS_CODES.map((code) => {
    const hits = hitsByCode.get(code)!;
    const distinct = new Set(hits.map((q) => q.interview_id)).size;
    const level: 'pattern' | 'watching' = distinct >= 2 ? 'pattern' : 'watching';
    return {
      code,
      name: WEAKNESS_LABELS[code],
      desc: WEAKNESS_DESC[code],
      hits: hits.length,
      examples: examplesByCode.get(code)!,
      level,
      distinct_sessions: distinct,
      total_sessions: totalSessions,
    };
  });

  items.sort((a, b) => {
    if (a.level !== b.level) return a.level === 'pattern' ? -1 : 1;
    return b.hits - a.hits;
  });

  return items;
}
