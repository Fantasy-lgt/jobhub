import type { HTMLAttributes, ReactNode } from 'react'

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** 是否轻微倾斜（贴纸感）。true 用 -0.6°，'alt' 用 -1°（交替使用）。 */
  tilt?: boolean | 'alt'
  children?: ReactNode
}

/** 手绘卡片：粗墨描边 + 不规则圆角 + 贴纸硬阴影。 */
export function Card({ tilt = false, className = '', children, ...rest }: CardProps) {
  const tiltClass = tilt === 'alt' ? 'jh-card--tilt-2' : tilt ? 'jh-card--tilt' : ''
  return (
    <div className={['jh-card', tiltClass, className].filter(Boolean).join(' ')} {...rest}>
      {children}
    </div>
  )
}
