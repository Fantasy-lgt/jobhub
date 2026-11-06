import { useEffect, useState } from 'react'
import { Button, Modal } from '../../components'
import { INTERVIEW_FORMATS, INTERVIEW_RESULTS, INTERVIEW_ROUNDS } from '../../types'
import type { Interview, InterviewFormat, InterviewResult, InterviewRound } from '../../types'

interface InterviewFormModalProps {
  open: boolean
  onClose: () => void
  onSubmit: (data: Partial<Interview>) => Promise<void>
  initial?: Interview | null
  submitting: boolean
}

const EMPTY = {
  company: '',
  role: '',
  round: '一面',
  scheduled_at: '',
  format: '视频',
  interviewer: '',
  result: '等通知',
}

/** 新建/编辑面试记录。 */
export function InterviewFormModal({
  open,
  onClose,
  onSubmit,
  initial,
  submitting,
}: InterviewFormModalProps) {
  const [form, setForm] = useState(EMPTY)
  const [err, setErr] = useState('')

  useEffect(() => {
    if (!open) return
    setErr('')
    if (initial) {
      setForm({
        company: initial.company ?? '',
        role: initial.role ?? '',
        round: initial.round ?? '一面',
        scheduled_at: initial.scheduled_at ?? '',
        format: initial.format ?? '视频',
        interviewer: initial.interviewer ?? '',
        result: initial.result ?? '等通知',
      })
    } else {
      setForm(EMPTY)
    }
  }, [open, initial])

  const submit = async (): Promise<void> => {
    if (!form.company.trim() || !form.role.trim()) {
      setErr('公司名和岗位名必填')
      return
    }
    await onSubmit({
      company: form.company.trim(),
      role: form.role.trim(),
      round: form.round as InterviewRound,
      scheduled_at: form.scheduled_at || null,
      format: form.format as InterviewFormat,
      interviewer: form.interviewer.trim(),
      result: form.result as InterviewResult,
    })
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={initial ? '✏️ 编辑面试' : '＋ 记一场面试'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            取消
          </Button>
          <Button variant="primary" onClick={submit} loading={submitting}>
            {initial ? '保存' : '创建'}
          </Button>
        </>
      }
    >
      <div className="jh-form">
        <div className="jh-form-grid">
          <div className="jh-field">
            <label className="jh-label">公司名 *</label>
            <input
              className="jh-input"
              value={form.company}
              onChange={(e) => setForm((f) => ({ ...f, company: e.target.value }))}
              placeholder="云杉信息"
            />
          </div>
          <div className="jh-field">
            <label className="jh-label">岗位名 *</label>
            <input
              className="jh-input"
              value={form.role}
              onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
              placeholder="后端工程师"
            />
          </div>
          <div className="jh-field">
            <label className="jh-label">轮次</label>
            <select
              className="jh-input"
              value={form.round}
              onChange={(e) => setForm((f) => ({ ...f, round: e.target.value }))}
            >
              {INTERVIEW_ROUNDS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
          <div className="jh-field">
            <label className="jh-label">形式</label>
            <select
              className="jh-input"
              value={form.format}
              onChange={(e) => setForm((f) => ({ ...f, format: e.target.value }))}
            >
              {INTERVIEW_FORMATS.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </div>
          <div className="jh-field">
            <label className="jh-label">面试时间</label>
            <input
              className="jh-input"
              type="date"
              value={form.scheduled_at}
              onChange={(e) => setForm((f) => ({ ...f, scheduled_at: e.target.value }))}
            />
          </div>
          <div className="jh-field">
            <label className="jh-label">面试官</label>
            <input
              className="jh-input"
              value={form.interviewer}
              onChange={(e) => setForm((f) => ({ ...f, interviewer: e.target.value }))}
              placeholder="技术负责人 / HR"
            />
          </div>
          <div className="jh-field">
            <label className="jh-label">结果</label>
            <select
              className="jh-input"
              value={form.result}
              onChange={(e) => setForm((f) => ({ ...f, result: e.target.value }))}
            >
              {INTERVIEW_RESULTS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
        </div>
        {err ? <div className="jh-field__err">{err}</div> : null}
      </div>
    </Modal>
  )
}
