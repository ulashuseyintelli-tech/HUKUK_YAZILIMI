---
status: accepted
date: 2026-05-19
deciders: [ulas]
---

# ADR-0001: Formalize Existing Kernel vs Rewrite From Scratch

## Status

`Accepted` (2026-05-19)

## Context

5 oturumluk mimari tartışmanın ilk turlarında "Money Truth Kernel'i sıfırdan inşa et" yaklaşımı vardı. Stale audit dokümanlarına (PART-3, PART-4, 2026-02-27) güvenilerek baseline yanlış çizildi.

Deep scan (2026-05-19, `04-deep-scan-findings.md`) gösterdi ki sistem **zaten event-sourced bir kernel'e sahip** — sadece yanlış adla, yanlış yerde, yanlış scope'la. Mevcut altyapı:

- `icrabot/v28-engine/EngineRunnerService` (rule eval + fact write + outbox + timeline)
- `icrabot/v28-engine/FactStoreService` (per-case kv + audit)
- `icrabot/v28-engine/UyapEventIngestService` (UYAP adapter)
- `icrabot/v28-engine/OutboxService` (external dispatch)
- `icrabot/v28-engine/TimelineService` (event projection)
- `policy-engine/CasePolicyEngine` (sync authorization gate)
- `interest-engine/InterestEngineService` (segmented calculator + TBK 100 + version pinning)
- `IcrabotAuditLog` hash chain (v38)
- evidence-bundle write-once seal infrastructure

## Decision

**Yeni event-sourced kernel yazılmayacak. Mevcut altyapı canonical legal kernel olarak formalize edilecek.**

İş = rename + data-layer unification + domain command bridge + vocabulary cleanup. Yeni kod yazımı minimal: tek bir küçük servis (`DomainEventIngestService`) eklenir.

## Alternatives Considered

| Alternatif | Pros | Cons | Reddedildi mi? |
|---|---|---|---|
| Rewrite (sıfırdan kernel) | Temiz tasarım, tam kontrol | 6+ ay süre, mevcut production altyapısı çöpe | ✅ Reddedildi |
| Wrap (yeni katman, eski kalır) | Hızlı | İki kernel ileride çakışır, vocabulary daha da parçalanır | ✅ Reddedildi |
| Formalize (mevcut altyapı + rename + bridge) | 6-8 hafta, riski düşük, mevcut yatırım korunur | İsim alias dönemi gerek, dikkatli refactor | ✅ **Seçildi** |

## Consequences

**İyi yönde:**
- Süre 6 ay → 6-8 hafta
- Production altyapısı (drift guard, evidence bundle, hash chain, audit log) dokunulmaz
- Mevcut testler (1000+) korunur
- Risk düşük

**Kötü yönde:**
- "Mevcut altyapı yanlış adlarda" mirası: `CasePolicyEngine`, `EngineRunnerService`, ikili `FactStoreService`. Rename yapılmalı.
- Deprecation period gerek (4 hafta sunset)

**Riskler:**
- Rename sırasında import kaosu (deprecation alias stratejisiyle azaltılır — bkz ADR-0004)
- "Formalize" zihniyetinin "legacy ile yaşa" diye yanlış yorumlanması — Hard Rule #10 (target architecture yönünde fix) bunu koruyor

**Geri dönüş yolu:**
- Mevcut kod hâlâ çalışıyor; formalize başarısız olursa eski isimler/yapı zaten yerinde
- Riskli adım yok

## References

- `00-architecture.md v2` (formalize çerçevesi)
- `04-deep-scan-findings.md` (real baseline kanıtı)
- `05-engine-consolidation-decision.md` (motor kararı)

## Review Trigger

Bu karar şu durumda yeniden gözden geçirilmeli:

- Faz 1 (vocabulary + bridge + rename) 2 ay aşarsa
- Mevcut altyapıda tahmin edilemeyen kapsamlı bir bug ortaya çıkarsa (örn audit log hash chain bütünlük kaybı)
- 3rd party kurumsal müşteri "yeniden kerneli kanıtlayın" derse
