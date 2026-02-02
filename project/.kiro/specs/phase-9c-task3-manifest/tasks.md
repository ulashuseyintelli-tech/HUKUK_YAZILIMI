# Phase 9C Task 3 - Bundle Manifest Tasks

## ✅ COMPLETE (2026-02-02)

All tasks completed. 48 manifest tests + 39 seal tests passing.

## Task List

### Task 3.1: Types ✅
- [x] Create `bundle-manifest.types.ts`
- [x] Define `BundleManifestV1` interface
- [x] Define `ManifestObjectV1` interface
- [x] Define `ManifestSignature` type
- [x] Define `ManifestStorage` type
- [x] Define `VerificationResult` type
- [x] Export constants (MANIFEST_VERSION)

### Task 3.2: Canonical JSON ✅
- [x] Create `bundle-manifest.canonical.ts`
- [x] Implement `canonicalStringify()` with sorted keys
- [x] Handle nested objects recursively
- [x] Handle arrays (preserve order)
- [x] Handle null, boolean, number, string
- [x] Unit tests with golden files

### Task 3.3: Builder ✅
- [x] Create `bundle-manifest.builder.ts`
- [x] Implement `buildManifest(bundleId)` function
- [x] Read from evidence_bundles table
- [x] Read from bundle_seal_events table
- [x] Read from evidence_objects table (ordered)
- [x] Build ManifestObjectV1[] array
- [x] Compute manifestHash
- [x] Return complete BundleManifestV1

### Task 3.4: Hasher ✅
- [x] Create `bundle-manifest.hasher.ts`
- [x] Implement `computeManifestHash(manifest)` function
- [x] Remove manifestHash field before hashing
- [x] Use canonical JSON serialization
- [x] SHA-256 → hex

### Task 3.5: Verifier ✅
- [x] Create `bundle-manifest.verifier.ts`
- [x] Implement `verifyManifest(manifest)` function
- [x] Verify manifestHash
- [x] Verify sealedHash (using bundle-seal.hasher)
- [x] Return VerificationResult

### Task 3.6: Storage ✅
- [x] Create `bundle-manifest.storage.ts`
- [x] Implement `writeManifest(bundleId, manifest)` function
- [x] Use write-once semantics (If-None-Match: *)
- [x] Implement `readManifest(bundleId)` function
- [x] Handle not found / corrupt manifest

### Task 3.7: Key Builder ✅
- [x] Create `bundle-manifest.keys.ts`
- [x] Implement `buildManifestKey(bundleId)` function
- [x] Format: `bundles/{bundleId}/manifest.json`
- [x] Validate bundleId format

### Task 3.8: Seal Pipeline Hook ✅
- [x] Modify `bundle-seal.service.ts`
- [x] Add post-seal manifest write call (fire-and-forget)
- [x] Make it idempotent (write-once handles duplicates)
- [x] Log manifest write success/failure

### Task 3.9: Tests ✅
- [x] Canonical JSON determinism tests
- [x] manifestHash invariant tests
- [x] Builder unit tests
- [x] Verifier unit tests
- [x] Integration test: seal → manifest → verify
- [x] S3/DB mismatch hard fail test (mock)

## Acceptance Criteria ✅

- [x] Manifest schema v1.0.0 implemented
- [x] Canonical JSON deterministic (same input → same output)
- [x] manifestHash computed correctly
- [x] sealedHash verified against objects
- [x] Write-once semantics enforced
- [x] Seal pipeline writes manifest automatically
- [x] All tests passing (48 manifest + 39 seal = 87 total)

## Dependencies

- Phase 9C Task 2.5 (bundle-seal) ✅
- Phase 9C Task 1 (object-store) ✅
- Phase 9C Task 2 (DB migration) ✅
