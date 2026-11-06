export type ProgressColor = 'brand' | 'green' | 'amber' | 'pink' | 'blue'

export interface ProgressBarProps {
  value: number
  max?: number
  color?: ProgressColor
  label?: string
}

/** 进度条：2px 外框 + 45° 斜纹内条。 */
export function ProgressBar({ value, max = 100, color = 'brand', label }: ProgressBarProps) {
  const pct = Math.max(0, Math.min(100, (value / Math.max(max, 1)) * 100))
  const fillClass = color === 'brand' ? '' : `jh-progress__fill--${color}`
  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <div className="jh-progress">
        <div
          className={['jh-progress__fill', fillClass].filter(Boolean).join(' ')}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}
