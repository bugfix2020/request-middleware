/**
 * 重试中间件
 *
 * 作用：请求失败时自动重试，提升健壮性
 * 支持自定义重试次数和重试间隔
 *
 * 用法示例：
 * ```ts
 * import { createRetryMiddleware } from './engine';
 * engine.use(createRetryMiddleware({ retries: 3, delay: 500 }));
 * ```
 */
import type { Middleware, HttpContext } from '../engine/middlewareTypes';

export interface RetryOptions {
  /** 重试次数（默认2次） */
  retries?: number;
  /** 每次重试的延迟(ms)，默认200 */
  delay?: number;
}

export function createRetryMiddleware(options: RetryOptions = {}): Middleware<HttpContext> {
  const { retries = 2, delay = 200 } = options;
  return async (ctx, next) => {
    let lastError: unknown;
    for (let i = 0; i <= retries; i++) {
      try {
        await next();
        if (!ctx.error) return;
      } catch (err) {
        lastError = err;
        if (i < retries && delay > 0) {
          await new Promise((res) => setTimeout(res, delay));
        }
      }
    }
    if (lastError) throw lastError;
  };
}
