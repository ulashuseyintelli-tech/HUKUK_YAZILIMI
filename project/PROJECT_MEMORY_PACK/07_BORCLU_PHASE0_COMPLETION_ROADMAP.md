# 07 — BORÇLU PHASE 0 COMPLETION ROADMAP (Navigation)

```text
Status                        : CANONICAL HANDOFF (navigation layer)
Version                       : v1.0
Generated From Canonical Main : c7f55da4 (origin/main @ 2026-07-15)
Purpose                       : Borçlu Phase 0 kapanışının özeti + kanonik roadmap'e pointer
Scope                         : Özet + pointer; yeni roadmap ÜRETMEZ
Authority                     : NONE (navigation). Bağlayıcı kaynak (canonical): project/docs/governance/DEBTOR-PHASE-0-COMPLETION-ROADMAP.md
Source Documents              : project/docs/governance/DEBTOR-PHASE-0-COMPLETION-ROADMAP.md (CANONICAL / PHASE 0 CLOSED), decision-log.md, product-backlog.md
Supersedes                    : NONE
Update Policy                 : Yalnız kanonik roadmap değişince güncellenir.
```

> **Layer:** CANONICAL NAVIGATION / HANDOFF LAYER. **Kanonik kaynak:** `project/docs/governance/DEBTOR-PHASE-0-COMPLETION-ROADMAP.md`.
> ⚠️ Yol notu: PMP-01 talimatı bu belgeyi `project/docs/roadmaps/...` altında referans etti; canonical main'de gerçek yol **`project/docs/governance/DEBTOR-PHASE-0-COMPLETION-ROADMAP.md`**'dir (doğrulandı @c7f55da4). Gerçek yol esastır.

## Özet (kanonik roadmap §1–§10'dan)

- **Amaç/Başlangıç:** Borçlu platformu Phase 0 = production/legal/security foundation; audit + governance + owner kararları + foundation geliştirmeleri.
- **Tamamlanan foundations:** legal-time canonicalization (MPB-028(a)), tenant-boundary regresyon coverage, representative-evidence doğrulama prosedürü.
- **Owner-ratified Wave 0 kapanışı:** 2026-07-14, PR #1240 (`decision-log.md` aynı tarihli kayıt). `GATE-0: PASS`, `GATE-1: PASS`, `GATE-2: PASS — PHASE 0 NARROW LEGAL-TIME SCOPE`.
- **Representative Evidence Operational Gate:** MPB-028(a) PR-3C sonrası/PR-4 öncesi; disposable Docker Postgres'te 12 temsili senaryo; shadow (PR-3B `LegalTimeShadowService`) ↔ canonical (PR-3C `LegalPeriodCalculationService`) TAM eşleşme. Sonuç: **DELIVERED**. (Sentetik ama hukuken temsilî veri; gerçek kişi verisi gerekmez.)
- **PR-2..PR-5 kanıtı:** her kapanışta CI 4/4 SUCCESS + 4-way canonical doğrulama. PR-2 72/72; PR-3A 101/101; PR-3C 118/118 unit/static + 20/20 disposable-DB; PR-4 BE 10/10 + 6/6 DB + 219/219 regresyon + FE 7/7 + 1072/1072; PR-5 BE 9/9 + 5/5 DB + 100/100 automation + 74/74 legal-deadline.

## Deferred / Transferred (silinmedi; Phase 0 sonrasına owner kararıyla taşındı)

`Debtor.legalStatus` (MPB-028(d)) · Objection/Enforcement Capability Canonicalization (`objectionFiledAt`/`objectionEffect`/`enforcementCapabilityStatus`) · `finalizationRequestStatus` (müdürlük/UYAP idari teyit) · PR-6 backfill (NOT AUTHORIZED) · Holiday/calendar · Unresolved proceeding rules (`PLEDGE`/`MORTGAGE`/bağımsız `EVICTION`/`PUBLIC_RECEIVABLE`) · MPB-028(c) PR-EA-3B (HOLD), PR-EA-5/6 (NOT AUTHORIZED) · DEBTOR-SCORING-CANON Phase 3 consumer switch.

## Known Limitations (owner-kabul edilmiş açık riskler)

Scheduler itiraz kontrolü YAPMADAN süre dolunca `workflowStage=ENFORCEMENT`'a geçiyor (PR-5 yalnız tarih kaynağını kanonikleştirdi, karar mekanizmasını değil) · `Debtor.legalStatus` modellenmediği için iflas/konkordato risk skoruna yansımıyor · MPB-028(c) NOT NULL hardening yapılmadı (yalnız guarded write-path) · UNRESOLVED takip türleri legacy fallback'e düşer.

## Blueprint Inputs (Phase 1'e devredilen kurulmuş girdiler)

Kanonik `LegalPeriodCalculationService.computeCanonicalLegalPeriod` API'si (PR-3C) · `LEGAL_TIME_CUTOVER` feature-flag deseni (opsiyonel-DI + fail-closed) · additive enum seti + `legal-period-rule-matrix.ts` · FACT/GATE mimari vizyonu (fact arka planda, gate hukuki-sonuç anında, fail-closed) · disposable-DB representative-scenario evidence deseni.

## Final verdict + güncel durum

- **PHASE 0 COMPLETION ROADMAP: CLOSED.** Wave 0 CLOSED/OWNER-RATIFIED (2026-07-14, PR #1240).
- Roadmap yazıldığında **PHASE 1 BLUEPRINT: ELIGIBLE BUT NOT OPENED** diyordu. **Güncel durum (@c7f55da4): Phase 1 Blueprint OPEN; DBP-01 Charter CLOSED / CANONICAL** (`project/docs/blueprint/DEBTOR-CANONICAL-DOMAIN-BLUEPRINT-CHARTER-v1.0.md`). Bu bir çelişki değil, aşama ilerlemesidir.
- Phase 1 entry: hangi deferred workstream'in kapsama gireceği + Blueprint workstream yetkisi owner kararına bağlıdır.
