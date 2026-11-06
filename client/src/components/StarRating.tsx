export type StarSize = 'sm' | 'md' | 'lg'

export interface StarRatingProps {
  value: number
  max?: number
  onChange?: (value: number) => void
  readOnly?: boolean
  size?: StarSize
  label?: string
}

/** 星级评分（1-5，兴趣/关注度用）。 */
export function StarRating({
  value,
  max = 5,
  onChange,
  readOnly = false,
  size = 'md',
  label,
}: StarRatingProps) {
  const stars = Array.from({ length: max }, (_, i) => i + 1)
  return (
    <div
      className={['jh-stars', `jh-stars--${size}`].join(' ')}
      role="radiogroup"
      aria-label={label ?? '评分'}
    >
      {stars.map((n) => {
        const on = n <= value
        const cls = ['jh-stars__star', on ? 'jh-stars__star--on' : ''].filter(Boolean).join(' ')
        const star = on ? '★' : '☆'
        if (readOnly || !onChange) {
          return (
            <span key={n} className={cls} aria-hidden>
              {star}
            </span>
          )
        }
        return (
          <button
            key={n}
            type="button"
            className={cls}
            onClick={() => onChange(n)}
            aria-label={`${n} 星`}
          >
            {star}
          </button>
        )
      })}
    </div>
  )
}
