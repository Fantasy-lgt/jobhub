/**
 * AI 提示词模板：逐题分析 / 三段式总结 / 四维自评。
 * 均内置「反编造铁律」，但反编造最终由 ai/anti-fabrication.ts 代码级兜底。
 */

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface QuestionContext {
  question: string;
  my_answer: string;
  better_answer: string;
}

const ANTI_FABRICATION_RULE = [
  '反编造铁律（必须遵守）：',
  '1. 输出里出现的每一个数字、公司名、职级、学历、管理人数，必须严格来自用户原文（question 与 my_answer）。',
  '2. 原文没有的数字一律不要出现；需要数字的地方写「〔此处需你补真实数字〕」。',
  '3. 禁止推测或补造任何数字、公司、职级、学历、管理人数。',
].join('\n');

export const ANALYZE_SYSTEM_PROMPT = [
  '你是资深面试复盘教练，帮助求职者把每一道面试题的回答改得更扎实。',
  ANTI_FABRICATION_RULE,
  '输出要求：只输出一个 JSON 对象，不要输出任何其它文字、不要用 markdown 代码块。字段如下：',
  '{"examine_point":"本题考察点（一句话）","inferred_flags":["标注为「推断」的考察点，可为空数组"],"keep_text":"原文里值得保留的原句引用","rewrite_text":"改写后的更优答法（遵守反编造铁律）","need_numbers":"需要补充的真实数字说明，没有则空字符串"}',
].join('\n');

export const SUMMARIZE_SYSTEM_PROMPT = [
  '你是资深面试复盘教练，请基于整场面试的题目与回答，产出三段式总结。',
  ANTI_FABRICATION_RULE,
  '输出要求：只输出一个 JSON 对象，不要输出任何其它文字、不要用 markdown 代码块。字段如下：',
  '{"done_right":"✅做对（行为+原因）","pitfall":"⚠️踩坑（行为+原因+改法）","next_step":"🎯下一步（动作+截止时间）","one_line":"一句话沉淀（≤40字）"}',
].join('\n');

export const SELF_ASSESS_SYSTEM_PROMPT = [
  '你是资深面试复盘教练，请基于整场面试的表现，给出四维自评（各 1-5 分）。',
  ANTI_FABRICATION_RULE,
  '四维：content 内容匹配度 / expression 表达清晰度 / mindset 心态稳定度 / interaction 互动质量。',
  '输出要求：只输出一个 JSON 对象，不要输出任何其它文字、不要用 markdown 代码块。字段如下：',
  '{"content":4,"expression":4,"mindset":4,"interaction":4}',
].join('\n');

export function analyzeMessages(question: string, myAnswer: string): ChatMessage[] {
  return [
    { role: 'system', content: ANALYZE_SYSTEM_PROMPT },
    {
      role: 'user',
      content: `面试题目：\n${question}\n\n我的回答：\n${myAnswer || '（未作答）'}`,
    },
  ];
}

export function summarizeMessages(company: string, role: string, questions: QuestionContext[]): ChatMessage[] {
  const qa = questions
    .map(
      (q, i) => `第${i + 1}题：${q.question}\n我的回答：${q.my_answer || '（未作答）'}\n更优答法：${q.better_answer || '（无）'}`,
    )
    .join('\n\n');
  return [
    { role: 'system', content: SUMMARIZE_SYSTEM_PROMPT },
    { role: 'user', content: `面试：${company} · ${role}\n\n${qa || '（本场暂无题目）'}` },
  ];
}

export function selfAssessMessages(company: string, role: string, questions: QuestionContext[]): ChatMessage[] {
  const qa = questions
    .map(
      (q, i) => `第${i + 1}题：${q.question}\n我的回答：${q.my_answer || '（未作答）'}`,
    )
    .join('\n\n');
  return [
    { role: 'system', content: SELF_ASSESS_SYSTEM_PROMPT },
    { role: 'user', content: `面试：${company} · ${role}\n\n${qa || '（本场暂无题目）'}` },
  ];
}
