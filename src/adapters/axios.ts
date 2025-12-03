/**
 * Axios 适配器
 * 
 * 将 axios 实例适配为统一的 HttpAdapter 接口
 */

import type { AxiosInstance, AxiosResponse, AxiosRequestConfig, AxiosError } from 'axios';
import type { RequestConfig, ResponseData, HttpAdapter } from '../engine';
import {
  HttpError,
  NetworkError,
  TimeoutError,
  AbortError,
  normalizeError,
} from '../engine';

/**
 * Axios 适配器配置
 */
export interface AxiosAdapterConfig {
  /** Axios 实例 */
  instance: AxiosInstance;
}

/**
 * 将内部请求配置转换为 Axios 请求配置
 */
function toAxiosConfig<TData = unknown>(config: RequestConfig<TData>): AxiosRequestConfig<TData> {
  return {
    url: config.url,
    method: config.method,
    headers: config.headers,
    params: config.params,
    data: config.data,
    timeout: config.timeout,
    baseURL: config.baseURL,
    responseType: config.responseType,
    signal: config.signal,
  };
}

/**
 * 将 Axios 响应转换为内部响应格式
 */
function fromAxiosResponse<TData = unknown>(
  axiosResponse: AxiosResponse<TData>,
  config: RequestConfig
): ResponseData<TData> {
  return {
    data: axiosResponse.data,
    status: axiosResponse.status,
    statusText: axiosResponse.statusText,
    headers: axiosResponse.headers as Record<string, string>,
    config,
  };
}

/**
 * 创建 Axios 适配器
 * 
 * @param config 适配器配置
 * @returns HttpAdapter 实例
 * 
 * @example
 * ```ts
 * import axios from 'axios';
 * 
 * const adapter = createAxiosAdapter({
 *   instance: axios.create({ baseURL: 'https://api.example.com' })
 * });
 * ```
 */
export function createAxiosAdapter(config: AxiosAdapterConfig): HttpAdapter {
  const { instance } = config;

  return {
    async request<TReqData = unknown, TResData = unknown>(
      requestConfig: RequestConfig<TReqData>
    ): Promise<ResponseData<TResData>> {
      const axiosConfig = toAxiosConfig(requestConfig);
      
      try {
        const response = await instance.request<TResData>(axiosConfig);
        return fromAxiosResponse(response, requestConfig);
      } catch (error) {
        // Handle Axios errors
        if (isAxiosError(error)) {
          // HTTP error (4xx/5xx)
          if (error.response) {
            throw new HttpError(
              `HTTP Error: ${error.response.status} ${error.response.statusText}`,
              error.response.status,
              error.response.statusText,
              requestConfig,
              fromAxiosResponse(error.response, requestConfig)
            );
          }
          
          // Timeout
          if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
            throw new TimeoutError(
              error.message || `Request timeout after ${requestConfig.timeout}ms`,
              requestConfig.timeout || 0,
              requestConfig
            );
          }
          
          // Canceled
          if (error.code === 'ERR_CANCELED') {
            throw new AbortError('Request aborted', requestConfig);
          }
          
          // Network error
          if (error.code === 'ERR_NETWORK' || !error.response) {
            throw new NetworkError(
              error.message || 'Network error',
              requestConfig,
              error
            );
          }
        }
        
        // Normalize other errors
        throw normalizeError(error, requestConfig);
      }
    },
  };
}

/**
 * Check if error is AxiosError
 */
function isAxiosError(error: unknown): error is AxiosError {
  return (
    error !== null &&
    typeof error === 'object' &&
    'isAxiosError' in error &&
    (error as AxiosError).isAxiosError === true
  );
}

/**
 * 从 Axios 实例创建适配器的快捷方法
 * 
 * @param instance Axios 实例
 * @returns HttpAdapter 实例
 */
export function axiosAdapter(instance: AxiosInstance): HttpAdapter {
  return createAxiosAdapter({ instance });
}
