import type { ButtonHTMLAttributes, ReactNode } from 'react'

export type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'ghost'
  | 'danger'
  | 'green'
  | 'amber'
  | 'blue'
export type ButtonSize = 'sm' | 'md' | 'lg'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
  icon?: ReactNode
}

/** 手绘按钮：hover 上浮反向倾斜，active 下压，带回弹过渡。 */
export function Button({
  variant = 'secondary',
  size = 'md',
  loading = false,
  icon,
  children,
  className = '',
  disabled,
  ...rest
}: ButtonProps) {
  return (
    <button
      className={['jh-btn', `jh-btn--${variant}`, `jh-btn--${size}`, className]
        .filter(Boolean)
        .join(' ')}
      disabled={disabled || loading}
      {...rest}
    >
      {loading ? (
        <span className="jh-spinner" style={{ width: 14, height: 14, borderWidth: 2 }} aria-hidden />
      ) : (
        icon
      )}
      {children}
    </button>
  )
}
