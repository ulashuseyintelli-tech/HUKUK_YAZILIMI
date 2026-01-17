/**
 * Mock Trace Client
 * 
 * For testing SDK consumers.
 * Same interface as real client.
 */

import type { TraceBundle, TraceSummary, TraceFilters, PaginatedTraceList } from '../types/trace';
import type { TraceOptions } from '../clients/trace-client';
import { SdkError, SdkNotFoundError } from '../errors/sdk-error';

export interface MockTraceCall {
  readonly method: 'getTrace' | 'listRecent' | 'getSummary';
  readonly args: unknown[];
  readonly timestamp: number;
}

export interface MockTraceConfig {
  /** Traces by ID */
  readonly traces?: ReadonlyMap<string, TraceBundle>;
  /** Default trace list response */
  readonly traceList?: PaginatedTraceList;
  /** Error to throw on all calls */
  readonly error?: SdkError;
  /** Delay before responding (ms) */
  readonly delayMs?: number;
}

/**
 * Mock Trace Client for testing.
 */
export class MockTraceClient {
  private readonly config: MockTraceConfig;
  private readonly calls: MockTraceCall[] = [];

  constructor(config: MockTraceConfig = {}) {
    this.config = config;
  }

  /**
   * Get trace by ID (mock).
   */
  async getTrace(traceId: string, options?: TraceOptions): Promise<TraceBundle> {
    this.calls.push({
      method: 'getTrace',
      args: [traceId, options],
      timestamp: Date.now(),
    });

    if (options?.signal?.aborted) {
      throw new Error('Request cancelled');
    }

    if (this.config.delayMs) {
      await this.delay(this.config.delayMs);
    }

    if (this.config.error) {
      throw this.config.error;
    }

    const trace = this.config.traces?.get(traceId);
    if (!trace) {
      throw new SdkNotFoundError(
        `Trace not found: ${traceId}`,
        { resourceType: 'trace', resourceId: traceId }
      );
    }

    return trace;
  }

  /**
   * List recent traces (mock).
   */
  async listRecent(
    filters?: TraceFilters,
    options?: TraceOptions
  ): Promise<PaginatedTraceList> {
    this.calls.push({
      method: 'listRecent',
      args: [filters, options],
      timestamp: Date.now(),
    });

    if (options?.signal?.aborted) {
      throw new Error('Request cancelled');
    }

    if (this.config.delayMs) {
      await this.delay(this.config.delayMs);
    }

    if (this.config.error) {
      throw this.config.error;
    }

    return this.config.traceList ?? this.generateDefaultTraceList();
  }

  /**
   * Get trace summary (mock).
   */
  async getSummary(traceId: string, options?: TraceOptions): Promise<TraceSummary> {
    this.calls.push({
      method: 'getSummary',
      args: [traceId, options],
      timestamp: Date.now(),
    });

    if (options?.signal?.aborted) {
      throw new Error('Request cancelled');
    }

    if (this.config.delayMs) {
      await this.delay(this.config.delayMs);
    }

    if (this.config.error) {
      throw this.config.error;
    }

    const trace = this.config.traces?.get(traceId);
    if (!trace) {
      throw new SdkNotFoundError(
        `Trace not found: ${traceId}`,
        { resourceType: 'trace', resourceId: traceId }
      );
    }

    return {
      traceId: trace.meta.traceId,
      tenantId: trace.meta.tenantId,
      status: trace.result.status,
      timestamp: trace.meta.startedAt,
      durationMs: trace.meta.durationMs,
      endpoint: trace.meta.endpoint,
    };
  }

  /**
   * Get all recorded calls.
   */
  getCalls(): readonly MockTraceCall[] {
    return this.calls;
  }

  /**
   * Get call count.
   */
  getCallCount(): number {
    return this.calls.length;
  }

  /**
   * Reset mock state.
   */
  reset(): void {
    this.calls.length = 0;
  }

  /**
   * Generate default trace list.
   */
  private generateDefaultTraceList(): PaginatedTraceList {
    return {
      items: [],
      totalCount: 0,
      hasMore: false,
    };
  }

  /**
   * Delay helper.
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Create mock trace client with fixtures.
 */
export function createMockTraceClient(
  traces?: Map<string, TraceBundle>
): MockTraceClient {
  if (traces) {
    return new MockTraceClient({ traces });
  }
  return new MockTraceClient();
}

/**
 * Create mock trace client that always throws.
 */
export function createErrorTraceClient(error: SdkError): MockTraceClient {
  return new MockTraceClient({ error });
}

/**
 * Create a mock trace bundle.
 */
export function createMockTraceBundle(traceId: string, tenantId: string): TraceBundle {
  const now = new Date().toISOString();
  return {
    meta: {
      traceId,
      requestId: `req-${traceId}`,
      tenantId,
      endpoint: '/calc/preview/light',
      mode: 'PREVIEW',
      startedAt: now,
      finishedAt: now,
      durationMs: 100,
      version: {
        service: '0.1.0',
      },
    },
    input: {
      fingerprint: `fp-${traceId}`,
      normalizedSummary: {
        principalAmount: 100000,
        currency: 'TRY',
      },
    },
    cache: {
      hits: 1,
      misses: 0,
      staleServed: 0,
      byNamespace: {},
    },
    circuitBreaker: {
      byDependency: {},
      events: [],
    },
    rateLimit: {
      applied: false,
    },
    dependencies: [],
    policy: {},
    warnings: [],
    result: {
      status: 'OK',
    },
  };
}
