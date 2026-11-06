import type { ReactNode } from 'react'

export interface EmptyStateProps {
  icon?: string
  title: string
  description?: string
  action?: ReactNode
}

/** 空状态（含引导按钮）。 */
export function EmptyState({ icon = '🌤️', title, description, action }: EmptyStateProps) {
  return (
    <div className="jh-empty">
      <div className="jh-empty__icon" aria-hidden>
        {icon}
      </div>
      <div className="jh-empty__title">{title}</div>
      {description ? <div className="jh-empty__desc">{description}</div> : null}
      {action ? <div className="jh-empty__action">{action}</div> : null}
    </div>
  )
}
