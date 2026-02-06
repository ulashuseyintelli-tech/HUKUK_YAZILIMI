# Phase 10.3 - Idempotency Hardening Architecture

## Genel Bakış

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           HTTP Request Flow                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Client ──► [Auth Guard] ──► [Rate Limiter] ──► [IdempotencyGateInterceptor]│
│                                                        │                    │
│                                                        ▼                    │
│                                              ┌─────────────────┐            │
│                                              │ IdempotencyGate │            │
│                                              │    Service      │            │
│                                              └────────┬────────┘            │
│                                                       │                     │
│                              ┌────────────────────────┼────────────────┐    │
│                              │                        │                │    │
│                              ▼                        ▼                ▼    │
│                         ┌────────┐              ┌─────────┐      ┌────────┐ │
│                         │ CACHED │              │IN_PROG. │      │PROCEED │ │
│                         └───┬────┘              └────┬────┘      └───┬────┘ │
│                             │                        │               │      │
│                             ▼                        ▼               ▼      │
│                      Return stored            409 + Retry      Execute     │
│                      HTTP status +            After header     Handler     │
│                      result_json                                    │      │
│                                                                     ▼      │
│                                                              ┌──────────┐  │
│                                                              │ complete │  │
│                                                              │ or fail  │  │
│                                                              └──────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
```

## State Machine: manifest_admin_actions

```
                    ┌─────────────────────────────────────────┐
                    │           INSERT (new request)          │
                    └─────────────────┬───────────────────────┘
                                      │
                                      ▼
                              ┌───────────────┐
                              │  IN_PROGRESS  │◄──────────────────┐
                              │               │                   │
                              │ owner_token   │    TAKEOVER       │
                              │ lease_expires │    (lease expired)│
                              └───────┬───────┘                   │
                                      │                           │
                    ┌─────────────────┼─────────────────┐         │
                    │                 │                 │         │
                    ▼                 ▼                 ▼         │
             ┌───────────┐    ┌───────────┐    ┌───────────┐      │
             │ COMPLETED │    │  FAILED   │    │ IN_PROGRESS│─────┘
             │           │    │           │    │ (lease exp)│
             │ http_200  │    │ http_4xx  │    └───────────┘
             │ http_201  │    │ http_5xx  │
             └───────────┘    └───────────┘
                    │                 │
                    └────────┬────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │  CACHE REPLAY   │
                    │ (same requestId)│
                    └─────────────────┘
```


## DB Schema: manifest_admin_actions

```sql
┌─────────────────────────────────────────────────────────────────────────────┐
│                        manifest_admin_actions                               │
├─────────────────────────────────────────────────────────────────────────────┤
│ id               UUID PRIMARY KEY DEFAULT gen_random_uuid()                 │
│ request_id       TEXT NOT NULL UNIQUE          -- Idempotency-Key           │
│ status           manifest_admin_action_status  -- IN_PROGRESS|COMPLETED|FAILED│
│ http_status      INTEGER                       -- 200, 201, 400, 409, 500   │
│ result_code      TEXT                          -- OK, ALREADY_QUEUED, etc.  │
│ result_json      JSONB                         -- Full response payload     │
│ action_type      TEXT NOT NULL                 -- DLQ_RESOLVE, DLQ_REDRIVE  │
│ endpoint         TEXT NOT NULL                 -- POST /admin/dlq/:id/redrive│
│ resource_type    TEXT NOT NULL                 -- DLQ_ENTRY, BUNDLE         │
│ resource_id      UUID                          -- dlq_id or bundle_id       │
│ actor_id         UUID NOT NULL                 -- User ID                   │
│ actor_email      TEXT                          -- User email                │
│ ip_hash          TEXT                          -- Hashed IP                 │
│ owner_token      UUID NOT NULL                 -- Lease ownership           │
│ lease_expires_at TIMESTAMPTZ NOT NULL          -- now() + make_interval(secs=>30)│
│ created_at       TIMESTAMPTZ NOT NULL DEFAULT now()                         │
│ completed_at     TIMESTAMPTZ                   -- When COMPLETED/FAILED     │
│ expires_at       TIMESTAMPTZ NOT NULL          -- now() + make_interval(days=>7)│
├─────────────────────────────────────────────────────────────────────────────┤
│ INDEXES:                                                                    │
│   ux_manifest_admin_actions_request_id  UNIQUE (request_id)                 │
│   ix_manifest_admin_actions_status_lease (status, lease_expires_at)         │
│   ix_manifest_admin_actions_expires (expires_at)                            │
│   ix_manifest_admin_actions_resource (resource_type, resource_id)           │
├─────────────────────────────────────────────────────────────────────────────┤
│ SQL PATTERNS (Prisma $queryRaw):                                            │
│   Interval: make_interval(secs => ${leaseSeconds})                          │
│   Null UUID: ${resourceId ?? null}::uuid                                    │
│   CAS: WHERE status = 'IN_PROGRESS' AND lease_expires_at <= now()           │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Resource-Level Uniqueness: Partial Index

```sql
┌─────────────────────────────────────────────────────────────────────────────┐
│                    manifest_retry_queue (mevcut tablo)                      │
├─────────────────────────────────────────────────────────────────────────────┤
│ MEVCUT INDEX (Phase 10):                                                    │
│   idx_retry_queue_bundle_active UNIQUE (bundle_id)                          │
│     WHERE status IN ('PENDING', 'IN_PROGRESS', 'RETRY_SCHEDULED')           │
│                                                                             │
│ GARANTI: Aynı bundle için sadece BİR aktif job olabilir                     │
│          Farklı requestId ile aynı bundle'a redrive → ALREADY_QUEUED (409)  │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Resolve/Redrive Atomic Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         RESOLVE (Atomik UPDATE)                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  UPDATE manifest_dead_letter_queue                                          │
│  SET status = 'DLQ_RESOLVED',                                               │
│      resolved_at = NOW(),                                                   │
│      resolved_by = $actor_id,                                               │
│      resolution_note = $note                                                │
│  WHERE id = $dlq_id                                                         │
│    AND status = 'DLQ_OPEN'                                                  │
│  RETURNING id, resolved_by, resolved_at;                                    │
│                                                                             │
│  RETURNING boş ise:                                                         │
│    - id yok → 404 NOT_FOUND                                                 │
│    - status ≠ DLQ_OPEN → 409 ALREADY_RESOLVED / ALREADY_REDRIVEN            │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                      REDRIVE (Transactional Flow)                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  BEGIN TRANSACTION;                                                         │
│                                                                             │
│  1. SELECT ... FROM manifest_dead_letter_queue                              │
│     WHERE id = $dlq_id FOR UPDATE;                                          │
│     → status check: DLQ_OPEN required                                       │
│                                                                             │
│  2. INSERT INTO manifest_retry_queue (bundle_id, status, source, ...)       │
│     VALUES ($bundle_id, 'PENDING', 'admin_retry', ...);                     │
│     → Partial unique index violation → ALREADY_QUEUED (409)                 │
│                                                                             │
│  3. UPDATE manifest_dead_letter_queue                                       │
│     SET status = 'DLQ_REDROVE', redriven_at = NOW(), redriven_by = $actor;  │
│                                                                             │
│  COMMIT;                                                                    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```


## Interceptor Flow (Audit Health + Cache Hit + Takeover Audit)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    IdempotencyGateInterceptor Flow                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  1. Check @IdempotencyAction metadata (Reflector)                           │
│     → No metadata? → pass through (next.handle())                           │
│                                                                             │
│  2. Parse Idempotency-Key (fallback: X-Request-Id)                          │
│     → Missing? → 400 MISSING_IDEMPOTENCY_KEY                                │
│                                                                             │
│  3. gate.checkAndAcquire(requestId, ...)                                    │
│     │                                                                       │
│     ├─► CACHED → return EMPTY (stored http_status + stored body)            │
│     │            ⚠️ NO audit/break-glass check (determinism rule)           │
│     │            📌 Deterministic replay: exact same response every time    │
│     │                                                                       │
│     ├─► IN_PROGRESS → 409 + Retry-After: 3, return EMPTY                    │
│     │                                                                       │
│     └─► PROCEED (new or takeover)                                           │
│         │                                                                   │
│         ├─► if (gateResult.takeover) {                                      │
│         │     audit.append(IDEMPOTENCY_TAKEOVER, previousActorId)           │
│         │   }                                                               │
│         │                                                                   │
│         ▼                                                                   │
│  4. Audit health check (fail-safe)                                          │
│     → auditService.getState().mode === 'DEGRADED'?                          │
│     → gate.fail(503, AUDIT_SYSTEM_DEGRADED) → return EMPTY                  │
│                                                                             │
│  5. return next.handle().pipe(                                              │
│       tap(body => gate.complete(200, OK, body)),                            │
│       catchError(err => {                                                   │
│         gate.fail(httpStatus, errorCode, errorBody);  // exactly-once       │
│         return throwError(() => err);                                       │
│       })                                                                    │
│     );                                                                      │
│                                                                             │
│  NOT: Response'u manuel yazdıktan sonra return EMPTY (RxJS 7.x standard)    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Decorator Usage

```typescript
// Controller'da kullanım:
@Post(':id/redrive')
@IdempotencyAction({ 
  actionType: 'DLQ_REDRIVE', 
  resourceType: 'DLQ_ENTRY', 
  resourceIdParam: 'id' 
})
async redrive(@Param('id') id: string) { ... }

// Metadata interface:
interface IdempotencyMeta {
  actionType: string;       // 'DLQ_REDRIVE', 'WORKER_PAUSE', etc.
  resourceType: string;     // 'DLQ_ENTRY', 'WORKER', etc.
  resourceIdParam?: string; // Request param name for resourceId
  leaseSeconds?: number;    // Default: 30
  retentionDays?: number;   // Default: 7
}
```

## Takeover Mechanism (Lease Expired)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Takeover CAS Pattern                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Senaryo: Request A başladı, lease aldı, crash oldu (30s geçti)             │
│           Request B aynı requestId ile geldi                                │
│                                                                             │
│  Request B:                                                                 │
│  1. INSERT ... ON CONFLICT DO NOTHING → conflict (A'nın kaydı var)          │
│  2. SELECT → status=IN_PROGRESS, lease_expires_at < NOW()                   │
│  3. TAKEOVER (CAS - NO FOR UPDATE needed):                                  │
│                                                                             │
│     UPDATE manifest_admin_actions                                           │
│     SET owner_token = gen_random_uuid(),                                    │
│         lease_expires_at = now() + make_interval(secs => 30)                │
│     WHERE id = $action_id::uuid                                             │
│       AND status = 'IN_PROGRESS'                                            │
│       AND lease_expires_at <= now()  -- CAS condition                       │
│     RETURNING id, owner_token;                                              │
│                                                                             │
│  4. RETURNING var → PROCEED (B işlemi devralır)                             │
│     RETURNING yok → Başkası devraldı veya tamamladı → re-read               │
│                                                                             │
│  5. Gate Service döndürür:                                                  │
│     { type: 'PROCEED', actionId, ownerToken, takeover: true,                │
│       previousActorId: row.actor_id }                                       │
│                                                                             │
│  6. Interceptor (boundary) audit.append() çağırır:                          │
│     if (gateResult.takeover) {                                              │
│       audit.append({                                                        │
│         eventType: 'CB_OVERRIDE',  // existing event type                   │
│         beforeState: { previousActorId },                                   │
│         afterState: { newActorId, takeover: true },                         │
│         reason: 'LEASE_EXPIRED_TAKEOVER'                                    │
│       });                                                                   │
│     }                                                                       │
│                                                                             │
│  NOT: FOR UPDATE SKIP LOCKED kullanılmıyor - CAS yeterli.                   │
│       unique(request_id) + CAS UPDATE doğruluk garantisi sağlıyor.          │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## GateResult Type (Güncellenmiş)

```typescript
type GateResult =
  | { 
      type: 'PROCEED'; 
      actionId: string; 
      ownerToken: string; 
      takeover: boolean;           // true if lease was taken over
      previousActorId?: string;    // only present if takeover=true
    }
  | { 
      type: 'CACHED'; 
      actionId: string; 
      httpStatus: number; 
      payload: unknown;
    }
  | { 
      type: 'IN_PROGRESS'; 
      actionId: string; 
      retryAfterSeconds: number;
    };
```

## Cleanup Job (Guardrail A)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    Cleanup Job - Safety Rules                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  DELETE FROM manifest_admin_actions                                         │
│  WHERE status IN ('COMPLETED', 'FAILED')  -- ASLA IN_PROGRESS               │
│    AND expires_at < (NOW() - INTERVAL '1 hour');  -- 1 saat buffer          │
│                                                                             │
│  Neden 1 saat buffer?                                                       │
│  - expires_at = created_at + 7 gün                                          │
│  - Yeni bitmiş action'lar hemen silinmemeli                                 │
│  - Clock skew / race condition koruması                                     │
│                                                                             │
│  Batch delete (opsiyonel):                                                  │
│  WITH to_delete AS (                                                        │
│    SELECT id FROM manifest_admin_actions                                    │
│    WHERE status IN ('COMPLETED', 'FAILED')                                  │
│      AND expires_at < (NOW() - INTERVAL '1 hour')                           │
│    LIMIT 1000                                                               │
│  )                                                                          │
│  DELETE FROM manifest_admin_actions                                         │
│  WHERE id IN (SELECT id FROM to_delete);                                    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Bulk Redrive (Deterministic Selection)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    Bulk Redrive - SKIP LOCKED Pattern                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  SELECT id, bundle_id                                                       │
│  FROM manifest_dead_letter_queue                                            │
│  WHERE status = 'DLQ_OPEN'                                                  │
│    AND last_failed_at < (NOW() - INTERVAL '$olderThanHours hours')          │
│  ORDER BY created_at ASC, id ASC  -- Deterministic ordering                 │
│  LIMIT $maxBatch                                                            │
│  FOR UPDATE SKIP LOCKED;          -- Concurrent-safe                        │
│                                                                             │
│  Aynı transaction içinde:                                                   │
│  1. Her DLQ entry için retry job INSERT                                     │
│  2. DLQ status → DLQ_REDROVE                                                │
│  3. Tek audit event (summary)                                               │
│                                                                             │
│  Partial failure handling:                                                  │
│  - Unique violation (ALREADY_QUEUED) → skip, count as failed                │
│  - Transaction rollback → tüm değişiklikler geri alınır                     │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```


## Component Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          manifest-retry module                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                     manifest-admin.controller.ts                     │    │
│  │  @UseInterceptors(IdempotencyGateInterceptor)                       │    │
│  │  @UseGuards(ManifestAdminAuthGuard, ManifestAdminRateLimiter)       │    │
│  │                                                                     │    │
│  │  @Post(':id/redrive')                                               │    │
│  │  @IdempotencyAction({ actionType: 'DLQ_REDRIVE', ... })             │    │
│  │  async redrive() { ... }                                            │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                    │                                        │
│                                    ▼                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                  idempotency/ (PR-2 skeleton)                        │    │
│  │  ├── idempotency-gate.types.ts                                      │    │
│  │  ├── idempotency-gate.service.ts                                    │    │
│  │  │   ├── checkAndAcquire(): INSERT-first + takeover CAS             │    │
│  │  │   ├── complete(): Mark COMPLETED + store result                  │    │
│  │  │   ├── fail(): Mark FAILED + store error                          │    │
│  │  │   └── extendLease(): Extend with max TTL clamp                   │    │
│  │  ├── idempotency-gate.interceptor.ts                                │    │
│  │  │   ├── Reflector metadata read                                    │    │
│  │  │   ├── CACHED → deterministic replay (no audit check)             │    │
│  │  │   ├── IN_PROGRESS → 409 + Retry-After                            │    │
│  │  │   ├── PROCEED → audit health check → execute                     │    │
│  │  │   └── Takeover audit via audit.append()                          │    │
│  │  ├── idempotency.decorators.ts                                      │    │
│  │  │   └── @IdempotencyAction({ actionType, resourceType, ... })      │    │
│  │  ├── idempotency.module.ts                                          │    │
│  │  └── index.ts                                                       │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                    │                                        │
│                                    ▼                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                      manifest-dlq.repository.ts                      │    │
│  │  - atomicRedrive(): Transaction + partial unique index              │    │
│  │  - resolve(): Atomic UPDATE ... WHERE status='DLQ_OPEN'             │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                  audit/manifest-admin-audit.service.ts               │    │
│  │  - append(): Non-blocking buffered audit                            │    │
│  │  - getState(): { mode: 'NORMAL' | 'DEGRADED', ... }                 │    │
│  │  - Takeover events via existing CB_OVERRIDE type                    │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## PR Stratejisi

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           PR Breakdown                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  PR-1: DB Migration                                                         │
│  ├── 20260203200000_phase10_3_idempotency_gate/migration.sql               │
│  │   ├── CREATE TYPE manifest_admin_action_status                          │
│  │   ├── CREATE TABLE manifest_admin_actions                               │
│  │   └── CREATE UNIQUE INDEX ux_manifest_admin_actions_request_id          │
│  └── Migration up/down test                                                │
│                                                                             │
│  PR-2: Gate Service + Interceptor ✅ DONE (2026-02-03)                      │
│  ├── idempotency-gate.types.ts                                             │
│  ├── idempotency-gate.service.ts                                           │
│  ├── idempotency-gate.interceptor.ts                                       │
│  ├── idempotency.decorators.ts                                             │
│  ├── idempotency.module.ts                                                 │
│  └── Unit + property tests (MUST: 3.6, 3.7) ✅ 12/12 passed                │
│                                                                             │
│  PR-3: Mutations Integration                                               │
│  ├── manifest-dlq.repository.ts (resolve/redrive update)                   │
│  ├── manifest-admin.controller.ts (interceptor entegrasyonu)               │
│  └── Property tests (MUST: 6.6, 6.7)                                       │
│                                                                             │
│  PR-4: Audit Enrichment                                                    │
│  ├── manifest-admin-audit.types.ts (actionId, takeover event)              │
│  ├── manifest-admin-audit.service.ts                                       │
│  └── Audit schema snapshot test                                            │
│                                                                             │
│  PR-5: Concurrency Test Suite                                              │
│  ├── idempotency-gate.concurrency.spec.ts                                  │
│  └── All 10.1-10.5 scenarios                                               │
│                                                                             │
│  PR-6: Cleanup Job + Runbook                                               │
│  ├── idempotency-cleanup.job.ts                                            │
│  ├── Metrics + alerts                                                      │
│  └── Runbook documentation                                                 │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Correctness Properties (10 Adet)

| # | Property | Type | Validates |
|---|----------|------|-----------|
| 1 | Atomik INSERT Gate | NICE | Req 1.1, 1.2, 1.3 |
| 2 | IN_PROGRESS Concurrent Handling | MUST | Req 1.5 |
| 2b| Lease Timeout Recovery | MUST | Req 1.5 |
| 3 | Owner Token Ownership | MUST | Req 1.6 |
| 4 | Idempotent Cache Replay | MUST | Req 4.3, 4.4 |
| 5 | Resource-Level Uniqueness | NICE | Req 2.2, 2.3 |
| 6 | Atomik State Transition | MUST | Req 3.1, 3.3-3.6 |
| 7 | Break-Glass Cache Hit | MUST | Req 8.4 |
| 8 | Deterministic Bulk Selection | MUST | Req 6.3 |
| 9 | Parametre Validasyonu | NICE | Req 6.4-6.6 |
| 10| Audit Event Completeness | NICE | Req 7.1-7.4 |

---

## PR Durumu (2026-02-03)

| PR | Durum | Kanıt |
|----|-------|-------|
| PR-1 | ⏳ Checkpoint bekliyor | Migration up/down + EXPLAIN ANALYZE |
| PR-2 | ✅ DONE | 12/12 test passed, determinism + takeover + owner_token guard |
| PR-3 | ⏳ Sırada | Mutations integration |
| PR-4 | ⏳ Sırada | Audit enrichment |
| PR-5 | ⏳ Sırada | Concurrency test suite |
| PR-6 | ⏳ Sırada | Cleanup job + runbook |

---

## Onay Bekleniyor

Bu mimari doğru mu? Onaylarsan implementasyona geçelim.
