/**
 * 中间件引擎类型定义
 * 
 * 设计原则：
 * - Engine 本身与 HTTP/网络完全解耦
 * - Context 支持泛型，可由上层自定义
 * - 提供默认的 HTTP Context 类型供便捷使用
 */

// ============================================================================
// 基础类型
// ============================================================================

/**
 * 下一步函数类型
 */
export type NextFunction = () => Promise<void>;

/**
 * 中间件函数类型
 * 
 * @template C - 上下文类型，默认为 Record<string, unknown>
 * 
 * @example
 * ```ts
 * const loggerMiddleware: Middleware<HttpContext> = async (ctx, next) => {
 *   console.log('Request:', ctx.request.url);
 *   await next();
 *   console.log('Response:', ctx.response?.status);
 * };
 * ```
 */
export type Middleware<C = Record<string, unknown>> = (
  ctx: C,
  next: NextFunction
) => Promise<void>;

// ============================================================================
// Engine 相关类型
// ============================================================================

/**
 * 中间件引擎配置
 */
export interface MiddlewareEngineOptions<C = Record<string, unknown>> {
  /** 初始中间件列表 */
  middlewares?: Middleware<C>[];
}

/**
 * 中间件引擎接口
 */
export interface IMiddlewareEngine<C = Record<string, unknown>> {
  /**
   * 注册中间件
   * @param middleware 中间件函数
   */
  use(middleware: Middleware<C>): void;

  /**
   * 获取已注册的中间件列表（用于调试/测试）
   */
  getMiddlewares(): Middleware<C>[];

  /**
   * 执行中间件链
   * @param ctx 上下文对象
   * @param finalHandler 可选的最终处理函数（如实际发送请求）
   * @param extraMiddlewares 可选的本次执行额外中间件
   */
  dispatch(
    ctx: C,
    finalHandler?: () => Promise<void>,
    extraMiddlewares?: Middleware<C>[]
  ): Promise<void>;
}

// ============================================================================
// HTTP 相关默认类型（供 adapter 层使用）
// ============================================================================

/**
 * HTTP 请求方法
 */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS';

/**
 * 请求配置
 */
export interface RequestConfig<TData = unknown> {
  /** 请求 URL */
  url: string;
  /** HTTP 方法 */
  method: HttpMethod;
  /** 请求头 */
  headers?: Record<string, string>;
  /** 请求参数 (query string) */
  params?: Record<string, unknown>;
  /** 请求体数据 */
  data?: TData;
  /** 超时时间 (ms) */
  timeout?: number;
  /** 基础 URL */
  baseURL?: string;
  /** 响应类型 */
  responseType?: 'json' | 'text' | 'blob' | 'arraybuffer';
  /** 请求取消信号 */
  signal?: AbortSignal;
  /** 自定义配置 */
  [key: string]: unknown;
}

/**
 * 响应对象
 */
export interface ResponseData<TData = unknown> {
  /** 响应数据 */
  data: TData;
  /** HTTP 状态码 */
  status: number;
  /** 状态文本 */
  statusText: string;
  /** 响应头 */
  headers: Record<string, string>;
  /** 原始请求配置 */
  config: RequestConfig;
}

/**
 * 默认的 HTTP 上下文类型
 * 
 * 适用于 axios/fetch 等 HTTP 请求场景
 */
export interface HttpContext<TReqData = unknown, TResData = unknown> {
  /** 请求配置 */
  request: RequestConfig<TReqData>;
  /** 响应对象 (在响应阶段可用) */
  response?: ResponseData<TResData>;
  /** 错误对象 (发生错误时可用) */
  error?: Error;
  /** 共享状态 - 中间件可自由读写 */
  state: Record<string, unknown>;
}

/**
 * HTTP 适配器接口
 * 
 * 所有 adapter（axios/fetch/其他）都需要实现此接口
 */
export interface HttpAdapter {
  request<TReqData = unknown, TResData = unknown>(
    config: RequestConfig<TReqData>
  ): Promise<ResponseData<TResData>>;
}

// ============================================================================
// HTTP Client 相关类型
// ============================================================================

/**
 * HTTP 客户端配置
 */
export interface HttpClientOptions<C = HttpContext> {
  /** HTTP 适配器 */
  adapter: HttpAdapter;
  /** 全局中间件列表 */
  middlewares?: Middleware<C>[];
  /** 默认请求配置 */
  defaults?: Partial<RequestConfig>;
}

/**
 * HTTP 客户端接口
 */
export interface IHttpClient {
  /**
   * 发送请求
   */
  request<TReqData = unknown, TResData = unknown>(
    config: RequestConfig<TReqData>,
    extraMiddlewares?: Middleware<HttpContext<TReqData, TResData>>[]
  ): Promise<ResponseData<TResData>>;

  /**
   * GET 请求
   */
  get<TResData = unknown>(
    url: string,
    config?: Omit<RequestConfig, 'url' | 'method'>
  ): Promise<ResponseData<TResData>>;

  /**
   * POST 请求
   */
  post<TReqData = unknown, TResData = unknown>(
    url: string,
    data?: TReqData,
    config?: Omit<RequestConfig, 'url' | 'method' | 'data'>
  ): Promise<ResponseData<TResData>>;

  /**
   * PUT 请求
   */
  put<TReqData = unknown, TResData = unknown>(
    url: string,
    data?: TReqData,
    config?: Omit<RequestConfig, 'url' | 'method' | 'data'>
  ): Promise<ResponseData<TResData>>;

  /**
   * DELETE 请求
   */
  delete<TResData = unknown>(
    url: string,
    config?: Omit<RequestConfig, 'url' | 'method'>
  ): Promise<ResponseData<TResData>>;

  /**
   * PATCH 请求
   */
  patch<TReqData = unknown, TResData = unknown>(
    url: string,
    data?: TReqData,
    config?: Omit<RequestConfig, 'url' | 'method' | 'data'>
  ): Promise<ResponseData<TResData>>;
}
