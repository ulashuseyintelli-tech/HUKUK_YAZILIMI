# @hukuk/calc-preview-sdk

Read-only SDK for CalcPreview API. Preview + Trace access. No writes, no side effects.

## Installation

```bash
pnpm add @hukuk/calc-preview-sdk
```

## Quick Start

```typescript
import { CalcPreviewSdk } from '@hukuk/calc-preview-sdk';

const sdk = new CalcPreviewSdk({
  baseUrl: 'https://api.example.com',
  apiKey: 'your-api-key',
});

// Get calculation preview
const { response, _meta } = await sdk.preview.getPreview({
  principalAmount: 100000,
  interestType: 'LEGAL',
  startDate: '2024-01-01',
  endDate: '2024-12-31',
});

console.log('Interest:', response.interest?.estimatedInterest);
console.log('Trace ID:', _meta.traceId);
```

## Configuration

```typescript
const sdk = new CalcPreviewSdk({
  // Required
  baseUrl: 'https://api.example.com',  // HTTPS only, no trailing slash
  
  // Auth (one required)
  apiKey: 'your-api-key',              // XOR
  bearerToken: 'your-bearer-token',    // XOR
  
  // Timeouts (optional)
  timeout: 30000,                      // Per-attempt timeout (ms)
  deadline: 60000,                     // Overall deadline (ms)
  
  // Retry (optional)
  retry: {
    maxAttempts: 3,
    initialDelayMs: 100,
    maxDelayMs: 5000,
    multiplier: 2,
  },
  
  // Logging (optional)
  logging: {
    enabled: true,
    level: 'info',  // 'debug' | 'info' | 'warn' | 'error'
  },
  
  // Region (optional, Phase 6C)
  regionId: 'tr-default',              // Default region
  regionRouting: 'disabled',           // Only 'disabled' for now
});
```

## Preview Client

```typescript
// Basic preview
const result = await sdk.preview.getPreview({
  principalAmount: 100000,
  interestType: 'LEGAL',
  startDate: '2024-01-01',
  endDate: '2024-12-31',
});

// With options
const result = await sdk.preview.getPreview(request, {
  idempotencyKey: 'unique-key',
  signal: abortController.signal,
});
```

## Trace Client

```typescript
// Get trace by ID
const trace = await sdk.trace.getTrace('trace-id');

// List recent traces
const list = await sdk.trace.listRecent({
  status: 'OK',
  limit: 20,
});

// Get trace summary
const summary = await sdk.trace.getSummary('trace-id');
```

## Error Handling

```typescript
import { 
  isSdkError,
  SdkAuthError,
  SdkValidationError,
  SdkNotFoundError,
  SdkTimeoutError,
  SdkCancelledError,
} from '@hukuk/calc-preview-sdk';

try {
  const result = await sdk.preview.getPreview(request);
} catch (error) {
  if (!isSdkError(error)) throw error;
  
  if (error.retryable) {
    // Network, server, rate limit errors
    console.log('Retryable error:', error.errorCode);
  } else {
    // Auth, validation, not found, timeout, cancelled
    console.log('Fatal error:', error.errorCode);
  }
}
```

### Error Types

| Error | Code | Retryable | Description |
|-------|------|-----------|-------------|
| SdkNetworkError | NETWORK_ERROR | Yes | Connection failed |
| SdkServerError | SERVER_ERROR | Yes | 5xx response |
| SdkRateLimitError | RATE_LIMITED | Yes | 429 response |
| SdkAuthError | AUTH_ERROR | No | 401/403 response |
| SdkValidationError | VALIDATION_ERROR | No | 400 response |
| SdkNotFoundError | NOT_FOUND | No | 404 response |
| SdkConfigError | CONFIG_ERROR | No | Invalid config |
| SdkTimeoutError | TIMEOUT | No | Deadline exceeded |
| SdkCancelledError | CANCELLED | No | AbortSignal triggered |

## Cancellation

```typescript
const controller = new AbortController();

// Cancel after 5 seconds
setTimeout(() => controller.abort(), 5000);

try {
  const result = await sdk.preview.getPreview(request, {
    signal: controller.signal,
  });
} catch (error) {
  if (error instanceof SdkCancelledError) {
    console.log('Request was cancelled');
  }
}
```

## Mock Client (Testing)

```typescript
import { 
  MockPreviewClient, 
  MockTraceClient,
  createMockPreviewClient,
  createMockTraceBundle,
} from '@hukuk/calc-preview-sdk';

// Simple mock
const mockPreview = createMockPreviewClient();
const result = await mockPreview.getPreview(request);

// With fixture
const mockPreview = createMockPreviewClient(fixtureResponse);

// Error mock
const mockPreview = createErrorPreviewClient(new SdkAuthError('Unauthorized'));

// Call tracking
console.log('Calls:', mockPreview.getCalls());
console.log('Call count:', mockPreview.getCallCount());
mockPreview.reset();
```

## PII Safety

SDK logging is PII-safe by design:
- Only allowlist fields logged (SafeLogMeta)
- No raw payloads
- Automatic redaction of TCKN, phone, email, IBAN patterns

## Version

```typescript
import { SDK_VERSION, CalcPreviewSdk } from '@hukuk/calc-preview-sdk';

console.log(SDK_VERSION);           // '0.1.0'
console.log(CalcPreviewSdk.version); // '0.1.0'
```

## License

UNLICENSED

---

## Compatibility Matrix

| SDK Version | API Min Version | Trace Schema | Contract Version |
|-------------|-----------------|--------------|------------------|
| 0.1.x       | 1.0.0           | v1           | 2024.01          |

## Breaking Change Policy

This SDK follows [Semantic Versioning](https://semver.org/):

- **MAJOR** (1.0.0 → 2.0.0): Breaking changes to public API
- **MINOR** (1.0.0 → 1.1.0): New features, backward compatible
- **PATCH** (1.0.0 → 1.0.1): Bug fixes, backward compatible

Breaking changes include:
- Removing or renaming public types/methods
- Changing method signatures
- Changing error types for existing scenarios
- Changing default configuration values

Non-breaking changes include:
- Adding new optional fields to types
- Adding new error types
- Adding new methods
- Performance improvements

## Changelog

### PR-1 (2026-02-06) — Security Hardening

**BREAKING: `/calc/trace/*` endpoints now require internal ops auth.**

All trace endpoints (`getTrace`, `listRecent`, `getSummary`, download) now
require `break-glass` feature flag to be enabled AND the caller's JWT to
carry the `ops_admin` role. Without this, the API returns 401 or 403.

**Impact on SDK users:**
- `TraceClient` sends `Authorization: Bearer <token>` from `config.bearerToken`.
- If the token's JWT does not include `ops_admin` role → `SdkAuthError` (401/403).
- `PreviewClient` is NOT affected — `POST /calc/preview/light` remains public.

**Migration:**
- Ensure `bearerToken` is a JWT with `ops_admin` role for trace access.
- Or use `apiKey` auth if the API gateway maps it to an ops-level identity.
- Handle `SdkAuthError` gracefully for trace operations.
