# Product Backlog

Backlog pasif fikir listesi değildir. Her backlog maddesi gelecekte uygulanabilecek potansiyel bir ürün kararıdır.

Yeni fikir akışı:

```text
Yeni fikir
↓
Triage
↓
Product Backlog
↓
READY
↓
Active Roadmap
↓
Implementation
```

Kurallar:

- Yeni fikir doğrudan implementasyona girmez.
- Önce kapsam, schema, migration, mimari etki ve faz uygunluğu değerlendirilir.
- Mevcut fazın kapsamını büyütüyorsa mevcut PR'a eklenmez.
- Bağımlılığı tamamlanan madde için `BACKLOG → READY` önerisi raporlanabilir.
- Kullanıcı onayı olmadan READY maddesi Active Roadmap'e taşınmaz.
- Her faz sonunda Backlog Review zorunludur.

## Legacy / Strategic Backlog Source

Mevcut legacy/strategic backlog kaynağı:

```text
project/docs/strategic-backlog.md
```

Bu dosya yeni governance Product Backlog formatının hedef kaydıdır.

İçerik migration ayrı onaylı iş olarak yapılacaktır.

Çift kaynak oluşmaması için migration tamamlanana kadar `project/docs/strategic-backlog.md` authoritative historical source olarak kalır.

## Product Backlog Format

```text
ID:

Title:

Problem:

Business Value:

Technical Value:

Priority:
LOW / MEDIUM / HIGH / CRITICAL

Depends On:

Unlock Condition:

Estimated Size:

Related Modules:

Status:
BACKLOG
```

## Closed Register

| ID | Domain | İş | Kapanış Kanıtı |
|---|---|---|---|
| MPB-005 | Accounting | Trial Balance query/API/read model expansion | PR #885 squash merged, final SHA `4c8756c911542d579f16672a9ceb8bf696881cbb` |
| MPB-006 | Accounting | Dry-run vs journal reconciliation and real-data reconciliation | PR #892 squash merged, canonical HEAD `05260c781420be5262c142e310299b9f9cc90e4d` |
| MPB-008 | Accounting | Offset audit detail projection | C-2D closeout: PR #644/#646 merged; read-only `GET /client-offsets/:offsetId/detail` projection verified |
| MPB-010 | UI | Confirmed/POSTED collection cancel UX and audit visibility | PR #576 merged, merge commit `90a451b85b3c2b2dfdcc779a373afef45c1cd8e0`; Web Tests, Test Suite and Architectural Guardrails PASS |
| MPB-014 | Authorization | Policy Engine expense/kambiyo/UYAP blockers | PR #42/#43/#44 merged; P3 UYAP outage merge `b222adc31143ae348aa0968302ab1138fd3d08a0`; focused Policy Engine tests PASS |
| MPB-015 | Authorization | OfficeApproval platform hardening and finance bridges | PR #592/#618/#633/#639/#654/#658/#830/#846/#875 merged; focused OfficeApproval/client-settlement tests PASS |
| MPB-016 | Alacak Kalemi | Mixed-source interest resolution (Kademe 1.5, resolveInterestConfig) | PR #898 squash merged, SHA `a8e71a91`; 2026/9502 canonical balance artık üretiliyor; 2026/9604 ve 2026/9605 DATA/PIPELINE blocker olarak açık kalıyor (engine bug değil) |
| MPB-017 | Debtor | CaseDebtor lifecycle, passivation, passive guards and UI visibility | PR #255/#257/#261/#798 merged; repo verification confirmed passivation, passive writer guards, ACTIVE/includePassive readers and passive UI safety; focused backend tests PASS (5 suites, 42 tests); web passive tests present, local Vitest blocked by toolchain startup error |
| MPB-018 | Debtor | Debtor identity / Party Registry / duplicate hardening | Repo verification confirmed duplicate identity guards, similar-name review, identity format/checksum validation and identity drift fixes; Party Registry remains design-only/HOLD by decision; focused backend tests PASS (3 suites, 19 tests) |
| MPB-019 | Debtor | Tebligat `caseDebtorId/addressId` integrity | Repo verification confirmed `Tebligat.caseDebtorId` FK, active CaseDebtor create guard, debtor-owned `addressId` guard and tebligat-to-CaseDebtor sync; PR #243/#889 plus focused backend tests PASS (3 suites, 33 tests) |
| MPB-020 | Security | Borçlu forensic tenant/passive/attribution/API drift fixes | Repo verification confirmed debtor tenant boundary, passive writer/lifecycle guards, actor/audit attribution, type/API drift hardening and cross-case notification compatibility; PR #396/#398/#402/#779/#798/#860/#865/#878/#880 merged; focused backend tests PASS (8 suites, 38 tests) |
| MPB-027 | Security | AddressTask auth, tenant isolation and data-integrity hardening | PR #202/#207/#261 merged; repo verification confirmed AddressTask auth/tenant/data-integrity hardening; focused AddressTask tests PASS (3 suites, 67 tests) |
| ALC-AUTH-1B | Alacak Kalemi | Overpayment display semantics contract (allocatedPaidAmount/grossReceivedAmount) | PR #909 squash merged, SHA `f144f550`; PAID_DELTA reclassified OVERPAYMENT_CLASSIFICATION_EFFECT (not a bug); totalPaidAmount unchanged, additive fields only; 575/575 interest-engine tests PASS |
| ALC-AUTH-3B | Alacak Kalemi | totalDebtAmount projection plumbing (grossPrincipal) | PR #917 squash merged, SHA `8c0cad8f`; guard's CANONICAL_PRINCIPAL_UNAVAILABLE closed for 2026/9502; 35/35 orchestration tests PASS; guarded pilot remains NO-GO pending ALC-AUTH-3D |

## Items

Legacy `strategic-backlog.md` içerik migration'ı ayrı onaylı governance işi olarak yapılacaktır (aşağıdaki maddeler bu migration'dan bağımsız, ADR-009 kararından doğan yeni maddelerdir).

---

ID: UA-1
Title: Universal Office Approval — aksiyon başına approval entegrasyonu
Problem: Durum-değiştiren mutation'lar yetkisiz aktör için doğrudan kesinleşiyor / tutarsız kontrol. ADR-009 bunu OfficeApprovalRequest'e bağlar.
Business Value: Nihai karar kurucu ortakta; tek tutarlı onay + doğal audit (kim istedi/onayladı/reddetti).
Technical Value: Substrate (OfficeApprovalRequest) REUSE; aksiyon başına create-path + executor branch.
Priority: HIGH
Depends On: P4 engine core hardening (P4-5C retry/stuck, P4-3B enforce)
Unlock Condition: Engine core hardened + aksiyon-bazlı tasarım (intel → dosya → finansal sırası)
Estimated Size: XL (çok-fazlı, P4/Codex backend; Claude payı = FE request/Inbox UI)
Related Modules: office-approval, client-intel-statement, case-status, client-settlement
Status: DEFERRED (ADR-009 ön-koşulları MET — P4-5C/P4-3B kapandı — ama POST-P4 ana eksen Accounting Engine'e çevrildi (ADR-010); authz generalization eksen sonrası tekrar sıralanır)

ID: INTAKE-4.7d-2a
Title: Intel inactive visibility + status badge (read-only)
Problem: RETRACTED/FALSE_POSITIVE/SUPERSEDED kayıtlar case detayında görünmüyor (yalnız ACTIVE).
Business Value: Geçmiş/yaşam-döngüsü şeffaflığı.
Technical Value: Mevcut listByCase?status + get; mutation YOK, authz gerektirmez.
Priority: MEDIUM
Depends On: —
Unlock Condition: — (ADR-009'dan bağımsız; hazır)
Estimated Size: S (FE-only)
Related Modules: components/case/IntelStatementSection, lib/api/client-intel-statement
Status: DONE (shipped #642 → c4cb2e10; case-level inactive visibility + status badge READ-ONLY canlı)

ID: INTAKE-4.7d-2bc
Title: Intel mutation UI (retract / false-positive / supersede) — approval-backed
Problem: Mutation UI yetkisiz-doğrudan çalışmamalı; ADR-009 gereği OfficeApprovalRequest üzerinden gitmeli.
Business Value: Güvenli + denetlenebilir istihbarat yönetimi.
Technical Value: FE "request oluştur" + intel-action create-path/executor (backend).
Priority: MEDIUM
Depends On: UA-1 (intel-action approval backend)
Unlock Condition: Intel retract/false-positive/supersede için approval create-path + executor hazır
Estimated Size: M
Related Modules: office-approval (backend), components/case/IntelStatementSection (FE)
Status: BLOCKED (UA-1 DEFERRED'e bağlı; POST-P4 ana eksen Accounting Engine → bu da ertelendi)

---

ID: C2D-POLISH-1
Title: Offset detail row button copy toggle
Problem: The history row detail button always says `Detay`; when expanded, the user may not immediately see that the same control collapses the row.
Business Value: Slightly clearer operations UX for reviewing offset audit details.
Technical Value: Small frontend-only polish; no API or accounting change.
Priority: LOW
Depends On: C-2D closed
Unlock Condition: Owner chooses to prioritize C-2D polish.
Estimated Size: XS
Related Modules: OffsetDrawer
Status: BACKLOG

ID: C2D-POLISH-2
Title: Seeded live browser screenshot smoke for offset detail drawer
Problem: Component tests verify behavior, but there is no stable seeded browser screenshot smoke for visual QA of the detail drawer.
Business Value: Higher visual confidence before demos or release checks.
Technical Value: QA-only validation; should not change production behavior.
Priority: LOW
Depends On: Stable seeded QA fixture
Unlock Condition: Disposable/seeded QA environment available.
Estimated Size: S
Related Modules: OffsetDrawer, client-offset test/QA fixtures
Status: BACKLOG

ID: C2D-DEFER-1
Title: Offset audit timeline pagination/grouping
Problem: Current detail projection returns a simple one-offset audit timeline. Long audit histories may become noisy later.
Business Value: Better readability if real offset timelines become long.
Technical Value: Future read-model optimization; not needed until data volume justifies it.
Priority: LOW
Depends On: C-2D closed
Unlock Condition: Real audit timelines show length/readability pressure.
Estimated Size: M
Related Modules: ClientOffsetService.getOffsetDetail, OffsetDrawer
Status: BACKLOG

ID: C2D-DEFER-2
Title: Richer offset source label rules
Problem: Current source labels use case/expense/payable summary. More business-specific labels may be desired later.
Business Value: Better operator comprehension in complex case/expense contexts.
Technical Value: Presentation/read-model improvement; requires product display rules first.
Priority: LOW
Depends On: C-2D closed
Unlock Condition: Product defines richer label rules and examples.
Estimated Size: S/M
Related Modules: ClientOffsetService.getOffsetDetail, OffsetDrawer
Status: BACKLOG

ID: C2D-PD-1A
Title: Audit Description Sanitization ADR
Problem: C-2D safely hides raw audit metadata, but future audit-rich UIs need a canonical product/security/legal policy for user-authored audit descriptions.
Business Value: Prevents accidental exposure of sensitive free text in audit detail UI and preserves legal distinction between system facts and user statements.
Technical Value: Locks the architecture decision before implementation; prevents ad-hoc safe-summary rules.
Priority: MEDIUM
Depends On: C-2D closed
Unlock Condition: C2D-PD-1 analysis completed.
Estimated Size: S
Related Modules: AuditLog, AuditService, future audit projections
Status: DONE

ID: C2D-PD-1B
Title: Audit Safe Projection Helper
Problem: ADR-011 policy needs a narrow technical helper so future audit projections do not treat user-authored text as safe summaries.
Business Value: Reduces privacy/security/legal risk in audit UIs while preserving operational visibility.
Technical Value: Centralizes safe-summary behavior with tests; avoids repeating action-specific sanitization logic.
Priority: MEDIUM
Depends On: C2D-PD-1A
Unlock Condition: ADR-011 accepted and merged.
Estimated Size: M
Related Modules: AuditLog, AuditService, ClientOffsetService.getOffsetDetail, future audit projections
Status: DONE

ID: C2D-PD-1C
Title: Wire Safe Audit Projection to Generic Audit Endpoints
Problem: The safe audit projection helper exists, but generic audit read endpoints do not expose it for backward-compatible consumers.
Business Value: Gives audit UIs a safe projection path without breaking existing operational screens that still depend on raw audit fields.
Technical Value: Wires ADR-011 policy into the read surface additively; preserves raw contract while enabling staged UI migration.
Priority: MEDIUM
Depends On: C2D-PD-1B
Unlock Condition: Safe helper merged and tested.
Estimated Size: S
Related Modules: AuditService, AuditController, AuditLog
Status: DONE

ID: C2D-PD-1D
Title: Settings Audit UI safeProjection migration
Problem: Settings audit detail UI can still render raw oldValues/newValues JSON even after safeProjection is available.
Business Value: Reduces privacy/security/legal exposure in the admin audit screen.
Technical Value: Frontend-only migration to consume safeProjection while preserving backend raw compatibility.
Priority: MEDIUM
Depends On: C2D-PD-1C
Unlock Condition: Generic audit endpoints expose additive safeProjection.
Estimated Size: S
Related Modules: settings/audit page, AuditService safeProjection response
Status: DONE

ID: C2D-PD-1E
Title: Haciz audit action-specific safe projection review
Problem: Haciz history consumes action-specific audit metadata such as debtor summaries and risk labels; generic safe projection intentionally drops non-whitelisted raw metadata.
Business Value: Keeps haciz history useful without leaking unsafe raw audit payloads.
Technical Value: Design-gate for dedicated or action-specific safe read projection before changing UI consumption.
Priority: MEDIUM
Depends On: C2D-PD-1C
Unlock Condition: Product confirms which haciz audit labels are safe system facts.
Estimated Size: S/M
Related Modules: getCaseHacizAudits, CaseHistoryPanel, HacizHistoryCard, AuditService
Status: DONE (shipped #663 -> a8d7468aacdc72289a261185bd53e695a96f1613; Haciz action-specific safe projection + UI migration completed, ADR-011 compliant)

---

## Accounting Engine — POST-P4 Ana Eksen (ADR-010)

Bu maddeler POST-P4 ana eksenidir (decision-log 2026-06-29; ADR-010). Sıra `active-roadmap.md` PHASE 1..7 ile birebirdir. Accounting backend = Codex domain; Claude payı = FE yüzeyleri + Approval UI (P4-6). Her madde execution-öncesi design-gate-first.

---

ID: ACCT-1
Title: Accounting Journal Engine (PHASE 1)
Problem: ACCT-1 is now partially wired: CollectionDispositionLine, ClientPayout, ClientOffset, direct CREDIT/DEBIT BalanceLedger, and generic AccountingJournalEntry reversal paths write AccountingJournal entries; remaining closure gaps are manual adjustment semantics, expense live writer wiring, and any posting-mode cutover decision.
Business Value: Read-time türetilen cari → kanonik POSTED ledger; trial balance / ekstre / firma-geneli mutabakat açılır.
Technical Value: Writer/builder/validator/idempotency/source replay exist for wired sources. ACCT-1R Generic Reversal CLOSED via contract #738 (`70cf07b8`), service #741 (`6fd1b979`), and HTTP boundary #744 (`d44078c5`): tenant/auth-context reversal service, idempotent replay, audit transaction, CPE metadata, and focused service/HTTP smoke tests are merged. Posting-mode helper exists but is not the live gate for existing fail-closed writer paths; DEFAULT-OFF/SHADOW gating of live paths requires separate owner/mimari decision. Manual adjustment, ExpenseRequest/ExpensePayment/ExpenseApplication wiring, Client Accounting UI / Financial Statement projection consumption, and journal movements cutover production decision remain separate ACCT-1 scope.
Priority: HIGH
Depends On: #645 şema (MET); ADR-010 SoT north-star
Unlock Condition: Owner-selected next ACCT-1 slice for manual adjustment, expense live writer wiring, projection/UI consumption, or journal movements production cutover; any posting-mode behavior change requires owner/mimari decision.
Estimated Size: L (Codex BE; design-gate-first; behavior-changing)
Related Modules: client-settlement, AccountingJournalEntry/AccountingJournalLine, accounting-ledger-dry-run.service
Status: READY

ID: ACCT-1D-0
Title: BalanceLedger Journal Boundary Decision Note
Problem: `BalanceLedger` rows can be written in the same economic path as `CollectionDispositionLine(type=OFFSET_CLIENT_ADVANCE)`. Blind journal wiring would double count client advance movement.
Business Value: Prevents duplicated accounting impact before direct BalanceLedger journal source coverage begins.
Technical Value: Locks suppression rule for correlated `disposition_line:*` BalanceLedger rows and keeps BalanceLedger as reconciliation signal in that path.
Priority: HIGH
Depends On: ACCT-1 journal writer/posting foundation
Unlock Condition: Docs boundary merged
Estimated Size: XS (docs/governance only)
Related Modules: BalanceLedger, CollectionDispositionLine, DispositionPostingService, accounting-ledger-dry-run.service, AccountingJournal
Status: DONE

ID: ACCT-1D-1
Title: Direct BalanceLedger Journal Writer Wiring
Problem: Direct/unlinked BalanceLedger movements are not yet journal sources, while correlated disposition-line BalanceLedger rows must be suppressed to avoid double counting.
Business Value: Completes client advance journal coverage for direct BalanceLedger movements without corrupting offset/disposition posting accounting.
Technical Value: Adds direct BalanceLedger source mapping while excluding correlated `disposition_line:*` rows; keeps `ADJUST` and `REFUND` out until product/accounting decision.
Priority: HIGH
Depends On: ACCT-1D-0, ACCT-1 writer foundation, client offset/payout journal wiring
Unlock Condition: Confirm direct/unlinked BalanceLedger query paths and idempotency source keys; product/accounting decision for `ADJUST`/`REFUND` remains separate.
Estimated Size: M (Codex BE; design-gate-first)
Related Modules: CaseBalanceService, BalanceLedger, AccountingJournalWriterService, accounting-ledger-dry-run.service
Status: DONE
Evidence: `9d74b4e7` (#685) direct BalanceLedger journal wiring + `5e861b23` (#687) contract hardening; direct CREDIT/DEBIT BalanceLedger writes are live, correlated `disposition_line:*` rows are suppressed, and ADJUST/REFUND remain future product/accounting decisions.
ID: ACCT-2
Title: Trial Balance (PHASE 2)
Problem: Journal'ın doğru yazıldığını doğrulayacak hızlı kontrol ekranı yok; SoT geçişi için faithfulness kanıtı gerekli.
Business Value: Journal doğruluk güvencesi + ileride SoT cutover kanıtı.
Technical Value: Σdebit=Σcredit kitap-geneli + account bakiye mutabakatı; journal-bakiyeleri == legal-ledger-türevi karşılaştırma (balance-shadow-compare reuse). Raporlama değil, TEST aracı.
Priority: HIGH
Depends On: ACCT-1 (journal SHADOW yazıyor)
Unlock Condition: Journal Engine SHADOW canlı
Estimated Size: M (Codex BE + Claude FE view)
Related Modules: accounting journal, balance-shadow-compare, FE TrialBalance view
Status: BACKLOG

ID: ACCT-3
Title: Distribution Recommendation (PHASE 3 / S8-B)
Problem: HELD→POSTED satır bölme (fee% / client-payable / reimbursement) operatöre boş tipli form; advisory öneri yok.
Business Value: Boş form yerine ön-doldurulmuş öneri; journal'a girecek veriyi besler.
Technical Value: Legal allocation/TBK100 + fee agreement okuyan advisory engine (S8-A offset-rec analoğu); manuel-onay korunur. FE pre-fill OffsetDrawer.initialSelection deseni.
Priority: HIGH
Depends On: ACCT-1 event-mapping contract
Unlock Condition: —
Estimated Size: M-L (Codex BE → Claude FE pre-fill)
Related Modules: client-settlement disposition, OperationDeck (FE pre-fill)
Status: CLOSED (Owner decision: ACCT-3 phase closed, `READY FOR OWNER CLOSURE` -> `CLOSED`; ACCT-3 closure gate merged: `project/docs/finance/acct-3-distribution-recommendation-closure-gate.md`; A-D advisory contract/docs/controller boundary complete; no behavior/schema/posting/writer/legal-ledger/TBK100 change)

ID: ACCT-4
Title: Offset / Payout Integration (PHASE 4)
Problem: Offset apply/reverse + payout olayları journal'a bağlanmalı (CLIENT_OFFSET_APPLIED/REVERSED, CLIENT_PAYOUT_RECORDED).
Business Value: Mahsup ve ödeme olayları kanonik journal'da; tam muhasebe kapsaması.
Technical Value: Mevcut ClientOffset/payout event'lerinden journal posting branch'leri (ACCT-1 deseni).
Priority: MEDIUM
Depends On: ACCT-1
Unlock Condition: Journal Engine posting çekirdeği hazır
Estimated Size: M (Codex BE)
Related Modules: client-settlement (offset/payout), accounting journal
Status: CLOSED (Owner decision: ACCT-4 phase closed, `READY FOR OWNER CLOSURE` -> `CLOSED`; ACCT-4 closure gate merged: `project/docs/finance/acct-4-offset-payout-closure-gate.md`; design gate + ACCT-4A service contract lock complete; #718 squash `886f3cf634bec5bb7b0b24854057ab7d223f31ea`, final canonical HEAD difference explained by later web-only #719)

ID: ACCT-5
Title: Financial Statements (PHASE 5)
Problem: Cari/ekstre/finansal tablolar journal-türevi üretilmeli (bugün read-time türetiliyor).
Business Value: Tutarlı, kanonik kaynaklı müvekkil/firma finansal tabloları.
Technical Value: Journal-türevi projection okuyucuları; ADR-010 SoT yönüne hizalı.
Priority: MEDIUM
Depends On: ACCT-1, ACCT-2
Unlock Condition: Journal + Trial Balance faithfulness kanıtlandı
Estimated Size: M-L (Codex BE → Claude FE)
Related Modules: accounting journal, client-accounting, FE statements
Status: CLOSED (Owner decision: ACCT-5 phase closed, `READY FOR OWNER CLOSURE` -> `CLOSED`; ACCT-5 closure gate merged: `project/docs/finance/acct-5-financial-statements-closure-gate.md`; design gate #725, ACCT-5A #727, ACCT-5B #728, ACCT-5C #730 complete; read contract, projection service, HTTP boundary, and reporting-vs-diagnostic separation verified; no schema/migration/UI/posting/writer/legal-ledger/TBK100 change)

ID: ACCT-6
Title: Reporting (PHASE 6)
Problem: Firma-geneli muhasebe raporlaması yok.
Business Value: Yönetim görünürlüğü; firma-geneli finansal raporlar.
Technical Value: Journal/statement projeksiyonları üzerine raporlama katmanı.
Priority: MEDIUM
Depends On: ACCT-5
Unlock Condition: Statements hazır
Estimated Size: M (Codex BE → Claude FE)
Related Modules: accounting journal, reporting, FE reporting
Status: BACKLOG

ID: P4-6
Title: Office-Approval Inbox / Approve FE UI (PHASE 7)
Problem: P4 enforce açılınca PENDING CHANGE_STATUS talepleri oluşur ama görüntüley/onaylayacak ekran yok; runGuarded approval_pending döner ama inbox yok.
Business Value: P4 motorunu kullanılır kılar (eksenin destekleyici kapağı).
Technical Value: Generic /office-approvals controller (inbox/mine/:id/approve/reject/request-revision/approve-with-changes/cancel) HAZIR; FE-only, sıfır backend bağımlılık. guarded-edge APPROVAL_REQUIRED envelope reuse.
Priority: LOW (demand-gated — eksenin SONU)
Depends On: —
Unlock Condition: Gerçek approval hacmi (mutation/accounting yüzeyleri canlı)
Estimated Size: M (Claude FE-only)
Related Modules: web components/office-approval, lib/api/office-approval, guarded-edge
Status: DONE (governance bookkeeping correction, 2026-07-04 — Master Triage ARC-05 split-verdict
re-verification: bu iş fiilen teslim edilmiş, BACKLOG kalması repository ile çelişiyordu; yeni
geliştirme/reimplementasyon YOK, yalnız statü düzeltmesi)
Delivered by: PR #823 (P4-4 Office Approval Inbox read-only UI), PR #832 (P4 Office Approval
Decision UI — drawer içi karar aksiyonları)

---

## Alacak Kalemi Domain — Round-3 Backlog (2026-07-03 GO-ANALYZE, NO-GO koşullu)

2026-07-03 tarihli Alacak Kalemi (Claim Item) full-stack GO-ANALYZE denetimi (36-ajanlı workflow, 23 CONFIRMED bulgu: B1 canlı bakiye faiz=0+TBK100 mahsupsuz, B2 interest-engine auth bypass, B3 CASCADE-delete FK boşluğu, B4 ClaimItem mutasyonu audit'siz, B5 ledger idempotency yok, B6 kanonik motorda 3 matematik hatası) + Round-2 senaryo analizi (20-ajanlı, S1-S10) + owner'ın harici hukuki kaynak eleştirisi (Harçlar K. tahsil harcı, AYM 22.07.2025 3095 iptali, TCMB/TTK1530, 12. Yargı Paketi) sonucu üretilen 21 maddelik backlog. **Karar: production tahsilat NO-GO** (P0 maddeleri kapanırsa CONDITIONAL GO). Bu eksen POST-P4 Accounting Engine ekseninden (ADR-010) BAĞIMSIZDIR — ancak 2026-07-04 itibarıyla paralel bir oturumun aynı dosyalara (interest-engine/claim-item, collection-reversal.service.ts) ALC-P0-1'den habersiz şekilde dokunduğu doğrulanmıştır (bkz decision-log.md 2026-07-04 satırı); implementasyon öncesi güncel git durumu kontrol edilmelidir.

---

ID: ALC-P0-1
Title: Collection idempotency
Problem: MANUAL tahsilat girişinde idempotency guard yoktu; aynı ödeme iki kez kaydedilebiliyordu (S9/RC2).
Business Value: Borç/payable tutarlarının çift-sayım riski olmadan doğru kalması.
Technical Value: Mevcut `@@unique([tenantId, idempotencyKey])` deseni (ClientOffset/AccountingJournalEntry'de kanıtlı) Collection.create'e taşındı; advisory-lock + P2002 disambiguation.
Priority: CRITICAL
Depends On: —
Unlock Condition: — (bağımsız, ilk uygulanan madde)
Estimated Size: M
Related Modules: collection.service.ts, Collection (schema), CollectionModal (FE)
Status: DONE (PR #851, merge `d65950f8`, 2026-07-03; DB-gated integration test disposable Docker Postgres'te PASS)

ID: ALC-P0-2
Title: POSTED collection disposition reversal/storno zinciri
Problem: PAYMENT_REVERSED bir POSTED disposition'a geldiğinde journal/BalanceLedger/payout etkileri atomik geri alınmıyordu (S7/RC7).
Business Value: Ödeme iptal edildiğinde mizanın/muhasebe defterinin askıda para bırakmaması.
Technical Value: `collection-reversal.service.ts` genişletmesi; POSTED disposition kör REVERSED yapılmadan (2026-06-27 kilitli karar korunarak) journal/BalanceLedger/payout tarafını kapsayan storno.
Priority: CRITICAL
Depends On: —
Unlock Condition: P0-2B/C için BalanceLedger/payout/ClientStatement reversal tasarım kararı (owner)
Estimated Size: M-L
Related Modules: collection-reversal.service.ts, AccountingJournalEntry, BalanceLedger, ClientPayout, ClientStatement
Status: IN-PROGRESS — **P0-2A** (accounting journal-entry storno, idempotent, `reverseAccountingJournalEntryInTransaction`) DONE, commit `bc1b9c4b` (2026-07-04, paralel oturum). **P0-2B/C** (BalanceLedger + payout + ClientStatement etkileri) HÂLÂ AÇIK — kasıtlı manuel boundary (2026-06-27 kilitli karar: "yalnız status değiştirmek finansal hakikati düzeltmez"). P0-2A'yı P0-2'nin tamamı sanma.

ID: ALC-P0-3
Title: Canonical balance source decision + cutover tasarımı
Problem: Üç ayrı "bakiye gerçekliği" var (case.service.ts getCalculationSummary/dues-tabanlı gösterim, ClaimItem/summary-engine, interest-engine computeBalance) — hiçbiri diğerini SoT olarak geçersiz kılmıyor (S1/S2/S5 kökeni/RC1).
Business Value: Gösterilen borç/kalan-borç tutarının tek, doğru, denetlenebilir kaynağa dayanması.
Technical Value: Authoritative motor seçimi + cutover sırası (shadow→prove→legal-signoff) kararı; bu madde tasarım/karar kaydıdır, kod değil.
Priority: CRITICAL
Depends On: P0-4, P0-5, P0-7 (karşılıklı — cutover tasarımı üçünü birden kapsar)
Unlock Condition: Av. sign-off (gösterilen borç tutarı değişecek)
Estimated Size: L (tasarım) + ayrı L (implementasyon, sonraki gate)
Related Modules: case.service.ts (getCalculationSummary), interest-engine (CaseBalanceService), summary-engine, balance-shadow-compare
Status: BACKLOG — **B1 blocker'ının kapanış yoludur.** #857/#861 (2026-07-03/04, commit `de4e49c7`/`dc22c6f9`) yalnız ClaimItem'a `interestAccrualStatus`(ACCRUES/NO_INTEREST/UNKNOWN)/`interestStartDateProvenance` sözleşmesini ekledi; cutover'ın kendisi başlamadı. `case.service.ts:3860-61` hâlâ `takipOncesiFaiz=0`/`takipSonrasiFaiz=0` hardcoded (2026-07-04 itibarıyla koddan doğrulandı). #857 ile B1'i kapanmış SAYMA.

ID: ALC-P0-4
Title: Legacy `Due` freeze/decommission
Problem: `Due` modeli tenant'sız/audit'siz/mutable; gösterilen bakiye hâlâ bunu okuyor; ClaimItem ile çifte kaynak.
Business Value: Tek kanonik alacak kaynağı; veri bütünlüğü.
Technical Value: Tutar-bazlı (yalnız adet değil) reconciliation raporu + freeze/decommission planı.
Priority: HIGH
Depends On: P0-3
Unlock Condition: P0-3 cutover yönü kararlaştıktan sonra
Estimated Size: L
Related Modules: Due (schema), case.service.ts, due-to-claim-item.mapper.ts
Status: BACKLOG

ID: ALC-P0-5
Title: Interest/expense materialization + TBK100 allocation (canlı write-path)
Problem: `addInterestItem` throw ediyor; faiz/masraf ClaimItem'a hiç dönüşmüyor; write-path anapara-only'ye çöküyor (S2/RC3).
Business Value: Kısmi ödemede faiz/masraf kaybolmadan doğru mahsup.
Technical Value: TBK100 allocator'ı canlı write-path'e bağlamak; kanonik motoru SHADOW_ONLY'den çıkarmak.
Priority: CRITICAL
Depends On: P0-3
Unlock Condition: P0-3 cutover kararı + Av. doğrulaması (TBK100 fer'i-faizden-önce yorumu)
Estimated Size: L
Related Modules: interest-engine, tbk100-allocator.service.ts, claim-item.service.ts
Status: BACKLOG

ID: ALC-P0-6
Title: Tahsil harcı 2D matris + state-liability modeli
Problem: Tahsil harcı hiçbir katmanda tahakkuk etmiyor; oran hem aşamaya (haciz-öncesi/sonrası/satış) hem tahsil yöntemine (müdürlük/haricen) göre değişiyor, kodda tek hardcoded oran var (S6/RC6; owner harici kaynak: Harçlar K. m.23).
Business Value: Devlete ödenecek harcın doğru + zamanında tahakkuku; mükerrer/eksik tahsilat riskinin kapanması.
Technical Value: `enforcementStage`/`collectionMethod` alanları (şemada yok) + 2D oran matrisi + `CollectionDispositionLineType`'a devlet-harcı satırı.
Priority: HIGH
Depends On: P0-2 (storno modeliyle tutarlı state-fee reversal), P1-5
Unlock Condition: P1-5 (enforcementStage/collectionMethod şeması)
Estimated Size: L
Related Modules: case.service.ts, CollectionDispositionLineType (schema), AccountingAccountCode
Status: BACKLOG

ID: ALC-P0-7
Title: Shadow compare + migration reconciliation
Problem: `BalanceShadowCompareService` kısmen mevcut ama persist edilmiş "old=new" raporu yok; cutover kanıtı üretilemiyor.
Business Value: Cutover'ın gösterilen bakiyeyi bozmadığının denetlenebilir kanıtı.
Technical Value: Shadow-compare sonuçlarının persist edilmesi + reconciliation raporu.
Priority: HIGH
Depends On: P0-3, P0-4, P0-5
Unlock Condition: P0-3/4/5 tamamlandıktan sonra
Estimated Size: M
Related Modules: balance-shadow-compare
Status: BACKLOG

ID: ALC-P1-1
Title: PaymentDesignation / TBK 101 (borçlu mahsup iradesi)
Problem: Şemada tamamen yok; `collection.service.ts:565` "not implemented" itirafı; borçlunun "şu borca mahsuben" iradesi sessizce eziliyor (S3).
Business Value: TBK 101 gereği borçlunun tahsis hakkının korunması; yanlış borca mahsup riskinin kapanması.
Technical Value: `PaymentDesignation`/`PaymentApplication` katmanı (bkz claim-model-7q-decisions.md Cross-cutting #1).
Priority: HIGH
Depends On: P0-5
Unlock Condition: P0-5 (materialization) sonrası
Estimated Size: L
Related Modules: collection.service.ts, yeni PaymentDesignation (schema)
Status: BACKLOG

ID: ALC-P1-2
Title: Receipt allocation semantics
Problem: Alacaklı makbuz yönlendirmesi (hangi ödeme hangi borca yazılsın beyanı) tutulamıyor.
Business Value: Makbuz bazlı tahsis hukuki geçerliliğinin korunması.
Technical Value: UNKNOWN — mevcut altyapı belirsiz, ayrı forensic gerekebilir.
Priority: MEDIUM
Depends On: P1-1
Unlock Condition: P1-1 sonrası
Estimated Size: M (UNKNOWN — forensic sonrası netleşir)
Related Modules: collection.service.ts
Status: BACKLOG

ID: ALC-P1-3
Title: TBK102AllocationPolicy ("ilk takip edilen borç" önceliği)
Problem: Write-path `sortOrder asc` kullanıyor, `dueDate` okumuyor; owner düzeltmesi (R2): icra platformunda dominant kriter "ilk takip edilen borç", `dueDate` değil (S4).
Business Value: Çoklu borçta doğru borç-kimliği ataması; zamanaşımı hesaplarının yanlış borca kaymaması.
Technical Value: Sıra: açıklama→makbuz→muaccel→**ilk takip edilen**→vade→orantılı→güvence-en-az.
Priority: HIGH
Depends On: P1-1; pursuit-tarihi alanının var olup olmadığı (UNKNOWN, migration gerekebilir)
Unlock Condition: P1-1 + pursuit-field forensic
Estimated Size: M-L
Related Modules: collection.service.ts, yeni pursuit-date alanı (muhtemel migration)
Status: BACKLOG

ID: ALC-P1-4
Title: `LegalRateRule` fixed + derived (formül-yetenekli oran motoru)
Problem: Rate engine yalnız statik effectiveDate+ratePercent taşıyor; 12. Yargı Paketi'nin reeskont×%80 formülü statik tabloyla temsil edilemez (S5; owner'ın R3 düzeltmesi).
Business Value: Kanuni faiz oranı mevzuat değiştiğinde (12. Yargı Paketi yasalaşırsa) sisteme formülle, elle güncellemeden yansıması.
Technical Value: `LegalRateRule` hem `FIXED_RATE` hem `DERIVED_FROM_REFERENCE_RATE` tiplerini taşır; `status`(DRAFT/PROPOSED_RULE/ENACTED_NOT_EFFECTIVE/EFFECTIVE) ile henüz yasalaşmamış kural canlı hesaba karışmaz.
Priority: MEDIUM
Depends On: P0-3
Unlock Condition: P0-3 sonrası; 12. Yargı Paketi'nin fiili yasalaşma durumu (owner tespiti 2026-07-03: esas no 2/3737, Adalet Komisyonu'nda kabul, henüz kanunlaşmadı — GÜNDEMDE)
Estimated Size: M
Related Modules: interest-engine rate provider
Status: BACKLOG

ID: ALC-P1-5
Title: enforcementStage/collectionMethod modeli
Problem: Tahsil harcı matrisinin (P0-6) önkoşulu olan aşama/yöntem alanları şemada yok (teyit edildi).
Business Value: P0-6'nın önkoşulu; ayrıca dosya-aşaması raporlamasında genel fayda.
Technical Value: Yeni alan(lar) + migration.
Priority: HIGH
Depends On: —
Unlock Condition: —
Estimated Size: S-M (migration + backfill)
Related Modules: Case/CaseDisposition (schema)
Status: BACKLOG

ID: ALC-P1-6
Title: State payable / government liability hesap kodu
Problem: `AccountingAccountCode`'da devlet-harcı hesabı yok (teyit edildi).
Business Value: Tahsil harcının muhasebe defterinde doğru hesaba düşmesi.
Technical Value: Yeni account code + posting branch.
Priority: MEDIUM
Depends On: P1-5
Unlock Condition: P1-5 sonrası
Estimated Size: S
Related Modules: AccountingAccountCode, accounting journal
Status: BACKLOG

ID: ALC-P1-7
Title: Attorney fee / client payable ayrımı doğrulaması
Problem: Mevcut ayrım var ama state-fee (P0-6) eklenince matrah değişecek; doğrulama gerekiyor.
Business Value: Vekalet ücreti ile müvekkile-borç ayrımının harç eklenince bozulmaması.
Technical Value: Migration gerekmiyor; yalnız doğrulama/test.
Priority: MEDIUM
Depends On: P0-6
Unlock Condition: P0-6 sonrası
Estimated Size: S
Related Modules: disposition-posting.service.ts
Status: BACKLOG

ID: ALC-P2-1
Title: Due→ClaimItem/Ledger migration mapping (tutar-mutabakatı)
Problem: Backfill sınıflandırması exhaustive ama tutar-bazlı mutabakat raporu yok.
Business Value: Migration'da veri kaybı olmadığının kanıtı.
Technical Value: Reconciliation script.
Priority: MEDIUM
Depends On: P0-4
Unlock Condition: P0-4 sonrası
Estimated Size: M
Related Modules: due-to-claim-item.mapper.ts, backfill scripts
Status: BACKLOG

ID: ALC-P2-2
Title: old vs new computed balance reconciliation
Problem: Persist edilmiş kanıt yok.
Business Value: Cutover kararının denetlenebilir kanıtı.
Technical Value: P0-7'nin raporlama tarafı.
Priority: MEDIUM
Depends On: P0-7
Unlock Condition: P0-7 sonrası
Estimated Size: S
Related Modules: balance-shadow-compare
Status: BACKLOG

ID: ALC-P2-3
Title: Shadow-compare threshold + gate
Problem: `finalDebtStates` dolu + `safeForPrimaryDisplay=true` fixture/threshold tanımlı değil.
Business Value: Cutover'ın ne zaman "güvenli" sayılacağına dair nesnel eşik.
Technical Value: Threshold config + gate mantığı.
Priority: MEDIUM
Depends On: P0-7
Unlock Condition: P0-7 sonrası
Estimated Size: S
Related Modules: balance-shadow-compare
Status: BACKLOG

ID: ALC-P2-4
Title: Tenant/case-scoped cutover flag
Problem: Cutover'ın kademeli (tenant/case bazlı) açılabilmesi için flag yok.
Business Value: Riskin kademeli kontrolü; tam-veya-hiç cutover'dan kaçınma.
Technical Value: Guarded-primary çift-kilit flag deseni (mevcut flag desenleriyle tutarlı).
Priority: LOW
Depends On: P0-3
Unlock Condition: P0-3 sonrası
Estimated Size: S
Related Modules: feature-flags
Status: BACKLOG

ID: ALC-P2-5
Title: Immutable audit snapshot + capability (ClaimItem mutasyonu)
Problem: ClaimItem mutasyonu audit'siz + capability-siz (B4/S10/RC9).
Business Value: Kim-ne-zaman-neyi-değiştirdi denetlenebilirliği; ADR-009 tutarlılığı.
Technical Value: ADR-009 office-approval akışına bağlanma + audit alanları.
Priority: HIGH
Depends On: ADR-009 (Universal Office Approval, LOCKED ama POST-P4 sonrasına ertelendi — bkz UA-1)
Unlock Condition: UA-1 sıraya girene kadar bloklu
Estimated Size: M
Related Modules: claim-item.service.ts, office-approval
Status: BACKLOG (UA-1 ile aynı blok zincirine bağımlı)

ID: ALC-P2-6
Title: Rollback plan (finansal migration)
Problem: 64 migration'da down-path yok.
Business Value: Migration hatası durumunda geri dönüş imkânı.
Technical Value: Rollback script seti.
Priority: LOW
Depends On: —
Unlock Condition: —
Estimated Size: M
Related Modules: prisma/migrations
Status: BACKLOG

ID: ALC-P2-7
Title: Golden master legal fixtures
Problem: Hukuki hesap karakterizasyonu (TBK100/101/102+faiz-segment+tahsil-harcı-matris+storno) dağınık, tek golden-set yok.
Business Value: Regresyon güvenliği + hukuki doğrulamanın tek yerde sabitlenmesi.
Technical Value: Golden fixture seti + karakterizasyon testleri.
Priority: MEDIUM
Depends On: P0-5, P0-6, P1-3, P1-4
Unlock Condition: Bağımlı maddeler tamamlanınca
Estimated Size: M
Related Modules: interest-engine test fixtures
Status: BACKLOG

---

## ALC-P0-3A — Canonical Bucket Availability (2026-07-04, ALC-P0-3'ün alt-hattı)

Kaynak: gerçek `GET /api/interest-engine/case/:caseId/balance` çağrısı `result:null, skippedReason:NO_BUCKETS, diagnostics:CURRENCY_MISMATCH` döndürdü (diagnostic script'in DI hatası değil — owner'ın gerçek dev server + gerçek case ID ile doğrulaması). Kök neden koddan izlendi: `assembleClaimBuckets([])` (0 ClaimItem) + `groupByCurrency` payment'i "bucket'sız" TRY grubuna düşürüyor. `case-balance.service.ts`/`currency-grouper.ts`/`case.service.ts`/`collection.service.ts`/`case.dto.ts`/`cases/[id]/page.tsx` satır satır okunarak 4 alt-madde çıkarıldı.

ID: ALC-P0-3A1
Title: Orphan collection detection (CONFIRMED collection + 0 ClaimItem) — salt-okuma DB taraması
Problem: Sistemin ClaimItem'sız CONFIRMED collection üretebildiği koddan doğrulandı (bkz ALC-P0-3A4); mevcut DB'de kaç dosyayı etkilediği bilinmiyordu.
Business Value: Varsayım değil, ölçülmüş gerçek etki.
Technical Value: Salt-okuma script (`scripts/diagnostic-orphan-collections.ts`, untracked, commit edilmedi) — `Collection.groupBy(status=CONFIRMED)` + her caseId için ClaimItem/Due count.
Priority: —
Depends On: —
Unlock Condition: —
Estimated Size: XS
Related Modules: collection, claim-item, due
Status: DONE (2026-07-04). **KRİTİK BULGU:** dev DB'de 4 CONFIRMED-collection'lı dosyadan yalnız 1'i ClaimItem=0 (VE Due=0). **O TEK dosya (`cmqpl7tb300021zfni38hq9j8`, dosya no 2026/9501) — collection ID'si (`cmqz0dt9o...`) ve tutarı (₺5.000) `collection-clientpayable-flow-audit.md` hafızasındaki "ABC Lojistik" QA-referans verisiyle BİREBİR eşleşiyor** — bu, 2026-06-29'da owner tarafından zaten "QA-REFERENCE-DATA, SİLİNMEZ/RESET EDİLMEZ" olarak KİLİTLENMİŞ, bilinçli/sentetik bir test seed'i ('[TM47D6-QA-SEED]' işaretli, gerçek aktör yok). **Organik (gerçek kullanım kaynaklı) sıfır orphan-collection dosyası bulunmadı.** Mekanizma (A4) koddan kesin doğrulandı; ama mevcut dev DB'de yalnız bilinçli sentetik fixture var, gerçek örnek yok. Prod henüz yok (`owner-environment-risk-model.md`) — "gerçek kullanımda yaygınlık" sorusu şu an test edilemez. A2-A4'ün aciliyeti bu ışıkta değerlendirilmeli: mekanizma gerçek ama yaygınlık kanıtı yok.

ID: ALC-P0-3A2
Title: Canlı UI'da post-hoc ClaimItem ekleme yolu (UX/API Repair Path)
Problem: `POST /claim-items` API'si var ama case detay sayfasındaki `ClaimItemPanel` HER ZAMAN `readOnly metadataEdit` render ediliyor (`cases/[id]/page.tsx:2806-2809`, koddan doğrulandı) — "yeni kalem ekle" UI'ı hiçbir zaman gösterilmiyor. Mevcut bir dosyaya (örn. A1'in bulduğu orphan senaryo) sonradan alacak kalemi eklemenin canlı UI yolu yok.
Business Value: Veri-eksikliği durumlarının normal kullanıcı akışıyla düzeltilebilmesi.
Technical Value: `ClaimItemPanel`'e koşullu "ekle" modu; ADR-009 (Universal Office Approval) kapsamına girip girmeyeceği ayrı karar.
Priority: MEDIUM
Depends On: ADR-009 authz deseniyle tutarlılık kararı
Unlock Condition: Tasarım kararı — bu akış approval-backed mi, mevcut capability-guard yeterli mi?
Estimated Size: M
Related Modules: components/claim-item/ClaimItemPanel, AddClaimItemModal, claim-item.controller.ts
Status: BACKLOG — kod değişikliği YAPILMADI, yalnız backlog kaydı. A4 ile birlikte düşünülmeli (A4 dosyaları kilitlerse, açan yol muhtemelen budur).

ID: ALC-P0-3A3
Title: Dosya açılışında minimum ClaimItem/Due validasyonu veya "zero-claim draft" statüsü (Intake Guard)
Problem: `CreateCaseDto.dues` opsiyonel, minimum-uzunluk kısıtı yok (`@IsOptional()`, `@ArrayMinSize` YOK — `case.dto.ts:596-600` koddan doğrulandı) — sıfır-dues'lu dosya açmak backend'de tamamen izinli.
Business Value: Yeni dosyaların, alacak kalemi girilmeden "tam açılmış" sayılmasının önüne geçmek.
Technical Value: İki seçenek (tasarım kararı gerekir): (a) sert `@ArrayMinSize(1)` validasyonu, (b) yumuşak "zero-claim draft" durumu/etiketi (muhtemelen schema alanı) + UI'da görünür kılma.
Priority: MEDIUM
Depends On: —
Unlock Condition: Owner kararı — sert validasyon (mevcut iş akışlarını kırma riski?) mi, yumuşak etiket mi?
Estimated Size: S (sert validasyon) / M (yumuşak + schema)
Related Modules: case.dto.ts, case.service.ts (create)
Status: BACKLOG — kod değişikliği YAPILMADI, yalnız backlog kaydı.

ID: ALC-P0-3A4
Title: ClaimItem'sız CONFIRMED collection'ı BLOCKED/UNALLOCATED state'e düşür (Collection Guard)
Problem: `collection.service.ts:706-711` — ClaimItem yoksa yalnız `logger.warn("case has no claimItems; payment not ledger-allocated")` yazılıyor; Collection yine de CONFIRMED oluyor. Sessiz sunucu-log'u hiçbir kullanıcı arayüzünde/audit'te görünmüyor.
Business Value: Alacaksız tahsilatın sessizce "normal" görünmesi yerine açıkça işaretlenmesi — mali doğruluk + denetlenebilirlik.
Technical Value: Muhtemelen `Collection`/`LedgerEntry`'ye yeni bir state (`BLOCKED`/`UNALLOCATED` benzeri) eklemek — **BU BİR SCHEMA/DAVRANIŞ DEĞİŞİKLİĞİ**, mevcut collection-confirmation akışını etkiler (S9/idempotency ile aynı hassasiyet sınıfı, Ultra-tier).
Priority: HIGH (A1 bulgusuyla — organik örnek yok, prod yok — aciliyet düşük-orta olarak yeniden değerlendirilebilir; mekanizma yine de gerçek ve kapatılmalı)
Depends On: ALC-P0-3A2 (repair path olmadan BLOCKED yapmak, düzeltme imkânı olmayan bir dosyayı kilitler)
Unlock Condition: Owner + Av. sign-off (finansal davranış değişikliği)
Estimated Size: L (schema + servis + test + geriye-dönük veri etkisi)
Related Modules: collection.service.ts, Collection (schema), LedgerEntry
Status: BACKLOG — kod değişikliği YAPILMADI, yalnız backlog kaydı. Ayrı, dikkatli bir GO-IMPLEMENT gerektirir.

## ALC-P0-3B/3B1/3B2/3B3 — Canonical Balance Display Cutover Re-focus + Mixed-Source Interest Resolution (2026-07-04, ALC-P0-3'ün alt-hattı)

Kaynak: ALC-P0-3A1'in QA-seed hariç bulgusu sonrası, DI-free harness (`scripts/diagnostic-cutover-readiness.ts`, untracked) ile 3 organik CONFIRMED-collection'lı dosyanın (2026/9502, 9604, 9605) HİÇBİRİNİN canonical balance üretmediği ölçüldü — hepsi `MISSING_START_DATE`. Kök neden `resolveInterestConfig` (`claim-bucket-assembler.ts:300-344`) zincirine kadar izlendi: 3 organik ClaimItem'ın tamamında `interestType=null`; biri (2026/9502) ayrıca kendi `interestStartDate`'ini taşıyordu ama zincir "atomik-kaynak" kuralı (tip+oran+tarih tek kaynaktan) yüzünden bu tarihi yine de reddediyordu. Kod/test/doc arşeolojisiyle doğrulandı: mixed-source (item-tarih + case-tür) hiçbir yerde (ADR/test/yorum) bilinçli şekilde yasaklanmamıştı — tasarlanırken hiç gündeme gelmemiş bir kombinasyondu.

**Owner kararı (2026-07-04)**: mixed-source hukuken meşru — faiz TÜRÜ dosya/takip seviyesinde tektir (Case.interestType), faiz BAŞLANGIÇ TARİHİ kalem seviyesinde farklılaşabilir (ClaimItem.interestStartDate). Bu kombinasyon "sessiz hack" değil, açık adlandırılmış bir kademe olarak eklenmeli.

ID: ALC-P0-3B3
Title: Mixed-source interest resolution (Kademe 1.5)
Problem: `resolveInterestConfig`'e item.interestStartDate + case.interestType kombinasyonunu tanıyan, mevcut atomik kademe 1/2/3/4 sırasını bozmayan, açık adlandırılmış bir Kademe 1.5 eklendi.
Business Value: Hukuken yeterli olan ama önceden kullanılamayan veri artık canonical balance'a dönüşüyor.
Technical Value: 2 dosya değişti (`claim-bucket-assembler.ts` + spec), 84 satır ekleme/3 çıkarma; `claim-bucket-assembler.spec.ts` 34/34 PASS (27 eski + 7 yeni), tüm `interest-engine` modülü (35 test suite) 574/574 PASS — regresyon yok.
Priority: —
Depends On: ALC-P0-3B1/3B2 (contract-mi-pipeline-mi ayrımı, GO-ANALYZE)
Unlock Condition: —
Estimated Size: S
Related Modules: claim-bucket-assembler.ts
Status: DONE — **MERGED**. PR #898, squash SHA `a8e71a91`. **2026/9502 artık canonical balance üretiyor** (hasResult=true, finalDebtStatesCount=1, assemblerDiagnostics=[]). **2026/9604 ve 2026/9605 hâlâ blocked — ama artık canonical engine bug'ı DEĞİL, eksik veri/pipeline örneği** (ne item ne case seviyesinde faiz türü var; bu PR'ın kapsamı dışında, ayrı owner kararı gerektirir). QA-seed (2026/9501) dokunulmadı, davranışı değişmedi.
---

## ALC-AUTH-1 — Canonical Principal/Cost/Fee/Payment Authority Gap (2026-07-04, ALC-P0-3'ün alt-hattı, GO-ANALYZE)

Kaynak: ALC-P0-3B3 sonrası 2026/9502 için ALC-P0-3C1 guarded primary display smoke'u **FAIL** verdi (`safeForPrimaryDisplay=false`, `primarySource=LEGACY_CALCULATION_SUMMARY`) — `comparability.comparable=true` ve `finalDebtStatesAvailable=true` olmasına rağmen. ALC-AUTH-1 bu smoke'un kök nedenini, B3'ün faiz düzeltmesine dokunmadan, salt-okuma (dev-DB canlı `ClaimItem`/`Collection`/`LedgerEntry`/`LedgerAllocation`/`CollectionOverpayment` sorgusu + kod izleme) araştırdı. Kod değişikliği YAPILMADI.

**Tek cümlelik kök bulgu:** Canonical `case-balance-display.ts` yalnız ödeme-SONRASI NET büyüklükler üretiyor (`outstandingAmount`, `finalDebtStates.principal`=kalan anapara); legacy `case.service.ts:getCalculationSummary` ise GROSS/ödeme-öncesi statik değerler üretiyor (`asilAlacak`, `icraMasraflari`, `vekaletUcreti` — tarife formülü, ClaimItem'dan bağımsız). Aynı isimli alanlar iki farklı semantiği taşıyor.

**Sistemik blocker (case'e özgü değil):** `totals.totalDebtAmount` `case-balance-display.ts:475`'te **koşulsuz `null`** — finalDebtStates var olsa bile hiç hesaplanmıyor (INTENTIONAL_GUARD, "gross toplam borç bu contract'ta henüz authority değil"). FE `guarded-primary-display.ts:canonicalPrimaryAmounts()` bu alanın finite olmasını zorunlu kıldığı için `CANONICAL_PRINCIPAL_UNAVAILABLE` HER case için üretilir — B1 primary-display kapısı case verisinden bağımsız olarak yapısal biçimde kapalıdır.

**7 blocker kök-neden sınıflandırması (2026/9502 canlı verisiyle doğrulandı):**

| Blocker | Sınıf | Kök neden |
|---|---|---|
| `OUTSTANDING_DELTA` | AUTHORITY_CONFLICT | Legacy gross toplamBorc−toplamTahsilat; canonical net outstanding (TBK100 tam ödeme sonrası 0) — aynı semantik değil. |
| `PAID_DELTA` | OVERPAYMENT_CLASSIFICATION_EFFECT + DISPLAY_SEMANTICS_BLOCKER (ALC-AUTH-1A/1B'de yeniden sınıflandırıldı — bkz. aşağıdaki ALC-AUTH-1B kaydı, **MERGED**) | Üç bağımsız tahsilat otoritesi birbirini reconcile etmiyor: legacy=`Collection` (1 kayıt, 100.000), canonical read-path=raw `LedgerEntry` (4 kayıt, 320.000, `LedgerAllocation` bilerek yok sayılıyor — G4b-1 kararı), write-path=`LedgerAllocation`+`CollectionOverpayment` (200.000 mahsup + 100.000 HELD, zaten doğru). Alt neden: 3/4 `LedgerEntry` kaydında `collectionId=null` (Collection'a hiç bağlı değil; iz "PR475 manual refresh validation" test/QA fixture'ına işaret ediyor). Kesin mekanizma (ALC-AUTH-1A): borç 3. ödemeyle (220.000 kümülatif) kapandığı için 4. ödeme (100.000, collectionId'li) hiç allocation step üretmedi — para kaybolmuyor, `heldOverpaymentAmount`'ta ayrıca doğru görünüyor. CANONICAL_BUG DEĞİL. |
| `COSTS_DELTA` | DATA_GAP | Legacy sabit 2026 tarife formülü (ClaimItem'dan bağımsız); canonical Σ EXPENSE/FEE-tipi ClaimItem bekliyor — bu case'te (muhtemelen genelde) hiç yok, case'te tek ClaimItem var (PRINCIPAL). |
| `ATTORNEY_FEE_DELTA` | DATA_GAP | Aynı — legacy `calculateAttorneyFee()` tarife formülü; canonical ATTORNEY_FEE/ancillary ClaimItem yok. |
| `PRINCIPAL_BUCKET_DELTA` | AUTHORITY_CONFLICT | Legacy `asilAlacak`=gross orijinal talep (200.000, hiç değişmez); canonical PRINCIPAL bucket=`finalDebtStates.principal`=kalan anapara (TBK100 tam mahsup sonrası 0). |
| `EXPENSE_BUCKET_DELTA` | DATA_GAP | COSTS_DELTA ile aynı kök, bucket seviyesinde tekrarı. |
| `ATTORNEY_FEE_BUCKET_DELTA` | DATA_GAP | ATTORNEY_FEE_DELTA ile aynı kök, bucket seviyesinde tekrarı. |

**B1 için minimum implement önerisi (implementasyon yetkisi VERMEZ, ayrı GO-IMPLEMENT gerekir):** (1) `totalDebtAmount` contract kararı + üretimi — gross principal (assembler `asm.buckets[].amount`) + gross interest (`totalInterest`) + costs + ancillaries, authority'si açık şekilde; (2) PRINCIPAL bucket'ta gross/net ayrımı (`originalAmount`/`demandedAmount` vs `remainingAmount` — tek `amount` alanına iki semantik yüklemek cutover'ı sürekli bozar); (3) `Collection`/`LedgerEntry`/`LedgerAllocation` arasında açık hiyerarşi + reconciliation/parity testi (collectionId linkage kontrolü, cancelled/reversed exclusion, QA-fixture ayrımı); (4) cost/vekâlet için ya canonical ClaimItem-materialization hattı eklenir ya da B1 kapsamı bilinçli olarak principal+interest+payment ile sınırlandırılır (masraf/vekâlet legacy diagnostic olarak kalır — `guarded-primary-display.ts`'deki `BACKEND_CONTRACT_REQUIRED`/`LEGACY_DIAGNOSTIC_RETAINED` ayrımı buna kısmen hazır).

**Yetkilendirilmeyenler:** feature flag açma, display cutover, tenant rollout, schema/migration, QA-seed değişikliği, veri düzeltme — hiçbiri bu kayıtla yetkilendirilmez.

ID: ALC-AUTH-1
Title: Canonical Principal/Cost/Fee/Payment Authority Gap — root-cause analysis
Problem: 2026/9502 için ALC-P0-3C1 guarded primary display smoke FAIL veriyor; 7 blocker'ın kök nedeni yukarıdaki tabloda sınıflandırıldı (4 AUTHORITY_CONFLICT, 4 DATA_GAP — ikisi aynı kökten türer) + sistemik `totalDebtAmount:null` INTENTIONAL_GUARD bulgusu.
Business Value: B1 cutover kararının varsayıma değil, ölçülmüş kök nedene dayanması; hangi implement adımının gerçekten kapıyı açacağının netleşmesi.
Technical Value: Kod değişikliği yok — yalnız salt-okuma dev-DB sorgusu + kod izleme. Bulgular canlı veriyle (`ClaimItem`/`Collection`/`LedgerEntry`/`LedgerAllocation`/`CollectionOverpayment`) çapraz doğrulandı.
Priority: —
Depends On: ALC-P0-3B3 (DONE, PR #898 — bu analizde DEĞİŞMEDİ, PASS kalıyor), ALC-P0-3C1 (guarded primary display smoke, bu analizin tetikleyicisi)
Unlock Condition: Owner, yukarıdaki 4 implement adımından hangisinin/hangilerinin B1 için öncelikli olduğuna karar vermeli; her biri ayrı GO-IMPLEMENT gerektirir.
Estimated Size: — (bu kayıt yalnız analiz; implement boyutu adım seçimine göre değişir)
Related Modules: case-balance-display.ts, guarded-primary-display.ts, balance-display-shadow-diff.service.ts, claim-bucket-assembler.ts, calc-prep/payment-mapper.ts, case.service.ts (getCalculationSummary)
Status: DONE (analiz) — GO-ANALYZE tamamlandı, kod değişikliği yok. **B1 guarded primary display hâlâ FAIL/OPEN.** ALC-P0-3B3 governance kaydı değiştirilmedi.

ID: ALC-AUTH-1B
Title: Overpayment Display Semantics Contract — PAID_DELTA'yı DTO seviyesinde adresle
Problem: PAID_DELTA (220.000 vs 100.000), sınıflandırıldığı gibi, motor hatası değil ama `totalPaidAmount` alan adı "borca tahsis edilen" ile "dosyaya gelen toplam para" arasındaki farkı netleştirmiyordu — cutover'da avukata yanlış güven kırıcı algı riski.
Business Value: Kullanıcıya (avukat) gösterilecek rakamların hangi anlama geldiği net; "dosyaya 320.000 geldi" ile "220.000 tahsilat" çelişkisi DTO seviyesinde çözüldü.
Technical Value: `BalanceDisplayTotals`/`ShadowTotals`'a 2 additive alan: `allocatedPaidAmount` (totalPaidAmount'ın açık isimli eşleniği), `grossReceivedAmount` (allocated+held). `totalPaidAmount` değeri/davranışı DEĞİŞMEDİ. Allocation engine, Q5 kuralı, schema, feature flag, case.service.ts legacy display, ALC-P0-3B3 — hiçbirine dokunulmadı.
Priority: —
Depends On: ALC-AUTH-1 (kök neden analizi)
Unlock Condition: —
Estimated Size: S
Related Modules: case-balance-display.ts, balance-display-shadow-diff.types.ts, balance-display-shadow-diff.service.ts
Status: DONE — **MERGED**. PR #909, squash SHA `f144f550`. Regresyon testi: 220.000 allocated + 100.000 held = 320.000 gross (case-balance-display.spec.ts). 575/575 interest-engine testi PASS (bir önceki 574'ten +1). Kalan B1 blocker'ları (principal authority conflict, cost/attorney-fee ClaimItem veri boşluğu, totalDebtAmount gross-debt projection boşluğu, guarded primary rollout öncesi UI/Av. sign-off) AÇIK — bu PR yalnız PAID_DELTA'yı adresledi.

**Disambiguation notu (2026-07-04):** Ayrı bir paralel oturumda "ALC-AUTH-1B" etiketiyle `totalDebtAmount:null` contract'ı üzerine bağımsız bir GO-ANALYZE yapıldı — bu, yukarıdaki (PR #909, PAID_DELTA/allocatedPaidAmount-grossReceivedAmount) işiyle KARIŞTIRILMAMALI. İsim çakışması netleştirilerek o analiz **ALC-AUTH-1C** olarak yeniden adlandırıldı (bkz. aşağıdaki kayıt). `ALC-AUTH-1B` kanonik referansı yalnız bu sayfadaki PR #909 kaydına aittir.

ID: ALC-AUTH-1C
Title: totalDebtAmount Contract — gross-debt projection analizi
Problem: `case-balance-display.ts:475`'te `totalDebtAmount` koşulsuz `null` (INTENTIONAL_GUARD) — B1 primary-display kapısı bu yüzden case verisinden bağımsız yapısal biçimde kapalı (bkz. ALC-AUTH-1, sistemik blocker). Bu analiz salt-okuma; hangi formülün mevcut alanlarla (yeni ClaimItem/migration gerekmeden) contract'ı doldurabileceğini araştırdı.
Business Value: B1 kapısını açacak en küçük, en az varsayımlı adımın netleşmesi — cost/vekalet ClaimItem-materialization (#4, ayrı/daha büyük iş) veya principal gross/net split (#2) veya payment-authority hierarchy (#3) beklenmeden ilerlenebilir.
Technical Value: Legacy `toplamBorc = takipTutari + icraMasraflari + vekaletUcreti + takipSonrasiFaiz` ödeme-bağımsız (gross, tahsilattan önce sabit) bir büyüklük. Canonical tarafta zaten finite olması ZORUNLU tutulan iki alan — `outstandingAmount` (net kalan) ve `totalPaidAmount` (allocated tahsilat) — toplanarak ödeme-bağımsız bir gross büyüklük yeniden inşa edilebilir: **`totalDebtAmount = outstandingAmount + totalPaidAmount`**. Bu formül (a) yeni alan/migration gerektirmez, (b) #2 (principal gross/net split) ve #3 (payment-authority hierarchy) kararlarından BAĞIMSIZDIR — ikisi de ayrı, daha büyük kararlar olarak açık kalabilir, (c) ALC-AUTH-1A'nın kapsam daraltmasıyla (cost/vekalet legacy-retained) tutarlıdır, onlara dokunmaz.
Priority: —
Depends On: ALC-AUTH-1 (kök neden analizi, sistemik `totalDebtAmount:null` bulgusu), ALC-AUTH-1A (MERGED, PR #914 — cost/vekalet kapsam daraltması, bu formülün ön koşulu değil ama tutarlılık referansı)
Unlock Condition: Owner GO-IMPLEMENT onayı (ALC-AUTH-1C-IMPL) — kod değişikliği bu kayıtla yetkilendirilmez.
Estimated Size: S (tek alan hesaplama + ilgili test güncellemeleri: case-balance-display.spec.ts, balance-shadow-display.test.tsx, balance-display-shadow-diff.service.spec.ts)
Related Modules: case-balance-display.ts, guarded-primary-display.ts, balance-display-shadow-diff.service.ts
Status: DONE (analiz) — GO-ANALYZE tamamlandı, kod değişikliği YAPILMADI. Sonraki adım: ALC-AUTH-1C-IMPL (ayrı GO-IMPLEMENT gerekir).

**⚠️ AKTİF ÇAKIŞMA UYARISI (2026-07-04, ALC-AUTH-3B ile eş-zamanlı keşfedildi):** `totalDebtAmount`
ZATEN, BAĞIMSIZ bir oturumda, FARKLI bir formülle implement edilip **MERGED edildi** — bkz.
ALC-AUTH-3B (PR #917, SHA `8c0cad8f`, aşağıda ayrı bölümde), formül: `grossPrincipal
(assembler'ın gross ClaimBucket toplamı) + gross faiz + costs + ancillaries`. Bu, buradaki
`outstandingAmount + totalPaidAmount` formülünden **FARKLI bir sayı üretir** (2026/9502 için:
200.000 vs 220.000 — 20.000 TL fark). Kök neden: `totalPaidAmount`, ALC-AUTH-1A'da tespit
edilen bir kuirklik yüzünden (borç tam kapandıktan sonra gelen kısmi-tahsis edilen ödemenin
TAM yüz değeriyle allocation step'e girmesi) 2026/9502'de 20.000 TL şişkin — gerçek gross
borcu YANSITMIYOR. **`ALC-AUTH-1C-IMPL`'e OWNER GO-IMPLEMENT verilmemeli** — `totalDebtAmount`
zaten dolu (PR #917); bu kayıt ile çakışan bir ikinci implementasyon yapılırsa PR #917'nin
sonucu sessizce üzerine yazılır/çelişir. Reconciliation (hangi formül kalacak, veya bu kayıt
tamamen retire mi edilecek) ayrı bir owner kararı gerektirir.
---

## ALC-AUTH-3B/3C/3D — totalDebtAmount Plumbing & Guard Alignment (2026-07-04)

ID: ALC-AUTH-3B
Title: totalDebtAmount Projection Plumbing (grossPrincipal)
Problem: ALC-AUTH-3'te tespit edildi — totalDebtAmount koşulsuz null idi çünkü assembler'ın zaten ürettiği gross (allocation-öncesi) ClaimBucket tutarları CaseBalanceResult'a hiç taşınmıyordu (yeni iş mantığı gerekmeyen saf plumbing boşluğu).
Business Value: Guard'ın case-verisinden bağımsız yapısal CANONICAL_PRINCIPAL_UNAVAILABLE blocker'ı kapandı.
Technical Value: CaseBalanceCurrencyResult.grossPrincipal eklendi (case-balance.service.ts); totalDebtAmount = grossPrincipal + gross faiz + costs + ancillaries (case-balance-display.ts). ClaimItem verisine bağımlı (cost/vekalet ClaimItem'ı yoksa eksik kalır - DATA_GAP, ayrı konu).
Priority: —
Depends On: ALC-AUTH-3 (kök neden analizi)
Unlock Condition: —
Estimated Size: S
Related Modules: case-balance.service.ts, case-balance-display.ts
Status: DONE — MERGED. PR #917, squash SHA 8c0cad8f. 35/35 orchestration testi PASS. 2026/9502 icin totalDebtAmount artik 200.000 (onceden null). ALC-AUTH-1C ile cakisma - yukariya bakin, reconciliation gerekiyor.

ID: ALC-AUTH-3C
Title: Guard Hard-No-Go Alignment - kanit
Problem: ALC-AUTH-3B sonrasi, frontend evaluateGuardedPrimaryDisplayPilot()'in kendi HARD_NO_GO_CODES listesi ile backend cutoverReadiness.blockers listesinin tamamen kopuk oldugu kanitlandi - 2026/9502 icin backend 3 blocker bildiriyor (OUTSTANDING_DELTA, PAID_DELTA, PRINCIPAL_BUCKET_DELTA) ama hicbiri frontend'in 9 kodluk listesinde yok; guard GECER, cutoverReadiness.safeForPrimaryDisplay ise hala false.
Business Value: Pilot flag acilmadan once somut, olculmus bir risk tespit edildi: cost/vekalet DATA_GAP + tum-alan override kombinasyonu, avukata gercek borcun altinda bir "TOPLAM BORC/SON BORC" gosterir (2026/9502'de ~34.311 TL eksik).
Technical Value: Kod degisikligi yok, yalniz kanit + 2 cozum alternatifi ((1) backend blocker'larini HARD_NO_GO_CODES'a ekle - hizli, guard'i yeniden tam kilitler; (2) gercek partial-cutover - buildGuardedPrimaryCalculationResult()'i yalniz principal/interest/payment alanlarini override edecek sekilde yeniden yaz, altyapi [buildGuardedSummaryRuntimeBoundaryPlan()] kismen zaten var ama fiili override'a baglanmamis).
Priority: —
Depends On: ALC-AUTH-3B
Unlock Condition: —
Estimated Size: — (analiz)
Related Modules: guarded-primary-display.ts, balance-display-shadow-diff.service.ts
Status: DONE (analiz) — GO-ANALYZE tamamlandi, kod degisikligi YAPILMADI.

ID: ALC-AUTH-3D
Title: Guard Alignment - implement (henuz yapilmadi)
Problem: ALC-AUTH-3C'nin kanitladigi guard/backend kopuklugunun kapatilmasi.
Business Value: Guarded primary pilot flag guvenle acilabilir hale gelir (bugun NO-GO).
Technical Value: (1) veya (2) - owner karari gerekir, ikisi birbirini dislamaz ((1) hemen guvenlik agi olarak uygulanip (2) sonra kalici cozum olarak insa edilebilir).
Priority: —
Depends On: ALC-AUTH-3C
Unlock Condition: Owner karari - (1) HARD_NO_GO_CODES genisletme mi, (2) partial-cutover mi, yoksa ikisi birden mi?
Estimated Size: (1) XS, (2) M-L
Related Modules: guarded-primary-display.ts
Status: BACKLOG — kod degisikligi YAPILMADI. Guarded primary pilot flag bu madde kapanmadan ACILMAMALI.
---

## D6 Domain — Borçlu Çapraz-Dosya Bildirimi & İlgili Framework'ler (2026-07-04, GO-ANALYZE + owner ratifikasyonu)

2026-07-04 tarihli D6 GO-ANALYZE (14 ajanlı workflow: repo forensics + bağımsız hukuki/mimari analiz + adversarial kritik + sentez) sonucu owner tarafından ratifiye edilen nihai mimari: bkz `docs/design/d6-final-architecture.md` (kanonik karar kaydı) ve `decision-log.md` 2026-07-04 satırları. **D6A-1** (PR #878) ve **D6A-2 çekirdek** (PR #880, `DebtorCrossCaseNotification`) KAPALI/DOKUNULMAZ — aşağıdaki maddeler yalnız bunların eksik dışa-açılan yüzünü (D6A-2-SURFACE) ve ayrı-epic frameworkleri (ESF, IAF) kapsar. "D6B" etiketi emekli edilmiştir, kullanılmaz.

---

ID: D6A-2-SURFACE-1
Title: D6A-2 dışa açılan yüzü — list/acknowledge endpoint + expiry cron + gözlem
Problem: `DebtorCrossCaseNotification` (D6A-2, PR #880) çekirdek üretimi canlı ama backend-only — hiçbir HTTP endpoint listelemiyor/acknowledge etmiyor (5 controller'da sıfır referans, grep-doğrulandı); `expireStaleNotifications()` hiçbir cron'a bağlı değil (30 günlük PENDING kayıtlar sınırsız birikiyor); `resolveRecipients()` boş dönerse hiçbir iz/log kalmıyor.
Business Value: Üretilen bildirimler gerçekten sorumlu avukat/personel tarafından görülüp kapatılabilir hale gelir; sessiz-veri-kaybı riski gözlemlenebilir olur.
Technical Value: Mevcut şema/servis üzerine ince bir yüzey — EK MİGRASYON GEREKMEZ (recipientUserId/status/dedupeKey/fieldGroup/severity/changeSummary/expiresAt hepsi mevcut). Kapsam: (1) yeni `listForRecipient()` servis metodu + `GET /debtors/cross-case-notifications?status=PENDING` (tenantId+recipientUserId JWT'den zorunlu türetilir, client veremez), (2) `POST /debtors/cross-case-notifications/:id/acknowledge` (mevcut `acknowledge()` sarmalanır), (3) expiry cron — `automation.service.ts` içine yeni `@Cron(EVERY_HOUR)` metodu olarak (domain servisine gömülmez, mevcut `checkNotificationExpiries`/`sendExpiringPoaNotifications` idiom'u), (4) `resolveRecipients()` boş dönüşünde `logger.warn` (owner Q1 kararı gereği — DB constraint YOK, teknik olarak mümkün/anomaly kabul edilir), (5) create()/transaction hata yolu için mevcut Hata Logları observability'e event hook, (6) raporlama sorguları (Unacknowledged/byFieldGroup/bySeverity) — hepsi tek `groupBy()` ailesi, ayrı efor değil.
Priority: HIGH
Depends On: — (D6A-2 çekirdek zaten canlı)
Unlock Condition: Owner GO-IMPLEMENT onayı (bu backlog kaydı implementasyon yetkisi VERMEZ; Q2-Q6 — retention/purge, FK onDelete, i18n, Tebligat-köprü, action-note ayrımı — implementasyon önce/sırasında triage edilmeli)
Estimated Size: M (BE — dar CRUD-benzeri, migration yok)
Related Modules: debtor-cross-case-notification.service.ts, debtor.controller.ts (veya yeni küçük controller), automation.service.ts
Status: READY — Q1 owner tarafından cevaplandı (bkz decision-log.md 2026-07-04), governance zinciri FAZ 0 ile tamamlandı; ayrı GO-IMPLEMENT teklifi ile başlatılabilir.

ID: ESF-1
Title: Entity Status Framework — design-gate (paylaşılan durum/rozet katmanı)
Problem: "Dikkat gerekiyor" göstergesi aynı problem için bağımsız olarak en az 3 kez çözülmüş (DebtorIssue/AlertBadge, POA sayfa-lokal Pill, Case Badge+statusColors); 11+ bağımsız `statusColors`/`STATUS_COLORS` tanımı var, paylaşılan tip yok.
Business Value: Tutarlı, tek-yerden-yönetilen risk/durum göstergesi; yeni domainlerin tekrar aynı tekerleği icat etmesini önler.
Technical Value: Yeni Prisma modeli DEĞİL — paylaşılan `EntityStatusIndicator` TypeScript arayüzü + her domainin salt-okuma provider fonksiyonu (adapter pattern). D6A-2 buna yalnız READ-ONLY provider ile besler (yazma yetkisi D6A-2'de kalır). MALİYET UYARISI: bugün BE/FE arasında paylaşılan tip paketi yok — muhtemelen yeni workspace paketi + build/export/tsconfig-path zinciri gerekir, "sadece bir interface" kadar ucuz değil.
Priority: MEDIUM
Depends On: — (D6A-2-SURFACE'ı beklemez, bağımsız)
Unlock Condition: Paylaşılan tip paketi maliyeti netleşmeli; owner design-gate onayı
Estimated Size: L (cross-cutting, BE+FE)
Related Modules: debtor.service.ts (DebtorIssue), settings/notifications (POA Pill), cases/page.tsx (Badge/statusColors), OfficeApprovalRequest (idiom emsali)
Status: BACKLOG — GO-ANALYZE seviyesinde kalır, implementasyon başlamaz.

ID: IAF-1
Title: Internal Alert Feed — genel cross-domain in-app bildirim/bell-feed (Option C Hybrid)
Problem: 3 bağımsız kalıcı-bildirim tablosu var (NotificationQueue, PoaExpiryNotificationDelivery, DebtorCrossCaseNotification); `components/notifications/` (6 dosya) tamamen ölü kod (mock-data, hiç import edilmiyor). Gerçek per-user bell/feed altyapısı yok.
Business Value: İleride üçüncü bağımsız kalıcı-bildirim ihtiyacı doğarsa tekrar dar tablo icat etmek yerine tek feed'e yazılabilir.
Technical Value: Yeni ve BAĞIMSIZ `InternalAlert` modeli — mevcut 3 tabloyu geriye dönük birleştirmeye ÇALIŞILMAZ (referans bütünlüğünü bozar, nullable-enflasyonu yaratır). Option C Hybrid: mevcut tablolar DOKUNULMAZ, yeni model yalnız BUNDAN SONRAKİ ihtiyaçlar için açılır.
Priority: LOW
Depends On: —
Unlock Condition: (a) üçüncü bağımsız kalıcı-bildirim ihtiyacı doğması VE (b) gerçek bir merkezi UI yüzeyi (bell/feed) kararlaştırılması — ikisi de bugün gerçekleşmedi.
Estimated Size: L (yeni domain-bağımsız modül)
Related Modules: NotificationQueue, PoaExpiryNotificationDelivery, DebtorCrossCaseNotification, components/notifications/ (ölü kod, reuse/temizlik ayrıca değerlendirilmeli)
Status: DEFERRED — owner-gated, tetik koşulları (a)+(b) gerçekleşmeden açılmaz.

ID: D6-RETENTION
Title: D6A-2 retention/anonymize politikası (Q2 çerçeve kararının implementasyonu)
Problem: `DebtorCrossCaseNotification` kayıtları (PENDING/ACKNOWLEDGED/EXPIRED) süresiz saklanıyor; ne purge ne anonymize mekanizması var — KVKK veri-minimizasyonu açısından bir risk yüzeyi.
Business Value: KVKK m.4/m.7 uyumluluğu; aynı zamanda özen-borcu audit izini erken silmeden dengeli bir saklama rejimi.
Technical Value: `docs/design/d6-legal-semantics-triage.md` Q2'de LOCKED çerçeveye göre (case-lifecycle-anchored floor + calendar ceiling, hangisi uzunsa; önce anonymize) bir retention cron'u + muhtemelen yeni `purgedAt`/`anonymizedAt` alanı. Emsal: `calc-preview/break-glass` modülünün `retentionPolicy` (STANDARD/LEGAL_HOLD/PROMOTED) deseni.
Priority: MEDIUM
Depends On: Kesin retention sürelerinin owner + hukuk danışmanı tarafından teyidi (Q2 çerçevesi LOCKED ama sayılar değil)
Unlock Condition: Owner + hukuk danışmanı kesin süre teyidi + ayrı GO-IMPLEMENT onayı
Estimated Size: M (BE — cron + küçük migration)
Related Modules: debtor-cross-case-notification.service.ts, automation.service.ts, schema.prisma (DebtorCrossCaseNotification)
Status: BACKLOG — kod/migration YAPILMADI, yalnız çerçeve kararı kilitlendi (bkz decision-log.md 2026-07-04, FAZ 2).

ID: D6-INACTIVE-RECIPIENT-SWEEP
Title: Deaktif alıcının PENDING D6 bildirimlerini erken-expire eden sweep (Q3)
Problem: `resolveRecipients()` yalnız ÜRETİM anında `user.isActive` kontrol ediyor; üretimden sonra deaktive olan bir personelin var olan PENDING kayıtları hiç ek işlem görmeden kalıcı olarak "kimse görmeyecek" halde PENDING kalabilir.
Business Value: Sessiz/asla-görülmeyecek PENDING birikimini önler; gözlem/raporlama netliği.
Technical Value: `expireCrossCaseNotifications()` (automation.service.ts) cron'una veya ayrı bir sweep'e "recipient artık isActive=false ise erken-EXPIRE et" kontrolü eklenmesi. Migration GEREKMEZ (mevcut User.isActive alanı zaten var).
Priority: LOW
Depends On: —
Unlock Condition: Owner GO-IMPLEMENT onayı
Estimated Size: S (BE — küçük kod değişikliği, migration yok)
Related Modules: debtor-cross-case-notification.service.ts, automation.service.ts
Status: BACKLOG — kod YAPILMADI, yalnız aday olarak kaydedildi (bkz decision-log.md 2026-07-04, FAZ 2).

ID: D6-TEBLIGAT-BRIDGE
Title: CaseDebtor bazında aktif Tebligat/Collection sinyali — salt-okuma bridge (Q5)
Problem: Borçlu adres/kimlik değişikliği aktif bir tebligat/tahsilat sürecini etkileyebilir ama D6A-2 bugün bu etkiyi hiç sinyallemez — avukat "borçlu değişti" bilgisini alır ama "bu değişiklik aktif bir tebligat/tahsilat sürecini etkiliyor olabilir" bilgisini almaz.
Business Value: Görünürlük artışı — avukat manuel incelemeye yönlendirilir; D6'nın hukukî sınırı (otomatik hüküm üretmeme) korunarak.
Technical Value: `Collection.caseDebtorId`/`Tebligat.caseDebtorId` artık gerçek Prisma `@relation` (D5B/D5C) — CaseDebtor bazında aktif/pending Tebligat+Collection sayısını dönen SALT-OKUMA bir sorgu/endpoint. D6A-2'nin çekirdek modeline hiçbir YAZMA yapmaz. Migration muhtemelen GEREKMEZ (FK'ler zaten var) — bir sonraki GO-ANALYZE'da teyit edilmeli. Emsal: repo'daki mevcut "manual review" idiomu (`needsReview`, `manualReviewCaseIds`, `OTHER_SUSPENSE_MANUAL_REVIEW`).
Priority: MEDIUM
Depends On: —
Unlock Condition: Owner GO-ANALYZE (migration gerekip gerekmediğinin teyidi) + GO-IMPLEMENT onayı
Estimated Size: M (BE — salt-okuma sorgu/endpoint)
Related Modules: debtor-cross-case-notification.service.ts, Collection, Tebligat, CaseDebtor
Status: BACKLOG — kod YAPILMADI. D6 otomatik hukukî hüküm ÜRETMEYECEK ilkesi NO-GO boundary olarak kilitlendi (bkz d6-legal-semantics-triage.md Bölüm 7).

ID: D6-TASK-LINK
Title: acknowledge sonrası opsiyonel Task/workflow linki (Q6)
Problem: D6A-2 modelinde "gördüm" (acknowledgedAt) dışında hiçbir "önlem alındı" izi yok; ileride UI'da bu ayrımın net kalması ve isteğe bağlı iş-takibi gerekebilir.
Business Value: "Gördüm" ile "işlem yaptım" hukukî/operasyonel ayrımını net tutarken, isteyen ekiplere iş-takibi imkânı sağlar.
Technical Value: D6A-2 modeline action/resolution alanı EKLENMEZ (kapsam-şişmesi riski) — bunun yerine mevcut Task/workflow domaine opsiyonel `linkedTaskId` (nullable FK) ile bağlanır. Küçük migration gerektirir.
Priority: LOW
Depends On: D6A-2-SURFACE UI fazı (henüz yapılmadı) + owner'ın action-tracking'i gerçekten isteyip istemediği kararı
Unlock Condition: Owner GO-IMPLEMENT onayı
Estimated Size: M (BE küçük migration + FE entegrasyonu)
Related Modules: debtor-cross-case-notification.service.ts, Task domain, schema.prisma
Status: BACKLOG — kod/migration YAPILMADI, yalnız aday olarak kaydedildi (bkz decision-log.md 2026-07-04, FAZ 2).
