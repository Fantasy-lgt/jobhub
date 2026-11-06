/**
 * 领域枚举常量（与后端 server/src/types/constants 保持一致，前后端各持一份类型）。
 * 状态 / 阶段组 / 渠道 / 弱点等集中在此，业务代码禁止散落魔法字符串。
 */

// ---------- 岗位 11 态 ----------
export const APP_STATUSES = [
  'pending',
  'applied',
  'written',
  'first',
  'second',
  'third',
  'hr',
  'offer',
  'rejected',
  'failed',
  'dropped',
] as const

export type AppStatus = (typeof APP_STATUSES)[number]

export const APP_STATUS_LABEL: Record<AppStatus, string> = {
  pending: '待投',
  applied: '已投',
  written: '笔试',
  first: '一面',
  second: '二面',
  third: '三面',
  hr: 'HR面',
  offer: 'Offer',
  rejected: '已拒',
  failed: '已挂',
  dropped: '已放弃',
}

/** 11 态 → 左缘状态色（语义色：blue 待投 / amber 推进中 / brand 面试 / green Offer / pink 结束）。 */
export const STATUS_COLOR: Record<AppStatus, string> = {
  pending: 'var(--blue)',
  applied: 'var(--amber)',
  written: 'var(--amber)',
  first: 'var(--brand)',
  second: 'var(--brand)',
  third: 'var(--brand)',
  hr: 'var(--brand)',
  offer: 'var(--green)',
  rejected: 'var(--pink)',
  failed: 'var(--pink)',
  dropped: 'var(--pink)',
}

// ---------- 6 阶段组（看板列头 / 统计口径） ----------
export type StageGroup =
  | '待投组'
  | '已投组'
  | '笔试组'
  | '面试组'
  | 'Offer组'
  | '关闭组'

export const STAGE_GROUP_OF: Record<AppStatus, StageGroup> = {
  pending: '待投组',
  applied: '已投组',
  written: '笔试组',
  first: '面试组',
  second: '面试组',
  third: '面试组',
  hr: '面试组',
  offer: 'Offer组',
  rejected: '关闭组',
  failed: '关闭组',
  dropped: '关闭组',
}

export const STAGE_GROUP_ORDER: StageGroup[] = [
  '待投组',
  '已投组',
  '笔试组',
  '面试组',
  'Offer组',
  '关闭组',
]

/** 阶段组筛选：key 与后端 STAGE_GROUPS.key 对齐（用于 listApps 的 status 过滤）。 */
export const STAGE_GROUP_FILTERS: { key: string; label: StageGroup }[] = [
  { key: 'pending', label: '待投组' },
  { key: 'applied', label: '已投组' },
  { key: 'written', label: '笔试组' },
  { key: 'interview', label: '面试组' },
  { key: 'offer', label: 'Offer组' },
  { key: 'closed', label: '关闭组' },
]

/** 关闭态集合（不含在「在投」口径内）。 */
export const CLOSED_STATUSES: AppStatus[] = ['rejected', 'failed', 'dropped']

export function isClosedStatus(status: AppStatus): boolean {
  return CLOSED_STATUSES.includes(status)
}

// ---------- 岗位池字段枚举 ----------
export const CHANNELS = ['猎头', '内推', 'BOSS直聘', '官网', '招聘平台', '其他'] as const
export type Channel = (typeof CHANNELS)[number]

export const WORK_MODES = ['远程', '混合', '坐班'] as const
export type WorkMode = (typeof WORK_MODES)[number]

// ---------- 面试 ----------
export const INTERVIEW_ROUNDS = ['一面', '二面', '三面', 'HR面', '交叉面', '终面'] as const
export type InterviewRound = (typeof INTERVIEW_ROUNDS)[number]

export const INTERVIEW_FORMATS = ['电话', '视频', '现场'] as const
export type InterviewFormat = (typeof INTERVIEW_FORMATS)[number]

export const INTERVIEW_RESULTS = ['等通知', '通过', '未通过'] as const
export type InterviewResult = (typeof INTERVIEW_RESULTS)[number]

/** 四维自评。 */
export const SELF_SCORE_KEYS = [
  { key: 'content', label: '内容匹配度' },
  { key: 'expression', label: '表达清晰度' },
  { key: 'mindset', label: '心态稳定度' },
  { key: 'interaction', label: '互动质量' },
] as const
export type SelfScoreKey = (typeof SELF_SCORE_KEYS)[number]['key']
export type SelfScores = Partial<Record<SelfScoreKey, number>>

export const QUESTION_TAGS = ['项目深挖', '行为面', '专业题', '反问', '薪资'] as const
export type QuestionTag = (typeof QUESTION_TAGS)[number]

// ---------- 题库弱点 W1–W8 ----------
export type WeaknessCode = 'W1' | 'W2' | 'W3' | 'W4' | 'W5' | 'W6' | 'W7' | 'W8'

export interface WeaknessDef {
  code: WeaknessCode
  key: string
  name: string
  desc: string
}

export const WEAKNESS_DEFS: WeaknessDef[] = [
  { code: 'W1', key: 'act', name: '缺 Action', desc: '只讲了背景和结果，没说「我做了什么」' },
  { code: 'W2', key: 'result', name: '缺 Result', desc: '有动作没有结果，无法判断做成没做成' },
  { code: 'W3', key: 'numnull', name: '全段无数字', desc: '整题没有一个可核对的数字' },
  { code: 'W4', key: 'badmouth', name: '贬低前东家', desc: '出现了贬低前公司 / 前领导的措辞' },
  { code: 'W5', key: 'promise', name: '绝对承诺', desc: '「我保证 / 绝对不会」这类过度承诺' },
  { code: 'W6', key: 'scripted', name: '背题腔', desc: '「作为一名 / 我始终认为」这类模板句' },
  { code: 'W7', key: 'blame', name: '甩锅', desc: '把问题归因于领导 / 同事 / 公司' },
  { code: 'W8', key: 'toolong', name: '超长', desc: '单题 >300 字，一口气讲太长，重点被淹掉' },
]

export const WEAKNESS_MAP: Record<WeaknessCode, WeaknessDef> = WEAKNESS_DEFS.reduce(
  (acc, w) => {
    acc[w.code] = w
    return acc
  },
  {} as Record<WeaknessCode, WeaknessDef>,
)

// ---------- Offer 四维评分 ----------
export const OFFER_SCORE_KEYS = [
  { key: 'money', label: '钱' },
  { key: 'growth', label: '成长' },
  { key: 'stability', label: '稳定' },
  { key: 'life', label: '生活' },
] as const
export type OfferScoreKey = (typeof OFFER_SCORE_KEYS)[number]['key']

// ---------- AI / 题目分析 ----------
export const ANALYSIS_STATUSES = ['pending', 'running', 'done', 'failed'] as const
export type AnalysisStatus = (typeof ANALYSIS_STATUSES)[number]

export type LinkType = 'merge' | 'split'
