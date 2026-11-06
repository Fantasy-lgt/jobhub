import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, EmptyState, ErrorRetry, Modal, Pill, StarRating } from '../../components'
import { aiApi, interviewsApi } from '../../api/endpoints'
import { useUiStore } from '../../stores/ui'
import { SELF_SCORE_KEYS } from '../../types'
import type { Interview, SelfScores } from '../../types'
import { formatDate } from '../../utils/date'
import { QuestionCard } from './QuestionCard'
import { ManualQuestionModal, RecallModal } from './QuestionEntryModal'

interface InterviewDetailDrawerProps {
  interviewId: number | null
  onClose: () => void
  onEdit: (iv: Interview) => void
  onDelete: (iv: Interview) => void
}

function resultColor(r: string): 'green' | 'amber' | 'pink' | 'neutral' {
  if (r === '通过') return 'green'
  if (r === '未通过') return 'pink'
  if (r === '等通知') return 'amber'
  return 'neutral'
}

/** 面试详情：三段总结 + 四维自评 + 题目机检 + AI 逐题分析 + 贴回忆拆题。 */
export function InterviewDetailDrawer({ interviewId, onClose, onEdit, onDelete }: InterviewDetailDrawerProps) {
  const qc = useQueryClient()
  const pushToast = useUiStore((s) => s.pushToast)

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['interview-detail', interviewId],
    queryFn: () => interviewsApi.detail(interviewId as number),
    enabled: interviewId !== null,
  })

  const [analyzingQid, setAnalyzingQid] = useState<number | null>(null)
  const [streamText, setStreamText] = useState('')
  const [summarizing, setSummarizing] = useState(false)
  const [summarizeStream, setSummarizeStream] = useState('')
  const [scores, setScores] = useState<SelfScores>({})
  const [savingScores, setSavingScores] = useState(false)
  const [showManual, setShowManual] = useState(false)
  const [showRecall, setShowRecall] = useState(false)

  useEffect(() => {
    if (data?.interview.self_scores) setScores(data.interview.self_scores)
    else setScores({})
  }, [data?.interview.self_scores])

  const refresh = (): void => {
    void qc.invalidateQueries({ queryKey: ['interview-detail', interviewId] })
    void qc.invalidateQueries({ queryKey: ['interviews'] })
  }

  const analyze = async (qid: number): Promise<void> => {
    setAnalyzingQid(qid)
    setStreamText('')
    await aiApi.analyzeQuestion(qid, {
      onEvent: (ev, data) => {
        if (ev === 'delta') {
          setStreamText((s) => s + (((data as { text?: string })?.text) ?? ''))
        }
        if (ev === 'done') {
          setAnalyzingQid(null)
          setStreamText('')
          refresh()
          pushToast({ message: 'AI 分析完成', kind: 'success' })
        }
      },
      onError: (err) => {
        setAnalyzingQid(null)
        setStreamText('')
        pushToast({ message: `AI 不可用（仅机检模式）：${err.message}`, kind: 'error' })
      },
    })
  }

  const summarize = async (): Promise<void> => {
    setSummarizing(true)
    setSummarizeStream('')
    await aiApi.summarize(interviewId as number, {
      onEvent: (ev, data) => {
        if (ev === 'delta') {
          setSummarizeStream((s) => s + (((data as { text?: string })?.text) ?? ''))
        }
        if (ev === 'done') {
          setSummarizing(false)
          setSummarizeStream('')
          refresh()
          pushToast({ message: '三段式总结已生成', kind: 'success' })
        }
      },
      onError: (err) => {
        setSummarizing(false)
        setSummarizeStream('')
        pushToast({ message: `AI 不可用（仅机检模式）：${err.message}`, kind: 'error' })
      },
    })
  }

  const saveScores = async (): Promise<void> => {
    if (!scores.content || !scores.expression || !scores.mindset || !scores.interaction) return
    setSavingScores(true)
    try {
      await interviewsApi.selfAssess(interviewId as number, scores)
      pushToast({ message: '自评已保存', kind: 'success' })
      refresh()
    } catch {
      // 已 toast
    } finally {
      setSavingScores(false)
    }
  }

  const open = interviewId !== null
  const iv = data?.interview

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={iv ? `${iv.company} · ${iv.role}` : '面试详情'}
      footer={
        iv ? (
          <>
            <Button variant="danger" onClick={() => onDelete(iv)}>
              删除
            </Button>
            <Button variant="secondary" onClick={onClose}>
              关闭
            </Button>
            <Button variant="primary" onClick={() => onEdit(iv)}>
              编辑
            </Button>
          </>
        ) : undefined
      }
    >
      {isLoading ? (
        <div className="jh-loading">
          <span className="jh-spinner" aria-hidden /> 加载中…
        </div>
      ) : isError || !data ? (
        <ErrorRetry onRetry={() => void refetch()} />
      ) : (
        <div className="jh-form">
          {/* 头部 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <Pill color="brand">{data.interview.round}</Pill>
            <Pill color={resultColor(data.interview.result)}>{data.interview.result}</Pill>
            {data.interview.format ? <Pill color="blue">{data.interview.format}</Pill> : null}
            {data.interview.scheduled_at ? <Pill color="neutral">{formatDate(data.interview.scheduled_at)}</Pill> : null}
            {data.interview.interviewer ? <span style={{ fontSize: 13, color: 'var(--sub)' }}>面试官：{data.interview.interviewer}</span> : null}
          </div>

          {/* 三段式总结 */}
          <div>
            <div className="jh-sec-title">
              📝 三段式总结{' '}
              <span className="sub">AI 生成，可反复重跑</span>
              <span style={{ marginLeft: 'auto' }}>
                <Button size="sm" variant="primary" onClick={() => void summarize()} loading={summarizing}>
                  ✨ AI 总结
                </Button>
              </span>
            </div>
            {summarizing ? (
              <div className="jh-ai__stream" style={{ marginTop: 10 }}>
                <div className="jh-ai__stream-text">{summarizeStream || '生成中…'}</div>
              </div>
            ) : (
              <div className="jh-summary" style={{ marginTop: 10 }}>
                <div className="jh-summary__item">
                  <span className="jh-label">✅ 做对</span>
                  <span style={{ fontSize: 13, whiteSpace: 'pre-wrap' }}>{data.interview.done_right || '（待 AI 总结）'}</span>
                </div>
                <div className="jh-summary__item">
                  <span className="jh-label">⚠️ 踩坑</span>
                  <span style={{ fontSize: 13, whiteSpace: 'pre-wrap' }}>{data.interview.pitfall || '（待 AI 总结）'}</span>
                </div>
                <div className="jh-summary__item">
                  <span className="jh-label">🎯 下一步</span>
                  <span style={{ fontSize: 13, whiteSpace: 'pre-wrap' }}>{data.interview.next_step || '（待 AI 总结）'}</span>
                </div>
              </div>
            )}
          </div>

          {/* 四维自评 */}
          <div>
            <div className="jh-sec-title">⭐ 四维自评</div>
            <div className="jh-self-grid" style={{ marginTop: 10 }}>
              {SELF_SCORE_KEYS.map((d) => (
                <div key={d.key} className="jh-field">
                  <label className="jh-label">{d.label}</label>
                  <StarRating
                    value={scores[d.key] ?? 0}
                    onChange={(v) => setScores((s) => ({ ...s, [d.key]: v }))}
                    label={d.label}
                  />
                </div>
              ))}
            </div>
            <div style={{ marginTop: 8 }}>
              <Button size="sm" variant="secondary" onClick={() => void saveScores()} loading={savingScores} disabled={!scores.content || !scores.expression || !scores.mindset || !scores.interaction}>
                保存自评
              </Button>
            </div>
          </div>

          {/* 题目 */}
          <div>
            <div className="jh-sec-title">
              🧩 题目（{data.questions.length}）
              <span className="sub">机检 + AI 逐题分析</span>
              <span style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                <Button size="sm" variant="secondary" onClick={() => setShowManual(true)}>
                  ＋ 手工录题
                </Button>
                <Button size="sm" variant="secondary" onClick={() => setShowRecall(true)}>
                  📝 贴回忆拆题
                </Button>
              </span>
            </div>

            {data.questions.length === 0 ? (
              <div style={{ marginTop: 10 }}>
                <EmptyState icon="🧩" title="还没录题" description="手工录一题，或贴整场回忆自动拆题，机检会立刻跑。" />
              </div>
            ) : (
              <div className="jh-questions" style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
                {data.questions.map((q) => (
                  <QuestionCard
                    key={q.id}
                    q={q}
                    analysis={data.analyses[q.id]}
                    analyzing={analyzingQid === q.id}
                    streamText={analyzingQid === q.id ? streamText : ''}
                    onAnalyze={(qid) => void analyze(qid)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <ManualQuestionModal
        open={showManual}
        onClose={() => setShowManual(false)}
        interviewId={interviewId as number}
        onSaved={refresh}
      />
      <RecallModal
        open={showRecall}
        onClose={() => setShowRecall(false)}
        interviewId={interviewId as number}
        onSaved={refresh}
      />
    </Modal>
  )
}
