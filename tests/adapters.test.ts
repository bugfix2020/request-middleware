/**
 * Adapters 测试
 */

import { describe, it, expect, vi } from 'vitest';

// Mock @microsoft/fetch-event-source before importing adapters
vi.mock('@microsoft/fetch-event-source', () => ({
  fetchEventSource: vi.fn(),
}));

import { createFetchAdapter, fetchAdapter } from '../src/adapters/fetch';
import type { RequestConfig } from '../src/engine';
import { createEventSourceAdapter, eventSourceAdapter } from '../src/adapters/eventSource';
import { createAxiosAdapter, axiosAdapter } from '../src/adapters/axios';

describe('fetchAdapter', () => {
  describe('createFetchAdapter', () => {
    it('should create a fetch adapter instance', () => {
      const adapter = createFetchAdapter();
      expect(adapter).toBeDefined();
      expect(typeof adapter.request).toBe('function');
    });

    it('should support baseURL configuration', async () => {
      const mockFetch = vi.fn(async () => {
        return new Response(JSON.stringify({ data: 'test' }), {
          status: 200,
          statusText: 'OK',
          headers: { 'content-type': 'application/json' },
        });
      });

      const adapter = createFetchAdapter({
        baseURL: 'https://api.example.com',
        customFetch: mockFetch as typeof fetch,
      });

      const config: RequestConfig = {
        url: '/users',
        method: 'GET',
      };

      await adapter.request(config);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/users',
        expect.any(Object)
      );
    });

    it('should support defaultHeaders', async () => {
      const mockFetch = vi.fn(async () => {
        return new Response(JSON.stringify({ data: 'test' }), {
          status: 200,
          statusText: 'OK',
        });
      });

      const adapter = createFetchAdapter({
        defaultHeaders: {
          'X-Custom-Header': 'custom-value',
        },
        customFetch: mockFetch as typeof fetch,
      });

      await adapter.request({
        url: 'https://api.example.com/test',
        method: 'GET',
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-Custom-Header': 'custom-value',
          }),
        })
      );
    });
  });

  describe('request()', () => {
    it('should successfully send GET request', async () => {
      const mockData = { id: 1, name: 'Test' };
      const mockFetch = vi.fn(async () => {
        return new Response(JSON.stringify(mockData), {
          status: 200,
          statusText: 'OK',
          headers: { 'content-type': 'application/json' },
        });
      });

      const adapter = createFetchAdapter({
        customFetch: mockFetch as typeof fetch,
      });

      const response = await adapter.request({
        url: 'https://api.example.com/users/1',
        method: 'GET',
      });

      expect(response.status).toBe(200);
      expect(response.statusText).toBe('OK');
      expect(response.data).toEqual(mockData);
    });

    it('should successfully send POST request and serialize JSON data', async () => {
      const mockFetch = vi.fn(async () => {
        return new Response(JSON.stringify({ success: true }), {
          status: 201,
          statusText: 'Created',
        });
      });

      const adapter = createFetchAdapter({
        customFetch: mockFetch as typeof fetch,
      });

      const postData = { name: 'John', age: 30 };
      await adapter.request({
        url: 'https://api.example.com/users',
        method: 'POST',
        data: postData,
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(postData),
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
        })
      );
    });

    it('should handle query params correctly', async () => {
      const mockFetch = vi.fn(async () => {
        return new Response('{}', { status: 200, statusText: 'OK' });
      });

      const adapter = createFetchAdapter({
        customFetch: mockFetch as typeof fetch,
      });

      await adapter.request({
        url: 'https://api.example.com/users',
        method: 'GET',
        params: {
          page: 1,
          limit: 10,
          search: 'test',
        },
      });

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/users?page=1&limit=10&search=test',
        expect.any(Object)
      );
    });

    it('should ignore null and undefined params', async () => {
      const mockFetch = vi.fn(async () => {
        return new Response('{}', { status: 200, statusText: 'OK' });
      });

      const adapter = createFetchAdapter({
        customFetch: mockFetch as typeof fetch,
      });

      await adapter.request({
        url: 'https://api.example.com/users',
        method: 'GET',
        params: {
          page: 1,
          search: null,
          filter: undefined,
        },
      });

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/users?page=1',
        expect.any(Object)
      );
    });

    it('should merge request headers', async () => {
      const mockFetch = vi.fn(async () => {
        return new Response('{}', { status: 200, statusText: 'OK' });
      });

      const adapter = createFetchAdapter({
        defaultHeaders: {
          'X-Default': 'default',
          'X-Override': 'default',
        },
        customFetch: mockFetch as typeof fetch,
      });

      await adapter.request({
        url: 'https://api.example.com/test',
        method: 'GET',
        headers: {
          'X-Override': 'custom',
          'X-Custom': 'custom',
        },
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: {
            'X-Default': 'default',
            'X-Override': 'custom',
            'X-Custom': 'custom',
          },
        })
      );
    });

    it('HTTP 错误状态应该抛出异常', async () => {
      const mockFetch = vi.fn(async () => {
        return new Response('Not Found', {
          status: 404,
          statusText: 'Not Found',
        });
      });

      const adapter = createFetchAdapter({
        customFetch: mockFetch as typeof fetch,
      });

      await expect(
        adapter.request({
          url: 'https://api.example.com/not-exist',
          method: 'GET',
        })
      ).rejects.toThrow('HTTP Error: 404 Not Found');
    });

    it('should support different responseType', async () => {
      const textData = 'plain text response';
      const mockFetch = vi.fn(async () => {
        return new Response(textData, {
          status: 200,
          statusText: 'OK',
        });
      });

      const adapter = createFetchAdapter({
        customFetch: mockFetch as typeof fetch,
      });

      const response = await adapter.request({
        url: 'https://api.example.com/text',
        method: 'GET',
        responseType: 'text',
      });

      expect(response.data).toBe(textData);
    });

    it('超时应该中止请求', async () => {
      const mockFetch = vi.fn(async (url, init) => {
        // 模拟延迟
        await new Promise((resolve) => setTimeout(resolve, 200));
        
        // 检查是否已中止
        if (init?.signal?.aborted) {
          throw new DOMException('The operation was aborted', 'AbortError');
        }
        
        return new Response('{}', { status: 200, statusText: 'OK' });
      });

      const adapter = createFetchAdapter({
        customFetch: mockFetch as typeof fetch,
      });

      await expect(
        adapter.request({
          url: 'https://api.example.com/slow',
          method: 'GET',
          timeout: 100,
        })
      ).rejects.toThrow();
    });

    it('should parse response headers correctly', async () => {
      const mockFetch = vi.fn(async () => {
        return new Response('{}', {
          status: 200,
          statusText: 'OK',
          headers: {
            'content-type': 'application/json',
            'x-custom-header': 'custom-value',
          },
        });
      });

      const adapter = createFetchAdapter({
        customFetch: mockFetch as typeof fetch,
      });

      const response = await adapter.request({
        url: 'https://api.example.com/test',
        method: 'GET',
      });

      expect(response.headers).toEqual({
        'content-type': 'application/json',
        'x-custom-header': 'custom-value',
      });
    });

    it('should return original request config', async () => {
      const mockFetch = vi.fn(async () => {
        return new Response('{}', { status: 200, statusText: 'OK' });
      });

      const adapter = createFetchAdapter({
        customFetch: mockFetch as typeof fetch,
      });

      const config: RequestConfig = {
        url: 'https://api.example.com/test',
        method: 'GET',
        headers: { 'X-Test': 'test' },
      };

      const response = await adapter.request(config);

      expect(response.config).toBe(config);
    });

    it('should support request and response interceptors', async () => {
      const mockFetch = vi.fn(async () => {
        return new Response(JSON.stringify({ data: 'original' }), {
          status: 200,
          statusText: 'OK',
          headers: { 'content-type': 'application/json' },
        });
      });

      const requestInterceptor = vi.fn((config) => {
        return { ...config, headers: { ...config.headers, 'X-Intercepted': 'request' } };
      });

      const responseInterceptor = vi.fn((response) => {
        return { ...response, data: { ...response.data, intercepted: true } };
      });

      const adapter = createFetchAdapter({
        customFetch: mockFetch as typeof fetch,
        interceptors: {
          request: requestInterceptor,
          response: responseInterceptor,
        },
      });

      const config: RequestConfig = {
        url: 'https://api.example.com/test',
        method: 'GET',
      };

      const response = await adapter.request(config);

      expect(requestInterceptor).toHaveBeenCalledWith(config);
      expect(responseInterceptor).toHaveBeenCalledWith({
        data: { data: 'original' },
        status: 200,
        statusText: 'OK',
        headers: { 'content-type': 'application/json' },
        config: {
          ...config,
          headers: { 'X-Intercepted': 'request' },
        },
      });
      expect(response.data).toEqual({ data: 'original', intercepted: true });
    });
  });

  describe('fetchAdapter 快捷方法', () => {
    it('should create adapter with baseURL', async () => {
      const mockFetch = vi.fn(async () => {
        return new Response('{}', { status: 200, statusText: 'OK' });
      });

      // 临时替换全局 fetch
      const originalFetch = global.fetch;
      global.fetch = mockFetch as typeof fetch;

      const adapter = fetchAdapter('https://api.example.com');
      await adapter.request({
        url: '/users',
        method: 'GET',
      });

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/users',
        expect.any(Object)
      );

      // 恢复全局 fetch
      global.fetch = originalFetch;
    });
  });
});

// @vitest-environment jsdom
describe('eventSourceAdapter', () => {
  describe('createEventSourceAdapter', () => {
    it('should create eventSource adapter instance', () => {
      const adapter = createEventSourceAdapter();
      expect(adapter).toBeDefined();
      expect(typeof adapter.request).toBe('function');
    });

    it('should initiate EventSource connection and return session', async () => {
      // Import the mocked fetchEventSource
      const { fetchEventSource } = await import('@microsoft/fetch-event-source');
      const mockedFetchEventSource = vi.mocked(fetchEventSource);

      // Setup mock
      mockedFetchEventSource.mockImplementation((input: RequestInfo, options: any) => {
        // Simulate onopen immediately
        options.onopen(new Response(null, { status: 200, statusText: 'OK', headers: { 'content-type': 'text/event-stream' } }));
        return Promise.resolve();
      });

      const adapter = createEventSourceAdapter({
        baseURL: 'https://api.example.com',
        onMessage: vi.fn(),
        onOpen: vi.fn(),
      });

      const response = await adapter.request({
        url: '/events',
        method: 'GET',
      });

      expect(response.status).toBe(200);
      expect(response.data).toBeDefined();
      expect(typeof (response.data as any).cancel).toBe('function');
      expect((response.data as any).stream).toBeDefined();
    });

    it('should support POST + JSON body and merge headers', async () => {
      const { fetchEventSource } = await import('@microsoft/fetch-event-source');
      const mockedFetchEventSource = vi.mocked(fetchEventSource);

      mockedFetchEventSource.mockImplementation((input: RequestInfo, options: any) => {
        options.onopen(new Response(null, { status: 200, statusText: 'OK', headers: { 'x-test': '1' } }));
        options.onclose();
        return Promise.resolve();
      });

      const adapter = createEventSourceAdapter({
        baseURL: 'https://api.example.com',
        defaultHeaders: { 'X-Default': 'default' }
      });

      const payload = { hello: 'world' };
      const response = await adapter.request({
        url: '/events',
        method: 'POST',
        headers: { 'X-Custom': 'custom' },
        data: payload
      });

      expect(mockedFetchEventSource).toHaveBeenCalledWith(
        'https://api.example.com/events',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(payload),
          headers: expect.objectContaining({
            'X-Default': 'default',
            'X-Custom': 'custom',
            'Content-Type': 'application/json',
            'Accept': 'text/event-stream'
          })
        })
      );

      expect(response.headers).toEqual(expect.objectContaining({ 'x-test': '1' }));
    });

    it('should not override Accept header when already provided', async () => {
      const { fetchEventSource } = await import('@microsoft/fetch-event-source');
      const mockedFetchEventSource = vi.mocked(fetchEventSource);

      mockedFetchEventSource.mockImplementation((input: RequestInfo, options: any) => {
        options.onopen(new Response(null, { status: 200, statusText: 'OK' }));
        options.onclose();
        return Promise.resolve();
      });

      const adapter = createEventSourceAdapter();
      await adapter.request({
        url: '/events',
        method: 'GET',
        headers: { Accept: 'application/json' }
      });

      expect(mockedFetchEventSource).toHaveBeenCalledWith(
        '/events',
        expect.objectContaining({
          headers: expect.objectContaining({
            Accept: 'application/json'
          })
        })
      );
    });

    it('should push messages into session.stream', async () => {
      const { fetchEventSource } = await import('@microsoft/fetch-event-source');
      const mockedFetchEventSource = vi.mocked(fetchEventSource);

      mockedFetchEventSource.mockImplementation((input: RequestInfo, options: any) => {
        options.onopen(new Response(null, { status: 200, statusText: 'OK' }));
        options.onmessage({ data: 'a', event: 'message', id: '1' });
        options.onmessage({ data: 'b', event: 'message', id: '2' });
        options.onclose();
        return Promise.resolve();
      });

      const adapter = createEventSourceAdapter();
      const response = await adapter.request({
        url: '/events',
        method: 'POST',
        data: { q: 1 }
      });

      const session = response.data as any;
      const iterator = session.stream[Symbol.asyncIterator]();
      await expect(iterator.next()).resolves.toEqual({ value: { data: 'a', type: 'message', id: '1' }, done: false });
      await expect(iterator.next()).resolves.toEqual({ value: { data: 'b', type: 'message', id: '2' }, done: false });
      await expect(iterator.next()).resolves.toEqual({ value: undefined, done: true });
      await expect(session.done).resolves.toBeUndefined();
    });
  });
});

describe('axiosAdapter', () => {
  describe('createAxiosAdapter', () => {
    it('should create axios adapter instance', () => {
      const mockAxios = {
        request: vi.fn(),
      } as any;

      const adapter = createAxiosAdapter({
        instance: mockAxios,
      });

      expect(adapter).toBeDefined();
      expect(typeof adapter.request).toBe('function');
    });

    it('should convert request config and call axios correctly', async () => {
      const mockAxios = {
        request: vi.fn().mockResolvedValue({
          data: { message: 'success' },
          status: 200,
          statusText: 'OK',
          headers: { 'content-type': 'application/json' },
        }),
      } as any;

      const adapter = createAxiosAdapter({
        instance: mockAxios,
      });

      const response = await adapter.request({
        url: '/users',
        method: 'GET',
        headers: { 'Authorization': 'Bearer token' },
        params: { page: 1 },
      });

      expect(mockAxios.request).toHaveBeenCalledWith({
        url: '/users',
        method: 'GET',
        headers: { 'Authorization': 'Bearer token' },
        params: { page: 1 },
        data: undefined,
        timeout: undefined,
        baseURL: undefined,
        responseType: undefined,
      });

      expect(response).toEqual({
        data: { message: 'success' },
        status: 200,
        statusText: 'OK',
        headers: { 'content-type': 'application/json' },
        config: {
          url: '/users',
          method: 'GET',
          headers: { 'Authorization': 'Bearer token' },
          params: { page: 1 },
        },
      });
    });
  });

  describe('axiosAdapter 快捷方法', () => {
    it('should create adapter with axios instance', () => {
      const mockAxios = {
        request: vi.fn(),
      } as any;

      const adapter = axiosAdapter(mockAxios);

      expect(adapter).toBeDefined();
      expect(typeof adapter.request).toBe('function');
    });
  });
});
