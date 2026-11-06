/**
 * SSE 客户端（AI 流式）。后端事件格式（命名事件）：
 *   event: start   data: {"question_id":1}
 *   event: delta   data: {"text":"..."}
 *   event: done    data: {"analysis":{...} | "summary":{...} | "scores":{...}}
 *   event: error   data: {"message":"..."}
 * 事件以空行分隔。
 */

const BASE = '/api/v1'

export interface SSEHandlers {
  /** 收到一条命名事件：event 为事件名（start/delta/done/...），data 为解析后的 JSON。 */
  onEvent?: (event: string, data: unknown) => void
  /** 流正常结束（服务器关闭连接）。 */
  onDone?: () => void
  /** 服务器下发 error 事件或网络/协议层出错。 */
  onError?: (err: Error) => void
}

function dispatch(handlers: SSEHandlers, eventName: string, dataLines: string[]): void {
  if (dataLines.length === 0) return
  const raw = dataLines.join('\n')
  let data: unknown = raw
  try {
    data = JSON.parse(raw)
  } catch {
    // 非 JSON 时按原文透传
  }

  if (eventName === 'error') {
    const msg =
      typeof data === 'object' && data !== null && 'message' in data
        ? String((data as { message: unknown }).message)
        : 'AI 流式出错'
    handlers.onError?.(new Error(msg))
    return
  }
  handlers.onEvent?.(eventName, data)
}

/**
 * 以 POST 发起 SSE 流式请求。
 * @param path 形如 /ai/analyze-question/12
 * @param body 请求体（JSON）
 * @param handlers 事件回调
 * @param signal 外部 AbortSignal（可选，用于中断）
 */
export async function streamSSE(
  path: string,
  body: unknown,
  handlers: SSEHandlers,
  signal?: AbortSignal,
): Promise<void> {
  let res: Response
  try {
    res = await fetch(`${BASE}${path}`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
      },
      body: JSON.stringify(body ?? {}),
      signal,
    })
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') return
    handlers.onError?.(err instanceof Error ? err : new Error('网络异常'))
    return
  }

  if (!res.ok || !res.body) {
    handlers.onError?.(new Error(`SSE 连接失败（${res.status}）`))
    return
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let eventName = 'message'
  const dataLines: string[] = []

  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })

      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const rawLine of lines) {
        const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine
        if (line === '') {
          dispatch(handlers, eventName, dataLines)
          eventName = 'message'
          dataLines.length = 0
        } else if (line.startsWith('event:')) {
          eventName = line.slice(6).trim() || 'message'
        } else if (line.startsWith('data:')) {
          dataLines.push(line.slice(5).trimStart())
        }
        // 以 ':' 开头的行为注释，忽略
      }
    }
    handlers.onDone?.()
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') return
    handlers.onError?.(err instanceof Error ? err : new Error('读取流失败'))
  } finally {
    reader.releaseLock()
  }
}
