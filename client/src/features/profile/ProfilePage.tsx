import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, Card, ErrorRetry, TagInput } from '../../components'
import { profileApi } from '../../api/endpoints'
import { useUiStore } from '../../stores/ui'
import { yuanToFen } from '../../utils/money'
import type { Profile } from '../../types'
import { ResumeManager } from './ResumeManager'

interface ProfileForm {
  self_intro: string
  primary_role: string
  backup_roles: string[]
  industries: string[]
  company_types: string[]
  cities: string[]
  current_salary_base: string
  current_salary_months: string
  expect_floor: string
  expect_target: string
  strengths: { tag: string; evidence: string }[]
  gaps: { gap: string; action: string }[]
}

const EMPTY: ProfileForm = {
  self_intro: '',
  primary_role: '',
  backup_roles: [],
  industries: [],
  company_types: [],
  cities: [],
  current_salary_base: '',
  current_salary_months: '12',
  expect_floor: '',
  expect_target: '',
  strengths: [],
  gaps: [],
}

const INDUSTRY_SUGGESTIONS = ['互联网', 'SaaS', '电商', '金融科技', 'AI', '游戏', '硬件', '汽车', '教育', '医疗']
const COMPANY_TYPE_SUGGESTIONS = ['大厂', '独角兽', '创业公司', '外企', '国企', '小而美']
const CITY_SUGGESTIONS = ['北京', '上海', '深圳', '杭州', '广州', '成都', '远程']

function fenToYuanStr(fen: number): string {
  return fen > 0 ? String(Math.round(fen / 100)) : ''
}

/** 求职定位：自我介绍 + 目标岗位 + 标签 + 薪资三段 + 核心卖点 + 短板 + 简历版本。 */
export function ProfilePage() {
  const qc = useQueryClient()
  const pushToast = useUiStore((s) => s.pushToast)

  const { data: profile, isLoading, isError, refetch } = useQuery({
    queryKey: ['profile'],
    queryFn: profileApi.get,
  })

  const [form, setForm] = useState<ProfileForm>(EMPTY)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!profile) return
    setForm({
      self_intro: profile.self_intro ?? '',
      primary_role: profile.primary_role ?? '',
      backup_roles: profile.backup_roles ?? [],
      industries: profile.industries ?? [],
      company_types: profile.company_types ?? [],
      cities: profile.cities ?? [],
      current_salary_base: fenToYuanStr(profile.current_salary_base),
      current_salary_months: String(profile.current_salary_months || 12),
      expect_floor: fenToYuanStr(profile.expect_floor),
      expect_target: fenToYuanStr(profile.expect_target),
      strengths: profile.strengths ?? [],
      gaps: profile.gaps ?? [],
    })
  }, [profile])

  const set = <K extends keyof ProfileForm>(k: K, v: ProfileForm[K]): void => {
    setForm((f) => ({ ...f, [k]: v }))
  }

  const base = Number(form.current_salary_base) || 0
  const target = Number(form.expect_target) || 0
  const floor = Number(form.expect_floor) || 0
  const raisePct = base > 0 && target > 0 ? Math.round(((target - base) / base) * 100) : null

  const hasInvalidStrength = form.strengths.some((s) => !s.tag.trim() || !s.evidence.trim())
  const hasInvalidGap = form.gaps.some((g) => !g.gap.trim() || !g.action.trim())
  const salaryInvalid = target > 0 && floor > target
  const strengthCountInvalid = form.strengths.length < 3 || form.strengths.length > 5
  const gapCountInvalid = form.gaps.length < 1 || form.gaps.length > 3

  const canSave =
    !salaryInvalid &&
    !hasInvalidStrength &&
    !hasInvalidGap &&
    !strengthCountInvalid &&
    !gapCountInvalid

  const updateStrength = (i: number, patch: Partial<{ tag: string; evidence: string }>): void => {
    setForm((f) => ({
      ...f,
      strengths: f.strengths.map((s, idx) => (idx === i ? { ...s, ...patch } : s)),
    }))
  }
  const updateGap = (i: number, patch: Partial<{ gap: string; action: string }>): void => {
    setForm((f) => ({
      ...f,
      gaps: f.gaps.map((g, idx) => (idx === i ? { ...g, ...patch } : g)),
    }))
  }

  const save = async (): Promise<void> => {
    if (!canSave) return
    setSaving(true)
    try {
      const payload: Profile = {
        user_id: profile?.user_id ?? 1,
        self_intro: form.self_intro.trim(),
        primary_role: form.primary_role.trim(),
        backup_roles: form.backup_roles,
        industries: form.industries,
        company_types: form.company_types,
        cities: form.cities,
        current_salary_base: yuanToFen(base),
        current_salary_months: Number(form.current_salary_months) || 12,
        expect_floor: yuanToFen(floor),
        expect_target: yuanToFen(target),
        strengths: form.strengths.map((s) => ({ tag: s.tag.trim(), evidence: s.evidence.trim() })),
        gaps: form.gaps.map((g) => ({ gap: g.gap.trim(), action: g.action.trim() })),
        updated_at: profile?.updated_at ?? '',
      }
      await profileApi.update(payload)
      pushToast({ message: '定位已保存', kind: 'success' })
      await qc.invalidateQueries({ queryKey: ['profile'] })
    } catch {
      // 已 toast
    } finally {
      setSaving(false)
    }
  }

  if (isLoading) {
    return (
      <div className="jh-page">
        <div className="jh-loading">
          <span className="jh-spinner" aria-hidden /> 加载中…
        </div>
      </div>
    )
  }
  if (isError) {
    return (
      <div className="jh-page">
        <ErrorRetry onRetry={() => void refetch()} />
      </div>
    )
  }

  return (
    <div className="jh-page">
      <header className="jh-page-head">
        <h1 className="jh-page-title">🧭 求职定位</h1>
        <p className="jh-page-desc">写清楚要什么，收岗位和投递才有判断标准。</p>
      </header>

      <Card>
        <div className="jh-sec-title">💬 一句话自我介绍</div>
        <div className="jh-field" style={{ marginTop: 10 }}>
          <input
            className="jh-input"
            value={form.self_intro}
            maxLength={60}
            onChange={(e) => set('self_intro', e.target.value)}
            placeholder="后端开发 · 8 年经验 · 目标 35K/月 · 上海/杭州"
          />
          <span className="jh-field__hint" style={{ textAlign: 'right' }}>
            {form.self_intro.length}/60
          </span>
        </div>
      </Card>

      <Card>
        <div className="jh-sec-title">🎯 目标岗位</div>
        <div className="jh-form" style={{ marginTop: 10 }}>
          <div className="jh-field">
            <label className="jh-label">主投岗位</label>
            <input
              className="jh-input"
              value={form.primary_role}
              onChange={(e) => set('primary_role', e.target.value)}
              placeholder="后端开发"
            />
          </div>
          <div className="jh-field">
            <label className="jh-label">备投岗位（最多 2 个）</label>
            <TagInput
              value={form.backup_roles}
              onChange={(v) => set('backup_roles', v)}
              max={2}
              color="blue"
              placeholder="输入后回车，如 平台工程"
              ariaLabel="备投岗位"
            />
          </div>
        </div>
      </Card>

      <Card>
        <div className="jh-sec-title">🏷️ 行业 / 公司类型 / 期望城市</div>
        <div className="jh-form" style={{ marginTop: 10 }}>
          <div className="jh-field">
            <label className="jh-label">目标行业</label>
            <TagInput
              value={form.industries}
              onChange={(v) => set('industries', v)}
              suggestions={INDUSTRY_SUGGESTIONS}
              color="brand"
              placeholder="选择或输入行业"
              ariaLabel="目标行业"
            />
          </div>
          <div className="jh-field">
            <label className="jh-label">公司类型</label>
            <TagInput
              value={form.company_types}
              onChange={(v) => set('company_types', v)}
              suggestions={COMPANY_TYPE_SUGGESTIONS}
              color="green"
              placeholder="选择或输入公司类型"
              ariaLabel="公司类型"
            />
          </div>
          <div className="jh-field">
            <label className="jh-label">期望城市</label>
            <TagInput
              value={form.cities}
              onChange={(v) => set('cities', v)}
              suggestions={CITY_SUGGESTIONS}
              color="amber"
              placeholder="选择或输入城市"
              ariaLabel="期望城市"
            />
          </div>
        </div>
      </Card>

      <Card>
        <div className="jh-sec-title">
          💰 薪资三段 <span className="sub">金额存「分」，展示转元/K</span>
        </div>
        <div className="jh-form-grid" style={{ marginTop: 10 }}>
          <div className="jh-field">
            <label className="jh-label">现薪月薪（元/月）</label>
            <input
              className="jh-input"
              type="number"
              min={0}
              inputMode="numeric"
              value={form.current_salary_base}
              onChange={(e) => set('current_salary_base', e.target.value)}
              placeholder="28000"
            />
          </div>
          <div className="jh-field">
            <label className="jh-label">现薪薪月数</label>
            <input
              className="jh-input"
              type="number"
              min={1}
              max={24}
              inputMode="numeric"
              value={form.current_salary_months}
              onChange={(e) => set('current_salary_months', e.target.value)}
              placeholder="12"
            />
          </div>
          <div className="jh-field">
            <label className="jh-label">期望底线（元/月）</label>
            <input
              className="jh-input"
              type="number"
              min={0}
              inputMode="numeric"
              value={form.expect_floor}
              onChange={(e) => set('expect_floor', e.target.value)}
              placeholder="30000"
            />
          </div>
          <div className="jh-field">
            <label className="jh-label">期望目标（元/月）</label>
            <input
              className="jh-input"
              type="number"
              min={0}
              inputMode="numeric"
              value={form.expect_target}
              onChange={(e) => set('expect_target', e.target.value)}
              placeholder="35000"
            />
          </div>
        </div>
        <div style={{ marginTop: 10, fontSize: 13, color: 'var(--sub)' }}>
          期望月薪涨幅：
          <b style={{ color: raisePct !== null && raisePct >= 0 ? 'var(--green)' : 'var(--amber)' }}>
            {raisePct === null ? '—' : `${raisePct >= 0 ? '+' : ''}${raisePct}%`}
          </b>
          {salaryInvalid ? <span className="jh-field__err"> 底线不能高于目标</span> : null}
        </div>
      </Card>

      <Card>
        <div className="jh-sec-title">
          💪 核心卖点（3–5 条） <span className="sub">每条 = 标签 + 带数字证据，只有标签不保存</span>
        </div>
        <div className="jh-form" style={{ marginTop: 10 }}>
          {form.strengths.map((s, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <input
                className="jh-input"
                style={{ flex: '1 1 120px' }}
                value={s.tag}
                onChange={(e) => updateStrength(i, { tag: e.target.value })}
                placeholder="能力标签，如 高并发"
                aria-label={`卖点 ${i + 1} 标签`}
              />
              <input
                className="jh-input"
                style={{ flex: '2 1 200px' }}
                value={s.evidence}
                onChange={(e) => updateStrength(i, { evidence: e.target.value })}
                placeholder="带数字证据，如 主导 QPS 3w 订单服务"
                aria-label={`卖点 ${i + 1} 证据`}
              />
              <Button size="sm" variant="danger" onClick={() => setForm((f) => ({ ...f, strengths: f.strengths.filter((_, idx) => idx !== i) }))}>
                删
              </Button>
            </div>
          ))}
          <div>
            <Button
              size="sm"
              variant="secondary"
              disabled={form.strengths.length >= 5}
              onClick={() => setForm((f) => ({ ...f, strengths: [...f.strengths, { tag: '', evidence: '' }] }))}
            >
              ＋ 加一条卖点
            </Button>
          </div>
          {strengthCountInvalid ? <div className="jh-field__err">卖点需 3–5 条（当前 {form.strengths.length} 条）</div> : null}
          {hasInvalidStrength ? <div className="jh-field__err">每条卖点都要同时填「标签」和「带数字的证据」</div> : null}
        </div>
      </Card>

      <Card>
        <div className="jh-sec-title">
          🩹 当前短板（1–3 条） <span className="sub">短板必须配补强动作</span>
        </div>
        <div className="jh-form" style={{ marginTop: 10 }}>
          {form.gaps.map((g, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <input
                className="jh-input"
                style={{ flex: '1 1 120px' }}
                value={g.gap}
                onChange={(e) => updateGap(i, { gap: e.target.value })}
                placeholder="短板，如 系统设计"
                aria-label={`短板 ${i + 1}`}
              />
              <input
                className="jh-input"
                style={{ flex: '2 1 200px' }}
                value={g.action}
                onChange={(e) => updateGap(i, { action: e.target.value })}
                placeholder="补强动作，如 每周精读 2 篇架构案例"
                aria-label={`短板 ${i + 1} 补强动作`}
              />
              <Button size="sm" variant="danger" onClick={() => setForm((f) => ({ ...f, gaps: f.gaps.filter((_, idx) => idx !== i) }))}>
                删
              </Button>
            </div>
          ))}
          <div>
            <Button
              size="sm"
              variant="secondary"
              disabled={form.gaps.length >= 3}
              onClick={() => setForm((f) => ({ ...f, gaps: [...f.gaps, { gap: '', action: '' }] }))}
            >
              ＋ 加一条短板
            </Button>
          </div>
          {gapCountInvalid ? <div className="jh-field__err">短板需 1–3 条（当前 {form.gaps.length} 条）</div> : null}
          {hasInvalidGap ? <div className="jh-field__err">每条短板都要配「补强动作」</div> : null}
        </div>
      </Card>

      <Card>
        <ResumeManager />
      </Card>

      <div style={{ position: 'sticky', bottom: 12, marginTop: 18, display: 'flex', justifyContent: 'flex-end' }}>
        <Button variant="primary" size="lg" disabled={!canSave} loading={saving} onClick={() => void save()}>
          保存定位
        </Button>
      </div>
      {!canSave ? (
        <div style={{ textAlign: 'right', marginTop: 6, fontSize: 12, color: 'var(--muted)' }}>
          填写完整（卖点 3–5 条、短板 1–3 条、底线 ≤ 目标）后才可保存
        </div>
      ) : null}
    </div>
  )
}
