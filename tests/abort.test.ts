/**
 * 请求取消功能测试
 */

import { describe, it, expect, vi } from 'vitest';
import {
  createHttpClient,
  createFetchAdapter,
  AbortError,
  TimeoutError,
} from '../src';

describe('Request Abort', () => {
  it('should abort request with AbortController', async () => {
    const abortController = new AbortController();

    const mockFetch = vi.fn(async (_url: string, init?: RequestInit) => {
      // 模拟请求被取消
      if (init?.signal?.aborted) {
        throw new DOMException('Aborted', 'AbortError');
      }
      // 模拟长时间请求
      await new Promise((_, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(new DOMException('Aborted', 'AbortError'));
        });
      });
      return new Response('{}');
    });

    const client = createHttpClient({
      adapter: createFetchAdapter({ customFetch: mockFetch as typeof fetch }),
    });

    // 立即取消
    abortController.abort();

    await expect(
      client.get('/test', { signal: abortController.signal })
    ).rejects.toThrow(AbortError);
  });

  it('should abort request after delay', async () => {
    vi.useFakeTimers();

    const abortController = new AbortController();

    const mockFetch = vi.fn(async (_url: string, init?: RequestInit) => {
      return new Promise((_, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(new DOMException('Aborted', 'AbortError'));
        });
      });
    });

    const client = createHttpClient({
      adapter: createFetchAdapter({ customFetch: mockFetch as typeof fetch }),
    });

    const promise = client.get('/test', { signal: abortController.signal });

    // 100ms 后取消
    setTimeout(() => abortController.abort(), 100);
    await vi.advanceTimersByTimeAsync(100);

    try {
      await promise;
      expect.fail('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(AbortError);
      expect((error as Error).message).toContain('Request aborted by user');
    }

    vi.useRealTimers();
  });

  it('should distinguish between user abort and timeout', async () => {
    vi.useFakeTimers();

    const mockFetch = vi.fn(async (_url: string, init?: RequestInit) => {
      return new Promise((_, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(new DOMException('Aborted', 'AbortError'));
        });
      });
    });

    const client = createHttpClient({
      adapter: createFetchAdapter({ customFetch: mockFetch as typeof fetch }),
    });

    // 测试超时（不是用户取消）
    const promise = client.get('/test', { timeout: 1000 });

    await vi.advanceTimersByTimeAsync(1000);

    try {
      await promise;
      expect.fail('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(TimeoutError);
      expect((error as Error).message).toContain('Request timeout after 1000ms');
    }

    vi.useRealTimers();
  });

  it('should handle already aborted signal', async () => {
    const abortController = new AbortController();
    abortController.abort(); // 预先取消

    const mockFetch = vi.fn(async () => {
      return new Response('{}');
    });

    const client = createHttpClient({
      adapter: createFetchAdapter({ customFetch: mockFetch as typeof fetch }),
    });

    await expect(
      client.get('/test', { signal: abortController.signal })
    ).rejects.toThrow(AbortError);
  });

  it('should pass signal to axios adapter config', async () => {
    // 这个测试验证 signal 被正确传递到 axios 配置
    const { createAxiosAdapter } = await import('../src');

    const mockAxiosInstance = {
      request: vi.fn(async (config: { signal?: AbortSignal }) => {
        if (config.signal?.aborted) {
          const error = new Error('canceled') as any;
          error.code = 'ERR_CANCELED';
          error.isAxiosError = true;
          throw error;
        }
        return {
          data: { success: true },
          status: 200,
          statusText: 'OK',
          headers: {},
          config: {},
        };
      }),
    };

    const adapter = createAxiosAdapter({
      instance: mockAxiosInstance as any,
    });

    const abortController = new AbortController();
    abortController.abort();

    await expect(
      adapter.request({
        url: '/test',
        method: 'GET',
        signal: abortController.signal,
      })
    ).rejects.toThrow(AbortError);

    expect(mockAxiosInstance.request).toHaveBeenCalledWith(
      expect.objectContaining({
        signal: abortController.signal,
      })
    );
  });

  it('should cleanup timeout when request completes', async () => {
    vi.useFakeTimers();

    const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');

    const mockFetch = vi.fn(async () => {
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        statusText: 'OK',
      });
    });

    const client = createHttpClient({
      adapter: createFetchAdapter({ customFetch: mockFetch as typeof fetch }),
    });

    await client.get('/test', { timeout: 5000 });

    expect(clearTimeoutSpy).toHaveBeenCalled();

    vi.useRealTimers();
  });

  it('should work with both signal and timeout', async () => {
    vi.useFakeTimers();

    const abortController = new AbortController();

    const mockFetch = vi.fn(async (_url: string, init?: RequestInit) => {
      return new Promise((_, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(new DOMException('Aborted', 'AbortError'));
        });
      });
    });

    const client = createHttpClient({
      adapter: createFetchAdapter({ customFetch: mockFetch as typeof fetch }),
    });

    // 用户在超时前取消
    const promise = client.get('/test', {
      signal: abortController.signal,
      timeout: 5000,
    });

    // 100ms 后用户取消（早于 5000ms 超时）
    setTimeout(() => abortController.abort(), 100);
    await vi.advanceTimersByTimeAsync(100);

    // 应该是用户取消，不是超时
    try {
      await promise;
      expect.fail('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(AbortError);
      expect((error as Error).message).toContain('Request aborted by user');
    }

    vi.useRealTimers();
  });
});
