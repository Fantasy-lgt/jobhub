import type { HTMLAttributes, ReactNode } from 'react'

export type PillColor = 'neutral' | 'green' | 'amber' | 'pink' | 'blue' | 'brand'

export interface PillProps extends HTMLAttributes<HTMLSpanElement> {
  color?: PillColor
  children?: ReactNode
}

/** 标签 pill：不规则圆角 + 2px 描边，语义色见设计规范。 */
export function Pill({ color = 'neutral', className = '', children, ...rest }: PillProps) {
  const colorClass = color === 'neutral' ? '' : `jh-pill--${color}`
  return (
    <span className={['jh-pill', colorClass, className].filter(Boolean).join(' ')} {...rest}>
      {children}
    </span>
  )
}
