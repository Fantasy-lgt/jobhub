/**
 * 反编造校验（纯函数，可对历史报告重跑审计）。
 *
 * 铁律：改写中出现的每个数字、公司名、职级、学历、管理人数，
 * 必须能在原文（question + my_answer）找到出处；找不到即违规。
 * 绝不补造数字——违规项由上层删句或降级为「⚠ 此处需你补真实数字」。
 */

export type FactType = 'number' | 'company' | 'title' | 'education' | 'headcount';

export interface Violation {
  type: FactType;
  value: string;
  reason: string;
}

export interface ValidateResult {
  safe: boolean;
  violations: Violation[];
}

// ---------- 提取器：从文本中抽「事实型」片段 ----------

const ARABIC_NUMBER = /\d+(?:\.\d+)?(?:%|％|[万亿千百]|[kKwW])?/g;
const CN_NUMBER =
  /[一二三四五六七八九十百千万亿两]+(?:万|千|百|十|亿|人|个|天|月|年|元|%|％|倍)/g;

const COMPANY_SUFFIX =
  '公司|集团|科技|网络|软件|信息|技术|金融|银行|证券|汽车|医药|医疗|教育|电商|云计算|云|游戏|传媒|文化|能源|制造';
const COMPANY_RE = new RegExp(`[A-Za-z0-9\\u4e00-\\u9fa5]{2,20}(?:${COMPANY_SUFFIX})`, 'g');
const COMPANY_EN_RE = /\b[A-Z][a-zA-Z]{2,}\b/g;

const TITLE_WORDS = [
  '高级工程师', '资深工程师', '初级工程师', '中级工程师', '主管', '经理', '总监', '专家',
  '负责人', '工程师', '架构师', '科学家', '研究员', 'Leader', 'VP', 'CTO', 'CEO', 'COO',
  'CFO', 'Head', '高级', '资深', '初级', '中级',
];
const TITLE_LEVEL_RE = /\b[PTMLDE]\d{1,2}(?:-\d{1,2})?\b/g;

const EDUCATION_WORDS = [
  '博士', '硕士', '本科', '大专', '专科', '研究生', '博士后', '学士', '985', '211', '海归', '留学生',
];

const HEADCOUNT_RE = /(?:管理|带领|带|团队|负责|下属|团队规模)\s*[\d一二三四五六七八九十百千万]+\s*人/g;

function extractNumbers(text: string): string[] {
  const out: string[] = [];
  for (const re of [ARABIC_NUMBER, CN_NUMBER]) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const token = m[0];
      const prev = text[m.index - 1] ?? '';
      // 跳过「第 N」枚举与「1)」列表序号
      if (prev === '第' || prev === '#' || prev === '·') continue;
      out.push(token);
    }
  }
  return out;
}

function extractCompanies(text: string): string[] {
  const out: string[] = [];
  for (const re of [COMPANY_RE, COMPANY_EN_RE]) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) out.push(m[0]);
  }
  return out;
}

function extractTitles(text: string): string[] {
  const out: string[] = [];
  for (const w of TITLE_WORDS) {
    if (text.includes(w)) out.push(w);
  }
  TITLE_LEVEL_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = TITLE_LEVEL_RE.exec(text)) !== null) out.push(m[0]);
  return out;
}

function extractEducation(text: string): string[] {
  return EDUCATION_WORDS.filter((w) => text.includes(w));
}

function extractHeadcount(text: string): string[] {
  HEADCOUNT_RE.lastIndex = 0;
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = HEADCOUNT_RE.exec(text)) !== null) out.push(m[0]);
  return out;
}

// ---------- 出处核对 ----------

/** 去空白 + 全半角统一，做包含判断用。 */
function normalize(s: string): string {
  return s.replace(/\s+/g, '');
}

/** 数字 token 是否能在原文找到出处（先查整 token，再查纯数字）。 */
function numberHasSource(originalNorm: string, token: string): boolean {
  if (originalNorm.includes(normalize(token))) return true;
  const digits = token.match(/\d+(?:\.\d+)?/);
  if (digits && originalNorm.includes(digits[0])) return true;
  return false;
}

/** 逐项核对，找不到出处的片段判违规。 */
export function validateRewrite(original: string, rewrite: string): ValidateResult {
  const originalNorm = normalize(original || '');
  const violations: Violation[] = [];

  for (const value of extractNumbers(rewrite)) {
    if (!numberHasSource(originalNorm, value)) {
      violations.push({ type: 'number', value, reason: `数字「${value}」在原文中找不到出处` });
    }
  }

  for (const value of extractCompanies(rewrite)) {
    if (!originalNorm.includes(normalize(value))) {
      violations.push({ type: 'company', value, reason: `公司名「${value}」在原文中找不到出处` });
    }
  }

  for (const value of extractTitles(rewrite)) {
    if (!originalNorm.includes(value)) {
      violations.push({ type: 'title', value, reason: `职级「${value}」在原文中找不到出处` });
    }
  }

  for (const value of extractEducation(rewrite)) {
    if (!originalNorm.includes(value)) {
      violations.push({ type: 'education', value, reason: `学历「${value}」在原文中找不到出处` });
    }
  }

  for (const value of extractHeadcount(rewrite)) {
    const digits = value.match(/\d+/)?.[0] ?? '';
    const cn = value.match(/[一二三四五六七八九十百千万]+/)?.[0] ?? '';
    const hasSource =
      originalNorm.includes(normalize(value)) ||
      (digits && originalNorm.includes(digits)) ||
      (cn && originalNorm.includes(cn));
    if (!hasSource) {
      violations.push({ type: 'headcount', value, reason: `管理人数「${value}」在原文中找不到出处` });
    }
  }

  return { safe: violations.length === 0, violations };
}

/**
 * 把改写中的违规事实降级为占位符（不补造数字）：
 * - 数字违规 → 「〔此处需补真实数字〕」
 * - 公司/职级/学历/管理人数 → 「〔xxx需核实〕」
 */
export function sanitizeRewrite(rewrite: string, violations: Violation[]): string {
  let out = rewrite;
  const unique = [...new Map(violations.map((v) => [v.value, v])).values()];
  unique.sort((a, b) => b.value.length - a.value.length);
  for (const v of unique) {
    const placeholder = v.type === 'number' ? '〔此处需补真实数字〕' : `〔${v.value}需核实〕`;
    out = out.split(v.value).join(placeholder);
  }
  return out;
}
