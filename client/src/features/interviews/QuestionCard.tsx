import { Button, Pill } from '../../components'
import type { InterviewQuestion, QuestionAnalysis, WeaknessCode } from '../../types'
import { findRedFlagHits, highlightFillIns, weaknessLabel } from './interviews.helpers'

interface QuestionCardProps {
  q: InterviewQuestion
  analysis?: QuestionAnalysis | null
  analyzing: boolean
  streamText: string
  onAnalyze: (qid: number) => void
}

function StarBox({ label, ok }: { label: string; ok: boolean }) {
  return (
    <span
      className="jh-star-box"
      style={{
        color: ok ? 'var(--green)' : 'var(--muted)',
        borderColor: ok ? 'var(--green)' : 'var(--muted)',
      }}
    >
      {label} {ok ? '✓' : '✗'}
    </span>
  )
}

/** 单题卡片：题目/回答 + 机检展示（STAR/量化/雷区/超长）+ AI 逐题分析。 */
export function QuestionCard({ q, analysis, analyzing, streamText, onAnalyze }: QuestionCardProps) {
  const redFlagCodes: WeaknessCode[] = (q.weakness_codes ?? []).filter((c) =>
    ['W4', 'W5', 'W6', 'W7'].includes(c),
  ) as WeaknessCode[]
  const redHits = findRedFlagHits(q.my_answer ?? '')

  return (
    <div className="jh-question">
      <div className="jh-question__q">
        <span style={{ fontWeight: 700 }}>Q：{q.question}</span>
        {q.tag ? <Pill color="blue">{q.tag}</Pill> : null}
      </div>

      {/* 机检展示 */}
      <div className="jh-mcheck">
        <div className="jh-star-grid">
          <StarBox label="S" ok={!!q.s_context} />
          <StarBox label="T" ok={!!q.t_task} />
          <StarBox label="A" ok={!!q.a_action} />
          <StarBox label="R" ok={!!q.r_result} />
          <Pill color={q.has_number ? 'green' : 'amber'}>
            {q.has_number ? '✓ 有数字' : '✗ 无数字'}
          </Pill>
          {q.is_overlong ? <Pill color="pink">超长 {q.is_overlong ? '>300 字' : ''}</Pill> : null}
        </div>

        {q.my_answer ? (
          <div className="jh-mcheck__answer">
            <span className="jh-label">我的回答</span>
            <span style={{ fontSize: 13, whiteSpace: 'pre-wrap' }}>{q.my_answer}</span>
          </div>
        ) : null}

        {redFlagCodes.length > 0 ? (
          <div className="jh-redflags">
            {redFlagCodes.map((code) => {
              const hit = redHits.find((h) => h.code === code)
              return (
                <div key={code} className="jh-redflag">
                  <Pill color="pink">{weaknessLabel(code)}</Pill>
                  {hit ? <span className="jh-redflag__sentence">「{hit.sentence}」</span> : null}
                </div>
              )
            })}
          </div>
        ) : null}

        {q.better_answer ? (
          <div className="jh-mcheck__answer">
            <span className="jh-label">更优答法</span>
            <span style={{ fontSize: 13, whiteSpace: 'pre-wrap' }}>{q.better_answer}</span>
          </div>
        ) : null}
      </div>

      {/* AI 分析 */}
      <div className="jh-ai">
        {analyzing ? (
          <div className="jh-ai__stream">
            <span className="jh-label">AI 分析中（逐字）…</span>
            <div className="jh-ai__stream-text">{streamText || '…'}</div>
          </div>
        ) : analysis ? (
          <div className="jh-ai__result">
            <div className="jh-ai__row">
              <span className="jh-label">考察点</span>
              <span style={{ fontSize: 13 }}>{analysis.examine_point}</span>
            </div>
            {(analysis.inferred_flags ?? []).length > 0 ? (
              <div className="jh-ai__row">
                <span className="jh-label">推断标注</span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {analysis.inferred_flags.map((f, i) => (
                    <Pill key={i} color="amber">
                      ⚠️ {f}
                    </Pill>
                  ))}
                </div>
              </div>
            ) : null}
            {analysis.keep_text ? (
              <div className="jh-ai__row">
                <span className="jh-label">保留原句</span>
                <span style={{ fontSize: 13 }}>{analysis.keep_text}</span>
              </div>
            ) : null}
            {analysis.rewrite_text ? (
              <div className="jh-ai__row">
                <span className="jh-label">改写</span>
                <span style={{ fontSize: 13, lineHeight: 1.8 }}>
                  {highlightFillIns(analysis.rewrite_text).map((seg, i) =>
                    seg.hl ? (
                      <mark key={i} className="jh-ai__hl">
                        {seg.text}
                      </mark>
                    ) : (
                      <span key={i}>{seg.text}</span>
                    ),
                  )}
                </span>
              </div>
            ) : null}
            {analysis.need_numbers ? (
              <div className="jh-ai__row">
                <span className="jh-label">需补数字</span>
                <span style={{ fontSize: 13, color: 'var(--amber)' }}>{analysis.need_numbers}</span>
              </div>
            ) : null}
          </div>
        ) : (
          <Button size="sm" variant="primary" onClick={() => onAnalyze(q.id)}>
            ✨ AI 分析
          </Button>
        )}
      </div>
    </div>
  )
}
