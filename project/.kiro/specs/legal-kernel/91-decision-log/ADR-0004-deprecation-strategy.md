---
status: accepted
date: 2026-05-19
deciders: [ulas]
---

# ADR-0004: Deprecation Period vs Hard Rename

## Status

`Accepted` (2026-05-19)

## Context

`05-engine-consolidation-decision.md`'da rename gerektiren öğeler:

- `CasePolicyEngine` → `PolicyGateService`
- `EngineRunnerService` → `EventRuntimeService`
- `policy-engine/FactStoreService` → `CachedFactReader`
- `interest-strategy.config.CaseType` → `LegalCaseProfile`
- `UyapEventIngestService` → `UyapAdapter` (+ companion `DomainEventIngestService`)
- `packages/types` → `packages/domain`

70 modüllü monorepo'da bu rename'ler birden fazla import zincirini etkiler.

## Decision

**Hard rename değil, deprecation period.**

```
Aşama 1 — Co-existence (2026-05-19 → 2026-06-16, 4 hafta)
  Eski isimler @deprecated JSDoc ile alias kalır
  Yeni isimler kanonik
  Yeni kod sadece yeni isimleri kullanır (CI lint warning)

Aşama 2 — Sunset (2026-06-16)
  CI gate eski isimlerin yeni import'unu bloklar
  Mevcut kullanımlar refactor edilir

Aşama 3 — Removal (2026-06-30, 6 hafta)
  @deprecated alias'lar silinir
```

Aliasların yazımı:

```typescript
/**
 * @deprecated Use `PolicyGateService` from 'policy-gate' module.
 * Will be removed on 2026-06-30 (vocabulary unification + 6 weeks).
 */
export { PolicyGateService as CasePolicyEngine } from 'policy-gate';
```

## Alternatives Considered

| Alternatif | Pros | Cons | Reddedildi mi? |
|---|---|---|---|
| Hard rename (tek seferde mass refactor) | Clean state hızlı | İmport kaosu, regression riski yüksek, test yüzeyi büyür | ✅ Reddedildi |
| **Deprecation period (alias → sunset → removal)** | Risk düşük, dağılım kolay | İki ad bir süre paralel yaşar, dikkat gerek | ✅ **Seçildi** |
| Soft rename (alias hep kalır) | Hiç kırılmaz | Code base sonsuza kadar iki ad taşır, governance kaybolur | ✅ Reddedildi |

## Consequences

**İyi yönde:**
- Refactor riski düşük
- Yeni kod doğrudan yeni isimleri kullanmaya başlar
- CI lint warning gradual feedback verir
- Sunset zorlaması garantili cleanup

**Kötü yönde:**
- 6 hafta boyunca iki ad paralel yaşar
- Yeni geliştirici hangi adı kullanacağı konusunda kafa karıştırabilir (çözüm: deprecated JSDoc bağlamı)

**Riskler:**
- Sunset disiplini ihmal edilirse alias'lar sonsuza kadar kalabilir
- Çözüm: Hard Rule #18 (deprecated alias'lar sunset tarihinden sonra otomatik CI fail)

**Geri dönüş yolu:**
- Sunset tarihi geciktirilebilir, ama ADR güncellenmeden geciktirme yasak (governance kuralı)

## Implementation Path

1. Vocabulary unification spec imzalanınca **kesin sunset tarihi** belirlenir (imza + 6 hafta)
2. Tüm rename target'leri için alias dosyaları yazılır (`*.deprecated.ts`)
3. CI lint rule yeni import'larda eski isim kullanımını warning yapar
4. Sunset tarihinde lint rule **error**'a çevrilir
5. Removal tarihinde alias dosyaları silinir, son import düzeltmeleri yapılır

## References

- `03-vocabulary-unification.md` Deprecation Period section
- `05-engine-consolidation-decision.md` Q2 onayı
- `00-architecture.md v2` Hard Rule #18

## Review Trigger

Bu karar şu durumda yeniden gözden geçirilmeli:

- Sunset tarihi yaklaşıyor ama hâlâ 100+ kullanım eski isimde → tarihi ertele veya migration sprint planla
- Yeni rename ihtiyacı çıkarsa (yeni ADR gerek)
