import { useEffect } from 'react'
import { BrowserRouter, useLocation } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useUiStore } from './stores/ui'
import { useAuthStore } from './stores/auth'
import { AppRouter } from './router'
import { Toast } from './components/Toast'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 30_000,
    },
  },
})

/**
 * 跨页数据同步兜底：路由变化时把「派生/聚合类」查询统一标记 stale。
 *
 * 任何页面的写操作只要发生一次导航（例如改完岗位切回概览），派生页就会立即
 * 重新取数，绕开 refetchOnWindowFocus:false + staleTime:30s 造成的旧数据窗口；
 * 未挂载的查询只标 stale，不产生额外网络请求。
 */
function DataSyncOnNavigate() {
  const { pathname } = useLocation()
  useEffect(() => {
    void queryClient.invalidateQueries({ queryKey: ['overview'] })
    void queryClient.invalidateQueries({ queryKey: ['analytics'] })
    void queryClient.invalidateQueries({ queryKey: ['qbank-weaknesses'] })
  }, [pathname])
  return null
}

export default function App() {
  const initTheme = useUiStore((s) => s.initTheme)
  const bootstrap = useAuthStore((s) => s.bootstrap)

  useEffect(() => {
    initTheme()
    void bootstrap()
  }, [initTheme, bootstrap])

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <DataSyncOnNavigate />
        <AppRouter />
        <Toast />
      </BrowserRouter>
    </QueryClientProvider>
  )
}
