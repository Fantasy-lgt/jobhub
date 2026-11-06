/**
 * 题库聚合纯函数：字符 bigram 相似度 + 规范化 + 反义词冲突 + 手动合并/拆分。
 * 分组在应用层计算，不依赖 DB 扩展。
 */

export const BIGRAM_THRESHOLD = 0.55;

// ---------- 规范化 ----------

/** 剥口语前缀 / 冗余限定词。 */
const ORAL_PREFIXES = [
  '面试官您好', '你好', '您好', '请问', '我想问一下', '想问一下', '想请教一下', '请教一下',
  '那个', '就是', '嗯', '呃', '额', '麻烦问下', '问下', '请问一下', '我就想问',
];

/** 冗余限定词（你的/您的/你/您 等无信息量限定） */
const REDUNDANT_QUALIFIERS = ['您的', '你的', '你们的', '你们的', '你', '您'];

function stripOralPrefixes(text: string): string {
  let result = text;
  for (const p of ORAL_PREFIXES) {
    if (result.startsWith(p)) {
      result = result.slice(p.length);
      break;
    }
  }
  return result;
}

function stripQualifiers(text: string): string {
  let result = text;
  for (const q of REDUNDANT_QUALIFIERS) {
    result = result.replaceAll(q, '');
  }
  return result;
}

/** 规范化：小写 + 去标点空白 + 剥口语前缀 + 去冗余限定词。 */
export function normalizeQuestion(text: string): string {
  let result = (text || '').toLowerCase();
  result = stripOralPrefixes(result);
  result = stripQualifiers(result);
  // 去标点/空白（保留中英文与数字）
  result = result.replace(/[\s，。！？、；：""''（）()【】\[\].,!?;:'"·—…]+/g, '');
  return result;
}

// ---------- bigram ----------

/** 字符 bigram 集合（相邻字符对）。 */
export function bigrams(text: string): Set<string> {
  const chars = Array.from(text);
  const set = new Set<string>();
  for (let i = 0; i < chars.length - 1; i += 1) {
    set.add(chars[i] + chars[i + 1]);
  }
  return set;
}

/** Jaccard 相似度：|A∩B| / |A∪B|。 */
export function bigramSimilarity(a: string, b: string): number {
  const setA = bigrams(a);
  const setB = bigrams(b);
  if (setA.size === 0 && setB.size === 0) return 1;
  let intersection = 0;
  for (const item of setA) {
    if (setB.has(item)) intersection += 1;
  }
  const union = setA.size + setB.size - intersection;
  if (union === 0) return 0;
  return intersection / union;
}

// ---------- 反义词冲突 ----------

/** 反义词对（出现不同侧即强制不合并） */
const ANTONYM_PAIRS: [string, string][] = [
  ['优点', '缺点'],
  ['优势', '劣势'],
  ['强项', '弱项'],
  ['成功', '失败'],
  ['喜欢', '不喜欢'],
  ['接受', '拒绝'],
  ['擅长', '不擅长'],
];

/** 两题是否命中反义词冲突（分属同一对的两侧）。 */
export function areAntonyms(a: string, b: string): boolean {
  for (const [left, right] of ANTONYM_PAIRS) {
    const aLeft = a.includes(left);
    const aRight = a.includes(right);
    const bLeft = b.includes(left);
    const bRight = b.includes(right);
    // a 在左、b 在右（或反之）→ 冲突
    if ((aLeft && bRight) || (aRight && bLeft)) return true;
  }
  return false;
}

// ---------- 分组 ----------

export interface QuestionItem {
  id: number;
  question: string;
}

export interface QuestionLink {
  question_a_id: number;
  question_b_id: number;
  link_type: 'merge' | 'split';
}

/** 并查集 */
class UnionFind {
  private parent = new Map<number, number>();

  find(x: number): number {
    let root = x;
    while (this.parent.has(root) && this.parent.get(root) !== root) {
      root = this.parent.get(root)!;
    }
    // 路径压缩
    let cur = x;
    while (this.parent.has(cur) && this.parent.get(cur) !== cur) {
      const next = this.parent.get(cur)!;
      this.parent.set(cur, root);
      cur = next;
    }
    return root;
  }

  union(a: number, b: number): void {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra === rb) return;
    this.parent.set(rb, ra);
  }
}

/**
 * 计算分组：
 * 1) 相似度 ≥ 阈值 且非反义词 → 同组；merge 链接 → 强制同组；
 * 2) split 链接 → 强制拆开（把 b 移到独立新组）。
 * 返回 groupId → 题目 id 列表。
 */
export function computeGroups(
  items: QuestionItem[],
  links: QuestionLink[] = [],
): Map<string, number[]> {
  const ids = items.map((i) => i.id);
  const byId = new Map(items.map((i) => [i.id, i]));
  const normalized = new Map(items.map((i) => [i.id, normalizeQuestion(i.question)]));

  const uf = new UnionFind();
  ids.forEach((id) => uf.find(id)); // 初始化

  // 相似度边
  for (let i = 0; i < ids.length; i += 1) {
    for (let j = i + 1; j < ids.length; j += 1) {
      const a = ids[i];
      const b = ids[j];
      const sim = bigramSimilarity(normalized.get(a)!, normalized.get(b)!);
      const conflict = areAntonyms(normalized.get(a)!, normalized.get(b)!);
      if (sim >= BIGRAM_THRESHOLD && !conflict) {
        uf.union(a, b);
      }
    }
  }

  // merge 链接：强制同组
  const splitEdges: QuestionLink[] = [];
  for (const link of links) {
    if (link.link_type === 'merge') {
      if (byId.has(link.question_a_id) && byId.has(link.question_b_id)) {
        uf.union(link.question_a_id, link.question_b_id);
      }
    } else if (link.link_type === 'split') {
      splitEdges.push(link);
    }
  }

  // 生成初始分组
  const groups = new Map<number, number[]>();
  for (const id of ids) {
    const root = uf.find(id);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root)!.push(id);
  }

  // split 链接：强制拆开
  for (const edge of splitEdges) {
    const a = edge.question_a_id;
    const b = edge.question_b_id;
    if (!byId.has(a) || !byId.has(b)) continue;
    const rootA = uf.find(a);
    const rootB = uf.find(b);
    if (rootA === rootB) {
      const members = groups.get(rootA) ?? [];
      // 把 b 单独拆出（其余留在原组）
      groups.set(rootA, members.filter((x) => x !== b));
      groups.set(b, [b]);
      // 调整 uf：b 独立成根
      uf.union(b, b);
    }
  }

  // 移除空组，转成稳定字符串 key（按最小 id 排序）
  const result = new Map<string, number[]>();
  for (const [root, members] of groups.entries()) {
    if (members.length === 0) continue;
    const sorted = [...members].sort((x, y) => x - y);
    result.set(String(sorted[0]), sorted);
  }
  return result;
}
