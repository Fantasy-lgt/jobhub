/**
 * 机检纯函数（不调 AI，纯规则）：STAR 四要素 / 量化 / 雷区四类 / 超长。
 * 结果落库到 interview_questions（has_number / weakness_codes / is_overlong）。
 */
import type { WeaknessCode } from '../constants';

export interface StarResult {
  hasS: boolean;
  hasT: boolean;
  hasA: boolean;
  hasR: boolean;
  missing: WeaknessCode[];
}

export interface RedFlagHit {
  code: WeaknessCode;
  sentence: string;
}

export interface MachineCheckInput {
  s_context?: string | null;
  t_task?: string | null;
  a_action?: string | null;
  r_result?: string | null;
  my_answer: string;
}

export interface MachineCheckResult {
  star: StarResult;
  hasNumber: boolean;
  weaknessCodes: WeaknessCode[];
  redFlags: RedFlagHit[];
  isOverlong: boolean;
  answerLength: number;
}

const OVERLONG_THRESHOLD = 300;

/** 阿拉伯数字 */
const ARABIC_NUMBER = /\d/;
/** 中文数字 + 单位/量词（避免「第一次」「一方面」误判） */
const CN_QUANTIFIED =
  /[一二三四五六七八九十百千万亿两]+(?:万|千|百|十|亿|人|个|天|月|年|元|块|%|％|倍|k|K|万)/;

/** 按句子切分（中英文标点 + 换行） */
function splitSentences(text: string): string[] {
  return text
    .split(/[。！？!?；;\n]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/** 是否包含「数字」（量化判定） */
export function hasAnyNumber(text: string): boolean {
  return ARABIC_NUMBER.test(text) || CN_QUANTIFIED.test(text);
}

/** STAR 四要素判定：对应字段非空即存在。 */
export function checkStar(input: MachineCheckInput): StarResult {
  const hasS = !!(input.s_context && input.s_context.trim());
  const hasT = !!(input.t_task && input.t_task.trim());
  const hasA = !!(input.a_action && input.a_action.trim());
  const hasR = !!(input.r_result && input.r_result.trim());
  const missing: WeaknessCode[] = [];
  if (!hasA) missing.push('W1');
  if (!hasR) missing.push('W2');
  return { hasS, hasT, hasA, hasR, missing };
}

// ---- 雷区四类：贬低前东家 / 绝对承诺 / 背题腔 / 甩锅 ----

const FORMER_EMPLOYER_WORDS = [
  '前东家', '前公司', '上家', '上家公司', '老东家', '前老板', '前领导', '前团队',
  '前同事', '前司', '前一家',
];

const DISPARAGE_WORDS = [
  '很差', '太差', '垃圾', '坑', '烂', '傻', '蠢', '不行', '抠', '压榨', '无语', '离谱',
  '混乱', '内斗', '恶心', '背锅', '画饼', '空头支票', '不靠谱', '抠门', '加班狂', '血汗',
  '水很深', '一言难尽', '活不下去', '待不下去',
];

const ABSOLUTE_WORDS = [
  '一定', '肯定', '保证', '绝对', '百分之百', '100%', '必然', '绝不', '决不', '永不',
  '肯定能', '一定能', '保证能', '绝对能', '百分之百能', '包你', '包您',
];

const ROTE_PHRASES = [
  '面试官您好', '感谢您的提问', '感谢提问', '这个问题问得很好', '问得非常好', '很高兴回答',
  '我可以从以下几个方面', '以下几个方面', '首先其次', '综上所述', '众所周知',
  '我的优势有以下', '我认为这个问题', '接下来我将从',
];

const BLAME_WORDS = [
  '都怪', '不是我的问题', '不关我的事', '是他们的错', '是团队的错', '是领导的错',
  '是同事的错', '他们没做好', '别人的问题', '怪他们', '责任不在我', '是别人的锅',
  '跟我没关系', '不是我的责任',
];

function detectByKeywords(
  text: string,
  keywordGroups: string[][],
): string[] {
  const sentences = splitSentences(text);
  return sentences.filter((sentence) =>
    keywordGroups.every((group) => group.some((kw) => sentence.includes(kw))),
  );
}

function detectDisparage(text: string): string[] {
  return detectByKeywords(text, [FORMER_EMPLOYER_WORDS, DISPARAGE_WORDS]);
}

function detectAbsolutePromise(text: string): string[] {
  return detectByKeywords(text, [ABSOLUTE_WORDS]);
}

function detectRote(text: string): string[] {
  return detectByKeywords(text, [ROTE_PHRASES]);
}

function detectBlameShift(text: string): string[] {
  return detectByKeywords(text, [BLAME_WORDS]);
}

export interface RedFlagDetection {
  hits: RedFlagHit[];
}

/** 雷区检测（定位原句），供落库与下钻复用。 */
export function detectRedFlags(myAnswer: string): RedFlagHit[] {
  const hits: RedFlagHit[] = [];
  for (const sentence of detectDisparage(myAnswer)) hits.push({ code: 'W4', sentence });
  for (const sentence of detectAbsolutePromise(myAnswer)) hits.push({ code: 'W5', sentence });
  for (const sentence of detectRote(myAnswer)) hits.push({ code: 'W6', sentence });
  for (const sentence of detectBlameShift(myAnswer)) hits.push({ code: 'W7', sentence });
  // 去重（同码同句只留一条）
  const seen = new Set<string>();
  return hits.filter((h) => {
    const key = `${h.code}:${h.sentence}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** 全量机检入口。 */
export function machineCheck(input: MachineCheckInput): MachineCheckResult {
  const answer = input.my_answer ?? '';
  const answerLength = Array.from(answer).length;

  const star = checkStar(input);

  const contentForNumber = [answer, input.a_action, input.r_result]
    .filter(Boolean)
    .join(' ');
  const hasNumber = hasAnyNumber(contentForNumber);

  const redFlags = detectRedFlags(answer);
  const isOverlong = answerLength > OVERLONG_THRESHOLD;

  const weaknessCodes: WeaknessCode[] = [];
  if (!star.hasA) weaknessCodes.push('W1');
  if (!star.hasR) weaknessCodes.push('W2');
  if (!hasNumber) weaknessCodes.push('W3');
  for (const hit of redFlags) {
    if (!weaknessCodes.includes(hit.code)) weaknessCodes.push(hit.code);
  }
  if (isOverlong) weaknessCodes.push('W8');

  return { star, hasNumber, weaknessCodes, redFlags, isOverlong, answerLength };
}
