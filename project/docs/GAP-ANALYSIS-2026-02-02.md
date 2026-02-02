# Frontend/Backend Gap Analysis

**Date**: 2026-02-02  
**Status**: Phase 9C LOCKED, Phase 10 SPEC READY

---

## Executive Summary

| Area | Backend | Frontend | Priority |
|------|---------|----------|----------|
| Phase 9C Object Storage | ✅ 100% | N/A (internal) | LOCKED |
| Simulation API | ✅ 90% | ⚠️ 20% | HIGH |
| Phase 10 Retry Pipeline | ❌ 0% | ❌ 0% | NEXT |
| Phase 10 Digital Signature | ❌ 0% | ❌ 0% | NEXT |
| Admin Panel | ⚠️ 50% | ❌ 10% | MEDIUM |

---

## 1. Backend Status

### ✅ COMPLETE (LOCKED)

**Phase 9C Object Storage (87 tests):**
```
object-store/
├── bundle-manifest/     ✅ 48 tests
│   ├── builder          ✅
│   ├── canonical        ✅
│   ├── hasher           ✅
│   ├── storage          ✅
│   ├── verifier         ✅
│   └── writer           ✅
├── bundle-seal/         ✅ 39 tests
│   ├── service          ✅
│   ├── hasher           ✅
│   ├── errors           ✅
│   └── repository       ✅
└── evidence-bundle/     ✅
    ├── keys             ✅
    ├── module           ✅
    └── tokens           ✅
```

**Simulation API (Phase 8 Sprint 2E):**
```
simulation-api/
├── simulation.controller.ts    ✅
├── simulation.dto.ts           ✅
├── simulation-run-store.ts     ✅
├── guards/
│   ├── feature-flag.guard      ✅
│   ├── rbac.guard              ✅
│   └── rate-limit.guard        ✅
└── redis/
    ├── rate-limit-store        ✅
    └── failover-handler        ✅
```

### ❌ NOT STARTED (Phase 10)

**10.1 Retry Pipeline:**
```
manifest-retry/                  ❌ NOT CREATED
├── manifest-error-classifier.ts
├── manifest-retry-queue.repository.ts
├── manifest-retry-worker.service.ts
├── manifest-dlq.repository.ts
├── circuit-breaker.service.ts
└── __tests__/
```

**10.2 Digital Signature:**
```
bundle-signature/                ❌ NOT CREATED
├── bundle-signature.service.ts
├── bundle-signature.types.ts
├── signing-key.service.ts
├── signing-key.types.ts
└── __tests__/
```

**Database Migrations (Phase 10):**
- ❌ `manifest_retry_queue` table
- ❌ `manifest_dead_letter_queue` table
- ❌ `seal_signatures` table

**Admin APIs (Phase 10):**
- ❌ `POST /admin/bundles/{id}/manifest/retry`
- ❌ `GET /admin/manifest/dlq`
- ❌ `POST /admin/manifest/dlq/{id}/redrive`
- ❌ `POST /admin/manifest/dlq/{id}/resolve`
- ❌ `GET /bundles/{id}/verify`

---

## 2. Frontend Status

### ✅ COMPLETE

**Core Components:**
- `components/case/` - Case management UI
- `components/debtor/` - Debtor management
- `components/payment/` - Payment tracking
- `components/collection/` - Collection workflow
- `components/dashboard/` - Main dashboard
- `components/reports/` - Reporting

**Hooks:**
- `useCaseCalculation.ts` ✅
- `usePreviewCoordinator.ts` ✅
- `useLimitationCheck.ts` ✅
- `useValidation.ts` ✅

### ⚠️ PARTIAL

**Preview/Simulation:**
```
components/preview/
├── index.ts                    ✅
├── PreviewStatusBanner.tsx     ✅
├── SimulationRunList.tsx       ❌ MISSING
├── SimulationDetail.tsx        ❌ MISSING
├── WhatIfScenarioSelector.tsx  ❌ MISSING
├── DriftScoreChart.tsx         ❌ MISSING
└── EvidenceGateStatus.tsx      ❌ MISSING
```

### ❌ NOT STARTED

**Admin Panel:**
```
components/admin/               ❌ NOT CREATED
├── DLQDashboard.tsx
├── RetryQueueMonitor.tsx
├── BundleVerification.tsx
├── SignatureStatus.tsx
└── CircuitBreakerStatus.tsx
```

**App Routes:**
```
app/(dashboard)/admin/
├── dlq/                        ❌ MISSING
│   └── page.tsx
├── retry-queue/                ❌ MISSING
│   └── page.tsx
└── bundles/                    ❌ MISSING
    └── [id]/
        └── verify/
            └── page.tsx
```

---

## 3. Priority Matrix

### P0 - Critical (Phase 10 Blockers)

| Item | Type | Effort | Dependency |
|------|------|--------|------------|
| Error Classifier | Backend | 2h | None |
| Retry Queue Schema | Backend | 0.5h | None |
| DLQ Schema | Backend | 0.5h | None |
| Retry Worker | Backend | 4h | Error Classifier |
| Circuit Breaker | Backend | 2h | Retry Worker |

### P1 - High (Phase 10 Core)

| Item | Type | Effort | Dependency |
|------|------|--------|------------|
| Admin Retry API | Backend | 2h | Retry Worker |
| DLQ APIs | Backend | 3h | DLQ Schema |
| Signature Service | Backend | 4h | None |
| Verification API | Backend | 2h | Signature Service |

### P2 - Medium (Frontend)

| Item | Type | Effort | Dependency |
|------|------|--------|------------|
| SimulationRunList | Frontend | 3h | Simulation API |
| SimulationDetail | Frontend | 2h | Simulation API |
| DLQDashboard | Frontend | 4h | DLQ APIs |
| BundleVerification | Frontend | 2h | Verification API |

### P3 - Low (Nice to Have)

| Item | Type | Effort | Dependency |
|------|------|--------|------------|
| DriftScoreChart | Frontend | 2h | SimulationDetail |
| WhatIfScenarioSelector | Frontend | 3h | Simulation API |
| CLI Verification Tool | Backend | 3h | Signature Service |

---

## 4. Recommended Execution Order

### Sprint 1: Phase 10.1 Foundation (Week 1)

```
Day 1-2:
  ✓ Task 10.1.1: Error Classifier
  ✓ Task 10.1.2: Retry Queue Schema
  ✓ Task 10.1.3: DLQ Schema

Day 3-4:
  ✓ Task 10.1.4: Retry Queue Repository
  ✓ Task 10.1.5: DLQ Repository

Day 5:
  ✓ Task 10.1.6: Retry Worker (start)
```

### Sprint 2: Phase 10.1 Integration (Week 2)

```
Day 1-2:
  ✓ Task 10.1.6: Retry Worker (complete)
  ✓ Task 10.1.12: Circuit Breaker

Day 3-4:
  ✓ Task 10.1.7: ManifestWriter Integration
  ✓ Task 10.1.8: Admin Retry API

Day 5:
  ✓ Task 10.1.9-11: DLQ APIs
  ✓ Task 10.1.13: Metrics
```

### Sprint 3: Phase 10.2 Signature (Week 3)

```
Day 1-2:
  ✓ Task 10.2.1: Signature Types
  ✓ Task 10.2.2: Signing Key Service

Day 3-4:
  ✓ Task 10.2.3: Signature Service
  ✓ Task 10.2.4: ManifestWriter Integration

Day 5:
  ✓ Task 10.2.5: Verification API
  ✓ Task 10.2.8: Signature Metrics
```

### Sprint 4: Frontend (Week 4)

```
Day 1-2:
  ✓ SimulationRunList component
  ✓ SimulationDetail component

Day 3-4:
  ✓ DLQDashboard component
  ✓ Admin routes

Day 5:
  ✓ BundleVerification component
  ✓ Integration testing
```

---

## 5. Risk Assessment

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| Retry storm on S3 outage | HIGH | MEDIUM | Circuit breaker + backoff |
| Key compromise | CRITICAL | LOW | Key rotation + revocation |
| DLQ overflow | MEDIUM | LOW | Alert + auto-archive |
| Frontend delay | LOW | MEDIUM | Backend-first approach |

---

## 6. Success Criteria

### Phase 10 Complete When:

- [ ] Error classifier covers all S3 error types
- [ ] Retry worker processes 100+ retries/min
- [ ] Circuit breaker prevents retry storms
- [ ] DLQ size < 100 entries (SLO)
- [ ] DLQ oldest entry < 24h (SLO)
- [ ] Signature generation < 50ms P99
- [ ] Signature verification < 20ms P99
- [ ] Admin APIs rate limited and audited
- [ ] 175+ tests passing (120 unit + 55 integration)

### Frontend Complete When:

- [ ] Simulation runs visible in UI
- [ ] DLQ dashboard operational
- [ ] Bundle verification accessible
- [ ] Admin panel functional

---

## Sign-Off

| Role | Name | Date |
|------|------|------|
| Author | Kiro | 2026-02-02 |
| Reviewer | - | - |
| Approver | - | - |
