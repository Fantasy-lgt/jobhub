import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Button, Modal, StarRating } from '../../components'
import { CHANNELS, WORK_MODES } from '../../types'
import type { App, Resume } from '../../types'
import { yuanInputToFen } from './apps.helpers'

/** 分 → 元字符串（无千分位，供 number input 回填）。 */
function fenToYuanPlain(fen: number): string {
  return fen > 0 ? String(Math.round(fen / 100)) : ''
}

interface AppFormModalProps {
  open: boolean
  onClose: () => void
  onSubmit: (data: Partial<App>) => Promise<void>
  initial?: App | null
  resumes: Resume[]
  submitting: boolean
}

interface FormState {
  company: string
  role: string
  channel: string
  city: string
  work_mode: string
  salary_min: string
  salary_max: string
  interest: number
  jd_url: string
  applied_at: string
  resume_id: string
  contact_name: string
  contact_role: string
  contact_info: string
  next_action: string
  next_action_at: string
  need_bg_check: boolean
  need_leave: boolean
  note: string
}

const EMPTY: FormState = {
  company: '',
  role: '',
  channel: '其他',
  city: '',
  work_mode: '坐班',
  salary_min: '',
  salary_max: '',
  interest: 3,
  jd_url: '',
  applied_at: '',
  resume_id: '',
  contact_name: '',
  contact_role: '',
  contact_info: '',
  next_action: '',
  next_action_at: '',
  need_bg_check: false,
  need_leave: false,
  note: '',
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="jh-field">
      <label className="jh-label">{label}</label>
      {children}
      {hint ? <span className="jh-field__hint">{hint}</span> : null}
    </div>
  )
}

function SwitchRow({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <button
      type="button"
      className="jh-switch-row"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
    >
      <span>{label}</span>
      <span className={`jh-switch ${checked ? 'jh-switch--on' : ''}`}>
        <span className="jh-switch__knob" />
      </span>
    </button>
  )
}

/** 新建 / 编辑岗位表单（Modal，H5 自动降级底部抽屉）。 */
export function AppFormModal({
  open,
  onClose,
  onSubmit,
  initial,
  resumes,
  submitting,
}: AppFormModalProps) {
  const [form, setForm] = useState<FormState>(EMPTY)
  const [err, setErr] = useState('')

  useEffect(() => {
    if (!open) return
    setErr('')
    if (initial) {
      setForm({
        company: initial.company ?? '',
        role: initial.role ?? '',
        channel: initial.channel ?? '其他',
        city: initial.city ?? '',
        work_mode: initial.work_mode ?? '坐班',
        salary_min: fenToYuanPlain(initial.salary_min),
        salary_max: fenToYuanPlain(initial.salary_max),
        interest: initial.interest ?? 3,
        jd_url: initial.jd_url ?? '',
        applied_at: initial.applied_at ?? '',
        resume_id: initial.resume_id ? String(initial.resume_id) : '',
        contact_name: initial.contact_name ?? '',
        contact_role: initial.contact_role ?? '',
        contact_info: initial.contact_info ?? '',
        next_action: initial.next_action ?? '',
        next_action_at: initial.next_action_at ?? '',
        need_bg_check: initial.need_bg_check ?? false,
        need_leave: initial.need_leave ?? false,
        note: initial.note ?? '',
      })
    } else {
      setForm(EMPTY)
    }
  }, [open, initial])

  const set = (k: keyof FormState, v: string | number | boolean): void => {
    setForm((f) => ({ ...f, [k]: v }))
  }

  const submit = async (): Promise<void> => {
    if (!form.company.trim() || !form.role.trim()) {
      setErr('公司名和岗位名必填')
      return
    }
    const payload: Partial<App> = {
      company: form.company.trim(),
      role: form.role.trim(),
      channel: form.channel,
      city: form.city.trim(),
      work_mode: form.work_mode,
      salary_min: yuanInputToFen(form.salary_min),
      salary_max: yuanInputToFen(form.salary_max),
      interest: form.interest,
      jd_url: form.jd_url.trim(),
      applied_at: form.applied_at || null,
      resume_id: form.resume_id ? Number(form.resume_id) : null,
      contact_name: form.contact_name.trim(),
      contact_role: form.contact_role.trim(),
      contact_info: form.contact_info.trim(),
      next_action: form.next_action.trim(),
      next_action_at: form.next_action_at || null,
      need_bg_check: form.need_bg_check,
      need_leave: form.need_leave,
      note: form.note,
    }
    await onSubmit(payload)
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={initial ? '✏️ 编辑岗位' : '＋ 记一个新岗位'}
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
          <Field label="公司名 *">
            <input
              className="jh-input"
              value={form.company}
              onChange={(e) => set('company', e.target.value)}
              placeholder="星野科技"
            />
          </Field>
          <Field label="岗位名 *">
            <input
              className="jh-input"
              value={form.role}
              onChange={(e) => set('role', e.target.value)}
              placeholder="后端工程师"
            />
          </Field>
          <Field label="渠道">
            <select
              className="jh-input"
              value={form.channel}
              onChange={(e) => set('channel', e.target.value)}
            >
              {CHANNELS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </Field>
          <Field label="办公方式">
            <select
              className="jh-input"
              value={form.work_mode}
              onChange={(e) => set('work_mode', e.target.value)}
            >
              {WORK_MODES.map((w) => (
                <option key={w} value={w}>
                  {w}
                </option>
              ))}
            </select>
          </Field>
          <Field label="城市">
            <input
              className="jh-input"
              value={form.city}
              onChange={(e) => set('city', e.target.value)}
              placeholder="上海"
            />
          </Field>
          <Field label="心仪度">
            <div style={{ minHeight: 40, display: 'flex', alignItems: 'center' }}>
              <StarRating value={form.interest} onChange={(v) => set('interest', v)} />
            </div>
          </Field>
        </div>

        <div className="jh-form-grid">
          <Field label="薪资下限（元/月）" hint="存库用「分」，展示转 K">
            <input
              className="jh-input"
              type="number"
              min={0}
              inputMode="numeric"
              value={form.salary_min}
              onChange={(e) => set('salary_min', e.target.value)}
              placeholder="30000"
            />
          </Field>
          <Field label="薪资上限（元/月）">
            <input
              className="jh-input"
              type="number"
              min={0}
              inputMode="numeric"
              value={form.salary_max}
              onChange={(e) => set('salary_max', e.target.value)}
              placeholder="40000"
            />
          </Field>
          <Field label="投递日期" hint="留空 = 尚未投递">
            <input
              className="jh-input"
              type="date"
              value={form.applied_at}
              onChange={(e) => set('applied_at', e.target.value)}
            />
          </Field>
          <Field label="简历版本">
            <select
              className="jh-input"
              value={form.resume_id}
              onChange={(e) => set('resume_id', e.target.value)}
            >
              <option value="">不关联</option>
              {resumes.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                  {r.is_primary ? '（主用）' : ''}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <Field label="JD 链接">
          <input
            className="jh-input"
            value={form.jd_url}
            onChange={(e) => set('jd_url', e.target.value)}
            placeholder="https://..."
            inputMode="url"
          />
        </Field>

        <div className="jh-form-grid">
          <Field label="联系人">
            <input
              className="jh-input"
              value={form.contact_name}
              onChange={(e) => set('contact_name', e.target.value)}
              placeholder="HR / 猎头姓名"
            />
          </Field>
          <Field label="联系人角色">
            <input
              className="jh-input"
              value={form.contact_role}
              onChange={(e) => set('contact_role', e.target.value)}
              placeholder="HR / 猎头 / 面试官"
            />
          </Field>
          <Field label="联系方式">
            <input
              className="jh-input"
              value={form.contact_info}
              onChange={(e) => set('contact_info', e.target.value)}
              placeholder="微信 / 电话 / 邮箱"
            />
          </Field>
          <Field label="下一步动作">
            <input
              className="jh-input"
              value={form.next_action}
              onChange={(e) => set('next_action', e.target.value)}
              placeholder="跟进二面结果"
            />
          </Field>
          <Field label="下一步截止日">
            <input
              className="jh-input"
              type="date"
              value={form.next_action_at}
              onChange={(e) => set('next_action_at', e.target.value)}
            />
          </Field>
        </div>

        <div className="jh-form-grid">
          <SwitchRow
            label="需要背调"
            checked={form.need_bg_check}
            onChange={(v) => set('need_bg_check', v)}
          />
          <SwitchRow
            label="需要请假面试"
            checked={form.need_leave}
            onChange={(v) => set('need_leave', v)}
          />
        </div>

        <Field label="备注">
          <textarea
            className="jh-input"
            value={form.note}
            onChange={(e) => set('note', e.target.value)}
            placeholder="薪资谈判空间、公司情况等"
          />
        </Field>

        {err ? <div className="jh-field__err">{err}</div> : null}
      </div>
    </Modal>
  )
}
