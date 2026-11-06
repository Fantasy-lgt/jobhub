/**
 * Offer 决策 service：年包计算（不含期权）+ 加权评分 + 排名 + 对比。
 * 对齐前端契约：列表平铺 annual_package/score/rank，详情 {offer, calc}，compare 返回 Offer[]。
 */
import { db, toJson } from '../db';
import { badRequest, notFound } from '../lib/http';
import { sumFen } from '../lib/money';
import type { OfferRow, OfferWeights, OfferScores } from '../types';

export const OFFER_DIMENSIONS = ['money', 'growth', 'stability', 'life'] as const;
export type OfferDimension = (typeof OFFER_DIMENSIONS)[number];

export function weightsSum(weights: OfferWeights): number {
  return OFFER_DIMENSIONS.reduce((acc, d) => acc + (weights[d] ?? 0), 0);
}

export function assertWeightsValid(weights: OfferWeights): void {
  if (weightsSum(weights) !== 100) {
    throw badRequest(`四维权重合计必须为 100（当前 ${weightsSum(weights)}）`);
  }
}

export interface OfferCalc {
  total_cents: number;
  base_cents: number;
  bonus_cents: number;
  sign_cents: number;
  allowance_cents: number;
  equity_cents: number;
  /** 期权年均值（元/年），仅展示不计入年包 */
  equity_yuan_per_year: number;
  weighted_score: number;
}

export interface OfferWithDerived extends OfferRow {
  annual_package: number; // 年包 分
  score: number; // 加权总分
  rank: number;
}

/** 年包（分）＝ 月薪×薪月数 + 绩效月数×月薪 + 签字费 + 补贴×12；期权单独列示。 */
export function calcOffer(offer: OfferRow): OfferCalc {
  const baseSalary = Number(offer.base_salary) || 0;
  const salaryMonths = Number(offer.salary_months) || 0;
  const bonusMonths = Number(offer.bonus_months) || 0;
  const signBonus = Number(offer.sign_bonus) || 0;
  const allowance = Number(offer.allowance) || 0;
  const equityValue = Number(offer.equity_value) || 0; // 元
  const equityYears = Number(offer.equity_years) || 1;

  const base_cents = Math.round(baseSalary * salaryMonths);
  const bonus_cents = Math.round(bonusMonths * baseSalary);
  const sign_cents = Math.round(signBonus);
  const allowance_cents = Math.round(allowance * 12);
  const equity_cents = Math.round(equityValue * 100);
  const equity_yuan_per_year = Math.round((equityValue / equityYears) * 100) / 100;

  const total_cents = sumFen([base_cents, bonus_cents, sign_cents, allowance_cents]);

  const weights = offer.weights ?? { money: 40, growth: 25, stability: 20, life: 15 };
  const scores = offer.scores ?? { money: 3, growth: 3, stability: 3, life: 3 };
  const weightedRaw = OFFER_DIMENSIONS.reduce(
    (acc, d) => acc + (weights[d] ?? 0) * (scores[d] ?? 0),
    0,
  );
  const weighted_score = Math.round((weightedRaw / 100) * 100) / 100;

  return { total_cents, base_cents, bonus_cents, sign_cents, allowance_cents, equity_cents, equity_yuan_per_year, weighted_score };
}

function withDerived(offer: OfferRow, rank: number): OfferWithDerived {
  const calc = calcOffer(offer);
  return { ...offer, annual_package: calc.total_cents, score: calc.weighted_score, rank };
}

export async function listOffers(userId: number): Promise<OfferWithDerived[]> {
  const offers = await db<OfferRow>('offers')
    .where({ user_id: userId })
    .whereNull('deleted_at')
    .orderBy([{ column: 'deadline', order: 'asc' }, { column: 'created_at', order: 'desc' }]);

  const ranked = offers
    .map((o) => ({ o, c: calcOffer(o) }))
    .sort(
      (a, b) => b.c.weighted_score - a.c.weighted_score || b.c.total_cents - a.c.total_cents,
    );
  const rankById = new Map(ranked.map((x, idx) => [x.o.id, idx + 1]));
  return offers.map((o) => withDerived(o, rankById.get(o.id) ?? 0));
}

export async function getOffer(userId: number, id: number): Promise<{ offer: OfferRow; calc: OfferCalc }> {
  const offer = await db<OfferRow>('offers').where({ id, user_id: userId }).whereNull('deleted_at').first();
  if (!offer) throw notFound('Offer 不存在');
  return { offer, calc: calcOffer(offer) };
}

export interface OfferInput {
  app_id?: number | null;
  company: string;
  role: string;
  city: string;
  base_salary: number;
  salary_months: number;
  bonus_months: number;
  sign_bonus: number;
  equity_value: number;
  equity_years: number;
  allowance: number;
  fund_rate: number;
  deadline?: string | null;
  weights: OfferWeights;
  scores: OfferScores;
  top_concern: string;
  notice_period: string;
  non_compete: boolean;
  social_security: boolean;
  note: string;
}

export async function createOffer(userId: number, input: OfferInput): Promise<OfferRow> {
  assertWeightsValid(input.weights);
  const [id] = await db('offers').insert({
    user_id: userId,
    app_id: input.app_id ?? null,
    company: input.company,
    role: input.role,
    city: input.city,
    base_salary: input.base_salary,
    salary_months: input.salary_months,
    bonus_months: input.bonus_months,
    sign_bonus: input.sign_bonus,
    equity_value: input.equity_value,
    equity_years: input.equity_years,
    allowance: input.allowance,
    fund_rate: input.fund_rate,
    deadline: input.deadline ?? null,
    weights: toJson(input.weights, '{}')!,
    scores: toJson(input.scores, '{}')!,
    top_concern: input.top_concern,
    notice_period: input.notice_period,
    non_compete: input.non_compete,
    social_security: input.social_security,
    note: input.note,
  });
  return (await db<OfferRow>('offers').where({ id }).first())!;
}

export async function updateOffer(userId: number, id: number, patch: Partial<OfferInput>): Promise<OfferRow> {
  const existing = await db<OfferRow>('offers').where({ id, user_id: userId }).whereNull('deleted_at').first();
  if (!existing) throw notFound('Offer 不存在');

  if (patch.weights) assertWeightsValid(patch.weights);

  const data: Record<string, unknown> = { updated_at: new Date() };
  const scalarMap: Record<string, keyof OfferInput> = {
    company: 'company',
    role: 'role',
    city: 'city',
    base_salary: 'base_salary',
    salary_months: 'salary_months',
    bonus_months: 'bonus_months',
    sign_bonus: 'sign_bonus',
    equity_value: 'equity_value',
    equity_years: 'equity_years',
    allowance: 'allowance',
    fund_rate: 'fund_rate',
    top_concern: 'top_concern',
    notice_period: 'notice_period',
    non_compete: 'non_compete',
    social_security: 'social_security',
    note: 'note',
  };
  for (const [dbCol, key] of Object.entries(scalarMap)) {
    if (patch[key] !== undefined) data[dbCol] = patch[key];
  }
  if (patch.app_id !== undefined) data.app_id = patch.app_id ?? null;
  if (patch.deadline !== undefined) data.deadline = patch.deadline ?? null;
  if (patch.weights) data.weights = toJson(patch.weights, '{}');
  if (patch.scores) data.scores = toJson(patch.scores, '{}');

  await db('offers').where({ id }).update(data);
  return (await db<OfferRow>('offers').where({ id }).first())!;
}

export async function deleteOffer(userId: number, id: number): Promise<void> {
  const offer = await db<OfferRow>('offers').where({ id, user_id: userId }).whereNull('deleted_at').first();
  if (!offer) throw notFound('Offer 不存在');
  await db('offers').where({ id }).update({ deleted_at: new Date(), updated_at: new Date() });
}

/** 对比：返回 2–4 个 Offer（含年包/评分/排名），最优值标注由前端完成。 */
export async function compareOffers(userId: number, ids: number[]): Promise<OfferWithDerived[]> {
  if (ids.length < 2 || ids.length > 4) throw badRequest('对比需 2–4 个 Offer');
  const all = await listOffers(userId);
  const offers = ids.map((id) => all.find((o) => o.id === id)).filter(Boolean) as OfferWithDerived[];
  if (offers.length !== ids.length) throw notFound('部分 Offer 不存在');
  return offers;
}
