import { http } from '../http'
import { USE_MOCK } from '../config'
import { streamSSE } from '../sse'
import type { SSEHandlers } from '../sse'

export const aiApi = {
  /** POST /ai/analyze-question/:qid（SSE 命名事件：start/delta/done/error） */
  analyzeQuestion(qid: number, handlers: SSEHandlers, signal?: AbortSignal): Promise<void> {
    if (USE_MOCK) return Promise.resolve()
    return streamSSE(`/ai/analyze-question/${qid}`, {}, handlers, signal)
  },

  /** POST /ai/summarize/:interviewId（SSE） */
  summarize(interviewId: number, handlers: SSEHandlers, signal?: AbortSignal): Promise<void> {
    if (USE_MOCK) return Promise.resolve()
    return streamSSE(`/ai/summarize/${interviewId}`, {}, handlers, signal)
  },

  /** POST /ai/self-assess/:interviewId（SSE） */
  selfAssess(interviewId: number, handlers: SSEHandlers, signal?: AbortSignal): Promise<void> {
    if (USE_MOCK) return Promise.resolve()
    return streamSSE(`/ai/self-assess/${interviewId}`, {}, handlers, signal)
  },

  /** POST /ai/batch-analyze/:interviewId → 返回 { jobId, total } */
  async batchAnalyze(interviewId: number): Promise<{ jobId: string; total: number }> {
    if (USE_MOCK) return { jobId: '', total: 0 }
    return http.post<{ jobId: string; total: number }>(`/ai/batch-analyze/${interviewId}`)
  },

  /** GET /ai/jobs/:jobId 查询批量任务进度 */
  async jobProgress(jobId: string): Promise<{
    total: number
    done: number
    failed: number
    status: string
  }> {
    if (USE_MOCK) return { total: 0, done: 0, failed: 0, status: 'done' }
    return http.get<{ total: number; done: number; failed: number; status: string }>(
      `/ai/jobs/${jobId}`,
    )
  },
}
