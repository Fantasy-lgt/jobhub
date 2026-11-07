import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, Card, EmptyState, ErrorRetry, ProgressBar } from '../../components'
import { roadmapApi } from '../../api/endpoints'
import type { RoadmapData } from '../../types'
import { useUiStore } from '../../stores/ui'

/**
 * 冲刺路线图：GET /roadmap 渲染 5 阶段 + 任务清单 + 里程碑 + 连续 streak。
 * 勾选任务 → PUT /roadmap/tasks/:id {done}（后端在 done=true 时写 checkins=打卡），
 * 之后整页重新拉取 /roadmap（含最新 streak），并失效概览的冲刺进度。
 *
 * 五态覆盖：加载中 / 加载失败(可重试) / 阶段为空 / 正常（任务含空阶段态）/ 权限由路由层兜底。
 */
export function RoadmapPage() {
  const qc = useQueryClient()
  const pushToast = useUiStore((s) => s.pushToast)

  const [togglingId, setTogglingId] = useState<number | null>(null)

  const { data, isLoading, isError, refetch } = useQuery<RoadmapData>({
    queryKey: ['roadmap'],
    queryFn: roadmapApi.get,
  })

  const toggleTask = async (taskId: number, done: boolean): Promise<void> => {
    setTogglingId(taskId)
    try {
      await roadmapApi.updateTask(taskId, { done })
      // streak 可能因打卡变化，整页重新拉取（get 已含 streak）；
      // 概览的「冲刺进度」依赖同一份数据，一并失效。
      await qc.invalidateQueries({ queryKey: ['roadmap'] })
      void qc.invalidateQueries({ queryKey: ['overview'] })
    } catch {
      // 错误已由 http 层 toast
    } finally {
      setTogglingId(null)
    }
  }

  const milestoneTotal = data?.milestones.length ?? 0
  const milestoneDone = data?.milestones.filter((m) => m.achieved).length ?? 0

  return (
    <div className="jh-page">
      <header className="jh-page-head">
        <h1 className="jh-page-title">🧱 冲刺路线图</h1>
        <p className="jh-page-desc">5 阶段任务清单 + 每日打卡 + 连续 streak</p>
      </header>

      {isLoading ? (
        <div className="jh-loading">
          <span className="jh-spinner" aria-hidden /> 加载中…
        </div>
      ) : isError ? (
        <ErrorRetry onRetry={() => void refetch()} />
      ) : !data || data.stages.length === 0 ? (
        <Card>
          <EmptyState
            icon="🧱"
            title="暂无阶段数据"
            description="路线图阶段尚未生成，联系管理员或稍后再试。"
          />
        </Card>
      ) : (
        <>
          <Card>
            <div
              style={{
                display: 'flex',
                gap: 16,
                flexWrap: 'wrap',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div>
                <div style={{ fontSize: 13, color: 'var(--muted)' }}>已连续打卡</div>
                <div style={{ fontSize: 28, fontWeight: 800 }}>
                  {data.streak.current} 天 🔥
                </div>
                <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                  历史最长 {data.streak.best} 天
                </div>
              </div>
              <div style={{ flex: 1, minWidth: 240 }}>
                <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 6 }}>
                  里程碑 {milestoneDone}/{milestoneTotal}
                </div>
                <ProgressBar value={milestoneDone} max={milestoneTotal} color="green" />
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 10 }}>
                  {data.milestones.map((m) => (
                    <span
                      key={m.label}
                      style={{
                        fontSize: 12,
                        color: m.achieved ? 'var(--green)' : 'var(--muted)',
                      }}
                    >
                      {m.achieved ? '✅' : '⬜'} {m.label}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </Card>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 4 }}>
            {data.stages.map((stage) => {
              const doneCount = stage.tasks.filter((t) => t.done).length
              return (
                <Card key={stage.id} tilt>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                    <h2 style={{ fontSize: 17, margin: 0 }}>{stage.title}</h2>
                    <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                      {doneCount}/{stage.tasks.length} 完成
                    </span>
                  </div>
                  {stage.description ? (
                    <div style={{ fontSize: 13, color: 'var(--sub)', margin: '6px 0 10px' }}>
                      {stage.description}
                    </div>
                  ) : null}

                  {stage.tasks.length === 0 ? (
                    <div style={{ fontSize: 13, color: 'var(--muted)' }}>该阶段暂无任务</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {stage.tasks.map((task) => (
                        <label
                          key={task.id}
                          style={{
                            display: 'flex',
                            gap: 10,
                            alignItems: 'flex-start',
                            cursor: 'pointer',
                            padding: '6px 0',
                            borderTop: '1px dashed var(--muted)',
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={task.done}
                            disabled={togglingId === task.id}
                            onChange={() => void toggleTask(task.id, !task.done)}
                            aria-label={task.title}
                          />
                          <span
                            style={{
                              fontSize: 14,
                              textDecoration: task.done ? 'line-through' : 'none',
                              color: task.done ? 'var(--muted)' : 'var(--text)',
                            }}
                          >
                            {task.title}
                          </span>
                          {togglingId === task.id ? (
                            <span
                              className="jh-spinner"
                              style={{ width: 12, height: 12, borderWidth: 2 }}
                              aria-hidden
                            />
                          ) : null}
                        </label>
                      ))}
                    </div>
                  )}
                </Card>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
