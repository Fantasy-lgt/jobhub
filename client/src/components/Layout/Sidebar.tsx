import { Link, NavLink } from 'react-router-dom'
import { useUiStore } from '../../stores/ui'

interface NavItem {
  to: string
  icon: string
  label: string
  /** 本期未开放的模块：置灰 + 「未开放」标记，避免点进去以为功能坏掉。 */
  soon?: boolean
}

const NAV: NavItem[] = [
  { to: '/', icon: '🏠', label: '概览' },
  { to: '/profile', icon: '🧭', label: '定位' },
  { to: '/apps', icon: '🗂️', label: '岗位' },
  { to: '/interviews', icon: '🎤', label: '复盘' },
  { to: '/qbank', icon: '📚', label: '题库' },
  { to: '/offers', icon: '🎉', label: 'Offer' },
  { to: '/analytics', icon: '📈', label: '分析' },
  { to: '/roadmap', icon: '🧱', label: '路线' },
  { to: '/recycle', icon: '🗑️', label: '回收站' },
]

/** PC 侧边栏（236px）：logo + 8 项导航 + 底部设置/主题切换。 */
export function Sidebar() {
  const theme = useUiStore((s) => s.theme)
  const toggleTheme = useUiStore((s) => s.toggleTheme)

  return (
    <aside className="jh-sidebar">
      <Link to="/" className="jh-sidebar__logo">
        <span className="emoji" aria-hidden>
          💼
        </span>
        JobHub
      </Link>

      <nav className="jh-sidebar__nav" aria-label="主导航">
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) =>
              ['jh-sidebar__link', isActive ? 'jh-sidebar__link--active' : '']
                .filter(Boolean)
                .join(' ')
            }
            style={item.soon ? { opacity: 0.6 } : undefined}
            aria-label={item.soon ? `${item.label}（下一期开放）` : item.label}
          >
            <span className="emoji" aria-hidden>
              {item.icon}
            </span>
            {item.label}
            {item.soon ? (
              <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--muted)' }}>
                未开放
              </span>
            ) : null}
          </NavLink>
        ))}
      </nav>

      <div className="jh-sidebar__foot">
        <Link to="/settings" className="jh-sidebar__foot-link">
          <span aria-hidden>⚙️</span> 设置
        </Link>
        <button
          className={[
            'jh-theme-toggle',
            theme === 'dark' ? 'jh-theme-toggle--dark' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          onClick={toggleTheme}
          aria-label="切换浅色/深色主题"
        >
          <span>{theme === 'dark' ? '🌙 深色' : '☀️ 浅色'}</span>
          <span className="jh-theme-toggle__track">
            <span className="jh-theme-toggle__knob" />
          </span>
        </button>
      </div>
    </aside>
  )
}
