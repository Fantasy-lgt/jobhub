import { useQuery } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { Button, EmptyState, ErrorRetry, Modal, Pill } from '../../components'
import { appsApi } from '../../api/endpoints'
import type { App, AppEvent } from '../../types'
import { formatDate } from '../../utils/date'
import { fenToK } from '../../utils/money'
import { statusColor, statusLabel } from './apps.helpers'

interface AppDetailDrawerProps {
  appId: number | null
  onClose: () => void
  onEdit: (app: App) => void
  onDelete: (app: App) => void
}

const SOURCE_LABEL: Record<string, string> = {
  manual: '手动',
  round: '面试轮次',
  import: '导入',
}

function sourceLabel(s: string): string {
  return SOURCE_LABEL[s] ?? s
}

function eventLabel(e: AppEvent): string {
  return `${statusLabel(e.from_status)} → ${statusLabel(e.to_status)}`
}

/**
 * 展示时刻：兼容后端 dateStrings:true 下的 'YYYY-MM-DD HH:mm:ss'（空格分隔）
 * 与 ISO 带 Z 两种格式，避免 Invalid Date/NaN。
 */
function formatTs(ts: string): string {
  if (!ts) return ''
  const normalized =
    /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(ts) ? ts.replace(' ', 'T') : ts
  const d = new Date(normalized)
  return Number.isNaN(d.getTime()) ? ts : d.toLocaleString('zh-CN')
}

/** 详情抽屉：完整字段 + 流转时间轴（读自 app_events）。 */
export function AppDetailDrawer({ appId, onClose, onEdit, onDelete }: AppDetailDrawerProps) {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['app-detail', appId],
    queryFn: () => appsApi.detail(appId as number),
    enabled: appId !== null,
  })

  const open = appId !== null

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={data ? `${data.app.company} · ${data.app.role}` : '岗位详情'}
      footer={
        data ? (
          <>
            <Button variant="danger" onClick={() => onDelete(data.app)}>
              删除
            </Button>
            <Button variant="secondary" onClick={onClose}>
              关闭
            </Button>
            <Button variant="primary" onClick={() => onEdit(data.app)}>
              编辑
            </Button>
          </>
        ) : undefined
      }
    >
      {isLoading ? (
        <div className="jh-loading">
          <span className="jh-spinner" aria-hidden /> 加载中…
        </div>
      ) : isError || !data ? (
        <ErrorRetry onRetry={() => void refetch()} />
      ) : (
        <div className="jh-form">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <Pill color="neutral">{statusLabel(data.app.status)}</Pill>
            <span className="jh-appcard__stripe" style={{ background: statusColor(data.app.status), width: 40, height: 10, position: 'static', display: 'inline-block', borderRadius: 999 }} aria-hidden />
            {data.app.channel ? <Pill color="blue">{data.app.channel}</Pill> : null}
            {data.app.city ? <Pill color="brand">{data.app.city}</Pill> : null}
          </div>

          <div className="jh-form-grid">
            <DetailField label="薪资范围">
              {data.app.salary_min > 0 || data.app.salary_max > 0
                ? `${fenToK(data.app.salary_min)}–${fenToK(data.app.salary_max)}`
                : '未填'}
            </DetailField>
            <DetailField label="办公方式">{data.app.work_mode || '—'}</DetailField>
            <DetailField label="投递日期">{data.app.applied_at ? formatDate(data.app.applied_at) : '未投递'}</DetailField>
            <DetailField label="下一步">
              {data.app.next_action || '—'}
              {data.app.next_action_at ? `（${formatDate(data.app.next_action_at)}）` : ''}
            </DetailField>
            <DetailField label="联系人">
              {data.app.contact_name || '—'}
              {data.app.contact_role ? `（${data.app.contact_role}）` : ''}
            </DetailField>
            <DetailField label="联系方式">{data.app.contact_info || '—'}</DetailField>
          </div>

          {data.app.jd_url ? (
            <div className="jh-field">
              <span className="jh-label">JD 链接</span>
              <a
                href={data.app.jd_url}
                target="_blank"
                rel="noreferrer"
                style={{ fontSize: 13, color: 'var(--blue)', textDecoration: 'underline' }}
              >
                {data.app.jd_url}
              </a>
            </div>
          ) : null}

          {data.app.note ? (
            <div className="jh-field">
              <span className="jh-label">备注</span>
              <div style={{ fontSize: 14, whiteSpace: 'pre-wrap' }}>{data.app.note}</div>
            </div>
          ) : null}

          <div>
            <div className="jh-sec-title">
              🧭 流转时间轴 <span className="sub">每次状态变更都会记一笔</span>
            </div>
            {data.events.length === 0 ? (
              <EmptyState icon="🕐" title="暂无流转记录" description="改一次状态后，这里会出现 from → to 的记录。" />
            ) : (
              <div className="jh-timeline">
                {data.events.map((e) => (
                  <div key={e.id} className="jh-timeline__item">
                    <span className="jh-timeline__dot" aria-hidden />
                    <div className="jh-timeline__txt">{eventLabel(e)}</div>
                    <div className="jh-timeline__time">
                      {formatTs(e.at)} · {sourceLabel(e.source)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </Modal>
  )
}

function DetailField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="jh-field">
      <span className="jh-label">{label}</span>
      <div style={{ fontSize: 14 }}>{children}</div>
    </div>
  )
}
