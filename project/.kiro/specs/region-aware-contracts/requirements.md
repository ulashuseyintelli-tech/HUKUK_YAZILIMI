# Phase 6C: Region-Aware Naming & Contracts

## Overview

Bugün tek region'da koşarken bile, yarın çok region'a geçince isimlerin ve sözleşmelerin kırılmaması için isimlendirme standardı.

**Hedef:** Deploy yok. Routing yok. Data migration yok. Sadece "dil"i standardize ediyoruz.

---

## Requirements

### REQ-6C-1: Region Identity Contract

**Kural:** Her "global" sanılan şey aslında scoped'dur.

Her yerde aynı üçlü:
- `regionId` - Region identifier (örn: `eu-west-1`, `tr-istanbul-1`)
- `tenantScope` - Tenant'ın region bağlamı
- `artifactScope` - Trace, cache, breaker key gibi şeylerin scope'u

**Acceptance:**
- [ ] RegionId type tanımlı
- [ ] TenantScope type tanımlı
- [ ] ArtifactScope type tanımlı
- [ ] Default region constant tanımlı

---

### REQ-6C-2: Key Format Standard

**Tek format, her yerde:**

```
r:{regionId}:t:{tenantId}:{namespace}:{key}
```

**Örnekler:**
- Cache: `r:tr-default:t:123:cache:rate:v5:2024-01-15`
- Breaker: `r:tr-default:t:123:cb:rate_provider`
- Rate limit: `r:tr-default:t:123:rl:calc_preview`
- Trace: `r:tr-default:t:123:trace:{traceId}`

**Acceptance:**
- [ ] Key builder utility tek kaynak
- [ ] Tüm key üretim noktaları bu utility'yi kullanıyor
- [ ] Key parse utility (reverse)
- [ ] Key format validation

---

### REQ-6C-3: API Contract Surface

**API response'lara opsiyonel (ama schema'da tanımlı) regionId:**

```typescript
interface ResponseMeta {
  traceId: string;
  regionId?: string;      // NEW
  tenantScope?: string;   // NEW
  // ...
}
```

**Acceptance:**
- [ ] API schema'da regionId alanı (opsiyonel)
- [ ] API schema'da tenantScope alanı (opsiyonel)
- [ ] Mevcut response'lar değişmedi (backward compatible)

---

### REQ-6C-4: SDK Contract Surface

**SDK config'e region-aware alanlar:**

```typescript
interface SdkConfig {
  // existing...
  regionId?: string;           // NEW (opsiyonel)
  regionRouting?: 'disabled';  // NEW (şimdilik no-op)
}
```

**Acceptance:**
- [ ] SDK config'de regionId alanı
- [ ] SDK config'de regionRouting alanı (disabled only)
- [ ] SDK response'larda regionId parse
- [ ] Hiçbir davranış değişmedi

---

### REQ-6C-5: Observability & Evidence Uyumu

**TraceBundle'a:**
- `meta.regionId`
- `meta.tenantScope`

**Metrics label'larına:**
- `regionId` tag (boşsa default)

**Acceptance:**
- [ ] TraceBundle schema güncellendi
- [ ] Metrics label standardı dokümante
- [ ] Default region kullanımı tutarlı

---

### REQ-6C-6: Golden/Contract Güncellemeleri

**Contract schema:**
- regionId alanı (opsiyonel) eklendi

**Golden scenario:**
- regionId'siz varyant (mevcut)
- regionId'li varyant (yeni)
- Noise farkı sayılmalı (region değişikliği = noise)

**Acceptance:**
- [ ] Contract schema güncel
- [ ] Golden scenario'lar region-aware
- [ ] Noise classification dokümante

---

## Non-Goals (v6C)

- Region routing (request'i farklı region'a yönlendirme)
- Data migration (region arası veri taşıma)
- Region failover (region çökünce başka region'a geçiş)
- Multi-region deployment
- Region-specific configuration

---

## Invariants

| Invariant | Enforcement |
|-----------|-------------|
| Key format tutarlılığı | Tek utility, compile-time |
| Backward compatibility | Tüm yeni alanlar opsiyonel |
| Default region | Boş regionId = default region |
| Scope isolation | Her artifact scoped |

---

## Exit Criteria

6C bitti demek için:
1. ✅ İsimlendirme standardı dokümante
2. ✅ Tüm key üretim noktaları tek utility'ye bağlandı
3. ✅ API + SDK contract'ları region-aware alanları tanıyor
4. ✅ Hiçbir davranış değişmedi (sıfır routing/migration)
