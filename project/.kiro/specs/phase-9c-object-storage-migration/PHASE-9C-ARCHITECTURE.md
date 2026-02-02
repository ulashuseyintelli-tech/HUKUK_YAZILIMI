# Phase 9C Architecture: Evidence Bundle → Object Storage

**Status:** DRAFT  
**Date:** 2026-01-22  
**Depends On:** Phase 9B.5 (Snapshot Idempotency - MUST be production-ready first)

---

## 1. Problem Statement

Snapshot'ların `calcResult` ve `calcResultNorm` JSON'ları DB'de şişiyor. Ayrıca:
- Debug trace, request/response logs, attachments gibi ek kanıtlar var
- Bu veriler immutable ve nadiren okunuyor
- DB'de tutmak pahalı ve yavaş

**Çözüm:** Evidence Bundle'ları S3/MinIO'ya taşı, DB'de sadece pointer tut.

---

## 2. Core Concepts

### 2.1 Evidence Bundle
Bir snapshot'ın tüm kanıtlarını içeren immutable paket:
- `calcResult` (raw calculation output)
- `calcResultNorm` (normalized for hash)
- Request/response logs
- Debug trace
- Attachments (opsiyonel)

### 2.2 Manifest (v1)
Bundle'ın içeriğini tanımlayan JSON. **Immutable** - bir kez yazıldıktan sonra değişmez.

### 2.3 Pointer
DB'de saklanan referans: bucket, key, hash, size, etag.

---

## 3. Data Model

### 3.1 Manifest Schema (v1)

```typescript
interface EvidenceManifestV1 {
  // Schema version (for future migrations)
  schemaVersion: 1;
  
  // Identity
  bundleId: string;        // UUID, unique per bundle
  tenantId: string;
  incidentId: string;
  snapshotId: string;      // Links to SimulationSnapshot
  runId: string | null;
  
  // Timestamps
  createdAt: string;       // ISO 8601
  
  // Cross-link to snapshot (integrity check)
  snapshotCalcHash: string; // Must match snapshot.calcHash
  
  // Bundle contents
  items: EvidenceItem[];
  
  // Integrity (calculated AFTER items are finalized)
  bundleContentHash: string; // SHA256 of all item hashes concatenated
}

interface EvidenceItem {
  // Relative path within bundle namespace
  path: string;            // e.g., "calc-result.json", "request.json"
  
  // Content metadata
  contentType: string;     // MIME type
  size: number;            // Bytes
  sha256: string;          // Content hash
  
  // Storage location (filled after upload)
  objectKey?: string;      // S3 key (if stored separately)
}
```

**IMPORTANT:** `manifestSha256` is NOT inside the manifest (circular reference). It's calculated externally and stored in:
- DB pointer
- S3 object metadata (`x-amz-meta-manifest-sha256`)

### 3.2 DB Pointer Model (Prisma)

```prisma
model EvidenceBundlePointer {
  id              String   @id @default(cuid())
  
  // Foreign key to snapshot
  snapshotId      String   @unique @map("snapshot_id")
  snapshot        SimulationSnapshot @relation(fields: [snapshotId], references: [snapshotId])
  
  // Tenant isolation
  tenantId        String   @map("tenant_id")
  
  // S3 location
  bucket          String
  manifestKey     String   @map("manifest_key")
  
  // Integrity
  manifestSha256  String   @map("manifest_sha256")
  bundleContentHash String @map("bundle_content_hash")
  
  // Metadata
  totalSizeBytes  BigInt   @map("total_size_bytes")
  itemCount       Int      @map("item_count")
  
  // S3 metadata
  etag            String?
  versionId       String?  @map("version_id")
  
  // Timestamps
  createdAt       DateTime @default(now()) @map("created_at")
  
  @@index([tenantId], map: "ix_bundle_ptr_tenant")
  @@index([manifestSha256], map: "ix_bundle_ptr_manifest_hash")
  @@map("evidence_bundle_pointers")
}
```

---

## 4. Object Storage Design

### 4.1 Key Naming Convention

```
{bucket}/
  tenants/
    {tenantId}/
      incidents/
        {incidentId}/
          snapshots/
            {snapshotId}/
              manifest.json           # Manifest file
              items/
                calc-result.json      # Individual items
                calc-result-norm.json
                request.json
                response.json
                trace.json
```

**Why separate items instead of tar.zst?**
- Partial download (only fetch what's needed)
- Streaming upload (no buffering entire bundle)
- Individual item integrity verification
- Easier debugging

### 4.2 IObjectStoreClient Interface

```typescript
interface IObjectStoreClient {
  // Write operations
  putObject(input: PutObjectInput): Promise<PutObjectResult>;
  
  // Read operations
  headObject(key: string): Promise<HeadObjectResult | null>;
  getObject(key: string): Promise<GetObjectResult>;
  getObjectStream(key: string): Promise<Readable>;
  
  // Metadata operations
  putObjectTagging(key: string, tags: Record<string, string>): Promise<void>;
  
  // Delete (controlled by retention policy)
  deleteObject(key: string): Promise<void>;
  deleteObjects(keys: string[]): Promise<DeleteObjectsResult>;
}

interface PutObjectInput {
  key: string;
  body: Buffer | Readable;
  contentType: string;
  metadata?: Record<string, string>;  // x-amz-meta-*
  tags?: Record<string, string>;      // For lifecycle rules
}

interface PutObjectResult {
  etag: string;
  versionId?: string;
}

interface HeadObjectResult {
  size: number;
  etag: string;
  contentType: string;
  metadata: Record<string, string>;
  lastModified: Date;
}
```

---

## 5. Write Flow (BundleWriter)

### 5.1 Sequence

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ 1. PREPARE                                                                  │
│                                                                             │
│    Input: snapshotId, calcResult, calcResultNorm, logs, trace               │
│                                                                             │
│    For each item:                                                           │
│      - Serialize to JSON/binary                                             │
│      - Calculate SHA256                                                     │
│      - Build EvidenceItem                                                   │
│                                                                             │
│    Build manifest (without manifestSha256)                                  │
│    Calculate bundleContentHash = SHA256(item1.sha256 + item2.sha256 + ...)  │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 2. IDEMPOTENCY CHECK                                                        │
│                                                                             │
│    HEAD manifest key                                                        │
│    If exists:                                                               │
│      - Fetch manifest                                                       │
│      - Verify bundleContentHash matches                                     │
│      - If match → return existing pointer (idempotent)                      │
│      - If mismatch → ERROR (content changed, should not happen)             │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 3. UPLOAD ITEMS                                                             │
│                                                                             │
│    For each item (parallel, with concurrency limit):                        │
│      - PUT object to S3                                                     │
│      - Verify etag matches expected SHA256 (if S3 returns MD5)              │
│      - On failure: retry with backoff                                       │
│                                                                             │
│    All items uploaded → proceed                                             │
│    Any item failed after retries → ABORT (partial upload, needs cleanup)    │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 4. UPLOAD MANIFEST                                                          │
│                                                                             │
│    Serialize manifest to canonical JSON                                     │
│    Calculate manifestSha256                                                 │
│    PUT manifest with metadata: x-amz-meta-manifest-sha256                   │
│                                                                             │
│    Manifest upload is the "commit point"                                    │
│    Items without manifest = orphans (cleaned up by lifecycle)               │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 5. WRITE DB POINTER                                                         │
│                                                                             │
│    INSERT EvidenceBundlePointer with:                                       │
│      - snapshotId (unique constraint)                                       │
│      - manifestKey, manifestSha256, bundleContentHash                       │
│      - totalSizeBytes, itemCount                                            │
│                                                                             │
│    On P2002 (duplicate snapshotId):                                         │
│      - Fetch existing pointer                                               │
│      - Verify manifestSha256 matches                                        │
│      - Return existing (idempotent)                                         │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 5.2 Failure Modes

| Failure Point | State | Recovery |
|---------------|-------|----------|
| Item upload fails | Partial items in S3 | Retry; orphans cleaned by lifecycle |
| Manifest upload fails | All items in S3, no manifest | Retry; items are orphans |
| DB pointer write fails | Manifest + items in S3 | Retry; S3 data is valid |
| Network timeout | Unknown | Retry with idempotency check |

---

## 6. Hash Chain (Integrity)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              HASH CHAIN                                     │
│                                                                             │
│  ┌─────────────┐                                                            │
│  │ Item 1      │──► SHA256 ──┐                                              │
│  │ (calc.json) │             │                                              │
│  └─────────────┘             │                                              │
│                              │                                              │
│  ┌─────────────┐             │    ┌──────────────────┐                      │
│  │ Item 2      │──► SHA256 ──┼───►│ bundleContentHash│                      │
│  │ (trace.json)│             │    │ = SHA256(concat) │                      │
│  └─────────────┘             │    └──────────────────┘                      │
│                              │              │                               │
│  ┌─────────────┐             │              │                               │
│  │ Item N      │──► SHA256 ──┘              │                               │
│  └─────────────┘                            │                               │
│                                             ▼                               │
│                              ┌──────────────────────────┐                   │
│                              │ Manifest JSON            │                   │
│                              │ (includes bundleContent- │                   │
│                              │  Hash + snapshotCalcHash)│                   │
│                              └──────────────────────────┘                   │
│                                             │                               │
│                                             ▼                               │
│                              ┌──────────────────────────┐                   │
│                              │ manifestSha256           │                   │
│                              │ = SHA256(canonical JSON) │                   │
│                              └──────────────────────────┘                   │
│                                             │                               │
│                                             ▼                               │
│                              ┌──────────────────────────┐                   │
│                              │ DB Pointer               │                   │
│                              │ (stores manifestSha256)  │                   │
│                              └──────────────────────────┘                   │
│                                             │                               │
│                                             ▼                               │
│                              ┌──────────────────────────┐                   │
│                              │ SimulationSnapshot       │                   │
│                              │ (calcHash must match     │                   │
│                              │  manifest.snapshotCalc-  │                   │
│                              │  Hash)                   │                   │
│                              └──────────────────────────┘                   │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Verification:** Given a snapshotId:
1. Fetch snapshot from DB → get calcHash
2. Fetch pointer from DB → get manifestSha256
3. Fetch manifest from S3 → verify SHA256 matches manifestSha256
4. Verify manifest.snapshotCalcHash === snapshot.calcHash
5. For each item: fetch and verify SHA256

---

## 7. Retention Alignment

### 7.1 Strategy: S3 Lifecycle + DB Cleanup Coordination

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         RETENTION FLOW                                      │
│                                                                             │
│  SimulationSnapshot                    EvidenceBundlePointer                │
│  ┌─────────────────┐                   ┌─────────────────┐                  │
│  │ retentionPolicy │                   │ (follows snap-  │                  │
│  │ = STANDARD      │──────────────────►│  shot policy)   │                  │
│  │ expiresAt = X   │                   │                 │                  │
│  └─────────────────┘                   └─────────────────┘                  │
│          │                                      │                           │
│          │ Phase 11 Cleanup                     │                           │
│          ▼                                      ▼                           │
│  ┌─────────────────┐                   ┌─────────────────┐                  │
│  │ DELETE snapshot │                   │ DELETE pointer  │                  │
│  │ (if STANDARD +  │                   │ (cascade or     │                  │
│  │  expired)       │                   │  explicit)      │                  │
│  └─────────────────┘                   └─────────────────┘                  │
│                                                 │                           │
│                                                 │ S3 objects now orphaned   │
│                                                 ▼                           │
│                                        ┌─────────────────┐                  │
│                                        │ S3 Lifecycle    │                  │
│                                        │ Rule:           │                  │
│                                        │ - Delete after  │                  │
│                                        │   7 days if no  │                  │
│                                        │   legalHold tag │                  │
│                                        └─────────────────┘                  │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 7.2 S3 Object Tagging

```typescript
// Applied during upload
const tags = {
  tenantId: snapshot.tenantId,
  snapshotId: snapshot.snapshotId,
  retentionPolicy: snapshot.retentionPolicy,  // STANDARD | PROMOTED | LEGAL_HOLD
  expiresAt: snapshot.expiresAt ?? 'never',
};
```

### 7.3 Lifecycle Rules (Bucket Policy)

```xml
<LifecycleConfiguration>
  <Rule>
    <ID>cleanup-standard-expired</ID>
    <Filter>
      <Tag>
        <Key>retentionPolicy</Key>
        <Value>STANDARD</Value>
      </Tag>
    </Filter>
    <Status>Enabled</Status>
    <Expiration>
      <Days>7</Days>  <!-- Grace period after DB cleanup -->
    </Expiration>
  </Rule>
  
  <Rule>
    <ID>protect-legal-hold</ID>
    <Filter>
      <Tag>
        <Key>retentionPolicy</Key>
        <Value>LEGAL_HOLD</Value>
      </Tag>
    </Filter>
    <Status>Enabled</Status>
    <!-- No expiration - kept forever -->
  </Rule>
</LifecycleConfiguration>
```

---

## 8. Legal Hold Strategy

### 8.1 Two-Layer Protection

| Layer | Mechanism | Purpose |
|-------|-----------|---------|
| DB | `retentionPolicy = LEGAL_HOLD` | Prevents cleanup orchestrator from deleting |
| S3 | Tag `retentionPolicy=LEGAL_HOLD` | Lifecycle rule skips these objects |

### 8.2 S3 Object Lock (Optional, if available)

```typescript
// If bucket has Object Lock enabled
await s3.putObjectLegalHold({
  Bucket: bucket,
  Key: manifestKey,
  LegalHold: { Status: 'ON' },
});
```

**Note:** Object Lock prevents deletion AND overwrite. Use only if compliance requires it.

---

## 9. Observability

### 9.1 Metrics

```typescript
// Upload metrics
evidence_bundle_upload_total{result="SUCCESS"|"FAIL"|"ALREADY_EXISTS", tenant}
evidence_bundle_upload_duration_seconds{quantile="0.5"|"0.9"|"0.99"}
evidence_bundle_bytes_uploaded_total{tenant}
evidence_bundle_items_uploaded_total{tenant}

// Integrity metrics
evidence_bundle_hash_verification_total{result="PASS"|"FAIL", stage="item"|"manifest"|"cross_link"}
evidence_bundle_hash_mismatch_total  // CRITICAL ALERT

// Pointer metrics
evidence_bundle_pointer_write_total{result="SUCCESS"|"FAIL"|"IDEMPOTENT"}
evidence_bundle_orphan_detected_total  // S3 object without DB pointer
```

### 9.2 Alerts

| Alert | Condition | Severity |
|-------|-----------|----------|
| HashMismatch | `hash_mismatch_total > 0` | CRITICAL |
| UploadFailSpike | `upload_fail rate > 5%` | HIGH |
| OrphanSpike | `orphan_detected > 100/hour` | MEDIUM |
| PointerWriteFail | `pointer_write_fail > 0` | HIGH |

---

## 10. Task Breakdown (P0)

| # | Task | Acceptance Criteria | Est | Status |
|---|------|---------------------|-----|--------|
| 1 | Write-Once + Keyspace Hardening | Immutable objects, key validation | 4h | ✅ DONE |
| **2** | **DB Migration (Evidence Bundle Schema)** | 3 tables, constraints, trigger | 4h | **NEXT** |
| 2.5 | BundleSealJob | Seal transaction, idempotency | 4h | Blocked by Task 2 |
| 3 | IObjectStoreClient interface | Interface + MinIO implementation | 4h | ✅ DONE |
| 4 | BundleWriter service | Upload flow, idempotency, retry | 6h | |
| 5 | EvidenceBundlePointer Prisma model | Migration, repository | 2h | |
| 6 | Hash chain verification | Verify manifest ↔ snapshot integrity | 3h | |
| 7 | S3 tagging for retention | Tag on upload, lifecycle doc | 2h | |
| 8 | Integration tests (MinIO docker) | Upload, head, verify, idempotency | 4h | |
| 9 | Metrics + alerts | Prometheus metrics, alert rules | 2h | |

**Task 2 Spec:** `.kiro/specs/phase-9c-task2-db-migration/`

**Total:** ~35h

### Task 2 - DB Migration (Critical Path)

Task 2 establishes PostgreSQL schema for Evidence Bundle state management:

**Tables:**
- `evidence_bundles` - Bundle state (OPEN/SEALED), hash, timestamps
- `evidence_objects` - Object metadata (key, etag, size, content_type)
- `bundle_seal_events` - Seal audit trail (run_id, hash, counts)

**Key Constraints:**
- Partial unique index: 1 OPEN bundle per tenant+incident
- CHECK constraints: state ↔ sealed_hash/sealed_at invariant
- DB trigger: Block INSERT on sealed bundle

**Dual Seal Mode:**
- Worker: `FOR UPDATE SKIP LOCKED`
- API: `FOR UPDATE NOWAIT`

See full spec: `.kiro/specs/phase-9c-task2-db-migration/`

---

## 11. Open Questions

1. **Compression:** Should items be gzip'd before upload? (saves bandwidth, adds CPU)
2. **Encryption:** S3 SSE-S3 vs SSE-KMS vs client-side?
3. **Multi-region:** Replication for DR?
4. **Max bundle size:** Limit per snapshot? (e.g., 100MB)

---

## 12. Dependencies

- Phase 9B.5: Snapshot idempotency (MUST be production-ready first)
- Phase 11: Cleanup orchestration (for retention alignment)
- MinIO/S3: Infrastructure provisioning

