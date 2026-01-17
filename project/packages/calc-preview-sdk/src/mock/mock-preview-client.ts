/**
 * Mock Preview Client
 * 
 * For testing SDK consumers.
 * Same interface as real client.
 */

import type { PreviewRequest, PreviewResponse, ResponseMeta } from '../types/preview';
import type { PreviewOptions, PreviewResult } from '../clients/preview-client';
import { SdkError } from '../errors/sdk-error';

export interface MockPreviewCall {
  readonly request: PreviewRequest;
  readonly options: PreviewOptions | undefined;
  readonly timestamp: number;
}

export interface MockPreviewConfig {
  /** Default response for all calls */
  readonly defaultResponse?: PreviewResponse;
  /** Sequence of responses (used in order) */
  readonly responseSequence?: readonly PreviewResponse[];
  /** Error to throw on all calls */
  readonly error?: SdkError;
  /** Delay before responding (ms) */
  readonly delayMs?: number;
}

/**
 * Mock Preview Client for testing.
 */
export class MockPreviewClient {
  private readonly config: MockPreviewConfig;
  private readonly calls: MockPreviewCall[] = [];
  private sequenceIndex = 0;

  constructor(config: MockPreviewConfig = {}) {
    this.config = config;
  }

  /**
   * Get preview (mock).
   */
  async getPreview(
    request: PreviewRequest,
    options?: PreviewOptions
  ): Promise<PreviewResult> {
    // Track call
    this.calls.push({
      request,
      options,
      timestamp: Date.now(),
    });

    // Check for cancellation
    if (options?.signal?.aborted) {
      throw new Error('Request cancelled');
    }

    // Simulate delay
    if (this.config.delayMs) {
      await this.delay(this.config.delayMs);
    }

    // Throw error if configured
    if (this.config.error) {
      throw this.config.error;
    }

    // Get response
    const response = this.getNextResponse(request);

    return { response, _meta: response._meta };
  }

  /**
   * Get all recorded calls.
   */
  getCalls(): readonly MockPreviewCall[] {
    return this.calls;
  }

  /**
   * Get call count.
   */
  getCallCount(): number {
    return this.calls.length;
  }

  /**
   * Get last call.
   */
  getLastCall(): MockPreviewCall | undefined {
    return this.calls[this.calls.length - 1];
  }

  /**
   * Reset mock state.
   */
  reset(): void {
    this.calls.length = 0;
    this.sequenceIndex = 0;
  }

  /**
   * Get next response from sequence or default.
   */
  private getNextResponse(request: PreviewRequest): PreviewResponse {
    if (this.config.responseSequence && this.config.responseSequence.length > 0) {
      const response = this.config.responseSequence[this.sequenceIndex];
      this.sequenceIndex = (this.sequenceIndex + 1) % this.config.responseSequence.length;
      if (response) return response;
    }

    if (this.config.defaultResponse) {
      return this.config.defaultResponse;
    }

    return this.generateDefaultResponse(request);
  }

  /**
   * Generate default mock response.
   */
  private generateDefaultResponse(request: PreviewRequest): PreviewResponse {
    const principal = request.principalAmount;
    const now = new Date().toISOString();

    const meta: ResponseMeta = {
      traceId: `mock-trace-${Date.now()}`,
      requestHash: `mock-hash-${Date.now()}`,
      serverVersion: '0.1.0',
      replay: false,
    };

    return {
      success: true,
      status: 'FULL',
      interest: {
        estimatedInterest: Math.floor(principal * 0.1),
        currentRate: 0.1,
        days: 30,
        interestType: request.interestType,
      },
      fee: {
        estimatedFees: Math.floor(principal * 0.05),
        estimatedAttorneyFee: Math.floor(principal * 0.02),
        tariffYear: 2024,
        breakdown: {
          basvurmaHarci: 100,
          vekaletHarci: 50,
          pesinHarc: 200,
          dosyaGideri: 30,
          tebligatGideri: 20,
          vekaletPulu: 10,
        },
      },
      policy: {
        passedGates: ['AMOUNT_CHECK', 'DATE_CHECK'],
        softWarnings: [],
        policyVersion: '1.0.0',
        explanations: [],
      },
      versions: {
        engineVersion: '0.1.0',
        ruleVersion: '1.0.0',
      },
      errors: [],
      warnings: [],
      uxGuidance: {
        blocking: false,
        recommendedAction: 'PROCEED',
      },
      cached: false,
      timestamp: now,
      _meta: meta,
    };
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export function createMockPreviewClient(fixture?: PreviewResponse): MockPreviewClient {
  if (fixture) {
    return new MockPreviewClient({ defaultResponse: fixture });
  }
  return new MockPreviewClient();
}

export function createErrorPreviewClient(error: SdkError): MockPreviewClient {
  return new MockPreviewClient({ error });
}
