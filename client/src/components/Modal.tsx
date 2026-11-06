import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import type { ReactNode } from 'react'
import { useMediaQuery } from '../hooks/useMediaQuery'
import { Drawer } from './Drawer'

export interface ModalProps {
  open: boolean
  onClose: () => void
  title?: ReactNode
  footer?: ReactNode
  children?: ReactNode
}

/**
 * 弹窗：PC 居中弹窗，H5（<=820px）自动降级为底部 Drawer。
 * 响应式收敛在此组件，业务方无需关心形态差异。
 */
export function Modal({ open, onClose, title, footer, children }: ModalProps) {
  const isMobile = useMediaQuery('(max-width:820px)')

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (isMobile) {
    return (
      <Drawer open={open} onClose={onClose} title={title} footer={footer}>
        {children}
      </Drawer>
    )
  }

  if (!open) return null

  return createPortal(
    <div className="jh-overlay" onClick={onClose}>
      <div className="jh-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="jh-modal__head">
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
