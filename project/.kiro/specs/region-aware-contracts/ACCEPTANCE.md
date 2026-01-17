# Phase 6C: Region-Aware Naming & Contracts - ACCEPTANCE

**Status:** ✅ SEALED  
**Date:** 2026-01-16  
**Phase:** 6C

---

## Summary

Region-aware isimlendirme standardı. Deploy/routing yok, sadece "dil" standardizasyonu.

**Hedef:** Bugün tek region'da koşarken bile, yarın çok region'a geçince isimlerin ve sözleşmelerin kırılmaması.

---

## Deliverables

### API (Backend)

| Component | Status | Location |
|-----------|--------|----------|
| Region Types | ✅ | `region/region.types.ts` |
| Region Constants | ✅ | `region/region.constants.ts` |
| Scoped Key Builder | ✅ | `region/scoped-key.ts` |
| Module Exports | ✅ | `region/index.ts` |

### SDK (Client)

| Component | Status | Location |
|-----------|--------|----------|
| Region Types | ✅ | `types/region.ts` |
| Config Update | ✅ | `types/config.ts` |
| Preview Meta | ✅ | `types/preview.ts` |
| Trace Meta | ✅ | `types/trace.ts` |
| Config Validation | ✅ | `validation/config-validator.ts` |

### Documentation

| Component | Status | Location |
|-----------|--------|----------|
| Naming Standard | ✅ | `docs/REGION-NAMING-STANDARD.md` |
| SDK README | ✅ | `packages/calc-preview-sdk/README.md` |

---

## Key Format Standard

```
r:{regionId}:t:{tenantId}:{namespace}:{key}
```

**Namespaces:**
- `cache` - Cache keys
- `cb` - Circuit breaker state
- `rl` - Rate limit buckets
- `trace` - Trace storage
- `lock` - Distributed locks
- `session` - Session state

**Default Region:** `tr-default`

---

## Contract Changes

### API Response Meta

```typescript
interface ResponseMeta {
  traceId: string;
  requestHash: string;
  serverVersion: string;
  replay?: boolean;
  regionId?: string;      // NEW (optional)
  tenantScope?: string;   // NEW (optional)
}
```

### SDK Config

```typescript
interface SdkConfig {
  // existing...
  regionId?: string;           // NEW (optional, default: tr-default)
  regionRouting?: 'disabled';  // NEW (only 'disabled' for now)
}
```

---

## Invariants

| Invariant | Enforcement |
|-----------|-------------|
| Key format consistency | Single `buildScopedKey` function |
| Default region | `DEFAULT_REGION = 'tr-default'` |
| Backward compatibility | All new fields optional |
| Namespace validation | TypeScript union type |

---

## Non-Goals (Explicit)

| Feature | Status | Reason |
|---------|--------|--------|
| Region routing | ❌ | Future phase |
| Data migration | ❌ | Future phase |
| Region failover | ❌ | Future phase |
| Multi-region deploy | ❌ | Future phase |

---

## Exit Criteria Verification

| Criteria | Status |
|----------|--------|
| İsimlendirme standardı dokümante | ✅ `REGION-NAMING-STANDARD.md` |
| Key üretim tek utility | ✅ `buildScopedKey` |
| API contract region-aware | ✅ ResponseMeta, TraceMeta |
| SDK contract region-aware | ✅ SdkConfig, types |
| Davranış değişmedi | ✅ All fields optional |

---

## Sign-off

Phase 6C Region-Aware Naming & Contracts is sealed.

**Phase 6 Complete:**
- 6A: Explainable Policy Preview ✅
- 6B: SDK v0.1 (Read-Only) ✅
- 6C: Region-Aware Contracts ✅

Next phase: TBD (multi-region routing, data migration, etc.)
