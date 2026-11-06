import { Button } from './Button'

export interface ErrorRetryProps {
  message?: string
  onRetry?: () => void
}

/** 错误态（可重试）。失败不用红色，用 pink。 */
export function ErrorRetry({ message = '加载失败了', onRetry }: ErrorRetryProps) {
  return (
    <div className="jh-error">
      <div className="jh-error__icon" aria-hidden>
        😵‍💫
      </div>
      <div className="jh-error__msg">{message}</div>
      {onRetry ? (
        <div style={{ marginTop: 14 }}>
          <Button variant="secondary" size="sm" onClick={onRetry}>
            ↻ 重试
          </Button>
        </div>
      ) : null}
    </div>
  )
}
