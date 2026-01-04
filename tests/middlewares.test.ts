import { describe, it, expect } from 'vitest';

import { cacheMiddleware, createRetryMiddleware, createThrottleMiddleware } from '../src/engine';

describe('middlewares', () => {
  it('cacheMiddleware should cache GET responses', async () => {
    const ctx: any = {
      request: { method: 'GET', url: '/x', params: { a: 1 } },
      response: undefined,
      error: undefined,
      state: {}
    };

    let called = 0;
    const next = async () => {
      called++;
      ctx.response = { data: 'ok' };
    };

    await cacheMiddleware(ctx, next);
    await cacheMiddleware(ctx, next);

    expect(called).toBe(1);
    expect(ctx.response).toEqual({ data: 'ok' });
  });

  it('createRetryMiddleware should retry when next throws', async () => {
    const retry = createRetryMiddleware({ retries: 2, delay: 0 });
    const ctx: any = {
      request: { method: 'GET', url: '/x' },
      response: undefined,
      error: undefined,
      state: {}
    };

    let called = 0;
    const next = async () => {
      called++;
      throw new Error('boom');
    };

    await expect(retry(ctx, next)).rejects.toThrow('boom');
    expect(called).toBe(3);
  });

  it('createThrottleMiddleware should allow requests up to limit', async () => {
    const throttle = createThrottleMiddleware({ limit: 2, interval: 20 });
    const ctx: any = {
      request: { method: 'GET', url: '/x' },
      response: undefined,
      error: undefined,
      state: {}
    };

    let called = 0;
    const next = async () => {
      called++;
    };

    await Promise.all([throttle(ctx, next), throttle(ctx, next)]);
    expect(called).toBe(2);
  });
});
