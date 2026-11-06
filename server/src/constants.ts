/**
 * 后端集中常量：11 态状态值、6 阶段组映射、W1–W8 弱点码、渠道/轮次等。
 * 前后端各持一份类型（前端 types/ 与之对齐）。
 */

// ---- 岗位 11 态（存英文码，展示层转中文） ----
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
] as const;

export type AppStatus = (typeof APP_STATUSES)[number];

export const APP_STATUS_LABELS: Record<AppStatus, string> = {
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
};

// ---- 6 阶段组 ----
export interface StageGroup {
  key: string;
  label: string;
  statuses: AppStatus[];
}

export const STAGE_GROUPS: StageGroup[] = [
  { key: 'pending', label: '待投组', statuses: ['pending'] },
  { key: 'applied', label: '已投组', statuses: ['applied'] },
  { key: 'written', label: '笔试组', statuses: ['written'] },
  { key: 'interview', label: '面试组', statuses: ['first', 'second', 'third', 'hr'] },
  { key: 'offer', label: 'Offer组', statuses: ['offer'] },
  { key: 'closed', label: '关闭组', statuses: ['rejected', 'failed', 'dropped'] },
];

/** 状态 → 阶段组 key */
export const STATUS_TO_GROUP: Record<AppStatus, string> = Object.fromEntries(
  STAGE_GROUPS.flatMap((g) => g.statuses.map((s) => [s, g.key])),
) as Record<AppStatus, string>;

/** 关闭组（已结束）状态 */
export const CLOSED_STATUSES: AppStatus[] = ['rejected', 'failed', 'dropped'];
/** 进行中状态（已投但未结束） */
export const ACTIVE_STATUSES: AppStatus[] = [
  'pending',
  'applied',
  'written',
  'first',
  'second',
  'third',
  'hr',
  'offer',
];
/** 面试阶段组状态 */
export const INTERVIEW_STATUSES: AppStatus[] = ['first', 'second', 'third', 'hr'];

// ---- 停滞超阈值（天）：进行中且距上次变更超过阈值即「停滞」 ----
export const STALL_THRESHOLD_DAYS: Record<AppStatus, number> = {
  pending: 14,
  applied: 7,
  written: 7,
  first: 10,
  second: 10,
  third: 10,
  hr: 10,
  offer: 7,
  rejected: 0,
  failed: 0,
  dropped: 0,
};

// ---- W1–W8 弱点码（来自机检结果） ----
export const WEAKNESS_CODES = ['W1', 'W2', 'W3', 'W4', 'W5', 'W6', 'W7', 'W8'] as const;
export type WeaknessCode = (typeof WEAKNESS_CODES)[number];

export const WEAKNESS_LABELS: Record<WeaknessCode, string> = {
  W1: '缺 Action',
  W2: '缺 Result',
  W3: '全段无数字',
  W4: '贬低前东家',
  W5: '绝对承诺',
  W6: '背题腔',
  W7: '甩锅',
  W8: '超长',
};

export const WEAKNESS_DESC: Record<WeaknessCode, string> = {
  W1: '只讲了背景和结果，没说「我做了什么」',
  W2: '有动作没有结果，无法判断做成没做成',
  W3: '整题没有一个可核对的数字',
  W4: '出现了贬低前公司 / 前领导的措辞',
  W5: '「我保证 / 绝对不会」这类过度承诺',
  W6: '「作为一名 / 我始终认为」这类模板句',
  W7: '把问题归因于领导 / 同事 / 公司',
  W8: '单题 >300 字，一口气讲太长，重点被淹掉',
};

// ---- 渠道 / 轮次 / 办公方式 / 面试形式 / 面试结果 ----
export const CHANNELS = ['猎头', '内推', 'BOSS直聘', '官网', '招聘平台', '其他'] as const;
export const INTERVIEW_ROUNDS = ['一面', '二面', '三面', 'HR面', '交叉面', '终面'] as const;
export const WORK_MODES = ['远程', '混合', '坐班'] as const;
export const INTERVIEW_FORMATS = ['电话', '视频', '现场'] as const;
export const INTERVIEW_RESULTS = ['等通知', '通过', '未通过'] as const;

// ---- 简历命中率：该版本投递中「至少进入面试阶段」的比例 ----
export const RESUME_HIT_INTERVIEW_STATUSES: AppStatus[] = INTERVIEW_STATUSES;

// ---- 漏斗可达阶段（由 app_events + 当前状态推导） ----
export const FUNNEL_WRITTEN_STATUSES: AppStatus[] = [
  'written',
  'first',
  'second',
  'third',
  'hr',
  'offer',
];
export const FUNNEL_INTERVIEW_STATUSES: AppStatus[] = INTERVIEW_STATUSES;

// ---- AI 任务状态机 ----
export const ANALYSIS_STATUSES = ['pending', 'running', 'done', 'failed'] as const;
export type AnalysisStatus = (typeof ANALYSIS_STATUSES)[number];

// ---- 默认 5 阶段路线图 ----
export const DEFAULT_ROADMAP_STAGES: { title: string; description: string }[] = [
  {
    title: '定位与弹药',
    description: '写清求职定位、打磨简历版本、梳理核心卖点与短板补强计划。',
  },
  {
    title: '渠道铺设',
    description: '铺开猎头/内推/招聘平台/官网渠道，建立投递节奏。',
  },
  {
    title: '面试冲刺',
    description: '集中面试，逐题复盘，补齐 STAR 与量化短板。',
  },
  {
    title: 'Offer 与谈判',
    description: '对比 Offer，算清年包，谈判薪资与入职条件。',
  },
  {
    title: '交接与入职',
    description: '提离职、交接、背调与社保公积金衔接。',
  },
];

export const DEFAULT_ROADMAP_TASKS: string[][] = [
  ['写一句话自我介绍', '确定主投 + 备投岗位', '完成 3 条带证据的核心卖点'],
  ['整理内推人清单', '完善 2 个渠道的招聘账号', '本周投递 5 家'],
  ['复盘 1 场面试', '补全 STAR 四要素', '整理 3 道高频题更优答法'],
  ['算清到手年包', '确认离职通知期', '谈定 1 个关键条件'],
  ['提交离职申请', '完成工作交接', '确认背调与社保衔接'],
];
