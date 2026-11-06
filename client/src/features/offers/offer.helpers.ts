/**
 * Offer 决策页辅助：表单状态 ↔ 后端 payload、权重合计校验、实时年包预览。
 * 金额录入一律「元」，落库一律「分」（后端 schema 亦为分），转换只在这一层发生。
 */

import { OFFER_SCORE_KEYS } from '../../types'
import type { Offer, OfferScores, OfferScoreKey, OfferWeights } from '../../types'
import { yuanToFen } from '../../utils/money'

export const DIMENSIONS = OFFER_SCORE_KEYS

export const DEFAULT_WEIGHTS: OfferWeights = { money: 40, growth: 25, stability: 20, life: 15 }
export const DEFAULT_SCORES: OfferScores = { money: 3, growth: 3, stability: 3, life: 3 }

export type WeightsForm = Record<OfferScoreKey, string>
export type ScoresForm = Record<OfferScoreKey, string>

export interface OfferFormState {
  company: string
  role: string
  city: string
  deadline: string
  base_salary: string // 元/月
  salary_months: string
  bonus_months: string
  sign_bonus: string // 元
  equity_value: string // 元
  equity_years: string
  allowance: string // 元/月
  fund_rate: string // %
  weights: WeightsForm
  scores: ScoresForm
  top_concern: string
  notice_period: string
  non_compete: boolean
  social_security: boolean
  note: string
}

/** 分 → 元输入字符串（0 显示空，避免表单里一堆 0）。 */
function fenStr(fen: number | undefined): string {
  return fen && fen > 0 ? String(fen / 100) : ''
}

function numStr(n: number | undefined, fallback = ''): string {
  return n === undefined || n === null ? fallback : String(n)
}

function weightsToForm(w: OfferWeights | undefined): WeightsForm {
  const src = w ?? DEFAULT_WEIGHTS
  return {
    money: numStr(src.money, '0'),
    growth: numStr(src.growth, '0'),
    stability: numStr(src.stability, '0'),
    life: numStr(src.life, '0'),
  }
}

function scoresToForm(s: OfferScores | undefined): ScoresForm {
  const src = s ?? DEFAULT_SCORES
  return {
    money: numStr(src.money, '3'),
    growth: numStr(src.growth, '3'),
    stability: numStr(src.stability, '3'),
    life: numStr(src.life, '3'),
  }
}

export function emptyForm(): OfferFormState {
  return {
    company: '',
    role: '',
    city: '',
    deadline: '',
    base_salary: '',
    salary_months: '12',
    bonus_months: '0',
    sign_bonus: '',
    equity_value: '',
    equity_years: '4',
    allowance: '',
    fund_rate: '0',
    weights: weightsToForm(DEFAULT_WEIGHTS),
    scores: scoresToForm(DEFAULT_SCORES),
    top_concern: '',
    notice_period: '',
    non_compete: false,
    social_security: false,
    note: '',
  }
}

export function formFromOffer(o: Offer): OfferFormState {
  return {
    company: o.company ?? '',
    role: o.role ?? '',
    city: o.city ?? '',
    deadline: o.deadline ?? '',
    base_salary: fenStr(o.base_salary),
    salary_months: numStr(o.salary_months, '12'),
    bonus_months: numStr(o.bonus_months, '0'),
    sign_bonus: fenStr(o.sign_bonus),
    equity_value: numStr(o.equity_value, '0'),
    equity_years: numStr(o.equity_years, '4'),
    allowance: fenStr(o.allowance),
    fund_rate: numStr(o.fund_rate, '0'),
    weights: weightsToForm(o.weights),
    scores: scoresToForm(o.scores),
    top_concern: o.top_concern ?? '',
    notice_period: o.notice_period ?? '',
    non_compete: o.non_compete ?? false,
    social_security: o.social_security ?? false,
    note: o.note ?? '',
  }
}

function toNum(v: string, fallback = 0): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}

/** 四维权重合计，必须为 100（与后端 assertWeightsValid 同口径）。 */
export function weightsTotal(f: OfferFormState): number {
  return DIMENSIONS.reduce((acc, d) => acc + toNum(f.weights[d.key]), 0)
}

export function toPayload(f: OfferFormState): Partial<Offer> {
  const weights = {} as OfferWeights
  const scores = {} as OfferScores
  for (const d of DIMENSIONS) {
    weights[d.key] = toNum(f.weights[d.key])
    scores[d.key] = Math.max(1, Math.min(5, Math.round(toNum(f.scores[d.key], 3))))
  }
  return {
    company: f.company.trim(),
    role: f.role.trim(),
    city: f.city.trim(),
    deadline: f.deadline || null,
    base_salary: yuanToFen(toNum(f.base_salary)),
    salary_months: Math.max(1, Math.min(24, Math.round(toNum(f.salary_months, 12)))),
    bonus_months: toNum(f.bonus_months),
    sign_bonus: yuanToFen(toNum(f.sign_bonus)),
    equity_value: Math.max(0, Math.round(toNum(f.equity_value))), // 元
    equity_years: Math.max(1, Math.min(10, Math.round(toNum(f.equity_years, 4)))),
    allowance: yuanToFen(toNum(f.allowance)),
    fund_rate: toNum(f.fund_rate),
    weights,
    scores,
    top_concern: f.top_concern.trim(),
    notice_period: f.notice_period.trim(),
    non_compete: f.non_compete,
    social_security: f.social_security,
    note: f.note,
  }
}

const BLANK_OFFER: Offer = {
  id: 0,
  user_id: 0,
  app_id: null,
  company: '',
  role: '',
  city: '',
  base_salary: 0,
  salary_months: 12,
  bonus_months: 0,
  sign_bonus: 0,
  equity_value: 0,
  equity_years: 4,
  allowance: 0,
  fund_rate: 0,
  deadline: null,
  weights: DEFAULT_WEIGHTS,
  scores: DEFAULT_SCORES,
  top_concern: '',
  notice_period: '',
  non_compete: false,
  social_security: false,
  note: '',
  created_at: '',
  updated_at: '',
}

/** 供表单内实时预览年包 / 加权评分使用（不落库）。 */
export function toPreviewOffer(f: OfferFormState): Offer {
  return { ...BLANK_OFFER, ...toPayload(f) }
}
