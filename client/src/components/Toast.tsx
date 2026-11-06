import { useUiStore } from '../stores/ui'
import type { ToastKind } from '../stores/ui'

const ICON: Record<ToastKind, string> = {
  info: '💡',
  success: '✓',
  error: '⚠️',
}

/** 全局轻提示（写操作即时反馈 / 错误可读原因）。 */
export function Toast() {
  const toasts = useUiStore((s) => s.toasts)
  const dismiss = useUiStore((s) => s.dismissToast)

  if (toasts.length === 0) return null

  return (
    <div className="jh-toast-wrap" aria-live="polite">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={['jh-toast', `jh-toast--${t.kind}`].filter(Boolean).join(' ')}
          onClick={() => dismiss(t.id)}
          role="status"
        >
          <span aria-hidden>{ICON[t.kind]}</span>
          <span>{t.message}</span>
        </div>
      ))}
    </div>
  )
}
