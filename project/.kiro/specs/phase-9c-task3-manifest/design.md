# Phase 9C Task 3 - Bundle Manifest Design

## Manifest Schema (v1.0.0)

```typescript
interface BundleManifestV1 {
  version: '1.0.0';
  
  // Identity
  bundleId: string;
  tenantId: string;
  incidentId: string;
  
  // State (Task 3 scope: SEALED only)
  state: 'SEALED';
  sealedHash: string;       // SHA-256 from bundle-seal.hasher
  sealedAt: string;         // ISO 8601 UTC
  sealRunId: string;        // from bundle_seal_events
  createdAt: string;        // ISO 8601 UTC
  
  // Objects (sorted by objectKey ASC)
  objects: ManifestObjectV1[];
  
  // Computed totals
  objectCount: number;
  totalSizeBytes: string;   // bigint as string
  
  // Integrity
  manifestHash: string;     // SHA-256 of canonical JSON (excluding this field)
  
  // Signature (null until Phase 10/11)
  signature: null | {
    alg: 'ed25519' | 'rsa-pss-sha256';
    keyId: string;
    sig: string;  // base64
  };
  
  // Storage metadata
  storage: {
    provider: 's3';
    bucket: string;
    region?: string;
  };
}

interface ManifestObjectV1 {
  objectKey: string;
  etag: string;
  versionId: string | null;
  contentType: string;
  sizeBytes: string;        // bigint as string
  createdAt: string;        // ISO 8601 UTC
}
```

## Hash Hierarchy

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         HASH HIERARCHY                                   │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  sealedHash (from bundle-seal.hasher)                                   │
│  ├── Input: objects[] (sorted by object_key)                            │
│  ├── Format: ${objectKey}\n${etag}\n${versionId??''}\n${contentType}\n${sizeBytes}
│  └── Purpose: Content integrity (tamper-evident)                        │
│                                                                          │
│  manifestHash                                                            │
│  ├── Input: canonical JSON of manifest (excluding manifestHash field)   │
│  ├── Format: Canonical JSON → SHA-256 → hex                             │
│  └── Purpose: Envelope integrity (complete bundle state)                │
│                                                                          │
│  RELATIONSHIP:                                                           │
│  - sealedHash = content hash (objects only)                             │
│  - manifestHash = envelope hash (metadata + objects)                    │
│  - sealedHash is SUBSET of manifestHash input                           │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

## Canonical JSON Rules

1. Object keys sorted alphabetically (recursive)
2. No whitespace (no spaces, no newlines)
3. No trailing commas
4. Strings escaped per JSON spec
5. Numbers as-is (no scientific notation for integers)
6. null as literal null
7. Arrays preserve order (objects array sorted by objectKey)
8. UTF-8 encoding

## Module Structure

```
bundle-manifest/
├── bundle-manifest.types.ts      # Schema types
├── bundle-manifest.canonical.ts  # Canonical JSON serializer
├── bundle-manifest.builder.ts    # DB → Manifest builder
├── bundle-manifest.hasher.ts     # manifestHash computation
├── bundle-manifest.verifier.ts   # Hash verification
├── bundle-manifest.storage.ts    # S3 read/write (write-once)
├── bundle-manifest.keys.ts       # Key builder for manifest
├── index.ts
└── __tests__/
    ├── bundle-manifest.canonical.spec.ts
    ├── bundle-manifest.builder.spec.ts
    ├── bundle-manifest.verifier.spec.ts
    └── bundle-manifest.integration.spec.ts
```

## Data Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      MANIFEST GENERATION FLOW                            │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  1. Seal completes (Task 2.5)                                           │
│     └── evidence_bundles.state = 'SEALED'                               │
│     └── bundle_seal_events created                                      │
│                                                                          │
│  2. Manifest Builder triggered (post-seal hook)                         │
│     ├── Read evidence_bundles (bundleId, tenantId, incidentId, etc.)    │
│     ├── Read bundle_seal_events (sealRunId)                             │
│     ├── Read evidence_objects (ordered by object_key)                   │
│     └── Build ManifestObjectV1[]                                        │
│                                                                          │
│  3. Compute manifestHash                                                │
│     ├── Build manifest object (without manifestHash)                    │
│     ├── Canonical JSON serialize                                        │
│     └── SHA-256 → hex                                                   │
│                                                                          │
│  4. Write to S3 (write-once)                                            │
│     ├── Key: bundles/{bundleId}/manifest.json                           │
│     ├── If-None-Match: * (fail if exists)                               │
│     └── Content-Type: application/json                                  │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

## Verification Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      MANIFEST VERIFICATION FLOW                          │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  1. Read manifest from S3                                               │
│                                                                          │
│  2. Verify manifestHash                                                 │
│     ├── Extract manifestHash from manifest                              │
│     ├── Remove manifestHash field                                       │
│     ├── Canonical JSON serialize                                        │
│     ├── SHA-256 → hex                                                   │
│     └── Compare with extracted manifestHash                             │
│                                                                          │
│  3. Verify sealedHash                                                   │
│     ├── Extract objects from manifest                                   │
│     ├── Use bundle-seal.hasher to compute hash                          │
│     └── Compare with manifest.sealedHash                                │
│                                                                          │
│  4. (Optional) Verify S3 objects                                        │
│     ├── For each object in manifest                                     │
│     ├── HEAD request to S3                                              │
│     └── Compare etag, size, content-type                                │
│                                                                          │
│  5. Return verification result                                          │
│     ├── manifestHashValid: boolean                                      │
│     ├── sealedHashValid: boolean                                        │
│     ├── objectsValid: boolean (if checked)                              │
│     └── errors: string[] (if any)                                       │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

## Storage Key Format

```
bundles/{bundleId}/manifest.json

Example:
bundles/550e8400-e29b-41d4-a716-446655440000/manifest.json
```

Note: bundleId is the anchor. Tenant/incident not in path (PII + complexity).

## Error Handling

| Error | HTTP | Description |
|-------|------|-------------|
| BUNDLE_NOT_FOUND | 404 | Bundle does not exist |
| BUNDLE_NOT_SEALED | 409 | Bundle is OPEN, cannot generate manifest |
| MANIFEST_EXISTS | 409 | Manifest already exists (write-once) |
| MANIFEST_NOT_FOUND | 404 | Manifest not found in S3 |
| MANIFEST_HASH_MISMATCH | 422 | manifestHash verification failed |
| SEALED_HASH_MISMATCH | 422 | sealedHash verification failed |
| OBJECT_MISMATCH | 422 | S3 object metadata mismatch |
