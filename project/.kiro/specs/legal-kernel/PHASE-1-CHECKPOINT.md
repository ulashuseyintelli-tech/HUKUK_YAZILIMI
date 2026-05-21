---
status: completed
review-trigger: "Phase 2 Implementation Readiness Pass başlangıcında"
phase: 1
sealed-on: 2026-05-19
---

# Phase 1 — Vocabulary Freeze Checkpoint

**Tarih:** 2026-05-19  
**Durum:** ✅ TAMAMLANDI ve KAPANDI  
**Süre:** 5 oturum (1 gün konsantre çalışma)

---

## Tek Satır Özet

Mevcut kod tabanındaki event-sourced legal kernel **formalize edildi**. Yeni kernel yazılmadı; mevcut altyapı (v28-engine, policy-engine, interest-engine, IcrabotAuditLog, evidence-bundle) **canonical yapıya bağlandı, isimlendirildi, anayasal kurallarla disiplin altına alındı**.

---

## 7 Accepted Vocabulary Belgesi

| # | Belge | Status | İmza |
|---|---|---|---|
| 03 | Vocabulary Unification | accepted | 2026-05-19 |
| 06 | Aggregate Boundaries | accepted | 2026-05-19 |
| 07 | Event Taxonomy v1 | accepted | 2026-05-19 |
| 08 | Causality Rules | accepted | 2026-05-19 |
| 09 | Temporal Semantics | accepted | 2026-05-19 |
| 10 | Implicit Rules | accepted | 2026-05-19 |
| 11 | Domain Event Bridge | accepted | 2026-05-19 |

**Sunset tarihleri (deprecation period):**
- Sunset (CI gate yeni import bloklar): 2026-06-16
- Removal (alias dosyaları silinir): 2026-06-30

---

## 9 Anayasal Cümle (final, freeze)

1. **(A)** Legal facts are immutable. Interpretations are rebuildable.
2. **(B)** Policy karar verir, runtime kayıt altına alır.
3. **(C)** Payment is a legal fact. Allocation is a calculation result. Policy governs interpretation, not event existence.
4. **(D)** Events represent legal facts, not internal computations.
5. **(E)** Events may be recorded automatically. Legal consequences may not be inferred automatically unless explicitly authorized by policy.
6. **(09a)** Replay uses recorded truth. Calculation uses asOf truth. Legal interpretation uses effective truth.
7. **(09b)** Sealed artifacts must persist the exact asOf and interpretation context used during generation.
8. **(11a)** Domain event bridge is transaction discipline, not a new event bus.
9. **(11b)** Outbox append must occur within the same transaction as domain mutation and event append.

---

## 46 Hard Rule (final, freeze)

| Belge | Range |
|---|---|
| 00-architecture v2 (başlangıç) | HR-1..18 |
| 92-architectural-memory (governance) | HR-19 |
| 07-event-taxonomy | HR-20..24 |
| 08-causality-rules | HR-25..28 |
| 09-temporal-semantics | HR-29..35 |
| 10-implicit-rules | HR-36..38 |
| 11-domain-event-bridge | HR-39..46 |

**Toplam:** 46 hard rule. Hepsi şu an **doküman seviyesinde** — enforcement mekanizmaları henüz haritalanmadı (12'nin işi).

---

## Faz 1 Foundational Decisions (özet)

| Karar | Belge | ADR |
|---|---|---|
| Formalize existing kernel, rewrite yok | 00, 04 | ADR-0001 |
| Policy gate ve event runtime iki ayrı katman | 05 | ADR-0002 |
| Frontend may not infer legal truth | 02 | ADR-0003 |
| Deprecation period (4 hafta sunset, 6 hafta removal) | 03 | ADR-0004 |
| 5 aggregate (Tenant, Case, Debtor, Client, Lawyer) | 06 | — |
| 13 Faz 1 domain event | 07 | — |
| ExecutionPath × ProcedureType iki bağımsız boyut | 06 | — |
| Allocation = projection (event değil) | 07 | — |
| AllocationPolicy concept (hardcoded TBK 100 sırası YOK) | 06 | — |
| Closure / reopen avukat kararı zorunlu | 08 | — |
| 4 zaman ekseni (occurred_at, recorded_at, effective_from, asOf) | 09 | — |
| Retroactive override authorization zorunlu | 09 | — |
| Same-tx atomicity (mutation + event + outbox) | 11 | — |
| Idempotency scope per action type | 11 | — |

---

## Governance Scaffolding (Phase 1'de tamamlandı)

| Klasör | İçerik |
|---|---|
| `90-future-work/deferred/` | 7 deferred item (multi-currency, snapshot daemon, timeline UI, vs.) |
| `90-future-work/rejected/` | 5 rejected (kernel rewrite, Kafka, Temporal, microservice, frontend rewrite) |
| `90-future-work/pending/` | 3 pending (policy write delegation, icrabot fact mutability, DueType vs ClaimItemType) — 14 gün timeout |
| `90-future-work/escalation-triggers/` | 14 capability × technical + business trigger |
| `90-future-work/runtime-lab/` | 6 lab item (drift-guard, adaptive control, shadow rollout, chaos, synthetic load, governance experiments) — Faz 2'de taşınacak |
| `91-decision-log/` | 4 ADR |
| `92-architectural-memory.md` | Anayasal classification disiplini, Hard Rule #19 |

---

## Sonraki Oturum: Implementation Readiness Pass

> **Sonraki oturumda doğrudan `12-implementation-readiness.md` ile başla.**

İlk satırı şöyle olacak:

> **This document maps accepted architectural rules to enforceable mechanisms.**

### 12'nin Ana Tablosu

```
Hard Rule → Enforcement Type → Existing Coverage → Gap → Implementation Step → Owner → Priority
```

| Sütun | Anlam |
|---|---|
| **Hard Rule** | HR-1..46 |
| **Enforcement Type** | lint / CI gate / runtime guard / DB constraint / DB trigger / migration / human review |
| **Existing Coverage** | Bu rule mevcut kodda zaten enforce ediliyor mu? Hangi dosya/satır? |
| **Gap** | Yeni enforcement mekanizması gerekiyor mu? Ne? |
| **Implementation Step** | Somut iş tanımı |
| **Owner** | dev / dev-ops / lint-config / DB-migration |
| **Priority** | P0 / P1 / P2 |

### 12 Olmadan Olmaz

> 46 hard rule var, ama **enforce mekanizmaları henüz haritalanmadı**. Belirsiz kalırsa rule'lar "iyi niyet listesi" olur.

12 yazılmadan kod migration'a (13+ implementation specs) başlanmaz.

### 12 Tahmini Süre

~1 gün konsantre çalışma. Mekanik bir map, kavramsal yenilik az. Ama disiplin gerek — her hard rule için **gerçekten enforce edilebilir** mekanizma seçilmeli, "human review" çöplüğüne dönüşmemeli.

---

## Phase 2 Roadmap (12'den sonra)

| # | Spec | Süre | Bağımlılık |
|---|---|---|---|
| 12 | Implementation Readiness Pass | 1 gün | — |
| 13 | DomainEventIngestService skeleton | 2-3 gün | 12 |
| 14 | packages/types → packages/domain rename | 1 gün | 12 |
| 15 | CI gate scripts (HR-1..46) | 3-4 gün | 12, 13 |
| 16 | Deprecation aliases (5 rename target) | 2 gün | 14 |
| 17 | case.service.create() event emission | 2-3 gün | 13, 16 |
| 18 | collection.service.create() event emission | 2 gün | 17 |
| 19 | InterestEngine pure split (computeBalance vs writeAudit) | 3 gün | 13 |
| 20 | Frontend interest-type-resolver migration to backend | 3 gün | 19 |

Toplam Phase 2: ~3-4 hafta strangler fig migration.

---

## Phase 1 Disiplin Notları (sonraki oturumlar için)

### Korunması Gerekenler

- **Anayasal cümleler ekleme.** 9 cümle yeter. Yenisi için ADR + güçlü gerekçe.
- **Hard rule sayısı.** 46 yeter. Yenisi için ADR.
- **Aggregate sayısı.** 5 (HR: yeni aggregate ADR zorunlu).
- **Faz 1 event sayısı.** 13 (Faz 2'de tebligat/haciz/sale ile genişler).
- **Implicit rule sayısı.** 5 / max 10 (HR-37).

### Kaçınılması Gerekenler

- **DDD purity trap** — academic perfection, ürün yok
- **Distributed Systems Thesis Trap** — Kafka/Temporal/CQRS framework
- **Platform tilt** — runtime-lab'i domain'e karıştırmak
- **Hidden invariant mezarlığı** — implicit-rules'a "her şeyi" atmak
- **Event spam** — `BALANCE_UPDATED`, `INTEREST_RECALCULATED` event yaratmak (anayasa ihlali)
- **Frontend legal inference** — interest-type-resolver yeniden frontend'e kayma riski
- **Stale audit dependency** — PART-3, PART-4 dokümanları üzerinden plan yapmak (deep scan'de görüldü, stale)

### Sürekli Hatırlanacak

> **Governance ana işi boğmamalıdır.** Bu 5. anayasal kural değil, ama o kadar önemli.

> **Şüphe halinde human required.** Otomatize etme cazibesi sürekli olacak — direnilmeli (HR-26 + Anayasa E).

> **Nothing disappears, but everything has a review date.** Deferred mezarlığa dönmesin (Anayasa, 92-architectural-memory).

---

## Phase 1 Final Status

```
✅ Vocabulary stabilize
✅ Engine topology kararlaştı (iki katman)
✅ Aggregate consistency model
✅ Event taxonomy + canonical payloads
✅ Causality + human authority boundaries
✅ Temporal model (4 eksen, 5 truth mode)
✅ Implicit rules disiplini
✅ Transaction bridge + atomicity guarantees
✅ Governance scaffolding
✅ 4 ADR
✅ 9 anayasal cümle
✅ 46 hard rule
✅ Future work registry
✅ Stale audit temizlendi (real baseline)
✅ Frontend seam scan
```

**Faz 1 RESMEN KAPALI.**

---

## Sonraki Oturum İçin Hatırlatma

Yeni oturuma başlarken bu belgeden başla. İlk komut:

> "Phase 1 kapandı. 12-implementation-readiness.md'ye geç."

12 yazılırken **mevcut koda bakmak şart** — her hard rule için "bu zaten enforce ediliyor mu?" sorusu gerçek dosya/satır kanıtıyla cevaplanmalı. Stale audit hatasına bir daha düşülmemeli.

---

**İmza:** ulas (2026-05-19)  
**Resmi Status:** Phase 1 sealed, Phase 2 hazır.
