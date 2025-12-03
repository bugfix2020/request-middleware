/**
 * 重试功能测试
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createRetryAdapter,
  createHttpClient,
  createFetchAdapter,
  NetworkError,
  HttpError,
  AbortError,
} from '../src';

describe('Retry Adapter', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should retry on network error', async () => {
    let attempts = 0;
    const mockFetch = vi.fn(async () => {
      attempts++;
      if (attempts < 3) {
        throw new TypeError('Failed to fetch');
      }
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        statusText: 'OK',
      });
    });

    const client = createHttpClient({
      adapter: createRetryAdapter(
        createFetchAdapter({ customFetch: mockFetch as typeof fetch }),
        {
          maxRetries: 3,
          baseDelay: 100,
        }
      ),
    });

    const promise = client.get('/test');

    // 快进时间以触发重试
    await vi.advanceTimersByTimeAsync(150); // 第一次重试
    await vi.advanceTimersByTimeAsync(300); // 第二次重试

    const response = await promise;
    expect(response.data).toEqual({ success: true });
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it('should retry on 5xx errors', async () => {
    let attempts = 0;
    const mockFetch = vi.fn(async () => {
      attempts++;
      if (attempts < 2) {
        return new Response('Server Error', {
          status: 500,
          statusText: 'Internal Server Error',
        });
      }
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        statusText: 'OK',
      });
    });

    const client = createHttpClient({
      adapter: createRetryAdapter(
        createFetchAdapter({ customFetch: mockFetch as typeof fetch }),
        {
          maxRetries: 3,
          baseDelay: 100,
        }
      ),
    });

    const promise = client.get('/test');
    await vi.advanceTimersByTimeAsync(150);

    const response = await promise;
    expect(response.data).toEqual({ success: true });
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('should not retry on 4xx errors by default', async () => {
    const mockFetch = vi.fn(async () => {
      return new Response('Not Found', {
        status: 404,
        statusText: 'Not Found',
      });
    });

    const client = createHttpClient({
      adapter: createRetryAdapter(
        createFetchAdapter({ customFetch: mockFetch as typeof fetch }),
        {
          maxRetries: 3,
          baseDelay: 100,
        }
      ),
    });

    await expect(client.get('/test')).rejects.toThrow(HttpError);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('should not retry on abort errors', async () => {
    const abortController = new AbortController();

    const mockFetch = vi.fn(async (_url: string, init?: RequestInit) => {
      // 检查是否已取消
      if (init?.signal?.aborted) {
        throw new DOMException('Aborted', 'AbortError');
      }
      abortController.abort();
      throw new DOMException('Aborted', 'AbortError');
    });

    const client = createHttpClient({
      adapter: createRetryAdapter(
        createFetchAdapter({ customFetch: mockFetch as typeof fetch }),
        {
          maxRetries: 3,
          baseDelay: 100,
        }
      ),
    });

    await expect(
      client.get('/test', { signal: abortController.signal })
    ).rejects.toThrow(AbortError);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('should respect maxRetries', async () => {
    const mockFetch = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });

    const client = createHttpClient({
      adapter: createRetryAdapter(
        createFetchAdapter({ customFetch: mockFetch as typeof fetch }),
        {
          maxRetries: 2,
          baseDelay: 100,
        }
      ),
    });

    const promise = client.get('/test');

    // 快进所有重试
    await vi.advanceTimersByTimeAsync(150); // 第一次重试
    await vi.advanceTimersByTimeAsync(300); // 第二次重试

    await expect(promise).rejects.toThrow(NetworkError);
    expect(mockFetch).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
  });

  it('should call onRetry callback', async () => {
    let attempts = 0;
    const onRetry = vi.fn();
    const mockFetch = vi.fn(async () => {
      attempts++;
      if (attempts < 3) {
        throw new TypeError('Failed to fetch');
      }
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        statusText: 'OK',
      });
    });

    const client = createHttpClient({
      adapter: createRetryAdapter(
        createFetchAdapter({ customFetch: mockFetch as typeof fetch }),
        {
          maxRetries: 3,
          baseDelay: 100,
          onRetry,
        }
      ),
    });

    const promise = client.get('/test');
    await vi.advanceTimersByTimeAsync(150);
    await vi.advanceTimersByTimeAsync(300);

    await promise;
    expect(onRetry).toHaveBeenCalledTimes(2);
    expect(onRetry).toHaveBeenCalledWith(expect.any(Error), 1);
    expect(onRetry).toHaveBeenCalledWith(expect.any(Error), 2);
  });

  it('should use custom shouldRetry function', async () => {
    let attempts = 0;
    const mockFetch = vi.fn(async () => {
      attempts++;
      if (attempts < 2) {
        return new Response('Custom Error', {
          status: 418,
          statusText: "I'm a teapot",
        });
      }
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        statusText: 'OK',
      });
    });

    const client = createHttpClient({
      adapter: createRetryAdapter(
        createFetchAdapter({ customFetch: mockFetch as typeof fetch }),
        {
          maxRetries: 3,
          baseDelay: 100,
          shouldRetry: (error) => {
            // 自定义：418 状态码也重试
            if (error instanceof HttpError && error.status === 418) {
              return true;
            }
            return false;
          },
        }
      ),
    });

    const promise = client.get('/test');
    await vi.advanceTimersByTimeAsync(150);

    const response = await promise;
    expect(response.data).toEqual({ success: true });
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('should use linear backoff when configured', async () => {
    const delays: number[] = [];
    const originalSetTimeout = globalThis.setTimeout;

    vi.spyOn(globalThis, 'setTimeout').mockImplementation((fn, delay) => {
      if (delay && delay > 0) {
        delays.push(delay as number);
      }
      return originalSetTimeout(fn, delay);
    });

    let attempts = 0;
    const mockFetch = vi.fn(async () => {
      attempts++;
      if (attempts < 4) {
        throw new TypeError('Failed to fetch');
      }
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        statusText: 'OK',
      });
    });

    const client = createHttpClient({
      adapter: createRetryAdapter(
        createFetchAdapter({ customFetch: mockFetch as typeof fetch }),
        {
          maxRetries: 3,
          backoff: 'linear',
          baseDelay: 1000,
        }
      ),
    });

    const promise = client.get('/test');
    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(2000);
    await vi.advanceTimersByTimeAsync(3000);

    await promise;

    // 线性退避：1000, 2000, 3000
    expect(delays[0]).toBe(1000);
    expect(delays[1]).toBe(2000);
    expect(delays[2]).toBe(3000);
  });

  it('should respect maxDelay', async () => {
    const delays: number[] = [];
    const originalSetTimeout = globalThis.setTimeout;

    vi.spyOn(globalThis, 'setTimeout').mockImplementation((fn, delay) => {
      if (delay && delay > 0) {
        delays.push(delay as number);
      }
      return originalSetTimeout(fn, delay);
    });

    let attempts = 0;
    const mockFetch = vi.fn(async () => {
      attempts++;
      if (attempts < 4) {
        throw new TypeError('Failed to fetch');
      }
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        statusText: 'OK',
      });
    });

    const client = createHttpClient({
      adapter: createRetryAdapter(
        createFetchAdapter({ customFetch: mockFetch as typeof fetch }),
        {
          maxRetries: 3,
          backoff: 'exponential',
          baseDelay: 1000,
          maxDelay: 2000,
        }
      ),
    });

    const promise = client.get('/test');
    await vi.advanceTimersByTimeAsync(2500);
    await vi.advanceTimersByTimeAsync(2500);
    await vi.advanceTimersByTimeAsync(2500);

    await promise;

    // 所有延迟都不应超过 maxDelay (加上 25% 抖动)
    delays.forEach((delay) => {
      expect(delay).toBeLessThanOrEqual(2000 * 1.25);
    });
  });

  it('should work without any options', async () => {
    let attempts = 0;
    const mockFetch = vi.fn(async () => {
      attempts++;
      if (attempts < 2) {
        throw new TypeError('Failed to fetch');
      }
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        statusText: 'OK',
      });
    });

    const client = createHttpClient({
      adapter: createRetryAdapter(
        createFetchAdapter({ customFetch: mockFetch as typeof fetch })
      ),
    });

    const promise = client.get('/test');
    // 默认 baseDelay 是 1000ms，指数退避
    await vi.advanceTimersByTimeAsync(1500);

    const response = await promise;
    expect(response.data).toEqual({ success: true });
  });

  it('should retry on 429 Too Many Requests', async () => {
    let attempts = 0;
    const mockFetch = vi.fn(async () => {
      attempts++;
      if (attempts < 2) {
        return new Response('Too Many Requests', {
          status: 429,
          statusText: 'Too Many Requests',
        });
      }
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        statusText: 'OK',
      });
    });

    const client = createHttpClient({
      adapter: createRetryAdapter(
        createFetchAdapter({ customFetch: mockFetch as typeof fetch }),
        {
          maxRetries: 3,
          baseDelay: 100,
        }
      ),
    });

    const promise = client.get('/test');
    await vi.advanceTimersByTimeAsync(150);

    const response = await promise;
    expect(response.data).toEqual({ success: true });
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});
