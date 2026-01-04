/**
 * EventSource 适配器
 *
 * 使用 @microsoft/fetch-event-source 支持 Server-Sent Events (SSE)
 */

import { fetchEventSource } from '@microsoft/fetch-event-source';
import type { RequestConfig, ResponseData, HttpAdapter } from '../engine';

export type EventSourceMessage = {
  data: string;
  type?: string;
  id?: string;
};

export type EventSourceSession = {
  stream: AsyncIterable<EventSourceMessage>;
  cancel: () => void;
  done: Promise<void>;
};

type AsyncQueue<T> = {
  push: (value: T) => void;
  close: () => void;
  fail: (err: unknown) => void;
  iterable: AsyncIterable<T>;
  done: Promise<void>;
};

function createAsyncQueue<T>(): AsyncQueue<T> {
  let isClosed = false;
  let failure: unknown | undefined;
  const values: T[] = [];
  let resolveNext: ((value: IteratorResult<T>) => void) | undefined;
  let rejectNext: ((reason?: unknown) => void) | undefined;

  let doneResolve: (() => void) | undefined;
  const done = new Promise<void>((resolve) => {
    doneResolve = resolve;
  });

  function settleDone() {
    if (doneResolve) {
      doneResolve();
      doneResolve = undefined;
    }
  }

  const iterable: AsyncIterable<T> = {
    [Symbol.asyncIterator]() {
      return {
        next(): Promise<IteratorResult<T>> {
          if (failure) return Promise.reject(failure);
          if (values.length > 0) {
            const value = values.shift() as T;
            return Promise.resolve({ value, done: false });
          }
          if (isClosed) {
            settleDone();
            return Promise.resolve({ value: undefined as unknown as T, done: true });
          }

          return new Promise<IteratorResult<T>>((resolve, reject) => {
            resolveNext = resolve;
            rejectNext = reject;
          });
        }
      };
    }
  };

  return {
    push(value) {
      if (isClosed || failure) return;
      if (resolveNext) {
        resolveNext({ value, done: false });
        resolveNext = undefined;
        rejectNext = undefined;
        return;
      }
      values.push(value);
    },
    close() {
      if (isClosed) return;
      isClosed = true;
      if (resolveNext) {
        resolveNext({ value: undefined as unknown as T, done: true });
        resolveNext = undefined;
        rejectNext = undefined;
      }
      settleDone();
    },
    fail(err) {
      if (failure || isClosed) return;
      failure = err;
      if (rejectNext) {
        rejectNext(err);
        resolveNext = undefined;
        rejectNext = undefined;
      }
      settleDone();
    },
    iterable,
    done
  };
}

function headersToObject(headers: Headers): Record<string, string> {
  const result: Record<string, string> = {};
  headers.forEach((value, key) => {
    result[key] = value;
  });
  return result;
}

/**
 * EventSource 适配器配置
 */
export interface EventSourceAdapterConfig {
  /** 基础 URL */
  baseURL?: string;
  /** 默认请求头 */
  defaultHeaders?: Record<string, string>;
  /** 是否自动添加 Accept: text/event-stream（默认 true） */
  autoAcceptEventStream?: boolean;
  /** 事件监听器 */
  onMessage?: (event: EventSourceMessage) => void;
  onOpen?: (response: Response) => void | Promise<void>;
  onError?: (error: Error) => void;
  onClose?: () => void;
}

/**
 * 构建完整 URL
 */
function buildUrl(config: RequestConfig, baseURL?: string): string {
  let url = config.url;

  // 处理 baseURL
  if (baseURL && !url.startsWith('http://') && !url.startsWith('https://')) {
    url = baseURL.replace(/\/$/, '') + '/' + url.replace(/^\//, '');
  }

  // 处理 query params
  if (config.params && Object.keys(config.params).length > 0) {
    const searchParams = new URLSearchParams();
    for (const [key, value] of Object.entries(config.params)) {
      if (value !== undefined && value !== null) {
        searchParams.append(key, String(value));
      }
    }
    const queryString = searchParams.toString();
    if (queryString) {
      url += (url.includes('?') ? '&' : '?') + queryString;
    }
  }

  return url;
}

/**
 * 创建 EventSource 适配器
 *
 * @param config 适配器配置
 * @returns HttpAdapter 实例
 *
 * @example
 * ```ts
 * const adapter = createEventSourceAdapter({
 *   baseURL: 'https://api.example.com',
 *   onMessage: (event) => console.log('Message:', event.data),
 *   onError: (error) => console.error('Error:', error),
 * });
 * ```
 */
export function createEventSourceAdapter(config: EventSourceAdapterConfig = {}): HttpAdapter {
  const {
    baseURL,
    defaultHeaders = {},
    autoAcceptEventStream = true,
    onMessage,
    onOpen,
    onError,
    onClose
  } = config;

  return {
    async request<TReqData = unknown, TResData = unknown>(
      requestConfig: RequestConfig<TReqData>
    ): Promise<ResponseData<TResData>> {
      const url = buildUrl(requestConfig, requestConfig.baseURL || baseURL);

      // 构建请求头
      const headers: Record<string, string> = {
        ...defaultHeaders,
        ...requestConfig.headers,
      };

      if (autoAcceptEventStream && !headers['Accept'] && !headers['accept']) {
        headers['Accept'] = 'text/event-stream';
      }

      // 处理请求体（与 fetch adapter 保持一致）
      let body: string | BodyInit | undefined;
      if (requestConfig.data !== undefined) {
        if (
          typeof requestConfig.data === 'object' &&
          !(requestConfig.data instanceof FormData) &&
          !(requestConfig.data instanceof Blob) &&
          !(requestConfig.data instanceof ArrayBuffer)
        ) {
          body = JSON.stringify(requestConfig.data);
          if (!headers['Content-Type'] && !headers['content-type']) {
            headers['Content-Type'] = 'application/json';
          }
        } else {
          body = requestConfig.data as unknown as BodyInit;
        }
      }

      const externalSignal = requestConfig.signal as AbortSignal | undefined;
      const abortController = new AbortController();

      const onExternalAbort = () => abortController.abort();
      if (externalSignal) {
        if (externalSignal.aborted) onExternalAbort();
        else externalSignal.addEventListener('abort', onExternalAbort, { once: true });
      }

      let timeoutId: ReturnType<typeof setTimeout> | undefined;
      if (requestConfig.timeout && requestConfig.timeout > 0) {
        timeoutId = setTimeout(() => abortController.abort(), requestConfig.timeout);
      }

      const queue = createAsyncQueue<EventSourceMessage>();
      const session: EventSourceSession = {
        stream: queue.iterable,
        cancel: () => abortController.abort(),
        done: queue.done
      };

      return new Promise((resolve, reject) => {
        let settled = false;
        let doneResolve: (() => void) | undefined;
        const done = new Promise<void>((res) => {
          doneResolve = res;
        });

        session.done = Promise.all([done, queue.done]).then(() => undefined);

        const run = async () => {
          try {
            await fetchEventSource(url, {
              method: requestConfig.method,
              headers,
              body: body as any,
              signal: abortController.signal,
              onopen: async (response) => {
                if (!response.ok) {
                  const text = await response.text().catch(() => undefined);
                  const err = new Error(`HTTP Error: ${response.status} ${response.statusText}${text ? ` - ${text}` : ''}`);
                  (err as Error & { status?: number; body?: string }).status = response.status;
                  (err as Error & { status?: number; body?: string }).body = text;
                  queue.fail(err);
                  if (!settled) {
                    settled = true;
                    reject(err);
                  }
                  throw err;
                }

                if (!settled) {
                  settled = true;
                  resolve({
                    data: session as unknown as TResData,
                    status: response.status,
                    statusText: response.statusText,
                    headers: headersToObject(response.headers),
                    config: requestConfig
                  });
                }

                await onOpen?.(response);
              },
              onmessage: (event) => {
                const msg: EventSourceMessage = { data: event.data, type: event.event, id: event.id };
                queue.push(msg);
                onMessage?.(msg);
              },
              onerror: (error) => {
                queue.fail(error);
                onError?.(error);
                throw error;
              },
              onclose: () => {
                queue.close();
                onClose?.();
              }
            });
          } catch (err) {
            if (!settled) {
              settled = true;
              reject(err);
            }
            queue.fail(err);
          } finally {
            queue.close();
            doneResolve?.();
            doneResolve = undefined;
            if (timeoutId) clearTimeout(timeoutId);
            if (externalSignal) externalSignal.removeEventListener('abort', onExternalAbort);
          }
        };

        void run();
      });
    },
  };
}

/**
 * 创建 EventSource 适配器的快捷方法
 *
 * @param baseURL 基础 URL
 * @param onMessage 消息监听器
 * @returns HttpAdapter 实例
 */
export function eventSourceAdapter(
  baseURL?: string,
  onMessage?: (event: EventSourceMessage) => void
): HttpAdapter {
  return createEventSourceAdapter({ baseURL, onMessage });
}