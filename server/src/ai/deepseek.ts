/**
 * DeepSeek 调用封装：chat（非流式）+ chatStream（SSE 逐 chunk）。
 * 重试：仅网络/5xx/超时，指数退避 ≤ maxRetries 次；4xx 不重试。
 * 超时：AbortController，连接 10s + 总时长 timeoutMs。
 */
import { Readable } from 'node:stream';
import { config } from '../config';
import type { ChatMessage } from './prompts';

export class DeepSeekError extends Error {
  public readonly statusCode: number;
  public readonly retryable: boolean;

  constructor(message: string, statusCode = 0, retryable = true) {
    super(message);
    this.name = 'DeepSeekError';
    this.statusCode = statusCode;
    this.retryable = retryable;
  }
}

export interface ChatOptions {
  messages: ChatMessage[];
  stream?: boolean;
  signal?: AbortSignal;
}

export interface ChatResult {
  content: string;
}

function isRetryable(err: unknown): boolean {
  if (err instanceof DeepSeekError) return err.retryable;
  return true; // 网络错误等未知错误按可重试处理
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function backoff(attempt: number): number {
  return Math.min(1000 * 2 ** attempt, 8000);
}

function withTimeout(timeoutMs: number, signal?: AbortSignal): { signal: AbortSignal; clear: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error('AI 请求超时')), timeoutMs);
  if (signal) {
    if (signal.aborted) controller.abort(signal.reason);
    else signal.addEventListener('abort', () => controller.abort(signal.reason), { once: true });
  }
  return { signal: controller.signal, clear: () => clearTimeout(timer) };
}

function classifyStatus(status: number): DeepSeekError | null {
  if (status >= 200 && status < 300) return null;
  if (status === 408 || status === 429 || status >= 500) {
    return new DeepSeekError(`AI 服务错误（HTTP ${status}）`, status, true);
  }
  return new DeepSeekError(`AI 请求被拒绝（HTTP ${status}）`, status, false);
}

async function doRequest(opts: ChatOptions, timeoutMs: number): Promise<Response> {
  const { apiKey, baseUrl, model, maxTokens } = config.deepseek;
  if (!apiKey) throw new DeepSeekError('未配置 DEEPSEEK_API_KEY，已降级为仅机检模式', 0, false);

  const { signal, clear } = withTimeout(timeoutMs, opts.signal);
  try {
    const resp = await fetch(`${baseUrl.replace(/\/$/, '')}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: opts.messages,
        stream: opts.stream ?? false,
        max_tokens: maxTokens,
      }),
      signal,
    });
    const err = classifyStatus(resp.status);
    if (err) throw err;
    return resp;
  } catch (e) {
    if (e instanceof DeepSeekError) throw e;
    const aborted = (e as Error)?.name === 'AbortError' || (signal as AbortSignal).aborted;
    if (aborted) throw new DeepSeekError('AI 请求超时', 0, true);
    throw new DeepSeekError(`AI 网络错误：${(e as Error).message}`, 0, true);
  } finally {
    clear();
  }
}

/** 非流式调用，返回完整文本（批量任务用）。 */
export async function chat(opts: ChatOptions): Promise<ChatResult> {
  const { maxRetries, timeoutMs } = config.deepseek;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      const resp = await doRequest({ ...opts, stream: false }, timeoutMs);
      const json = (await resp.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      const content = json.choices?.[0]?.message?.content ?? '';
      return { content };
    } catch (e) {
      lastErr = e;
      if (!isRetryable(e) || attempt >= maxRetries) throw e;
      await sleep(backoff(attempt));
    }
  }
  throw lastErr;
}

/**
 * 流式调用：逐 chunk 回调 onDelta（SSE delta 文本），完成后 resolve 完整文本。
 */
export async function chatStream(
  opts: ChatOptions,
  onDelta: (delta: string) => void,
): Promise<string> {
  const { maxRetries, timeoutMs } = config.deepseek;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      const resp = await doRequest({ ...opts, stream: true }, timeoutMs);
      const body = resp.body;
      if (!body) throw new DeepSeekError('AI 响应无内容', 0, true);

      let full = '';
      for await (const chunk of Readable.fromWeb(body as never)) {
        const text = Buffer.from(chunk as Buffer).toString('utf8');
        for (const line of text.split('\n')) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;
          const payload = trimmed.slice(5).trim();
          if (payload === '[DONE]') continue;
          try {
            const json = JSON.parse(payload) as { choices?: { delta?: { content?: string } }[] };
            const delta = json.choices?.[0]?.delta?.content ?? '';
            if (delta) {
              full += delta;
              onDelta(delta);
            }
          } catch {
            // 忽略无法解析的行
          }
        }
      }
      return full;
    } catch (e) {
      lastErr = e;
      if (!isRetryable(e) || attempt >= maxRetries) throw e;
      await sleep(backoff(attempt));
    }
  }
  throw lastErr;
}
