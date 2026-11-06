import { NavLink } from 'react-router-dom'

interface TabItem {
  to: string
  icon: string
  label: string
}

const TABS: TabItem[] = [
  { to: '/', icon: '🏠', label: '概览' },
  { to: '/apps', icon: '🗂️', label: '岗位' },
  { to: '/interviews', icon: '🎤', label: '复盘' },
  { to: '/qbank', icon: '📚', label: '题库' },
  { to: '/more', icon: '⋯', label: '更多' },
]

/** H5 底部 Tab（5 项，每项 ≥44px，选中项放大倾斜）。 */
export function BottomTab() {
  return (
    <nav className="jh-tabbar" aria-label="底部导航">
      {TABS.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.to === '/'}
          className={({ isActive }) =>
            ['jh-tabbar__item', isActive ? 'jh-tabbar__item--active' : '']
              .filter(Boolean)
              .join(' ')
          }
        >
          <span className="emoji" aria-hidden>
            {item.icon}
          </span>
          {item.label}
        </NavLink>
      ))}
    </nav>
  )
}
