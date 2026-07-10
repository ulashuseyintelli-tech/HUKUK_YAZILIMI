# ADR-014 Split-PR Baseline Execution Plan

**Status:** APPROVED / BASELINE EXECUTION PLAN v1.2
**Date:** 2026-07-10
**Owner:** Ulaş
**Related:** `docs/adr/ADR-014-CCB-001-CANONICAL-LEGAL-CALCULATION-CORE.md`, `product-backlog.md` (`ID: ADR-014-SCENARIO-INFRA`, `ID: ADR-014-SPLIT-PR-PLAN`, `ID: CCB-001`), `decision-log.md` (2026-07-10)

> **Revizyon geçmişi:** v1 (2026-07-10, PR #1032) — ilk baseline. **v1.1 (2026-07-10)** — REVERSAL owner arbitration (CONDITIONAL OPTION B) sonrası: §11 REVERSAL çözüldü, §0 terminolojisi ve PR-1B acceptance gate güncellendi (gerçek `CollectionService.cancel()` DB integration eklendi). **v1.2 (2026-07-10)** — W0.2 iskele owner arbitration (Hard Stop → RESOLVED BY OWNER DECISION): iskele katmanı (Tenant/Client/Debtor/Case/CaseDebtor) materializer içinde **Prisma-direct** kurulur; G1–G6 acceptance gate'leri bağlayıcı (bkz. §3 W0.2 İskele Revizyonu). Ground-truth: `CaseService` 10-bağımlılıklı/elle kurulamaz, gerçek servisler Conditional-B'nin kaçındığı yan-etkileri (event/outbox/audit) getirir, repo'nun yerleşik DB-gated emsali iskeleyi zaten Prisma-direct kurar. Conditional Option B'nin diğer TÜM şartları, ClaimItem/Ledger direct-write, `Scenario → Materializer → DB` yönü ve `Materializer PASS ≠ CollectionService.cancel() PASS` guardrail'i DEĞİŞMEDİ.

> **Amaç:** ADR-014 canonical legal calculation core cutover'ının implementasyonunu, riski en düşük olacak şekilde küçük ve doğrulanabilir PR'lara bölen **baseline yürütme yol haritası**. Bu bir program-yönetimi artefaktıdır — analiz değildir. Revizyonlar v2/v3 olarak işlenir; uygulama ekipleri için referans plan budur.

---

## 0. Kritik Terminoloji (bağlayıcı)

```text
- W0 bir IMPLEMENTATION PREREQUISITE DEĞİLDİR.
  W0, DB-gated verification CAPABILITY enabler'ıdır (kanıt üretiminin altyapısı).
- Done ≠ Mergeable.  (CI yeşil = "bitti"; merge için Acceptance Gate zorunlu.)
- ADR-014 bir Scenario Platform İSTEMİYOR (minimal infra; registry/platform ertelendi).
- Branch 961bbaf3 WHOLESALE MERGE EDİLMEYECEK.
  (GO-ANALYZE: NO-GO full cutover / GO incremental hardening.)
  Her PR, branch'in ilgili dilimini GÜNCEL main'e extract eder, izole doğrulanır.
- REVERSAL = RESOLVED / CONDITIONAL OPTION B (bkz. §11). Wave 0 materializer direct-write
  (yalnız test/disposable DB); gerçek `CollectionService.cancel()` write-path'i AYRI
  DB-gated integration test'iyle doğrulanır. Materializer PASS ≠ production cancel path PASS.
```

---

## 1. Wave Yapısı

```text
        ┌─ RESOLVED: REVERSAL = Conditional Option B (§11) ─┐
        ▼                                                    ▼
   WAVE 0  Scenario Infra (verification capability enabler)
        │  contract + builder + hybrid materializer + diagnostic dual-mode + evidence model
        ▼
   WAVE 1  Core calc hardening (ADR-014 ✓)   PR-1A→1B · PR-2 · PR-3h · PR-4→PR-5 · PR-6
        ▼
   WAVE 2  Fee/Trace/Snapshot (✗ fix'leri içerir)   PR-7 · PR-8a→8b · PR-9
        ▼
   WAVE 3  Cutover (en riskli; önceki dalgalar yeşil şart)
           PR-10 → PR-11 → PR-12 → PR-13 → PR-14
```

**Kritik yol:** `W0 → PR-4 → PR-5 → PR-8a → PR-8b → PR-10 → PR-11 → PR-12 → PR-13 → PR-14`.

---

## 2. Hazırlık Bağımlılığı vs Merge/Verification Bağımlılığı (ayrım)

```text
HAZIRLIK (kod extract, statik hardening, karakterizasyon testi):
  → W0'DAN BAĞIMSIZ başlayabilir. PR-1A ve bazı statik hardening W0 olmadan hazırlanır.

MERGE / MERGEABLE ACCEPTANCE (DB-gated PASS):
  → W0'A BAĞLIDIR. Bir PR'ın DB-gated acceptance gate'i, W0 (verification capability)
    inmeden geçirilemez.

Yani W0 "önce kod yazılamaz" demek DEĞİL; "DB-gated kanıt üretilemez" demektir.
```

---

## 3. Her PR'ın Kapsamı ve Önkoşulu

### WAVE 0 — Enabler (ayrı gate'li)

| PR | Kapsam | Önkoşul |
|---|---|---|
| **W0** Scenario Infra (minimal) | Arbitre edilen dilim: saf domain contract + tek domain builder + hybrid materializer + diagnostic dual-mode + evidence model. Kendi içinde 3 alt-PR'a bölünebilir (contract+builder / materializer / dual-mode) — ama platform DEĞİL. W0.1 (contract+builder) **MERGED** (PR #1037, `f998af79`). | **REVERSAL RESOLVED (Conditional Option B, §11)** — materializer reversal yolu direct-write olarak kilitlendi. Detay: `product-backlog.md` `ID: ADR-014-SCENARIO-INFRA`. |

#### W0.2 İskele Revizyonu (v1.2 — owner arbitration, 2026-07-10)

```text
"W0.2 iskele katmanı (Tenant/Client/Debtor/Case/CaseDebtor), materializer içinde
Prisma-direct kurulur. G1–G6 acceptance gate'leri bağlayıcıdır."

DEĞİŞMEYENLER: Conditional Option B'nin diğer tüm şartları · ClaimItem üç-tutar +
LedgerEntry PAYMENT/REVERSAL dedicated direct-write · Scenario → Materializer → DB
yönü · Materializer production service davranışını TAKLİT ETMEZ · Materializer
PASS ≠ CollectionService.cancel() PASS · production cancel path ayrı DB-gated
integration test (PR-1B gate'i) · registry/platformlaştırma ERTELENMİŞ.
```

**Bağlayıcı W0.2 Acceptance Gate'leri (G1–G6):**

| Gate | İçerik |
|---|---|
| G1 İlişki bütünlüğü | `tenantId` tek kaynaktan damgalanır; Case→Client, CaseDebtor→Case/Debtor, Collection→Case, LedgerEntry→Case(+`collectionId`), REVERSAL'da `reversesLedgerEntryId` ZORUNLU |
| G2 Şema-geçerlilik | ClaimItem üç-tutar (`originalAmount`+`demandedAmount`+`amount`) her zaman set |
| G3 Side-effect negatif assertion | **Scoped before/after delta==0** — materialization öncesi ilgili tenant/case/scenario kapsamındaki timeline/outbox/journal/audit sayıları alınır, sonrası yeniden ölçülür, delta==0 doğrulanır; mümkünse caseId/tenantId/correlationId/aggregateId ile scope edilir; **global tablo count==0 assertion YAPILMAZ** (paylaşılan/önceden-veri-içeren DB'de yanlış sonuç üretir) |
| G4 Production-erişilemezlik | Statik guard: production src (module/service/controller), materializer'ı import edemez |
| G5 Self-check | materialize→`computeCaseBalance` == in-memory `engine.computeBalance` (aynı senaryo) |
| G6 DB fail-safe | `resolveTestDatabaseUrl` — yalnız `hukuk_*_gate` (MPB-025 altyapısı aynen) |

`WRITE_PATH_NOT_EXERCISED` işareti yalnız MEVCUT evidence modelinde temsil edilebiliyorsa kullanılır (serbest-metin metadata alanı kabul); yeni enum / yeni evidence sınıfı / yeni mimari kavram gerekiyorsa **HARD STOP**.

### WAVE 1 — Core Calculation Hardening (ADR-014 ✓)

| PR | Kapsam | Önkoşul |
|---|---|---|
| **PR-1A** | Reversal netting **verification** — yalnız karakterizasyon testi (mevcut davranışı sabitler) | — |
| **PR-1B** | Reversal netting **fix** — `payment-mapper.netLedgerPayments()` net-zero | PR-1A + REVERSAL kararı (RESOLVED/Conditional B) + W0 |
| **PR-2** | NO_BUCKETS fail-closed — temel main'de var; fee/snapshot'a blocker propagasyonu (branch delta) | W0 |
| **PR-3h** | TBK100 **hardening** — R2 cent-normalization + R3 negatif-payment guard + raporlama-sıra fix (çekirdek sıra main'de ZATEN doğru; yalnız hardening delta) | W0 |
| **PR-4** | Partial payment **interest-base mutation** — `allocatePaymentsWithInterestBaseMutation()` (main 4/5 param, branch 5/5) | W0 |
| **PR-5** | Enforcement date / pre-post interest — ödeme×takip-tarihi etkileşimi (saf ayrım main'de) | PR-4 |
| **PR-6** | Currency-aware foreign claim — `foreign-currency-policy.ts` (yeni dosya; main'de sıfır) | W0 + ek test (mevcut 2 case yetersiz, I-19/20/21 kapatılmalı) |

### WAVE 2 — Fee / Trace / Snapshot (ADR-014 ✗ düzeltmelerini içerir)

| PR | Kapsam | Önkoşul |
|---|---|---|
| **PR-7** | Fee Projection **Layer** — yalnız projeksiyon plumbing + fail-closed DTO. **TAHSIL_HARCI fee POLICY dahil DEĞİL → ADR-013.** | Wave 1 yeşil |
| **PR-8a** | Snapshot **✗ FIX** — (1) BLOCKING_CODES 2/5 → **5/5** (reversal/TBK100/interest-base ekle); (2) authority/snapshot **sinyal tutarsızlığı** düzelt (`status='OK'`+CANONICAL_CANDIDATE iken snapshot BLOCKED olamaz) | Wave 1 yeşil |
| **PR-8b** | Trace/Snapshot **layer** — `case-balance-snapshot.ts` + trace; MUST-NOT #8 artık 8a ile güvenli | PR-8a |
| **PR-9** | Golden fixture matrix — 12 senaryoyu **W0 scenario contract'ı üzerinden** ifade et (ikinci format DEĞİL); **FX-success yolu** eklenmeli (bugün hiç yok) | W0 + Wave 1 |

### WAVE 3 — Cutover (en riskli; tüm önceki dalgalar yeşil + DB-gated PASS şart)

| PR | Kapsam | Önkoşul |
|---|---|---|
| **PR-10** | Canonical primary adapter — `case-calculation-summary.adapter.ts` + **hardcoded-0 display FIX** (harç alanları "0,00 TL" yerine "hesaplanmadı" diagnostic; fee CALC →ADR-013) | Wave 1+2 tümü yeşil |
| **PR-11** | UI/API/report/template switch — production display canonical'a; **MUST-NOT #6: hardening gate'ler yeşil olmadan AÇILMAZ** | PR-10 + tüm hardening |
| **PR-12** | Legacy fallback disable — sessiz fallback yasağı; `getCalculationSummary` fail-closed | PR-11 production'da stabil |
| **PR-13** | Shadow/diff cleanup — ölü `buildCalculationSummaryCanonicalShadow` (~205 satır) sil; shadow-diff diagnostic emekli | PR-12 bake sonrası |
| **PR-14** | Legacy quarantine/deletion (backend) — frontend quarantine branch'te var; backend legacy sil | PR-13 + production güven + ayrı owner GO |

---

## 4-5-6. Acceptance Gate + Evidence Source + Owner Gate

> **Done ≠ Mergeable.** Kod yazılmış + CI yeşil = *bitti*. Merge edilebilir olması için aşağıdaki gate ZORUNLU.

| PR | Merge edilebilir olması için ZORUNLU | Evidence Source | Owner Gate |
|---|---|---|---|
| **PR-1A** | CI 4/4 · karakterizasyon testleri GREEN | Unit | NO |
| **PR-1B** | CI 4/4 · **materialized reversal net-zero (E) PASS** · **gerçek `CollectionService.cancel()` DB integration PASS** · PAYMENT + REVERSAL = 0 · no regression · shadow-diff unchanged *(materializer fixture PASS tek başına YETMEZ — v1.1)* | DB-Gated (materializer) **+ Real cancel() Integration** | NO *(REVERSAL RESOLVED/Conditional B önkoşul)* |
| **PR-2** | CI 4/4 · NO_BUCKETS (F) PASS · blocker propagasyonu | DB-Gated | NO |
| **PR-3h** | CI 4/4 · cent-normalization + TBK100-order (D) PASS · negatif-guard PASS · dust pinned | DB-Gated | NO |
| **PR-4** | CI 4/4 · partial-payment (B+C) PASS · çok-dönemli faiz-tabanı · no regression | DB-Gated + Shadow Diff | NO |
| **PR-5** | CI 4/4 · enforcement-date (J) PASS + PR-4 etkileşimi | DB-Gated | NO |
| **PR-6** | CI 4/4 · FX-missing BLOCKED (G/H/M) + FX-success PASS · TRY-default YOK | DB-Gated | NO |
| **PR-7** | CI 4/4 · fee-projection fail-closed · TAHSIL_HARCI doğru ertelenmiş | DB-Gated | NO |
| **PR-8a** | CI 4/4 · blocker coverage **5/5** PASS · authority/snapshot tutarlılık PASS | DB-Gated + Snapshot | NO |
| **PR-8b** | CI 4/4 · snapshot yalnız 8a temizken · trace açıklanabilirlik | DB-Gated + Snapshot/Trace | NO |
| **PR-9** | CI 4/4 · 12 senaryo W0 contract'ı · unit == DB-gated eşleşme · FX-success mevcut | Unit + DB-Gated (twin-run) | NO |
| **PR-10** | CI 4/4 · **hardcoded-0 harç YOK** ("hesaplanmadı" diagnostic) · adapter == engine | DB-Gated + Shadow Diff | NO |
| **PR-11** | CI 4/4 · UI = API = report invariant (I-10) PASS · MUST-NOT #6 · template formül YOK | UI/API/Report Integration | **REQUIRED** |
| **PR-12** | CI 4/4 · fallback disabled PASS (canonical-unavailable → fail-closed) | DB-Gated | **REQUIRED** |
| **PR-13** | CI 4/4 · orphan shadow YOK · dead-code static guard PASS | Static (dead-code guard) | NO |
| **PR-14** | CI 4/4 · **production bake PASS** · legacy-quarantine static guard PASS | Production Bake | **REQUIRED** |

**Owner Gate REQUIRED = 3 PR** (PR-11, PR-12, PR-14 — hepsi production-görünür / geri-dönüşü-zor). Diğerleri otomatik acceptance gate ile merge edilebilir. **REVERSAL** ayrıca Wave 0 öncesi tek başına bir owner gate'tir.

**Scenario id notu:** Tablodaki B/C/D/E/F/G/H/J/M semantik senaryo etiketleridir (golden-fixture-matrix); stabil scenario id'leri W0 contract'ında sabitlenecek.

---

## 7. Rollback Stratejisi (dalga bazlı)

```text
Wave 1-2 (hardening + fee/trace): TÜMÜ ADDITIVE — production display Wave 3'e kadar
   DEĞİŞMEZ (canonical hâlâ shadow/diagnostic). Rollback = PR revert, sıfır kullanıcı etkisi.

Wave 3 (cutover): production authority değişir. Rollback güvencesi:
   - Legacy PR-14'e kadar SİLİNMEZ (quarantine'de mevcut kalır) → her cutover PR'ı
     revert edilince legacy görünüme dönülebilir.
   - PR-14 (silme) bilinçle EN SONDA + ayrı owner GO + production bake sonrası —
     "geri dönüşü zor" tek adım budur.
```

---

## 8. Seri ve Paralel Yürütme Kuralları

```text
SERİ ZORUNLU:  PR-1A→1B · PR-4→PR-5 · PR-8a→8b · PR-10→11→12→13→14 · (Wave1→2→3)
PARALEL OK:    Wave 1 içinde {PR-1A, PR-2, PR-3h, PR-6}  (farklı dosyalar, çakışmasız)
               Wave 2 içinde {PR-7, PR-9}
KRİTİK YOL:    W0 → PR-4 → PR-5 → PR-8a → PR-8b → PR-10 → PR-11 → PR-12 → PR-13 → PR-14

CI (hepsi):    4/4 PASS (Architectural Guardrails, Test Suite, Web Tests,
               Client Workspace Live Smoke) + merge-tree temiz.
DB-gated ek:   PR-1B/2/3h/4/5/6/8a/8b/9/10/11/12 — W0 üzerinden expected-vs-actual
               (scenario id ile), disposable Docker Postgres. Bu geçmeden ilgili PR
               HIGH/doğrulanmamış kalır.
```

---

## 9. Disposition Sınırları (ADR-014 / ADR-013 / PAC-001-A mevcut)

```text
ADR-014 ✓ (bu plan çözüyor):   PR-1A/1B, PR-2, PR-3h, PR-4, PR-5, PR-6 (core hardening)
ADR-014 ✗ (bu plan içinde FIX): PR-8a blocker 5/5 · authority/snapshot tutarlılık ·
                                PR-10 hardcoded-0 display · DB-gated verification gap
→ ADR-013 (bu plan DIŞI):       TAHSIL_HARCI fee policy · hardcoded-0 fee CALC yarısı ·
                                snapshot/journal PERSISTENCE
Pre-existing (PAC-001-A, DIŞI): TBK100 çift-implementasyon · interest-rate 3-kaynak ·
                                BalanceLedger direct-write · ClaimItem/principalAmount dual-write
```

---

## 10. Anti-Bloat Dışlamaları (sürüklenmeyecek)

```text
- Scenario registry / platform  → genel test-platform yatırımı, ADR-014 için gereksiz
- Balance-dışı domain materializer'ları → deferred
- İkinci diagnostic (balance-shadow-diff) wiring'i → deferred
- Fee/harç/snapshot-journal fixture'ları → ADR-013
- Pre-existing PAC-001-A bulguları → kendi ayrı workstream'leri; merge-blocker sayılmaz
```

---

## 11. REVERSAL — RESOLVED / CONDITIONAL OPTION B (owner arbitration, 2026-07-10)

```text
KARAR: CONDITIONAL OPTION B.

Wave 0 materializer REVERSAL üretimi → direct-write:
  - deterministik fixture setup (senaryoyu kurar, hesaplama davranışını doğrular)
  - YALNIZ test/disposable DB kapsamında; production runtime kodundan erişilemez
  - tenantId, caseId, collectionId ve original-payment ilişkileri ZORUNLU
  - REVERSAL kaydı production ledger şemasının minimum geçerli invariant'larını taşır
  - PAYMENT+REVERSAL net-zero fixture'ında açık ilişki: reversalOfPaymentId (veya
    scenario-level eşdeğer referans)
  - timeline/journal kayıtları TAKLİT EDİLMEZ; yoksa evidence çıktısında
    WRITE_PATH_NOT_EXERCISED olarak açıkça işaretlenir

GUARDRAIL: Materializer PASS ≠ production cancellation path PASS.
  Materializer sonucu, production cancellation fidelity kanıtı SAYILMAZ.

AYRI DOĞRULAMA YÜKÜMLÜLÜĞÜ (gerçek write-path):
  CollectionService.cancel() için ZORUNLU DB-gated integration senaryosu:
    PAYMENT_RECEIVED → COLLECTION_CASH_RECEIPT_RECORDED → CollectionService.cancel()
    → REVERSAL ledger → net balance doğrulaması
  Bu test materializer testi DEĞİLDİR; scenario setup için direct-write KULLANMAZ;
  gerçek servis yolunu çalıştırır; cancellation write-path fidelity kanıtını üretir.

İki amaç ayrı tutulur:
  Materializer                       → hesaplama senaryosu kurar
  CollectionService.cancel() integ.  → gerçek reversal yazma yolunu doğrular

Bu karar Wave 0'ı minimal tutar; production fidelity borcunu da gizlemez.
Rationale: Wave 0'ın amacı senaryoyu deterministik kurup hesaplama davranışını
doğrulamaktır; collection-cancellation workflow'unun tamamını test etmek değildir.
Option A materializer'a alınsaydı fixture altyapısı timeline/journal/event-prerequisite/
lifecycle/notification/audit yan-etkilerine bağlanır ve minimal-infra kararını bozardı.
```

---

## 12. Status

```text
ADR-014 Split-PR Planning → APPROVED / BASELINE EXECUTION PLAN v1.1

REVERSAL → RESOLVED / CONDITIONAL OPTION B (§11). Tek açık owner-decision kapatıldı.
Bundan sonraki iş plan değil, uygulama yönetimidir.
Sonraki açılacak hat: ADR-014 Wave 0 Implementation (ayrı GO-IMPLEMENT).
Revizyon gerekirse bu belge v2/v3 olarak güncellenir.
```
