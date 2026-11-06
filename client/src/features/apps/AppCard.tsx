import type { DragEvent } from 'react'
import { StarRating } from '../../components'
import { APP_STATUSES, APP_STATUS_LABEL } from '../../types'
import type { App, AppStatus } from '../../types'
import { fenToK } from '../../utils/money'
import { daysSinceApplied, isOverdue, statusColor, statusLabel } from './apps.helpers'

export interface AppCardProps {
  app: App
  onOpen: (app: App) => void
  onStatusChange?: (app: App, toStatus: AppStatus) => void
  draggable?: boolean
  onDragStart?: (e: DragEvent<HTMLDivElement>, app: App) => void
  onDragEnd?: () => void
  /** 移动端卡片流：展示状态下拉 */
  showStatusSelect?: boolean
}

/** 岗位卡片：左缘状态色条 + 公司/岗位 + 心仪度 + 已投天数 + 下一步动作（超期角标）。 */
export function AppCard({
  app,
  onOpen,
  onStatusChange,
  draggable = false,
  onDragStart,
  onDragEnd,
  showStatusSelect = false,
}: AppCardProps) {
  const days = daysSinceApplied(app)
  const overdue = isOverdue(app)

  return (
    <div
      className="jh-appcard"
      draggable={draggable}
      onDragStart={(e) => onDragStart?.(e, app)}
      onDragEnd={onDragEnd}
      onClick={() => onOpen(app)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onOpen(app)
        }
      }}
      aria-label={`${app.company} ${app.role}，当前${statusLabel(app.status)}`}
    >
      <span className="jh-appcard__stripe" style={{ background: statusColor(app.status) }} aria-hidden />

      <div className="jh-appcard__top">
        <span className="jh-appcard__title">{app.company}</span>
        <span style={{ flexShrink: 0 }}>
          <StarRating value={app.interest} size="sm" readOnly label="心仪度" />
        </span>
      </div>

      <div className="jh-appcard__meta">
        <span>{app.role}</span>
        {app.city ? <span>📍 {app.city}</span> : null}
        {app.salary_min > 0 || app.salary_max > 0 ? (
          <span>
            💰 {fenToK(app.salary_min)}–{fenToK(app.salary_max)}
          </span>
        ) : null}
        {days !== null ? <span>已投 {days} 天</span> : null}
      </div>

      {app.next_action ? (
        <div className="jh-appcard__foot">
          <span className="jh-appcard__next">下一步：{app.next_action}</span>
          {overdue ? <span className="jh-appcard__badge">该跟进了</span> : null}
        </div>
      ) : null}

      {showStatusSelect && onStatusChange ? (
        <div className="jh-appcard__foot" onClick={(e) => e.stopPropagation()}>
          <span className="jh-appcard__next">当前：{statusLabel(app.status)}</span>
          <select
            className="jh-input"
            style={{ width: 100, minHeight: 36, padding: '4px 8px', fontSize: 13 }}
            value={app.status}
            onChange={(e) => onStatusChange(app, e.target.value as AppStatus)}
            aria-label={`修改 ${app.company} 状态`}
          >
            {APP_STATUSES.map((s) => (
              <option key={s} value={s}>
                {APP_STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </div>
      ) : null}
    </div>
  )
}
