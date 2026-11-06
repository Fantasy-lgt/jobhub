import { useState } from 'react'
import type { CSSProperties } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, Card, ConfirmDialog, EmptyState, ErrorRetry, Modal, Pill } from '../../components'
import { invalidateDerivedQueries, offersApi } from '../../api/endpoints'
import { useUiStore } from '../../stores/ui'
import type { Offer, OfferDetail } from '../../types'
import {
  annualPackageFen,
  equityYuanPerYear,
  fenToWan,
  fenToYuan,
  offerScore,
} from '../../utils/money'
import { OfferFormModal } from './OfferFormModal'
import { DIMENSIONS } from './offer.helpers'

const TABLE_CELL: CSSProperties = {
  padding: '8px 10px',
  borderBottom: '1px dashed var(--muted)',
  textAlign: 'left',
  whiteSpace: 'nowrap',
}

interface CompareRow {
  label: string
  text: (o: Offer) => string
  /** 有值时按「越大越好」高亮该行最优单元格；留空则该行只展示。 */
  num?: (o: Offer) => number
}

const packageOf = (o: Offer): number => o.annual_package ?? annualPackageFen(o)
const scoreOf = (o: Offer): number => o.score ?? offerScore(o)

const COMPARE_ROWS: CompareRow[] = [
  { label: '年包（不含期权）', text: (o) => fenToWan(packageOf(o)), num: packageOf },
  { label: '加权总分', text: (o) => scoreOf(o).toFixed(2), num: scoreOf },
  { label: '月薪（元/月）', text: (o) => fenToYuan(o.base_salary), num: (o) => o.base_salary },
  { label: '薪月数', text: (o) => String(o.salary_months), num: (o) => o.salary_months },
  { label: '绩效月数', text: (o) => String(o.bonus_months), num: (o) => o.bonus_months },
  { label: '签字费（元）', text: (o) => fenToYuan(o.sign_bonus), num: (o) => o.sign_bonus },
  { label: '补贴（元/月）', text: (o) => fenToYuan(o.allowance), num: (o) => o.allowance },
  { label: '期权估值（元，单独列示）', text: (o) => o.equity_value.toLocaleString('zh-CN'), num: (o) => o.equity_value },
  { label: '期权年均值（元/年）', text: (o) => String(equityYuanPerYear(o)), num: equityYuanPerYear },
  ...DIMENSIONS.map((d) => ({
    label: `${d.label}权重（%）`,
    text: (o: Offer) => String(o.weights?.[d.key] ?? 0),
    num: (o: Offer) => o.weights?.[d.key] ?? 0,
  })),
  ...DIMENSIONS.map((d) => ({
    label: `${d.label}评分（1–5）`,
    text: (o: Offer) => String(o.scores?.[d.key] ?? 0),
    num: (o: Offer) => o.scores?.[d.key] ?? 0,
  })),
  { label: '答复截止', text: (o) => o.deadline ?? '—' },
  { label: '竞业 / 社保', text: (o) => `${o.non_compete ? '有竞业' : '无竞业'} / ${o.social_security ? '足额' : '未注明'}` },
]

/** Offer 决策：列表 + 薪资结构与年包 + 权重合计校验 + 加权评分 + 2–4 个对比。 */
export function OffersPage() {
  const qc = useQueryClient()
  const pushToast = useUiStore((s) => s.pushToast)

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Offer | null>(null)
  const [deleting, setDeleting] = useState<Offer | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [selected, setSelected] = useState<number[]>([])
  const [compareOpen, setCompareOpen] = useState(false)
  const [compareData, setCompareData] = useState<Offer[] | null>(null)
  const [compareLoading, setCompareLoading] = useState(false)
  const [detail, setDetail] = useState<OfferDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  const {
    data: offers = [],
    isLoading,
    isError,
    refetch,
  } = useQuery<Offer[]>({ queryKey: ['offers'], queryFn: offersApi.list })

  /** 写操作后：自身列表 + 所有派生聚合（概览 / 分析 / 题库弱点）一起失效。 */
  const refresh = async (): Promise<void> => {
    await qc.invalidateQueries({ queryKey: ['offers'] })
    invalidateDerivedQueries(qc)
  }

  const handleSubmit = async (data: Partial<Offer>): Promise<void> => {
    setSubmitting(true)
    try {
      if (editing) {
        await offersApi.update(editing.id, data)
        pushToast({ message: 'Offer 已保存', kind: 'success' })
      } else {
        await offersApi.create(data)
        pushToast({ message: 'Offer 已创建', kind: 'success' })
      }
      setFormOpen(false)
      setEditing(null)
      await refresh()
    } catch {
      // 错误已由 http 层 toast
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (): Promise<void> => {
    if (!deleting) return
    try {
      await offersApi.remove(deleting.id)
      pushToast({ message: `已删除「${deleting.company}」`, kind: 'success' })
      setSelected((ids) => ids.filter((id) => id !== deleting.id))
      setDeleting(null)
      await refresh()
    } catch {
      // 已 toast
    }
  }

  const toggleSelect = (id: number): void => {
    if (selected.includes(id)) {
      setSelected(selected.filter((x) => x !== id))
      return
    }
    if (selected.length >= 4) {
      pushToast({ message: '一次最多对比 4 个 Offer', kind: 'info' })
      return
    }
    setSelected([...selected, id])
  }

  const handleCompare = async (): Promise<void> => {
    if (selected.length < 2) {
      pushToast({ message: '请勾选 2–4 个 Offer 再对比', kind: 'info' })
      return
    }
    setCompareLoading(true)
    try {
      setCompareData(await offersApi.compare(selected))
      setCompareOpen(true)
    } catch {
      // 已 toast
    } finally {
      setCompareLoading(false)
    }
  }

  const handleDetail = async (id: number): Promise<void> => {
    setDetailLoading(true)
    try {
      setDetail(await offersApi.detail(id))
    } catch {
      // 已 toast
    } finally {
      setDetailLoading(false)
    }
  }

  const openCreate = (): void => {
    setEditing(null)
    setFormOpen(true)
  }
  const openEdit = (o: Offer): void => {
    setEditing(o)
    setFormOpen(true)
  }

  return (
    <div className="jh-page">
      <header className="jh-page-head">
        <h1 className="jh-page-title">🎉 Offer 决策</h1>
        <p className="jh-page-desc">
          薪资结构 + 四维加权评分（权重合计 100）+ 年包计算 + 2–4 个 Offer 对比
        </p>
      </header>

      <div className="jh-toolbar">
        <Button variant="primary" onClick={openCreate}>
          ＋ 新增 Offer
        </Button>
        <Button
          variant="secondary"
          loading={compareLoading}
          disabled={selected.length < 2 || offers.length < 2}
          onClick={() => void handleCompare()}
        >
          ⚖️ 对比选中（{selected.length}/4）
        </Button>
        <span style={{ fontSize: 12, color: 'var(--muted)', alignSelf: 'center' }}>
          年包不含期权，期权单独列示；勾选 2–4 个可横向对比
        </span>
      </div>

      {isLoading ? (
        <div className="jh-loading">
          <span className="jh-spinner" aria-hidden /> 加载中…
        </div>
      ) : isError ? (
        <ErrorRetry onRetry={() => void refetch()} />
      ) : offers.length === 0 ? (
        <Card>
          <EmptyState
            icon="🎉"
            title="还没有 Offer"
            description="拿到 Offer 后记下来，年包、加权评分和多 Offer 对比会自动算好。"
            action={
              <Button variant="primary" onClick={openCreate}>
                ＋ 新增第一个 Offer
              </Button>
            }
          />
        </Card>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {offers.map((o) => {
            const pkg = packageOf(o)
            const sc = scoreOf(o)
            return (
              <Card key={o.id} tilt>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', paddingTop: 4 }}>
                    <input
                      type="checkbox"
                      checked={selected.includes(o.id)}
                      onChange={() => toggleSelect(o.id)}
                      aria-label={`勾选 ${o.company} 参与对比`}
                    />
                    <span style={{ fontSize: 12, color: 'var(--muted)' }}>对比</span>
                  </label>

                  <div style={{ flex: 1, minWidth: 220 }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                      <b style={{ fontSize: 16 }}>{o.company}</b>
                      <span style={{ color: 'var(--sub)' }}>· {o.role}</span>
                      {o.rank ? <Pill color="brand">排名 #{o.rank}</Pill> : null}
                      {o.deadline ? <Pill color="amber">截止 {o.deadline}</Pill> : null}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
                      {o.city || '城市未填'} · 期权 ¥{o.equity_value.toLocaleString('zh-CN')} / {o.equity_years} 年
                      （约 {equityYuanPerYear(o)} 元/年，<b>不计入年包</b>）
                    </div>
                    <div style={{ fontSize: 13, marginTop: 8, lineHeight: 1.9 }}>
                      月薪 {fenToYuan(o.base_salary)} 元 × {o.salary_months} 月 · 绩效 {o.bonus_months} 月 ·
                      签字费 {fenToYuan(o.sign_bonus)} 元 · 补贴 {fenToYuan(o.allowance)} 元/月 · 公积金 {o.fund_rate}%
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                      {DIMENSIONS.map((d) => (
                        <Pill key={d.key} color="neutral">
                          {d.label} {o.weights?.[d.key] ?? 0}% · {o.scores?.[d.key] ?? 0} 分
                        </Pill>
                      ))}
                    </div>
                    {o.top_concern || o.note ? (
                      <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 8, lineHeight: 1.7 }}>
                        {o.top_concern ? `最顾虑：${o.top_concern}　` : ''}
                        {o.note ? `备注：${o.note}` : ''}
                      </div>
                    ) : null}
                  </div>

                  <div style={{ textAlign: 'right', minWidth: 110 }}>
                    <div style={{ fontSize: 12, color: 'var(--muted)' }}>年包</div>
                    <div style={{ fontSize: 24, fontWeight: 800 }}>{fenToWan(pkg)}</div>
                    <div style={{ fontSize: 13, marginTop: 4 }}>加权 {sc.toFixed(2)} 分</div>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12, borderTop: '1px dashed var(--muted)', paddingTop: 10 }}>
                  <Button size="sm" variant="secondary" onClick={() => openEdit(o)}>✏️ 编辑</Button>
                  <Button size="sm" variant="ghost" loading={detailLoading} onClick={() => void handleDetail(o.id)}>🧮 计算明细</Button>
                  <Button size="sm" variant="danger" onClick={() => setDeleting(o)}>🗑️ 删除</Button>
                </div>
              </Card>
            )
          })}
        </div>
      )}

      <OfferFormModal
        open={formOpen}
        onClose={() => {
          setFormOpen(false)
          setEditing(null)
        }}
        onSubmit={handleSubmit}
        initial={editing}
        submitting={submitting}
      />

      <ConfirmDialog
        open={deleting !== null}
        title="删除 Offer"
        description={deleting ? `确定删除「${deleting.company} · ${deleting.role}」吗？该操作为软删除。` : ''}
        confirmText="删除"
        danger
        onConfirm={() => void handleDelete()}
        onCancel={() => setDeleting(null)}
      />

      {/* 2–4 个 Offer 横向对比（offersApi.compare） */}
      <Modal
        open={compareOpen}
        onClose={() => setCompareOpen(false)}
        title="⚖️ Offer 对比"
        footer={<Button variant="secondary" onClick={() => setCompareOpen(false)}>关闭</Button>}
      >
        {compareData && compareData.length > 0 ? (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr>
                  <th style={TABLE_CELL}>维度</th>
                  {compareData.map((o) => (
                    <th key={o.id} style={TABLE_CELL}>
                      {o.company}
                      <br />
                      <span style={{ fontSize: 11, color: 'var(--muted)' }}>{o.role}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {COMPARE_ROWS.map((row) => {
                  const max = row.num ? Math.max(...compareData.map(row.num)) : undefined
                  return (
                    <tr key={row.label}>
                      <td style={{ ...TABLE_CELL, color: 'var(--muted)' }}>{row.label}</td>
                      {compareData.map((o) => {
                        const best = row.num !== undefined && max !== undefined && row.num(o) === max
                        return (
                          <td key={o.id} style={{ ...TABLE_CELL, fontWeight: best ? 800 : 400 }}>
                            {row.text(o)}
                            {best ? <Pill color="green">最优</Pill> : null}
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
              </tbody>
            </table>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 10, lineHeight: 1.7 }}>
              绿色标记为该项数值最高者；期权仅单独列示，不计入年包。权重合计均为 100。
            </div>
          </div>
        ) : (
          <EmptyState icon="⚖️" title="暂无可对比的数据" />
        )}
      </Modal>

      {/* 服务端计算过程明细（offersApi.detail） */}
      <Modal
        open={detail !== null}
        onClose={() => setDetail(null)}
        title={`🧮 ${detail?.offer.company ?? ''} 年包计算过程`}
        footer={<Button variant="secondary" onClick={() => setDetail(null)}>关闭</Button>}
      >
        {detail ? (
          <div>
            <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.8, marginBottom: 10 }}>
              服务端实时计算、不落库。年包 = 月薪×薪月数 + 绩效 + 签字费 + 补贴×12；期权单独列示，不计入年包。
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <tbody>
                {[
                  { label: '基本薪资（月薪×薪月数）', value: `${fenToYuan(detail.calc.base_cents, 2)} 元` },
                  { label: '绩效', value: `${fenToYuan(detail.calc.bonus_cents, 2)} 元` },
                  { label: '签字费', value: `${fenToYuan(detail.calc.sign_cents, 2)} 元` },
                  { label: '补贴（×12）', value: `${fenToYuan(detail.calc.allowance_cents, 2)} 元` },
                  { label: '年包合计（不含期权）', value: `${fenToYuan(detail.calc.total_cents, 2)} 元` },
                  { label: '期权估值（不计入）', value: `${fenToYuan(detail.calc.equity_cents, 2)} 元` },
                  { label: '期权年均值', value: `${detail.calc.equity_yuan_per_year} 元/年` },
                  { label: '加权总分', value: `${detail.calc.weighted_score.toFixed(2)} 分` },
                ].map((r) => (
                  <tr key={r.label}>
                    <td style={{ ...TABLE_CELL, color: 'var(--muted)' }}>{r.label}</td>
                    <td style={{ ...TABLE_CELL, fontWeight: 700 }}>{r.value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState icon="🧮" title="暂无计算明细" />
        )}
      </Modal>
    </div>
  )
}
