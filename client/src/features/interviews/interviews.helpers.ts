import { WEAKNESS_MAP } from '../../types'
import type { WeaknessCode } from '../../types'

/**
 * 雷区四类关键词（与后端 machine-check.ts 的 detectRedFlags 对齐）。
 * 仅用于前端「标注原句」展示；「是否命中」以后端 weakness_codes 为准。
 */
const RED_FLAG_RULES: { code: WeaknessCode; groups: string[][] }[] = [
  {
    code: 'W4',
    groups: [
      ['前东家', '前公司', '上家', '上家公司', '老东家', '前老板', '前领导', '前团队', '前同事', '前司', '前一家'],
      ['很差', '太差', '垃圾', '坑', '烂', '傻', '蠢', '不行', '抠', '压榨', '无语', '离谱', '混乱', '内斗', '恶心', '背锅', '画饼', '空头支票', '不靠谱', '抠门', '加班狂', '血汗', '水很深', '一言难尽', '活不下去', '待不下去'],
    ],
  },
  {
    code: 'W5',
    groups: [['一定', '肯定', '保证', '绝对', '百分之百', '100%', '必然', '绝不', '决不', '永不', '肯定能', '一定能', '保证能', '绝对能', '包你', '包您']],
  },
  {
    code: 'W6',
    groups: [['面试官您好', '感谢您的提问', '感谢提问', '这个问题问得很好', '问得非常好', '很高兴回答', '以下几个方面', '首先其次', '综上所述', '众所周知', '我的优势有以下', '我认为这个问题']],
  },
  {
    code: 'W7',
    groups: [['都怪', '不是我的问题', '不关我的事', '是他们的错', '是团队的错', '是领导的错', '是同事的错', '他们没做好', '别人的问题', '怪他们', '责任不在我', '是别人的锅', '跟我没关系', '不是我的责任']],
  },
]

export interface RedFlagHit {
  code: WeaknessCode
  sentence: string
}

/** 在回答里定位雷区原句（每类最多一句）。 */
export function findRedFlagHits(myAnswer: string): RedFlagHit[] {
  const sentences = (myAnswer || '')
    .split(/[。！？!?；;\n]+/)
    .map((s) => s.trim())
    .filter(Boolean)
  const hits: RedFlagHit[] = []
  for (const rule of RED_FLAG_RULES) {
    for (const s of sentences) {
      if (rule.groups.every((group) => group.some((kw) => s.includes(kw)))) {
        hits.push({ code: rule.code, sentence: s })
        break
      }
    }
  }
  return hits
}

export function weaknessLabel(code: WeaknessCode): string {
  return WEAKNESS_MAP[code]?.name ?? code
}

export function weaknessDesc(code: WeaknessCode): string {
  return WEAKNESS_MAP[code]?.desc ?? ''
}

export interface TextSegment {
  text: string
  hl: boolean
}

/** 高亮 AI 改写里的「〔需你补真实…〕」占位符。 */
export function highlightFillIns(text: string): TextSegment[] {
  const re = /〔[^〕]*〕/g
  const segs: TextSegment[] = []
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) {
    if (m.index > last) segs.push({ text: text.slice(last, m.index), hl: false })
    segs.push({ text: m[0], hl: true })
    last = m.index + m[0].length
  }
  if (last < text.length) segs.push({ text: text.slice(last), hl: false })
  return segs.length > 0 ? segs : [{ text, hl: false }]
}
