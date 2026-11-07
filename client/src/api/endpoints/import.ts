/**
 * 批量导入：POST /api/v1/import
 *
 * 流程：选文件 → 浏览器解析 JSON → 默认「演练」(dryRun=true) 拿到统计与错误明细 →
 * 用户确认后「写入」(mode:append) 或「覆盖」(mode:replace) 实写（dryRun:false）。
 *
 * 特殊之处：本接口在「校验/关联失败」时返回 HTTP 422 + {code:422, data:{…,errors}}，
 * 与通用 http 封装「非 0 code 直接抛错且丢弃 body.data」的约定冲突——
 * 那样会丢掉 errors 明细（页面无法按 errors[].path 逐条提示）。
 * 因此这里参照 export.ts 自行 fetch + 解析信封：200(code0) 与 422(code422) 都返回完整
 * ImportResult（422 时 errors 非空，页面据此醒目提示并禁止实写）；
 * 401 行为与 http.ts 一致（派发 jobhub:unauthorized，由 auth store 清态）。
 */

import { USE_MOCK } from '../config'

const BASE = '/api/v1'

/** 12 个统计键（与 server/src/services/import.service.ts 的 IMPORT_STAT_KEYS 对齐）。 */
export const IMPORT_STAT_KEYS = [
  'profile',
  'resumes',
  'apps',
  'appEvents',
  'interviews',
  'questions',
  'questionAnalyses',
  'questionLinks',
  'offers',
  'weeklyReviews',
  'checkins',
  'roadmapTasks',
] as const

export type ImportStatKey = (typeof IMPORT_STAT_KEYS)[number]
export type ImportStats = Record<ImportStatKey, number>
export type ImportMode = 'append' | 'replace'

export interface ImportError {
  path: string
  message: string
}

export interface ImportResult {
  mode: ImportMode
  dryRun: boolean
  /** 实际写入（新增）条数 */
  created: ImportStats
  /** 就地更新条数 */
  updated: ImportStats
  /** 未写入条数（重复去重 / 找不到目标） */
  skipped: ImportStats
  /** 仅 mode=replace 返回：本次清除的行数（table → rows） */
  cleared?: Record<string, number>
  errors: ImportError[]
  warnings: string[]
}

/** 页面选中的导入文件，内容由浏览器解析，这里只做宽松约束（后端 zod 才是权威校验）。 */
export type ImportPayloadData = Record<string, unknown>

export const IMPORT_STAT_LABEL: Record<ImportStatKey, string> = {
  profile: '求职定位',
  resumes: '简历',
  apps: '岗位',
  appEvents: '流转事件',
  interviews: '面试',
  questions: '题目',
  questionAnalyses: '逐题分析',
  questionLinks: '题链接',
  offers: 'Offer',
  weeklyReviews: '周复盘',
  checkins: '打卡',
  roadmapTasks: '路线任务',
}

function zeroStats(): ImportStats {
  return IMPORT_STAT_KEYS.reduce((acc, key) => {
    acc[key] = 0
    return acc
  }, {} as ImportStats)
}

interface ImportBody {
  mode: ImportMode
  dryRun: boolean
  data: ImportPayloadData
}

interface ImportEnvelope {
  code?: number
  data?: ImportResult
  message?: string
}

async function postImport(body: ImportBody): Promise<ImportResult> {
  if (USE_MOCK) return mockResult(body.data, body.mode, body.dryRun)

  let res: Response
  try {
    res = await fetch(`${BASE}/import`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
    })
  } catch (err) {
    throw new Error(`网络异常：${err instanceof Error ? err.message : '未知错误'}`)
  }

  if (res.status === 401) {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('jobhub:unauthorized'))
    }
    throw new Error('未登录或会话已过期，请重新登录')
  }

  let parsed: ImportEnvelope | null = null
  try {
    parsed = (await res.json()) as ImportEnvelope
  } catch {
    // 非 JSON 错误体，保留默认兜底
  }

  // 演练校验失败走 422 + code=422，但仍返回完整的 ImportResult（含 errors）；
  // 实写成功走 200 + code=0。两种情况都把 data 透出给页面。
  if (parsed?.data) return parsed.data

  // 没有 data 兜底（如 500）：把后端 message 抛出
  throw new Error(parsed?.message || `导入失败（${res.status}）`)
}

export const importApi = {
  /** 演练：dryRun=true，不写库，返回统计与错误明细。 */
  async dryRun(data: ImportPayloadData): Promise<ImportResult> {
    return postImport({ mode: 'append', dryRun: true, data })
  },

  /** 实写：dryRun=false。mode=append（追加按业务键去重）/ replace（覆盖清空后全量）。 */
  async run(params: { mode: ImportMode; data: ImportPayloadData }): Promise<ImportResult> {
    return postImport({ mode: params.mode, dryRun: false, data: params.data })
  },
}

/** 骨架期 mock：按数组长度乐观回显新增条数（不真实写库）。 */
function mockResult(data: ImportPayloadData, mode: ImportMode, dryRun: boolean): ImportResult {
  const created = zeroStats()
  const arrLen = (key: string): number =>
    Array.isArray(data[key]) ? (data[key] as unknown[]).length : 0
  created.resumes = arrLen('resumes')
  created.apps = arrLen('apps')
  created.interviews = arrLen('interviews')
  created.offers = arrLen('offers')
  created.weeklyReviews = arrLen('weeklyReviews')
  created.checkins = arrLen('checkins')
  created.roadmapTasks = arrLen('roadmapTasks')
  if (data.profile && typeof data.profile === 'object') created.profile = 1
  return {
    mode,
    dryRun,
    created,
    updated: zeroStats(),
    skipped: zeroStats(),
    errors: [],
    warnings: ['（骨架期 mock，未真实写库）'],
  }
}
