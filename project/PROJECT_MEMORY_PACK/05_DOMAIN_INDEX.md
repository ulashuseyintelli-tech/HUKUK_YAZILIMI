# 05 — DOMAIN INDEX (Navigation)

```text
Status                        : CANONICAL HANDOFF (navigation layer)
Version                       : v1.0
Generated From Canonical Main : c7f55da4 (origin/main @ 2026-07-15)
Purpose                       : Ana domainleri ve kanonik durumlarını katalogla
Scope                         : Domain envanteri; her satır kanonik belgeye pointer
Authority                     : NONE (navigation). Bağlayıcı: ilgili Domain Law + SYSTEM-CONSTITUTION + architecture-index
Source Documents              : GOVERNANCE-INDEX.md, SYSTEM-CONSTITUTION.md §5 (SYS-GOV-013..020), DEBTOR/RECEIVABLE/COLLECTION/OFFICE-GOVERNANCE.md,
                                RCV-PHASE-1-AUTHORIZATION.md, architecture-index.md (ADR-009..014), active-roadmap.md, decision-log.md
Supersedes                    : NONE
Update Policy                 : Domain statüsü ilerleyince güncellenir; belirsiz/eski durum kanonik gerçek gibi yazılmaz.
```

> **Layer:** CANONICAL NAVIGATION / HANDOFF LAYER. Kesin statü için ilgili kanonik belgeyi oku.

Anayasal primary domainler (SYS-GOV-013): OFFICE · CLIENT · DEBTOR · RECEIVABLE · COLLECTION. Accounting konumu açık owner kararıdır (SYS-GOV-020).

## DEBTOR / Borçlu
- Normatif amaç: borçlu kimlik/rol/sorumluluk, hukuki durum, tebligat/süre, hukuki karar mimarisi (SYS-GOV-016).
- Canonical governance: `project/docs/governance/DEBTOR-GOVERNANCE.md` (RATIFIED CANONICAL v1.0, 2026-07-12, PR #1139). Kanıt: `project/docs/analysis/debtor-master-synthesis-v2.md`.
- Phase/Wave: **Phase 0 CLOSED/OWNER-RATIFIED** (Wave 0, 2026-07-14). **Phase 1 Blueprint OPEN** (DBP-01 CLOSED/CANONICAL).
- Tamamlanan ana işler: legal-time canonicalization MPB-028(a) PR-2..PR-5; DEBTOR-SCORING-CANON Phase 2; EnforcementAction tenant/caseDebtor migration (kısmi).
- Açık/deferred: `Debtor.legalStatus`, Objection/Enforcement Capability canonicalization, `finalizationRequestStatus`, PR-6 backfill (NOT AUTHORIZED), holiday/calendar, PLEDGE/MORTGAGE/EVICTION/PUBLIC_RECEIVABLE UNRESOLVED, MPB-028(c) PR-EA-5/6 (NOT AUTHORIZED), DEBTOR-SCORING Phase 3 consumer switch. Bkz [07_BORCLU_PHASE0_COMPLETION_ROADMAP.md](07_BORCLU_PHASE0_COMPLETION_ROADMAP.md).
- Blueprint: DBP-01 CANONICAL (`project/docs/blueprint/DEBTOR-CANONICAL-DOMAIN-BLUEPRINT-CHARTER-v1.0.md`); DBP-02..12 planlı. Bkz [08_BLUEPRINT_GUIDE.md](08_BLUEPRINT_GUIDE.md).
- Sınır: RECEIVABLE (tutar/hesap), COLLECTION (tahsilat), CLIENT (müvekkil) ayrı; DEBTOR tek başına receivable amount veya disposition üretmez.

## RECEIVABLE / Alacak
- Normatif amaç: claim item, legal basis, principal/interest/cost bucket, deterministik hesap, legal-allocation debt buckets (SYS-GOV-017).
- Canonical governance: `project/docs/governance/RECEIVABLE-GOVERNANCE.md` (RATIFIED v1.0, PR #1145) + `RCV-PHASE-1-AUTHORIZATION.md`.
- Legal calculation core: **ADR-014 (CCB-001)** — hedef otorite `computeBalance`/ClaimItem+TBK100+Interest Engine; cutover PR-gated, legacy production otoritesi değil, çifte otorite yasak. `architecture-index.md`.
- Primary/shadow/legacy: canonical receivable balance TARGET/SHADOW_ONLY, ADR-014 owner-gated cutover (SYS-FIN, SYS-SOT).
- Sınır: cash receipt/payout/journal COLLECTION/Accounting'e ait.

## COLLECTION / Tahsilat
- Normatif amaç: receipt, cash provenance, idempotency, reversal/refund başlangıcı, legal-allocation bağlantısı (SYS-GOV-018).
- Canonical governance suite: `COLLECTION-GOVERNANCE.md` (owner-approved canonicalization v1.0, 2026-07-13) + `COLLECTION-MASTER-SYNTHESIS.md` + `COLLECTION-OWNER-DECISIONS.md` (açık) + `COLLECTION-RISK-REGISTER.md` + `COLLECTION-DECOMPOSITION.md`. Sınır: `project/docs/finance/tm3-collection-disposition-boundary.md`.
- Invariant: Collection ledger yeniden yazılmaz/bypass edilmez (DEBTOR-GOVERNANCE INV-10). Collection Receipt ≠ Legal Allocation ≠ Creditor Disposition ≠ Payout (SYS-FIN-001).

## CLIENT / Müvekkil
- Normatif amaç: client role/profile, mandate, instruction, client approval, client-level visibility (SYS-GOV-015).
- Canonical governance: **YOK (CLIENT-GOVERNANCE.md mevcut değil).** SYS-GOV-010 gereği bu bir capability status'tur (`DOCUMENTED_ONLY`), governance gap DEĞİL. Client domain-law mevcut kanıtla gerekçelendirilmedi (owner kararı bekler).
- Mevcut işler (implementation/evidence; domain-law değil): client-intake (READ-ONLY promote zinciri), client-finance/approval-center, client-intel form — `project/docs/client-*.md`. Approval sınırı: ADR-009 (OfficeApprovalRequest ≠ ClientApprovalRequest).
- Sınır: receivable balance / legal allocation tek başına hesaplayamaz.

## OFFICE / Avukat-Personel
- Normatif amaç: actor, user/staff role, authorization, organizational responsibility, office-level approval (SYS-GOV-014).
- Canonical governance: `OFFICE-GOVERNANCE.md` (RATIFIED DOMAIN LAW v1.0, 2026-07-13, PR #1177) + `OFFICE-MASTER-SYNTHESIS.md` + `OFFICE-OWNER-DECISIONS.md` + `OFFICE-RISK-REGISTER.md` + `OFFICE-DELIVERY-MANIFEST.md`. Approval çerçevesi ADR-009.
- Sınır: task instance/legal truth/liability/receivable/disposition sahibi değildir.

## LEGAL CALCULATION / ADR-014
- Normatif amaç: deterministik hukuki hesap (bakiye/faiz/mahsup) canonical core. Kaynak: `project/docs/adr/ADR-014-CCB-001-CANONICAL-LEGAL-CALCULATION-CORE.md` (LOCKED, PR-gated). Finansal otorite: `dbind-financial-authority-decisions.md`. Fee/Harç: ADR-013. Journal yönü: ADR-010 (AccountingJournal North-Star, additive/shadow).
- ⚠️ Numara notu: bazı eski CCB-001 branch'leri bu ADR'ı "ADR-012" numarasıyla anar — main'de **ADR-012 = WAITING-PROGRESS-POLICY**; CCB-001 = **ADR-014**.

## UYAP
- Durum: kanonik Domain Law YOK. Mevcut: `project/uyap_bot_blueprint_v1/` ve `.../v10/` (bot recipe/rules/ui-map). SYS-LEGAL: Court/UYAP import verified source evidence olmalı; raw import tek başına canonical truth değildir. **NON-CANONICAL / capability-level** — domain-law gerektiğinde owner kararı.

## ACCOUNTING
- Durum: SYS-GOV-020 — "supporting financial context mi ayrı business domain mı" **açık owner kararı**; Constitution seçeneklerden birini verilmiş saymaz. Yön: ADR-010 (AccountingJournal cutover olmadan current authority olmaz). İlgili gate'ler: `project/docs/finance/acct-*.md`. Primary/shadow: journal additive/shadow, TBK100 yasal otorite kalır.
