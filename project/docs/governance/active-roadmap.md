# Active Roadmap

Bu dosya yalnız üzerinde aktif çalışılan fazları ve implementasyona açık işleri listeler.

Kurallar:

- Active Roadmap dışında implementasyon başlamaz.
- Yeni fikirler doğrudan buraya eklenmez.
- Yeni fikir önce Product Backlog triage akışına girer.
- Kullanıcı onayı olmadan Product Backlog maddesi Active Roadmap'e taşınmaz.
- Faz kapsamını büyüten fikir mevcut PR'a eklenmez.
- Faz kapanışında Backlog Review zorunludur.

## Aktif Eksen — Accounting Domain Completion (POST-P4)

P4 Approval Engine kapandıktan sonra (2026-06-29) ürünün ana ekseni Authorization Engine'den **Accounting Engine**'e çevrildi (bkz `decision-log.md` + `docs/adr/ADR-010-ACCOUNTING-JOURNAL-SOT-NORTH-STAR.md`).

Değer zinciri: **Collection → Distribution → Accounting Journal → Client Accounting → Trial Balance → Financial Statements.** Approval bu zincirin destekleyicisidir.

Owner kilidi = 7 faz. Accounting backend = Codex domain; Claude payı = her backend indikçe FE yüzeyleri + en sonda Approval UI (FE-only). Her faz design-gate-first; bu tablo execution yetkisi vermez (faz-bazlı GO gerekir).

## Active Phases

| Phase | Title | Scope | Owner | Status | Notes |
|---|---|---|---|---|---|
| PHASE 1 | Accounting Journal Engine | Posting · Reversal · Idempotency · Reconciliation · Validation · Event Mapping (şema #645 MERGED·UNWIRED) | Codex (BE) | NEXT · design-gate-first | Behavior-changing; DEFAULT-OFF flag + SHADOW başlar; ADR-010 SoT north-star'a uyumlu (legal-ledger otoritesi KAYMAZ). Önkoşul: #645 migration apply teyidi. → ACCT-1 |
| PHASE 2 | Trial Balance | Journal doğruluk harness'ı (Σdebit=Σcredit + bakiye mutabakatı); SoT faithfulness kanıtı | Codex (BE) → Claude (FE view) | PLANNED | Raporlama DEĞİL, journal'ın TEST aracı; Distribution'dan önce. → ACCT-2 |
| PHASE 3 | Distribution Recommendation | HELD→POSTED satır bölme için ADVISORY öneri motoru (S8-B); journal'a girecek veriyi üretir | Codex (BE) → Claude (FE pre-fill) | CLOSED | Owner decision closed ACCT-3: `READY FOR OWNER CLOSURE` -> `CLOSED`; closure gate merged: `project/docs/finance/acct-3-distribution-recommendation-closure-gate.md`; A-D contract/docs/controller boundary complete, no behavior/schema/posting/writer/legal-ledger/TBK100 change. → ACCT-3 |
| PHASE 4 | Offset / Payout Integration | Offset apply/reverse + payout journal baglari | Codex (BE) | CLOSED | Owner decision closed ACCT-4: `READY FOR OWNER CLOSURE` -> `CLOSED`; closure gate merged: `project/docs/finance/acct-4-offset-payout-closure-gate.md`; design gate + ACCT-4A contract lock complete, #719 verified web-only after #718. -> ACCT-4 |
| PHASE 5 | Financial Statements | Cari/ekstre/finansal tablolar journal-türevi | Codex (BE) → Claude (FE) | CLOSED | Owner decision closed ACCT-5: `READY FOR OWNER CLOSURE` -> `CLOSED`; closure gate merged: `project/docs/finance/acct-5-financial-statements-closure-gate.md`; design gate + ACCT-5A read contract + ACCT-5B projection service + ACCT-5C HTTP boundary complete; no schema/migration/UI/posting/writer/legal-ledger/TBK100 change. → ACCT-5 |
| PHASE 6 | Reporting | Firma-geneli raporlama | Codex (BE) → Claude (FE) | PLANNED | → ACCT-6 |
| PHASE 7 | Approval UI | Office-approval Inbox/approve FE (P4-6) | Claude (FE-only) | PLANNED · demand-gated | Generic `/office-approvals` controller HAZIR; gerçek approval hacmi oluşunca (eksenin SONU). → P4-6 |
