/**
 * 金额工具：统一以「分」为整数存储/计算，禁止浮点直接相加。
 * 展示层再转元/K，此处只做换算，不做金额累加。
 */

const FEN_PER_YUAN = 100; // 1 元 = 100 分
const FEN_PER_K = 100_000; // 1 K（千元）= 100000 分

/** 元 → 分（四舍五入取整，消除浮点误差） */
export function yuanToFen(yuan: number): number {
  if (!Number.isFinite(yuan)) return 0;
  return Math.round(yuan * FEN_PER_YUAN);
}

/** 分 → 元（仅用于展示，可能带小数） */
export function fenToYuan(fen: number): number {
  if (!Number.isFinite(fen)) return 0;
  return fen / FEN_PER_YUAN;
}

/** 分 → K（千元，仅用于展示） */
export function fenToK(fen: number): number {
  if (!Number.isFinite(fen)) return 0;
  return fen / FEN_PER_K;
}

/** 分 → 元文本（整数，四舍五入） */
export function fenToYuanText(fen: number): string {
  return String(Math.round(fenToYuan(fen)));
}

/** 分 → K 文本，如 "20K" / "20.5K" */
export function fenToKText(fen: number, digits = 0): string {
  return `${fenToK(fen).toFixed(digits)}K`;
}

/** 字符串元 → 分（容忍千分位逗号、全角逗号） */
export function yuanTextToFen(text: string | number): number {
  const n = Number(String(text).replace(/[,，\s]/g, ''));
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * FEN_PER_YUAN);
}

/** 字符串 K → 分（"20K"、"20.5"） */
export function kTextToFen(text: string | number): number {
  const s = String(text).replace(/[,，\s]/g, '');
  const k = Number(s.replace(/[kK千]/g, ''));
  if (!Number.isFinite(k)) return 0;
  return Math.round(k * FEN_PER_K);
}

/** 整数分安全相加（规避浮点累加误差；入参均为整数分） */
export function sumFen(values: number[]): number {
  return values.reduce((acc, v) => acc + Math.round(v), 0);
}
