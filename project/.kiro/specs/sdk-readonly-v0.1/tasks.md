# Implementation Plan: SDK v0.1 (Read-Only)

## Overview

Phase 6B: Dış dünyaya "doğru okuma"yı standartlaştıran read-only SDK. Yazma yok, risk yok, platformlaşmanın temeli.

**Kırmızı Çizgiler:**
1. Idempotency / Replay Safety
2. Timeout Budget & Cancellation  
3. PII / KVKK Trace Redaction

---

## Tasks

### Task 1: Project Setup

**Owner:** SDK  
**Status:** ✅ DONE
**Acceptance Criteria:**
- [x] 1.1 Create `packages/calc-preview-sdk` directory structure
- [x] 1.2 Initialize package.json with correct dependencies
- [x] 1.3 Configure tsconfig.json with strict mode + exactOptionalPropertyTypes
- [x] 1.4 Setup build pipeline (tsc, bundler)

**Test Hook:** `pnpm build` succeeds with zero errors  
**Done:** Package compiles, exports empty index.ts

---

### Task 2: Core Types

**Owner:** SDK/Types  
**Status:** ✅ DONE
**Acceptance Criteria:**
- [x] 2.1 Create `types/config.ts` - SdkConfig, RetryConfig, LoggingConfig
- [x] 2.2 Create `types/preview.ts` - PreviewRequest, PreviewResponse, ResponseMeta
- [x] 2.3 Create `types/trace.ts` - TraceBundle, TraceSummary, TraceFilters, PaginatedTraceList
- [x] 2.4 Create `types/enums.ts` - PolicyOutcome, ExplanationSeverity, TraceResultStatus
- [x] 2.5 Create `types/index.ts` - Public exports

**Test Hook:** Types compile, no `any` in public API  
**Done:** All types exported, IDE autocomplete works

---

### Task 3: Error Hierarchy

**Owner:** SDK/Errors  
**Status:** ✅ DONE
**Acceptance Criteria:**
- [x] 3.1 Create `errors/sdk-error.ts` - Base SdkError class
- [x] 3.2 Create error subclasses:
  - SdkNetworkError (retryable: true)
  - SdkServerError (retryable: true)
  - SdkRateLimitError (retryable: true, retryAfterMs)
  - SdkAuthError (retryable: false)
  - SdkValidationError (retryable: false)
  - SdkNotFoundError (retryable: false)
  - SdkConfigError (retryable: false)
  - SdkTimeoutError (retryable: false) ← NEW
  - SdkCancelledError (retryable: false) ← NEW
- [x] 3.3 Create `errors/type-guards.ts` - isSdkError, isSdkNetworkError, etc.
- [x] 3.4 Create `errors/error-mapper.ts` - HTTP status → SdkError

**Test Hook:** Unit tests for each error type and type guard  
**Done:** Error hierarchy complete, type guards work at runtime

---

### Task 4: HTTP Client & Retry Handler

**Owner:** SDK/HTTP  
**Status:** ✅ DONE
**Acceptance Criteria:**
- [x] 4.1 Create `http/http-client.ts` - Fetch wrapper with:
  - Per-attempt timeout (AbortController)
  - Overall deadline enforcement
  - Request hash generation (deterministic)
  - Idempotency key header
  - Auth header injection
- [x] 4.2 Create `http/retry-handler.ts` - Exponential backoff with:
  - Max attempts limit
  - Deadline check before each retry
  - Jitter (±10%)
  - AbortSignal propagation
- [x] 4.3 Create `http/request-hasher.ts` - Deterministic request hash
- [x] 4.4 Implement cancellation via AbortSignal

**Test Hook:** 
- Unit test: retry stops at maxAttempts
- Unit test: retry stops at deadline
- Unit test: AbortSignal cancels immediately
- Unit test: same input → same hash

**Done:** HTTP client handles all timeout/retry/cancel scenarios

---

### Task 5: Config Validation

**Owner:** SDK/Validation  
**Status:** ✅ DONE
**Acceptance Criteria:**
- [x] 5.1 Create `validation/config-validator.ts`:
  - baseUrl required, HTTPS only, no trailing slash
  - apiKey XOR bearerToken (not both)
  - timeout in range [1000, 120000]
  - deadline > timeout
  - retry values positive
- [x] 5.2 Throw SdkConfigError on invalid config
- [x] 5.3 Config is readonly after validation (Object.freeze)

**Test Hook:** Unit tests for each validation rule  
**Done:** Invalid config → SdkConfigError, valid config → frozen object

---

### Task 6: Logging (PII-Safe)

**Owner:** SDK/Logging  
**Status:** ✅ DONE
**Acceptance Criteria:**
- [x] 6.1 Create `logging/safe-logger.ts`:
  - SafeLogMeta type (allowlist fields only)
  - No raw payload logging (compile-time enforced)
  - Configurable log level
  - Custom logger support
- [x] 6.2 Create `logging/redaction.ts`:
  - PII field list (debtorName, tckn, address, phone, email, iban)
  - Redaction function (for error messages)
- [x] 6.3 Integrate logger into HTTP client

**Test Hook:**
- Unit test: PII fields not in SafeLogMeta type
- Unit test: raw payload logging blocked
- Unit test: error messages sanitized

**Done:** SDK logs contain ZERO PII fields

---

### Task 7: Preview Client

**Owner:** SDK/Clients  
**Status:** ✅ DONE
**Acceptance Criteria:**
- [x] 7.1 Create `clients/preview-client.ts`:
  - getPreview(request) → PreviewResponse
  - Request validation
  - Response parsing
  - Error mapping
- [x] 7.2 Add idempotencyKey support
- [x] 7.3 Add AbortSignal support
- [x] 7.4 Extract traceId from response → _meta

**Test Hook:**
- Unit test: valid request → response
- Unit test: invalid request → SdkValidationError
- Unit test: 401 → SdkAuthError
- Unit test: 500 → SdkServerError (retried)

**Done:** PreviewClient handles all success/error paths

---

### Task 8: Trace Client

**Owner:** SDK/Clients  
**Status:** ✅ DONE
**Acceptance Criteria:**
- [x] 8.1 Create `clients/trace-client.ts`:
  - getTrace(traceId) → TraceBundle
  - listRecent(filters) → PaginatedTraceList
- [x] 8.2 Handle 404 → SdkNotFoundError
- [x] 8.3 Pagination cursor handling
- [x] 8.4 RBAC error handling (403 → SdkAuthError)

**Test Hook:**
- Unit test: valid traceId → TraceBundle
- Unit test: invalid traceId → SdkNotFoundError
- Unit test: pagination works
- Unit test: 403 → SdkAuthError

**Done:** TraceClient handles all success/error paths

---

### Task 9: Main SDK Class

**Owner:** SDK  
**Status:** ✅ DONE
**Acceptance Criteria:**
- [x] 9.1 Create `sdk.ts` - CalcPreviewSdk class:
  - Constructor validates config
  - Exposes preview: PreviewClient
  - Exposes trace: TraceClient
  - Static version property
  - Static validateConfig method
- [x] 9.2 Config immutability enforced
- [x] 9.3 Create `index.ts` - Public exports

**Test Hook:**
- Unit test: invalid config → throws in constructor
- Unit test: config immutable after construction
- Unit test: clients accessible

**Done:** SDK instantiable, clients work

---

### Task 10: Mock Implementation

**Owner:** SDK/Mock  
**Status:** ✅ DONE
**Acceptance Criteria:**
- [x] 10.1 Create `mock/mock-preview-client.ts`:
  - Same interface as real client
  - Fixture mode (pre-configured responses)
  - Error mode (always throws)
  - Sequence mode (ordered responses)
  - Call tracking
- [x] 10.2 Create `mock/mock-trace-client.ts`:
  - Same interface as real client
  - Fixture/error/sequence modes
  - Call tracking
- [x] 10.3 Document fidelity boundary

**Test Hook:**
- Unit test: mock returns fixture
- Unit test: mock tracks calls
- Unit test: mock simulates errors

**Done:** Mock clients usable for consumer testing

---

### Task 11: Golden Scenario Tests

**Owner:** SDK/Tests  
**Status:** ✅ DONE
**Acceptance Criteria:**
- [x] 11.1 Happy path: getPreview → success with explanations
- [x] 11.2 Happy path: getTrace → success
- [x] 11.3 Error path: 401 → SdkAuthError (no retry)
- [x] 11.4 Error path: 404 → SdkNotFoundError (no retry)
- [x] 11.5 Retry path: exponential backoff + jitter
- [x] 11.6 Timeout path: deadline exceeded → SdkTimeoutError
- [x] 11.7 Cancel path: AbortSignal → SdkCancelledError
- [x] 11.8 Idempotency: same request → same hash

**Test Hook:** All golden scenarios pass  
**Done:** SDK behavior verified end-to-end

**Test Files:**
- `src/__tests__/golden-scenarios.spec.ts` - 7 scenario groups
- `src/__tests__/retry-handler.spec.ts` - Retry logic tests

---

### Task 12: Documentation

**Owner:** SDK/Docs  
**Status:** ✅ DONE
**Acceptance Criteria:**
- [x] 12.1 README.md with:
  - Installation
  - Quick start
  - Configuration options
  - Error handling guide
  - Mock usage
- [x] 12.2 JSDoc on all public APIs
- [x] 12.3 CHANGELOG.md initialized

**Test Hook:** README examples compile  
**Done:** SDK documented for external consumers

---

## Checkpoints

### Checkpoint 1: Foundation (Tasks 1-6) ✅ COMPLETE
- Package builds
- Types compile
- Errors work
- HTTP client handles timeout/retry/cancel
- Config validates
- Logging is PII-safe

### Checkpoint 2: Clients (Tasks 7-9) ✅ COMPLETE
- PreviewClient works
- TraceClient works
- SDK instantiable

### Checkpoint 3: Quality (Tasks 10-12) ✅ COMPLETE
- Mocks available
- Golden scenarios pass
- Documentation complete

---

## Final Status: ✅ SDK v0.1 SEALED

All 12 tasks completed. SDK ready for consumption.

**Invariants Verified:**
- Read-only guarantee ✅
- Type fidelity ✅
- Error transparency ✅
- Timeout guarantee ✅
- PII safety ✅
- Idempotency ✅
- Config immutability ✅

**CI Integration:**
- `.github/workflows/sdk-test.yml` - PR'da zorunlu

---

## Invariants (Must Hold)

| Invariant | Enforcement |
|-----------|-------------|
| Read-only guarantee | No POST/PUT/DELETE except preview (which is read) |
| Type fidelity | Response types match backend exactly |
| Error transparency | All backend errors mapped to SdkError |
| Timeout guarantee | totalTime ≤ deadline |
| PII safety | SafeLogMeta allowlist, no raw payloads |
| Idempotency | Same input → same request hash |
| Config immutability | Object.freeze after validation |

---

## Notes

- Tasks 1-6 are foundation, must complete before clients
- Tasks 7-9 are core functionality
- Tasks 10-12 are quality/polish
- Each task has explicit test hook and done definition
- Kırmızı çizgiler (idempotency, timeout, PII) are embedded in relevant tasks
