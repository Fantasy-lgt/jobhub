import { useEffect, useState } from 'react'
import { Button, EmptyState, Modal } from '../../components'
import { QUESTION_TAGS } from '../../types'
import { interviewsApi } from '../../api/endpoints'
import { useUiStore } from '../../stores/ui'
import type { QuestionTag, RecallDraft } from '../../types'

interface BaseProps {
  open: boolean
  onClose: () => void
  interviewId: number
  onSaved: () => void
}

/* ---------------- 手工录入 ---------------- */

const STAR_LABELS: { key: 's_context' | 't_task' | 'a_action' | 'r_result'; label: string }[] = [
  { key: 's_context', label: 'S 情境' },
  { key: 't_task', label: 'T 任务' },
  { key: 'a_action', label: 'A 行动' },
  { key: 'r_result', label: 'R 结果' },
]

export function ManualQuestionModal({ open, onClose, interviewId, onSaved }: BaseProps) {
  const pushToast = useUiStore((s) => s.pushToast)
  const [form, setForm] = useState({
    question: '',
    tag: '专业题',
    my_answer: '',
    better_answer: '',
    s_context: '',
    t_task: '',
    a_action: '',
    r_result: '',
  })
  const [err, setErr] = useState('')
  const [saving, setSaving] = useState(false)
  const [showStar, setShowStar] = useState(false)

  useEffect(() => {
    if (open) {
      setForm({ question: '', tag: '专业题', my_answer: '', better_answer: '', s_context: '', t_task: '', a_action: '', r_result: '' })
      setErr('')
      setShowStar(false)
    }
  }, [open])

  const submit = async (): Promise<void> => {
    if (!form.question.trim()) {
      setErr('题目必填')
      return
    }
    setSaving(true)
    try {
      await interviewsApi.addQuestion(interviewId, {
        question: form.question.trim(),
        tag: form.tag as QuestionTag,
        my_answer: form.my_answer.trim(),
        better_answer: form.better_answer.trim(),
        s_context: form.s_context.trim() || null,
        t_task: form.t_task.trim() || null,
        a_action: form.a_action.trim() || null,
        r_result: form.r_result.trim() || null,
      })
      pushToast({ message: '已录入并完成机检', kind: 'success' })
      onClose()
      onSaved()
    } catch {
      // 已 toast
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="＋ 手工录题"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            取消
          </Button>
          <Button variant="primary" onClick={submit} loading={saving}>
            录入
          </Button>
        </>
      }
    >
      <div className="jh-form">
        <div className="jh-field">
          <label className="jh-label">题目 *</label>
          <input
            className="jh-input"
            value={form.question}
            onChange={(e) => setForm((f) => ({ ...f, question: e.target.value }))}
            placeholder="介绍一下你最有挑战的一个项目"
          />
        </div>
        <div className="jh-field">
          <label className="jh-label">标签</label>
          <select
            className="jh-input"
            value={form.tag}
            onChange={(e) => setForm((f) => ({ ...f, tag: e.target.value }))}
          >
            {QUESTION_TAGS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <div className="jh-field">
          <label className="jh-label">我的回答</label>
          <textarea
            className="jh-input"
            value={form.my_answer}
            onChange={(e) => setForm((f) => ({ ...f, my_answer: e.target.value }))}
            placeholder="当时是怎么答的（机检会看 STAR / 量化 / 雷区 / 超长）"
          />
        </div>
        <div className="jh-field">
          <label className="jh-label">更优答法</label>
          <textarea
            className="jh-input"
            value={form.better_answer}
            onChange={(e) => setForm((f) => ({ ...f, better_answer: e.target.value }))}
            placeholder="回头想，更好的答法是什么"
          />
        </div>

        <button type="button" className="jh-btn jh-btn--ghost jh-btn--sm" onClick={() => setShowStar((v) => !v)} style={{ alignSelf: 'flex-start' }}>
          {showStar ? '收起 STAR 四要素' : '展开 STAR 四要素（可选，填了机检 ✓）'}
        </button>
        {showStar ? (
          <div className="jh-form-grid">
            {STAR_LABELS.map((s) => (
              <div key={s.key} className="jh-field">
                <label className="jh-label">{s.label}</label>
                <input
                  className="jh-input"
                  value={form[s.key]}
                  onChange={(e) => setForm((f) => ({ ...f, [s.key]: e.target.value }))}
                  placeholder={s.label}
                />
              </div>
            ))}
          </div>
        ) : null}

        {err ? <div className="jh-field__err">{err}</div> : null}
      </div>
    </Modal>
  )
}

/* ---------------- 贴回忆自动拆题 ---------------- */

export function RecallModal({ open, onClose, interviewId, onSaved }: BaseProps) {
  const pushToast = useUiStore((s) => s.pushToast)
  const [text, setText] = useState('')
  const [drafts, setDrafts] = useState<RecallDraft[]>([])
  const [checked, setChecked] = useState<boolean[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) {
      setText('')
      setDrafts([])
      setChecked([])
    }
  }, [open])

  const split = async (): Promise<void> => {
    if (!text.trim()) return
    setLoading(true)
    try {
      const res = await interviewsApi.recall(interviewId, text.trim())
      setDrafts(res)
      setChecked(res.map(() => true))
    } catch {
      // 已 toast
    } finally {
      setLoading(false)
    }
  }

  const confirm = async (): Promise<void> => {
    const chosen = drafts.filter((_, i) => checked[i])
    if (chosen.length === 0) return
    setSaving(true)
    try {
      for (const d of chosen) {
        if (!d.question.trim()) continue
        await interviewsApi.addQuestion(interviewId, {
          question: d.question.trim(),
          my_answer: d.my_answer?.trim() ?? '',
        })
      }
      pushToast({ message: `已入库 ${chosen.length} 题`, kind: 'success' })
      onClose()
      onSaved()
    } catch {
      // 已 toast
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="📝 贴回忆自动拆题"
      footer={
        drafts.length > 0 ? (
          <>
            <Button variant="secondary" onClick={onClose}>
              取消
            </Button>
            <Button variant="primary" onClick={confirm} loading={saving} disabled={checked.every((c) => !c)}>
              确认入库（{checked.filter(Boolean).length}）
            </Button>
          </>
        ) : undefined
      }
    >
      <div className="jh-form">
        <div className="jh-field">
          <label className="jh-label">口述回忆</label>
          <textarea
            className="jh-input"
            style={{ minHeight: 120 }}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={'把整场面试回忆贴进来，例如：\n\n面试官先问了我最有挑战的项目，我回答……\n\n又问为什么跳槽，我……'}
          />
        </div>
        <Button variant="primary" size="sm" onClick={split} loading={loading} disabled={!text.trim()}>
          ⚙️ 拆题
        </Button>

        {drafts.length > 0 ? (
          <div className="jh-recall-drafts">
            {drafts.map((d, i) => (
              <label key={i} className="jh-recall-draft">
                <input
                  type="checkbox"
                  checked={!!checked[i]}
                  onChange={(e) => setChecked((c) => c.map((v, idx) => (idx === i ? e.target.checked : v)))}
                />
                <span className="jh-recall-draft__body">
                  <span className="jh-recall-draft__q">{d.question}</span>
                  {d.my_answer ? <span className="jh-recall-draft__a">{d.my_answer}</span> : null}
                </span>
              </label>
            ))}
          </div>
        ) : loading ? null : (
          <div style={{ marginTop: 8 }}>
            <EmptyState icon="✂️" title="拆题草稿会出现在这里" description="按空行和问号切分，确认勾选后入库。" />
          </div>
        )}
      </div>
    </Modal>
  )
}
