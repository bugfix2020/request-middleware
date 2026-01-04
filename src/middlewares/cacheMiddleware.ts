/**
 * 缓存中间件
 *
 * 作用：缓存 GET 请求的响应，减少重复请求，提升性能
 * 仅支持内存缓存，适合简单场景
 *
 * 用法示例：
 * ```ts
 * import { cacheMiddleware } from './engine';
 * engine.use(cacheMiddleware);
 * ```
 */
import type { Middleware, HttpContext } from '../engine/middlewareTypes';

// 简单内存缓存实现（仅支持 GET 请求）
const cacheStore = new Map<string, any>();

export const cacheMiddleware: Middleware<HttpContext> = async (ctx, next) => {
  const { method, url, params } = ctx.request;
  if (method === 'GET') {
    const key = url + JSON.stringify(params || {});
    if (cacheStore.has(key)) {
      ctx.response = cacheStore.get(key);
      return;
    }
    await next();
    if (ctx.response) {
      cacheStore.set(key, ctx.response);
    }
  } else {
    await next();
  }
};
