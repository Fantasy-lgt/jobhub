/**
 * 金额工具：一律以「分」为整数存储/计算，展示时转元 / K / 万。
 * 禁止浮点直接相加（所有累加走整数分）。
 */

import type { Offer } from '../types'

/** 分 → 元（保留指定小数位）。 */
export function fenToYuan(fen: number, digits = 0): string {
  const yuan = fen / 100
  return yuan.toLocaleString('zh-CN', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
}

/** 分 → 元（数值，供比较/排序，不做展示格式化）。 */
export function fenToYuanNum(fen: number): number {
  return fen / 100
}

/** 月薪（分）→ 「30K」「1.2K」（K = 千元；1 元 = 100 分，1K = 100000 分）。 */
export function fenToK(fen: number): string {
  const k = fen / 100000
  if (k >= 100) return `${Math.round(k)}K`
  const v = Math.round(k * 10) / 10
  return `${v.toString().replace(/\.0$/, '')}K`
}

/** 年包（分）→ 「48万」「45.6万」。 */
export function fenToWan(fen: number): string {
  const wan = fen / 1000000
  if (wan >= 100) return `${Math.round(wan)}万`
  const v = Math.round(wan * 10) / 10
  return `${v.toString().replace(/\.0$/, '')}万`
}

/** 元 → 分（录入转换，四舍五入到整数分）。 */
export function yuanToFen(yuan: number): number {
  return Math.round(yuan * 100)
}

/**
 * Offer 年包（分）＝ 月薪×薪月数 + 绩效月数×月薪 + 签字费 + 补贴×12。
 *
 * 需求清单规定「年包不含期权，期权单独列示」，与后端 offers.service.calcOffer 对齐：
 * 期权估值（元）只做单独展示，不折算进年包。
 * 全部以整数分运算，bonus_months 为 DECIMAL(4,1)（如 1.5），
 * 先放大 10 倍取整再除回，避免浮点误差。
 */
export function annualPackageFen(offer: Offer): number {
  const base = offer.base_salary
  const salaryYear = base * offer.salary_months
  // bonus_months 以「十分之一月」整数化：1.5 → 15
  const bonusMonthsTenths = Math.round(offer.bonus_months * 10)
  const bonus = Math.round((base * bonusMonthsTenths) / 10)
  const sign = offer.sign_bonus
  const allowanceYear = offer.allowance * 12
  return salaryYear + bonus + sign + allowanceYear
}

/** 期权年均值（元/年），仅展示，不计入年包。 */
export function equityYuanPerYear(offer: Offer): number {
  return Math.round((offer.equity_value / Math.max(offer.equity_years, 1)) * 100) / 100
}

/** Offer 加权总分（1–5，权重合计 100）。 */
export function offerScore(offer: Offer): number {
  const { weights, scores } = offer
  const total = (Object.keys(weights) as (keyof typeof weights)[]).reduce((acc, k) => {
    return acc + (weights[k] ?? 0) * (scores[k] ?? 0)
  }, 0)
  return Math.round(total) / 100
}
