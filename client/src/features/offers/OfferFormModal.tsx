import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Button, Modal } from '../../components'
import type { Offer, OfferScoreKey } from '../../types'
import {
  annualPackageFen,
  equityYuanPerYear,
  fenToWan,
  offerScore,
} from '../../utils/money'
import {
  DIMENSIONS,
  emptyForm,
  formFromOffer,
  toPayload,
  toPreviewOffer,
  weightsTotal,
} from './offer.helpers'
import type { OfferFormState } from './offer.helpers'

interface OfferFormModalProps {
  open: boolean
  onClose: () => void
  onSubmit: (data: Partial<Offer>) => Promise<void>
  initial: Offer | null
  submitting: boolean
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

/** 新建 / 编辑 Offer：薪资结构 + 四维权重（合计 100 校验）+ 四维评分 + 实时年包预览。 */
export function OfferFormModal({ open, onClose, onSubmit, initial, submitting }: OfferFormModalProps) {
  const [form, setForm] = useState<OfferFormState>(() => emptyForm())
  const [err, setErr] = useState('')

  useEffect(() => {
    if (!open) return
    setErr('')
    setForm(initial ? formFromOffer(initial) : emptyForm())
  }, [open, initial])

  const set = <K extends keyof OfferFormState>(k: K, v: OfferFormState[K]): void => {
    setForm((f) => ({ ...f, [k]: v }))
  }
  const setWeight = (key: OfferScoreKey, v: string): void => {
    setForm((f) => ({ ...f, weights: { ...f.weights, [key]: v } }))
  }
  const setScore = (key: OfferScoreKey, v: string): void => {
    setForm((f) => ({ ...f, scores: { ...f.scores, [key]: v } }))
  }

  const total = weightsTotal(form)
  const preview = toPreviewOffer(form)
  const packageFen = annualPackageFen(preview)
  const score = offerScore(preview)
  const eqPerYear = equityYuanPerYear(preview)

  const submit = async (): Promise<void> => {
    if (!form.company.trim() || !form.role.trim()) {
      setErr('公司名和岗位名必填')
      return
    }
    if (total !== 100) {
      setErr(`四维权重合计必须为 100（当前 ${total}）`)
      return
    }
    setErr('')
    await onSubmit(toPayload(form))
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={initial ? '✏️ 编辑 Offer' : '＋ 新增 Offer'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            取消
          </Button>
          <Button variant="primary" onClick={() => void submit()} loading={submitting}>
            {initial ? '保存' : '创建'}
          </Button>
        </>
      }
    >
      <div className="jh-form">
        <div className="jh-form-grid">
          <Field label="公司名 *">
            <input className="jh-input" value={form.company} onChange={(e) => set('company', e.target.value)} placeholder="星野科技" />
          </Field>
          <Field label="岗位名 *">
            <input className="jh-input" value={form.role} onChange={(e) => set('role', e.target.value)} placeholder="后端工程师" />
          </Field>
          <Field label="城市">
            <input className="jh-input" value={form.city} onChange={(e) => set('city', e.target.value)} placeholder="上海" />
          </Field>
          <Field label="答复截止日">
            <input className="jh-input" type="date" value={form.deadline} onChange={(e) => set('deadline', e.target.value)} />
          </Field>
        </div>

        <div className="jh-sec-title" style={{ fontSize: 14, marginTop: 6 }}>
          💰 薪资结构 <span className="sub">金额按「元」录入，存库自动转「分」</span>
        </div>
        <div className="jh-form-grid">
          <Field label="月薪（元/月）">
            <input className="jh-input" type="number" min={0} value={form.base_salary} onChange={(e) => set('base_salary', e.target.value)} placeholder="30000" />
          </Field>
          <Field label="薪月数">
            <input className="jh-input" type="number" min={1} max={24} value={form.salary_months} onChange={(e) => set('salary_months', e.target.value)} />
          </Field>
          <Field label="绩效月数" hint="可填小数，如 1.5">
            <input className="jh-input" type="number" min={0} step={0.5} value={form.bonus_months} onChange={(e) => set('bonus_months', e.target.value)} />
          </Field>
          <Field label="签字费（元）">
            <input className="jh-input" type="number" min={0} value={form.sign_bonus} onChange={(e) => set('sign_bonus', e.target.value)} placeholder="0" />
          </Field>
          <Field label="补贴（元/月）">
            <input className="jh-input" type="number" min={0} value={form.allowance} onChange={(e) => set('allowance', e.target.value)} placeholder="0" />
          </Field>
          <Field label="公积金比例（%）">
            <input className="jh-input" type="number" min={0} max={100} value={form.fund_rate} onChange={(e) => set('fund_rate', e.target.value)} />
          </Field>
          <Field label="期权估值（元）" hint="仅单独列示，不计入年包">
            <input className="jh-input" type="number" min={0} value={form.equity_value} onChange={(e) => set('equity_value', e.target.value)} placeholder="0" />
          </Field>
          <Field label="归属年限">
            <input className="jh-input" type="number" min={1} max={10} value={form.equity_years} onChange={(e) => set('equity_years', e.target.value)} />
          </Field>
        </div>

        {/* 实时预览：与后端 calcOffer 同口径 */}
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 16,
            padding: '10px 12px',
            margin: '4px 0 10px',
            border: '2px dashed var(--muted)',
            borderRadius: 12,
            fontSize: 13,
            lineHeight: 1.7,
          }}
        >
          <span>
            年包 <b style={{ fontSize: 16 }}>{fenToWan(packageFen)}</b>
          </span>
          <span>
            加权总分 <b style={{ fontSize: 16 }}>{score.toFixed(2)}</b>
          </span>
          <span style={{ color: 'var(--muted)' }}>
            期权约 {eqPerYear} 元/年（不计入年包）
          </span>
        </div>

        <div className="jh-sec-title" style={{ fontSize: 14 }}>
          ⚖️ 四维权重 <span className="sub">合计必须 = 100</span>
          <span style={{ marginLeft: 'auto', color: total === 100 ? 'var(--green)' : 'var(--pink)', fontWeight: 700 }}>
            当前 {total} / 100
          </span>
        </div>
        <div className="jh-form-grid">
          {DIMENSIONS.map((d) => (
            <Field key={d.key} label={`${d.label}（%）`}>
              <input
                className="jh-input"
                type="number"
                min={0}
                max={100}
                value={form.weights[d.key]}
                onChange={(e) => setWeight(d.key, e.target.value)}
              />
            </Field>
          ))}
        </div>

        <div className="jh-sec-title" style={{ fontSize: 14, marginTop: 6 }}>
          ⭐ 四维评分 <span className="sub">1–5 分</span>
        </div>
        <div className="jh-form-grid">
          {DIMENSIONS.map((d) => (
            <Field key={d.key} label={d.label}>
              <select
                className="jh-input"
                value={form.scores[d.key]}
                onChange={(e) => setScore(d.key, e.target.value)}
              >
                {[1, 2, 3, 4, 5].map((n) => (
                  <option key={n} value={n}>
                    {n} 分
                  </option>
                ))}
              </select>
            </Field>
          ))}
        </div>

        <div className="jh-form-grid">
          <Field label="最顾虑的点">
            <input className="jh-input" value={form.top_concern} onChange={(e) => set('top_concern', e.target.value)} placeholder="如：业务稳定性" />
          </Field>
          <Field label="入职周期">
            <input className="jh-input" value={form.notice_period} onChange={(e) => set('notice_period', e.target.value)} placeholder="如：一个月" />
          </Field>
        </div>

        <div className="jh-form-grid">
          <SwitchRow label="有竞业限制" checked={form.non_compete} onChange={(v) => set('non_compete', v)} />
          <SwitchRow label="足额社保" checked={form.social_security} onChange={(v) => set('social_security', v)} />
        </div>

        <Field label="备注">
          <textarea className="jh-input" value={form.note} onChange={(e) => set('note', e.target.value)} placeholder="谈判空间、团队情况等" />
        </Field>

        {err ? <div className="jh-field__err">{err}</div> : null}
      </div>
    </Modal>
  )
}
