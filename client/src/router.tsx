import { Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { AppLayout } from './components/Layout/AppLayout'
import { useAuthStore } from './stores/auth'
import { LoginPage } from './features/login'
import { OverviewPage } from './features/overview'
import { ProfilePage } from './features/profile'
import { AppsPage } from './features/apps'
import { InterviewsPage } from './features/interviews'
import { QbankPage } from './features/qbank'
import { OffersPage } from './features/offers'
import { AnalyticsPage } from './features/analytics'
import { RoadmapPage } from './features/roadmap'
import { SettingsPage } from './features/settings'
import { MorePage } from './features/more'
import { RecyclePage } from './features/recycle'

function FullPageLoading() {
  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
      <div className="jh-loading">
        <span className="jh-spinner" aria-hidden /> 加载中…
      </div>
    </div>
  )
}

/** 受保护路由：未登录跳 /login，登录态由 auth store 维护。 */
function RequireAuth() {
  const authed = useAuthStore((s) => s.authed)
  const loading = useAuthStore((s) => s.loading)
  if (loading) return <FullPageLoading />
  if (!authed) return <Navigate to="/login" replace />
  return <Outlet />
}

/** 登录页（/login）+ 8 模块路由 + 移动端「更多」二级页。 */
export function AppRouter() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<RequireAuth />}>
        <Route element={<AppLayout />}>
          <Route path="/" element={<OverviewPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/apps" element={<AppsPage />} />
          <Route path="/interviews" element={<InterviewsPage />} />
          <Route path="/qbank" element={<QbankPage />} />
          <Route path="/offers" element={<OffersPage />} />
          <Route path="/analytics" element={<AnalyticsPage />} />
          <Route path="/roadmap" element={<RoadmapPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/recycle" element={<RecyclePage />} />
          <Route path="/more" element={<MorePage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Route>
    </Routes>
  )
}
