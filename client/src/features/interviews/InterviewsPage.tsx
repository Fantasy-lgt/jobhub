import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, ConfirmDialog, EmptyState, ErrorRetry, Pill } from '../../components'
import { interviewsApi } from '../../api/endpoints'
import { useUiStore } from '../../stores/ui'
import type { Interview } from '../../types'
import { formatDate } from '../../utils/date'
import { InterviewFormModal } from './InterviewFormModal'
import { InterviewDetailDrawer } from './InterviewDetailDrawer'

function resultColor(r: string): 'green' | 'amber' | 'pink' | 'neutral' {
  if (r === '通过') return 'green'
  if (r === '未通过') return 'pink'
  if (r === '等通知') return 'amber'
  return 'neutral'
}

/** 面试复盘：列表（分页 20）+ 新建/编辑 + 详情（题目/机检/AI）+ 删除。 */
export function InterviewsPage() {
  const qc = useQueryClient()
  const pushToast = useUiStore((s) => s.pushToast)

  const [page, setPage] = useState(1)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Interview | null>(null)
  const [detailId, setDetailId] = useState<number | null>(null)
  const [deleting, setDeleting] = useState<Interview | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['interviews', page],
    queryFn: () => interviewsApi.list(page),
  })

  const refresh = async (): Promise<void> => {
    await qc.invalidateQueries({ queryKey: ['interviews'] })
  }

  const handleCreate = async (payload: Partial<Interview>): Promise<void> => {
    setSubmitting(true)
    try {
      if (editing) {
        await interviewsApi.update(editing.id, payload)
        pushToast({ message: '已保存', kind: 'success' })
      } else {
        await interviewsApi.create(payload)
        pushToast({ message: '已创建面试记录', kind: 'success' })
      }
      setFormOpen(false)
      setEditing(null)
      await refresh()
    } catch {
      // 已 toast
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (): Promise<void> => {
    if (!deleting) return
    try {
      await interviewsApi.remove(deleting.id)
      pushToast({ message: `已删除「${deleting.company}」的面试记录`, kind: 'success' })
      setDeleting(null)
      setDetailId(null)
      await refresh()
    } catch {
      // 已 toast
    }
  }

  const items = data?.items ?? []
  const total = data?.total ?? 0

  return (
    <div className="jh-page">
      <header className="jh-page-head" style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 className="jh-page-title">🎤 面试复盘</h1>
          <p className="jh-page-desc">逐题录入 · 机检 · AI 逐题分析 · 四维自评</p>
        </div>
        <Button variant="primary" onClick={() => { setEditing(null); setFormOpen(true) }}>
          ＋ 记一场面试
        </Button>
      </header>

      {isLoading ? (
        <div className="jh-loading">
          <span className="jh-spinner" aria-hidden /> 加载中…
        </div>
      ) : isError ? (
        <ErrorRetry onRetry={() => void refetch()} />
      ) : items.length === 0 ? (
        <div className="jh-card">
          <EmptyState
            icon="🎤"
            title="还没有面试记录"
            description="记一场面试，录题后机检和 AI 分析会帮你找到失分点。"
            action={
              <Button variant="primary" onClick={() => { setEditing(null); setFormOpen(true) }}>
                ＋ 记一场面试
              </Button>
            }
          />
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {items.map((iv) => (
              <div key={iv.id} className="jh-interview-card" onClick={() => setDetailId(iv.id)} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') setDetailId(iv.id) }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 700, fontSize: 14 }}>
                    {iv.company} · {iv.role}
                  </span>
                  <Pill color="brand">{iv.round}</Pill>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 6, fontSize: 12, color: 'var(--sub)' }}>
                  {iv.scheduled_at ? <span>📅 {formatDate(iv.scheduled_at)}</span> : null}
                  {iv.format ? <span>· {iv.format}</span> : null}
                  {iv.interviewer ? <span>· 面试官 {iv.interviewer}</span> : null}
                  <Pill color={resultColor(iv.result)}>{iv.result}</Pill>
                </div>
              </div>
            ))}
          </div>

          {total > 20 ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 16, justifyContent: 'center' }}>
              <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                ← 上一页
              </Button>
              <span style={{ fontSize: 13, color: 'var(--sub)' }}>
                {page} / {Math.ceil(total / 20)}
              </span>
              <Button size="sm" variant="secondary" disabled={page >= Math.ceil(total / 20)} onClick={() => setPage((p) => p + 1)}>
                下一页 →
              </Button>
            </div>
          ) : null}
        </>
      )}

      <InterviewFormModal
        open={formOpen}
        onClose={() => { setFormOpen(false); setEditing(null) }}
        onSubmit={handleCreate}
        initial={editing}
        submitting={submitting}
      />

      <InterviewDetailDrawer
        interviewId={detailId}
        onClose={() => setDetailId(null)}
        onEdit={(iv) => { setDetailId(null); setEditing(iv); setFormOpen(true) }}
        onDelete={(iv) => { setDetailId(null); setDeleting(iv) }}
      />

      <ConfirmDialog
        open={deleting !== null}
        title="删除面试记录"
        description={deleting ? `确定删除「${deleting.company}」的这场面试吗？其中的题目和 AI 分析也会随之不可见。` : ''}
        confirmText="删除"
        danger
        onConfirm={() => void handleDelete()}
        onCancel={() => setDeleting(null)}
      />
    </div>
  )
}
