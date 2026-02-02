# Phase 9C - Final Architecture Diagram

**Status**: LOCKED  
**Date**: 2026-02-02

---

## System Overview

```
┌──────────────────────────────────────────────────────────────────────────────────────┐
│                           PHASE 9C: EVIDENCE BUNDLE SYSTEM                            │
│                              Legal-Grade Immutable Storage                            │
└──────────────────────────────────────────────────────────────────────────────────────┘

                                    ┌─────────────┐
                                    │   Client    │
                                    │  (Web/API)  │
                                    └──────┬──────┘
                                           │
                    ┌──────────────────────┼──────────────────────┐
                    │                      │                      │
                    ▼                      ▼                      ▼
           ┌───────────────┐      ┌───────────────┐      ┌───────────────┐
           │  POST /seal   │      │ GET /manifest │      │ POST /objects │
           │   (NOWAIT)    │      │               │      │  (OPEN only)  │
           └───────┬───────┘      └───────┬───────┘      └───────┬───────┘
                   │                      │                      │
                   ▼                      │                      ▼
┌──────────────────────────────────────────────────────────────────────────────────────┐
│                                  API LAYER                                            │
│  ┌─────────────────────────────────────────────────────────────────────────────────┐ │
│  │                           BundleSealService                                      │ │
│  │  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐             │ │
│  │  │ sealBundleOnDemand│    │sealNextOpenBatch│    │   postSealHook  │             │ │
│  │  │   (FOR UPDATE    │    │  (FOR UPDATE    │    │ (fire-and-forget)│             │ │
│  │  │    NOWAIT)       │    │   SKIP LOCKED)  │    │                 │             │ │
│  │  └────────┬─────────┘    └────────┬────────┘    └────────┬────────┘             │ │
│  │           │                       │                      │                       │ │
│  │           └───────────┬───────────┘                      │                       │ │
│  │                       │                                  │                       │ │
│  │                       ▼                                  ▼                       │ │
│  │           ┌───────────────────────┐          ┌───────────────────────┐          │ │
│  │           │   BundleSealHasher    │          │    ManifestWriter     │          │ │
│  │           │  computeSealSnapshot()│          │ writeManifestForBundle│          │ │
│  │           │   → sealedHash        │          │   → manifestHash      │          │ │
│  │           └───────────────────────┘          └───────────┬───────────┘          │ │
│  └─────────────────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────────────┘
                   │                                          │
                   │                                          │
                   ▼                                          ▼
┌──────────────────────────────────────────────────────────────────────────────────────┐
│                               STORAGE LAYER                                           │
│                                                                                       │
│  ┌─────────────────────────────────┐    ┌─────────────────────────────────┐         │
│  │         PostgreSQL              │    │          S3 / MinIO             │         │
│  │                                 │    │                                 │         │
│  │  ┌───────────────────────────┐ │    │  ┌───────────────────────────┐ │         │
│  │  │    evidence_bundles       │ │    │  │  bundles/{bundleId}/      │ │         │
│  │  │  ├─ id (PK)               │ │    │  │  ├─ manifest.json         │ │         │
│  │  │  ├─ tenant_id             │ │    │  │  └─ objects/              │ │         │
│  │  │  ├─ incident_id           │ │    │  │      ├─ snapshot_*.json   │ │         │
│  │  │  ├─ state (OPEN|SEALED)   │ │    │  │      └─ calc_result_*.json│ │         │
│  │  │  ├─ sealed_hash           │ │    │  └───────────────────────────┘ │         │
│  │  │  ├─ sealed_at             │ │    │                                 │         │
│  │  │  └─ seal_run_id           │ │    │  Write-Once Enforcement:        │         │
│  │  └───────────────────────────┘ │    │  ├─ If-None-Match: *           │         │
│  │                                 │    │  ├─ HEAD verification          │         │
│  │  ┌───────────────────────────┐ │    │  └─ ObjectAlreadyExistsError   │         │
│  │  │  evidence_bundle_objects  │ │    │                                 │         │
│  │  │  ├─ bundle_id (FK)        │ │    │  Metadata Headers:              │         │
│  │  │  ├─ object_key            │ │    │  ├─ x-amz-meta-manifest-version│         │
│  │  │  ├─ size_bytes            │ │    │  ├─ x-amz-meta-bundle-id       │         │
│  │  │  └─ etag                  │ │    │  └─ x-amz-meta-sha256          │         │
│  │  └───────────────────────────┘ │    └─────────────────────────────────┘         │
│  │                                 │                                                │
│  │  ┌───────────────────────────┐ │                                                │
│  │  │ evidence_bundle_seal_events│ │                                                │
│  │  │  ├─ bundle_id (FK)        │ │                                                │
│  │  │  ├─ sealed_hash           │ │                                                │
│  │  │  ├─ object_count          │ │                                                │
│  │  │  └─ total_size_bytes      │ │                                                │
│  │  └───────────────────────────┘ │                                                │
│  │                                 │                                                │
│  │  Triggers (Write-Once):         │                                                │
│  │  ├─ trg_bundle_write_once (45000)                                               │
│  │  ├─ trg_bundle_tenant_check (45001)                                             │
│  │  └─ trg_seal_event_order (45002)                                                │
│  └─────────────────────────────────┘                                                │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

---

## Seal Flow (Transaction Boundary)

```
┌──────────────────────────────────────────────────────────────────────────────────────┐
│                              SEAL TRANSACTION                                         │
│                                                                                       │
│   BEGIN TRANSACTION                                                                   │
│   │                                                                                   │
│   ├─► SELECT * FROM evidence_bundles WHERE id = ? FOR UPDATE [NOWAIT|SKIP LOCKED]    │
│   │                                                                                   │
│   ├─► Validate: state = 'OPEN'                                                        │
│   │                                                                                   │
│   ├─► SELECT * FROM evidence_bundle_objects WHERE bundle_id = ? ORDER BY object_key  │
│   │                                                                                   │
│   ├─► Compute sealedHash = SHA256(canonical(objects))                                │
│   │                                                                                   │
│   ├─► UPDATE evidence_bundles SET state='SEALED', sealed_hash=?, sealed_at=NOW()     │
│   │   └─► Trigger: trg_bundle_write_once now blocks future INSERTs                   │
│   │                                                                                   │
│   ├─► INSERT INTO evidence_bundle_seal_events (...)                                  │
│   │   └─► Trigger: trg_seal_event_order validates state='SEALED'                     │
│   │                                                                                   │
│   COMMIT                                                                              │
│   │                                                                                   │
└───┼──────────────────────────────────────────────────────────────────────────────────┘
    │
    │  ◄─── Transaction boundary ends here
    │
    ▼
┌──────────────────────────────────────────────────────────────────────────────────────┐
│                         POST-SEAL HOOK (Outside Transaction)                          │
│                                                                                       │
│   ManifestWriter.writeManifestForBundle(bundleId)                                    │
│   │                                                                                   │
│   ├─► Build manifest from DB (read sealed bundle + objects)                          │
│   │                                                                                   │
│   ├─► Compute manifestHash = SHA256(canonical(manifest without hash))                │
│   │                                                                                   │
│   ├─► S3 PUT bundles/{bundleId}/manifest.json                                        │
│   │   └─► If-None-Match: * (write-once)                                              │
│   │                                                                                   │
│   ├─► On success: log + metric(success)                                              │
│   │                                                                                   │
│   └─► On failure: log + metric(failure) + NO ROLLBACK                                │
│       └─► Seal remains valid, manifest can be retried (Phase 10)                     │
│                                                                                       │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

---

## Hash Hierarchy

```
┌──────────────────────────────────────────────────────────────────────────────────────┐
│                              HASH HIERARCHY                                           │
│                                                                                       │
│   ┌─────────────────────────────────────────────────────────────────────────────┐    │
│   │                           sealedHash                                         │    │
│   │                     (Content Integrity)                                      │    │
│   │                                                                              │    │
│   │   Input:  objects sorted by key                                              │    │
│   │           ┌─────────────────────────────────────────────────────────┐       │    │
│   │           │ {key}|{type}|{size}|{etag}|{versionId}\n                │       │    │
│   │           │ {key}|{type}|{size}|{etag}|{versionId}\n                │       │    │
│   │           │ ...                                                     │       │    │
│   │           └─────────────────────────────────────────────────────────┘       │    │
│   │                                                                              │    │
│   │   Output: SHA-256 hex string (64 chars)                                      │    │
│   │   Source: bundle-seal.hasher.ts                                              │    │
│   └─────────────────────────────────────────────────────────────────────────────┘    │
│                                                                                       │
│   ┌─────────────────────────────────────────────────────────────────────────────┐    │
│   │                          manifestHash                                        │    │
│   │                     (Export Integrity)                                       │    │
│   │                                                                              │    │
│   │   Input:  canonical JSON of manifest (excluding manifestHash field)          │    │
│   │           ┌─────────────────────────────────────────────────────────┐       │    │
│   │           │ {"bundleId":"...","createdAt":"...","incidentId":"...", │       │    │
│   │           │  "objectCount":N,"objects":[...],"sealRunId":"...",     │       │    │
│   │           │  "sealedAt":"...","sealedHash":"...","signature":null,  │       │    │
│   │           │  "state":"SEALED","storage":{...},"tenantId":"...",     │       │    │
│   │           │  "totalSizeBytes":"...","version":"1.0.0"}              │       │    │
│   │           └─────────────────────────────────────────────────────────┘       │    │
│   │                                                                              │    │
│   │   Output: SHA-256 hex string (64 chars)                                      │    │
│   │   Source: bundle-manifest.hasher.ts                                          │    │
│   └─────────────────────────────────────────────────────────────────────────────┘    │
│                                                                                       │
│   Key Difference:                                                                     │
│   ├─ sealedHash: Proves object content hasn't changed                                │
│   └─ manifestHash: Proves export envelope hasn't changed                             │
│                                                                                       │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

---

## Error Flow

```
┌──────────────────────────────────────────────────────────────────────────────────────┐
│                              ERROR MAPPING                                            │
│                                                                                       │
│   PostgreSQL                    Application                      HTTP                 │
│   ──────────                    ───────────                      ────                 │
│                                                                                       │
│   55P03 (lock_not_available) ──► BundleLockedError ────────────► 423 Locked          │
│   │                                                                                   │
│   │  "Row locked by another process"                                                  │
│   │  Retry: Yes (with backoff)                                                        │
│   │                                                                                   │
│   45000 (raise_exception) ─────► WriteOnceViolationError ──────► 409 Conflict        │
│   │                                                                                   │
│   │  "Cannot INSERT to SEALED bundle"                                                 │
│   │  Retry: No (permanent)                                                            │
│   │                                                                                   │
│   45001 (raise_exception) ─────► TenantMismatchError ──────────► 403 Forbidden       │
│   │                                                                                   │
│   │  "Object tenant_id doesn't match bundle"                                          │
│   │  Retry: No (permanent)                                                            │
│   │                                                                                   │
│   45002 (raise_exception) ─────► InvalidStateTransitionError ──► 409 Conflict        │
│   │                                                                                   │
│   │  "Seal event before SEALED state"                                                 │
│   │  Retry: No (bug)                                                                  │
│   │                                                                                   │
│   23503 (foreign_key_violation)► BundleNotFoundError ──────────► 404 Not Found       │
│   │                                                                                   │
│   │  "Bundle doesn't exist"                                                           │
│   │  Retry: No (permanent)                                                            │
│                                                                                       │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

---

## Metrics Architecture

```
┌──────────────────────────────────────────────────────────────────────────────────────┐
│                              METRICS (Phase 9C.1)                                     │
│                                                                                       │
│   ┌─────────────────────────────────────────────────────────────────────────────┐    │
│   │                        Seal Metrics                                          │    │
│   │                                                                              │    │
│   │   bundle_seal_total{status="success|failure|locked"}                         │    │
│   │   bundle_seal_duration_seconds{quantile="0.5|0.9|0.99"}                      │    │
│   │                                                                              │    │
│   │   Labels: status, lock_strategy (nowait|skip_locked)                         │    │
│   │   ⚠️ NO bundleId label (cardinality explosion)                               │    │
│   └─────────────────────────────────────────────────────────────────────────────┘    │
│                                                                                       │
│   ┌─────────────────────────────────────────────────────────────────────────────┐    │
│   │                       Manifest Metrics                                       │    │
│   │                                                                              │    │
│   │   bundle_manifest_write_total{result="success|failure|already_exists"}       │    │
│   │   bundle_manifest_write_duration_seconds{quantile="0.5|0.9|0.99"}           │    │
│   │                                                                              │    │
│   │   Labels: result, error_code (for failures)                                  │    │
│   │   ⚠️ NO bundleId label (cardinality explosion)                               │    │
│   │   ✅ bundleId goes to structured logs                                        │    │
│   └─────────────────────────────────────────────────────────────────────────────┘    │
│                                                                                       │
│   Alert Rules:                                                                        │
│   ├─ manifest_write_failure_rate > 1% (5m) → P2                                      │
│   └─ bundle_seal_locked_rate > 10% (5m) → P3                                         │
│                                                                                       │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

---

## Phase 10 Transition

```
┌──────────────────────────────────────────────────────────────────────────────────────┐
│                         PHASE 10 ADDITIONS (Planned)                                  │
│                                                                                       │
│   ┌─────────────────────────────────────────────────────────────────────────────┐    │
│   │                      Retry Pipeline                                          │    │
│   │                                                                              │    │
│   │   ManifestWriter                                                             │    │
│   │        │                                                                     │    │
│   │        ├─► Success ──────────────────────────────────────► Done              │    │
│   │        │                                                                     │    │
│   │        ├─► Already Exists ───────────────────────────────► Done (idempotent) │    │
│   │        │                                                                     │    │
│   │        └─► Failure ──┬─► 5xx/timeout ──► Enqueue ──► Retry Worker            │    │
│   │                      │                       │                               │    │
│   │                      │                       ├─► Exponential backoff         │    │
│   │                      │                       ├─► Max 5-7 attempts            │    │
│   │                      │                       └─► Jitter                      │    │
│   │                      │                                                       │    │
│   │                      └─► 4xx/perm ─────► Dead Letter Queue                   │    │
│   │                                                                              │    │
│   └─────────────────────────────────────────────────────────────────────────────┘    │
│                                                                                       │
│   ┌─────────────────────────────────────────────────────────────────────────────┐    │
│   │                      Digital Signature                                       │    │
│   │                                                                              │    │
│   │   manifest.signature: {                                                      │    │
│   │     algorithm: 'RS256' | 'ES256',                                           │    │
│   │     keyId: string,                                                          │    │
│   │     value: string (base64)                                                  │    │
│   │   }                                                                          │    │
│   │                                                                              │    │
│   └─────────────────────────────────────────────────────────────────────────────┘    │
│                                                                                       │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

---

## File Map

```
apps/api/src/modules/calc-preview/diagnostics/object-store/
├── bundle-manifest/
│   ├── bundle-manifest.types.ts        # Schema v1.0.0
│   ├── bundle-manifest.canonical.ts    # Canonical JSON
│   ├── bundle-manifest.hasher.ts       # manifestHash
│   ├── bundle-manifest.keys.ts         # S3 key builder
│   ├── bundle-manifest.builder.ts      # DB → Manifest
│   ├── bundle-manifest.verifier.ts     # Hash verification
│   ├── bundle-manifest.storage.ts      # S3 read/write
│   ├── bundle-manifest.writer.ts       # Orchestrator
│   ├── bundle-manifest.metrics.ts      # Metrics collector
│   ├── index.ts                        # Public exports
│   └── __tests__/
│       ├── bundle-manifest.canonical.spec.ts
│       ├── bundle-manifest.hasher.spec.ts
│       ├── bundle-manifest.verifier.spec.ts
│       └── bundle-manifest.integration.spec.ts
│
├── bundle-seal/
│   ├── bundle-seal.service.ts          # Seal orchestrator
│   ├── bundle-seal.repository.ts       # DB operations
│   ├── bundle-seal.hasher.ts           # sealedHash
│   ├── bundle-seal.errors.ts           # Error mapping
│   ├── index.ts                        # Public exports
│   └── __tests__/
│       ├── bundle-seal.hasher.spec.ts
│       ├── bundle-seal.errors.spec.ts
│       └── bundle-seal.integration.spec.ts
│
├── object-store.interface.ts           # IObjectStoreClient
├── object-store.config.ts              # S3/MinIO config
├── minio-object-store.client.ts        # MinIO implementation
└── evidence-bundle.keys.ts             # Object key builder
```

---

**Phase 9C Architecture: LOCKED**
