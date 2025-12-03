/**
 * 重试中间件
 *
 * 提供自动重试功能，支持指数退避和自定义重试条件
 *
 * 注意：由于 compose 函数的防护机制不允许多次调用 next()，
 * 重试中间件采用包装 adapter 的方式实现重试逻辑。
 */

import type { Middleware, HttpContext, HttpAdapter, RequestConfig, ResponseData } from '../engine';
import { isRequestError, isRetryableError } from '../engine';

/**
 * 重试中间件配置
 */
export interface RetryMiddlewareOptions {
  /** 最大重试次数，默认 3 */
  maxRetries?: number;
  /** 退避策略：linear（线性）或 exponential（指数），默认 exponential */
  backoff?: 'linear' | 'exponential';
  /** 基础延迟时间（毫秒），默认 1000 */
  baseDelay?: number;
  /** 最大延迟时间（毫秒），默认 30000 */
  maxDelay?: number;
  /** 可重试的 HTTP 状态码，默认 [408, 429, 500, 502, 503, 504] */
  retryableStatusCodes?: number[];
  /** 自定义重试条件，返回 true 表示应该重试 */
  shouldRetry?: (error: unknown, attempt: number) => boolean;
  /** 重试前的回调 */
  onRetry?: (error: unknown, attempt: number) => void;
}

/**
 * 默认可重试的状态码
 */
const DEFAULT_RETRYABLE_STATUS_CODES = [408, 429, 500, 502, 503, 504];

/**
 * 计算延迟时间
 */
function calculateDelay(
  attempt: number,
  backoff: 'linear' | 'exponential',
  baseDelay: number,
  maxDelay: number
): number {
  let delay: number;

  if (backoff === 'exponential') {
    // 指数退避：baseDelay * 2^attempt + 随机抖动
    delay = baseDelay * Math.pow(2, attempt);
    // 添加 0-25% 的随机抖动，避免雷群效应
    delay += delay * Math.random() * 0.25;
  } else {
    // 线性退避：baseDelay * (attempt + 1)
    delay = baseDelay * (attempt + 1);
  }

  return Math.min(delay, maxDelay);
}

/**
 * 延迟函数
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 检查错误是否应该重试
 */
function checkShouldRetry(
  error: unknown,
  attempt: number,
  retryableStatusCodes: number[],
  customShouldRetry?: (error: unknown, attempt: number) => boolean
): boolean {
  // 优先使用自定义重试条件
  if (customShouldRetry) {
    return customShouldRetry(error, attempt);
  }

  // 使用默认重试逻辑
  if (isRequestError(error)) {
    // 中止错误不重试
    if (error.isAbortedError()) {
      return false;
    }
    // 检查 HTTP 状态码
    if (error.isHttpError() && error.status) {
      return retryableStatusCodes.includes(error.status);
    }
    // 检查是否为可重试错误类型（网络错误、超时等）
    return error.isRetryable();
  }

  // 非 RequestError，使用通用判断
  return isRetryableError(error);
}

/**
 * 创建带重试功能的适配器包装器
 */
export function createRetryAdapter(
  adapter: HttpAdapter,
  options: RetryMiddlewareOptions = {}
): HttpAdapter {
  const {
    maxRetries = 3,
    backoff = 'exponential',
    baseDelay = 1000,
    maxDelay = 30000,
    retryableStatusCodes = DEFAULT_RETRYABLE_STATUS_CODES,
    shouldRetry,
    onRetry,
  } = options;

  return {
    async request<TReqData = unknown, TResData = unknown>(
      config: RequestConfig<TReqData>
    ): Promise<ResponseData<TResData>> {
      let lastError: unknown;

      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          return await adapter.request<TReqData, TResData>(config);
        } catch (error) {
          lastError = error;

          // 最后一次尝试失败，直接抛出
          if (attempt === maxRetries) {
            throw error;
          }

          // 检查是否应该重试
          if (!checkShouldRetry(error, attempt, retryableStatusCodes, shouldRetry)) {
            throw error;
          }

          // 计算延迟时间
          const delay = calculateDelay(attempt, backoff, baseDelay, maxDelay);

          // 触发重试回调
          if (onRetry) {
            onRetry(error, attempt + 1);
          }

          // 等待后重试
          await sleep(delay);
        }
      }

      // 理论上不会到达这里，但为了类型安全
      throw lastError;
    },
  };
}

/**
 * 创建重试中间件
 *
 * 注意：此中间件在请求前记录重试配置到 ctx.state，
 * 实际的重试逻辑需要配合 createRetryAdapter 使用，
 * 或者使用 withRetry 高阶函数包装 httpClient。
 *
 * @param options 重试配置
 * @returns 中间件函数
 *
 * @example
 * ```ts
 * // 方式 1：使用 createRetryAdapter 包装适配器
 * const client = createHttpClient({
 *   adapter: createRetryAdapter(fetchAdapter(), {
 *     maxRetries: 3,
 *     backoff: 'exponential',
 *   }),
 * });
 *
 * // 方式 2：使用中间件记录重试信息（需配合自定义逻辑）
 * const client = createHttpClient({
 *   adapter: fetchAdapter(),
 *   middlewares: [createRetryMiddleware({ maxRetries: 3 })],
 * });
 * ```
 */
export function createRetryMiddleware(
  options: RetryMiddlewareOptions = {}
): Middleware<HttpContext> {
  const {
    maxRetries = 3,
    backoff = 'exponential',
    baseDelay = 1000,
    maxDelay = 30000,
    retryableStatusCodes = DEFAULT_RETRYABLE_STATUS_CODES,
    shouldRetry,
    onRetry,
  } = options;

  return async (ctx, next) => {
    // 将重试配置存储到 state 中，供其他中间件或适配器使用
    ctx.state.retryConfig = {
      maxRetries,
      backoff,
      baseDelay,
      maxDelay,
      retryableStatusCodes,
    };

    let attempt = 0;

    // 使用递归方式实现重试，避免多次调用 next()
    const executeWithRetry = async (): Promise<void> => {
      try {
        await next();
      } catch (error) {

        // 最后一次尝试失败，直接抛出
        if (attempt >= maxRetries) {
          throw error;
        }

        // 检查是否应该重试
        if (!checkShouldRetry(error, attempt, retryableStatusCodes, shouldRetry)) {
          throw error;
        }

        // 计算延迟时间
        const delay = calculateDelay(attempt, backoff, baseDelay, maxDelay);

        // 触发重试回调
        if (onRetry) {
          onRetry(error, attempt + 1);
        }

        // 在 ctx.state 中记录重试信息
        ctx.state.retryAttempt = attempt + 1;
        ctx.state.retryDelay = delay;

        // 重置响应和错误状态
        ctx.response = undefined;
        ctx.error = undefined;

        attempt++;

        // 等待后重试 - 但由于 compose 的限制，这里无法真正重试
        // 抛出错误让调用方知道需要重试
        await sleep(delay);

        // 由于 compose 不允许多次调用 next()，这里只能抛出错误
        // 实际重试需要在更高层实现
        throw error;
      }
    };

    await executeWithRetry();
  };
}

/**
 * 创建简单重试中间件的快捷方法
 *
 * @param maxRetries 最大重试次数
 * @returns 中间件函数
 */
export function retryMiddleware(maxRetries = 3): Middleware<HttpContext> {
  return createRetryMiddleware({ maxRetries });
}
