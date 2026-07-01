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
Problem: #645 (S9F) persisted double-entry journal ŞEMASI MERGED ama UNWIRED (posting service/controller/endpoint yok). Tahsilat/distribution/offset/payout olayları kanonik muhasebe kaydına yazılmıyor.
Business Value: Read-time türetilen cari → kanonik POSTED ledger; trial balance / ekstre / firma-geneli mutabakat açılır.
Technical Value: Posting + Reversal + Idempotency (idempotencyKey @@unique) + Reconciliation (computeOutstanding) + Validation (Σdebit=Σcredit) + Event Mapping. Mevcut accounting-ledger-dry-run.service mapping/invariant'ı posting kaynağı. DEFAULT-OFF flag + SHADOW-mode.
Priority: HIGH
Depends On: #645 şema (MET); ADR-010 SoT north-star
Unlock Condition: Posting-rules + account-mapping design-gate owner onayı (kod öncesi); #645 migration apply teyidi
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
Status: READY
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
Status: BACKLOG
