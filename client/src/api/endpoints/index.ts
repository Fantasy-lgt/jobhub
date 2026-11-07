import type { QueryClient } from '@tanstack/react-query'

export { authApi } from './auth'
export { overviewApi } from './overview'
export { profileApi } from './profile'
export { appsApi } from './apps'
export { interviewsApi } from './interviews'
export { qbankApi } from './qbank'
export { offersApi } from './offers'
export { analyticsApi } from './analytics'
export { roadmapApi } from './roadmap'
export { aiApi } from './ai'
export { exportApi } from './export'
export { importApi } from './import'
export { IMPORT_STAT_KEYS, IMPORT_STAT_LABEL } from './import'
export type {
  ImportResult,
  ImportStats,
  ImportStatKey,
  ImportMode,
  ImportPayloadData,
  ImportError,
} from './import'
export { recycleApi } from './recycle'
export { RECYCLE_TYPES, RECYCLE_TYPE_LABEL } from './recycle'
export type { RecycleList, RecycleItem, RecycleType } from './recycle'

/**
 * 跨页派生数据统一失效：任一写操作完成后调用。
 *
 * 背景：各页历史 mutation 只失效自身 queryKey（如 AppsPage 只 `['apps']`），
 * 叠加 QueryClient 的 refetchOnWindowFocus:false + staleTime:30s，
 * 改完数据切回概览会出现 30 秒旧数据。这里统一把派生类查询标记 stale；
 * 未挂载的查询只标 stale、不会额外发请求，成本可忽略。
 */
export function invalidateDerivedQueries(qc: QueryClient): void {
  const keys: string[][] = [
    ['overview'],
    ['analytics'], // 前缀匹配：覆盖 funnel / trend / channels / indicators / ... 全部子 key
    ['qbank-weaknesses'],
    ['offers'],
  ]
  for (const queryKey of keys) {
    void qc.invalidateQueries({ queryKey })
  }
}
