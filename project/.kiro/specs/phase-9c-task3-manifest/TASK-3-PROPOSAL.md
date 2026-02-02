# Phase 9C Task 3 - Bundle Manifest + Export Contract

## ✅ IMPLEMENTATION STATUS (2026-02-02)

**Status**: COMPLETE

**Completed**:
- [x] bundle-manifest.types.ts - Schema v1.0.0
- [x] bundle-manifest.canonical.ts - Canonical JSON serializer
- [x] bundle-manifest.hasher.ts - manifestHash computation
- [x] bundle-manifest.keys.ts - Key builder
- [x] bundle-manifest.builder.ts - DB → Manifest builder
- [x] bundle-manifest.verifier.ts - Hash verification
- [x] bundle-manifest.storage.ts - S3 read/write (write-once)
- [x] bundle-manifest.writer.ts - Orchestrator service
- [x] index.ts - Public exports (ManifestWriter, ManifestWriteOperationResult)
- [x] Seal pipeline hook (Task 2.5 integration)
- [x] Unit tests: 40 passing
- [x] Integration tests: 8 passing

**Test Summary**:
- bundle-manifest tests: 48 passing
- bundle-seal tests: 39 passing (with manifest hook)

**Key Implementation Details**:
1. Manifest auto-write on seal (fire-and-forget, outside transaction)
2. Write-once semantics enforced via If-None-Match: *
3. Idempotent: existing manifest not overwritten
4. Hash hierarchy: sealedHash (content) ≠ manifestHash (envelope)
5. Canonical JSON: sorted keys, no whitespace, UTF-8

---

## Problem Statement

Sealed bundle'ı dışarı çıkarıp doğrulayabilmek için:
1. Bundle metadata + object listesi tek bir manifest dosyasında olmalı
2. Manifest deterministic (canonical JSON) olmalı
3. Hash doğrulaması yapılabilmeli
4. Legal-grade audit trail için yeterli bilgi içermeli

## Current State Analysis

### Existing Components

| Component | Location | Purpose |
|-----------|----------|---------|
| EvidenceBundle | simulation/evidence-bundle.types.ts | Simulation export (Phase 8) |
| buildManifestKey() | object-store/evidence-bundle.keys.ts | S3 key builder (Phase 9C T1) |
| SealResult | bundle-seal/bundle-seal.types.ts | DB seal result (Phase 9C T2.5) |
| evidence_bundles | DB table | Bundle state + sealed_hash |
| evidence_objects | DB table | Object metadata |

### Gap

- S3'teki `manifest.json` içeriği tanımlı değil
- DB'deki `sealed_hash` ile S3 manifest arasında bağlantı yok
- Export/verify mekanizması yok

## Proposed Solution

### 1. Manifest JSON Schema

```typescript
/**
 * Bundle Manifest v1.0.0
 * 
 * Stored at: {prefix}/{tenantId}/incidents/{incidentId}/bundles/{bundleId}/manifest.json
 * 
 * RULES:
 * - All timestamps ISO 8601 UTC (Z suffix)
 * - All bigints as strings
 * - Objects sorted by objectKey ASC
 * - Canonical JSON (sorted keys, no whitespace)
 */
interface BundleManifest {
  // Schema version
  version: '1.0.0';
  
  // Identity
  bundleId: string;
  tenantId: string;
  incidentId: string;
  
  // State
  state: 'OPEN' | 'SEALED';
  createdAt: string;        // ISO 8601 UTC
  
  // Seal info (null if OPEN)
  seal: {
    hash: string;           // SHA-256 of objects (from bundle-seal.hasher)
    sealedAt: string;       // ISO 8601 UTC
    runId: string;          // Job/process that sealed
  } | null;
  
  // Objects (sorted by objectKey ASC)
  objects: ManifestObject[];
  
  // Computed totals
  objectCount: number;
  totalSizeBytes: string;   // bigint as string
  
  // Manifest integrity
  manifestHash: string;     // SHA-256 of canonical JSON (excluding this field)
}

interface ManifestObject {
  objectKey: string;
  etag: string;
  versionId: string | null;
  contentType: string;
  sizeBytes: string;        // bigint as string
  createdAt: string;        // ISO 8601 UTC
}
```

### 2. Hash Relationships

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         HASH HIERARCHY                                   │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  seal.hash (from bundle-seal.hasher)                                    │
│  ├── Input: objects[] (sorted by object_key)                            │
│  ├── Format: ${objectKey}\n${etag}\n${versionId??''}\n${contentType}\n${sizeBytes}
│  └── Purpose: Content integrity (tamper-evident)                        │
│                                                                          │
│  manifestHash                                                            │
│  ├── Input: canonical JSON of manifest (excluding manifestHash field)   │
│  ├── Format: JSON.stringify with sorted keys, no whitespace             │
│  └── Purpose: Manifest integrity (complete bundle state)                │
│                                                                          │
│  RELATIONSHIP:                                                           │
│  - seal.hash = content hash (objects only)                              │
│  - manifestHash = envelope hash (metadata + objects)                    │
│  - seal.hash is SUBSET of manifestHash input                            │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### 3. Canonical JSON Rules

```typescript
/**
 * Canonical JSON serialization rules:
 * 
 * 1. Object keys sorted alphabetically (recursive)
 * 2. No whitespace (no spaces, no newlines)
 * 3. No trailing commas
 * 4. Strings escaped per JSON spec
 * 5. Numbers as-is (no scientific notation for integers)
 * 6. null as literal null
 * 7. Arrays preserve order (objects array sorted by objectKey)
 */

function canonicalStringify(obj: unknown): string {
  return JSON.stringify(obj, (key, value) => value, 0);
  // Note: Need custom implementation for sorted keys
}
```

### 4. Storage Key

```
Current (evidence-bundle.keys.ts):
  {prefix}/{tenantId}/incidents/{incidentId}/snapshots/{snapshotId}/manifest.json

Proposed (bundle-centric):
  {prefix}/{tenantId}/incidents/{incidentId}/bundles/{bundleId}/manifest.json
  {prefix}/{tenantId}/incidents/{incidentId}/bundles/{bundleId}/objects/{objectKey}
```

**Decision needed:** Snapshot-centric vs Bundle-centric keyspace?

### 5. Module Structure

```
bundle-manifest/
├── bundle-manifest.types.ts      # Manifest schema types
├── bundle-manifest.canonical.ts  # Canonical JSON serializer
├── bundle-manifest.builder.ts    # DB → Manifest builder
├── bundle-manifest.verifier.ts   # Hash verification
├── bundle-manifest.storage.ts    # S3 read/write
├── index.ts
└── __tests__/
    ├── bundle-manifest.canonical.spec.ts
    ├── bundle-manifest.builder.spec.ts
    └── bundle-manifest.verifier.spec.ts
```

## Decision Points (Need Your Input)

### D1: Manifest Storage Trigger

| Option | Description | Pros | Cons |
|--------|-------------|------|------|
| A | Auto-write on seal | Always in sync | Extra S3 write |
| B | On-demand export | Lazy, saves writes | May be stale |
| C | Both (write on seal + re-export API) | Flexible | Complexity |

**My recommendation:** Option C - Write on seal for audit trail, allow re-export for verification.

### D2: Keyspace Structure

| Option | Description |
|--------|-------------|
| A | Keep snapshot-centric: `snapshots/{snapshotId}/manifest.json` |
| B | Bundle-centric: `bundles/{bundleId}/manifest.json` |
| C | Hybrid: `bundles/{bundleId}/` with links to snapshot objects |

**My recommendation:** Option B - Bundle is the primary entity for legal-grade audit.

### D3: manifestHash Scope

| Option | Description |
|--------|-------------|
| A | Hash entire manifest (excluding manifestHash field) |
| B | Hash only seal-relevant fields (state, seal, objects) |

**My recommendation:** Option A - Full envelope integrity.

### D4: Signature Preparation

| Option | Description |
|--------|-------------|
| A | Add signature field now (null until Phase 10) |
| B | Add signature in Phase 10 (schema version bump) |

**My recommendation:** Option A - Forward compatibility.

## Acceptance Criteria

1. **Manifest Schema**
   - [ ] TypeScript types defined
   - [ ] JSON Schema for validation
   - [ ] Version field for future compatibility

2. **Canonical JSON**
   - [ ] Deterministic serialization
   - [ ] Same input → same output (byte-for-byte)
   - [ ] Unit tests with golden files

3. **Builder**
   - [ ] DB → Manifest conversion
   - [ ] Handles OPEN and SEALED states
   - [ ] Computes manifestHash

4. **Verifier**
   - [ ] Verify seal.hash matches objects
   - [ ] Verify manifestHash matches content
   - [ ] Returns detailed verification result

5. **Storage**
   - [ ] Write manifest to S3 on seal
   - [ ] Read manifest from S3
   - [ ] Handle missing/corrupt manifest

6. **Tests**
   - [ ] Unit tests for canonical JSON
   - [ ] Unit tests for builder
   - [ ] Unit tests for verifier
   - [ ] Integration test: seal → manifest → verify

## Dependencies

- Phase 9C Task 2.5 (bundle-seal) ✅
- Phase 9C Task 1 (object-store) ✅
- Phase 9C Task 2 (DB migration) ✅

## Estimated Effort

- Types + Canonical: 1 hour
- Builder: 1 hour
- Verifier: 1 hour
- Storage: 1 hour
- Tests: 2 hours
- **Total: ~6 hours**

## Next Steps

1. Review this proposal
2. Lock decisions D1-D4
3. Implement in order: types → canonical → builder → verifier → storage → tests
