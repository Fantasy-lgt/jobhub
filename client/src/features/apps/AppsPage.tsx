import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, ConfirmDialog, EmptyState, ErrorRetry } from '../../components'
import { appsApi, profileApi } from '../../api/endpoints'
import { useMediaQuery } from '../../hooks/useMediaQuery'
import { useUiStore } from '../../stores/ui'
import { APP_STATUSES, APP_STATUS_LABEL, CHANNELS, STAGE_GROUP_FILTERS } from '../../types'
import type { App, AppStatus } from '../../types'
import { AppCard } from './AppCard'
import { AppFormModal } from './AppFormModal'
import { AppDetailDrawer } from './AppDetailDrawer'
import { statusLabel } from './apps.helpers'

type View = 'board' | 'list'

interface Filters {
  channel: string
  interest: number | ''
  overdue: boolean
  q: string
  statusGroup: string
}

const EMPTY_FILTERS: Filters = { channel: '', interest: '', overdue: false, q: '', statusGroup: '' }

/** 岗位池：看板（11 列 + 拖拽）/ 列表双视图 + 筛选搜索 + 新建/编辑/详情/删除。 */
export function AppsPage() {
  const isMobile = useMediaQuery('(max-width:820px)')
  const qc = useQueryClient()
  const pushToast = useUiStore((s) => s.pushToast)

  const [view, setView] = useState<View>('board')
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS)
  const [page, setPage] = useState(1)
  const [selectedStatus, setSelectedStatus] = useState<AppStatus | ''>('')

  const [formOpen, setFormOpen] = useState(false)
  const [editingApp, setEditingApp] = useState<App | null>(null)
  const [detailId, setDetailId] = useState<number | null>(null)
  const [deleting, setDeleting] = useState<App | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const [dropTarget, setDropTarget] = useState<AppStatus | null>(null)

  const isList = view === 'list' && !isMobile

  const activeFilters = {
    channel: filters.channel || undefined,
    interest: filters.interest || undefined,
    overdue: filters.overdue || undefined,
    q: filters.q || undefined,
  }

  const allAppsQuery = useQuery({
    queryKey: ['apps', 'all', activeFilters],
    queryFn: async () => {
      const all: App[] = []
      let p = 1
      for (;;) {
        const res = await appsApi.list({ ...activeFilters, page: p, pageSize: 100 })
        all.push(...res.items)
        if (all.length >= res.total || res.items.length === 0) break
        p += 1
      }
      return all
    },
    enabled: !isList,
  })

  const listQuery = useQuery({
    queryKey: ['apps', 'list', activeFilters, filters.statusGroup, page],
    queryFn: () =>
      appsApi.list({
        ...activeFilters,
        status: filters.statusGroup || undefined,
        page,
        pageSize: 20,
      }),
    enabled: isList,
  })

  const resumesQuery = useQuery({
    queryKey: ['resumes'],
    queryFn: profileApi.listResumes,
  })

  const refresh = async (): Promise<void> => {
    await qc.invalidateQueries({ queryKey: ['apps'] })
  }

  const handleCreate = async (data: Partial<App>): Promise<void> => {
    setSubmitting(true)
    try {
      if (editingApp) {
        await appsApi.update(editingApp.id, data)
        pushToast({ message: '已保存', kind: 'success' })
      } else {
        await appsApi.create(data)
        pushToast({ message: '已创建岗位', kind: 'success' })
      }
      setFormOpen(false)
      setEditingApp(null)
      await refresh()
    } catch {
      // 错误已由 http 层 toast
    } finally {
      setSubmitting(false)
    }
  }

  const handleStatusChange = async (app: App, toStatus: AppStatus): Promise<void> => {
    if (app.status === toStatus) return
    try {
      await appsApi.changeStatus(app.id, toStatus, 'manual')
      pushToast({ message: `「${app.company}」已改为「${statusLabel(toStatus)}」`, kind: 'success' })
      await refresh()
    } catch {
      // 已 toast
    }
  }

  const handleDelete = async (): Promise<void> => {
    if (!deleting) return
    try {
      await appsApi.remove(deleting.id)
      pushToast({ message: `已删除「${deleting.company}」`, kind: 'success' })
      setDeleting(null)
      setDetailId(null)
      await refresh()
    } catch {
      // 已 toast
    }
  }

  const openEdit = (app: App): void => {
    setDetailId(null)
    setEditingApp(app)
    setFormOpen(true)
  }

  const isLoading = isList ? listQuery.isLoading : allAppsQuery.isLoading
  const isError = isList ? listQuery.isError : allAppsQuery.isError
  const refetch = () => (isList ? listQuery.refetch() : allAppsQuery.refetch())

  const boardApps = allAppsQuery.data ?? []
  const mobileApps =
    selectedStatus === '' ? boardApps : boardApps.filter((a) => a.status === selectedStatus)

  return (
    <div className="jh-page">
      <header className="jh-page-head">
        <h1 className="jh-page-title">🗂️ 岗位池</h1>
        <p className="jh-page-desc">11 态状态机 · 拖拽改状态写时间轴 · 看板/列表双视图</p>
      </header>

      {/* 工具栏 */}
      <div className="jh-toolbar">
        {!isMobile && (
          <div className="jh-viewtoggle" role="tablist" aria-label="视图切换">
            <button
              className={`jh-viewtoggle__btn ${view === 'board' ? 'jh-viewtoggle__btn--active' : ''}`}
              onClick={() => setView('board')}
            >
              看板
            </button>
            <button
              className={`jh-viewtoggle__btn ${view === 'list' ? 'jh-viewtoggle__btn--active' : ''}`}
              onClick={() => setView('list')}
            >
              列表
            </button>
          </div>
        )}

        <input
          className="jh-input jh-filter-search"
          value={filters.q}
          onChange={(e) => {
            setFilters((f) => ({ ...f, q: e.target.value }))
            setPage(1)
          }}
          placeholder="搜公司 / 岗位"
          aria-label="搜索公司或岗位"
        />

        <select
          className="jh-input"
          style={{ width: 'auto', minHeight: 40 }}
          value={filters.channel}
          onChange={(e) => setFilters((f) => ({ ...f, channel: e.target.value }))}
          aria-label="按渠道筛选"
        >
          <option value="">全部渠道</option>
          {CHANNELS.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>

        <select
          className="jh-input"
          style={{ width: 'auto', minHeight: 40 }}
          value={String(filters.interest)}
          onChange={(e) =>
            setFilters((f) => ({
              ...f,
              interest: e.target.value === '' ? '' : Number(e.target.value),
            }))
          }
          aria-label="按心仪度筛选"
        >
          <option value="">全部心仪度</option>
          {[1, 2, 3, 4, 5].map((n) => (
            <option key={n} value={n}>
              {'★'.repeat(n)}
            </option>
          ))}
        </select>

        {isList && (
          <select
            className="jh-input"
            style={{ width: 'auto', minHeight: 40 }}
            value={filters.statusGroup}
            onChange={(e) => {
              setFilters((f) => ({ ...f, statusGroup: e.target.value }))
              setPage(1)
            }}
            aria-label="按状态组筛选"
          >
            <option value="">全部状态</option>
            {STAGE_GROUP_FILTERS.map((g) => (
              <option key={g.key} value={g.key}>
                {g.label}
              </option>
            ))}
          </select>
        )}

        <Button
          variant={filters.overdue ? 'amber' : 'secondary'}
          size="sm"
          onClick={() => setFilters((f) => ({ ...f, overdue: !f.overdue }))}
        >
          {filters.overdue ? '✓ 超期未跟进' : '超期未跟进'}
        </Button>

        <Button variant="primary" onClick={() => { setEditingApp(null); setFormOpen(true) }}>
          ＋ 记岗位
        </Button>
      </div>

      {/* 内容区 */}
      {isLoading ? (
        <div className="jh-loading">
          <span className="jh-spinner" aria-hidden /> 加载中…
        </div>
      ) : isError ? (
        <ErrorRetry onRetry={() => void refetch()} />
      ) : boardApps.length === 0 && !isList ? (
        <div className="jh-card">
          <EmptyState
            icon="🗂️"
            title="还没有岗位"
            description="先记一个岗位，投递、面试、Offer 都能围绕它往下走。"
            action={
              <Button variant="primary" onClick={() => { setEditingApp(null); setFormOpen(true) }}>
                ＋ 记一个新岗位
              </Button>
            }
          />
        </div>
      ) : isList && listQuery.data && listQuery.data.items.length === 0 ? (
        <div className="jh-card">
          <EmptyState icon="🔍" title="没有匹配的岗位" description="换个筛选条件，或记一个新岗位。" />
        </div>
      ) : (
        <>
          {!isMobile && view === 'board' ? (
            /* 看板：11 列 + 拖拽 */
            <div className="jh-board" role="list" aria-label="岗位看板">
              {APP_STATUSES.map((status) => {
                const colApps = boardApps.filter((a) => a.status === status)
                return (
                  <div
                    key={status}
                    className={`jh-board__col ${dropTarget === status ? 'jh-board__col--drop' : ''}`}
                    onDragOver={(e) => {
                      e.preventDefault()
                      if (dropTarget !== status) setDropTarget(status)
                    }}
                    onDragLeave={() => setDropTarget((t) => (t === status ? null : t))}
                    onDrop={(e) => {
                      e.preventDefault()
                      const id = Number(e.dataTransfer.getData('text/plain'))
                      const app = boardApps.find((a) => a.id === id)
                      if (app && app.status !== status) void handleStatusChange(app, status)
                      setDropTarget(null)
                    }}
                  >
                    <div className="jh-board__head">
                      <span>{APP_STATUS_LABEL[status]}</span>
                      <span className="jh-board__count">{colApps.length}</span>
                    </div>
                    <div className="jh-board__body">
                      {colApps.map((app) => (
                        <AppCard
                          key={app.id}
                          app={app}
                          onOpen={(a) => setDetailId(a.id)}
                          draggable
                          onDragStart={(e, a) => {
                            e.dataTransfer.setData('text/plain', String(a.id))
                            e.dataTransfer.effectAllowed = 'move'
                          }}
                          onDragEnd={() => setDropTarget(null)}
                        />
                      ))}
                      {colApps.length === 0 && (
                        <div style={{ fontSize: 12, color: 'var(--muted)', textAlign: 'center', padding: 12 }}>
                          空
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          ) : isList ? (
            /* 列表：分页 20 条 */
            <>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {listQuery.data?.items.map((app) => (
                  <AppCard key={app.id} app={app} onOpen={(a) => setDetailId(a.id)} />
                ))}
              </div>
              {listQuery.data && listQuery.data.total > 20 ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 16, justifyContent: 'center' }}>
                  <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                    ← 上一页
                  </Button>
                  <span style={{ fontSize: 13, color: 'var(--sub)' }}>
                    {page} / {Math.ceil(listQuery.data.total / 20)}
                  </span>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={page >= Math.ceil(listQuery.data.total / 20)}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    下一页 →
                  </Button>
                </div>
              ) : null}
            </>
          ) : (
            /* 移动端：状态筛选条 + 单列卡片流 */
            <>
              <div className="jh-statusfilter" role="tablist" aria-label="状态筛选">
                <button
                  className={`jh-pill jh-statusfilter__pill ${selectedStatus === '' ? 'jh-pill--brand' : ''}`}
                  onClick={() => setSelectedStatus('')}
                >
                  全部（{boardApps.length}）
                </button>
                {APP_STATUSES.map((s) => {
                  const cnt = boardApps.filter((a) => a.status === s).length
                  return (
                    <button
                      key={s}
                      className={`jh-pill jh-statusfilter__pill ${selectedStatus === s ? 'jh-pill--brand' : ''}`}
                      onClick={() => setSelectedStatus(s)}
                    >
                      {APP_STATUS_LABEL[s]}（{cnt}）
                    </button>
                  )
                })}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {mobileApps.length === 0 ? (
                  <div className="jh-card">
                    <EmptyState icon="🗂️" title="这个状态下没有岗位" />
                  </div>
                ) : (
                  mobileApps.map((app) => (
                    <AppCard
                      key={app.id}
                      app={app}
                      onOpen={(a) => setDetailId(a.id)}
                      showStatusSelect
                      onStatusChange={(a, s) => void handleStatusChange(a, s)}
                    />
                  ))
                )}
              </div>
            </>
          )}
        </>
      )}

      <AppFormModal
        open={formOpen}
        onClose={() => { setFormOpen(false); setEditingApp(null) }}
        onSubmit={handleCreate}
        initial={editingApp}
        resumes={resumesQuery.data ?? []}
        submitting={submitting}
      />

      <AppDetailDrawer
        appId={detailId}
        onClose={() => setDetailId(null)}
        onEdit={openEdit}
        onDelete={(app) => { setDetailId(null); setDeleting(app) }}
      />

      <ConfirmDialog
        open={deleting !== null}
        title="删除岗位"
        description={deleting ? `确定删除「${deleting.company}」吗？删除后不可恢复（软删除，可在后台找回）。` : ''}
        confirmText="删除"
        danger
        onConfirm={() => void handleDelete()}
        onCancel={() => setDeleting(null)}
      />
    </div>
  )
}
