# Requirements Document: SDK v0.1 (Read-Only)

## Introduction

Phase 6B giriş kapısı: Dış dünyaya "doğru okuma"yı standartlaştıran read-only SDK. Yazma yok, risk yok, ama platformlaşmanın temeli.

**Prensip:** SDK, backend'in ürettiği gerçeği bozmadan taşır. Hesaplama YAPMAZ, sadece okur.

## Scope

**In Scope (v0.1):**
- Preview okuma (CalcPreviewResponse, explanations dahil)
- Trace okuma (TraceBundle)
- Trace listeleme (sayfalı, filtrelenebilir)
- Hata modeli + retry politikası (read-safe)
- TypeScript interface-first tasarım
- Mock implementation (network bağımsız test)

**Out of Scope (Non-Goals v0.1):**
- Write/mutate operasyonları
- Admin/ops endpoint'leri
- Chaos/diagnostics erişimi
- Production decision tetikleme
- Cache invalidation
- Real-time subscriptions
- Multi-language SDK (sadece TypeScript)

## Glossary

- **SDK**: Software Development Kit - dış tüketiciler için client library
- **Preview**: Hesaplama önizlemesi (interest + fee + policy + explanations)
- **Trace**: Kanıt paketi (TraceBundle)
- **RBAC**: Role-Based Access Control
- **Idempotent**: Aynı çağrı tekrarlandığında aynı sonucu veren operasyon

## Requirements

### Requirement 1: Preview Client

**User Story:** As an SDK consumer, I want to fetch calculation previews, so that I can display accurate estimates without implementing calculation logic.

#### Acceptance Criteria

1. THE SDK SHALL expose a `PreviewClient` class with `getPreview(request)` method
2. THE `getPreview` method SHALL accept a `PreviewRequest` object matching backend contract
3. THE `getPreview` method SHALL return a `CalcPreviewResponse` including:
   - interest data (if requested)
   - fee data (if requested)
   - policy data with explanations (Phase 6A)
   - versions, errors, warnings, uxGuidance
4. THE SDK SHALL NOT perform any local calculations
5. THE SDK SHALL NOT cache responses locally (backend handles caching)
6. IF the backend returns an error, THE SDK SHALL throw a typed `SdkError` with:
   - errorCode: string
   - message: string
   - retryable: boolean
   - httpStatus?: number

### Requirement 2: Trace Client

**User Story:** As an SDK consumer, I want to fetch trace bundles, so that I can audit and debug calculation decisions.

#### Acceptance Criteria

1. THE SDK SHALL expose a `TraceClient` class with:
   - `getTrace(traceId: string)` → `TraceBundle`
   - `listRecent(filters: TraceFilters)` → `PaginatedTraceList`
2. THE `getTrace` method SHALL return the full TraceBundle for a given traceId
3. THE `listRecent` method SHALL support filters:
   - `tenantId?: string`
   - `startDate?: string` (ISO 8601)
   - `endDate?: string` (ISO 8601)
   - `status?: 'OK' | 'DEGRADED' | 'UNAVAILABLE'`
   - `limit?: number` (default: 20, max: 100)
   - `cursor?: string` (pagination)
4. THE `listRecent` method SHALL return:
   ```typescript
   interface PaginatedTraceList {
     items: TraceSummary[];
     nextCursor?: string;
     hasMore: boolean;
     totalCount?: number;
   }
   ```
5. THE SDK SHALL respect RBAC - unauthorized requests SHALL throw `SdkAuthError`
6. THE trace data SHALL NOT be modified by the SDK

### Requirement 3: Error Handling

**User Story:** As an SDK consumer, I want predictable error handling, so that I can implement proper fallback logic.

#### Acceptance Criteria

1. THE SDK SHALL define a typed error hierarchy:
   ```typescript
   class SdkError extends Error {
     readonly errorCode: string;
     readonly retryable: boolean;
     readonly httpStatus?: number;
   }
   
   class SdkNetworkError extends SdkError { retryable = true; }
   class SdkAuthError extends SdkError { retryable = false; }
   class SdkValidationError extends SdkError { retryable = false; }
   class SdkServerError extends SdkError { retryable = true; }
   class SdkNotFoundError extends SdkError { retryable = false; }
   ```
2. WHEN a network error occurs, THE SDK SHALL throw `SdkNetworkError`
3. WHEN authentication fails (401/403), THE SDK SHALL throw `SdkAuthError`
4. WHEN validation fails (400), THE SDK SHALL throw `SdkValidationError`
5. WHEN server error occurs (5xx), THE SDK SHALL throw `SdkServerError`
6. WHEN resource not found (404), THE SDK SHALL throw `SdkNotFoundError`

### Requirement 4: Retry Policy

**User Story:** As an SDK consumer, I want automatic retries for transient failures, so that I don't have to implement retry logic.

#### Acceptance Criteria

1. THE SDK SHALL implement automatic retry for `retryable` errors
2. THE retry policy SHALL use exponential backoff:
   - Initial delay: 100ms
   - Max delay: 5000ms
   - Multiplier: 2
   - Max attempts: 3
3. THE SDK SHALL allow retry policy customization via `SdkConfig`:
   ```typescript
   interface RetryConfig {
     maxAttempts?: number;      // default: 3
     initialDelayMs?: number;   // default: 100
     maxDelayMs?: number;       // default: 5000
     multiplier?: number;       // default: 2
   }
   ```
4. THE SDK SHALL NOT retry non-retryable errors (auth, validation, not found)
5. THE SDK SHALL emit retry events for observability (optional callback)

### Requirement 5: SDK Configuration

**User Story:** As an SDK consumer, I want to configure the SDK for my environment, so that I can use it in different contexts.

#### Acceptance Criteria

1. THE SDK SHALL be initialized with `SdkConfig`:
   ```typescript
   interface SdkConfig {
     baseUrl: string;           // Required: API base URL
     apiKey?: string;           // Optional: API key auth
     bearerToken?: string;      // Optional: Bearer token auth
     timeout?: number;          // Default: 30000ms
     retry?: RetryConfig;       // Default: see Requirement 4
     headers?: Record<string, string>; // Custom headers
   }
   ```
2. THE SDK SHALL validate config on initialization
3. IF both `apiKey` and `bearerToken` are provided, THE SDK SHALL throw `SdkValidationError`
4. THE SDK SHALL support environment-based configuration (dev/staging/prod URLs)

### Requirement 6: Type Safety

**User Story:** As an SDK consumer, I want full TypeScript support, so that I get compile-time safety and IDE support.

#### Acceptance Criteria

1. THE SDK SHALL export all request/response types
2. THE SDK SHALL use `exactOptionalPropertyTypes` compatible types
3. THE SDK SHALL NOT use `any` type in public API
4. THE SDK SHALL export type guards for error types:
   ```typescript
   function isSdkNetworkError(e: unknown): e is SdkNetworkError;
   function isSdkAuthError(e: unknown): e is SdkAuthError;
   // etc.
   ```
5. THE SDK types SHALL match backend contract schemas exactly
6. THE SDK SHALL export enums/constants for known values:
   - `PolicyOutcome`: 'PASS' | 'WARN' | 'BLOCK'
   - `ExplanationSeverity`: 'INFO' | 'WARNING' | 'ERROR'
   - `TraceResultStatus`: 'OK' | 'DEGRADED' | 'UNAVAILABLE'

### Requirement 7: Mock Implementation

**User Story:** As an SDK consumer, I want a mock implementation, so that I can test without network dependencies.

#### Acceptance Criteria

1. THE SDK SHALL provide `MockPreviewClient` and `MockTraceClient`
2. THE mock clients SHALL implement the same interfaces as real clients
3. THE mock clients SHALL accept fixture data on construction:
   ```typescript
   const mockPreview = new MockPreviewClient({
     responses: Map<string, CalcPreviewResponse>,
     defaultResponse?: CalcPreviewResponse,
     errorMode?: 'network' | 'auth' | 'server',
   });
   ```
4. THE mock clients SHALL support error simulation
5. THE mock clients SHALL track call history for assertions:
   ```typescript
   mockPreview.getCalls(); // Returns array of {method, args, timestamp}
   ```

## Invariants

### Invariant 1: Read-Only Guarantee
```
SDK.* → NO side effects on backend state
```
SDK hiçbir operasyonu backend state'ini değiştirmez.

### Invariant 2: Type Fidelity
```
SDK.response ≡ Backend.response
```
SDK response'u backend response'undan farklı OLAMAZ.

### Invariant 3: Error Transparency
```
Backend.error → SDK.error (no swallowing)
```
Backend hatası SDK tarafından yutulmaz, typed error olarak iletilir.

## Non-Goals (Explicit)

Bu fazda YAPILMAYACAKLAR:

1. **Write operasyonları** - Hesaplama başlatma, kaydetme yok
2. **Cache yönetimi** - SDK local cache tutmaz
3. **Admin endpoint'leri** - Ops/diagnostics erişimi yok
4. **Real-time** - WebSocket/SSE subscription yok
5. **Multi-language** - Sadece TypeScript (Python/Go sonra)
6. **Offline mode** - Network zorunlu
7. **Request batching** - Tek tek çağrı

## Security Considerations

1. API key/token güvenli saklanmalı (env variable)
2. SDK log'larında credential OLMAMALI
3. Trace verisi PII içerebilir - RBAC zorunlu
4. HTTPS zorunlu (HTTP reject)

## Versioning

- SDK version: `0.1.x` (pre-stable)
- Breaking change: major bump
- Backend contract version: header'da gönderilir
- Deprecation: minimum 2 minor version uyarı

