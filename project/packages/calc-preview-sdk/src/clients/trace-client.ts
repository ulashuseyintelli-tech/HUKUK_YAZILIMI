/**
 * Trace Client
 * 
 * Read-only access to trace data.
 */

import type { TraceBundle, TraceSummary, TraceFilters, PaginatedTraceList } from '../types/trace';
import type { SafeLogMeta } from '../types/config';
import { HttpClient } from '../http/http-client';
import { SdkValidationError, SdkNotFoundError } from '../errors/sdk-error';
import { API_PATHS, LIMITS } from '../constants';
import type { Logger } from '../logging/safe-logger';

export interface TraceClientConfig {
  readonly httpClient: HttpClient;
  readonly logger: Logger;
}

export interface TraceOptions {
  /** Abort signal for cancellation */
  readonly signal?: AbortSignal;
}

/**
 * Trace Client - read-only trace access.
 */
export class TraceClient {
  private readonly httpClient: HttpClient;
  private readonly logger: Logger;

  constructor(config: TraceClientConfig) {
    this.httpClient = config.httpClient;
    this.logger = config.logger;
  }

  /**
   * Get trace by ID.
   * 
   * @param traceId - Trace identifier
   * @param options - Request options
   * @returns Full trace bundle
   * @throws SdkNotFoundError if trace not found
   * @throws SdkAuthError if not authorized (RBAC)
   */
  async getTrace(traceId: string, options?: TraceOptions): Promise<TraceBundle> {
    if (!traceId || typeof traceId !== 'string') {
      throw new SdkValidationError('traceId is required and must be a string');
    }

    this.logger.debug('Fetching trace', {
      traceId,
    });

    try {
      const result = await this.httpClient.request<TraceBundle>({
        method: 'GET',
        path: `${API_PATHS.TRACE}/${traceId}`,
        ...(options?.signal ? { signal: options.signal } : {}),
      });

      this.logger.info('Trace fetched', {
        traceId,
        durationMs: result.totalTimeMs,
        httpStatus: result.status,
      } satisfies SafeLogMeta);

      return result.data;
    } catch (error) {
      // Enhance 404 with resource info
      if (error instanceof SdkNotFoundError) {
        throw new SdkNotFoundError(
          `Trace not found: ${traceId}`,
          { resourceType: 'trace', resourceId: traceId }
        );
      }
      throw error;
    }
  }

  /**
   * List recent traces with filters.
   * 
   * @param filters - Optional filters
   * @param options - Request options
   * @returns Paginated trace list
   */
  async listRecent(
    filters?: TraceFilters,
    options?: TraceOptions
  ): Promise<PaginatedTraceList> {
    const query = this.buildQuery(filters);

    this.logger.debug('Listing traces', {
      status: filters?.status,
    });

    const result = await this.httpClient.request<PaginatedTraceList>({
      method: 'GET',
      path: API_PATHS.TRACES,
      query,
      ...(options?.signal ? { signal: options.signal } : {}),
    });

    this.logger.info('Traces listed', {
      durationMs: result.totalTimeMs,
      httpStatus: result.status,
    } satisfies SafeLogMeta);

    return result.data;
  }

  /**
   * Get trace summary (lightweight).
   * 
   * @param traceId - Trace identifier
   * @param options - Request options
   * @returns Trace summary without full events
   */
  async getSummary(traceId: string, options?: TraceOptions): Promise<TraceSummary> {
    if (!traceId || typeof traceId !== 'string') {
      throw new SdkValidationError('traceId is required and must be a string');
    }

    this.logger.debug('Fetching trace summary', {
      traceId,
    });

    try {
      const result = await this.httpClient.request<TraceSummary>({
        method: 'GET',
        path: `${API_PATHS.TRACE}/${traceId}/summary`,
        ...(options?.signal ? { signal: options.signal } : {}),
      });

      return result.data;
    } catch (error) {
      if (error instanceof SdkNotFoundError) {
        throw new SdkNotFoundError(
          `Trace not found: ${traceId}`,
          { resourceType: 'trace', resourceId: traceId }
        );
      }
      throw error;
    }
  }

  /**
   * Build query params from filters.
   */
  private buildQuery(filters?: TraceFilters): Record<string, string | number | boolean | undefined> {
    if (!filters) return {};

    return {
      tenantId: filters.tenantId,
      status: filters.status,
      startDate: filters.startDate,
      endDate: filters.endDate,
      limit: Math.min(filters.limit ?? LIMITS.DEFAULT_TRACE_LIST_LIMIT, LIMITS.MAX_TRACE_LIST_LIMIT),
      cursor: filters.cursor,
    };
  }
}
