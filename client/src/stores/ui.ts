import { create } from 'zustand'

export type Theme = 'light' | 'dark'
export type ToastKind = 'info' | 'success' | 'error'

export interface ToastItem {
  id: number
  message: string
  kind: ToastKind
}

const THEME_STORAGE_KEY = 'jobhub:theme'

function systemTheme(): Theme {
  if (typeof window === 'undefined') return 'light'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function applyTheme(theme: Theme): void {
  if (typeof document === 'undefined') return
  document.documentElement.setAttribute('data-theme', theme)
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
  if (meta) meta.content = theme === 'dark' ? '#1e1b26' : '#fdf6ec'
}

interface UiState {
  theme: Theme
  toasts: ToastItem[]
  initTheme: () => void
  setTheme: (theme: Theme) => void
  toggleTheme: () => void
  pushToast: (toast: { message: string; kind?: ToastKind }) => void
  dismissToast: (id: number) => void
}

let toastSeq = 0

export const useUiStore = create<UiState>((set, get) => ({
  theme: systemTheme(),
  toasts: [],

  initTheme: () => {
    const stored = localStorage.getItem(THEME_STORAGE_KEY)
    const theme: Theme = stored === 'light' || stored === 'dark' ? stored : systemTheme()
    applyTheme(theme)
    set({ theme })
  },

  setTheme: (theme: Theme) => {
    applyTheme(theme)
    localStorage.setItem(THEME_STORAGE_KEY, theme)
    set({ theme })
  },

  toggleTheme: () => {
    get().setTheme(get().theme === 'dark' ? 'light' : 'dark')
  },

  pushToast: ({ message, kind = 'info' }) => {
    const id = ++toastSeq
    set((s) => ({ toasts: [...s.toasts, { id, message, kind }] }))
    // 自动消失
    if (typeof window !== 'undefined') {
      window.setTimeout(() => get().dismissToast(id), 3200)
    }
  },

  dismissToast: (id: number) => {
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
  },
}))
