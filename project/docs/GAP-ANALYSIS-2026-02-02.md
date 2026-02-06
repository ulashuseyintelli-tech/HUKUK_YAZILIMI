# Frontend/Backend Gap Analysis

**Date**: 2026-02-02  
**Status**: Phase 9C LOCKED, Phase 10 SPEC READY

---

## Executive Summary

| Area | Backend | Frontend | Priority |
|------|---------|----------|----------|
| Phase 9C Object Storage | ✅ 100% | N/A (internal) | LOCKED |
| Phase 10.1 Foundation | ✅ 95% (133 tests) | N/A | NEAR COMPLETE |
| Phase 10.1 Worker | ✅ Done | N/A | COMPLETE |
| Phase 10.1 Admin APIs | ✅ Done | N/A | COMPLETE |
| Phase 10.2 Digital Signature | ❌ 0% | ❌ 0% | AFTER 10.1 |
| Simulation API | ✅ 90% | ⚠️ 20% | HIGH |
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

### ❌ NOT STARTED (Phase 10) → ✅ PARTIALLY COMPLETE

**10.1 Retry Pipeline:**
```
manifest-retry/                  ✅ CREATED (133 tests)
├── manifest-error-classifier.ts ✅ 40 tests
├── manifest-retry.types.ts      ✅ 17 tests
├── manifest-retry-queue.repository.ts ✅ 20 tests
├── manifest-dlq.repository.ts   ✅ 18 tests
├── manifest-retry-worker.service.ts   ✅ 23 tests
├── manifest-retry-worker.config.ts    ✅ Created
├── manifest-admin.controller.ts       ✅ 15 tests
├── manifest-admin.dto.ts              ✅ Created
├── circuit-breaker (in worker)        ✅ Implemented
└── __tests__/
    ├── manifest-error-classifier.spec.ts ✅
    ├── manifest-retry.types.spec.ts      ✅
    ├── manifest-retry-queue.repository.spec.ts ✅
    ├── manifest-dlq.repository.spec.ts   ✅
    ├── manifest-retry-worker.spec.ts     ✅
    └── manifest-admin.controller.spec.ts ✅
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
- ✅ `manifest_retry_queue` table (created)
- ✅ `manifest_dead_letter_queue` table (created)
- ❌ `seal_signatures` table (Phase 10.2)

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

## 7. Traceability Matrix (Gap → Story → Task → Test)

### Phase 10.1 Retry Pipeline

| Gap | User Story | Task | Test File | Status |
|-----|------------|------|-----------|--------|
| Error Classifier | US-10.2 | 10.1.1 | manifest-error-classifier.spec.ts | ✅ 40 tests |
| Retry Queue Schema | US-10.1 | 10.1.2 | migration.sql | ✅ Created |
| DLQ Schema | US-10.3 | 10.1.3 | migration.sql | ✅ Created |
| Retry Queue Repo | US-10.1 | 10.1.4 | manifest-retry-queue.repository.spec.ts | ✅ 20 tests |
| DLQ Repo | US-10.3 | 10.1.5 | manifest-dlq.repository.spec.ts | ✅ 18 tests |
| Backoff Types | US-10.1 | 10.1.X | manifest-retry.types.spec.ts | ✅ 17 tests |
| Retry Worker | US-10.1 | 10.1.6 | manifest-retry-worker.spec.ts | ✅ 23 tests |
| ManifestWriter Integration | US-10.1 | 10.1.7 | - | ❌ Not started |
| Admin Retry API | US-10.4 | 10.1.8 | manifest-admin.controller.spec.ts | ✅ 4 tests |
| DLQ Query API | US-10.3 (AC-10.3.2) | 10.1.9 | manifest-admin.controller.spec.ts | ✅ 2 tests |
| DLQ Redrive API | US-10.3 (AC-10.3.3) | 10.1.10 | manifest-admin.controller.spec.ts | ✅ 4 tests |
| DLQ Resolve API | US-10.3 (AC-10.3.4) | 10.1.11 | manifest-admin.controller.spec.ts | ✅ 4 tests |
| Circuit Breaker | US-10.1 | 10.1.12 | manifest-retry-worker.spec.ts | ✅ 9 tests |
| Metrics | US-10.1 (AC-10.1.7) | 10.1.13 | - | ⚠️ Interface defined |

### Phase 10.2 Digital Signature

| Gap | User Story | Task | Test File | Status |
|-----|------------|------|-----------|--------|
| Signature Types | US-10.5 | 10.2.1 | - | ❌ Not started |
| Signing Key Service | US-10.6 | 10.2.2 | - | ❌ Not started |
| Signature Service | US-10.5 | 10.2.3 | - | ❌ Not started |
| ManifestWriter Sig Integration | US-10.5 (AC-10.5.4) | 10.2.4 | - | ❌ Not started |
| Seal Record Schema | US-10.5 (AC-10.5.4) | 10.2.5 | - | ❌ Not started |
| Verification API | US-10.7 (AC-10.7.1) | 10.2.6 | - | ❌ Not started |
| CLI Verification | US-10.7 (AC-10.7.3) | 10.2.7 | - | ❌ Not started |
| Signature Metrics | US-10.5 | 10.2.8 | - | ❌ Not started |

### Frontend Gaps (Sprint 4)

| Gap | Backend Dependency | Component | Status |
|-----|-------------------|-----------|--------|
| SimulationRunList | Simulation API ✅ | SimulationRunList.tsx | ❌ Not started |
| SimulationDetail | Simulation API ✅ | SimulationDetail.tsx | ❌ Not started |
| DLQ Dashboard | DLQ APIs (10.1.9-11) | DLQDashboard.tsx | ❌ Blocked |
| Retry Queue Monitor | Retry Queue Stats | RetryQueueMonitor.tsx | ❌ Blocked |
| Bundle Verification | Verification API (10.2.6) | BundleVerification.tsx | ❌ Blocked |

---

## Sign-Off

| Role | Name | Date |
|------|------|------|
| Author | Kiro | 2026-02-02 |
| Reviewer | - | - |
| Approver | - | - |
