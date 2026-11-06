/** 数据复盘页辅助：时间范围、趋势序列、下钻结果表格化。 */

import type { TrendSeries } from '../../components'
import type { TrendPoint } from '../../types'

export const RANGE_OPTIONS = [
  { key: 'week', label: '本周' },
  { key: '7d', label: '近 7 天' },
  { key: '30d', label: '近 30 天' },
  { key: 'all', label: '全部' },
] as const
export type RangeKey = (typeof RANGE_OPTIONS)[number]['key']

export type TrendField = 'apply' | 'interview' | 'offer'

export const TREND_FIELD_LABEL: Record<TrendField, string> = {
  apply: '投递数',
  interview: '面试数',
  offer: '累计 Offer 数',
}

const TREND_COLORS: Record<TrendField, string> = {
  apply: 'var(--brand)',
  interview: 'var(--blue)',
  offer: 'var(--green)',
}

/** TrendPoint（后端三线）→ TrendChart 所需的多序列结构。 */
export function buildTrendSeries(points: TrendPoint[]): TrendSeries[] {
  const fields: { key: TrendField; name: string }[] = [
    { key: 'apply', name: '投递' },
    { key: 'interview', name: '面试' },
    { key: 'offer', name: '累计 Offer' },
  ]
  return fields.map((f) => ({
    key: f.key,
    name: f.name,
    color: TREND_COLORS[f.key],
    points: points.map((p) => ({ label: p.label, value: p[f.key] })),
  }))
}

/** 转化率为 null 时显示「—」，不显示 0%。 */
export function rateText(rate: number | null): string {
  return rate === null ? '—' : `${rate}%`
}

function displayValue(v: unknown): string {
  if (v === null || v === undefined) return '—'
  let s: string
  if (typeof v === 'object') {
    try {
      s = JSON.stringify(v)
    } catch {
      s = String(v)
    }
  } else {
    s = String(v)
  }
  return s.length > 80 ? `${s.slice(0, 80)}…` : s
}

/** 下钻返回 unknown[]（各指标结构不同），统一抽列 + 字符串化，供通用表格渲染。 */
export function drilldownTable(rows: unknown[]): { columns: string[]; cells: string[][] } {
  if (rows.length === 0) return { columns: [], cells: [] }
  const objects = rows.filter(
    (r): r is Record<string, unknown> =>
      typeof r === 'object' && r !== null && !Array.isArray(r),
  )
  if (objects.length === 0) {
    return { columns: ['值'], cells: rows.map((r) => [displayValue(r)]) }
  }

  const columns: string[] = []
  for (const o of objects) {
    for (const k of Object.keys(o)) {
      if (!columns.includes(k) && columns.length < 8) columns.push(k)
    }
  }
  return {
    columns,
    cells: objects.map((o) => columns.map((c) => displayValue(o[c]))),
  }
}
