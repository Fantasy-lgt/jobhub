import { Link, Outlet } from 'react-router-dom'
import { useMediaQuery } from '../../hooks/useMediaQuery'
import { Sidebar } from './Sidebar'
import { BottomTab } from './BottomTab'

/** 应用外壳：PC 用 Sidebar，H5 用 BottomTab；主区 max-width 1080 居中。 */
export function AppLayout() {
  const isMobile = useMediaQuery('(max-width:820px)')

  return (
    <div className="jh-shell">
      {isMobile ? <BottomTab /> : <Sidebar />}
      <main className="jh-main">
        <div className="jh-main-inner">
          <Outlet />
        </div>
        <footer className="jh-footer">
          数据保存在服务器（MariaDB），支持跨设备访问；只有你主动点 AI 分析时，题目与回忆内容会发给模型服务商（DeepSeek）。
          需要备份请到 <Link to="/settings" style={{ textDecoration: 'underline' }}>设置页「导出全部数据」</Link> 下载离线 JSON。
        </footer>
      </main>
    </div>
  )
}
