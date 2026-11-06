import { APP_STATUS_LABEL, STATUS_COLOR } from '../../types'
import type { App, AppStatus } from '../../types'
import { daysBetween, todayStr } from '../../utils/date'

/** 状态码 → 中文（未知码原样返回，避免白屏）。 */
export function statusLabel(status: string): string {
  return APP_STATUS_LABEL[status as AppStatus] ?? status
}

/** 状态码 → 左缘语义色。 */
export function statusColor(status: string): string {
  return STATUS_COLOR[status as AppStatus] ?? 'var(--muted)'
}

/** 已投天数（未投返回 null，负值归一为 0）。 */
export function daysSinceApplied(app: App): number | null {
  if (!app.applied_at) return null
  return Math.max(daysBetween(app.applied_at, todayStr()), 0)
}

/** 下一步动作是否已超期（next_action_at 严格早于今天）。 */
export function isOverdue(app: App): boolean {
  if (!app.next_action_at) return false
  return daysBetween(todayStr(), app.next_action_at) < 0
}

/** 元/月 → 分（录入转换，非法输入按 0 处理）。 */
export function yuanInputToFen(v: string): number {
  const n = Number(v)
  if (!Number.isFinite(n) || n < 0) return 0
  return Math.round(n * 100)
}
