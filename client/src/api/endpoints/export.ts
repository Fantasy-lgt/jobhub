/**
 * 离线全量导出：GET /api/v1/export。
 *
 * 与其余接口不同，导出返回的是「裸 JSON 附件」（Content-Disposition: attachment），
 * 不是 {code,data,message} 包裹，因此这里单独用原生 fetch + blob 处理，
 * 不复用 http.ts 的 request 拦截器，避免破坏统一响应解析与 401 逻辑。
 * 401 行为与 http.ts 保持一致：派发 jobhub:unauthorized，交给 auth store 清态。
 */

import { USE_MOCK } from '../config'

const BASE = '/api/v1'

/** 本地日期 YYYYMMDD（不用 UTC，保证与用户看到的「今天」一致）。 */
function dateStamp(): string {
  const d = new Date()
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`
}

/** 优先采用后端下发的文件名，解析失败时前端按本地日期兜底。 */
function filenameFrom(res: Response | null): string {
  const disposition = res?.headers.get('Content-Disposition')
  const match = disposition?.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i)
  const name = match?.[1]
  if (name && /\.json$/i.test(name)) return name
  return `jobhub-backup-${dateStamp()}.json`
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  a.remove()
  // 延迟释放，兼容部分浏览器在 click 之后才真正读取 blob
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export const exportApi = {
  /** 触发浏览器下载，返回实际落盘的文件名。 */
  async download(): Promise<string> {
    if (USE_MOCK) {
      const blob = new Blob(
        [JSON.stringify({ source: 'mock', exported_at: new Date().toISOString() }, null, 2)],
        { type: 'application/json;charset=utf-8' },
      )
      const filename = filenameFrom(null)
      triggerDownload(blob, filename)
      return filename
    }

    let res: Response
    try {
      res = await fetch(`${BASE}/export`, {
        method: 'GET',
        credentials: 'include',
        headers: { Accept: 'application/json' },
      })
    } catch (err) {
      throw new Error(`网络异常：${err instanceof Error ? err.message : '未知错误'}`)
    }

    if (res.status === 401) {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('jobhub:unauthorized'))
      }
      throw new Error('未登录或会话已过期，请重新登录')
    }

    if (!res.ok) {
      // 错误响应仍走统一包裹，尽量把后端文案透出来
      let message = `导出失败（${res.status}）`
      try {
        const body = (await res.json()) as { message?: string }
        if (body?.message) message = body.message
      } catch {
        // 非 JSON 错误体，保留默认文案
      }
      throw new Error(message)
    }

    const blob = await res.blob()
    const filename = filenameFrom(res)
    triggerDownload(blob, filename)
    return filename
  },
}
