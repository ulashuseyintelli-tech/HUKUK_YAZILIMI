/**
 * HTTP Client
 * 
 * Fetch wrapper with timeout, retry, and idempotency support.
 */

import type { SdkConfig, SafeLogMeta } from '../types/config';
import { 
  SdkError,
  SdkCancelledError,
  mapHttpStatusToError,
  mapNetworkError,
} from '../errors';
import { withRetry } from './retry-handler';
import { generateRequestHash } from './request-hasher';
import { HEADER_NAMES } from '../constants';

export interface HttpClientConfig {
  readonly baseUrl: string;
  readonly apiKey?: string;
  readonly bearerToken?: string;
  readonly timeout: number;
  readonly deadline: number;
  readonly retry: Required<NonNullable<SdkConfig['retry']>>;
  readonly headers?: Readonly<Record<string, string>>;
  readonly logger?: (level: string, message: string, meta?: SafeLogMeta) => void;
}

export interface RequestOptions {
  readonly method: 'GET' | 'POST';
  readonly path: string;
  readonly body?: Record<string, unknown>;
  readonly query?: Record<string, string | number | boolean | undefined>;
  readonly idempotencyKey?: string;
  readonly signal?: AbortSignal;
}

export interface HttpResponse<T> {
  readonly data: T;
  readonly status: number;
  readonly headers: Headers;
  readonly traceId?: string;
  readonly requestHash: string;
  readonly replay: boolean;
  readonly attempts: number;
  readonly totalTimeMs: number;
}

/**
 * HTTP Client with retry and timeout support.
 */
export class HttpClient {
  private readonly config: HttpClientConfig;

  constructor(config: HttpClientConfig) {
    this.config = config;
  }

  /**
   * Make HTTP request with retry and timeout.
   */
  async request<T>(options: RequestOptions): Promise<HttpResponse<T>> {
    const startTime = Date.now();
    const requestHash = options.body 
      ? generateRequestHash(options.body)
      : generateRequestHash({ path: options.path, query: options.query });

    const idempotencyKey = options.idempotencyKey ?? requestHash;

    // Build URL
    const url = this.buildUrl(options.path, options.query);

    // Build headers
    const headers = this.buildHeaders(idempotencyKey, requestHash);

    // Create abort controller for per-attempt timeout
    const createAttemptController = (signal?: AbortSignal) => {
      const controller = new AbortController();
      
      // Link to external signal
      if (signal) {
        if (signal.aborted) {
          controller.abort();
        } else {
          signal.addEventListener('abort', () => controller.abort(), { once: true });
        }
      }

      // Per-attempt timeout
      const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);
      
      return {
        controller,
        cleanup: () => clearTimeout(timeoutId),
      };
    };

    // Execute with retry
    const result = await withRetry(
      async () => {
        const { controller, cleanup } = createAttemptController(options.signal);
        
        try {
          const response = await fetch(url, {
            method: options.method,
            headers,
            body: options.body ? JSON.stringify(options.body) : undefined,
            signal: controller.signal,
          });

          cleanup();

          // Parse response
          const data = await this.parseResponse<T>(response);

          // Check for error status
          if (!response.ok) {
            throw mapHttpStatusToError(response.status, data);
          }

          return {
            data,
            status: response.status,
            headers: response.headers,
          };
        } catch (error) {
          cleanup();
          
          // Handle abort
          if ((error as Error).name === 'AbortError') {
            if (options.signal?.aborted) {
              throw new SdkCancelledError('Request cancelled');
            }
            // Per-attempt timeout
            throw mapNetworkError(new Error('Request timed out'));
          }

          // Handle network errors
          if (error instanceof TypeError) {
            throw mapNetworkError(error);
          }

          throw error;
        }
      },
      {
        config: this.config.retry,
        deadline: this.config.deadline,
        startTime,
        signal: options.signal,
        onRetry: (attempt, error, _delayMs) => {
          this.log('warn', `Retry attempt ${attempt}`, {
            requestHash,
            attempt,
            errorCode: (error as SdkError).errorCode,
            durationMs: Date.now() - startTime,
          });
        },
      },
    );

    // Extract trace ID from response headers
    const traceId = result.result.headers.get(HEADER_NAMES.TRACE_ID) ?? undefined;
    const replay = result.result.headers.get(HEADER_NAMES.REPLAY) === 'true';

    return {
      data: result.result.data,
      status: result.result.status,
      headers: result.result.headers,
      traceId,
      requestHash,
      replay,
      attempts: result.attempts,
      totalTimeMs: result.totalTimeMs,
    };
  }

  /**
   * Build full URL with query params.
   */
  private buildUrl(path: string, query?: Record<string, string | number | boolean | undefined>): string {
    const url = new URL(path, this.config.baseUrl);
    
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined) {
          url.searchParams.set(key, String(value));
        }
      }
    }

    return url.toString();
  }

  /**
   * Build request headers.
   */
  private buildHeaders(idempotencyKey: string, requestHash: string): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      [HEADER_NAMES.IDEMPOTENCY_KEY]: idempotencyKey,
      [HEADER_NAMES.REQUEST_HASH]: requestHash,
      [HEADER_NAMES.SDK_VERSION]: '0.1.0',
    };

    // Auth
    if (this.config.apiKey) {
      headers['X-API-Key'] = this.config.apiKey;
    } else if (this.config.bearerToken) {
      headers['Authorization'] = `Bearer ${this.config.bearerToken}`;
    }

    // Custom headers
    if (this.config.headers) {
      Object.assign(headers, this.config.headers);
    }

    return headers;
  }

  /**
   * Parse response body.
   */
  private async parseResponse<T>(response: Response): Promise<T> {
    const contentType = response.headers.get('content-type');
    
    if (contentType?.includes('application/json')) {
      return response.json() as Promise<T>;
    }

    // Non-JSON response
    const text = await response.text();
    return { message: text } as T;
  }

  /**
   * Log with PII-safe metadata.
   */
  private log(level: string, message: string, meta?: SafeLogMeta): void {
    this.config.logger?.(level, message, meta);
  }
}
