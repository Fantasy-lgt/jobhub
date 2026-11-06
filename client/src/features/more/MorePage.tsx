import { Link } from 'react-router-dom'
import { useUiStore } from '../../stores/ui'

interface MoreItem {
  to: string
  icon: string
  label: string
  /** 本期未开放的模块：置灰 + 「未开放」标记。 */
  soon?: boolean
}

const ITEMS: MoreItem[] = [
  { to: '/profile', icon: '🧭', label: '求职定位' },
  { to: '/offers', icon: '🎉', label: 'Offer 决策' },
  { to: '/analytics', icon: '📈', label: '数据复盘' },
  { to: '/roadmap', icon: '🧱', label: '冲刺路线', soon: true },
  { to: '/settings', icon: '⚙️', label: '设置' },
]

/** H5「更多」二级页：侧边栏隐藏后的模块入口 + 主题切换。 */
export function MorePage() {
  const theme = useUiStore((s) => s.theme)
  const toggleTheme = useUiStore((s) => s.toggleTheme)

  return (
    <div className="jh-page">
      <header className="jh-page-head">
        <h1 className="jh-page-title">⋯ 更多</h1>
        <p className="jh-page-desc">其余模块与偏好设置</p>
      </header>

      <div className="jh-more-grid">
        {ITEMS.map((it) => (
          <Link
            key={it.to}
            to={it.to}
            className="jh-more-item"
            style={it.soon ? { opacity: 0.6 } : undefined}
            aria-label={it.soon ? `${it.label}（下一期开放）` : it.label}
          >
            <span className="emoji" aria-hidden>
              {it.icon}
            </span>
            {it.label}
            {it.soon ? (
              <span style={{ fontSize: 11, color: 'var(--muted)' }}>未开放</span>
            ) : null}
          </Link>
        ))}
      </div>

      <div className="jh-block">
        <button
          className={[
            'jh-theme-toggle',
            theme === 'dark' ? 'jh-theme-toggle--dark' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          onClick={toggleTheme}
          style={{ width: '100%' }}
          aria-label="切换浅色/深色主题"
        >
          <span>{theme === 'dark' ? '🌙 深色模式' : '☀️ 浅色模式'}</span>
          <span className="jh-theme-toggle__track">
            <span className="jh-theme-toggle__knob" />
          </span>
        </button>
      </div>
    </div>
  )
}
