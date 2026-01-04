/**
 * Engine 模块导出
 */

export { MiddlewareEngine, createMiddlewareEngine } from './middlewareEngine';
export { composeMiddlewares } from './compose';

// @isMrFan 新增中间件导出
export { cacheMiddleware } from '../middlewares/cacheMiddleware';
export { createRetryMiddleware } from '../middlewares/retryMiddleware';
export { createThrottleMiddleware } from '../middlewares/throttleMiddleware';

// 新增中间件类型导出
export type { RetryOptions } from '../middlewares/retryMiddleware';
export type { ThrottleOptions } from '../middlewares/throttleMiddleware';

// 类型导出
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
} from './middlewareTypes';
