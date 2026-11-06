import type { ReactNode } from 'react'
import { EmptyState } from '../components'

export interface FeatureShellProps {
  icon: string
  title: string
  description: string
  /** 覆盖默认空态内容（如模块已有局部实现）。 */
  children?: ReactNode
}

/** 模块空壳：页面头 + 空态（下一期开放前的静态占位，不再给「点我就能用」的假 CTA）。 */
export function FeatureShell({ icon, title, description, children }: FeatureShellProps) {
  return (
    <div className="jh-page">
      <header className="jh-page-head">
        <h1 className="jh-page-title">
          {icon} {title}
        </h1>
        <p className="jh-page-desc">{description}</p>
      </header>
      {children ?? (
        <div className="jh-card">
          <EmptyState
            icon={icon}
            title={`${title} · 下一期开放`}
            description={description}
            action={
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                该模块将在下一期开放，当前仅作占位，不提供操作入口。
              </span>
            }
          />
        </div>
      )}
    </div>
  )
}
