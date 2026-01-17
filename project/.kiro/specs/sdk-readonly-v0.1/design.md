# Design Document: SDK v0.1 (Read-Only)

## Overview

Bu tasarım, CalcPreview ve Trace verilerini dış tüketicilere güvenli, typed ve read-only şekilde sunan bir SDK tanımlar. SDK hiçbir hesaplama yapmaz, backend'in ürettiği gerçeği bozmadan taşır.

**Temel Prensip:** SDK = Backend'in aynası. Ekleme yok, çıkarma yok, dönüştürme yok.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              SDK Consumer                                    │
│                                                                              │
│  ┌─────────────────┐         ┌─────────────────┐                            │
│  │  PreviewClient  │         │   TraceClient   │                            │
│  │  .getPreview()  │         │  .getTrace()    │                            │
│  └────────┬────────┘         │  .listRecent()  │                            │
│           │                  └────────┬────────┘                            │
│           │                           │                                      │
│           └───────────┬───────────────┘                                      │
│                       │                                                      │
│              ┌────────▼────────┐                                            │
│              │   HttpClient    │  ← Shared, configured                      │
│              │  (fetch-based)  │                                            │
│              └────────┬────────┘                                            │
│                       │                                                      │
│              ┌────────▼────────┐                                            │
│              │  RetryHandler   │  ← Exponential backoff                     │
│              └────────┬────────┘                                            │
│                       │                                                      │
│              ┌────────▼────────┐                                            │
│              │  ErrorMapper    │  ← HTTP → SdkError                         │
│              └────────┬────────┘                                            │
│                       │                                                      │
└───────────────────────┼─────────────────────────────────────────────────────┘
                        │
                        │ HTTPS
                        ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Backend API                                     │
│                                                                              │
│  POST /calc/preview/light  ──►  CalcPreviewResponse                         │
│  GET  /calc/trace/:id      ──►  TraceBundle                                 │
│  GET  /calc/traces         ──►  PaginatedTraceList                          │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## State Diagram: SDK Client Lifecycle

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         SDK CLIENT STATE MACHINE                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│                    ┌──────────────┐                                         │
│                    │ UNINITIALIZED│                                         │
│                    └──────┬───────┘                                         │
│                           │                                                  │
│                           │ new CalcPreviewSdk(config)                      │
│                           │                                                  │
│                           ▼                                                  │
│                    ┌──────────────┐                                         │
│              ┌─────│  VALIDATING  │                                         │
│              │     └──────┬───────┘                                         │
│              │            │                                                  │
│     config   │            │ config valid                                    │
│     invalid  │            │                                                  │
│              │            ▼                                                  │
│              │     ┌──────────────┐                                         │
│              │     │    READY     │◄────────────────────┐                   │
│              │     └──────┬───────┘                     │                   │
│              │            │                             │                   │
│              │            │ client.method()             │                   │
│              │            │                             │                   │
│              │            ▼                             │                   │
│              │     ┌──────────────┐                     │                   │
│              │     │  REQUESTING  │                     │                   │
│              │     └──────┬───────┘                     │                   │
│              │            │                             │                   │
│              │     ┌──────┴──────┐                      │                   │
│              │     │             │                      │                   │
│              │     ▼             ▼                      │                   │
│              │  success       error                     │                   │
│              │     │             │                      │                   │
│              │     │      ┌──────┴──────┐               │                   │
│              │     │      │             │               │                   │
│              │     │      ▼             ▼               │                   │
│              │     │  retryable    non-retryable        │                   │
│              │     │      │             │               │                   │
│              │     │      │             │               │                   │
│              │     │      ▼             │               │                   │
│              │     │  ┌────────┐        │               │                   │
│              │     │  │RETRYING│        │               │                   │
│              │     │  └───┬────┘        │               │                   │
│              │     │      │             │               │                   │
│              │     │      │ max retries │               │                   │
│              │     │      │ exceeded    │               │                   │
│              │     │      │             │               │                   │
│              │     ▼      ▼             ▼               │                   │
│              │  ┌────────────────────────────┐          │                   │
│              │  │      RESPONSE/ERROR        │──────────┘                   │
│              │  └────────────────────────────┘                              │
│              │                                                               │
│              ▼                                                               │
│       ┌──────────────┐                                                      │
│       │    ERROR     │  (SdkValidationError: invalid config)                │
│       └──────────────┘                                                      │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘

State Transitions:
- UNINITIALIZED → VALIDATING: Constructor called
- VALIDATING → READY: Config valid
- VALIDATING → ERROR: Config invalid (terminal)
- READY → REQUESTING: Method called
- REQUESTING → READY: Success (returns data)
- REQUESTING → RETRYING: Retryable error
- RETRYING → REQUESTING: Retry attempt
- RETRYING → READY: Max retries (throws error)
- REQUESTING → READY: Non-retryable error (throws error)
```


## Error Taxonomy

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           ERROR TAXONOMY                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  SdkError (base)                                                            │
│  ├── errorCode: string                                                      │
│  ├── message: string                                                        │
│  ├── retryable: boolean                                                     │
│  └── httpStatus?: number                                                    │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                    RETRYABLE ERRORS                                  │    │
│  │                    (retry: true)                                     │    │
│  ├─────────────────────────────────────────────────────────────────────┤    │
│  │                                                                      │    │
│  │  SdkNetworkError                                                     │    │
│  │  ├── HTTP: connection refused, timeout, DNS failure                  │    │
│  │  ├── Action: Retry with backoff                                      │    │
│  │  └── Max retries: 3                                                  │    │
│  │                                                                      │    │
│  │  SdkServerError                                                      │    │
│  │  ├── HTTP: 500, 502, 503, 504                                        │    │
│  │  ├── Action: Retry with backoff                                      │    │
│  │  └── Max retries: 3                                                  │    │
│  │                                                                      │    │
│  │  SdkRateLimitError                                                   │    │
│  │  ├── HTTP: 429                                                       │    │
│  │  ├── Action: Retry after Retry-After header                          │    │
│  │  └── Max retries: 3                                                  │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                  NON-RETRYABLE ERRORS                                │    │
│  │                  (retry: false)                                      │    │
│  ├─────────────────────────────────────────────────────────────────────┤    │
│  │                                                                      │    │
│  │  SdkAuthError                                                        │    │
│  │  ├── HTTP: 401, 403                                                  │    │
│  │  ├── Action: Check credentials, do NOT retry                         │    │
│  │  └── Fatal: Yes (until credentials fixed)                            │    │
│  │                                                                      │    │
│  │  SdkValidationError                                                  │    │
│  │  ├── HTTP: 400                                                       │    │
│  │  ├── Action: Fix request, do NOT retry same request                  │    │
│  │  └── Fatal: No (fix and retry with different input)                  │    │
│  │                                                                      │    │
│  │  SdkNotFoundError                                                    │    │
│  │  ├── HTTP: 404                                                       │    │
│  │  ├── Action: Resource doesn't exist, do NOT retry                    │    │
│  │  └── Fatal: No (resource may appear later)                           │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                     FATAL ERRORS                                     │    │
│  │                     (SDK unusable)                                   │    │
│  ├─────────────────────────────────────────────────────────────────────┤    │
│  │                                                                      │    │
│  │  SdkConfigError                                                      │    │
│  │  ├── Cause: Invalid config at initialization                         │    │
│  │  ├── Action: Fix config, recreate SDK instance                       │    │
│  │  └── Fatal: Yes (SDK instance broken)                                │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Trace ID Lifecycle

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        TRACE ID LIFECYCLE                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  WHO GENERATES?                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ Backend (TraceContext) generates traceId on request start           │    │
│  │ Format: UUID v4 (e.g., "550e8400-e29b-41d4-a716-446655440000")       │    │
│  │ SDK NEVER generates traceId                                          │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  LIFECYCLE:                                                                  │
│                                                                              │
│  1. REQUEST PHASE                                                            │
│     ┌──────────────┐                                                        │
│     │ SDK Consumer │                                                        │
│     └──────┬───────┘                                                        │
│            │ previewClient.getPreview(request)                              │
│            │ (no traceId in request)                                        │
│            ▼                                                                 │
│     ┌──────────────┐                                                        │
│     │   Backend    │ ← Generates traceId here                               │
│     └──────┬───────┘                                                        │
│            │                                                                 │
│  2. RESPONSE PHASE                                                           │
│            │                                                                 │
│            ▼                                                                 │
│     ┌──────────────────────────────────────────────────────────────┐        │
│     │ CalcPreviewResponse                                           │        │
│     │ {                                                             │        │
│     │   ...data,                                                    │        │
│     │   requestHash: "abc123",                                      │        │
│     │   timestamp: "2026-01-16T...",                                │        │
│     │   _meta: {                                                    │        │
│     │     traceId: "550e8400-e29b-41d4-a716-446655440000" ← HERE    │        │
│     │   }                                                           │        │
│     │ }                                                             │        │
│     └──────────────────────────────────────────────────────────────┘        │
│            │                                                                 │
│  3. TRACE RETRIEVAL                                                          │
│            │                                                                 │
│            ▼                                                                 │
│     ┌──────────────┐                                                        │
│     │ SDK Consumer │                                                        │
│     │              │ traceClient.getTrace(response._meta.traceId)           │
│     └──────┬───────┘                                                        │
│            │                                                                 │
│            ▼                                                                 │
│     ┌──────────────┐                                                        │
│     │ TraceBundle  │ ← Full audit trail                                     │
│     └──────────────┘                                                        │
│                                                                              │
│  TRANSPORT:                                                                  │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ Request:  X-Request-Id header (optional, for correlation)           │    │
│  │ Response: X-Trace-Id header + _meta.traceId in body                 │    │
│  │ SDK extracts traceId from response, never generates                 │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  RETENTION:                                                                  │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ TraceBundle stored for 30 days (configurable)                       │    │
│  │ After retention: 404 NotFound                                       │    │
│  │ SDK handles 404 gracefully (SdkNotFoundError)                       │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```


## Configuration Model

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      CONFIGURATION MODEL                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  IMMUTABLE (set at construction, never changes)                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                                                                      │    │
│  │  baseUrl: string          // Required, validated                     │    │
│  │  ├── Must be HTTPS (HTTP rejected)                                   │    │
│  │  ├── Must be valid URL                                               │    │
│  │  └── No trailing slash                                               │    │
│  │                                                                      │    │
│  │  apiKey?: string          // Auth option 1                           │    │
│  │  bearerToken?: string     // Auth option 2 (mutually exclusive)      │    │
│  │                                                                      │    │
│  │  timeout: number          // Default: 30000ms                        │    │
│  │  ├── Min: 1000ms                                                     │    │
│  │  └── Max: 120000ms                                                   │    │
│  │                                                                      │    │
│  │  retry: RetryConfig       // Immutable after construction            │    │
│  │  ├── maxAttempts: 3                                                  │    │
│  │  ├── initialDelayMs: 100                                             │    │
│  │  ├── maxDelayMs: 5000                                                │    │
│  │  └── multiplier: 2                                                   │    │
│  │                                                                      │    │
│  │  headers: Record<string, string>  // Custom headers (immutable)      │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  WHY IMMUTABLE?                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ 1. Thread safety: No race conditions                                 │    │
│  │ 2. Predictability: Config doesn't change mid-request                 │    │
│  │ 3. Debugging: Config at error time = config at construction          │    │
│  │ 4. Security: Credentials can't be swapped after validation           │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  TO CHANGE CONFIG: Create new SDK instance                                   │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                                                                      │    │
│  │  // Wrong: sdk.config.timeout = 5000;  ← Compile error              │    │
│  │                                                                      │    │
│  │  // Right:                                                           │    │
│  │  const newSdk = new CalcPreviewSdk({                                 │    │
│  │    ...oldConfig,                                                     │    │
│  │    timeout: 5000,                                                    │    │
│  │  });                                                                 │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  VALIDATION (at construction)                                                │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                                                                      │    │
│  │  1. baseUrl required and valid HTTPS URL                             │    │
│  │  2. apiKey XOR bearerToken (not both, at least one)                  │    │
│  │  3. timeout in valid range                                           │    │
│  │  4. retry values positive                                            │    │
│  │                                                                      │    │
│  │  Invalid config → SdkConfigError (thrown in constructor)             │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Mock Implementation Fidelity

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    MOCK IMPLEMENTATION FIDELITY                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  WHAT MOCK DOES (faithful to real)                                           │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                                                                      │    │
│  │  ✅ Same interface as real client                                    │    │
│  │  ✅ Same return types                                                │    │
│  │  ✅ Same error types (SdkError hierarchy)                            │    │
│  │  ✅ Async behavior (returns Promise)                                 │    │
│  │  ✅ Type validation on input                                         │    │
│  │  ✅ Call tracking for assertions                                     │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  WHAT MOCK DOES NOT DO (simplified)                                          │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                                                                      │    │
│  │  ❌ Network calls (by design)                                        │    │
│  │  ❌ Retry logic (instant response)                                   │    │
│  │  ❌ Timeout simulation (unless explicitly configured)                │    │
│  │  ❌ Rate limiting                                                    │    │
│  │  ❌ Real latency                                                     │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  MOCK MODES                                                                  │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                                                                      │    │
│  │  1. FIXTURE MODE (default)                                           │    │
│  │     - Returns pre-configured responses                               │    │
│  │     - Matches by request hash or returns default                     │    │
│  │                                                                      │    │
│  │  2. ERROR MODE                                                       │    │
│  │     - Always throws specified error type                             │    │
│  │     - Useful for error handling tests                                │    │
│  │                                                                      │    │
│  │  3. SEQUENCE MODE                                                    │    │
│  │     - Returns responses in order                                     │    │
│  │     - Useful for retry testing                                       │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  FIDELITY BOUNDARY                                                           │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                                                                      │    │
│  │  Mock guarantees:                                                    │    │
│  │  - If mock.getPreview() returns X, real.getPreview() returns X      │    │
│  │    (given same backend state)                                        │    │
│  │                                                                      │    │
│  │  Mock does NOT guarantee:                                            │    │
│  │  - Timing behavior                                                   │    │
│  │  - Network failure patterns                                          │    │
│  │  - Backend state changes                                             │    │
│  │                                                                      │    │
│  │  For integration testing: Use real client against test backend       │    │
│  │  For unit testing: Use mock client                                   │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```


## Component Interfaces

### SdkConfig

```typescript
interface SdkConfig {
  /** API base URL (required, HTTPS only) */
  readonly baseUrl: string;
  
  /** API key authentication */
  readonly apiKey?: string;
  
  /** Bearer token authentication (mutually exclusive with apiKey) */
  readonly bearerToken?: string;
  
  /** Request timeout in ms (default: 30000, min: 1000, max: 120000) */
  readonly timeout?: number;
  
  /** Retry configuration */
  readonly retry?: RetryConfig;
  
  /** Custom headers */
  readonly headers?: Readonly<Record<string, string>>;
}

interface RetryConfig {
  /** Max retry attempts (default: 3) */
  readonly maxAttempts?: number;
  
  /** Initial delay in ms (default: 100) */
  readonly initialDelayMs?: number;
  
  /** Max delay in ms (default: 5000) */
  readonly maxDelayMs?: number;
  
  /** Backoff multiplier (default: 2) */
  readonly multiplier?: number;
}
```

### CalcPreviewSdk (Main Entry Point)

```typescript
class CalcPreviewSdk {
  readonly preview: PreviewClient;
  readonly trace: TraceClient;
  
  constructor(config: SdkConfig);
  
  /** Get SDK version */
  static readonly version: string;
  
  /** Validate config without creating instance */
  static validateConfig(config: SdkConfig): ValidationResult;
}
```

### PreviewClient

```typescript
interface PreviewClient {
  /**
   * Get calculation preview
   * @throws SdkNetworkError - Network failure (retryable)
   * @throws SdkAuthError - Authentication failed (not retryable)
   * @throws SdkValidationError - Invalid request (not retryable)
   * @throws SdkServerError - Server error (retryable)
   */
  getPreview(request: PreviewRequest): Promise<PreviewResponse>;
}

interface PreviewRequest {
  readonly principalAmount: number;
  readonly currency?: string;
  readonly interestType: InterestTypeCode;
  readonly startDate: string;
  readonly endDate: string;
  readonly fixedRate?: number;
  readonly caseType?: string;
  readonly debtorCount?: number;
  readonly skipInterest?: boolean;
  readonly skipFee?: boolean;
  readonly skipPolicy?: boolean;
}

interface PreviewResponse {
  readonly success: boolean;
  readonly status: 'FULL' | 'PARTIAL' | 'UNAVAILABLE';
  readonly interest?: InterestPreviewData;
  readonly fee?: FeePreviewData;
  readonly policy?: PolicyPreviewData;
  readonly versions: VersionInfo;
  readonly errors: readonly SdkResponseError[];
  readonly warnings: readonly SdkResponseWarning[];
  readonly uxGuidance: UxGuidance;
  readonly cached: boolean;
  readonly timestamp: string;
  readonly _meta: ResponseMeta;
}

interface ResponseMeta {
  readonly traceId: string;
  readonly requestHash: string;
  readonly serverVersion: string;
}
```

### TraceClient

```typescript
interface TraceClient {
  /**
   * Get trace bundle by ID
   * @throws SdkNotFoundError - Trace not found or expired
   */
  getTrace(traceId: string): Promise<TraceBundle>;
  
  /**
   * List recent traces with filters
   */
  listRecent(filters?: TraceFilters): Promise<PaginatedTraceList>;
}

interface TraceFilters {
  readonly tenantId?: string;
  readonly startDate?: string;
  readonly endDate?: string;
  readonly status?: TraceResultStatus;
  readonly limit?: number;
  readonly cursor?: string;
}

interface PaginatedTraceList {
  readonly items: readonly TraceSummary[];
  readonly nextCursor?: string;
  readonly hasMore: boolean;
  readonly totalCount?: number;
}

interface TraceSummary {
  readonly traceId: string;
  readonly tenantId: string;
  readonly timestamp: string;
  readonly status: TraceResultStatus;
  readonly durationMs: number;
}
```

### Error Classes

```typescript
abstract class SdkError extends Error {
  abstract readonly errorCode: string;
  abstract readonly retryable: boolean;
  readonly httpStatus?: number;
  readonly cause?: Error;
}

class SdkNetworkError extends SdkError {
  readonly errorCode = 'NETWORK_ERROR';
  readonly retryable = true;
}

class SdkAuthError extends SdkError {
  readonly errorCode = 'AUTH_ERROR';
  readonly retryable = false;
}

class SdkValidationError extends SdkError {
  readonly errorCode = 'VALIDATION_ERROR';
  readonly retryable = false;
  readonly validationErrors?: readonly ValidationError[];
}

class SdkServerError extends SdkError {
  readonly errorCode = 'SERVER_ERROR';
  readonly retryable = true;
}

class SdkNotFoundError extends SdkError {
  readonly errorCode = 'NOT_FOUND';
  readonly retryable = false;
}

class SdkRateLimitError extends SdkError {
  readonly errorCode = 'RATE_LIMITED';
  readonly retryable = true;
  readonly retryAfterMs?: number;
}

class SdkConfigError extends SdkError {
  readonly errorCode = 'CONFIG_ERROR';
  readonly retryable = false;
}
```

### Type Guards

```typescript
function isSdkError(e: unknown): e is SdkError;
function isSdkNetworkError(e: unknown): e is SdkNetworkError;
function isSdkAuthError(e: unknown): e is SdkAuthError;
function isSdkValidationError(e: unknown): e is SdkValidationError;
function isSdkServerError(e: unknown): e is SdkServerError;
function isSdkNotFoundError(e: unknown): e is SdkNotFoundError;
function isSdkRateLimitError(e: unknown): e is SdkRateLimitError;
function isSdkConfigError(e: unknown): e is SdkConfigError;
function isRetryableError(e: unknown): boolean;
```

## Retry Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           RETRY FLOW                                         │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  attempt = 1                                                                 │
│  delay = initialDelayMs (100ms)                                             │
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                                                                       │   │
│  │  LOOP:                                                                │   │
│  │    try {                                                              │   │
│  │      response = await fetch(...)                                      │   │
│  │      return parseResponse(response)                                   │   │
│  │    } catch (error) {                                                  │   │
│  │      if (!isRetryable(error)) throw error                            │   │
│  │      if (attempt >= maxAttempts) throw error                         │   │
│  │                                                                       │   │
│  │      // Exponential backoff with jitter                               │   │
│  │      await sleep(delay + random(0, delay * 0.1))                     │   │
│  │      delay = min(delay * multiplier, maxDelayMs)                     │   │
│  │      attempt++                                                        │   │
│  │    }                                                                  │   │
│  │                                                                       │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  TIMING EXAMPLE (default config):                                            │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                                                                       │   │
│  │  Attempt 1: immediate                                                 │   │
│  │  Attempt 2: ~100ms delay                                              │   │
│  │  Attempt 3: ~200ms delay                                              │   │
│  │                                                                       │   │
│  │  Total max wait: ~300ms + request times                               │   │
│  │                                                                       │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## File Structure

```
packages/
└── calc-preview-sdk/
    ├── package.json
    ├── tsconfig.json
    ├── README.md
    ├── src/
    │   ├── index.ts              # Public exports
    │   ├── sdk.ts                # CalcPreviewSdk class
    │   ├── clients/
    │   │   ├── preview-client.ts
    │   │   ├── trace-client.ts
    │   │   └── index.ts
    │   ├── http/
    │   │   ├── http-client.ts    # Fetch wrapper
    │   │   ├── retry-handler.ts
    │   │   └── index.ts
    │   ├── errors/
    │   │   ├── sdk-error.ts
    │   │   ├── error-mapper.ts   # HTTP → SdkError
    │   │   ├── type-guards.ts
    │   │   └── index.ts
    │   ├── types/
    │   │   ├── config.ts
    │   │   ├── preview.ts
    │   │   ├── trace.ts
    │   │   ├── enums.ts
    │   │   └── index.ts
    │   ├── mock/
    │   │   ├── mock-preview-client.ts
    │   │   ├── mock-trace-client.ts
    │   │   └── index.ts
    │   └── validation/
    │       ├── config-validator.ts
    │       └── index.ts
    └── tests/
        ├── unit/
        │   ├── preview-client.spec.ts
        │   ├── trace-client.spec.ts
        │   ├── retry-handler.spec.ts
        │   └── error-mapper.spec.ts
        └── integration/
            └── sdk-golden.spec.ts
```

## Correctness Properties

### Property 1: Read-Only Guarantee
*For any* SDK method call, the backend state SHALL NOT be modified.

### Property 2: Type Fidelity
*For any* successful response, SDK response type SHALL exactly match backend response type.

### Property 3: Error Transparency
*For any* backend error, SDK SHALL throw a corresponding typed SdkError without swallowing.

### Property 4: Retry Idempotency
*For any* retryable operation, multiple retry attempts SHALL produce the same final result as a single successful attempt.

### Property 5: Config Immutability
*For any* SDK instance, config values SHALL NOT change after construction.

## Testing Strategy

### Unit Tests
- Config validation (valid/invalid cases)
- Error mapping (HTTP status → SdkError)
- Retry logic (backoff timing, max attempts)
- Type guards (all error types)

### Integration Tests (Golden Scenarios)
- Happy path: getPreview → success
- Happy path: getTrace → success
- Error path: 401 → SdkAuthError
- Error path: 404 → SdkNotFoundError
- Retry path: 503 → retry → success

### Mock Tests
- Mock returns configured fixture
- Mock tracks call history
- Mock simulates errors


---

## Critical Safety Rules (Kırmızı Çizgiler)

### Rule 1: Idempotency / Replay Safety

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      IDEMPOTENCY / REPLAY SAFETY                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  PROBLEM:                                                                    │
│  Gateway/proxy/network retry → aynı request defalarca gelebilir             │
│  Read-only olsa bile: cache pollution, trace duplication, metric skew       │
│                                                                              │
│  SOLUTION:                                                                   │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                                                                      │    │
│  │  1. REQUEST HASH (SDK generates)                                     │    │
│  │     - SDK her request için deterministic hash üretir                 │    │
│  │     - Hash = sha256(canonicalize(request))                           │    │
│  │     - Header: X-Request-Hash                                         │    │
│  │                                                                      │    │
│  │  2. IDEMPOTENCY KEY (optional, consumer provides)                    │    │
│  │     - Consumer kendi idempotency key'ini verebilir                   │    │
│  │     - Header: X-Idempotency-Key                                      │    │
│  │     - Yoksa SDK request hash kullanır                                │    │
│  │                                                                      │    │
│  │  3. REPLAY DETECTION (backend responsibility)                        │    │
│  │     - Backend aynı hash'i kısa sürede görürse cache'den döner        │    │
│  │     - SDK replay'i bilmez, sadece response alır                      │    │
│  │     - Response header: X-Replay: true/false                          │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  SDK GUARANTEE:                                                              │
│  - Aynı input → aynı request hash (deterministic)                           │
│  - Retry sırasında hash DEĞİŞMEZ                                            │
│  - Response'da replay flag varsa SDK bunu meta'ya ekler                     │
│                                                                              │
│  INVARIANT:                                                                  │
│  replay(request) ≡ original(request) (same response, no side effects)       │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Rule 2: Timeout Budget & Cancellation

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    TIMEOUT BUDGET & CANCELLATION                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  PROBLEM:                                                                    │
│  Exponential backoff + unlimited retries = "sonsuz sabır" bug               │
│  Consumer thread/process blocked forever                                     │
│                                                                              │
│  SOLUTION: Two-tier timeout                                                  │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                                                                      │    │
│  │  1. PER-ATTEMPT TIMEOUT (config.timeout)                             │    │
│  │     - Her HTTP request için timeout                                  │    │
│  │     - Default: 30s                                                   │    │
│  │     - Exceeded → abort, count as retryable error                     │    │
│  │                                                                      │    │
│  │  2. OVERALL DEADLINE (config.deadline)                               │    │
│  │     - Tüm retry'lar dahil maksimum süre                              │    │
│  │     - Default: 60s                                                   │    │
│  │     - Exceeded → abort ALL, throw SdkTimeoutError                    │    │
│  │                                                                      │    │
│  │  3. ABORT SIGNAL (consumer provides)                                 │    │
│  │     - Consumer AbortController verebilir                             │    │
│  │     - Signal abort → immediate cancellation                          │    │
│  │     - Throw SdkCancelledError                                        │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  TIMING BUDGET EXAMPLE:                                                      │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                                                                      │    │
│  │  deadline = 60s                                                      │    │
│  │  timeout = 30s per attempt                                           │    │
│  │  maxAttempts = 3                                                     │    │
│  │                                                                      │    │
│  │  Worst case:                                                         │    │
│  │  Attempt 1: 30s timeout                                              │    │
│  │  Wait: 100ms                                                         │    │
│  │  Attempt 2: 30s timeout → DEADLINE EXCEEDED at ~30.1s                │    │
│  │                                                                      │    │
│  │  Deadline wins over retry count                                      │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  NEW ERROR TYPES:                                                            │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                                                                      │    │
│  │  SdkTimeoutError extends SdkError {                                  │    │
│  │    errorCode = 'TIMEOUT';                                            │    │
│  │    retryable = false;  // deadline exceeded, don't retry             │    │
│  │    elapsedMs: number;                                                │    │
│  │    deadlineMs: number;                                               │    │
│  │  }                                                                   │    │
│  │                                                                      │    │
│  │  SdkCancelledError extends SdkError {                                │    │
│  │    errorCode = 'CANCELLED';                                          │    │
│  │    retryable = false;  // consumer cancelled                         │    │
│  │  }                                                                   │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  INVARIANT:                                                                  │
│  totalTime ≤ config.deadline (hard guarantee)                               │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Rule 3: PII / KVKK Trace Redaction

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      PII / KVKK TRACE REDACTION                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  PROBLEM:                                                                    │
│  SDK trace/log'a PII kaçarsa → KVKK ihlali, audit günü cenaze               │
│  TraceBundle içinde zaten PII yok (backend redact ediyor)                   │
│  AMA: SDK kendi log'larına request/response yazabilir                       │
│                                                                              │
│  SOLUTION: Defense in depth                                                  │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                                                                      │    │
│  │  1. NO RAW PAYLOAD LOGGING                                           │    │
│  │     - SDK ASLA raw request/response body loglamaz                    │    │
│  │     - Debug mode'da bile: sadece metadata                            │    │
│  │                                                                      │    │
│  │  2. ALLOWLIST FIELD LOGGING                                          │    │
│  │     - Log'a yazılabilecek alanlar whitelist:                         │    │
│  │       ✅ principalAmount, currency, interestType                     │    │
│  │       ✅ startDate, endDate, caseType                                │    │
│  │       ✅ traceId, requestHash, timestamp                             │    │
│  │       ✅ status, errorCode, httpStatus                               │    │
│  │       ❌ Herhangi bir string field (potansiyel PII)                  │    │
│  │       ❌ context, metadata, custom fields                            │    │
│  │                                                                      │    │
│  │  3. REDACTION ON TRACE READ                                          │    │
│  │     - TraceBundle backend'den gelirken zaten redacted                │    │
│  │     - SDK ekstra redaction YAPMAZ (backend'e güven)                  │    │
│  │     - AMA: SDK kendi log'una trace içeriği YAZMAZ                    │    │
│  │                                                                      │    │
│  │  4. ERROR MESSAGE SANITIZATION                                       │    │
│  │     - SdkError.message içinde PII OLMAMALI                           │    │
│  │     - Backend error message'ı direkt kullanılmaz                     │    │
│  │     - Generic message + errorCode                                    │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  SDK LOG FORMAT (safe):                                                      │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                                                                      │    │
│  │  {                                                                   │    │
│  │    "level": "debug",                                                 │    │
│  │    "event": "preview_request",                                       │    │
│  │    "traceId": "550e8400-...",                                        │    │
│  │    "requestHash": "abc123",                                          │    │
│  │    "principalAmount": 10000,                                         │    │
│  │    "interestType": "LEGAL",                                          │    │
│  │    "durationMs": 150,                                                │    │
│  │    "status": "success"                                               │    │
│  │    // NO: debtorName, tckn, address, phone, email                    │    │
│  │  }                                                                   │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  INVARIANT:                                                                  │
│  ∀ log entry: PII_FIELDS ∩ logged_fields = ∅                                │
│                                                                              │
│  PII_FIELDS = {debtorName, tckn, address, phone, email, iban, ...}          │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Updated Config Interface

```typescript
interface SdkConfig {
  readonly baseUrl: string;
  readonly apiKey?: string;
  readonly bearerToken?: string;
  
  /** Per-attempt timeout in ms (default: 30000) */
  readonly timeout?: number;
  
  /** Overall deadline in ms (default: 60000) - NEW */
  readonly deadline?: number;
  
  readonly retry?: RetryConfig;
  readonly headers?: Readonly<Record<string, string>>;
  
  /** Logging configuration - NEW */
  readonly logging?: LoggingConfig;
}

interface LoggingConfig {
  /** Enable SDK logging (default: false) */
  readonly enabled?: boolean;
  
  /** Log level (default: 'warn') */
  readonly level?: 'debug' | 'info' | 'warn' | 'error';
  
  /** Custom logger (default: console) */
  readonly logger?: SdkLogger;
  
  /** NEVER log raw payloads (enforced, not configurable) */
  // readonly logPayloads: false; // Compile-time enforced
}

interface SdkLogger {
  debug(message: string, meta?: SafeLogMeta): void;
  info(message: string, meta?: SafeLogMeta): void;
  warn(message: string, meta?: SafeLogMeta): void;
  error(message: string, meta?: SafeLogMeta): void;
}

/** Only PII-safe fields allowed */
interface SafeLogMeta {
  traceId?: string;
  requestHash?: string;
  principalAmount?: number;
  currency?: string;
  interestType?: string;
  startDate?: string;
  endDate?: string;
  caseType?: string;
  debtorCount?: number;
  durationMs?: number;
  status?: string;
  errorCode?: string;
  httpStatus?: number;
  attempt?: number;
  retryable?: boolean;
}
```

### Updated PreviewRequest Interface

```typescript
interface PreviewRequest {
  readonly principalAmount: number;
  readonly currency?: string;
  readonly interestType: InterestTypeCode;
  readonly startDate: string;
  readonly endDate: string;
  readonly fixedRate?: number;
  readonly caseType?: string;
  readonly debtorCount?: number;
  readonly skipInterest?: boolean;
  readonly skipFee?: boolean;
  readonly skipPolicy?: boolean;
  
  /** Consumer-provided idempotency key (optional) - NEW */
  readonly idempotencyKey?: string;
  
  /** AbortSignal for cancellation (optional) - NEW */
  readonly signal?: AbortSignal;
}
```
