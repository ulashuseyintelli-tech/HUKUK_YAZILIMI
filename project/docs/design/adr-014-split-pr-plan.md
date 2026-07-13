# ADR-014 Split-PR Baseline Execution Plan

**Status:** APPROVED / POST-PR-10 BASELINE EXECUTION PLAN v2.20
**Date:** 2026-07-10
**Last Reconciled:** 2026-07-13
**Owner:** Ulaş
**Related:** `docs/adr/ADR-014-CCB-001-CANONICAL-LEGAL-CALCULATION-CORE.md`, `product-backlog.md` (`ID: ADR-014-SCENARIO-INFRA`, `ID: ADR-014-SPLIT-PR-PLAN`, `ID: CCB-001`), `decision-log.md` (2026-07-10)

> **Revizyon geçmişi:** v1 (2026-07-10, PR #1032) — ilk baseline. **v1.1 (2026-07-10)** — REVERSAL owner arbitration (CONDITIONAL OPTION B) sonrası: §11 REVERSAL çözüldü, §0 terminolojisi ve PR-1B acceptance gate güncellendi (gerçek `CollectionService.cancel()` DB integration eklendi). **v1.2 (2026-07-10)** — W0.2 iskele owner arbitration (Hard Stop → RESOLVED BY OWNER DECISION): iskele katmanı (Tenant/Client/Debtor/Case/CaseDebtor) materializer içinde **Prisma-direct** kurulur; G1–G6 acceptance gate'leri bağlayıcı (bkz. §3 W0.2 İskele Revizyonu). Ground-truth: `CaseService` 10-bağımlılıklı/elle kurulamaz, gerçek servisler Conditional-B'nin kaçındığı yan-etkileri (event/outbox/audit) getirir, repo'nun yerleşik DB-gated emsali iskeleyi zaten Prisma-direct kurar. Conditional Option B'nin diğer TÜM şartları, ClaimItem/Ledger direct-write, `Scenario → Materializer → DB` yönü ve `Materializer PASS ≠ CollectionService.cancel() PASS` guardrail'i DEĞİŞMEDİ. **v2.0 (2026-07-11)** — post-PR-1B reconciliation: W0.1/W0.2/W0.3, PR-1A ve PR-1B CLOSED/CANONICAL; PR-2 ilk unresolved technical slice; canonical merge/closure sırası mandatory, paralellik yalnız analiz/hazırlık/branch geliştirmesidir; post-cutover gate'ler owner atayana kadar UNASSIGNED. **v2.1 (2026-07-11)** — PR-2 technical + governance closure: `NO_BUCKETS` fatal/display/evidence fail-closed davranışı canonical; PR-3h sonraki eligible slice; runtime cutover yine NOT AUTHORIZED. **v2.2 (2026-07-11)** — PR-3h technical + governance closure: AllocationEngine cent-normalization, negative-payment guard ve reporting-order hardening canonical; duplicate allocator disposition owner-held kalır; PR-4 sonraki eligible slice; runtime cutover NOT AUTHORIZED. **v2.3 (2026-07-11)** — PR-4 technical + governance closure: future interest base yalnız principal-allocated tutar kadar, payment boundary sonrasından itibaren cent-normalized azalır; masraf/fer'i/faiz-only ödeme principal'i değiştirmez; PR-5 sonraki eligible slice; runtime cutover NOT AUTHORIZED. **v2.4 (2026-07-11)** — PR-5 technical + governance closure: `Case.caseDate` existing enforcement boundary'ye taşınır; variable/fixed periods PRE/POST ayrılır, phase totals total interest'e cent-exact mutabık kalır; PR-4 day-policy/principal mutation korunur; PR-6 sonraki eligible slice; runtime cutover NOT AUTHORIZED. **v2.5 (2026-07-11)** — PR-6 technical + governance closure: supported currency grupları bağımsız hesaplanır; missing/unsupported ve payment/reversal mismatch fail-closed display/evidence blocker'ı taşır; conversion/FX authority/schema eklenmez; PR-7 sonraki eligible slice; runtime cutover NOT AUTHORIZED. **v2.6 (2026-07-11)** — PR-7 technical + governance closure: persisted ClaimItem fee/cost projection evidence per-currency typed DTO ile taşınır; missing/invalid/mismatch/blocker durumları `0` yerine fail-closed `NOT_CALCULATED`/`UNAVAILABLE` olur; fee/harç policy/formula ve official persistence owner-gated kalır; PR-8a sonraki eligible slice; runtime cutover NOT AUTHORIZED.

> **v2.7 (2026-07-11):** PR-8a technical + governance closure: beş canonical blocker sınıfı deterministic sırada typed readiness evidence olarak taşınır; blocker varsa display/authority/readiness fail-closed, blocker yoksa existing `SHADOW_ONLY` korunurken official snapshot yokluğu `UNSAFE / snapshotAvailable=false` kalır. Persistence/hash/lifecycle/trace/schema ve authority promotion eklenmedi; PR-8b sonraki eligible slice; runtime cutover NOT AUTHORIZED.

> **v2.8 (2026-07-11):** PR-8b technical + governance closure: canonical allocation/interest evidence deterministic explainability trace'e ve ephemeral non-official snapshot DTO'suna additive olarak taşınır. Her iki DTO `authority=NONE / persisted=false`; official snapshot availability, readiness blockers, legal totals ve display authority değişmez. Persistence/hash/lifecycle/schema, writer, consumer switch ve yeni authority eklenmedi; PR-9 sonraki eligible slice; runtime cutover NOT AUTHORIZED.

> **v2.9 (2026-07-11):** PR-9 technical + governance closure: mevcut Wave 0 `ScenarioDefinition` tek scenario/expected contract olarak 12 canonical vakayı unit ve disposable-PostgreSQL twin-run'da besler. Cent-normalized exact equality, expected matching, repeatability, blocker 5/5 ve tenant isolation kanıtlandı. Runtime hesaplama, writer, schema/migration, API/UI, official snapshot ve authority değişmedi; PR-10 sonraki eligible slice; runtime cutover NOT AUTHORIZED.

> **v2.10 (2026-07-12):** PR-10 technical + governance closure: existing calculation-summary response keeps every legacy field unchanged and adds a typed `canonicalCompatibility` payload. Canonical per-currency principal/interest/payment/cost evidence, fee status, blockers/readiness, trace and non-official snapshot are losslessly mapped; zero fallback and conflicting parity fail closed. Adapter remains `ADDITIVE_SHADOW_ONLY`; consumer switch, primary authority promotion and runtime cutover were not introduced. Next eligible step is the `UNASSIGNED` owner cutover-authorization governance gate; PR-11 remains unauthorized until that gate closes.

> **v2.11 (2026-07-12):** Cutover-authorization governance policy (§12 seq 11 decision record) DEFINED in `docs/design/adr-014-cutover-authorization-policy.md`. It fixes two binding owner decisions — (1) PR-11 scope = Hesap Özeti UI/API consumer switch only; UYAP exporter/interest-code/document-template stays in CAN-CUT-01/PR-A4/PR-A5, independently gated (so exact UYAP mapping is not a direct PR-11 prerequisite, and a UYAP report/template switch cannot be added to PR-11 later); (2) synthetic correctness evidence (SATISFIED) does not substitute for representative-data evidence (ABSENT/BLOCKING) or live operational evidence (NOT EXECUTABLE) — production smoke/bake gates are not waived. Pilot/kill-switch/fail-closed/rollback/sign-off framework recorded; exact operational thresholds are `OWNER TO SET BEFORE PR-11`. **Defining this policy does not open PR-11:** PR-11 and runtime cutover remain NOT AUTHORIZED; the normative order is unchanged.

> **v2.12 (2026-07-12):** Cutover **owner decisions** recorded in `adr-014-cutover-authorization-policy.md` §9 (fifteen decisions). Representative evidence environment SELECTED IN PRINCIPLE (sanitized-production-copy-on-representative-staging, secondary read-only-production-shadow) but NOT YET AVAILABLE; dataset = mandatory edge-case set + statistically-representative sample (case/tenant minimums derived from portfolio, not invented). Operational thresholds now DEFINED WITH BASELINE-DEPENDENT VALIDATION: financial discrepancy 0-cent tolerance + stop-on-any-unexplained; latency p95≤20%/p99≤30% and 0 material error/timeout increase, baseline-required; smoke 3 business days / 500 requests / ≥2 tenants; PR-11 bake 14 days, PR-12 eligibility ≥30 days, PR-14 owner-set ≥PR-12 window. Kill-switch (no dual approval for emergency disable, deploy-free, fully audited), rollback (≤5 min, hard financial/security triggers auto, performance manual), re-activation (new owner GO; semantic fault → new PR + full gates + new legal sign-off), legal sign-off scope and refresh, and pre-evidence allowed work = DOCS/MONITORING PREPARATION ONLY all recorded. **"Decisions defined" ≠ "cutover approved":** PR-11 implementation/pilot and runtime cutover remain NOT AUTHORIZED; authorization still requires a measured baseline + representative evidence + explicit owner APPROVED; normative order unchanged.

> **v2.13 (2026-07-12):** Evidence environment RECONCILED to LOCAL (policy §10 supersedes §9.1/§9.2/§9.15/§2 sanitized-copy framing; old text kept for history per SYS-EVID-006). Binding owner decision: evidence testing runs on the **local owner PC / office environment against real case data directly**; no cloud/third-party/external-AI/remote-staging/cross-border transfer; masking/anonymization/sanitization is NOT a cutover prerequisite. Removed as prerequisites: sanitized production copy, pseudonymized staging, masking pipeline, external evidence environment, raw-export/retention deletion rules. So the "no production environment" meta-blocker dissolves for ADR-014; the remaining path is local+technical. Safeguards: no external egress, read-only execution, no live-data mutation, backup/recovery, deterministic evidence. Constitution reconciled (SYS-AUTH-012/EVID-005 satisfied by numeric+opaque-ID outputs; SYS-AUTH-011/SOT-004 by read-only). Remaining gate to PR-11 = (1) measured local baseline, (2) local representative evidence, (3) explicit owner APPROVED. **PR-11 and runtime cutover remain NOT AUTHORIZED; normative order unchanged.**

> **v2.14 (2026-07-12):** ADR014-PE-02 Evidence / Data-Access Procedure DEFINED/CANONICAL in `docs/design/adr-014-evidence-data-access-procedure.md`. The procedure standardizes evidence lifecycle, separate access and execution approvals, local environment and dataset classification, PII-safe package content, role/ownership boundaries and gap classification. “Representative staging” is only a logical isolated/read-only session on the owner-controlled local environment; it does not restore remote/cloud staging. PE-02 used no data and created no environment, runtime, monitoring or authority. Representative environment verification, measured baseline and representative evidence remain absent/blocking; next eligible preparation task is PE-03. **PR-11 and runtime cutover remain NOT AUTHORIZED.**

> **v2.15 (2026-07-12):** ADR014-PE-03 Local Representative Evidence-Session Environment Contract DEFINED/CANONICAL in `docs/design/adr-014-local-evidence-session-environment-contract.md`. The contract fixes the owner-controlled local physical/logical boundary, enforced read-only source rule, no-egress/secrets constraints, deterministic session states, opening/closing gates, hard-stop taxonomy, evidence validity, ownership and environment attestation. No environment or dataset was created; no data was read/copied; no access, execution, evidence, PR-11 or runtime authority was granted. Next eligible preparation task is PE-04 dataset matrix/sampling manifest; representative evidence remains absent/blocking. **PR-11 and runtime cutover remain NOT AUTHORIZED.**

> **v2.16 (2026-07-12):** ADR014-PE-04 Representative Dataset Matrix and Sampling Manifest Contract DEFINED/CANONICAL in `docs/design/adr-014-representative-dataset-matrix-sampling-manifest.md`. It separates source classification from representative qualification, fixes distributional-base versus separately labelled edge-case sampling, defines business/financial/legal/technical/operational coverage, inclusion/exclusion, bias review, an immutable reference-only manifest, validity states and owner-only final approval. No dataset was selected/materialized; no data was read/copied; no environment/session was activated; no evidence, access, execution, PR-11 or runtime authority was granted. Next eligible preparation task is PE-05 metrics/audit/dashboard/alert operational contract; representative evidence remains absent/blocking. **PR-11 and runtime cutover remain NOT AUTHORIZED.**

> **v2.17 (2026-07-12):** ADR014-PE-05 Metrics, Audit, Dashboard and Alert Operational Contract DEFINED/CANONICAL in `docs/design/adr-014-metrics-audit-dashboard-alert-operational-contract.md`. It fixes the bounded metric catalogue, PII-safe labels/logs, durable audit/correlation requirements, four dashboard views, readiness states, alert taxonomy/routing/delivery, baseline-window metadata, retention/integrity, evidence-package integration and ownership. Existing registry and four ADR-014 metric families are retained; missing session metrics, structured logs, audit correlation, dashboard, alert rules/delivery and sealing are explicit prerequisites. No implementation, environment/session, dataset, baseline, evidence, PR-11 or runtime authority was created. Next eligible preparation task is PE-05A implementation preparation; representative evidence remains absent/blocking. **PR-11 and runtime cutover remain NOT AUTHORIZED.**

> **v2.18 (2026-07-13):** ADR014-PE-05A1a through PE-05A4 and PE-05B technical/governance closure reconciliation. PE-05A1a adds bounded shadow component/outcome duration metrics; PE-05A2 adds the typed PII-safe non-durable operational envelope; PE-05A3 adds non-durable audit-correlation preparation; PE-05A4 adds a disabled NO-OP durable-writer abstraction without a runtime call-site. PE-05B adds four deterministic bounded financial-integrity metric families (`adr014_financial_discrepancies_total`, `adr014_missing_evidence_total`, `adr014_integrity_failures_total`, `adr014_primary_display_safety_total`) from existing shadow comparison reports. Existing metric/envelope/correlation/writer contracts, financial output, readiness, blockers, API/DTO and authority remain unchanged. Representative evidence remains absent/blocking; PR-11 and runtime cutover remain NOT AUTHORIZED. No canonical successor is assigned; the next task requires an owner decision.

> **v2.19 (2026-07-13):** ADR014-PE-06A technical/governance closure reconciliation. Technical PR #1190 (squash `77d8e6bdcb16199d01a920a95f78f370837dd28f`) adds a pure, typed and immutable default-disabled local evidence-harness preparation contract. It validates caller-supplied canonical SHA, PE-03 environment/session references, PE-04 manifest reference, separate access/execution authorization references and their common binding without resolving repository state or starting execution. Its bounded outcomes are only `BLOCKED` and `PREPARED`; `PREPARED` grants no data access, execution, evidence acceptance, readiness or cutover authority. No database, filesystem, network, Nest bootstrap, persistence, financial calculation, API/DTO or existing telemetry behavior was added or changed. PR #1159 remains open, non-canonical and on hold; it was not rebased, merged, cherry-picked or used as implementation authority. Representative evidence remains absent/blocking; PR-11 and runtime cutover remain NOT AUTHORIZED. No canonical successor is assigned; the next task requires an owner decision.

> **v2.20 (2026-07-13):** ADR014-PE-06B1/PE-06B2 preparation closure reconciliation. PE-06B1 fixes the immutable, deterministic, PII-safe seven-family observation fact contract and exhaustive split producer ownership. PE-06B2 technical PR #1196 (head `ef0c380d3aa94b3d4f9032de4398ff7aa60a3d08`; squash `e3b9639c71943d7ea45be5c27da52d48daa16389`) reuses those factories through a pure default-disabled producer, a NO-OP sink and bounded metric/event projections. Six fact families map to canonical low-cardinality metric descriptions; PHASE duration remains explicitly blocked without an authorized duration source. PE-05A2 is shadow-comparison-specific, so all session/control event projections remain explicitly blocked and no second event system is introduced. No production call-site, metric/event emission, session/environment/dataset execution, writer/persistence, financial/readiness change or authority promotion exists. Representative evidence remains absent/blocking; PR-11 and runtime cutover remain NOT AUTHORIZED. No canonical successor is assigned; the next task requires an owner decision.

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
- POST-PR-10: W0.1/W0.2/W0.3, PR-1A, PR-1B, PR-2, PR-3h, PR-4, PR-5, PR-6, PR-7, PR-8a, PR-8b, PR-9 ve PR-10 CLOSED / CANONICAL.
  Cutover authorization policy; PE-01/PE-01A/PE-02/PE-03/PE-04/PE-05; PE-05A1a–PE-05A4; PE-05B;
  default-disabled PE-06A harness; PE-06B1 fact contract ve default-disabled PE-06B2 producer/mapping
  preparation CLOSED/CANONICAL'dır. Representative evidence yoktur;
  canonical successor atanmamıştır ve PR-11 consumer switch yetkili değildir.
- MANDATORY ORDER = canonical merge + governance closure + downstream eligibility sırası.
  PARALEL OK = yalnız analiz, hazırlık ve bağımsız branch geliştirmesi; out-of-order merge/closure değildir.
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

**Kritik yol:** `W0 → PR-4 → PR-5 → PR-8a → PR-8b → PR-9 → PR-10 → PR-11 → PR-12 → PR-13 → PR-14`.

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
CANONICAL ORDER: W0 → PR-1A → PR-1B → PR-2 → PR-3h → PR-4 → PR-5 → PR-6 →
                 PR-7 → PR-8a → PR-8b → PR-9 → PR-10 → CUTOVER-AUTH →
                 PR-11 → PR11-STABILITY → PR-12 → PR12-BAKE → PR-13 → PR-14 →
                 POST-CUTOVER → ADR014-FINAL-CLOSURE

PARALEL OK:      Bağımsız workstream'lerin analiz, hazırlık ve branch geliştirmesi paralel olabilir.
PARALEL DEĞİL:   Canonical merge, governance closure veya downstream eligibility sırası.

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
ADR-014 ✗ (bu plan içinde FIX): PR-8a blocker 5/5 + authority/snapshot tutarlılık CLOSED ·
                                PR-8b non-official trace/snapshot layer CLOSED ·
                                PR-9 golden fixture matrix CLOSED ·
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

## 12. Post-PR-10 Status and Mandatory Dependency Chain

```text
Wave 0                         CLOSED / CANONICAL
PR-1A                          CLOSED / CHARACTERIZATION CANONICAL
PR-1B                          CLOSED / IMPLEMENTATION CANONICAL
PR-2                           CLOSED / NO_BUCKETS FAIL-CLOSED CANONICAL
PR-3h                          CLOSED / TBK100 CENT-HARDENING CANONICAL
PR-4                           CLOSED / PARTIAL-PAYMENT INTEREST-BASE CANONICAL
PR-5                           CLOSED / ENFORCEMENT-DATE PRE/POST INTEREST CANONICAL
PR-6                           CLOSED / CURRENCY-ISOLATION FAIL-CLOSED CANONICAL
PR-7                           CLOSED / FEE-PROJECTION PLUMBING FAIL-CLOSED CANONICAL
PR-8a                          CLOSED / SNAPSHOT-READINESS CONSISTENCY CANONICAL
PR-8b                          CLOSED / NON-OFFICIAL EXPLAINABILITY TRACE CANONICAL
PR-9                           CLOSED / GOLDEN FIXTURE MATRIX CANONICAL
PR-10                          CLOSED / ADDITIVE COMPATIBILITY ADAPTER CANONICAL
Calculation completeness       PARTIAL / NOT COMPLETE
Technical readiness            NOT READY
Governance readiness           RECONCILED BY v2.10; owner cutover authorization required
Production readiness           NOT READY
Runtime-cutover readiness      NOT READY
Runtime-cutover authorization  NOT AUTHORIZED
Pre-evidence observability     PE-05A1a–PE-05A4 + PE-05B CLOSED / CANONICAL
Pre-evidence harness           PE-06A CLOSED / CANONICAL / DEFAULT-DISABLED
Observation fact contract     PE-06B1 CLOSED / CANONICAL / PREPARATION-ONLY
Observation producer/mapping  PE-06B2 CLOSED / CANONICAL / DEFAULT-DISABLED
Next eligible step             OWNER DECISION REQUIRED / no canonical successor assigned
PR-11 consumer switch          NOT AUTHORIZED
```

| Sequence | Workstream | Prerequisite | Scope / hard stop | Required evidence | Owner gate | Closure dependency / next |
|---:|---|---|---|---|---|---|
| 1 | PR-2 | v2.0 governance reconciliation CLOSED | `NO_BUCKETS` fail-closed + display/evidence propagation; writer/schema/backfill forbidden | Scenario F, disposable DB, CI 4/4 | No new semantic decision | **CLOSED / CANONICAL** — PR #1104 + separate register closure; PR-3h eligible |
| 2 | PR-3h | PR-2 technical + governance closure (**SATISFIED**) | Cent normalization, negative-payment guard, reporting order; allocator unification forbidden | Scenario D, dust/negative tests, CI 4/4 | Duplicate-TBK100 disposition remains owner-held | **CLOSED / CANONICAL** — PR #1101 + separate register closure; PR-4 eligible |
| 3 | PR-4 | PR-3h technical + governance closure (**SATISFIED**) | Future interest-base mutation only by principal-allocated amount | B/C multi-period DB + shadow evidence | No | **CLOSED / CANONICAL** — PR #1109 + separate register closure; PR-5 eligible |
| 4 | PR-5 | PR-4 technical + governance closure (**SATISFIED**) | Enforcement-date pre/post-interest interaction | Scenario J DB evidence | No | **CLOSED / CANONICAL** — PR #1113 + separate register closure; PR-6 eligible |
| 5 | PR-6 | PR-5 technical + governance closure (**SATISFIED**) | Existing currency grouping + exact supported-domain validation; missing/unsupported and payment/reversal mismatch fail-closed; conversion/new FX authority/schema forbidden | Unit/orchestration + real DB multi-currency/mismatch + PR-5..PR-1B regressions + CI 4/4 | No new authority created; any future FX/conversion policy remains owner-gated | **CLOSED / CANONICAL** — PR #1118 + separate register closure; Wave 1 core hardening closed; PR-7 eligible |
| 6 | PR-7 | PR-6 technical + governance closure / Wave 1 core hardening closure (**SATISFIED**) | Persisted ClaimItem projection plumbing + per-currency fail-closed DTO only; fee/harç formula/policy forbidden | DTO/orchestration + DB evidence + ADR-013 deferral proof | Producer/policy boundary owner-held | **CLOSED / CANONICAL** — PR #1120 + separate register closure; PR-8a eligible |
| 7 | PR-8a | PR-7 closure (**SATISFIED**) | Read-only blocker coverage 5/5 + authority/snapshot/display/evidence signal consistency; persistence forbidden | Unit/display/evidence + real DB diagnostic/materializer/cancel gates + CI 4/4 | Official persistence excluded | **CLOSED / CANONICAL** — PR #1125 + separate register closure; PR-8b eligible |
| 8 | PR-8b | PR-8a technical + governance closure (**SATISFIED**) | Trace/AllocationLog/non-official snapshot layer; schema/official persistence hard stop | Explainability + cleanup evidence | Official snapshot remains ADR-013 owner gate | **CLOSED / CANONICAL** — PR #1128 + separate register closure; PR-9 eligible |
| 9 | PR-9 | PR-8b technical + governance closure (**SATISFIED**) | Twelve scenarios through the W0 contract; no second scenario format | Unit==DB twin-run, currency isolation/mismatch, repeatability, CI 4/4 | No | **CLOSED / CANONICAL** — PR #1132 + separate register closure; PR-10 eligible |
| 10 | PR-10 | PR-9 technical + governance closure (**SATISFIED**) | Additive canonical compatibility adapter; typed fee unavailable states; parity conflict fail-closed; no consumer switch | Adapter unit/contract + W0 unit/DB twin + CI 4/4 | No | **CLOSED / CANONICAL** — PR #1137 + separate register closure; cutover-authorization gate eligible |
| 11 | `UNASSIGNED` cutover authorization | PR-10 technical + governance closure (**SATISFIED**) | Rollback, monitoring, audit, signoff and acceptance policy | Governance decision record → **`docs/design/adr-014-cutover-authorization-policy.md`**; PE-01/PE-01A zero-cent contract/alignment; PE-02 procedure; PE-03 environment contract; PE-04 dataset/manifest contract; PE-05 → **`docs/design/adr-014-metrics-audit-dashboard-alert-operational-contract.md`** | Required | **POLICY + OWNER DECISIONS + PE-01/01A/02/03/04/05 + PE-05A1a–A4 + PE-05B + PE-06A + PE-06B1/B2 DEFINED/CLOSED / EVIDENCE ENV = LOCAL / STILL OWNER-GATED** — bounded metrics, shadow event/correlation preparation, disabled writer, default-disabled local harness, typed observation facts and default-disabled producer/mapping preparation are canonical. PE-06B2 has no production call-site or emission; phase-duration and session/control event mappings remain explicitly blocked. Durable delivery, environment/session activation, dataset materialization, baseline and representative evidence remain absent; PE-06A `PREPARED` is not execution/evidence/readiness authority; no canonical successor is assigned and further work requires owner assignment; remaining cutover gate = implemented/verified local session + approved manifest/selection + measured local baseline + local representative evidence + explicit owner `APPROVED`; PR-11 remains NOT AUTHORIZED |
| 12 | PR-11 | Owner cutover authorization | UI/API/report/template canonical consumer switch | I-10 integration, production smoke, kill-switch | Required | Cutover PR + register closure → PR-11 stability |
| 13 | `UNASSIGNED` PR-11 stability | PR-11 closure | Live smoke, discrepancy monitoring, rollback drill | Accepted stability evidence | Acceptance metrics owner-held | Verification/closure PR → PR-12 |
| 14 | PR-12 | PR-11 stability accepted | Disable silent legacy fallback; canonical unavailable is fail-closed | DB/consumer integration | Required | Cutover PR + register closure → PR-12 bake |
| 15 | `UNASSIGNED` PR-12 bake | PR-12 closure | Production bake, observability and rollback sufficiency | Owner-accepted duration/metrics | Required | Verification/closure PR → PR-13 |
| 16 | PR-13 | PR-12 bake accepted | Shadow/diff dead-code cleanup; live diagnostic need is a hard stop | Static orphan guard, CI 4/4 | No | Technical PR + register closure → PR-14 |
| 17 | PR-14 | PR-13 closure + production bake | Legacy quarantine/deletion; archive/rollback evidence mandatory | Quarantine guard, rollback/archive, CI 4/4 | Required | Completion PR → post-cutover verification |
| 18 | `UNASSIGNED` post-cutover verification | PR-14 closure | API/UI/report/template smoke, tenant isolation, audit, monitoring, reconciliation | Post-cutover evidence package | Acceptance owner-held | Verification/closure PR → final ADR closure |
| 19 | `UNASSIGNED` final ADR-014 closure | All prior closures | Close technical/governance/maintenance records; update ADR status | Master Register + canonical main + GitHub verification | Required | Final governance closure → `CLOSED / CANONICAL` |

`UNASSIGNED` labels are descriptive placeholders, not canonical IDs. They remain unassigned until an explicit owner decision names them.
