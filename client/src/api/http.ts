/**
 * fetch 封装：统一处理 {code,data,message}、401 跳登录、错误提示。
 * 鉴权走 httpOnly cookie（credentials: include），前端不存 token。
 */

import { useUiStore } from '../stores/ui'
import type { ApiResponse } from '../types'

export class ApiError extends Error {
  readonly code: number
  readonly status: number
  constructor(message: string, code: number, status: number) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.status = status
  }
}

const BASE = '/api/v1'

function notify(message: string, kind: 'error' | 'success' = 'error'): void {
  useUiStore.getState().pushToast({ message, kind })
}

function buildQuery(params?: Record<string, unknown>): string {
  if (!params) return ''
  const entries = Object.entries(params).filter(
    ([, v]) => v !== undefined && v !== null && v !== '' && v !== false,
  )
  if (entries.length === 0) return ''
  const qs = entries
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&')
  return `?${qs}`
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const url = path.startsWith('http') ? path : `${BASE}${path}`
  let res: Response
  try {
    res = await fetch(url, {
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers ?? {}),
      },
      ...options,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : '网络异常'
    notify(`网络异常：${msg}`)
    throw new ApiError(`网络异常：${msg}`, -1, 0)
  }

  let body: ApiResponse<T>
  try {
    body = (await res.json()) as ApiResponse<T>
  } catch {
    throw new ApiError(`请求失败（${res.status}）`, -1, res.status)
  }

  const isLoginRequest = url.includes('/auth/login')

  if (!res.ok || body.code !== 0) {
    if (res.status === 401 && !isLoginRequest) {
      // 会话过期/未登录：通知 auth store 清态（RequireAuth 会跳 /login），不弹 toast。
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('jobhub:unauthorized'))
      }
      throw new ApiError(body.message || '未登录', body.code ?? 401, res.status)
    }
    const msg = body.message || `请求失败（${res.status}）`
    notify(msg)
    throw new ApiError(msg, body.code ?? -1, res.status)
  }
  return body.data
}

export const http = {
  get: <T>(path: string, params?: Record<string, unknown>): Promise<T> =>
    request<T>(`${path}${buildQuery(params)}`, { method: 'GET' }),

  post: <T>(path: string, data?: unknown): Promise<T> =>
    request<T>(path, { method: 'POST', body: JSON.stringify(data ?? {}) }),

  put: <T>(path: string, data?: unknown): Promise<T> =>
    request<T>(path, { method: 'PUT', body: JSON.stringify(data ?? {}) }),

  patch: <T>(path: string, data?: unknown): Promise<T> =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(data ?? {}) }),

  del: <T>(path: string): Promise<T> => request<T>(path, { method: 'DELETE' }),
}
