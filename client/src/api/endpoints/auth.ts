import { http } from '../http'
import { USE_MOCK } from '../config'
import type { LoginPayload, LoginResult, User } from '../../types'

const MOCK_USER: User = { id: 1, username: 'admin' }

export const authApi = {
  /** POST /auth/login → { user }（token 仅经 httpOnly cookie 下发，不进 body） */
  async login(payload: LoginPayload): Promise<LoginResult> {
    if (USE_MOCK) return { user: MOCK_USER }
    return http.post<LoginResult>('/auth/login', payload)
  },

  /** GET /auth/me → { user } */
  async me(): Promise<User> {
    if (USE_MOCK) return MOCK_USER
    const { user } = await http.get<{ user: User }>('/auth/me')
    return user
  },

  /** POST /auth/logout（清除 httpOnly cookie） */
  async logout(): Promise<void> {
    if (USE_MOCK) return
    try {
      await http.post<void>('/auth/logout')
    } catch {
      // 登出失败不阻塞本地清态
    }
  },

  /** POST /auth/change-password（字段与后端 zod schema 对齐：camelCase） */
  async changePassword(data: { oldPassword: string; newPassword: string }): Promise<void> {
    if (USE_MOCK) return
    await http.post<void>('/auth/change-password', data)
  },
}
