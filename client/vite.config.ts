import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// 本地开发：/api（含 SSE 流式）代理到后端，生产为同源直连无需代理。
// 目标端口默认 3000，可用 client/.env 的 API_PROXY_TARGET 覆盖（如本机 3000 被占用时）。
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '')
  const proxyTarget = env.API_PROXY_TARGET || 'http://127.0.0.1:3000'
  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy: {
        '/api': {
          target: proxyTarget,
          changeOrigin: true,
        },
      },
    },
  }
})
