---
status: accepted
date: 2026-05-19
deciders: [ulas]
---

# ADR-0002: Policy Gate vs Event Runtime — Two-Layer Split

## Status

`Accepted` (2026-05-19)

## Context

Deep scan'de `policy-engine/CasePolicyEngine` ve `icrabot/v28-engine/EngineRunnerService` adlı iki bağımsız "engine" tespit edildi. İlk reaksiyon: "Biri silinmeli, paralel mimari sürdürülmez."

Detaylı analiz (`05-engine-consolidation-decision.md`) gösterdi ki ikisi paralel değil, **farklı sorulara cevap veriyor** ve **farklı zamanda çalışıyor**:

- `policy-engine/CasePolicyEngine` sync gate: "Bu işlem yapılabilir mi?" (action öncesi)
- `icrabot/v28-engine/EngineRunnerService` async runtime: "İşlem oldu, ne tepki vereceğiz?" (event sonrası)

İkisi `IcrabotCaseFact` / `IcrabotCaseFlag` tablolarını paylaşıyor (write paths from both).

## Decision

**İki motor da kalır. Tek legal kernel'in iki katmanı olarak.**

```
┌─────────────────────────────────────────────────┐
│ ROL 1: GATE / AUTHORIZATION (sync, pre-action)  │
│ PolicyGateService [renamed from CasePolicyEngine]│
│ Soru: "Bu işlem yapılabilir mi?"                │
│ Yan etki: sadece decision log                    │
└─────────────────────────────────────────────────┘
                  ↓ (calls before action)
┌─────────────────────────────────────────────────┐
│ DOMAIN COMMAND (case.service / collection / ...)│
└─────────────────────────────────────────────────┘
                  ↓ (action executed)
┌─────────────────────────────────────────────────┐
│ ROL 2: EVENT RUNTIME (async, post-action)       │
│ EventRuntimeService [renamed from EngineRunner] │
│ Soru: "Olay oldu, hangi fact/outbox/timeline?"  │
│ Yan etki: fact write, outbox dispatch, timeline │
└─────────────────────────────────────────────────┘
                  ↓
┌─────────────────────────────────────────────────┐
│ SHARED DATA (IcrabotCaseFact, IcrabotCaseFlag)  │
│ Yazma: tek kaynak (EventRuntime üzerinden)      │
│ Okuma: cached read-side (PolicyGate.CachedReader)│
└─────────────────────────────────────────────────┘
```

**Anayasal cümle:** "Policy karar verir, runtime kayıt altına alır."

## Alternatives Considered

| Alternatif | Pros | Cons | Reddedildi mi? |
|---|---|---|---|
| `CasePolicyEngine`'i sil, v28 her şeyi yapar | Tek motor | Sync gate kalmaz, action öncesi authorization eksik | ✅ Reddedildi |
| `v28-engine`'i sil, policy her şeyi yapar | Tek motor | Async event ingestion + outbox + timeline eksik | ✅ Reddedildi |
| İki motoru tek motora birleştir | Konseptüel temizlik | 4-6 hafta refactor, fonksiyon kaybı riski yüksek | ✅ Reddedildi |
| **İki motor kalır, rol ayrımı + rename + tek veri katmanı** | Mevcut yatırım korunur, semantik netleşir | Vocabulary disiplini gerek (FactStoreService dual çakışması) | ✅ **Seçildi** |

## Consequences

**İyi yönde:**
- Mevcut iki sistemin kendine has güçlü tarafları korunur (gate'in sync API'si + runtime'ın async pipeline'ı)
- Production path'inde her ikisi de zaten kullanılıyor (uyap.service, stage-trigger, automation, decorators)
- Anayasal cümle ("policy karar verir, runtime kayıt altına alır") kontrat olarak yazılı

**Kötü yönde:**
- Veri katmanı paylaşımı disiplini gerek: yazma tek noktadan, okuma cache'li
- İsim çakışması (`FactStoreService` iki yerde) rename ile çözülmeli
- Yeni katılan geliştirici "iki engine var" kafa karışıklığı yaşayabilir

**Riskler:**
- Disiplin kaybolursa policy DB write yapmaya başlar veya runtime authorization kararı vermeye başlar → katman ihlal olur
- Çözüm: Hard Rules #15-17 ile CI gate
  - PolicyGateService DB write yapamaz (decision log dışında)
  - EventRuntimeService legal authorization veremez
  - CaseService direkt outbox yazamaz

**Geri dönüş yolu:**
- Yok (mevcut iki motor bilinçli olarak sürdürülüyor)
- Eğer bir gün tek motora birleştirme istenirse, ayrı ADR gerek

## References

- `04-deep-scan-findings.md` §B (iki motor analizi)
- `05-engine-consolidation-decision.md` (tam karar)
- `00-architecture.md v2 §3` (Layer Discipline)
- `00-architecture.md v2 §13` (Hard Rules #15-17)

## Review Trigger

Bu karar şu durumda yeniden gözden geçirilmeli:

- İki motor arasında veri tutarsızlığı problemleri çıkarsa
- Yeni geliştiriciler her iki sistemi de anlamakta süreğen zorluk çekerse (onboarding metric)
- Microservice split gündeme gelirse (rejected, ama bir gün gerekirse)
