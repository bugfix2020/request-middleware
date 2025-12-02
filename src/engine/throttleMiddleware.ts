/**
 * 限流/节流中间件
 * 
 * 作用：限制单位时间内的最大请求数，防止接口被滥用
 * 适合高并发场景下保护后端服务
 * 
 * 用法示例：
 * ```ts
 * import { createThrottleMiddleware } from './engine';
 * engine.use(createThrottleMiddleware({ limit: 10, interval: 1000 }));
 * ```
 */
import type { Middleware, HttpContext } from './middlewareTypes';

export interface ThrottleOptions {
  /** 单位时间内最大请求数（默认5） */
  limit?: number;
  /** 单位时间(ms)，默认1000 */
  interval?: number;
}

export function createThrottleMiddleware(options: ThrottleOptions = {}): Middleware<HttpContext> {
  const { limit = 5, interval = 1000 } = options;
  let queue: (() => void)[] = [];
  let timestamps: number[] = [];

  function clean() {
    const now = Date.now();
    timestamps = timestamps.filter(ts => now - ts < interval);
  }

  return async (_ctx, next) => {
    await new Promise<void>(resolve => {
      const tryRequest = () => {
        clean();
        if (timestamps.length < limit) {
          timestamps.push(Date.now());
          resolve();
        } else {
          queue.push(tryRequest);
        }
      };
      tryRequest();
    });
    await next();
    // 请求完成后，尝试唤醒队列
    setTimeout(() => {
      clean();
      while (queue.length && timestamps.length < limit) {
        const fn = queue.shift();
        if (fn) fn();
      }
    }, interval);
  };
}
