# Phase 9C Implementation Checklist

**Status:** LOCKED  
**Date:** 2026-01-23  
**Depends On:** Phase 9B.5 (LOCKED - DB-level enforced idempotency)

---

## Invariants (Değişmez Kurallar)

Bu checklist boyunca aşağıdaki invariant'lar korunmalıdır:

1. **SEALED terminal:** `SEALED → *` geçiş yok. SEALED bir bundle asla FAILED, DRAFT veya ORPHANED'a dönüştürülemez.
2. **Retry policy:** `FAILED → DRAFT` geçişi ancak retry policy ile ve `sealAttemptCount` artışıyla olur.
3. **Hash chain integrity:** `manifest.snapshotCalcHash === snapshot.calcHash` her zaman doğrulanmalı.
4. **Write-once:** Aynı manifest key'e ikinci yazma fiziksel olarak engellenmeli.

---

## 0) Foundation Gates

- [x] Feature flag: `EVIDENCE_BUNDLE_S3_ENABLED` (deployment-level gate)
- [x] Config validation at startup:
  - `S3_ENDPOINT` (required)
  - `S3_BUCKET` (required)
  - `S3_REGION` (required, default: `us-east-1`)
  - `S3_ACCESS_KEY` (required)
  - `S3_SECRET_KEY` (required)
  - `S3_FORCE_PATH_STYLE=true` (MinIO için zorunlu)
  - `BUNDLE_KEY_PREFIX` (default: `tenants`)
- [x] DI setup:
  - `IObjectStoreClient` interface
  - `MinioObjectStoreClient` implementation
  - `IEvidenceBundlePointerRepository` (Prisma) - schema added
- [x] Startup guard: Flag kapalıyken S3 client inject edilmiyor, routes yüklenmiyor

**Implementation Files:**
- `object-store/object-store.config.ts` - Zod validation, feature flag
- `object-store/object-store.interface.ts` - IObjectStoreClient interface
- `object-store/minio-object-store.client.ts` - AWS SDK v3 implementation
- `object-store/evidence-bundle.module.ts` - NestJS module with conditional loading
- `object-store/evidence-bundle.tokens.ts` - DI tokens
- `object-store/index.ts` - Public exports
- `prisma/schema.prisma` - EvidenceBundlePointer model added

**Test File:**
- `object-store/__tests__/evidence-bundle.feature-flag.spec.ts`

**Acceptance:** `EVIDENCE_BUNDLE_S3_ENABLED=false` → hiçbir S3 operasyonu çalışmıyor. ✓

---

## 1) Object Model ve Keyspace (Immutability-First)

### Key Format (Immutable)
```
{bucket}/
  tenants/
    {tenantId}/
      incidents/
        {incidentId}/
          snapshots/
            {snapshotId}/
              manifest.json
              items/
                calc-result.json
                calc-result-norm.json
                request.json
                response.json
                trace.json
```

- [ ] Key builder utility: `buildManifestKey(tenantId, incidentId, snapshotId)`
- [ ] Key builder utility: `buildItemKey(tenantId, incidentId, snapshotId, itemName)`
- [ ] Write-once guard: `If-None-Match: *` header ile PUT
- [ ] Fallback guard: PUT sonrası HEAD + etag/versionId doğrulama (zorunlu)
- [ ] Metadata fields: `contentType`, `size`, `sha256`, `capturedAt`, `source`

**Acceptance:** Aynı manifest key için ikinci PUT → 412 Precondition Failed. Eğer 412 gelmezse HEAD ile doğrulama yapılır; sha mismatch → hard fail + audit.

---

## 2) DB Şeması (EvidenceBundlePointer)

### Prisma Model
```prisma
model EvidenceBundlePointer {
  id                  String    @id @default(cuid())
  
  // Foreign key to snapshot (1:1)
  snapshotId          String    @unique @map("snapshot_id")
  snapshot            SimulationSnapshot @relation(fields: [snapshotId], references: [snapshotId])
  
  // Tenant isolation
  tenantId            String    @map("tenant_id")
  
  // S3 location
  bucket              String
  manifestKey         String    @map("manifest_key")
  
  // Integrity
  manifestSha256      String    @map("manifest_sha256")
  bundleContentHash   String    @map("bundle_content_hash")
  
  // S3 metadata (write-once doğrulama için)
  etag                String?
  versionId           String?   @map("version_id")
  
  // Size tracking
  totalSizeBytes      BigInt    @map("total_size_bytes")
  itemCount           Int       @map("item_count")
  
  // State machine
  state               BundleState @default(DRAFT)
  
  // Forensic/debug fields (zorunlu)
  sealAttemptCount    Int       @default(0) @map("seal_attempt_count")
  lastSealAttemptAt   DateTime? @map("last_seal_attempt_at")
  lastErrorCode       String?   @map("last_error_code")
  lastErrorDetail     String?   @map("last_error_detail")
  
  // Timestamps
  createdAt           DateTime  @default(now()) @map("created_at")
  sealedAt            DateTime? @map("sealed_at")
  
  @@index([tenantId], map: "ix_bundle_ptr_tenant")
  @@index([manifestSha256], map: "ix_bundle_ptr_manifest_hash")
  @@index([state, createdAt], map: "ix_bundle_ptr_state_created")
  @@map("evidence_bundle_pointers")
}

enum BundleState {
  DRAFT
  SEALED
  FAILED
  ORPHANED
}
```

### State Machine Invariants

```
DRAFT ──────────────────────────────────────► SEALED (manifest yazıldığında)
  │                                              │
  │ (retry exhausted)                            │ (TERMINAL - değişmez)
  ▼                                              │
FAILED ◄────────────────────────────────────────┘
  │                                              
  │ (retry policy + sealAttemptCount++)          
  ▼                                              
DRAFT                                            

ORPHANED ← (reconciliation tarafından set edilir, S3'te var DB'de yok durumu)
```

**KRITIK INVARIANT:** `SEALED → *` geçiş YOK. SEALED terminal state'tir.

- [ ] Migration: `20260123000000_phase_9c_evidence_bundle_pointer`
- [ ] State enum: `DRAFT | SEALED | FAILED | ORPHANED`
- [ ] Forensic fields: `sealAttemptCount`, `lastSealAttemptAt`, `lastErrorCode`, `lastErrorDetail`
- [ ] Index: `ix_bundle_ptr_state_created` (reconciliation için)

**Acceptance:** `snapshotId` UNIQUE constraint DB seviyesinde zorlanıyor. SEALED state'ten çıkış yok.

---

## 2.5) Snapshot → Bundle Trigger (Async Job)

### BundleSealJob

- [ ] Trigger: Snapshot created event veya polling (her 30 saniye)
- [ ] Query: `SELECT * FROM simulation_snapshots WHERE NOT EXISTS (SELECT 1 FROM evidence_bundle_pointers WHERE snapshotId = s.snapshotId)`
- [ ] Job key (idempotent): `bundle-seal:{tenantId}:{snapshotId}`
- [ ] Concurrency control:
  - Per-tenant limit: 3 concurrent seal operations
  - Global limit: 20 concurrent seal operations
- [ ] Distributed lock: Redis-based lock per snapshotId (TTL: 5 min)

**Acceptance:** Aynı snapshot için concurrent seal attempt'ler lock ile engelleniyor.

---

## 3) Write Flow (2-Phase Seal Pattern)

### Sequence

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ PHASE 1: IDEMPOTENCY CHECK                                                  │
│                                                                             │
│   HEAD manifest key                                                         │
│   If exists:                                                                │
│     - Fetch manifest                                                        │
│     - Verify bundleContentHash matches                                      │
│     - If match → return existing pointer (idempotent)                       │
│     - If mismatch → HARD FAIL + audit (content changed, impossible state)   │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ PHASE 2: UPLOAD ITEMS                                                       │
│                                                                             │
│   For each item (parallel, concurrency limit: 5):                           │
│     - Serialize to JSON                                                     │
│     - Calculate SHA256                                                      │
│     - PUT object to S3 with If-None-Match: *                                │
│     - HEAD + verify etag (fallback guard)                                   │
│     - On failure: retry with backoff (max 3)                                │
│                                                                             │
│   All items uploaded → proceed                                              │
│   Any item failed after retries → state=FAILED, record error, exit          │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ PHASE 3: BUILD & UPLOAD MANIFEST                                            │
│                                                                             │
│   Build manifest JSON:                                                      │
│     - schemaVersion: 1                                                      │
│     - bundleId, tenantId, incidentId, snapshotId, runId                     │
│     - snapshotCalcHash (cross-link to snapshot.calcHash)                    │
│     - calcResultNormSha256 (dual-write drift guard)                         │
│     - items[] with path, contentType, size, sha256                          │
│     - bundleContentHash = SHA256(concat all item sha256s)                   │
│                                                                             │
│   Calculate manifestSha256 = SHA256(canonical JSON)                         │
│   PUT manifest.json with If-None-Match: *                                   │
│   HEAD + verify etag/versionId (fallback guard - ZORUNLU)                   │
│                                                                             │
│   Manifest upload is the "commit point"                                     │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ PHASE 4: WRITE DB POINTER                                                   │
│                                                                             │
│   UPDATE EvidenceBundlePointer SET:                                         │
│     state = SEALED                                                          │
│     manifestSha256 = calculated                                             │
│     bundleContentHash = calculated                                          │
│     etag = from HEAD response                                               │
│     versionId = from HEAD response                                          │
│     sealedAt = now()                                                        │
│     sealAttemptCount++                                                      │
│     lastSealAttemptAt = now()                                               │
│                                                                             │
│   On P2002 (duplicate snapshotId):                                          │
│     - Fetch existing pointer                                                │
│     - Verify manifestSha256 matches                                         │
│     - Return existing (idempotent)                                          │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Failure Modes

| Failure Point | State | Recovery |
|---------------|-------|----------|
| Item upload fails | DRAFT/FAILED | Retry; orphan items cleaned by lifecycle |
| Manifest upload fails | DRAFT | Retry; items are orphans until manifest written |
| DB pointer write fails | DRAFT | Retry; S3 data is valid, HEAD will find it |
| Network timeout | Unknown | Retry with idempotency check (HEAD first) |

- [ ] Idempotency check: HEAD manifest → exists → verify hash → return existing
- [ ] Item upload: Parallel with concurrency limit 5
- [ ] Manifest upload: If-None-Match: * + HEAD verify (zorunlu)
- [ ] DB write: etag/versionId kaydet
- [ ] Error recording: `lastErrorCode`, `lastErrorDetail` güncelle

**Acceptance:** Manifest yazılmadan state SEALED olmaz. HEAD verify başarısız olursa hard fail.

---

## 4) Verification Path (Read + Hash Chain)

### Verification Steps

1. Fetch snapshot from DB → get `calcHash`
2. Fetch pointer from DB → get `manifestSha256`, `bundleContentHash`
3. Fetch manifest from S3 → verify `SHA256(manifest) === manifestSha256`
4. Cross-link verify: `manifest.snapshotCalcHash === snapshot.calcHash`
5. Dual-write drift guard: `manifest.calcResultNormSha256 === SHA256(snapshot.calcResultNorm)`
6. For each item: HEAD + verify `sha256` matches manifest

### Error Types

| Error | Condition | Severity |
|-------|-----------|----------|
| `MANIFEST_HASH_MISMATCH` | SHA256(manifest) ≠ pointer.manifestSha256 | CRITICAL |
| `SNAPSHOT_CROSS_LINK_MISMATCH` | manifest.snapshotCalcHash ≠ snapshot.calcHash | CRITICAL |
| `DUAL_WRITE_DRIFT_DETECTED` | manifest.calcResultNormSha256 ≠ SHA256(snapshot.calcResultNorm) | HIGH |
| `ITEM_HASH_MISMATCH` | item.sha256 ≠ actual SHA256 | CRITICAL |
| `ITEM_NOT_FOUND` | S3 HEAD returns 404 | HIGH |

- [ ] Manifest verify: SHA256 match
- [ ] Cross-link verify: snapshotCalcHash match
- [ ] Dual-write drift guard: calcResultNormSha256 match
- [ ] Item verify: Per-item SHA256 check
- [ ] Error types: Typed errors with audit trail

**Acceptance:** Hash mismatch → metric emitted + audit event logged. Drift detected → `EVIDENCE_DRIFT_DETECTED` alarm.

---

## 5) Reconciliation Job (Orphan Detection & Recovery)

### Two-Window Strategy

| Window | Age | Action |
|--------|-----|--------|
| Grace | `< 10 min` | Dokunma (seal in progress olabilir) |
| Active Draft | `10 min - 24 hour` | Retry seal |
| Stale Draft | `>= 24 hour` | Mark FAILED + alarm |

### Reconciliation Logic

```typescript
// Pseudo-code
async function reconcile() {
  const now = clock.now();
  const graceThreshold = now - 10 * 60 * 1000;      // 10 min ago
  const staleThreshold = now - 24 * 60 * 60 * 1000; // 24 hours ago
  
  // 1. Find active drafts (retry candidates)
  const activeDrafts = await db.findMany({
    where: {
      state: 'DRAFT',
      createdAt: { lt: graceThreshold, gt: staleThreshold },
      sealAttemptCount: { lt: 3 }
    }
  });
  
  for (const draft of activeDrafts) {
    await retrySeal(draft);
  }
  
  // 2. Find stale drafts (mark failed)
  const staleDrafts = await db.findMany({
    where: {
      state: 'DRAFT',
      createdAt: { lt: staleThreshold }
    }
  });
  
  for (const stale of staleDrafts) {
    await markFailed(stale, 'STALE_DRAFT');
    metrics.counter('reconciliation_stale_draft_total');
  }
  
  // 3. Orphan detection: S3'te manifest var, DB'de pointer yok
  const s3Manifests = await listManifestsInS3();
  for (const manifest of s3Manifests) {
    const pointer = await db.findByManifestKey(manifest.key);
    if (!pointer) {
      await quarantineOrphan(manifest);
      metrics.counter('reconciliation_orphan_detected_total');
      alert('ORPHANED_MANIFEST', { key: manifest.key });
    }
  }
}
```

- [ ] Grace window: `< 10 min` → skip
- [ ] Active draft window: `10 min - 24 hour` → retry seal
- [ ] Stale draft: `>= 24 hour` → mark FAILED + alarm
- [ ] Orphan detection: S3 manifest without DB pointer → quarantine + alarm
- [ ] Orphan policy: Quarantine only, silme yok (manual investigation)

**Acceptance:** DB–S3 drift gözden kaçmıyor. Her drift türü için açık aksiyon ve alarm var.

---

## 6) Retention & Legal Hold

### S3 Tags (Applied During Upload)

```typescript
const tags = {
  tenantId: snapshot.tenantId,
  snapshotId: snapshot.snapshotId,
  retentionPolicy: snapshot.retentionPolicy,  // STANDARD | PROMOTED | LEGAL_HOLD
  expiresAt: snapshot.expiresAt ?? 'never',
};
```

### Lifecycle Rules

```xml
<LifecycleConfiguration>
  <Rule>
    <ID>cleanup-standard-expired</ID>
    <Filter>
      <Tag><Key>retentionPolicy</Key><Value>STANDARD</Value></Tag>
    </Filter>
    <Status>Enabled</Status>
    <Expiration><Days>7</Days></Expiration>
  </Rule>
  
  <Rule>
    <ID>protect-legal-hold</ID>
    <Filter>
      <Tag><Key>retentionPolicy</Key><Value>LEGAL_HOLD</Value></Tag>
    </Filter>
    <Status>Enabled</Status>
    <!-- No expiration -->
  </Rule>
</LifecycleConfiguration>
```

- [ ] S3 tags: tenantId, snapshotId, retentionPolicy, expiresAt
- [ ] Lifecycle rule: `retentionPolicy=STANDARD` → 7 gün sonra expire
- [ ] Lifecycle rule: `retentionPolicy=LEGAL_HOLD` → expire yok
- [ ] Delete guard: Legal hold altında delete attempt → reject + audit
- [ ] Tag sync: Snapshot retention policy değişince S3 tag güncelle

**Acceptance:** Legal hold bundle silinemiyor. Delete attempt → deterministic reject.

---

## 7) Observability

### Metrics

```typescript
// Seal metrics
bundle_seal_success_total{tenant}
bundle_seal_failure_total{tenant, error_code}
bundle_seal_duration_seconds{quantile="0.5"|"0.9"|"0.99"}

// Verify metrics
bundle_verify_success_total{tenant}
bundle_verify_mismatch_total{tenant, mismatch_type}

// Reconciliation metrics
reconciliation_run_total
reconciliation_draft_retried_total
reconciliation_stale_draft_total
reconciliation_orphan_detected_total
reconciliation_drift_detected_total

// Storage metrics
bundle_total_size_bytes{tenant}
bundle_item_count{tenant}
```

### Logs (Structured)

```typescript
// Allowlist meta (her log'da)
{
  tenantId: string,
  incidentId: string,
  snapshotId: string,
  bundleId: string,
  itemCount: number,
  totalSizeBytes: number,
}
```

### Audit Events

| Event | Trigger | Severity |
|-------|---------|----------|
| `BUNDLE_SEALED` | Successful seal | INFO |
| `BUNDLE_SEAL_FAILED` | Seal failure after retries | WARN |
| `BUNDLE_VERIFY_MISMATCH` | Hash mismatch detected | CRITICAL |
| `BUNDLE_ORPHAN_DETECTED` | S3 object without DB pointer | HIGH |
| `BUNDLE_DRIFT_DETECTED` | Dual-write drift | HIGH |
| `BUNDLE_DELETE_BLOCKED` | Legal hold prevented delete | INFO |

- [ ] Metrics: seal success/failure, verify mismatch, reconciliation drift
- [ ] Latency histogram: seal duration
- [ ] Logs: Structured with allowlist meta
- [ ] Audit events: All state changes and anomalies

**Acceptance:** "Ne oldu?" sorusu 5 dakikada cevaplanır. Tüm anomaliler metric + audit ile izlenebilir.

---

## 8) Integration Tests (MinIO + PostgreSQL)

### Test Cases

| # | Test | Expected |
|---|------|----------|
| 1 | Item put + seal | state=SEALED, manifest exists |
| 2 | Same snapshotId second seal | Idempotent return, single bundle |
| 3 | Manifest hash mismatch | Verify fails + metric emitted |
| 4 | Partial failure (items ok, manifest fail) | state=DRAFT, retry possible |
| 5 | Legal hold prevents delete | Delete rejected, audit logged |
| 6 | Concurrent seal attempts | Lock prevents race, single bundle |
| 7 | Orphan detection | Reconciliation finds orphan, alarm fired |
| 8 | Dual-write drift | EVIDENCE_DRIFT_DETECTED alarm |
| 9 | SEALED state immutability | Any state change attempt fails |

### Test Environment

```yaml
# docker-compose.test.yml
services:
  postgres:
    image: postgres:16-alpine
    ports: ["5433:5432"]
  minio:
    image: minio/minio:latest
    command: server /data
    ports: ["9000:9000"]
```

- [ ] Test 1: item put + seal → SEALED
- [ ] Test 2: same snapshotId second seal → idempotent return
- [ ] Test 3: manifest hash mismatch → verify fails + metric
- [ ] Test 4: partial failure → state not SEALED
- [ ] Test 5: legal hold prevents delete
- [ ] Test 6: concurrent seal attempts → single bundle
- [ ] Test 7: orphan detection works
- [ ] Test 8: dual-write drift detected
- [ ] Test 9: SEALED state is terminal (no transitions out)

**Acceptance:** CI'da MinIO + PostgreSQL ile tüm testler koşuyor.

---

## Task Breakdown (Estimated Hours)

| # | Task | Est | Status |
|---|------|-----|--------|
| 0 | Foundation Gates (config, DI, feature flag) | 3h | ✅ DONE |
| 1 | Object Model (key builders, write-once guard) | 2h | ⏳ TODO |
| 2 | DB Schema (Prisma model, migration) | 2h | 🔶 PARTIAL (schema added, migration pending) |
| 2.5 | BundleSealJob (async trigger) | 3h | ⏳ TODO |
| 3 | Write Flow (2-phase seal, fallback guard) | 6h | ⏳ TODO |
| 4 | Verification Path (hash chain, drift guard) | 4h | ⏳ TODO |
| 5 | Reconciliation Job (two-window, orphan detection) | 4h | ⏳ TODO |
| 6 | Retention & Legal Hold (tags, lifecycle) | 2h | ⏳ TODO |
| 7 | Observability (metrics, logs, audit) | 3h | ⏳ TODO |
| 8 | Integration Tests (9 test cases) | 5h | ⏳ TODO |

**Total:** ~34h  
**Completed:** ~4h (Task 0 + partial Task 2)  
**Progress:** ~12%

---

## Sign-Off Criteria

Phase 9C is PRODUCTION-READY when:

- [ ] All 9 integration tests passing against MinIO + PostgreSQL
- [ ] SEALED state immutability verified (no transitions out)
- [ ] Dual-write drift guard active and tested
- [ ] Reconciliation job running in staging for 24h without false positives
- [ ] Metrics dashboard showing seal success rate > 99%
- [ ] Ops runbook reviewed and approved

---

## Related Documents

- `PHASE-9C-ARCHITECTURE.md` - Detailed architecture
- `design.md` - Design document
- `requirements.md` - Requirements
- `tasks.md` - Original task breakdown
- `../phase-9b5-snapshot-store-cutover/PHASE-9B5-LOCK.md` - Dependency (idempotency)
