import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import type { ReactNode } from 'react'

export interface DrawerProps {
  open: boolean
  onClose: () => void
  title?: ReactNode
  footer?: ReactNode
  children?: ReactNode
}

/** 底部抽屉（H5 弹窗形态）。 */
export function Drawer({ open, onClose, title, footer, children }: DrawerProps) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return createPortal(
    <div className="jh-overlay" onClick={onClose}>
      <div
        className="jh-drawer"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="jh-drawer__grab" aria-hidden />
        <div className="jh-modal__head" style={{ borderTop: 'none' }}>
          <div className="jh-modal__title">{title}</div>
          <button className="jh-modal__close" onClick={onClose} aria-label="关闭">
            ×
          </button>
        </div>
        <div className="jh-modal__body">{children}</div>
        {footer ? <div className="jh-modal__foot">{footer}</div> : null}
      </div>
    </div>,
    document.body,
  )
}
