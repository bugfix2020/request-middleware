/**
 * request-middleware
 * 
 * 一个通用的中间件引擎 + HTTP 客户端库
 * 
 * 设计特点：
 * - 中间件引擎与 HTTP/网络完全解耦
 * - 支持洋葱模型（Onion Model）执行中间件
 * - 支持多种传输层适配器（axios/fetch/自定义）
 * - 支持三级中间件扩展：全局 + per-client + per-request
 */

// ============================================================================
// Engine 核心导出
// ============================================================================

export {
  // 引擎类与工厂
  MiddlewareEngine,
  createMiddlewareEngine,
  
  // compose 函数
  composeMiddlewares,

  // 错误处理
  RequestErrorType,
  RequestError,
  NetworkError,
  TimeoutError,
  HttpError,
  AbortError,
  ParseError,
  normalizeError,
  createHttpError,
  isRequestError,
  isRetryableError,
} from './engine';

// Engine 类型导出
export type {
  // 基础类型
  NextFunction,
  Middleware,
  
  // Engine 相关
  MiddlewareEngineOptions,
  IMiddlewareEngine,
  
  // HTTP 相关默认类型
  HttpMethod,
  RequestConfig,
  ResponseData,
  HttpContext,
  HttpAdapter,
  
  // HTTP Client 相关
  HttpClientOptions,
  IHttpClient,
} from './engine';

// ============================================================================
// HTTP Client 导出
// ============================================================================

export { createHttpClient } from './client';

// ============================================================================
// Adapters 导出
// ============================================================================

export {
  // Axios 适配器
  createAxiosAdapter,
  axiosAdapter,
  
  // Fetch 适配器
  createFetchAdapter,
  fetchAdapter,

  // EventSource 适配器
  createEventSourceAdapter,
  eventSourceAdapter,
} from './adapters';

export type {
  AxiosAdapterConfig,
  FetchAdapterConfig,
  EventSourceAdapterConfig,
} from './adapters';

// ============================================================================
// 内置中间件导出
// ============================================================================

export { createRetryMiddleware, retryMiddleware, createRetryAdapter } from './middlewares';

export type { RetryMiddlewareOptions } from './middlewares';
