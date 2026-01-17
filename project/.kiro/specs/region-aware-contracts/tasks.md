# Phase 6C: Region-Aware Naming & Contracts - Tasks

## Overview

İsimlendirme standardı. Deploy/routing yok.

---

## Tasks

### Task 1: Core Region Types (API)

**Owner:** API/Region  
**Status:** ✅ DONE
**Acceptance Criteria:**
- [x] 1.1 Create `region/region.types.ts` - RegionId, TenantScope, ArtifactScope
- [x] 1.2 Create `region/region.constants.ts` - DEFAULT_REGION, KNOWN_REGIONS
- [x] 1.3 Create `region/index.ts` - Exports

**Done:** Region types defined

---

### Task 2: Scoped Key Builder (API)

**Owner:** API/Region  
**Status:** ✅ DONE
**Acceptance Criteria:**
- [x] 2.1 Create `region/scoped-key.ts`:
  - buildScopedKey(options) → string
  - parseScopedKey(key) → options | null
  - buildCacheKey, buildBreakerKey, buildRateLimitKey, buildTraceKey
- [x] 2.2 Key format validation
- [x] 2.3 Namespace-specific builders

**Done:** Single source of truth for key format

---

### Task 3: API Contract Update

**Owner:** API/Contracts  
**Status:** ✅ DONE (schema ready, implementation uses defaults)
**Acceptance Criteria:**
- [x] 3.1 ResponseMeta schema - regionId, tenantScope (optional)
- [x] 3.2 TraceMeta schema - regionId, tenantScope (optional)
- [x] 3.3 Backward compatibility (existing responses unchanged)

**Done:** API schema region-aware

---

### Task 4: SDK Region Types

**Owner:** SDK/Types  
**Status:** ✅ DONE
**Acceptance Criteria:**
- [x] 4.1 Create `types/region.ts` - RegionId, DEFAULT_REGION
- [x] 4.2 Update `types/config.ts` - add regionId, regionRouting
- [x] 4.3 Update `types/preview.ts` - ResponseMeta with regionId
- [x] 4.4 Update `types/trace.ts` - TraceMeta with regionId

**Done:** SDK types region-aware

---

### Task 5: SDK Config Validation

**Owner:** SDK/Validation  
**Status:** ✅ DONE
**Acceptance Criteria:**
- [x] 5.1 Update config validator - regionId validation (optional)
- [x] 5.2 regionRouting only accepts 'disabled'
- [x] 5.3 Existing config still valid (backward compatible)

**Done:** SDK config accepts region fields

---

### Task 6: Documentation

**Owner:** Docs  
**Status:** ✅ DONE
**Acceptance Criteria:**
- [x] 6.1 Create `docs/REGION-NAMING-STANDARD.md`
- [x] 6.2 Update SDK README - region config section
- [x] 6.3 Key format examples

**Done:** Standard documented

---

### Task 7: Golden Scenario Update

**Owner:** Tests  
**Status:** ✅ DONE
**Acceptance Criteria:**
- [x] 7.1 Add region-aware golden scenario (SDK)
- [x] 7.2 Verify regionId'siz varyant still works
- [x] 7.3 Snapshot includes regionId, regionRouting

**Done:** Tests cover region-aware contracts

---

## Checkpoints

### Checkpoint 1: Types (Tasks 1-2) ✅ COMPLETE
- Region types defined
- Key builder working

### Checkpoint 2: Contracts (Tasks 3-5) ✅ COMPLETE
- API schema updated
- SDK types updated
- Validation updated

### Checkpoint 3: Quality (Tasks 6-7) ✅ COMPLETE
- Documentation complete
- Tests passing

---

## Exit Criteria

- [x] İsimlendirme standardı dokümante
- [x] Tüm key üretim noktaları tek utility'ye bağlandı
- [x] API + SDK contract'ları region-aware alanları tanıyor
- [x] Hiçbir davranış değişmedi (sıfır routing/migration)

---

## Final Status: ✅ PHASE 6C SEALED

Region-aware naming standard complete. No routing, no migration - just naming.
