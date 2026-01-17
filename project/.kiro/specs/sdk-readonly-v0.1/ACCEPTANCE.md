# SDK v0.1 (Read-Only) - ACCEPTANCE

**Status:** ✅ SEALED  
**Date:** 2026-01-16  
**Phase:** 6B

---

## Summary

Read-only SDK for CalcPreview API. Preview + Trace access. No writes, no side effects.

## Deliverables

| Component | Status | Location |
|-----------|--------|----------|
| Core Types | ✅ | `src/types/` |
| Error Hierarchy | ✅ | `src/errors/` |
| HTTP Client | ✅ | `src/http/` |
| Config Validation | ✅ | `src/validation/` |
| PII-Safe Logging | ✅ | `src/logging/` |
| Preview Client | ✅ | `src/clients/preview-client.ts` |
| Trace Client | ✅ | `src/clients/trace-client.ts` |
| Mock Clients | ✅ | `src/mock/` |
| Main SDK Class | ✅ | `src/sdk.ts` |
| Golden Tests | ✅ | `src/__tests__/` |
| Documentation | ✅ | `README.md`, `CHANGELOG.md` |
| CI Workflow | ✅ | `.github/workflows/sdk-test.yml` |

## Kırmızı Çizgiler (Red Lines)

### 1. Idempotency / Replay Safety ✅
- Request hash generation (deterministic)
- Idempotency key header
- Same input → same hash (tested)

### 2. Timeout Budget & Cancellation ✅
- Per-attempt timeout (AbortController)
- Overall deadline enforcement
- AbortSignal propagation
- SdkTimeoutError / SdkCancelledError

### 3. PII / KVKK Trace Redaction ✅
- SafeLogMeta allowlist (compile-time enforced)
- No raw payload logging
- Redaction functions (TCKN, phone, email, IBAN)
- isPiiField / sanitizeObject utilities

## Invariants

| Invariant | Enforcement | Tested |
|-----------|-------------|--------|
| Read-only | No POST/PUT/DELETE except preview | ✅ |
| Type fidelity | Response types match backend | ✅ |
| Error transparency | All errors mapped to SdkError | ✅ |
| Timeout guarantee | totalTime ≤ deadline | ✅ |
| PII safety | SafeLogMeta allowlist | ✅ |
| Idempotency | Same input → same hash | ✅ |
| Config immutability | Object.freeze | ✅ |

## Test Coverage

### Golden Scenarios (7 groups)
1. Preview Happy Path - Response parsing, types
2. Trace Get Happy Path - TraceBundle structure
3. Error Handling - Retryable vs non-retryable
4. Cancellation - AbortSignal respect
5. Idempotency - Deterministic hash
6. PII Redaction - KVKK compliance
7. Config Validation - HTTPS, auth XOR, freeze

### Retry Handler Tests
- Exponential backoff calculation
- Jitter (±10%)
- Max attempts limit
- Deadline enforcement
- AbortSignal cancellation
- onRetry callback

## Breaking Change Policy

Follows Semantic Versioning:
- MAJOR: Breaking changes to public API
- MINOR: New features, backward compatible
- PATCH: Bug fixes

## Compatibility

| SDK Version | API Min Version | Trace Schema | Contract Version |
|-------------|-----------------|--------------|------------------|
| 0.1.x       | 1.0.0           | v1           | 2024.01          |

---

## Sign-off

Phase 6B SDK v0.1 is sealed and ready for consumption.

Next: Phase 6C - Region-aware isimlendirme/kontratlar (hazırlık aşamasında).
