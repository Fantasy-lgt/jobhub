import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, ConfirmDialog, EmptyState, Modal } from '../../components'
import { profileApi } from '../../api/endpoints'
import { useUiStore } from '../../stores/ui'
import type { Resume } from '../../types'

/** 命中率（0–1）→ 百分比展示，投递数为 0 时显示「—」。 */
function hitRateText(r: Resume): string {
  if (r.hit_rate === null || r.hit_rate === undefined) return '—'
  return `${Math.round(r.hit_rate * 100)}%`
}

/** 简历版本管理：增删改 + 设主用 + 命中率展示。 */
export function ResumeManager() {
  const qc = useQueryClient()
  const pushToast = useUiStore((s) => s.pushToast)

  const { data: resumes = [], isLoading, isError, refetch } = useQuery({
    queryKey: ['resumes'],
    queryFn: profileApi.listResumes,
  })

  const [editing, setEditing] = useState<Resume | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [deleting, setDeleting] = useState<Resume | null>(null)
  const [name, setName] = useState('')
  const [targetRole, setTargetRole] = useState('')
  const [saving, setSaving] = useState(false)

  const refresh = async (): Promise<void> => {
    await qc.invalidateQueries({ queryKey: ['resumes'] })
  }

  const openCreate = (): void => {
    setEditing(null)
    setName('')
    setTargetRole('')
    setFormOpen(true)
  }

  const openEdit = (r: Resume): void => {
    setEditing(r)
    setName(r.name)
    setTargetRole(r.target_role)
    setFormOpen(true)
  }

  const submit = async (): Promise<void> => {
    if (!name.trim()) return
    setSaving(true)
    try {
      if (editing) {
        await profileApi.updateResume(editing.id, { name: name.trim(), target_role: targetRole.trim() })
        pushToast({ message: '已更新简历版本', kind: 'success' })
      } else {
        await profileApi.createResume({ name: name.trim(), target_role: targetRole.trim() })
        pushToast({ message: '已创建简历版本', kind: 'success' })
      }
      setFormOpen(false)
      await refresh()
    } catch {
      // 已 toast
    } finally {
      setSaving(false)
    }
  }

  const setPrimary = async (r: Resume): Promise<void> => {
    try {
      await profileApi.setPrimaryResume(r.id)
      pushToast({ message: `已把「${r.name}」设为主用`, kind: 'success' })
      await refresh()
    } catch {
      // 已 toast
    }
  }

  const doDelete = async (): Promise<void> => {
    if (!deleting) return
    try {
      await profileApi.deleteResume(deleting.id)
      pushToast({ message: `已删除「${deleting.name}」`, kind: 'success' })
      setDeleting(null)
      await refresh()
    } catch {
      // 已 toast
    }
  }

  return (
    <div>
      <div className="jh-sec-title">
        📄 简历版本 <span className="sub">命中率 = 产生面试的投递 ÷ 该版本投递数</span>
        <span style={{ marginLeft: 'auto' }}>
          <Button size="sm" variant="primary" onClick={openCreate}>
            ＋ 新建版本
          </Button>
        </span>
      </div>

      {isLoading ? (
        <div className="jh-loading">
          <span className="jh-spinner" aria-hidden /> 加载中…
        </div>
      ) : isError ? (
        <div className="jh-error" style={{ marginTop: 10 }}>
          <div className="jh-error__msg">简历版本加载失败</div>
          <div style={{ marginTop: 10 }}>
            <Button size="sm" variant="secondary" onClick={() => void refetch()}>
              ↻ 重试
            </Button>
          </div>
        </div>
      ) : resumes.length === 0 ? (
        <div style={{ marginTop: 10 }}>
          <EmptyState
            icon="📄"
            title="还没有简历版本"
            description="为不同岗位方向建不同简历版本，投递时关联，命中率会告诉你哪份最有效。"
            action={<Button variant="primary" onClick={openCreate}>＋ 新建版本</Button>}
          />
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
          {resumes.map((r) => (
            <div key={r.id} className={`jh-resume ${r.is_primary ? 'jh-resume--primary' : ''}`}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>
                  {r.name}
                  {r.is_primary ? <span style={{ color: 'var(--brand)', marginLeft: 6 }}>⭐ 主用</span> : null}
                </div>
                <div style={{ fontSize: 12, color: 'var(--sub)' }}>
                  {r.target_role || '未指定岗位'}
                </div>
                <div className="jh-resume__hit">
                  命中率 {hitRateText(r)} · 投递 {r.applied_count ?? 0} · 面试 {r.interview_count ?? 0}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6, flexShrink: 0, flexWrap: 'wrap' }}>
                {!r.is_primary && (
                  <Button size="sm" variant="blue" onClick={() => void setPrimary(r)}>
                    设主用
                  </Button>
                )}
                <Button size="sm" variant="secondary" onClick={() => openEdit(r)}>
                  编辑
                </Button>
                <Button size="sm" variant="danger" onClick={() => setDeleting(r)}>
                  删除
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? '编辑简历版本' : '新建简历版本'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setFormOpen(false)}>
              取消
            </Button>
            <Button variant="primary" onClick={() => void submit()} loading={saving} disabled={!name.trim()}>
              保存
            </Button>
          </>
        }
      >
        <div className="jh-form">
          <div className="jh-field">
            <label className="jh-label">版本名 *</label>
            <input
              className="jh-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="后端方向-通用版"
            />
          </div>
          <div className="jh-field">
            <label className="jh-label">适用岗位</label>
            <input
              className="jh-input"
              value={targetRole}
              onChange={(e) => setTargetRole(e.target.value)}
              placeholder="后端开发 / 平台工程"
            />
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={deleting !== null}
        title="删除简历版本"
        description={deleting ? `确定删除「${deleting.name}」吗？已关联的岗位会失去该版本。` : ''}
        confirmText="删除"
        danger
        onConfirm={() => void doDelete()}
        onCancel={() => setDeleting(null)}
      />
    </div>
  )
}
