import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, Card, ConfirmDialog, EmptyState, ErrorRetry } from '../../components'
import {
  recycleApi,
  invalidateDerivedQueries,
  type RecycleList,
  type RecycleType,
  RECYCLE_TYPES,
  RECYCLE_TYPE_LABEL,
} from '../../api/endpoints'
import { USE_MOCK } from '../../api/config'
import { useUiStore } from '../../stores/ui'

/** 恢复后需一并失效的业务列表 queryKey（前缀匹配，覆盖其所有子 key）。 */
const LIST_QUERY_KEY: Record<RecycleType, string> = {
  apps: 'apps',
  resumes: 'resumes',
  interviews: 'interviews',
  offers: 'offers',
}

/**
 * 回收站：列出软删的 apps/resumes/interviews/offers，按类型切 tab，
 * 每条可「恢复」（回原列表）或「彻底删除」（物理删除，不可恢复）。
 * 五态覆盖：加载中 / 加载失败(可重试) / 全空 / 当前 tab 空 / 正常列表；
 * 鉴权由 router 的 RequireAuth 在路由层统一兜底（无需页内权限分支）。
 */
export function RecyclePage() {
  const qc = useQueryClient()
  const pushToast = useUiStore((s) => s.pushToast)

  const [tab, setTab] = useState<RecycleType>('apps')
  const [restoringId, setRestoringId] = useState<number | null>(null)
  const [purging, setPurging] = useState<{ type: RecycleType; id: number; title: string } | null>(
    null,
  )

  const { data, isLoading, isError, refetch } = useQuery<RecycleList>({
    queryKey: ['recycle'],
    queryFn: recycleApi.list,
  })

  /** 刷新回收站；恢复时按类型一并失效原业务列表与派生统计，避免切回列表仍是旧数据。 */
  const refresh = (restoredType?: RecycleType): void => {
    void qc.invalidateQueries({ queryKey: ['recycle'] })
    if (restoredType) {
      void qc.invalidateQueries({ queryKey: [LIST_QUERY_KEY[restoredType]] })
      invalidateDerivedQueries(qc)
    }
  }

  const handleRestore = async (type: RecycleType, id: number): Promise<void> => {
    setRestoringId(id)
    try {
      await recycleApi.restore(type, id)
      pushToast({ message: '已恢复到原列表', kind: 'success' })
      refresh(type)
    } catch {
      // 错误已由 http 层 toast
    } finally {
      setRestoringId(null)
    }
  }

  const handlePurge = async (): Promise<void> => {
    if (!purging) return
    try {
      await recycleApi.purge(purging.type, purging.id)
      pushToast({ message: `已彻底删除「${purging.title}」`, kind: 'success' })
      setPurging(null)
      refresh()
    } catch {
      // 错误已由 http 层 toast
    }
  }

  const totalCount = data
    ? RECYCLE_TYPES.reduce((n, t) => n + data[t].length, 0)
    : 0
  const list = data?.[tab] ?? []

  return (
    <div className="jh-page">
      <header className="jh-page-head">
        <h1 className="jh-page-title">🗑️ 回收站</h1>
        <p className="jh-page-desc">
          误删的岗位 / 简历 / 面试 / Offer 可在此恢复，或彻底删除（彻底删除不可恢复，7 天后自动清理）。
        </p>
      </header>

      {USE_MOCK && (
        <Card>
          <div style={{ fontSize: 13, color: 'var(--warn, #b45309)', lineHeight: 1.6 }}>
            ⚠️ 当前为 mock 演示模式（VITE_USE_MOCK=true），下方数据是本地假数据，不代表真实记录，恢复 / 彻底删除也不会写库。
          </div>
        </Card>
      )}

      <div className="jh-toolbar" style={{ flexWrap: 'wrap', gap: 8 }}>
        {RECYCLE_TYPES.map((t) => (
          <Button
            key={t}
            variant={tab === t ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => setTab(t)}
          >
            {RECYCLE_TYPE_LABEL[t]}（{data?.[t].length ?? 0}）
          </Button>
        ))}
      </div>

      {isLoading ? (
        <div className="jh-loading">
          <span className="jh-spinner" aria-hidden /> 加载中…
        </div>
      ) : isError ? (
        <ErrorRetry onRetry={() => void refetch()} />
      ) : totalCount === 0 ? (
        <Card>
          <EmptyState
            icon="🗑️"
            title="回收站是空的"
            description="被删除的记录会先进入这里，确认无误可随时恢复；超过 7 天会被自动清理。"
          />
        </Card>
      ) : list.length === 0 ? (
        <Card>
          <EmptyState
            icon="🗑️"
            title={`${RECYCLE_TYPE_LABEL[tab]}暂无回收项`}
            description="切换上方标签查看其他类型。"
          />
        </Card>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {list.map((item) => (
            <Card key={item.id} tilt>
              <div
                style={{
                  display: 'flex',
                  gap: 12,
                  alignItems: 'center',
                  flexWrap: 'wrap',
                }}
              >
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ fontSize: 15, fontWeight: 700 }}>{item.title}</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
                    {item.deletedAt
                      ? `删除于 ${item.deletedAt.slice(0, 16).replace('T', ' ')}`
                      : ''}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <Button
                    size="sm"
                    variant="green"
                    loading={restoringId === item.id}
                    onClick={() => void handleRestore(tab, item.id)}
                  >
                    ♻️ 恢复
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={() =>
                      setPurging({ type: tab, id: item.id, title: item.title })
                    }
                  >
                    🗑️ 彻底删除
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={purging !== null}
        title="彻底删除"
        description={
          purging
            ? `确定彻底删除「${purging.title}」吗？该操作不可恢复。`
            : ''
        }
        confirmText="彻底删除"
        danger
        onConfirm={() => void handlePurge()}
        onCancel={() => setPurging(null)}
      />
    </div>
  )
}
