import { useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  ErrorRetry,
  Modal,
  Pill,
  ProgressBar,
  TrendChart,
} from '../../components'
import { analyticsApi, invalidateDerivedQueries } from '../../api/endpoints'
import { useUiStore } from '../../stores/ui'
import type { Indicator, WeeklyReview } from '../../types'
import { todayStr, weekStartOf } from '../../utils/date'
import {
  RANGE_OPTIONS,
  TREND_FIELD_LABEL,
  buildTrendSeries,
  drilldownTable,
  rateText,
} from './analytics.helpers'
import type { RangeKey, TrendField } from './analytics.helpers'

const CELL: CSSProperties = {
  padding: '8px 10px',
  borderBottom: '1px dashed var(--muted)',
  textAlign: 'left',
  whiteSpace: 'nowrap',
}

interface OverrideDraft {
  weekStart: string
  field: TrendField
  value: string
}

interface ReviewForm {
  week_start: string
  did_right: string
  did_wrong: string
  next_plan: string
}

/** 统一四态容器：加载 / 错误（可重试）/ 空 / 数据。 */
function Panel({
  loading,
  error,
  onRetry,
  empty,
  children,
}: {
  loading: boolean
  error: boolean
  onRetry: () => void
  empty?: boolean
  children: ReactNode
}) {
  if (loading) {
    return (
      <div className="jh-loading">
        <span className="jh-spinner" aria-hidden /> 加载中…
      </div>
    )
  }
  if (error) return <ErrorRetry onRetry={onRetry} />
  if (empty) {
    return (
      <EmptyState
        icon="📭"
        title="暂无数据"
        description="先在岗位池 / 面试复盘里积累一些记录，统计会自动算出来。"
      />
    )
  }
  return <>{children}</>
}

/** 数据复盘：漏斗 / 趋势改数 / 渠道 / 卡点 / 7 指标下钻 / 周复盘。 */
export function AnalyticsPage() {
  const qc = useQueryClient()
  const pushToast = useUiStore((s) => s.pushToast)
  const [range, setRange] = useState<RangeKey>('week')

  const funnelQ = useQuery({ queryKey: ['analytics', 'funnel'], queryFn: analyticsApi.funnel })
  const trendQ = useQuery({ queryKey: ['analytics', 'trend'], queryFn: analyticsApi.trend })
  const channelsQ = useQuery({ queryKey: ['analytics', 'channels'], queryFn: analyticsApi.channels })
  const bottleneckQ = useQuery({ queryKey: ['analytics', 'bottleneck'], queryFn: analyticsApi.bottleneck })
  const indicatorsQ = useQuery({
    queryKey: ['analytics', 'indicators', range],
    queryFn: () => analyticsApi.indicators(range),
  })
  const reviewsQ = useQuery({
    queryKey: ['analytics', 'weekly-reviews'],
    queryFn: analyticsApi.weeklyReviews,
  })

  /** 写操作后：复盘全部子 key + 所有派生聚合一起失效。 */
  const refresh = async (): Promise<void> => {
    await qc.invalidateQueries({ queryKey: ['analytics'] })
    invalidateDerivedQueries(qc)
  }

  // ---------- 趋势点选改数 ----------
  const [override, setOverride] = useState<OverrideDraft | null>(null)
  const [overrideSaving, setOverrideSaving] = useState(false)

  const onPointClick = (seriesKey: string, index: number): void => {
    const point = trendQ.data?.[index]
    if (!point) return
    if (seriesKey !== 'apply' && seriesKey !== 'interview' && seriesKey !== 'offer') return
    setOverride({ weekStart: point.label, field: seriesKey, value: String(point[seriesKey]) })
  }

  const saveOverride = async (value: number | null): Promise<void> => {
    if (!override) return
    setOverrideSaving(true)
    try {
      const patch: { apply?: number | null; interview?: number | null; offer?: number | null } = {}
      if (override.field === 'apply') patch.apply = value
      else if (override.field === 'interview') patch.interview = value
      else patch.offer = value
      await analyticsApi.overrideTrend(override.weekStart, patch)
      pushToast({
        message: value === null ? '已恢复该周自动统计' : '已更新该周数据',
        kind: 'success',
      })
      setOverride(null)
      await refresh()
    } catch {
      // 已由 http 层 toast
    } finally {
      setOverrideSaving(false)
    }
  }

  // ---------- 指标下钻 ----------
  const [drill, setDrill] = useState<{ label: string; rows: unknown[] } | null>(null)
  const [drillLoading, setDrillLoading] = useState(false)

  const openDrill = async (ind: Indicator): Promise<void> => {
    setDrillLoading(true)
    try {
      setDrill({ label: ind.label, rows: await analyticsApi.indicatorDrilldown(ind.key, range) })
    } catch {
      // 已 toast
    } finally {
      setDrillLoading(false)
    }
  }
  const drillTable = drill ? drilldownTable(drill.rows) : null

  // ---------- 周复盘 ----------
  const [reviewOpen, setReviewOpen] = useState(false)
  const [reviewEditing, setReviewEditing] = useState<string | null>(null)
  const [reviewSaving, setReviewSaving] = useState(false)
  const [reviewForm, setReviewForm] = useState<ReviewForm>({
    week_start: '',
    did_right: '',
    did_wrong: '',
    next_plan: '',
  })
  const [clearing, setClearing] = useState<WeeklyReview | null>(null)

  const openCreateReview = (): void => {
    setReviewEditing(null)
    setReviewForm({ week_start: weekStartOf(todayStr()), did_right: '', did_wrong: '', next_plan: '' })
    setReviewOpen(true)
  }
  const openEditReview = (r: WeeklyReview): void => {
    setReviewEditing(r.week_start)
    setReviewForm({
      week_start: r.week_start,
      did_right: r.did_right ?? '',
      did_wrong: r.did_wrong ?? '',
      next_plan: r.next_plan ?? '',
    })
    setReviewOpen(true)
  }

  const saveReview = async (): Promise<void> => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(reviewForm.week_start)) {
      pushToast({ message: '请选择周起始日', kind: 'error' })
      return
    }
    const payload = {
      did_right: reviewForm.did_right,
      did_wrong: reviewForm.did_wrong,
      next_plan: reviewForm.next_plan,
    }
    setReviewSaving(true)
    try {
      if (reviewEditing) {
        await analyticsApi.updateWeeklyReview(reviewEditing, payload)
      } else {
        await analyticsApi.createWeeklyReview({
          ...payload,
          week_start: weekStartOf(reviewForm.week_start),
        })
      }
      pushToast({ message: '周复盘已保存', kind: 'success' })
      setReviewOpen(false)
      setReviewEditing(null)
      await refresh()
    } catch {
      // 已 toast
    } finally {
      setReviewSaving(false)
    }
  }

  /** 后端本期无 DELETE，清空三段文字作为「删除」，趋势改数 override 保留。 */
  const clearReview = async (): Promise<void> => {
    if (!clearing) return
    try {
      await analyticsApi.updateWeeklyReview(clearing.week_start, {
        did_right: '',
        did_wrong: '',
        next_plan: '',
      })
      pushToast({ message: `已清空 ${clearing.week_start} 的复盘文字（趋势改数保留）`, kind: 'success' })
      setClearing(null)
      await refresh()
    } catch {
      // 已 toast
    }
  }

  const funnel = funnelQ.data
  const trend = trendQ.data ?? []
  const channels = channelsQ.data ?? []
  const bottleneck = bottleneckQ.data
  const indicators = indicatorsQ.data ?? []
  const reviews = reviewsQ.data ?? []

  return (
    <div className="jh-page">
      <header className="jh-page-head">
        <h1 className="jh-page-title">📈 数据复盘</h1>
        <p className="jh-page-desc">
          漏斗 / 周趋势（点数据点改数）/ 渠道效果 / 卡点诊断 / 7 指标下钻 / 周复盘，统计全部实时计算
        </p>
      </header>

      <div className="jh-toolbar">
        <div className="jh-viewtoggle" role="tablist" aria-label="指标时间范围">
          {RANGE_OPTIONS.map((o) => (
            <button
              key={o.key}
              className={`jh-viewtoggle__btn ${range === o.key ? 'jh-viewtoggle__btn--active' : ''}`}
              onClick={() => setRange(o.key)}
              role="tab"
              aria-selected={range === o.key}
            >
              {o.label}
            </button>
          ))}
        </div>
        <span style={{ fontSize: 12, color: 'var(--muted)', alignSelf: 'center' }}>
          时间范围影响「7 指标」与下钻；其余口径为全量实时统计
        </span>
      </div>

      {/* 漏斗 + 卡点 */}
      <div className="jh-block">
        <div className="jh-grid jh-grid--23">
          <Card>
            <div className="jh-sec-title">
              🔻 转化漏斗 <span className="sub">从岗位状态与流转时间轴实时推导</span>
            </div>
            <div style={{ marginTop: 12 }}>
              <Panel
                loading={funnelQ.isLoading}
                error={funnelQ.isError}
                onRetry={() => void funnelQ.refetch()}
                empty={!!funnel && funnel.applied === 0 && funnel.written === 0 && funnel.interview === 0 && funnel.offer === 0}
              >
                {funnel ? (
                  <>
                    <div className="jh-grid jh-grid--4">
                      {[
                        { label: '已投', value: funnel.applied, icon: '📮' },
                        { label: '笔试', value: funnel.written, icon: '✍️' },
                        { label: '面试', value: funnel.interview, icon: '🎤' },
                        { label: 'Offer', value: funnel.offer, icon: '🎉' },
                      ].map((x) => (
                        <div className="jh-kpi" key={x.label}>
                          <div className="jh-kpi__ic">{x.icon}</div>
                          <div className="jh-kpi__v">{x.value}</div>
                          <div className="jh-kpi__l">{x.label}</div>
                        </div>
                      ))}
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
                      <Pill color="blue">已投 → 笔试 {rateText(funnel.applied_to_written_rate)}</Pill>
                      <Pill color="amber">笔试 → 面试 {rateText(funnel.written_to_interview_rate)}</Pill>
                      <Pill color="green">面试 → Offer {rateText(funnel.interview_to_offer_rate)}</Pill>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 8 }}>
                      分母为 0 的段显示「—」，不显示 0%。
                    </div>
                  </>
                ) : null}
              </Panel>
            </div>
          </Card>

          <Card>
            <div className="jh-sec-title">
              🚧 卡点诊断 <span className="sub">转化率最弱的一段</span>
            </div>
            <div style={{ marginTop: 12 }}>
              <Panel
                loading={bottleneckQ.isLoading}
                error={bottleneckQ.isError}
                onRetry={() => void bottleneckQ.refetch()}
                empty={!bottleneck?.title}
              >
                {bottleneck ? (
                  <div style={{ lineHeight: 1.9 }}>
                    <Pill color="pink">最弱环节：{bottleneck.title}</Pill>
                    <p style={{ fontSize: 14, color: 'var(--sub)', marginTop: 10 }}>{bottleneck.detail}</p>
                  </div>
                ) : null}
              </Panel>
            </div>
          </Card>
        </div>
      </div>

      {/* 周趋势：点数据点改数 */}
      <div className="jh-block">
        <Card>
          <div className="jh-sec-title">
            📈 周趋势 <span className="sub">投递 / 面试 / 累计 Offer，点任意数据点可改数</span>
          </div>
          <div style={{ marginTop: 12 }}>
            <Panel
              loading={trendQ.isLoading}
              error={trendQ.isError}
              onRetry={() => void trendQ.refetch()}
              empty={trend.length === 0}
            >
              <TrendChart series={buildTrendSeries(trend)} height={220} onPointClick={onPointClick} />
              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 8, lineHeight: 1.7 }}>
                改数只覆盖该周的手工值，可随时「恢复自动统计」；Offer 线为累计值。
              </div>
            </Panel>
          </div>
        </Card>
      </div>

      {/* 渠道效果 */}
      <div className="jh-block">
        <Card>
          <div className="jh-sec-title">
            🧭 渠道效果 <span className="sub">按面试率从高到低</span>
          </div>
          <div style={{ marginTop: 12 }}>
            <Panel
              loading={channelsQ.isLoading}
              error={channelsQ.isError}
              onRetry={() => void channelsQ.refetch()}
              empty={channels.length === 0}
            >
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr>
                      {['渠道', '投递', '面试', 'Offer', '面试率'].map((h) => (
                        <th key={h} style={CELL}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {channels.map((c) => (
                      <tr key={c.channel}>
                        <td style={{ ...CELL, fontWeight: 700 }}>{c.channel}</td>
                        <td style={CELL}>{c.applied}</td>
                        <td style={CELL}>{c.interviews}</td>
                        <td style={CELL}>{c.offers}</td>
                        <td style={{ ...CELL, minWidth: 160 }}>
                          <span>{c.rate}%</span>
                          <ProgressBar value={c.rate} max={100} color="green" label={`${c.channel}面试率`} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>
          </div>
        </Card>
      </div>

      {/* 7 指标 + 下钻 */}
      <div className="jh-block">
        <Card>
          <div className="jh-sec-title">
            🎯 7 项指标 <span className="sub">点「下钻」看构成明细（{RANGE_OPTIONS.find((o) => o.key === range)?.label}）</span>
          </div>
          <div style={{ marginTop: 12 }}>
            <Panel
              loading={indicatorsQ.isLoading}
              error={indicatorsQ.isError}
              onRetry={() => void indicatorsQ.refetch()}
              empty={indicators.length === 0}
            >
              <div className="jh-grid jh-grid--4">
                {indicators.map((ind) => (
                  <div className="jh-kpi" key={ind.key}>
                    <div className="jh-kpi__v">
                      {ind.value}
                      <span style={{ fontSize: 13 }}>{ind.unit}</span>
                    </div>
                    <div className="jh-kpi__l">{ind.label}</div>
                    <div className="jh-kpi__x">{ind.note}</div>
                    <Button
                      size="sm"
                      variant="ghost"
                      style={{ marginTop: 8 }}
                      loading={drillLoading}
                      onClick={() => void openDrill(ind)}
                    >
                      下钻 →
                    </Button>
                  </div>
                ))}
              </div>
            </Panel>
          </div>
        </Card>
      </div>

      {/* 周复盘 */}
      <div className="jh-block">
        <Card>
          <div className="jh-sec-title">
            🗓️ 周复盘
            <span style={{ marginLeft: 'auto' }}>
              <Button size="sm" variant="primary" onClick={openCreateReview}>＋ 新增周复盘</Button>
            </span>
          </div>
          <div style={{ marginTop: 12 }}>
            <Panel
              loading={reviewsQ.isLoading}
              error={reviewsQ.isError}
              onRetry={() => void reviewsQ.refetch()}
              empty={reviews.length === 0}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {reviews.map((r) => (
                  <div
                    key={r.id}
                    style={{
                      border: '2px solid var(--ink)',
                      borderRadius: 12,
                      padding: 12,
                      background: 'var(--card)',
                    }}
                  >
                    <div className="jh-sec-title" style={{ fontSize: 14 }}>
                      📅 {r.week_start} 那一周
                      <span className="sub">
                        手工改数：投递 {r.apply_override ?? '自动'} · 面试 {r.interview_override ?? '自动'} · Offer {r.offer_override ?? '自动'}
                      </span>
                    </div>
                    <div style={{ fontSize: 13, lineHeight: 1.9, marginTop: 6 }}>
                      <div>✅ 做对了：{r.did_right || '—'}</div>
                      <div>⚠️ 没做好：{r.did_wrong || '—'}</div>
                      <div>🎯 下周计划：{r.next_plan || '—'}</div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                      <Button size="sm" variant="secondary" onClick={() => openEditReview(r)}>✏️ 编辑</Button>
                      <Button size="sm" variant="danger" onClick={() => setClearing(r)}>🗑️ 删除</Button>
                    </div>
                  </div>
                ))}
              </div>
            </Panel>
          </div>
        </Card>
      </div>

      {/* 趋势改数 */}
      <Modal
        open={override !== null}
        onClose={() => setOverride(null)}
        title="✏️ 修改该周数据"
        footer={
          <>
            <Button variant="ghost" loading={overrideSaving} onClick={() => void saveOverride(null)}>
              恢复自动统计
            </Button>
            <Button variant="secondary" onClick={() => setOverride(null)}>取消</Button>
            <Button
              variant="primary"
              loading={overrideSaving}
              onClick={() => {
                const n = Number(override?.value)
                if (!Number.isInteger(n) || n < 0) {
                  pushToast({ message: '请输入非负整数', kind: 'error' })
                  return
                }
                void saveOverride(n)
              }}
            >
              保存
            </Button>
          </>
        }
      >
        {override ? (
          <div className="jh-form">
            <p style={{ fontSize: 13, color: 'var(--sub)', lineHeight: 1.8 }}>
              周起始 <b>{override.weekStart}</b> · 指标 <b>{TREND_FIELD_LABEL[override.field]}</b>。
              保存会写入该周的手工覆盖值；「恢复自动统计」清除覆盖，回到实时计算。
            </p>
            <div className="jh-field">
              <label className="jh-label" htmlFor="jh-override-value">数值</label>
              <input
                id="jh-override-value"
                className="jh-input"
                type="number"
                min={0}
                value={override.value}
                onChange={(e) =>
                  setOverride((d) => (d ? { ...d, value: e.target.value } : d))
                }
              />
              <span className="jh-field__hint">Offer 为「到该周为止的累计值」，不是当周新增。</span>
            </div>
          </div>
        ) : null}
      </Modal>

      {/* 指标下钻 */}
      <Modal
        open={drill !== null}
        onClose={() => setDrill(null)}
        title={`🔍 ${drill?.label ?? ''} · 下钻明细`}
        footer={<Button variant="secondary" onClick={() => setDrill(null)}>关闭</Button>}
      >
        {drill && drillTable && drillTable.columns.length > 0 ? (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr>
                  {drillTable.columns.map((c) => (
                    <th key={c} style={CELL}>{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {drillTable.cells.map((row, i) => (
                  <tr key={i}>
                    {row.map((v, j) => (
                      <td key={j} style={CELL}>{v}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 10 }}>
              共 {drillTable.cells.length} 条 · 时间范围：{RANGE_OPTIONS.find((o) => o.key === range)?.label}
            </div>
          </div>
        ) : (
          <EmptyState icon="🔍" title="该指标暂无明细" description="换个时间范围，或先补充一些记录。" />
        )}
      </Modal>

      {/* 周复盘新增 / 编辑 */}
      <Modal
        open={reviewOpen}
        onClose={() => setReviewOpen(false)}
        title={reviewEditing ? '✏️ 编辑周复盘' : '＋ 新增周复盘'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setReviewOpen(false)}>取消</Button>
            <Button variant="primary" loading={reviewSaving} onClick={() => void saveReview()}>
              保存
            </Button>
          </>
        }
      >
        <div className="jh-form">
          <div className="jh-field">
            <label className="jh-label" htmlFor="jh-review-week">周起始日（周一）*</label>
            <input
              id="jh-review-week"
              className="jh-input"
              type="date"
              disabled={!!reviewEditing}
              value={reviewForm.week_start}
              onChange={(e) => setReviewForm((f) => ({ ...f, week_start: e.target.value }))}
            />
            <span className="jh-field__hint">保存时自动归一到该周周一；编辑时不可改。</span>
          </div>
          <div className="jh-field">
            <label className="jh-label" htmlFor="jh-review-right">✅ 这周做对了什么</label>
            <textarea
              id="jh-review-right"
              className="jh-input"
              value={reviewForm.did_right}
              onChange={(e) => setReviewForm((f) => ({ ...f, did_right: e.target.value }))}
              placeholder="如：把高频题按 STAR 重写了一遍"
            />
          </div>
          <div className="jh-field">
            <label className="jh-label" htmlFor="jh-review-wrong">⚠️ 哪里没做好</label>
            <textarea
              id="jh-review-wrong"
              className="jh-input"
              value={reviewForm.did_wrong}
              onChange={(e) => setReviewForm((f) => ({ ...f, did_wrong: e.target.value }))}
              placeholder="如：投递集中在同一渠道"
            />
          </div>
          <div className="jh-field">
            <label className="jh-label" htmlFor="jh-review-plan">🎯 下周计划</label>
            <textarea
              id="jh-review-plan"
              className="jh-input"
              value={reviewForm.next_plan}
              onChange={(e) => setReviewForm((f) => ({ ...f, next_plan: e.target.value }))}
              placeholder="如：每天 2 个内推 + 复盘 1 场面试"
            />
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={clearing !== null}
        title="删除周复盘"
        description={
          clearing
            ? `确定删除「${clearing.week_start} 那一周」的复盘吗？本期后端未提供删除接口，将清空三段复盘文字（该周的趋势手工改数会保留）。`
            : ''
        }
        confirmText="清空"
        danger
        onConfirm={() => void clearReview()}
        onCancel={() => setClearing(null)}
      />
    </div>
  )
}
