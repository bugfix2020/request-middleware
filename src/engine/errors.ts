/**
 * Unified Error Handling Module
 */

import type { RequestConfig, ResponseData } from './middlewareTypes';

/**
 * Error type enum
 */
export enum RequestErrorType {
  /** Network error */
  NETWORK = 'NETWORK',
  /** Request timeout */
  TIMEOUT = 'TIMEOUT',
  /** HTTP status error (4xx/5xx) */
  HTTP = 'HTTP',
  /** Request aborted */
  ABORTED = 'ABORTED',
  /** Response parse error */
  PARSE = 'PARSE',
  /** Unknown error */
  UNKNOWN = 'UNKNOWN',
}

/**
 * Base request error class
 */
export class RequestError extends Error {
  readonly type: RequestErrorType;
  readonly status?: number;
  readonly statusText?: string;
  readonly config?: RequestConfig;
  readonly response?: ResponseData;
  readonly cause?: Error;
  readonly timestamp: number;

  constructor(
    message: string,
    type: RequestErrorType,
    options?: {
      status?: number;
      statusText?: string;
      config?: RequestConfig;
      response?: ResponseData;
      cause?: Error;
    }
  ) {
    super(message);
    this.name = 'RequestError';
    this.type = type;
    this.status = options?.status;
    this.statusText = options?.statusText;
    this.config = options?.config;
    this.response = options?.response;
    this.cause = options?.cause;
    this.timestamp = Date.now();

    Object.setPrototypeOf(this, RequestError.prototype);
  }

  isNetworkError(): boolean {
    return this.type === RequestErrorType.NETWORK;
  }

  isTimeoutError(): boolean {
    return this.type === RequestErrorType.TIMEOUT;
  }

  isHttpError(): boolean {
    return this.type === RequestErrorType.HTTP;
  }

  isAbortedError(): boolean {
    return this.type === RequestErrorType.ABORTED;
  }

  /**
   * Check if error is retryable
   */
  isRetryable(): boolean {
    if (this.type === RequestErrorType.NETWORK) return true;
    if (this.type === RequestErrorType.TIMEOUT) return true;
    if (this.type === RequestErrorType.HTTP && this.status && this.status >= 500) return true;
    return false;
  }

  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      type: this.type,
      status: this.status,
      statusText: this.statusText,
      timestamp: this.timestamp,
      url: this.config?.url,
      method: this.config?.method,
    };
  }
}

/**
 * Network error
 */
export class NetworkError extends RequestError {
  constructor(message: string, config?: RequestConfig, cause?: Error) {
    super(message, RequestErrorType.NETWORK, { config, cause });
    this.name = 'NetworkError';
    Object.setPrototypeOf(this, NetworkError.prototype);
  }
}

/**
 * Timeout error
 */
export class TimeoutError extends RequestError {
  readonly timeout: number;

  constructor(message: string, timeout: number, config?: RequestConfig) {
    super(message, RequestErrorType.TIMEOUT, { config });
    this.name = 'TimeoutError';
    this.timeout = timeout;
    Object.setPrototypeOf(this, TimeoutError.prototype);
  }
}

/**
 * HTTP error (4xx/5xx)
 */
export class HttpError extends RequestError {
  constructor(
    message: string,
    status: number,
    statusText: string,
    config?: RequestConfig,
    response?: ResponseData
  ) {
    super(message, RequestErrorType.HTTP, { status, statusText, config, response });
    this.name = 'HttpError';
    Object.setPrototypeOf(this, HttpError.prototype);
  }

  isClientError(): boolean {
    return this.status !== undefined && this.status >= 400 && this.status < 500;
  }

  isServerError(): boolean {
    return this.status !== undefined && this.status >= 500;
  }
}

/**
 * Abort error
 */
export class AbortError extends RequestError {
  constructor(message: string = 'Request aborted', config?: RequestConfig) {
    super(message, RequestErrorType.ABORTED, { config });
    this.name = 'AbortError';
    Object.setPrototypeOf(this, AbortError.prototype);
  }
}

/**
 * Parse error
 */
export class ParseError extends RequestError {
  readonly rawResponse?: string;

  constructor(message: string, config?: RequestConfig, rawResponse?: string, cause?: Error) {
    super(message, RequestErrorType.PARSE, { config, cause });
    this.name = 'ParseError';
    this.rawResponse = rawResponse;
    Object.setPrototypeOf(this, ParseError.prototype);
  }
}

// ============================================================================
// Utility functions
// ============================================================================

/**
 * Normalize any error to RequestError
 */
export function normalizeError(error: unknown, config?: RequestConfig): RequestError {
  if (error instanceof RequestError) {
    return error;
  }

  // Handle DOMException (AbortError)
  if (error instanceof DOMException && error.name === 'AbortError') {
    return new AbortError('Request aborted', config);
  }

  // Handle TypeError (usually network error)
  if (error instanceof TypeError) {
    if (error.message.includes('fetch') || error.message.includes('network')) {
      return new NetworkError(error.message, config, error);
    }
  }

  // Handle standard Error
  if (error instanceof Error) {
    if (error.message.toLowerCase().includes('timeout')) {
      return new TimeoutError(error.message, config?.timeout || 0, config);
    }

    if (error.name === 'AbortError' || error.message.toLowerCase().includes('abort')) {
      return new AbortError(error.message, config);
    }

    if (
      error.message.toLowerCase().includes('network') ||
      error.message.toLowerCase().includes('failed to fetch') ||
      error.message.toLowerCase().includes('econnrefused')
    ) {
      return new NetworkError(error.message, config, error);
    }

    return new RequestError(error.message, RequestErrorType.UNKNOWN, {
      config,
      cause: error,
    });
  }

  return new RequestError(
    typeof error === 'string' ? error : 'Unknown error',
    RequestErrorType.UNKNOWN,
    { config }
  );
}

/**
 * Create HTTP error
 */
export function createHttpError(
  status: number,
  statusText: string,
  config?: RequestConfig,
  response?: ResponseData
): HttpError {
  const message = `HTTP Error: ${status} ${statusText}`;
  return new HttpError(message, status, statusText, config, response);
}

/**
 * Check if error is RequestError
 */
export function isRequestError(error: unknown): error is RequestError {
  return error instanceof RequestError;
}

/**
 * Check if error is retryable
 */
export function isRetryableError(error: unknown): boolean {
  if (error instanceof RequestError) {
    return error.isRetryable();
  }
  return false;
}
