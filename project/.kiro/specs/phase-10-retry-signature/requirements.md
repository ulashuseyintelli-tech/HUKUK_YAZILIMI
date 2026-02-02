# Phase 10: Retry Pipeline + Digital Signature

## Overview

Phase 10 adds two capabilities to the Evidence Bundle system:
1. **Retry Pipeline**: Out-of-band retry for transient manifest write failures
2. **Digital Signature**: Cryptographic proof of seal integrity

## User Stories

### US-10.1: Manifest Retry Pipeline

**As a** system operator  
**I want** failed manifest writes to be automatically retried  
**So that** transient S3 failures don't result in missing manifests

**Acceptance Criteria:**
- [ ] AC-10.1.1: Transient failures (5xx, timeout, throttling) are enqueued for retry
- [ ] AC-10.1.2: Permanent failures (4xx, validation) go to dead-letter queue
- [ ] AC-10.1.3: Retry uses exponential backoff with jitter
- [ ] AC-10.1.4: Maximum 5 retry attempts before dead-letter
- [ ] AC-10.1.5: Admin can manually trigger retry via API
- [ ] AC-10.1.6: All retry attempts are logged with bundleId
- [ ] AC-10.1.7: Metrics track retry success/failure rates

### US-10.2: Error Classification

**As a** system operator  
**I want** errors to be classified as transient or permanent  
**So that** only recoverable errors are retried

**Acceptance Criteria:**
- [ ] AC-10.2.1: 5xx errors classified as transient
- [ ] AC-10.2.2: Timeout errors classified as transient
- [ ] AC-10.2.3: Throttling (429) classified as transient
- [ ] AC-10.2.4: 4xx errors (except 429) classified as permanent
- [ ] AC-10.2.5: Validation errors classified as permanent
- [ ] AC-10.2.6: Classification is deterministic and testable

### US-10.3: Dead Letter Queue

**As a** system operator  
**I want** permanently failed manifests to be tracked  
**So that** I can investigate and manually resolve them

**Acceptance Criteria:**
- [ ] AC-10.3.1: DLQ stores bundleId, error code, error message, attempt count, timestamps
- [ ] AC-10.3.2: DLQ entries are queryable via admin API with pagination
- [ ] AC-10.3.3: DLQ entries can be re-driven (moved back to retry queue)
- [ ] AC-10.3.4: DLQ entries can be manually resolved with notes
- [ ] AC-10.3.5: DLQ has retention policy (30 days default)
- [ ] AC-10.3.6: Alert fires when DLQ size exceeds 100 entries
- [ ] AC-10.3.7: Alert fires when oldest DLQ entry > 24 hours
- [ ] AC-10.3.8: DLQ dashboard shows count + oldest age

### US-10.4: Admin Retry API

**As a** system administrator  
**I want** to manually trigger manifest retry  
**So that** I can recover from failures after investigation

**Acceptance Criteria:**
- [ ] AC-10.4.1: `POST /admin/bundles/{bundleId}/manifest/retry` endpoint
- [ ] AC-10.4.2: Requires admin role authentication (break-glass)
- [ ] AC-10.4.3: Rate limited to 10 req/min per admin user
- [ ] AC-10.4.4: All retries logged to audit trail
- [ ] AC-10.4.5: Returns enqueued status with jobId and nextAttemptAt
- [ ] AC-10.4.6: Idempotent (returns "already queued" within 1 minute)
- [ ] AC-10.4.7: **MUST enqueue job, MUST NOT do direct write**
- [ ] AC-10.4.8: Returns "manifest exists" if already written (no-op success)

### US-10.5: Digital Signature

**As a** legal compliance officer  
**I want** sealed bundles to have cryptographic signatures  
**So that** I can prove bundle integrity in legal proceedings

**Acceptance Criteria:**
- [ ] AC-10.5.1: Signature is computed over `sealedHash` (not manifestHash)
- [ ] AC-10.5.2: Signature algorithm is RS256 or ES256 (configurable)
- [ ] AC-10.5.3: Key ID is included in signature metadata
- [ ] AC-10.5.4: Signature is stored in seal record (DB), manifest has signatureRef
- [ ] AC-10.5.5: Signature can be verified via API endpoint
- [ ] AC-10.5.6: Signature can be verified via offline CLI tool
- [ ] AC-10.5.7: Signing failure does NOT block manifest write (warning + retry later)

### US-10.6: Key Management

**As a** security engineer  
**I want** signing keys to be securely managed  
**So that** signatures cannot be forged

**Acceptance Criteria:**
- [ ] AC-10.6.1: Initial implementation uses local key (env variable)
- [ ] AC-10.6.2: Key rotation is supported (multiple active keys)
- [ ] AC-10.6.3: Old keys can verify but not sign
- [ ] AC-10.6.4: Migration path to KMS documented
- [ ] AC-10.6.5: Key ID format: `{algorithm}-{timestamp}-{sequence}`

### US-10.7: Signature Verification

**As a** auditor  
**I want** to verify bundle signatures  
**So that** I can confirm bundle integrity

**Acceptance Criteria:**
- [ ] AC-10.7.1: `GET /bundles/{bundleId}/verify` returns verification result
- [ ] AC-10.7.2: Verification checks: signature valid, sealedHash matches, key not revoked
- [ ] AC-10.7.3: CLI tool: `verify-bundle --bundle-id <id> --manifest <file>`
- [ ] AC-10.7.4: Verification result includes: valid/invalid, reason, timestamp
- [ ] AC-10.7.5: Verification is logged to audit trail

## Non-Functional Requirements

### NFR-10.1: Performance
- Retry worker processes at least 100 retries/minute
- Signature generation < 50ms per bundle (P99)
- Signature verification < 20ms per bundle (P99)

### NFR-10.2: Reliability
- Retry pipeline survives API restart (persistent queue)
- DLQ data survives 30 days minimum
- Key rotation has zero downtime

### NFR-10.3: Security
- Signing keys never logged
- Admin retry requires break-glass role
- All signature operations audited

### NFR-10.4: SLO Targets (Measurable)

| Metric | Target | Measurement |
|--------|--------|-------------|
| Manifest export eventual consistency | P99 < 10 min | Time from seal to manifest available |
| Retry success rate | > 95% | Successful retries / total retries |
| DLQ size | < 100 entries | Alert if exceeded |
| DLQ oldest entry age | < 24 hours | Alert if exceeded |
| Signature generation latency | P95 < 30ms, P99 < 50ms | Histogram |
| Signature verification latency | P95 < 15ms, P99 < 20ms | Histogram |
| Retry worker availability | 99.9% | Independent deployment |
| Circuit breaker open time | < 5 min/day | Time in OPEN state |

## Constraints

### Phase 9C Lock Constraints (MUST NOT VIOLATE)

1. **Seal correctness > Export availability**
2. **Manifest write must remain non-blocking**
3. **Write-once semantics preserved**
4. **Post-seal hook remains outside transaction**

### Technical Constraints

1. Retry queue: PostgreSQL-based (no new infra)
2. Initial key storage: Environment variable
3. Signature algorithm: RS256 (RSA) or ES256 (ECDSA)

## Dependencies

- Phase 9C (LOCKED) ✅
- PostgreSQL for retry queue
- Crypto library (Node.js native or jose)

## Unlocks

- Phase 11: Retention enforcement with signed manifests
- Phase 12: Evidence export API with signature verification

## Open Questions

1. **Q**: Should signature be computed at seal time or manifest write time?
   **A**: Manifest write time (signature includes sealedHash which is computed at seal)

2. **Q**: Should we support multiple signature algorithms simultaneously?
   **A**: Yes, for migration. Key ID includes algorithm.

3. **Q**: What happens if signing fails?
   **A**: Manifest written without signature, logged as warning, retry later.
