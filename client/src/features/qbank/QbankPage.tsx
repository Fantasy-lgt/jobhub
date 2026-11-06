import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, EmptyState, ErrorRetry, Pill, TrendChart } from '../../components'
import { qbankApi } from '../../api/endpoints'
import { useUiStore } from '../../stores/ui'
import { WEAKNESS_DEFS } from '../../types'
import type { QbankGroup, WeaknessCode, WeaknessSummary } from '../../types'
import { formatDate } from '../../utils/date'

/* ---------------- 弱点看板 ---------------- */

function WeaknessCard({
  w,
  matchingGroups,
  onOpenGroup,
}: {
  w: WeaknessSummary
  matchingGroups: QbankGroup[]
  onOpenGroup: (id: string) => void
}) {
  const [open, setOpen] = useState(false)
  const isPattern = w.distinct_sessions >= 2
  return (
    <div className={`jh-weakness ${isPattern ? 'jh-weakness--pattern' : ''}`}>
      <button type="button" className="jh-weakness__head" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <span style={{ fontWeight: 700, fontSize: 13 }}>{w.code} {w.name}</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Pill color={isPattern ? 'green' : 'amber'}>{isPattern ? '模式级' : '观察中'}</Pill>
          <span style={{ fontSize: 11, color: 'var(--muted)' }}>{w.distinct_sessions} 场里 {w.hits} 次</span>
        </span>
      </button>
      {open ? (
        <div className="jh-weakness__body">
          <div style={{ fontSize: 12, color: 'var(--sub)' }}>{w.desc}</div>
          {w.total_sessions < 2 ? (
            <div style={{ fontSize: 12, color: 'var(--amber)', marginTop: 6 }}>
              ⚠️ 暂不足以判断模式（总场次 {w.total_sessions} &lt; 2），避免下「你总是/你习惯性」的结论。
            </div>
          ) : null}
          {w.examples.length > 0 ? (
            <div style={{ marginTop: 8 }}>
              <span className="jh-label">最近原句</span>
              {w.examples.map((ex, i) => (
                <div key={i} className="jh-weakness__example">「{ex}」</div>
              ))}
            </div>
          ) : null}
          {matchingGroups.length > 0 ? (
            <div style={{ marginTop: 8 }}>
              <span className="jh-label">命中题组（点击看哪场哪题）</span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 4 }}>
                {matchingGroups.map((g) => (
                  <button key={g.id} type="button" className="jh-weakness__link" onClick={() => onOpenGroup(g.id)}>
                    → {g.question}（{g.occurrences} 次）
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

/* ---------------- 题组 ---------------- */

interface GroupItemProps {
  g: QbankGroup
  selected: boolean
  onSelect: (id: string) => void
  expanded: boolean
  onToggle: () => void
}

function GroupItem({ g, selected, onSelect, expanded, onToggle }: GroupItemProps) {
  const [splittingQid, setSplittingQid] = useState<number | null>(null)
  const qc = useQueryClient()
  const pushToast = useUiStore((s) => s.pushToast)
  const detail = useQuery({
    queryKey: ['qbank-group', g.id],
    queryFn: () => qbankApi.groupDetail(g.id),
    enabled: expanded,
  })

  const split = async (qid: number): Promise<void> => {
    setSplittingQid(qid)
    try {
      await qbankApi.createLink({ aId: Number(g.id), bId: qid, type: 'split' })
      pushToast({ message: '已拆出该题，独立成组', kind: 'success' })
      await qc.invalidateQueries({ queryKey: ['qbank-groups'] })
    } catch {
      // 已 toast
    } finally {
      setSplittingQid(null)
    }
  }

  return (
    <div className={`jh-qgroup ${selected ? 'jh-qgroup--selected' : ''}`}>
      <div className="jh-qgroup__head">
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, cursor: 'pointer' }}>
          <input type="checkbox" checked={selected} onChange={() => onSelect(g.id)} aria-label={`选择 ${g.question}`} />
          <span style={{ minWidth: 0 }}>
            <span className="jh-qgroup__q">{g.question}</span>
            <span className="jh-qgroup__meta">
              出现 {g.occurrences} 次 · 最近 {g.last_seen ? formatDate(g.last_seen) : '—'} · 缺 STAR {g.missed} 次
            </span>
          </span>
        </label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, flexWrap: 'wrap' }}>
          {g.weakness_codes.slice(0, 3).map((c) => (
            <Pill key={c} color="amber">{c}</Pill>
          ))}
          <Button size="sm" variant="secondary" onClick={onToggle}>
            {expanded ? '收起' : '展开'}
          </Button>
        </div>
      </div>

      {expanded ? (
        <div className="jh-qgroup__body">
          {detail.isLoading ? (
            <div className="jh-loading"><span className="jh-spinner" aria-hidden /> 加载中…</div>
          ) : detail.isError || !detail.data ? (
            <ErrorRetry onRetry={() => void detail.refetch()} />
          ) : (
            <>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {detail.data.history.map((h, i) => (
                  <div key={i} className="jh-qgroup__history">
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12, color: 'var(--sub)', flexWrap: 'wrap' }}>
                      <span>
                        第 {i + 1} 次 · {h.company ? `${h.company} ${h.round ?? ''} · ` : ''}
                        {h.at ? formatDate(h.at) : '时间未知'}
                      </span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span>{h.result}</span>
                        {h.question_id !== Number(g.id) ? (
                          <Button
                            size="sm"
                            variant="danger"
                            loading={splittingQid === h.question_id}
                            onClick={() => void split(h.question_id)}
                          >
                            拆出
                          </Button>
                        ) : null}
                      </span>
                    </div>
                    <div style={{ fontSize: 13, marginTop: 4 }}>{h.my_answer || '（无回答记录）'}</div>
                  </div>
                ))}
              </div>
              {detail.data.recent_trend.length > 0 ? (
                <div style={{ marginTop: 12 }}>
                  <span className="jh-label">最近 3 次自评分趋势</span>
                  <TrendChart
                    height={140}
                    series={[{ key: 'score', name: '自评分', color: 'var(--brand)', points: detail.data.recent_trend }]}
                  />
                </div>
              ) : null}
            </>
          )}
        </div>
      ) : null}
    </div>
  )
}

/* ---------------- 主页面 ---------------- */

type SortKey = 'last_seen' | 'occurrences'

/** 题库弱点：左侧弱点看板 + 右侧题库聚合（PC 两栏，移动端上下两段）。 */
export function QbankPage() {
  const qc = useQueryClient()
  const pushToast = useUiStore((s) => s.pushToast)

  const [kw, setKw] = useState('')
  const [weaknessFilter, setWeaknessFilter] = useState<string>('')
  const [sortKey, setSortKey] = useState<SortKey>('last_seen')
  const [selected, setSelected] = useState<string[]>([])
  const [merging, setMerging] = useState(false)
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null)

  const groupsQuery = useQuery({ queryKey: ['qbank-groups'], queryFn: qbankApi.groups })
  const weakQuery = useQuery({ queryKey: ['qbank-weaknesses'], queryFn: qbankApi.weaknesses })

  const groups = useMemo(() => {
    let list = groupsQuery.data ?? []
    if (kw.trim()) {
      const k = kw.trim()
      list = list.filter((g) => g.question.includes(k))
    }
    if (weaknessFilter) {
      list = list.filter((g) => g.weakness_codes.includes(weaknessFilter as WeaknessCode))
    }
    return [...list].sort((a, b) => {
      if (sortKey === 'occurrences') return b.occurrences - a.occurrences
      return (b.last_seen ?? '').localeCompare(a.last_seen ?? '')
    })
  }, [groupsQuery.data, kw, weaknessFilter, sortKey])

  const toggleSelect = (id: string): void => {
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : s.length < 2 ? [...s, id] : s))
  }

  const merge = async (): Promise<void> => {
    if (selected.length !== 2) return
    setMerging(true)
    try {
      await qbankApi.createLink({ aId: Number(selected[0]), bId: Number(selected[1]), type: 'merge' })
      pushToast({ message: '已合并两组', kind: 'success' })
      setSelected([])
      await qc.invalidateQueries({ queryKey: ['qbank-groups'] })
    } catch {
      // 已 toast
    } finally {
      setMerging(false)
    }
  }

  return (
    <div className="jh-page">
      <header className="jh-page-head">
        <h1 className="jh-page-title">📚 题库弱点</h1>
        <p className="jh-page-desc">同义题聚合 · W1–W8 弱点 · 手动合并</p>
      </header>

      <div className="jh-qbank-layout">
        {/* 左：弱点看板 */}
        <div className="jh-qbank-weak">
          <div className="jh-sec-title">🩺 弱点看板</div>
          {weakQuery.isLoading ? (
            <div className="jh-loading"><span className="jh-spinner" aria-hidden /> 加载中…</div>
          ) : weakQuery.isError ? (
            <ErrorRetry onRetry={() => void weakQuery.refetch()} />
          ) : (weakQuery.data ?? []).length === 0 ? (
            <EmptyState icon="🩺" title="暂无弱点" description="录题后，机检会自动沉淀 W1–W8 弱点。" />
          ) : (
            <div className="jh-weak-list" style={{ marginTop: 10 }}>
              {weakQuery.data!.map((w) => (
                <WeaknessCard
                  key={w.code}
                  w={w}
                  matchingGroups={(groupsQuery.data ?? []).filter((g) => g.weakness_codes.includes(w.code))}
                  onOpenGroup={setExpandedGroup}
                />
              ))}
            </div>
          )}
        </div>

        {/* 右：题库聚合 */}
        <div className="jh-qbank-groups">
          <div className="jh-sec-title">🗂️ 题库聚合</div>

          <div className="jh-toolbar" style={{ marginTop: 10, marginBottom: 10 }}>
            <input
              className="jh-input jh-filter-search"
              value={kw}
              onChange={(e) => setKw(e.target.value)}
              placeholder="搜题目关键词"
              aria-label="搜索题目"
            />
            <select
              className="jh-input"
              style={{ width: 'auto', minHeight: 40 }}
              value={weaknessFilter}
              onChange={(e) => setWeaknessFilter(e.target.value)}
              aria-label="按弱点类型筛选"
            >
              <option value="">全部弱点</option>
              {WEAKNESS_DEFS.map((w) => (
                <option key={w.code} value={w.code}>
                  {w.code} {w.name}
                </option>
              ))}
            </select>
            <select
              className="jh-input"
              style={{ width: 'auto', minHeight: 40 }}
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value as SortKey)}
              aria-label="排序"
            >
              <option value="last_seen">按最近出现</option>
              <option value="occurrences">按出现次数</option>
            </select>
            {selected.length === 2 ? (
              <Button size="sm" variant="primary" onClick={() => void merge()} loading={merging}>
                合并所选两组
              </Button>
            ) : (
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>勾选两组可合并</span>
            )}
          </div>

          {groupsQuery.isLoading ? (
            <div className="jh-loading"><span className="jh-spinner" aria-hidden /> 加载中…</div>
          ) : groupsQuery.isError ? (
            <ErrorRetry onRetry={() => void groupsQuery.refetch()} />
          ) : groups.length === 0 ? (
            <EmptyState icon="📚" title="题库还是空的" description="录题后，同义/近义题会自动聚成一题组。" />
          ) : (
            <div className="jh-qgroup-list" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {groups.map((g) => (
                <GroupItem
                  key={g.id}
                  g={g}
                  selected={selected.includes(g.id)}
                  onSelect={toggleSelect}
                  expanded={expandedGroup === g.id}
                  onToggle={() => setExpandedGroup(expandedGroup === g.id ? null : g.id)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
