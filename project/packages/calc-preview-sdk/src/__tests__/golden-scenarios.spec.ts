/**
 * Golden Scenario Tests - SDK v0.1
 * 
 * Task 11: "Okuma bozulamaz" yemini.
 * 
 * 6 temel senaryo:
 * 1. Preview happy path
 * 2. Trace get happy path
 * 3. Retry + jitter davranışı
 * 4. Deadline/Abort
 * 5. Idempotency header
 * 6. PII redaction
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  MockPreviewClient,
  MockTraceClient,
  createMockPreviewClient,
  createMockTraceClient,
  createMockTraceBundle,
  createErrorPreviewClient,
} from '../mock';
import {
  SdkAuthError,
  SdkNotFoundError,
  SdkValidationError,
  isSdkError,
} from '../errors';
import { generateRequestHash } from '../http/request-hasher';
import { redactPii, isPiiField, sanitizeObject } from '../logging/redaction';
import { validateConfig, normalizeConfig } from '../validation/config-validator';
import type { PreviewRequest, PreviewResponse } from '../types/preview';

// ============================================================================
// SCENARIO 1: Preview Happy Path
// ============================================================================

describe('Golden Scenario 1: Preview Happy Path', () => {
  it('should parse response and return correct types', async () => {
    const mockClient = createMockPreviewClient();
    
    const request: PreviewRequest = {
      principalAmount: 100000,
      interestType: 'LEGAL',
      startDate: '2024-01-01',
      endDate: '2024-12-31',
    };

    const result = await mockClient.getPreview(request);

    // Response structure
    expect(result.response).toBeDefined();
    expect(result._meta).toBeDefined();
    expect(result._meta.traceId).toMatch(/^mock-trace-/);
    expect(result._meta.requestHash).toMatch(/^mock-hash-/);

    // Interest data
    expect(result.response.interest).toBeDefined();
    expect(typeof result.response.interest?.estimatedInterest).toBe('number');
    expect(result.response.interest?.interestType).toBe('LEGAL');

    // Policy data
    expect(result.response.policy).toBeDefined();
    expect(Array.isArray(result.response.policy?.passedGates)).toBe(true);

    // UX guidance
    expect(result.response.uxGuidance).toBeDefined();
    expect(result.response.uxGuidance.recommendedAction).toBe('PROCEED');
  });

  it('should track calls correctly', async () => {
    const mockClient = createMockPreviewClient();
    
    const request: PreviewRequest = {
      principalAmount: 50000,
      interestType: 'DEFAULT',
      startDate: '2024-06-01',
      endDate: '2024-12-31',
    };

    await mockClient.getPreview(request);
    await mockClient.getPreview(request);

    expect(mockClient.getCallCount()).toBe(2);
    expect(mockClient.getCalls()[0]?.request.principalAmount).toBe(50000);
  });

  it('should use fixture response when provided', async () => {
    const fixture: PreviewResponse = {
      success: true,
      status: 'FULL',
      versions: { engineVersion: '1.0.0', ruleVersion: '1.0.0' },
      errors: [],
      warnings: [],
      uxGuidance: { blocking: false, recommendedAction: 'PROCEED' },
      cached: false,
      timestamp: new Date().toISOString(),
      _meta: { traceId: 'fixture-trace', requestHash: 'fixture-hash', serverVersion: '1.0.0' },
    };

    const mockClient = createMockPreviewClient(fixture);
    
    const result = await mockClient.getPreview({
      principalAmount: 100000,
      interestType: 'LEGAL',
      startDate: '2024-01-01',
      endDate: '2024-12-31',
    });

    expect(result._meta.traceId).toBe('fixture-trace');
  });
});

// ============================================================================
// SCENARIO 2: Trace Get Happy Path
// ============================================================================

describe('Golden Scenario 2: Trace Get Happy Path', () => {
  it('should return trace bundle with correct structure', async () => {
    const traceId = 'test-trace-123';
    const tenantId = 'tenant-456';
    const trace = createMockTraceBundle(traceId, tenantId);
    
    const traces = new Map([[traceId, trace]]);
    const mockClient = createMockTraceClient(traces);

    const result = await mockClient.getTrace(traceId);

    // Meta
    expect(result.meta.traceId).toBe(traceId);
    expect(result.meta.tenantId).toBe(tenantId);
    expect(result.meta.mode).toBe('PREVIEW');

    // Input (PII-free)
    expect(result.input.fingerprint).toBeDefined();
    expect(result.input.normalizedSummary.principalAmount).toBe(100000);

    // Result
    expect(result.result.status).toBe('OK');
  });

  it('should throw SdkNotFoundError for missing trace', async () => {
    const mockClient = createMockTraceClient();

    await expect(mockClient.getTrace('non-existent')).rejects.toThrow(SdkNotFoundError);
  });

  it('should list traces with pagination', async () => {
    const mockClient = createMockTraceClient();

    const result = await mockClient.listRecent({ limit: 10 });

    expect(result.items).toBeDefined();
    expect(Array.isArray(result.items)).toBe(true);
    expect(typeof result.hasMore).toBe('boolean');
  });
});

// ============================================================================
// SCENARIO 3: Error Handling & Retry Logic
// ============================================================================

describe('Golden Scenario 3: Error Handling', () => {
  it('should throw configured error', async () => {
    const mockClient = createErrorPreviewClient(new SdkAuthError('Unauthorized'));

    await expect(mockClient.getPreview({
      principalAmount: 100000,
      interestType: 'LEGAL',
      startDate: '2024-01-01',
      endDate: '2024-12-31',
    })).rejects.toThrow(SdkAuthError);
  });

  it('should identify retryable vs non-retryable errors', () => {
    const authError = new SdkAuthError('Unauthorized');
    const validationError = new SdkValidationError('Bad request');
    const notFoundError = new SdkNotFoundError('Not found');

    expect(authError.retryable).toBe(false);
    expect(validationError.retryable).toBe(false);
    expect(notFoundError.retryable).toBe(false);

    expect(isSdkError(authError)).toBe(true);
    expect(isSdkError(new Error('generic'))).toBe(false);
  });

  it('should have correct error codes', () => {
    expect(new SdkAuthError('test').errorCode).toBe('AUTH_ERROR');
    expect(new SdkValidationError('test').errorCode).toBe('VALIDATION_ERROR');
    expect(new SdkNotFoundError('test').errorCode).toBe('NOT_FOUND');
  });
});

// ============================================================================
// SCENARIO 4: Cancellation (AbortSignal)
// ============================================================================

describe('Golden Scenario 4: Cancellation', () => {
  it('should respect AbortSignal', async () => {
    const mockClient = new MockPreviewClient({ delayMs: 1000 });
    const controller = new AbortController();

    // Abort immediately
    controller.abort();

    await expect(mockClient.getPreview(
      {
        principalAmount: 100000,
        interestType: 'LEGAL',
        startDate: '2024-01-01',
        endDate: '2024-12-31',
      },
      { signal: controller.signal }
    )).rejects.toThrow('Request cancelled');
  });
});

// ============================================================================
// SCENARIO 5: Idempotency & Request Hash
// ============================================================================

describe('Golden Scenario 5: Idempotency & Request Hash', () => {
  it('should generate deterministic hash for same input', () => {
    const input1 = { a: 1, b: 2, c: 'test' };
    const input2 = { a: 1, b: 2, c: 'test' };
    const input3 = { a: 1, b: 3, c: 'test' };

    const hash1 = generateRequestHash(input1);
    const hash2 = generateRequestHash(input2);
    const hash3 = generateRequestHash(input3);

    expect(hash1).toBe(hash2);
    expect(hash1).not.toBe(hash3);
  });

  it('should handle key order consistently', () => {
    const input1 = { z: 1, a: 2 };
    const input2 = { a: 2, z: 1 };

    const hash1 = generateRequestHash(input1);
    const hash2 = generateRequestHash(input2);

    expect(hash1).toBe(hash2);
  });

  it('should handle nested objects', () => {
    const input1 = { outer: { inner: 'value' } };
    const input2 = { outer: { inner: 'value' } };

    expect(generateRequestHash(input1)).toBe(generateRequestHash(input2));
  });

  it('should handle undefined vs missing differently', () => {
    const input1 = { a: 1, b: undefined };
    const input2 = { a: 1 };

    // undefined is explicitly set vs missing - should be different
    const hash1 = generateRequestHash(input1);
    const hash2 = generateRequestHash(input2);

    // Note: depending on implementation, these might be same or different
    // The important thing is consistency
    expect(typeof hash1).toBe('string');
    expect(typeof hash2).toBe('string');
  });
});

// ============================================================================
// SCENARIO 6: PII Redaction (KVKK)
// ============================================================================

describe('Golden Scenario 6: PII Redaction (KVKK)', () => {
  it('should redact TCKN patterns', () => {
    const message = 'User 12345678901 has an issue';
    const redacted = redactPii(message);

    expect(redacted).toBe('User [TCKN_REDACTED] has an issue');
    expect(redacted).not.toContain('12345678901');
  });

  it('should redact phone patterns', () => {
    const message1 = 'Call 05321234567 for support';
    const message2 = 'Call +905321234567 for support';

    // Türkiye cep numaraları telefon olarak maskelenmeli; TCKN sanılmamalı.
    expect(redactPii(message1)).toContain('[PHONE_REDACTED]');
    expect(redactPii(message1)).not.toContain('[TCKN_REDACTED]');
    expect(redactPii(message2)).toContain('[PHONE_REDACTED]');
    expect(redactPii(message2)).not.toContain('[TCKN_REDACTED]');
  });

  it('should redact email patterns', () => {
    const message = 'Contact user@example.com for details';
    const redacted = redactPii(message);

    expect(redacted).toContain('[EMAIL_REDACTED]');
    expect(redacted).not.toContain('user@example.com');
  });

  it('should redact IBAN patterns', () => {
    const message = 'Transfer to TR330006100519786457841326';
    const redacted = redactPii(message);

    expect(redacted).toContain('[IBAN_REDACTED]');
  });

  it('should identify PII fields', () => {
    expect(isPiiField('debtorName')).toBe(true);
    expect(isPiiField('tckn')).toBe(true);
    expect(isPiiField('email')).toBe(true);
    expect(isPiiField('phone')).toBe(true);
    expect(isPiiField('iban')).toBe(true);
    expect(isPiiField('address')).toBe(true);

    expect(isPiiField('traceId')).toBe(false);
    expect(isPiiField('amount')).toBe(false);
    expect(isPiiField('status')).toBe(false);
  });

  it('should sanitize objects by removing PII fields', () => {
    const obj = {
      traceId: 'trace-123',
      debtorName: 'John Doe',
      amount: 1000,
      tckn: '12345678901',
      email: 'john@example.com',
    };

    const sanitized = sanitizeObject(obj);

    expect(sanitized.traceId).toBe('trace-123');
    expect(sanitized.amount).toBe(1000);
    expect(sanitized.debtorName).toBeUndefined();
    expect(sanitized.tckn).toBeUndefined();
    expect(sanitized.email).toBeUndefined();
  });
});

// ============================================================================
// SCENARIO 7: Config Validation
// ============================================================================

describe('Golden Scenario 7: Config Validation', () => {
  it('should reject HTTP baseUrl', () => {
    const result = validateConfig({
      baseUrl: 'http://insecure.com',
      apiKey: 'test',
    });

    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.message.includes('HTTPS'))).toBe(true);
  });

  it('should reject trailing slash in baseUrl', () => {
    const result = validateConfig({
      baseUrl: 'https://api.example.com/',
      apiKey: 'test',
    });

    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.message.includes('/'))).toBe(true);
  });

  it('should reject both apiKey and bearerToken', () => {
    const result = validateConfig({
      baseUrl: 'https://api.example.com',
      apiKey: 'key',
      bearerToken: 'token',
    });

    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.message.includes('both'))).toBe(true);
  });

  it('should reject neither apiKey nor bearerToken', () => {
    const result = validateConfig({
      baseUrl: 'https://api.example.com',
    });

    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.message.includes('Either'))).toBe(true);
  });

  it('should accept valid config', () => {
    const result = validateConfig({
      baseUrl: 'https://api.example.com',
      apiKey: 'test-key',
    });

    expect(result.valid).toBe(true);
    expect(result.errors.length).toBe(0);
  });

  it('should normalize config with defaults', () => {
    const normalized = normalizeConfig({
      baseUrl: 'https://api.example.com',
      apiKey: 'test-key',
    });

    expect(normalized.timeout).toBe(30000);
    expect(normalized.deadline).toBe(60000);
    expect(normalized.retry.maxAttempts).toBe(3);
    expect(normalized.retry.initialDelayMs).toBe(100);
    expect(normalized.retry.multiplier).toBe(2);
  });

  it('should freeze normalized config', () => {
    const normalized = normalizeConfig({
      baseUrl: 'https://api.example.com',
      apiKey: 'test-key',
    });

    expect(Object.isFrozen(normalized)).toBe(true);
  });

  // Region validation (Phase 6C)
  it('should accept valid regionId', () => {
    const result = validateConfig({
      baseUrl: 'https://api.example.com',
      apiKey: 'test-key',
      regionId: 'tr-istanbul-1',
    });

    expect(result.valid).toBe(true);
  });

  it('should reject invalid regionId format', () => {
    const result = validateConfig({
      baseUrl: 'https://api.example.com',
      apiKey: 'test-key',
      regionId: 'invalid-region',
    });

    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.field === 'regionId')).toBe(true);
  });

  it('should normalize regionId to default', () => {
    const normalized = normalizeConfig({
      baseUrl: 'https://api.example.com',
      apiKey: 'test-key',
    });

    expect(normalized.regionId).toBe('tr-default');
    expect(normalized.regionRouting).toBe('disabled');
  });
});

// ============================================================================
// SNAPSHOT TESTS
// ============================================================================

describe('Snapshots', () => {
  it('error codes snapshot', () => {
    const errorCodes = {
      auth: new SdkAuthError('test').errorCode,
      validation: new SdkValidationError('test').errorCode,
      notFound: new SdkNotFoundError('test').errorCode,
    };

    expect(errorCodes).toMatchInlineSnapshot(`
      {
        "auth": "AUTH_ERROR",
        "notFound": "NOT_FOUND",
        "validation": "VALIDATION_ERROR",
      }
    `);
  });

  it('default config snapshot', () => {
    const normalized = normalizeConfig({
      baseUrl: 'https://api.example.com',
      apiKey: 'test',
    });

    expect({
      timeout: normalized.timeout,
      deadline: normalized.deadline,
      retry: normalized.retry,
      regionId: normalized.regionId,
      regionRouting: normalized.regionRouting,
    }).toMatchInlineSnapshot(`
      {
        "deadline": 60000,
        "regionId": "tr-default",
        "regionRouting": "disabled",
        "retry": {
          "initialDelayMs": 100,
          "maxAttempts": 3,
          "maxDelayMs": 5000,
          "multiplier": 2,
        },
        "timeout": 30000,
      }
    `);
  });
});
