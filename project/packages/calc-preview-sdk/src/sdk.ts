/**
 * CalcPreview SDK
 * 
 * Read-only SDK for CalcPreview API.
 * Preview + Trace access. No writes, no side effects.
 * 
 * @example
 * ```typescript
 * const sdk = new CalcPreviewSdk({
 *   baseUrl: 'https://api.example.com',
 *   apiKey: 'your-api-key',
 * });
 * 
 * const { response, _meta } = await sdk.preview.getPreview({
 *   caseId: 'case-123',
 *   principalAmountMinor: 100000n,
 *   calculationDate: '2024-01-15',
 * });
 * ```
 */

import type { SdkConfig } from './types/config';
import { validateConfigOrThrow, normalizeConfig, type NormalizedConfig } from './validation/config-validator';
import { HttpClient } from './http/http-client';
import { PreviewClient } from './clients/preview-client';
import { TraceClient } from './clients/trace-client';
import { createSafeLogger, noopLogger, type Logger } from './logging/safe-logger';
import { SDK_VERSION } from './index';

/**
 * CalcPreview SDK - Read-only API access.
 * 
 * Provides:
 * - preview: PreviewClient for calculation previews
 * - trace: TraceClient for trace access
 * 
 * Guarantees:
 * - Read-only (no mutations)
 * - Type-safe responses
 * - Automatic retry with backoff
 * - Timeout/deadline enforcement
 * - PII-safe logging
 */
export class CalcPreviewSdk {
  /** SDK version */
  static readonly version = SDK_VERSION;

  /** Preview client for calculation previews */
  readonly preview: PreviewClient;

  /** Trace client for trace access */
  readonly trace: TraceClient;

  /** Frozen configuration */
  private readonly config: NormalizedConfig;

  /** Logger instance */
  private readonly logger: Logger;

  /**
   * Create SDK instance.
   * 
   * @param config - SDK configuration
   * @throws SdkConfigError if configuration is invalid
   */
  constructor(config: SdkConfig) {
    // Validate config (throws on invalid)
    validateConfigOrThrow(config);

    // Normalize and freeze config
    this.config = normalizeConfig(config);

    // Create logger
    this.logger = this.config.logging?.enabled 
      ? createSafeLogger(this.config.logging)
      : noopLogger;

    this.logger.info('SDK initialized', {
      endpoint: this.config.baseUrl,
    });

    // Create HTTP client
    const httpClient = new HttpClient({
      baseUrl: this.config.baseUrl,
      apiKey: this.config.apiKey,
      bearerToken: this.config.bearerToken,
      timeout: this.config.timeout,
      deadline: this.config.deadline,
      retry: this.config.retry,
      headers: this.config.headers,
      logger: (level, message, meta) => {
        switch (level) {
          case 'debug': this.logger.debug(message, meta); break;
          case 'info': this.logger.info(message, meta); break;
          case 'warn': this.logger.warn(message, meta); break;
          case 'error': this.logger.error(message, meta); break;
        }
      },
    });

    // Create clients
    this.preview = new PreviewClient({
      httpClient,
      logger: this.logger,
    });

    this.trace = new TraceClient({
      httpClient,
      logger: this.logger,
    });
  }

  /**
   * Validate configuration without creating SDK instance.
   * Useful for config validation before construction.
   * 
   * @param config - Configuration to validate
   * @throws SdkConfigError if configuration is invalid
   */
  static validateConfig(config: SdkConfig): void {
    validateConfigOrThrow(config);
  }

  /**
   * Get SDK version.
   */
  getVersion(): string {
    return SDK_VERSION;
  }
}
