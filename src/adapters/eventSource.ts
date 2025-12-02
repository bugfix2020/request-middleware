/**
 * EventSource 适配器
 *
 * 使用 @microsoft/fetch-event-source 支持 Server-Sent Events (SSE)
 */

import { fetchEventSource } from '@microsoft/fetch-event-source';
import type { RequestConfig, ResponseData, HttpAdapter } from '../engine';
import { RequestError, RequestErrorType, normalizeError } from '../engine';

/**
 * EventSource 适配器配置
 */
export interface EventSourceAdapterConfig {
  /** 基础 URL */
  baseURL?: string;
  /** 默认请求头 */
  defaultHeaders?: Record<string, string>;
  /** 事件监听器 */
  onMessage?: (event: { data: string; type?: string; id?: string }) => void;
  onOpen?: (response: Response) => void | Promise<void>;
  onError?: (error: RequestError) => void;
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
  const { baseURL, defaultHeaders = {}, onMessage, onOpen, onError, onClose } = config;

  return {
    async request<TReqData = unknown, TResData = unknown>(
      requestConfig: RequestConfig<TReqData>
    ): Promise<ResponseData<TResData>> {
      const url = buildUrl(requestConfig, requestConfig.baseURL || baseURL);

      // 构建请求头
      const headers: Record<string, string> = {
        ...defaultHeaders,
        ...requestConfig.headers,
        'Accept': 'text/event-stream',
      };

      // SSE only supports GET requests
      if (requestConfig.method !== 'GET') {
        throw new RequestError(
          'EventSource adapter only supports GET requests',
          RequestErrorType.UNKNOWN,
          { config: requestConfig }
        );
      }

      return new Promise((resolve, reject) => {
        let resolved = false;

        fetchEventSource(url, {
          method: 'GET',
          headers,
          onopen: async (response: Response) => {
            if (!resolved) {
              resolved = true;
              resolve({
                data: {} as TResData, // SSE 不返回传统数据
                status: response.status,
                statusText: response.statusText,
                headers: {} as Record<string, string>, // fetchEventSource 不提供 headers
                config: requestConfig,
              });
            }
            await onOpen?.(response);
          },
          onmessage: (event: { data: string; event: string; id: string }) => {
            onMessage?.({ data: event.data, type: event.event, id: event.id });
          },
          onerror: (error: Error) => {
            const normalizedError = normalizeError(error, requestConfig);
            if (!resolved) {
              resolved = true;
              reject(normalizedError);
            }
            onError?.(normalizedError);
          },
          onclose: () => {
            onClose?.();
          },
        });
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
  onMessage?: (event: { data: string; type?: string; id?: string }) => void
): HttpAdapter {
  return createEventSourceAdapter({ baseURL, onMessage });
}