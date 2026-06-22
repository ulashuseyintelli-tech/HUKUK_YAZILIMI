/**
 * Preview Client
 * 
 * Read-only access to CalcPreview API.
 */

import type { PreviewRequest, PreviewResponse, ResponseMeta } from '../types/preview';
import type { SafeLogMeta } from '../types/config';
import { HttpClient } from '../http/http-client';
import { SdkValidationError } from '../errors/sdk-error';
import { API_PATHS } from '../constants';
import type { Logger } from '../logging/safe-logger';

export interface PreviewClientConfig {
  readonly httpClient: HttpClient;
  readonly logger: Logger;
}

export interface PreviewOptions {
  /** Custom idempotency key (defaults to request hash) */
  readonly idempotencyKey?: string;
  /** Abort signal for cancellation */
  readonly signal?: AbortSignal;
}

export interface PreviewResult {
  readonly response: PreviewResponse;
  readonly _meta: ResponseMeta;
}

/**
 * Preview Client - read-only preview access.
 */
export class PreviewClient {
  private readonly httpClient: HttpClient;
  private readonly logger: Logger;

  constructor(config: PreviewClientConfig) {
    this.httpClient = config.httpClient;
    this.logger = config.logger;
  }

  /**
   * Get calculation preview.
   * 
   * @param request - Preview request
   * @param options - Request options
   * @returns Preview response with metadata
   * @throws SdkValidationError if request is invalid
   * @throws SdkAuthError if authentication fails
   * @throws SdkServerError if server returns 5xx
   */
  async getPreview(
    request: PreviewRequest,
    options?: PreviewOptions
  ): Promise<PreviewResult> {
    // Validate request
    this.validateRequest(request);

    this.logger.debug('Requesting preview', {
      endpoint: API_PATHS.PREVIEW,
    });

    const result = await this.httpClient.request<PreviewResponse>({
      method: 'POST',
      path: API_PATHS.PREVIEW,
      body: this.serializeRequest(request),
      ...(options?.idempotencyKey !== undefined ? { idempotencyKey: options.idempotencyKey } : {}),
      ...(options?.signal ? { signal: options.signal } : {}),
    });

    this.logger.info('Preview completed', {
      requestHash: result.requestHash,
      durationMs: result.totalTimeMs,
      httpStatus: result.status,
      ...(result.traceId !== undefined ? { traceId: result.traceId } : {}),
    } satisfies SafeLogMeta);

    return {
      response: result.data,
      _meta: result.data._meta,
    };
  }

  /**
   * Validate preview request.
   */
  private validateRequest(request: PreviewRequest): void {
    const errors: Array<{ field: string; message: string }> = [];

    // principalAmount required and positive
    if (typeof request.principalAmount !== 'number') {
      errors.push({ field: 'principalAmount', message: 'principalAmount is required' });
    } else if (request.principalAmount <= 0) {
      errors.push({ field: 'principalAmount', message: 'principalAmount must be positive' });
    }

    // interestType required
    if (!request.interestType) {
      errors.push({ field: 'interestType', message: 'interestType is required' });
    }

    // startDate required
    if (!request.startDate) {
      errors.push({ field: 'startDate', message: 'startDate is required' });
    }

    // endDate required
    if (!request.endDate) {
      errors.push({ field: 'endDate', message: 'endDate is required' });
    }

    if (errors.length > 0) {
      throw new SdkValidationError(
        `Invalid preview request: ${errors[0]?.message}`,
        { validationErrors: errors }
      );
    }
  }

  /**
   * Serialize request for HTTP.
   */
  private serializeRequest(request: PreviewRequest): Record<string, unknown> {
    return {
      principalAmount: request.principalAmount,
      currency: request.currency ?? 'TRY',
      interestType: request.interestType,
      startDate: request.startDate,
      endDate: request.endDate,
      fixedRate: request.fixedRate,
      caseType: request.caseType,
      debtorCount: request.debtorCount,
      skipInterest: request.skipInterest,
      skipFee: request.skipFee,
      skipPolicy: request.skipPolicy,
    };
  }
}
