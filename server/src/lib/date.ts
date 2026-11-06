/**
 * 日期工具：统一 YYYY-MM-DD 字符串。
 * 日期为用户侧的「自然日」，按服务器本地时区计算；时间戳（DB）为 UTC。
 */

const DAY_MS = 86_400_000;

export function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** Date → YYYY-MM-DD（本地时区） */
export function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** 今天（本地） */
export function todayStr(): string {
  return toDateStr(new Date());
}

/** YYYY-MM-DD → Date（本地） */
export function parseDate(s: string): Date {
  const [y, m, d] = s.split('-').map((v) => Number(v));
  return new Date(y || 1970, (m || 1) - 1, d || 1);
}

/** 加 n 天，返回 YYYY-MM-DD */
export function addDays(s: string, n: number): string {
  const d = parseDate(s);
  d.setDate(d.getDate() + n);
  return toDateStr(d);
}

/** 距今天数（b - a，正数表示已过去 n 天） */
export function daysSince(s: string): number {
  const a = parseDate(s).getTime();
  const b = parseDate(todayStr()).getTime();
  return Math.round((b - a) / DAY_MS);
}

/** 距今天数（过去为正） */
export function daysFromToday(s: string): number {
  return -daysSince(s);
}

/** 展示标签：今天 / 昨天 / N 天前 / 明天 / 原样 */
export function relativeDayLabel(s: string | null | undefined): string {
  if (!s) return '';
  const d = daysSince(s);
  if (d === 0) return '今天';
  if (d === 1) return '昨天';
  if (d === -1) return '明天';
  if (d > 1) return `${d} 天前`;
  if (d < -1) return `${-d} 天后`;
  return s;
}

/** 所在周的周一（YYYY-MM-DD） */
export function weekStart(s: string): string {
  const d = parseDate(s);
  const day = d.getDay(); // 0 Sun .. 6 Sat
  const sinceMonday = (day + 6) % 7;
  d.setDate(d.getDate() - sinceMonday);
  return toDateStr(d);
}

/** 本周周一 */
export function currentWeekStart(): string {
  return weekStart(todayStr());
}

/** 上周周一 */
export function prevWeekStart(): string {
  return addDays(currentWeekStart(), -7);
}

/** 日期是否在 [start, end] 闭区间内 */
export function inRange(date: string, start: string, end: string): boolean {
  return date >= start && date <= end;
}

/** 时间戳转 YYYY-MM-DD（接受 Date 或 'YYYY-MM-DD[ HH:MM:SS]' / ISO 字符串，取日期前缀，避免时区歧义） */
export function dateOfTimestamp(ts: string | Date): string {
  if (ts instanceof Date) {
    return Number.isNaN(ts.getTime()) ? '' : toDateStr(ts);
  }
  const m = /^\d{4}-\d{2}-\d{2}/.exec(String(ts));
  return m ? m[0] : '';
}

/** 当前 ISO 时间戳（UTC） */
export function isoNow(): string {
  return new Date().toISOString();
}
