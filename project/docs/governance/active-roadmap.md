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
| PHASE 1 | Accounting Journal Engine | Posting · Reversal · Idempotency · Reconciliation · Validation · Event Mapping (şema #645 MERGED; partial live writer wiring) | Codex (BE) | NEXT · design-gate-first | ACCT-1R Generic Reversal CLOSED: contract #738 (`70cf07b8`), service #741 (`6fd1b979`), HTTP boundary #744 (`d44078c5`) merged; generic AccountingJournalEntry reversal now has service/controller/test coverage. MPB-001 manual adjustment CLOSED: PR #757 (`56ea55ad`) merged with contract/service/HTTP boundary coverage. Remaining ACCT-1 scope stays separate: ExpenseRequest/ExpensePayment/ExpenseApplication wiring, Client Accounting UI / Financial Statement projection consumption, and journal movements cutover production decision. Existing wired sources are fail-closed live writer paths; posting-mode helper is not wired as a live gate; DEFAULT-OFF/SHADOW change requires separate owner/mimari decision. ADR-010/legal ledger/TBK100 authority unchanged. Reconciliation gate: `project/docs/finance/acct-1-posting-mode-status-reconciliation-gate.md`. → ACCT-1 |
| PHASE 2 | Trial Balance | Journal doğruluk harness'ı (Σdebit=Σcredit + bakiye mutabakatı); SoT faithfulness kanıtı | Codex (BE) → Claude (FE view) | PLANNED | Raporlama DEĞİL, journal'ın TEST aracı; Distribution'dan önce. → ACCT-2 |
| PHASE 3 | Distribution Recommendation | HELD→POSTED satır bölme için ADVISORY öneri motoru (S8-B); journal'a girecek veriyi üretir | Codex (BE) → Claude (FE pre-fill) | CLOSED | Owner decision closed ACCT-3: `READY FOR OWNER CLOSURE` -> `CLOSED`; closure gate merged: `project/docs/finance/acct-3-distribution-recommendation-closure-gate.md`; A-D contract/docs/controller boundary complete, no behavior/schema/posting/writer/legal-ledger/TBK100 change. → ACCT-3 |
| PHASE 4 | Offset / Payout Integration | Offset apply/reverse + payout journal baglari | Codex (BE) | CLOSED | Owner decision closed ACCT-4: `READY FOR OWNER CLOSURE` -> `CLOSED`; closure gate merged: `project/docs/finance/acct-4-offset-payout-closure-gate.md`; design gate + ACCT-4A contract lock complete, #719 verified web-only after #718. -> ACCT-4 |
| PHASE 5 | Financial Statements | Cari/ekstre/finansal tablolar journal-türevi | Codex (BE) → Claude (FE) | CLOSED | Owner decision closed ACCT-5: `READY FOR OWNER CLOSURE` -> `CLOSED`; closure gate merged: `project/docs/finance/acct-5-financial-statements-closure-gate.md`; design gate + ACCT-5A read contract + ACCT-5B projection service + ACCT-5C HTTP boundary complete; no schema/migration/UI/posting/writer/legal-ledger/TBK100 change. → ACCT-5 |
| PHASE 6 | Reporting | Firma-geneli raporlama | Codex (BE) → Claude (FE) | PLANNED | → ACCT-6 |
| PHASE 7 | Approval UI | Office-approval Inbox/approve FE (P4-6) | Claude (FE-only) | CLOSED / DELIVERED | PR #823 ve #832 ile `/office-approvals` FE teslim edildi; Product Backlog P4-6 DONE ve Master Triage ARC-05-A Closed Register kanıtıyla uyumlu. UA-1 Universal Office Approval generalization ayrı ve DEFERRED kalır. → P4-6 |

## İkincil İz — Alacak Kalemi Domain (2026-07-03 GO-ANALYZE, owner faz kararı bekliyor)

POST-P4 Accounting Engine ekseninden BAĞIMSIZ, ayrı bir hukuki-hesaplama izi (bkz `decision-log.md` 2026-07-03/07-04 satırları). Tam 21 maddelik backlog `product-backlog.md`'de ("Alacak Kalemi Domain — Round-3 Backlog"). Bu tablo implementasyon yetkisi VERMEZ; yalnız zaten gerçekleşmiş işi kayda geçirir — ALC-P0-2B/C veya ALC-P0-3/P0-4'e geçiş için ayrı owner GO gerekir.

| Item | Status | Notes |
|---|---|---|
| ALC-P0-1 Collection idempotency | DONE | PR #851, `d65950f8` |
| ALC-P0-2 POSTED disposition storno | IN-PROGRESS | P0-2A (accounting journal-entry reversal) DONE `bc1b9c4b`; P0-2B/C (BalanceLedger/payout/ClientStatement) AÇIK — kasıtlı manuel boundary, kısayol değil |
| ALC-P0-3 Canonical balance source + cutover tasarımı (B1'in kapanış yolu) | IN-PROGRESS | #857/#861 `interestAccrualStatus`/provenance sözleşmesini ekledi. ALC-P0-3B3 (PR #898, `a8e71a91`) `resolveInterestConfig`'e mixed-source Kademe 1.5 ekledi — 2026/9502 artık canonical (shadow) motor içinde bucket üretiyor. **B1 kapanmış SAYMA**: bu yalnız assembler/orchestration katmanında (`CaseBalanceService`) doğrulandı; canlı UI'nin gösterdiği `case.service.ts` hesabı hâlâ `takipOncesiFaiz=0`/`takipSonrasiFaiz=0` hardcoded olabilir — cutover (canonical'ı PRIMARY display yapmak) ayrı, doğrulanmamış bir adım. 2026/9604-9605 hâlâ eksik veri/pipeline blocker (engine bug değil). ALC-AUTH-3B (PR #917, `8c0cad8f`) `totalDebtAmount` boşluğunu kapattı. ALC-AUTH-3D **FINAL olarak kapandı** (PR #922, `8a340c23` — partial/preceding + PR #925, `6c1304a3` — strict cleanup/final, 2026-07-05): frontend guard artık SIFIR domain-safety authority üretiyor, backend `cutoverReadiness.safeForPrimaryDisplay`/`blockers` tek otorite (`HARD_NO_GO_CODES`/`issueCodes()`/`NOT_COMPARABLE` + PR #925'in kaldırdığı 4 kalıntı kontrol — `SHADOW_OR_CANONICAL_SOURCE_FAILURE`/`FINAL_DEBT_STATES_REQUIRED`/`DISPLAY_CURRENCY_UNSAFE`/report-provenance `CLAIM_ITEM_AUTHORITY_CONTAMINATION` — tamamen kaldırıldı) — `OUTSTANDING_DELTA`/`PAID_DELTA`/`PRINCIPAL_BUCKET_DELTA` için authority-source drift TAM KAPANDI. **ALC-AUTH-3E de KAPANDI (PR #929, `d23003e8`, 2026-07-05)**: `COSTS_DELTA`/`ATTORNEY_FEE_DELTA`/`EXPENSE_BUCKET_DELTA`/`ATTORNEY_FEE_BUCKET_DELTA`'nın kasıtlı olarak `cutoverReadiness.safeForPrimaryDisplay`'i bloklamaması (B1_SCOPE_EXEMPT_DIFF_CODES, ALC-AUTH-1A kararı) nedeniyle cost/ATTORNEY_FEE ClaimItem'ı olmayan case'lerde `toplamBorc`/`sonBorc`/`kalanBorc`'un sessizce anlaşılabilir olduğundan düşük gösterilmesi riski (ALC-AUTH-3C'nin 2026/9502 için hesapladığı ~34.311 TL örneği) kapatıldı: `hasCostOrAttorneyFeeUnderstatementRisk()` zaten mevcut `report.totals.diffs`'teki COSTS_DELTA/ATTORNEY_FEE_DELTA RED sinyalini kullanarak bu 3 alanı case-bazlı legacy'de bırakıyor, diğer 5 canonical-override alan etkilenmiyor — yeni backend contract/migration YOK. **B1/guarded-primary-pilot ekseninde bilinen başka açık blocker yok.** Guarded primary pilot flag hâlâ varsayılan KAPALI — bu iş yalnız güvenli-hale-getirme blocker'larını kapattı, rollout kararının kendisi (ayrı, ürün/Av. sign-off gerektiren bir konu) ayrı ve henüz başlamamış bir owner kararı. |
| ALC-P0-4..7, P1-1..7, P2-1..7 | BACKLOG | Detay `product-backlog.md`'de |

**Production tahsilat geliştirmesi: NO-GO** (yukarıdaki P0 maddeleri kapanana kadar). **Owner karar noktası (2026-07-04 itibarıyla açık):** (1) ALC-P0-2B/C tamamlansın mı, yoksa (2) ALC-P0-3/P0-4 (canonical balance / Due cutover) tasarımına mı geçilsin?
