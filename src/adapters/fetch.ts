/**
 * Fetch 适配器
 * 
 * 将原生 fetch API 适配为统一的 HttpAdapter 接口
 */

import type { RequestConfig, ResponseData, HttpAdapter } from '../engine';
import {
  TimeoutError,
  HttpError,
  NetworkError,
  AbortError,
  ParseError,
  normalizeError,
} from '../engine';

/**
 * Fetch 适配器配置
 */
export interface FetchAdapterConfig {
  /** 基础 URL */
  baseURL?: string;
  /** 默认请求头 */
  defaultHeaders?: Record<string, string>;
  /** 自定义 fetch 实现（用于 Node.js 环境或测试）*/
  customFetch?: typeof fetch;
  /** 请求和响应拦截器 */
  interceptors?: {
    /** 请求拦截器 */
    request?: (config: RequestConfig) => RequestConfig | Promise<RequestConfig>;
    /** 响应拦截器 */
    response?: (response: ResponseData) => ResponseData | Promise<ResponseData>;
  };
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
 * 将 Headers 对象转换为普通对象
 */
function headersToObject(headers: Headers): Record<string, string> {
  const result: Record<string, string> = {};
  headers.forEach((value, key) => {
    result[key] = value;
  });
  return result;
}

/**
 * 解析响应体
 */
async function parseResponseBody<T>(
  response: Response,
  responseType?: string
): Promise<T> {
  switch (responseType) {
    case 'text':
      return (await response.text()) as T;
    case 'blob':
      return (await response.blob()) as T;
    case 'arraybuffer':
      return (await response.arrayBuffer()) as T;
    case 'json':
    default:
      // 尝试解析 JSON，如果失败则返回原始文本
      const text = await response.text();
      try {
        return JSON.parse(text) as T;
      } catch {
        return text as T;
      }
  }
}

/**
 * 创建 Fetch 适配器
 * 
 * @param config 适配器配置
 * @returns HttpAdapter 实例
 * 
 * @example
 * ```ts
 * const adapter = createFetchAdapter({
 *   baseURL: 'https://api.example.com',
 *   defaultHeaders: { 'Content-Type': 'application/json' }
 * });
 * ```
 */
export function createFetchAdapter(config: FetchAdapterConfig = {}): HttpAdapter {
  const { baseURL, defaultHeaders = {}, customFetch, interceptors } = config;
  const fetchFn = customFetch || fetch;

  return {
    async request<TReqData = unknown, TResData = unknown>(
      requestConfig: RequestConfig<TReqData>
    ): Promise<ResponseData<TResData>> {
      // 应用请求拦截器
      let processedConfig: RequestConfig<any> = requestConfig;
      if (interceptors?.request) {
        processedConfig = await interceptors.request(requestConfig);
      }

      const url = buildUrl(processedConfig, processedConfig.baseURL || baseURL);

      // 构建请求头
      const headers: Record<string, string> = {
        ...defaultHeaders,
        ...processedConfig.headers,
      };

      // 如果有 body 且没有设置 Content-Type，自动添加
      if (processedConfig.data && !headers['Content-Type'] && !headers['content-type']) {
        headers['Content-Type'] = 'application/json';
      }

      // 构建 fetch 配置
      const fetchConfig: RequestInit = {
        method: processedConfig.method,
        headers,
      };

      // 处理请求体
      if (processedConfig.data !== undefined) {
        if (
          typeof processedConfig.data === 'object' &&
          !(processedConfig.data instanceof FormData) &&
          !(processedConfig.data instanceof Blob) &&
          !(processedConfig.data instanceof ArrayBuffer)
        ) {
          fetchConfig.body = JSON.stringify(processedConfig.data);
        } else {
          fetchConfig.body = processedConfig.data as BodyInit;
        }
      }

      // 处理请求取消和超时
      let timeoutId: ReturnType<typeof setTimeout> | undefined;
      let internalAbortController: AbortController | undefined;
      const userSignal = processedConfig.signal;

      // 如果用户的 signal 已经被取消，立即抛出错误
      if (userSignal?.aborted) {
        throw new AbortError('Request aborted by user', processedConfig);
      }

      // 如果用户提供了 signal 或需要超时控制，创建内部 AbortController
      if (userSignal || (processedConfig.timeout && processedConfig.timeout > 0)) {
        internalAbortController = new AbortController();
        fetchConfig.signal = internalAbortController.signal;

        // 监听用户的 signal
        if (userSignal) {
          userSignal.addEventListener('abort', () => {
            internalAbortController?.abort();
          }, { once: true });
        }

        // 设置超时
        if (processedConfig.timeout && processedConfig.timeout > 0) {
          timeoutId = setTimeout(() => {
            internalAbortController?.abort();
          }, processedConfig.timeout);
        }
      }

      try {
        const response = await fetchFn(url, fetchConfig);

        // HTTP 错误状态码处理
        if (!response.ok) {
          throw new HttpError(
            `HTTP Error: ${response.status} ${response.statusText}`,
            response.status,
            response.statusText,
            processedConfig
          );
        }

        let data: TResData;
        try {
          data = await parseResponseBody<TResData>(response, processedConfig.responseType);
        } catch (parseErr) {
          throw new ParseError(
            'Failed to parse response body',
            processedConfig,
            undefined,
            parseErr instanceof Error ? parseErr : undefined
          );
        }

        let result: ResponseData<any> = {
          data,
          status: response.status,
          statusText: response.statusText,
          headers: headersToObject(response.headers),
          config: processedConfig as RequestConfig<TReqData>,
        };

        // 应用响应拦截器
        if (interceptors?.response) {
          result = await interceptors.response(result);
        }

        return result as ResponseData<TResData>;
      } catch (error) {
        // 已经是统一错误类型，直接抛出
        if (error instanceof HttpError || error instanceof ParseError) {
          throw error;
        }

        // 处理 AbortController 取消
        if (error instanceof DOMException && error.name === 'AbortError') {
          // 优先检查用户是否主动取消
          if (userSignal?.aborted) {
            throw new AbortError('Request aborted by user', processedConfig);
          }
          // 否则是超时导致的取消
          if (processedConfig.timeout && processedConfig.timeout > 0) {
            throw new TimeoutError(
              `Request timeout after ${processedConfig.timeout}ms`,
              processedConfig.timeout,
              processedConfig
            );
          }
          throw new AbortError('Request aborted', processedConfig);
        }

        // 处理网络错误
        if (error instanceof TypeError) {
          throw new NetworkError(
            error.message || 'Network error',
            processedConfig,
            error
          );
        }

        // 其他错误统一处理
        throw normalizeError(error, processedConfig);
      } finally {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
      }
    },
  };
}

/**
 * 创建 Fetch 适配器的快捷方法
 * 
 * @param baseURL 基础 URL
 * @returns HttpAdapter 实例
 */
export function fetchAdapter(baseURL?: string): HttpAdapter {
  return createFetchAdapter({ baseURL });
}
