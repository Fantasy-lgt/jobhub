/**
 * 日期工具：统一 YYYY-MM-DD 存储，展示用「今天 / 昨天 / N 天前」。
 */

/** 本地时区的 YYYY-MM-DD。 */
export function todayStr(): string {
  return toDateStr(new Date())
}

export function toDateStr(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** 解析 YYYY-MM-DD 为本地 Date（避免 new Date('YYYY-MM-DD') 的 UTC 偏移坑）。 */
export function parseDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, (m || 1) - 1, d || 1)
}

export function addDays(dateStr: string, n: number): string {
  const d = parseDate(dateStr)
  d.setDate(d.getDate() + n)
  return toDateStr(d)
}

/** b - a 的天数差（整数）。 */
export function daysBetween(a: string, b: string): number {
  const ms = parseDate(b).getTime() - parseDate(a).getTime()
  return Math.round(ms / 86400000)
}

/** 周一作为一周起点。 */
export function weekStartOf(dateStr: string): string {
  const d = parseDate(dateStr)
  const dow = d.getDay() // 0=周日
  const diff = dow === 0 ? -6 : 1 - dow
  d.setDate(d.getDate() + diff)
  return toDateStr(d)
}

/** 「今天 / 昨天 / 明天 / N 天前 / N 天后」，无日期返回「—」。 */
export function relDay(dateStr: string | null | undefined): string {
  if (!dateStr) return '—'
  const diff = daysBetween(todayStr(), dateStr)
  if (diff === 0) return '今天'
  if (diff === -1) return '昨天'
  if (diff === 1) return '明天'
  if (diff < 0) return `${-diff} 天前`
  return `${diff} 天后`
}

/** 展示日期（无年份差异时省略年份）。 */
export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—'
  const d = parseDate(dateStr)
  const now = new Date()
  const sameYear = d.getFullYear() === now.getFullYear()
  const md = `${d.getMonth() + 1}月${d.getDate()}日`
  return sameYear ? md : `${d.getFullYear()}年${md}`
}

/** 距今是否已逾期（严格小于今天）。 */
export function isOverdue(dateStr: string | null | undefined): boolean {
  if (!dateStr) return false
  return daysBetween(todayStr(), dateStr) < 0
}
