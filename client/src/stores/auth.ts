import { create } from 'zustand'
import type { User } from '../types'
import { authApi } from '../api/endpoints'

interface AuthState {
  user: User | null
  authed: boolean
  loading: boolean
  bootstrap: () => Promise<void>
  login: (username: string, password: string) => Promise<void>
  logout: () => void
  clear: () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  authed: false,
  loading: true,

  // 首屏校验会话（JWT 走 httpOnly cookie，前端无感携带）。
  // 骨架阶段后端未就绪时 mock 直接返回默认用户。
  bootstrap: async () => {
    // 401 时由 http.ts 派发事件，这里只清本地态。
    if (typeof window !== 'undefined') {
      window.addEventListener('jobhub:unauthorized', () => {
        set({ user: null, authed: false })
      })
    }
    try {
      const user = await authApi.me()
      set({ user, authed: true, loading: false })
    } catch {
      // 未登录 / 后端未启动：骨架阶段仍允许浏览界面，不阻塞渲染。
      set({ loading: false })
    }
  },

  login: async (username: string, password: string) => {
    const { user } = await authApi.login({ username, password })
    set({ user, authed: true })
  },

  logout: () => {
    void authApi.logout().catch(() => undefined)
    set({ user: null, authed: false })
  },

  clear: () => set({ user: null, authed: false }),
}))
