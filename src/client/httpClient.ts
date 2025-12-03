/**
 * HTTP 客户端
 * 
 * 组合 Engine + Adapter，提供完整的 HTTP 客户端功能
 */

import {
  createMiddlewareEngine,
  normalizeError,
  RequestError,
  RequestErrorType,
  type Middleware,
  type HttpContext,
  type HttpClientOptions,
  type RequestConfig,
  type ResponseData,
  type IHttpClient,
} from '../engine';

/**
 * 创建 HTTP 上下文
 */
function createHttpContext<TReqData = unknown, TResData = unknown>(
  config: RequestConfig<TReqData>
): HttpContext<TReqData, TResData> {
  return {
    request: config,
    response: undefined,
    error: undefined,
    state: {},
  };
}

/**
 * 创建 HTTP 客户端
 * 
 * @param options 客户端配置
 * @returns HTTP 客户端实例
 * 
 * @example
 * ```ts
 * import axios from 'axios';
 * import { createHttpClient, axiosAdapter } from 'request-middleware';
 * 
 * const client = createHttpClient({
 *   adapter: axiosAdapter(axios.create({ baseURL: 'https://api.example.com' })),
 *   middlewares: [loggerMiddleware, authMiddleware],
 * });
 * 
 * const response = await client.get('/users');
 * ```
 */
export function createHttpClient(options: HttpClientOptions): IHttpClient {
  const { adapter, middlewares = [], defaults = {} } = options;

  // 创建中间件引擎
  const engine = createMiddlewareEngine<HttpContext>({
    middlewares,
  });

  /**
   * 发送请求
   */
  async function request<TReqData = unknown, TResData = unknown>(
    config: RequestConfig<TReqData>,
    extraMiddlewares?: Middleware<HttpContext<TReqData, TResData>>[]
  ): Promise<ResponseData<TResData>> {
    // 合并默认配置
    const mergedConfig = {
      ...defaults,
      ...config,
      headers: {
        ...(defaults.headers as Record<string, string>),
        ...config.headers,
      },
    } as RequestConfig<TReqData>;

    // 创建上下文
    const ctx = createHttpContext<TReqData, TResData>(mergedConfig);

    // 创建 finalHandler - 实际发送请求
    const finalHandler = async (): Promise<void> => {
      try {
        ctx.response = await adapter.request<TReqData, TResData>(ctx.request);
      } catch (error) {
        // 统一错误处理
        ctx.error = normalizeError(error, ctx.request);
        throw ctx.error;
      }
    };

    // 执行中间件链
    // 注意：这里需要类型转换，因为 extraMiddlewares 的泛型参数可能更具体
    await engine.dispatch(
      ctx as HttpContext,
      finalHandler,
      extraMiddlewares as Middleware<HttpContext>[] | undefined
    );

    // 检查响应
    if (!ctx.response) {
      throw new RequestError(
        'No response received from adapter',
        RequestErrorType.UNKNOWN,
        { config: ctx.request }
      );
    }

    return ctx.response;
  }

  return {
    request,

    get<TResData = unknown>(
      url: string,
      config?: Omit<RequestConfig, 'url' | 'method'>
    ): Promise<ResponseData<TResData>> {
      return request<unknown, TResData>({
        ...config,
        url,
        method: 'GET',
      });
    },

    post<TReqData = unknown, TResData = unknown>(
      url: string,
      data?: TReqData,
      config?: Omit<RequestConfig, 'url' | 'method' | 'data'>
    ): Promise<ResponseData<TResData>> {
      return request<TReqData, TResData>({
        ...config,
        url,
        method: 'POST',
        data,
      });
    },

    put<TReqData = unknown, TResData = unknown>(
      url: string,
      data?: TReqData,
      config?: Omit<RequestConfig, 'url' | 'method' | 'data'>
    ): Promise<ResponseData<TResData>> {
      return request<TReqData, TResData>({
        ...config,
        url,
        method: 'PUT',
        data,
      });
    },

    delete<TResData = unknown>(
      url: string,
      config?: Omit<RequestConfig, 'url' | 'method'>
    ): Promise<ResponseData<TResData>> {
      return request<unknown, TResData>({
        ...config,
        url,
        method: 'DELETE',
      });
    },

    patch<TReqData = unknown, TResData = unknown>(
      url: string,
      data?: TReqData,
      config?: Omit<RequestConfig, 'url' | 'method' | 'data'>
    ): Promise<ResponseData<TResData>> {
      return request<TReqData, TResData>({
        ...config,
        url,
        method: 'PATCH',
        data,
      });
    },
  };
}
