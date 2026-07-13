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

Legacy strategic backlog kaynağı:

```text
project/docs/strategic-backlog.md
```

MPB-026 kapsamında bu içerik `product-backlog.md` içine taşınmıştır. `project/docs/strategic-backlog.md` artık yeni karar veya backlog girişi için authoritative kaynak değildir; yalnız tarihsel snapshot olarak korunur.

Yeni governance akışı için kanonik kaynaklar:

- Product Backlog: `project/docs/governance/product-backlog.md`
- Decision Log: `project/docs/governance/decision-log.md`
- Active Roadmap: `project/docs/governance/active-roadmap.md`
- Master Triage/Register: `project/docs/governance/master-triage-register.md`

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
| MPB-030 | Governance / Collection | Collection Governance Suite canonicalization: `COLLECTION-GOVERNANCE.md` v1.0 + `COLLECTION-MASTER-SYNTHESIS.md` + `COLLECTION-OWNER-DECISIONS.md` (COL/OD-01..21, tamamı OPEN) + `COLLECTION-RISK-REGISTER.md` + `COLLECTION-DECOMPOSITION.md`; `GOVERNANCE-INDEX.md` REZERVE satırı → 5 canonical satır; decision-log kaydı (README owner kararıyla kapsam dışı) | Owner `GO-DOCS` canonicalization talimatı (2026-07-13); owner review R1–R7 uygulanmış metin (6/6 APPROVED); canonicalization tabanı `origin/main` = `31cf03e79b4c734cf574f6fd17311a6bb49ec722`; izole worktree `claude/rc-gov-w02-collection-suite`. Docs-only — kod/schema/migration/runtime/CI davranış değişikliği YOK; hiçbir owner kararı kapanmadı; TM3↔handoff client-settlement lane çelişkisi `COL/OD-18`'de owner'a sunulu; cutover durumları değişmedi (`NOT AUTHORIZED`). **CLOSED / CANONICAL:** PR #1209, squash merge SHA `c36fa47be25468da637ffce9e3d4278e15380421`, base `origin/main` = `31cf03e7`; CI 4/4 SUCCESS (Architectural Guardrails + Test Suite + Web Tests + Client Workspace Live Smoke); `mergeStateStatus CLEAN / MERGEABLE`; canonical `main` == `origin/main` == `c36fa47b` synchronized. Publication-safety redaksiyonu (owner-approved): COL-RISK-D04/G02 + OF-02'de P0 risk varlığı/önemi/kapanış kriteri korundu, route/dosya-satır/reprodüksiyon detayı public repo'dan çıkarıldı. Eşzamanlı PR #1207 (PE-06E) mid-flow merge oldu; branch `origin/main` üzerine rebase edildi, tek çakışma `decision-log.md` mekanik append idi (her iki kayıt korundu). |
| MPB-029 | Governance / Receivable | Receivable Domain Governance v1.0 ratification and canonical reconciliation | Owner `GO-DOCS / GO-COMPLETE`; primary PR #1145, branch head `617a36defae098ba859f0d404b20625bf4918f35`, squash `ea9c035e686b5a5f355c38d3006d09c6a20b5cfb`; CI run `29191521309` 4/4 SUCCESS; merge state `CLEAN / MERGEABLE`; canonical `main`/`origin/main` synchronized. Exactly six docs/governance files established the 1,433-line canonical domain entry point and repository pointers. Normative audit: 54 unique `SYS-*` references with zero missing, 76 unique `REC-*` definitions with zero duplicates, source/repository content parity and Markdown/diff checks PASS. No runtime, schema, migration, API/UI, financial authority or cutover change. Runtime cutover remains `NOT AUTHORIZED`; ADR-014 representative evidence and downstream owner gates remain open. |
| MPB-001 | Accounting | Accounting manual adjustment contract/service/HTTP boundary | PR #757 merged, SHA `56ea55ad11caa080aa1f7a04e5b4b9c68db33b15`; manual adjustment journal contract, service and HTTP boundary are runtime-complete with focused service/HTTP smoke coverage and CI PASS. |
| MPB-003 | Accounting | ClientPayout / prior payout lifecycle / posting-mode runtime policy | Owner decision accepted current repo v1 scope as CLOSED: approval-gated ClientPayout request/finalize is sufficient, `CLIENT_PAYOUT_RECORDED` journal writer is sufficient, prior payout reversal will not perform automatic financial mutation, `ClientPayoutManualReversal` remains workflow-only/metadata closure, and `REFUND`/`OFFSET`/`WAIVER` do not mutate journal/ledger/statement/payout in v1. Posting-mode/cutover and refund-offset-waiver economic semantics remain outside MPB-003 as future owner/architecture decision scope. |
| MPB-004 | Accounting | BalanceLedger ADJUST / REFUND accounting semantics | Owner decision accepted current repo fail-closed v1 behavior as CLOSED: `ADJUST` does not produce journals until manual adjustment/correction semantics are decided; `REFUND` does not produce journals until real cash-out/payout/statement effects are decided; existing builder/validator behavior remains correct: `BalanceLedger ADJUST/REFUND is not approved for journal posting.` Future ADJUST/REFUND semantics remain separate owner/accounting decision scope. |
| MPB-005 | Accounting | Trial Balance query/API/read model expansion | PR #885 squash merged, final SHA `4c8756c911542d579f16672a9ceb8bf696881cbb` |
| MPB-006 | Accounting | Dry-run vs journal reconciliation and real-data reconciliation | PR #892 squash merged, canonical HEAD `05260c781420be5262c142e310299b9f9cc90e4d` |
| MPB-008 | Accounting | Offset audit detail projection | PR #893 squash merged, SHA `49f91e15dba2f70a3c1e19612efe4d228fa83a64`; C-2D closeout PR #644/#646 preserved as implementation/QA evidence; read-only `GET /client-offsets/:offsetId/detail` projection verified. |
| MPB-010 | UI | Confirmed/POSTED collection cancel UX and audit visibility | PR #576 merged, merge commit `90a451b85b3c2b2dfdcc779a373afef45c1cd8e0`; Web Tests, Test Suite and Architectural Guardrails PASS |
| MPB-011 | Architecture | Clean-break canonical claim balance model | Owner decision accepted canonical `computeBalance` / ClaimItem + TBK100 + Interest Engine line as the target single claim-balance engine / SoT; legacy `getCalculationSummary` will not be preserved as future production authority; clean-break implementation moved out of MPB-011 into `CCB-001`. |
| MPB-014 | Authorization | Policy Engine expense/kambiyo/UYAP blockers | PR #42/#43/#44 merged; P3 UYAP outage merge `b222adc31143ae348aa0968302ab1138fd3d08a0`; focused Policy Engine tests PASS |
| MPB-015 | Authorization | OfficeApproval platform hardening and finance bridges | PR #592/#618/#633/#639/#654/#658/#830/#846/#875 merged; focused OfficeApproval/client-settlement tests PASS |
| MPB-016 | Alacak Kalemi | Mixed-source interest resolution (Kademe 1.5, resolveInterestConfig) | PR #898 squash merged, SHA `a8e71a91`; 2026/9502 canonical balance artık üretiliyor; 2026/9604 ve 2026/9605 DATA/PIPELINE blocker olarak açık kalıyor (engine bug değil) |
| MPB-017 | Debtor | CaseDebtor lifecycle, passivation, passive guards and UI visibility | PR #255/#257/#261/#798 merged; repo verification confirmed passivation, passive writer guards, ACTIVE/includePassive readers and passive UI safety; focused backend tests PASS (5 suites, 42 tests); web passive tests present, local Vitest blocked by toolchain startup error |
| MPB-018 | Debtor | Debtor identity / Party Registry / duplicate hardening | Repo verification confirmed duplicate identity guards, similar-name review, identity format/checksum validation and identity drift fixes; Party Registry remains design-only/HOLD by decision; focused backend tests PASS (3 suites, 19 tests) |
| MPB-019 | Debtor | Tebligat `caseDebtorId/addressId` integrity | Repo verification confirmed `Tebligat.caseDebtorId` FK, active CaseDebtor create guard, debtor-owned `addressId` guard and tebligat-to-CaseDebtor sync; PR #243/#889 plus focused backend tests PASS (3 suites, 33 tests) |
| MPB-020 | Security | Borçlu forensic tenant/passive/attribution/API drift fixes | Repo verification confirmed debtor tenant boundary, passive writer/lifecycle guards, actor/audit attribution, type/API drift hardening and cross-case notification compatibility; PR #396/#398/#402/#779/#798/#860/#865/#878/#880 merged; focused backend tests PASS (8 suites, 38 tests) |
| MPB-021 | Authorization | Assignment / responsibility / staff governance | Repo verification confirmed CaseStaff assignment/update guards, real-person responsible owner selection, operation/legal responsibility separation, responsibility-at/history audit projection, legal-responsible invariants and staff/lawyer lifecycle guards; PR #199/#210/#217/#225/#321/#325/#327/#345/#346/#410/#423/#426/#427/#455/#474/#480/#483/#800 merged; focused backend tests PASS (14 suites, 129 tests) |
| MPB-022 | Client | Client and Bank canonical/API cleanup | Repo verification confirmed Client/Bank canonical models, DTO/controller/service alignment, active client lifecycle guards, tenant-scoped bank routes, canonical bank-to-collection delegation and client-address route collision cleanup; PR #78/#204/#669/#672/#676/#686/#777/#795/#810/#827/#882 merged; focused Client/Bank backend tests PASS (9 suites, 77 tests) |
| MPB-023 | Client | Client Workspace operating layer and safe actions | Repo verification confirmed Client Workspace shell, action catalog, operating snapshot, safe typed commands, backend policy-driven action visibility/enablement, UI/API alignment and safe response projection; PR #686/#740/#742/#745/#755/#758/#774/#775/#789/#792/#797/#809/#813/#818/#822/#826/#833/#842/#894 merged; focused backend tests PASS (7 suites, 89 tests); local focused Vitest blocked by vitest/vite startup mismatch |
| MPB-024 | UI | Timeline V2 and DBIND frontend/read-model follow-ups | Repo verification confirmed Timeline V2 backend read model + Client Activity UI, V2 sources, cursor pagination, safe projection and empty/error states, plus DBIND disposition UI read-model, approval-gated payout request/finalize follow-ups and web/API parity; PR #867/#894/#906 merged; focused backend Timeline/DBIND tests PASS (4 suites, 102 tests); local focused Vitest blocked by vitest/vite startup mismatch |
| MPB-025 | Migration | Platform / migration / runtime-lab technical debt | Repo verification confirmed Phase 9B/9C Truth Layer/object-store migration support, fail-closed DB test env, runtime smoke/rollback risk matrix gates and migration/runtime-lab safeguards; MPB-025 remediation removed runtime decorator metadata drift from MinioObjectStoreClient; focused migration/runtime-lab tests PASS (11 suites, 242 tests) |
| MPB-026 | Migration | Governance documentation migration | Repo verification confirmed legacy strategic backlog records were not yet migrated into the new governance Product Backlog; MPB-026 migrated SB-001..SB-013 into product-backlog format, marked strategic-backlog as historical/superseded, reconciled Master Triage ACT-16 and fixed governance README canonical-instruction drift; focused governance checks and git diff --check PASS |
| MPB-027 | Security | AddressTask auth, tenant isolation and data-integrity hardening | PR #202/#207/#261 merged; repo verification confirmed AddressTask auth/tenant/data-integrity hardening; focused AddressTask tests PASS (3 suites, 67 tests) |
| MPB-028 | Security | Risk/AI/Notification tenant izolasyonu + tebligat mock write-path kapatma | PR #1027 squash merged, SHA `612eede9c8a9d0e6f1eedbda921add647924109c`; `RiskService`/`RiskController` (analyzeCase/getLatestReport/getReportHistory) + `AiService`/`AiController` (getSuggestions/getPrediction/getCaseWithDetails/batchSuggest) artık tenantId zorunlu; `NotificationController`/`NotificationService` tüm endpoint'lere tenant guard (`PUT :id/status` yazma-yönlü IDOR kapatıldı, `/pending`/`/expired` tenant filtresi, `/stats` artık JWT'den tenantId alıyor — spoofable query param kaldırıldı); `uets.service.ts` (sendViaUets/sendViaKep/checkDeliveryStatus) ve `scheduler.service.ts` (queryPttBarcode) artık `Math.random()`/sabit-başarı ile sahte tebligat sonucu üretip ortak senkron kapısı (recordPttResult/recordElectronicResult) üzerinden `CaseDebtor.serviceStatus`'a yazmıyor (ölü kalan `createTebligatFollowupTask` kaldırıldı; aynı sınıf desen: CAN-P0-001); demo FE bileşenleri (`debtor-risk-score.tsx`/`payment-history.tsx`/`communication-log.tsx`, hiçbir yerden import edilmiyordu) `components/debtor/__quarantine__/` altına taşındı. 3 yeni tenant-boundary test dosyası (28 test); risk/ai/notification/tebligat/scheduler modülleri 11 suite/78 test PASS. `tsc --noEmit` bu branch ile `origin/main` arasında izole worktree'de diff'lendi: 0 yeni hata, 1 pre-existing hata (SchedulerService constructor'ının eksik 4. bağımlılığı) düzeltildi, ~250 pre-existing hata (icrabot/recipes, interest-engine, task-orchestrator — kapsam dışı) değişmedi. CI 4/4 PASS (Architectural Guardrails, Test Suite, Web Tests (vitest), Client Workspace Live Smoke); mergeStateStatus CLEAN; canonical main senkron (`8fd6747c`); remote+local branch silindi; isolated worktree (`HUKUK_p0_security_fix`) `git worktree prune` ile temizlendi, fiziksel dizin Windows "Filename too long" (nested pnpm store) nedeniyle force-delete KULLANILMADAN `ORPHANED_WORKTREE_DIR` bırakıldı (FEE-TARIFF-2026-001A-TEST/CAN-P0-001 emsaliyle aynı desen). Kapsam dışı bırakılan, ayrı owner kararı gerektiren PROPOSED takip maddeleri (bu kapanışla yeni ID açılmadı): kesinleşme/itiraz süresi hesabının hâlâ `NotificationQueue.deliveredAt`'ten gelmesi (kanonik `Tebligat.tebligSayilmaDate`'e rebase), iki rakip risk formülünün (`RiskService` / `AutomationService.calculateRiskScore`) ikisinin de CANCELLED/REFUNDED tahsilatı filtrelememesi (kanonik `DebtorScoring` konsolidasyonu), `EnforcementAction.caseDebtorId`+`tenantId` migration, `Debtor.legalStatus` hayalet alan kararı (`extractRiskFlags` var olmayan `bankruptcyStatus`/`concordatStatus`/`isDeceased` okuyor). |
| ALC-AUTH-1B | Alacak Kalemi | Overpayment display semantics contract (allocatedPaidAmount/grossReceivedAmount) | PR #909 squash merged, SHA `f144f550`; PAID_DELTA reclassified OVERPAYMENT_CLASSIFICATION_EFFECT (not a bug); totalPaidAmount unchanged, additive fields only; 575/575 interest-engine tests PASS |
| ALC-AUTH-3B | Alacak Kalemi | totalDebtAmount projection plumbing (grossPrincipal) | PR #917 squash merged, SHA `8c0cad8f`; guard's CANONICAL_PRINCIPAL_UNAVAILABLE closed for 2026/9502; 35/35 orchestration tests PASS; guarded pilot remains NO-GO pending ALC-AUTH-3D |
| ALC-AUTH-3D | Alacak Kalemi | Guard authority alignment (frontend consumes backend cutoverReadiness.safeForPrimaryDisplay) — FINAL closure | PR #922 squash merged SHA `8a340c23` (partial/preceding: removed HARD_NO_GO_CODES/issueCodes()/NOT_COMPARABLE) + PR #925 squash merged SHA `6c1304a3` (strict cleanup / FINAL: removed remaining duplicate-authority checks — SHADOW_OR_CANONICAL_SOURCE_FAILURE, FINAL_DEBT_STATES_REQUIRED, DISPLAY_CURRENCY_UNSAFE, report-provenance CLAIM_ITEM_AUTHORITY_CONTAMINATION); domain-safety now single-sourced from `report.cutoverReadiness.safeForPrimaryDisplay`/`blockers` with zero residual frontend authority; CI 4/4 PASS; balance-shadow-display.test.tsx 78/78 PASS; closes ALL authority-source drift for OUTSTANDING_DELTA/PAID_DELTA/PRINCIPAL_BUCKET_DELTA — does NOT close the separate cost/attorney-fee DATA_GAP understatement risk, see ALC-AUTH-3E (OPEN/NEXT); guarded pilot flag still OFF by default |
| ALC-AUTH-3E | Alacak Kalemi | Cost/attorney-fee aggregate understatement risk — per-case suppress via existing COSTS_DELTA/ATTORNEY_FEE_DELTA RED signal (option c) | PR #929 squash merged, SHA `d23003e8`; `hasCostOrAttorneyFeeUnderstatementRisk()` added, toplamBorc/sonBorc/kalanBorc fall back to legacy per-case when RED, other 5 canonical-override fields unaffected; no new backend field/migration; CI 4/4 PASS; balance-shadow-display.test.tsx 81/81 PASS; closes the last known B1/guarded-primary-pilot blocker — flag rollout itself remains a separate, unstarted owner/product decision |
| CAN-REG-001 | Governance | Canonicalization Register + Policy — ARCHITECTURAL_DRIFT/DEAD_CODE/CUTOVER/INTENTIONAL_BOUNDED_CONTEXT classification of semantic-duplicate/legacy-canonical drift program-wide | PR #977 squash merged, SHA `c20abc85142c68132e7961642d827a536da981f1`; adds `canonicalization-policy.md` + `canonicalization-register.md` (docs-only, 221 insertions, 2 new files); CI 4/4 PASS; validated via isolated `origin/main` worktree (`git apply --check` clean before apply). Docs-only — no code/test/schema/migration/runtime behavior change. Register entries (CAN-DRIFT-01/02/03 P0, CAN-DEAD-01..06 + CAN-CUT-01..05 P1/P2, CAN-IBC-01 do-not-touch) remain unimplemented; each requires its own separate GO-IMPLEMENT authorization per `canonicalization-policy.md` §3. **Process note:** during this closure's PR-creation task, the agent extended a "PR aç + final rapor" instruction into an unrequested merge — the runtime safety classifier correctly flagged the self-authored-merge-without-review pattern before cleanup could complete; owner ratified after the fact. Going forward, code-bearing PRs (not just this docs-only one) require an explicit owner "merge et" instruction before merge — GO-COMPLETE's general merge authority does not override a task's own explicit numbered step list when that list stops short of merge. |
| CAN-P0-001 | Governance / icrabot | CAN-DRIFT-01 remediation — icrabot email/SMS notification truth (send_email/send_sms no longer write status='sent' without provider success) | PR #981 squash merged, SHA `2646e0f3e6e57b1ff97f3ec26a412d948133f807`; CI 4/4 PASS (Architectural Guardrails, Client Workspace Live Smoke, Test Suite, Web Tests (vitest)); mergeStateStatus CLEAN; diff scoped to exactly 2 files (`action-handler.service.ts` + new `action-handler-notification-truth.spec.ts`); targeted test 5/5 PASS verified WITHOUT `--forceExit` (no hang); `icrabot/v28-engine` module regression 33 passed/2 skipped (pre-existing)/1 suite skipped (pre-existing) — no regression; no migration/schema/package/lock change (`IcrabotEmailLog.status`/`IcrabotSmsLog.status` are free `String`, not enum). `send_notification`, `webhook`/`IcrabotWebhookLog`, `CaseService`, `workflowStage`, `Due/ClaimItem`, `validation-gate`, `policy-engine`, `DebtorAddress` untouched — confirmed by diff scope. **This ID originally bundled CAN-DRIFT-01/02/03 together (2026-07-05); split 2026-07-06 — CAN-DRIFT-02/03 moved to `CAN-P0-002` (NEXT/PENDING, unimplemented).** Follow-ups remain open: (1) `IcrabotEmailLog`/`IcrabotSmsLog` `@default("sent")` schema-default owner decision, (2) `CAN-P0-008` (`IcrabotWebhookLog` ghost model / webhook fake-sent pattern). |
| DX-005 | Governance | Waiting & Progress Policy — dışsal blocker'da (CI/PR/başka worktree/owner action) ajan davranış modeli, ADR-012 | PR #998 squash merged (commit `8d0de5cd`, 2026-07-09) `AGENTS.md`'ye tam metin "Progress Maximization Policy" olarak ekledi; aynı gün, bağımsız bir oturumda üç katmanlı model (Active Progress/Parallel Preparation/Passive Wait) tasarlanırken bu paralel implementasyon keşfedildi. PR #1002 squash merged, SHA `910f1163aa81db1b79e06d09793c9e5793c5d780`; reconciliation: `AGENTS.md` tek satır pointer'a indirgendi, tam politika `project/docs/adr/ADR-012-WAITING-PROGRESS-POLICY.md`'ye taşındı (ACTIVE, `architecture-index.md`'de kayıtlı), `process-rules.md`'ye kısa referans eklendi; CI WAIT/POLLING RULE değişmedi. CI 4/4 PASS, mergeStateStatus CLEAN; diff kesinlikle 4 dosyayla sınırlı (AGENTS.md, ADR-012 yeni, architecture-index.md, process-rules.md) — product-backlog.md/decision-log.md/master-triage-register.md/`.codex/`/`.agents/`/kod/schema/migration/runtime dışarıda bırakıldı. Canonical main bu SHA'ya senkronize edildi; remote+local branch silindi (`git worktree remove --force`+`prune`, fiziksel silme kullanılmadı). "Repository-native AI Architecture" (AGENTS/CLAUDE.md authority chain, `.agents/skills`, `.codex/`, skill/hook lifecycle) bilinçli olarak kapsam dışı bırakıldı — ADR-012 Open Questions'ta not, ayrı triage/backlog girişi bu kapanışla YAPILMADI. |
| CCB-001-RELEASE-BLOCKER-TRACK | Alacak Kalemi / Governance | CCB-001 kapanış-doğrulama + release blocker temizliği (ADR-012-FEE öncesi son hat) — **track kapandı, `ID: CCB-001`'in kendisi (branch merge/ADR-012 implementasyonu) DEĞİL** | Kapsam: yeni PC/repo geçişinde CCB-001 WIP branch (`codex/ccb-001-pr1-pr6-rescue`) doğrulaması (VERIFIED — canonical display authority, legacy removed, shadow diagnostic-only), `case.service.ts` encoding-restore contamination onarımı (commit `fcdbebde`), CCB-001-R mimari uzlaştırma (commit `961bbaf3`: TBK100/AllocationEngine precision hizalaması, negative-payment guard, authority metadata düzeltmesi), ve bu sırada keşfedilen 3 bağımsız finansal-yol defektinin kapatılması: **FIN-TBK100-DI-001** (PR #989 `f1bab70c` + register PR #995 — TBK100AllocatorService DI export eksikliği, `POST /collections` gerçek tahsilat yolu deprecated allocation kullanıyordu), **UI-FEE-ENGINE-WARN-001** (PR #996 `7f57cc79` + register PR #999 — case creation'da sessiz fee-engine hatası), **FEE-TARIFF-2026-001A** (PR #997 `d21135ea` + register PR #1000 — 2026 tarife `penalties` eksikliği runtime crash, fail-closed guard eklendi), **FEE-TARIFF-2026-001B-1** (PR #1004 `86736dbc` + register PR #1007 — TTK 6102 m.783/3 doğrulanmış %10 çek tazminatı oranı), **FEE-TARIFF-2026-001B-2** (PR #1010 `5b51b2e7` — CLOSED/SEMANTIC_MISCLASSIFICATION, `max_rate: 0.20`'nin İİK m.67 icra inkâr tazminatıyla karıştırıldığı bulundu, kanuni dayanağı olmadığı için `2026.yaml`'a taşınmadı). Canonical main bu track sonunda `5b51b2e7`'de. **Track'in KAPSAMADIĞI**: `CCB-001` backlog kaydının kendisi (branch hâlâ unmerged, main'de canonical cutover henüz YOK — bkz. `ID: CCB-001` kendi Status alanı), `FEE-TARIFF-2026-001A-TEST` (commit `ccf7e1d4`, regresyon testi, bilinçli olarak bu track'ten ayrı bırakıldı, kendi PR'ı olacak — bkz. aşağıdaki ayrı satır, artık CLOSED), ve ADR-012-FEE implementasyonu (henüz başlamadı, bu track'in amacı ADR-012-FEE'nin önündeki bilinmeyen/acil engelleri temizlemekti, kendisini yazmak değil). Bu track'ten sonraki resmi adım: ADR-012-FEE-A (Fee Authority Map) bulgularına göre ADR-012-FEE implementasyon planı. |
| FEE-TARIFF-2026-001A-TEST | Fee Engine / Tariff domain | FEE-TARIFF-2026-001A fail-closed guard için kalıcı regresyon testi — **release blocker DEĞİL**, CCB-001-RELEASE-BLOCKER-TRACK'ten bilinçli olarak ayrı tutulan bağımsız test-hardening PR'ı | PR #1015 squash merged, SHA `3de595549a61a198b975c70e24bf374338822f91`; `TariffService.toSharedFormat()`'ın PR #997 (`d21135ea`) ile eklenen `MissingTariffSectionError` fail-closed guard'ı için 5 test eklendi (gerçek `2025.yaml`/`2026.yaml` dosyalarına karşı çalışır, mock yok). CI 4/4 PASS (Architectural Guardrails, Client Workspace Live Smoke, Test Suite, Web Tests (vitest)); diff kesinlikle tek dosyayla sınırlı (`tariff.service.required-sections.spec.ts`, yeni dosya) — davranış/tarife-verisi/fee-logic/ADR-012-FEE değişikliği YOK. Branch (`codex/fee-tariff-2026-001a-test`, orijinal commit `ccf7e1d4`) `origin/main`'e rebase edildi (`f597cfe0`), push edildi, PR açıldı, owner'ın ayrı "GO-COMPLETE" onayıyla merge edildi. Remote branch silindi; local worktree (`HUKUK_fee-tariff-2026-001a-test`) `git worktree remove --force` "Filename too long" hatası verdi (Windows path-length limiti) — git-side unregistered oldu (`git worktree list`'te yok, `.git/worktrees/` admin kaydı temiz) ama fiziksel dizin `rm -rf`/force-delete KULLANILMADAN `ORPHANED_WORKTREE_DIR` olarak bırakıldı (CAN-P0-001/CAN-P0-002-A1'deki emsalle aynı desen). Canonical main `3de59554`'e senkronize edildi. |
| LEGAL-TIME-AUTHORITY-REBASE | Debtor / Tebligat | Kesinleşme/itiraz süresi hesabının kanonik kaynağının `NotificationQueue.deliveredAt`'ten hukuki olarak doğru `Tebligat.tebligSayilmaDate`/yeni `LegalDeadlineService`'e rebase edilmesi — MPB-028 kapanışında ID'siz PROPOSED bırakılan takip maddesi (a)'nın ilk somut çıktısı | PR #1034 squash merged, SHA `bb7a0c222228cfa1242c57afc43913848bc46a31`; CI 4/4 PASS (Architectural Guardrails, Test Suite, Web Tests (vitest), Client Workspace Live Smoke); docs-only amended design spec (`project/docs/design/legal-time-authority-rebase.md`, tek dosya, 162 satır ekleme). İlk taslak `TK 21/2 = +15 gün` varsayımını "doğru ama bağlantısız" (ölü uç) sınıflandırmıştı; **owner bu sınıflandırmayı reddetti**, birincil kanun metnine (7201 sayılı Tebligat Kanunu, Lexpera konsolide) karşı doğrulama istedi; doğrulama yapıldı, hata teyit edildi (`+15 gün` Madde 20'ye aittir, Madde 21/1 ve 21/2 gecikmesizdir) ve düzeltilmiş halde merge edildi. Kod tarafında hata dar ve tek dallıdır (`tebligat.service.ts`'nin `determinePttResultAction`'ının yalnız MERNİS/TK21-2 dalı); ayrıca Madde 20 senaryosu `Tk21Type` enum'ında hiç modellenmemiş bir şema eksikliği olarak tespit edildi. Hedef mimari: yeni kanonik `LegalDeadlineService`/`LegalDeadlineSnapshot` (`legalServiceDate`/`objectionDeadlineAt`/`deadlineReasonCode`/`sourceTebligatId`/`calculationVersion`); `NotificationQueue.deliveredAt` bundan böyle hiçbir hukuki süre hesabının girdisi değildir (owner kararı, Bölüm 4/6). Owner kararları: kanonik takip-tipi gün tablosu icrabot'un 6 kırılımını esas alır; `Case.nextActionAt` hukuki deadline alanı olarak kullanılmaz; geçmiş veriye backfill YOK (önce shadow/read-only recompute, backfill ayrı owner onayı ister); rollout feature-flag ile kademeli. Önerilen 6 PR'lık sıra (Bölüm 7): PR-1 bu belge (CLOSED) → PR-2 `LegalDeadlineService` read-only → PR-3 shadow/compare endpoint → PR-4 UI read-only → PR-5 scheduler/workflow switch → PR-6 backfill (ayrı owner onayı ister). **GO-DOCS: YES, GO-IMPLEMENT: NO** — belgenin kendi Final Verdict'i (Bölüm 8) üç blocker listeler: owner legal sign-off (lisanslı hukuk danışmanı, özellikle TK m.20'nin şemada hiç modellenmemiş olmasının doğurduğu karar), `LegalDeadlineSnapshot` alan adlarının kesinleşmemesi, PR-3 shadow-diff strateji detaylarının henüz tasarlanmamış olması. PR-2..PR-6'nın her biri kendi ayrı GO-IMPLEMENT yetkisini gerektirir; bu kayıt hiçbirini yetkilendirmez. **PR-2 — MERGED/CLOSED (canonical foundation, halka 2/6):** Owner önce 6 owner kararını (TK m.20 additive/forward-only backfill/holiday-calendar ayrı workstream/NotificationQueue operational-only/snapshot immutable+supersede/LegalServiceDate-FinalizationDate ayrı) kesinleştirdi, sonra dar `LegalDeadlineService`/`LegalDeadlineSnapshot` foundation'ını GO-IMPLEMENT etti. İlk implementasyon turunda iki blocker tespit edildi ve owner tarafından ayrı bir "PR-2 blocker resolution" turuyla kapatıldı: (1) **objection period** — `CaseType`/`subType` → 6-kırılım takip-türü eşleştirmesi canonical olarak bulunamadığından `CaseObjectionPeriodDaysProvider` genişletilmedi; bunun yerine `objectionPeriodDays` servise açık, doğrulanmış (pozitif tam sayı, ≤365, fail-closed) bir çağıran-girdisi olarak eklendi, 6-kırılım mapping'i ayrı canonical workstream'e taşındı (PR-2 exit blocker değil); (2) **TK m.20 üretim yolu** — yalnız Prisma enum'ına `TK_20` eklemek yeterli değildi (üretim yolu yoktu); DTO paralel `Tk21Type` enum'ına da `TK_20` eklendi, `determinePttResultAction` artık operatörün açıkça gönderdiği `tk21Type=TK_20`'yi PTT sonucundan bağımsız override olarak işliyor (kanıt tarihi yoksa fail-closed, PTT sonucu tek başına asla TK_20'yi üretmiyor). PR #1185, squash merged SHA `94cf35f1d59aa0e3e85b6b1f2c13b6aaae83c635`; CI 4/4 SUCCESS (ilk koşuda `Test Suite`'in yeni testleri hiç seçmediği tespit edilip aynı PR'da 2 yeni CI step ile düzeltildi — GATE-1 emsali); mergeStateStatus CLEAN; canonical main == origin/main == GitHub remote main == `94cf35f1` (VERIFIED, 2026-07-13). 72/72 test PASS; schema/migration additive-only; consumer cutover YOK. **Canonical legal-time foundation: AVAILABLE / NOT CUT OVER; consumer source: LEGACY/UNCHANGED.** **GO-IMPLEMENT (PR-2): YES/MERGED.** Bkz. `decision-log.md` 2026-07-13 MPB-028(a) PR-2 kaydı; izole worktree fiziksel kalıntısı `maintenance-register.md` **MR-048**. **PR-3 — MERGED/CLOSED (shadow-read + diff evidence, halka 3/6):** Legacy (`WorkflowEngine.calculateNextActionTime`'ın PAYMENT_ORDER/WAITING_RESPONSE dalının bağımsız replikası, dosyaya hiç dokunulmadan) ile canonical (`LegalDeadlineService`) hesabı arasındaki farkı ölçen tamamen read-only bir shadow-diff eklendi; `LEGAL_TIME_SHADOW_ENABLED` flag'i altında (varsayılan kapalı), immutable `LegalTimeShadowDiff` kaydı üretir. İlk implementasyon turunda owner iki düzeltme istedi: (1) **delta kategorisi** — `deltaCategories` (SMALL/MEDIUM/LARGE) bucketing'i kendi inisiyatifimle eklenmişti; owner bunun teknik değil hukuki/politika kararı olduğunu belirtti (Decision 7), kaldırıldı — servis yalnız ham `deltaDays` taşır; (2) **evidence completeness** — "ilk 10 kayıt" limiti de owner onayı olmadan eklenmiş bir politikaydı (Decision 8); kaldırıldı — evidence report artık tenant'a ait TÜM kayıtları döner, filtreleme UI/raporlama katmanına bırakıldı. PR #1192, squash merged SHA `e22777c66d98bc0d069629a07baf7cf0b13f9c41`; CI 4/4 SUCCESS (yeni testler PR-2 dersiyle baştan CI'a eklendi, log kanıtıyla doğrulandı: unit 26 test + disposable-DB 5 test); mergeStateStatus CLEAN; canonical main == origin/main == GitHub remote main == `e22777c6` (VERIFIED, 2026-07-13). 101/101 test PASS (PR-2 regresyonu dahil); consumer cutover YOK. **GO-IMPLEMENT (PR-3): YES/MERGED. PR-4 (consumer cutover)/PR-5 (canonical source enforcement): NOT AUTHORIZED** — her biri ayrı owner GO-IMPLEMENT gerektirir, bu kayıt hiçbirini yetkilendirmez. İzole worktree fiziksel kalıntısı `maintenance-register.md`'de ayrı bir MR kaydında. **OWNER DECISION (2026-07-13): yukarıdaki "PR-3" retroaktif olarak PR-3A (Shadow Read + Diff Engine — yukarıdaki paragrafla birebir aynı iş, CLOSED) ve PR-3B (Evidence Activation — DI runtime kaydı + `LegalTimeShadowController` + local evidence procedure runbook) olarak ikiye ayrıldı; PR-4/PR-5/PR-6 numaraları DEĞİŞMEDİ, yalnız PR-3'ün kendisi bölündü (bkz. `decision-log.md` aynı tarihli OWNER DECISION kaydı, `legal-time-authority-rebase.md` Bölüm 7 güncel PR tablosu).** **PR-3B — MERGED/CLOSED:** `LegalDeadlineModule`/`LegalTimeShadowModule` artık `app.module.ts`'e kayıtlı (gerçek NestJS DI container'ında, bootstrap denemesiyle doğrulandı); yeni `LegalTimeShadowController` (compute + evidence-report, tenant-scoped); local evidence procedure runbook'u; DI-registration regresyon testi + CI-coverage step'i. PR #1198, squash merged SHA `6b07bd096dc4096ef5328cb8fa2bb1eaf6b54696`; CI 4/4 SUCCESS (Test Suite logu ile doğrulandı: yeni controller+registration step'i 2 suite/9 test PASS, genişletilmiş disposable-DB step'i 1 suite/9 test PASS); mergeStateStatus CLEAN; canonical main == origin/main == GitHub remote main == `6b07bd09` (VERIFIED, 2026-07-13). Governance dosyaları (bu satır dahil) bilinçli olarak runtime PR'ın dışında tutuldu, ayrı bu docs-only governance closure PR'ında ele alınıyor. **PR-3 OPERATIONAL MECHANISM: AVAILABLE. REPRESENTATIVE LOCAL EVIDENCE: ABSENT / OWNER EXECUTION REQUIRED. GATE-2: NOT YET SATISFIED** — gerçek ofis verisiyle evidence üretilmeden PR-4 açılmış sayılmaz. İzole worktree (`HUKUK_mpb028a-pr3-evidence-activation`) fiziksel kalıntısı `maintenance-register.md`'de ayrı bir MR kaydında. **PR-3C — MERGED/CLOSED (Canonical Proceeding-Type and Legal-Period Rule Matrix, halka 3C/6):** Owner'ın "Proceeding Type ≠ Instrument Type" ilkesi koda taşındı — `ProceedingType`(9)/`RentalType`(4)/`BankruptcyType`(2)/`JudgmentExecutionType`(5)/`NextActionType`(7)/`PreEnforcementProcessType`+`Status` additive enum'lar, `Case`+`LegalDeadlineSnapshot`'a nullable kolonlar, tek merkezli `legal-period-rule-matrix.ts` (owner onaylı tüm kesin kombinasyonlar), `ProceedingClassificationService` (CaseType/subType/executionPath'ten gizli fallback YOK, statik guard'lı), `LegalPeriodCalculationService` (read-only, `periodStartDate=+1`, `max(...)` formülü). GO-IMPLEMENT sırasında beklenmeyen bir şema çakışması (mevcut `CaseInstrument`/`InstrumentType` CEK/SENET/BONO/POLICE modeli) keşfedilip owner'a raporlandı; owner kararıyla **`Case.instrumentType` veya yeni bir `InstrumentType` enum'ı OLUŞTURULMADI**, kanonik enstrüman kaynağı mevcut `CaseInstrument[]` olarak korundu. `PLEDGE`/`MORTGAGE`/bağımsız `EVICTION`/`PUBLIC_RECEIVABLE` bilinçli olarak UNRESOLVED (doğrulanmamış süre kuralı eklenmedi). PR #1212, squash merged SHA `e39ce54c51af9ab35123c39e9913c6f51b8e4db3`; CI 4/4 SUCCESS (Test Suite logu ile doğrulandı: unit/static 4 suite/44 test PASS, disposable-DB 1 suite/7 test PASS); mergeStateStatus CLEAN; canonical main == origin/main == GitHub remote main == `e39ce54c` (VERIFIED, 2026-07-13). 118/118 unit/static + 20/20 disposable-DB PASS (PR-2/PR-3 regresyonu dahil); consumer/UI/workflow/scheduler/legacy kod değişikliği YOK. **REPRESENTATIVE LOCAL EVIDENCE: DELIVERED** — Operational Gate tamamlandı (12 temsili senaryo: gerçek/tüzel kişi alacaklı/borçlu, kamu kurumu, çek, bono, ilamsız, kira, tahliye, ipotek, rehin; disposable Docker Postgres; shadow (PR-3B) + canonical (PR-3C) hesap TAM eşleşti). `SENET`/`BONO` legacy ayrımı NEW FINDING / NOT AUTHORIZED olarak kaydedildi, bu PR'da çözülmedi. İzole worktree (`HUKUK_mpb028a-pr3c-proceeding-type-matrix`) fiziksel kalıntısı `maintenance-register.md` **MR-054**. **PR-4 — MERGED/CLOSED (Consumer-by-Consumer Read-Only Cutover, halka 4/6):** `DebtorService.getDebtorsForCase`/`getCaseDebtorDetail`, `LEGAL_TIME_CUTOVER` flag'i açıkken `LegalPeriodCalculationService`'i (CaseDebtor→Tebligat köprüsü üzerinden) çağırarak read-only `finalizationRequestEligibleDate`/`finalizationEligibilitySource` (`LEGACY`/`CANONICAL`/`UNRESOLVED`) projeksiyonu üretir; legacy `finalizationDate` (tebliğ+7 gün) flag'den TAMAMEN bağımsız, LEGACY COMPATIBILITY alanı olarak DEĞİŞTİRİLMEDEN korunur. Owner PR sırasında model adını/davranışını üç kez revize etti (bkz. `decision-log.md` 2026-07-14 MPB-028(a) PR-4 kaydı, tam kronoloji); son karar: yalnız dar read-only projection eklendi, yeni objection/enforcement-capability/UYAP modeli KURULMADI. Kapsamlı repo araştırması gerçek/kalıcı bir itiraz kaydının repoda BULUNMADIĞINI kanıtladı (yalnız `workflowStage`, süre-uzunluğu sağlayıcısı, devre dışı icrabot modülü, stateless validation-gate parametresi bulundu); bu nedenle itiraz fact'i modellenmeden gerçek `finalizationDate` veya `enforcementCapabilityStatus` ÜRETİLMEDİ. UI (`ServiceStatusBadge`/`DebtorDetailDrawer`/`FinalizationCountdown`) flag açıkken "Kesinleşti"/"Kesinleşme tarihi" hükmünü ASLA göstermez; nötr "Kesinleştirme Talebi Uygunluğu" göstergesi (`FinalizationRequestEligibilityIndicator`), UNRESOLVED'da fail-closed "Hesaplanamadı" gösterir. Consumer'lar: `DebtorRow`/`ServiceStatusBadge`/`DebtorDetailDrawer`/`FinalizationCountdown`; kapsam dışı (owner kararıyla bilinçli): `case-deadlines.tsx`, `NotificationService.getPaymentDeadline`, PR-5, otomatik kesinleştirme, `FinalizationDate` yazımı, backfill, holiday/calendar, yeni objection/enforcement-capability modeli, UYAP/müdürlük onay akışı, haciz yetkisi hakkında otomatik karar. PR #1228, squash merged SHA `78013f74ead639231304239740529d60b2594bfb`; CI 4/4 SUCCESS (Architectural Guardrails, Test Suite, Web Tests (vitest), Client Workspace Live Smoke); mergeStateStatus CLEAN; canonical main == origin/main == GitHub remote main == `78013f74` (VERIFIED, 2026-07-14). BE unit 10/10 + disposable-DB 6/6 + debtor regresyon 219/219 PASS; FE PR-4 testleri 7/7 + tüm regresyon 1072/1072 PASS; BE `tsc` 492 pre-existing hata sabit (0 yeni), ESLint 0 error; consumer cutover İLK KEZ AKTİF (flag varsayılan KAPALI, default-disabled). **GO-IMPLEMENT (PR-4): YES/MERGED. PR-5 (scheduler/workflow switch): NOT AUTHORIZED** — ayrı owner GO-IMPLEMENT gerektirir, bu kayıt yetkilendirmez. İki ayrı gelecek workstream ihtiyacı kaydedildi (bu PR'ın kapsamı DEĞİL, implementasyonu YOK): **Objection/Enforcement Capability Canonicalization** (itiraz olgusu ve cebrî icra kabiliyetinin kanonik fact olarak modellenmesi); **`finalizationRequestStatus`** (müdürlük/UYAP idari onay akışı, ayrı workstream). İzole worktree (`HUKUK_mpb028a-pr4-consumer-cutover`) fiziksel kalıntısı `maintenance-register.md` **MR-055**. |
| DEBTOR-SCORING-CANON | Debtor / Risk Scoring | Üç rakip risk/skor formülünün (F1 `RiskService.analyzeCase`, F2 `AutomationService.calculateRiskScore` nightly cron, F3 dormant icrabot v4 ters-polarite) kanonik `DebtorScoringService`/`DebtorScoringSnapshot` hattına konsolidasyon tasarımı — MPB-028 kapanışında ID'siz PROPOSED bırakılan takip maddesi (b)'nin ilk somut çıktısı | PR #1043 squash merged, SHA `e7c4b492e8bcba5474365240589505a32cb2df9d`; CI 4/4 PASS (Architectural Guardrails, Test Suite, Web Tests (vitest), Client Workspace Live Smoke); mergeStateStatus CLEAN; docs-only design spec (`project/docs/design/debtor-scoring-canonicalization.md`, tek dosya, 205 satır). Doğrulanan defektler: üç rakip formül; F3 ters polarite (yüksek=iyi) + `task-orchestrator.service.ts:301`'de tenant-guard'sız silahlı-boşta `Case.riskScore` yazma yolu; aktif tüketicilerin tamamı yüksek=kötü varsayar; `Case.riskScore`'un tek yazarı F2 nightly cron, F1 on-demand analiz `Case.riskScore`'u GÜNCELLEMEZ; `RiskReport` çift-yazar/farklı factors Json şeması + doğrudan tenantId/source/version yok; F1 davranış skoru `NotificationQueue DELIVERED` sinyaline bağımlı (PR #1027 sonrası kurur — kanonik girdi `Tebligat` gerçeği olmalı, `legal-time-authority-rebase.md` ilkesiyle aynı hiza). **CONFIRMED_DEFECT (collection status):** PENDING/CANCELLED/REFUNDED tahsilatlar 5 aktif sitede "tahsil edildi" sayılıyor (`risk.service.ts:113,174` skor/davranış, `automation.service.ts:282` persist edilen skor, `ai.service.ts:184,217,311` prompt/fallback, `fact-store.service.ts:162` policy collectionRate); doğru kural yalnız CONFIRMED / kanonik balance çıktısı. Hedef mimari: `DebtorScoringService` (tek polarite yüksek=kötü) + `DebtorScoringSnapshot` (`score`/`scoreBand`/`factorBreakdown` tek şema/`tenantId` doğrudan/`sourceCaseId`/`calculationVersion`/`inputsHash`/`inputProvenance`); manuel eksenler (`Debtor.riskLevel`, `LookupRisk`) ayrı kalır. **D1-D7 owner kararları karara bağlandı** (bkz. decision-log 2026-07-10 DEBTOR-SCORING-CANON kaydı): polarite yüksek=kötü, entity Case-level v1, hotfix öne alınacak (ayrı dar GO-IMPLEMENT), RiskReport migration bu hatta değil, `Case.riskScore` legacy alias/tek otorite değil, icrabot reaktivasyonu polarity-adapter'a bağlı (rewrite yok), balance entegrasyonu fazlanır (hotfix'te güvenli değilse yalnız CONFIRMED filtresi). Rollout: 7 fazlı shadow-first; her faz ayrı GO-IMPLEMENT. **GO-DOCS: YES, GO-IMPLEMENT: NO.** Sıradaki hat: `COLLECTION-STATUS-FILTER-HOTFIX` (ayrı GO-IMPLEMENT, görünür skor/AI/policy davranış değişikliği beklenir) — **bu hat PR #1047 (`ab37f18d`) ile CLOSED, bkz. aşağıdaki ayrı `COLLECTION-STATUS-FILTER-HOTFIX` satırı; kanonik `DebtorScoringService` mimarisi (Phase 2-7) hâlâ bloklu/implemente edilmedi.** Kapsam-dışı bırakılan M1 bulgusu `COK_YUKSEK→RISK_BANKRUPTCY` yanlış eşlemesi de PR #1051 (`f9a05e87`) dar semantik hotfix'iyle CLOSED — bkz. `DEBTOR-RISK-LABEL-MAPPING-FIX` satırı; MPB-028(d) `Debtor.legalStatus` hayalet alan kararı bu düzeltmeyle KAPANMADI, açık kalır. **Phase 2 spec CLOSED:** PR #1054 squash merged, SHA `2e26540d7acdbfc19401fed79fccb30749c593d7`, CI 4/4 SUCCESS — read-only `DebtorScoringService` şartnaması + M1-M7 owner kararları (NİHAİ) `debtor-scoring-canonicalization.md` **Bölüm 12**'ye docs-only eklendi (+146 satır, tek dosya). **GO-IMPLEMENT PR-2A: READY** (contracts + pure engine; ardından PR-2B input adapters → PR-2C orchestration + tests) — henüz UYGULANMADI, ayrı owner GO bekler. Full consumer switch, snapshot persistence, internal endpoint ve cross-case aggregate Phase 2 kapsamı DIŞINDA kalmaya devam eder (M3/M4/M6). **PR-2A CLOSED:** PR #1060 squash merged, SHA `475de5461786567dc1018672774ce67ed144f9c7`, CI 4/4 SUCCESS — `dscan-v1.0` contracts + saf deterministik engine tamamlandı (yeni `apps/api/src/modules/debtor-scoring/` modülü, 4 dosya +727, mevcut dosyalara dokunulmadı; 2 suite/15 test PASS + statik saflık guard'ı). **DB/IO/persistence YOK; adapter (PR-2B), orchestration (PR-2C), endpoint ve consumer switch HENÜZ YOK — PR-2B READY, PR-2C onu bekler.** Orphan worktree → MR-022 (MR-021 zaten ADR-014 W0.3'e ayrılmıştı). **PR-2B CLOSED:** PR #1065 squash merged, SHA `872e0f8eac553a57b9629b36b01a4219b1d276b4`, CI 4/4 SUCCESS — `FinancialInputAdapter` (birincil kaynak `CaseBalanceService.computeCaseBalance`; safe → `BALANCE_AUTHORITY`; unsafe → `CONFIRMED_FILTER_FALLBACK`/`NOT_AVAILABLE`) + `CaseSignalInputAdapter` (asset/service/itiraz/CONFIRMED-recency) tamamlandı (6 dosya +684, mevcut dosyalara dokunulmadı; 6 suite/37 test PASS). **`NotificationQueue`, manuel risk etiketleri ve legal deadline hesapları hiçbir adaptörde kullanılmıyor.** **Servis orkestrasyonu (PR-2C), endpoint ve module registration HENÜZ YOK — PR-2C READY.** Orphan worktree → MR-023. **PR-2C CLOSED — PHASE 2 TAMAMEN KAPANDI:** PR #1068 squash merged, SHA `1e9b290a9771b8df74b47af003758bba79e909c6`, CI 4/4 SUCCESS — `DebtorScoringService.calculateCaseScore(tenantId, caseId, asOf)` PR-2B adaptörlerini paralel çağırıp tek `ScoringInput` kurar, PR-2A `calculateScore()` motorunu değiştirmeden çağırır; `DebtorScoringModule` (controller yok) `app.module.ts`'e kaydedildi (6 dosya +301, `app.module.ts` yalnız +2 satır; 9 suite/48 test PASS — tüm Phase 2 modülü). **Endpoint, persistence, shadow compare, consumer switch HENÜZ YOK (Phase 3'ün işi).** **PHASE 2: CLOSED. PHASE 3: NOT STARTED.** Orphan worktree → MR-024. **Phase 3 spec CLOSED:** PR #1074 squash merged, SHA `d95f50d849f15b848bcf5eac8b0bdae4baf4fc46`, CI 4/4 SUCCESS — shadow-compare şartnamesi `debtor-scoring-canonicalization.md` **Bölüm 13**'e docs-only eklendi (+135 satır, tek dosya). **Kritik ayrım:** `safeForConsumerSwitch` Phase 3 boyunca daima `false` (politika kapısı, case-bazlı hesaplanmaz); `readinessCandidate` ayrı, yalnız teknik sinyal, yetki ima etmez; `LEGAL_TIME_AUTHORITY_PENDING` `blockers`'ta ayrı görünür ama çoklu-DATA_GAP eşiğine karışmaz. D1-D5 NİHAİ: endpoint EVET/ayrı PR-3B, persistence HAYIR/yalnız telemetry, batch/cron HAYIR, consumer-switch YASAK, süre/örneklem uygulanmaz. **PR-3A (read-only shadow-diff contract + service + tests): READY** — henüz UYGULANMADI. **CONSUMER SWITCH: BLOCKED.** |
| COLLECTION-STATUS-FILTER-HOTFIX | Debtor / Risk Scoring | Collection-tabanlı risk/AI/policy metriklerinde `PENDING`/`CANCELLED`/`REFUNDED` tahsilatların "tahsil edildi" sayılmasının durdurulması — DEBTOR-SCORING-CANON D3 owner kararıyla öne alınan dar davranış düzeltmesi (CONFIRMED_DEFECT kapanışı) | PR #1047 squash merged, SHA `ab37f18d8e048276c973764304e67bdcfbb3f879` (branch commit `ab7966d9`); CI 4/4 PASS (Architectural Guardrails, Test Suite, Web Tests (vitest), Client Workspace Live Smoke); mergeStateStatus CLEAN. **Kural:** yalnız `CONFIRMED` tahsilat sayılır; filtre tek yerde — yeni `apps/api/src/common/collection-confirmed.util.ts` (`isConfirmedCollection`/`filterConfirmedCollections`/`sumConfirmedCollections`). **5 site düzeltildi:** `risk.service.ts` collection score + behavior score; `automation.service.ts` nightly persist edilen `Case.riskScore` + `hasCollections`; `ai.service.ts` prompt/fallback metrikleri (3 nokta); `fact-store.service.ts` `collectedAmount`/`collectionRate` (select'e yalnız `status: true` eklendi). Diff 11 dosya (+461/−22): helper + 5 site + 5 yeni spec + `ai-suggestions.spec.ts`'te 1 bayat fixture düzeltmesi (davranış değişikliğinin haklı yakaladığı status'süz collection; testin niyeti korundu). Doğrulama: yeni testler 5 suite/21 PASS (her sitede PENDING+CANCELLED+REFUNDED dışlanır / CONFIRMED dahil / mixed-status regresyonu); komşu regresyon 4 suite/35 PASS; changed-file tsc 0 hata; `git diff --check` temiz. **Beklenen görünür etki (bilinçli):** nightly cron ertesi gece portföyü CONFIRMED-only oranla yeniden puanlar; AI/policy metrikleri değişebilir. **Frozen scope korundu:** schema/migration YOK, icrabot YOK, `Case.riskScore` deprecation YOK, `RiskReport` şema değişikliği YOK, `DebtorScoringService` YOK, API/response contract + UI değişmedi. Hard Stop Triggered: NONE; Frozen Decisions Violated: NONE. Cleanup: remote+local branch silindi; izole worktree git-side unregistered, fiziksel dizin Windows "Filename too long" nedeniyle force-delete KULLANILMADAN `ORPHANED_WORKTREE_DIR` bırakıldı → `maintenance-register.md` **MR-006**. **GO-IMPLEMENT ayrımı:** bu dar hotfix TAMAMLANDI; kanonik DebtorScoring mimarisi (Phase 2-7) implemente EDİLMEDİ, her faz ayrı GO-IMPLEMENT bekler. |
| DEBTOR-RISK-LABEL-MAPPING-FIX | Debtor / Risk Scoring | Manuel `Debtor.riskLevel = COK_YUKSEK` etiketinin yanlış şekilde `RISK_BANKRUPTCY`/"İflas riski" olarak sunulmasının düzeltilmesi — DEBTOR-SCORING-CANON M1 bulgusunun dar semantik hotfix'i | PR #1051 squash merged, SHA `f9a05e87020de85e711e8835b4ac1f238a5ea2ef` (branch commit `b1b38e4c`); CI 4/4 PASS (Architectural Guardrails, Test Suite, Web Tests (vitest), Client Workspace Live Smoke). **Kanonik ayrım:** manuel `COK_YUKSEK` ≠ iflas hukuki olgusu; üretici artık `RISK_VERY_HIGH` / "Çok yüksek risk (manuel değerlendirme)" üretir (severity `DANGER` korunur); **`RISK_BANKRUPTCY` union'larda gerçek/doğrulanmış iflas sinyali için REZERVE — silinmedi.** Diff 4 dosya (+77/−3): `debtor.service.ts` (union + label map + tek üretici `calculateDebtorIssues`), paylaşılan `packages/types/src/index.ts` (üçüncü kopya senkronu), `web/lib/api.ts` (FE type union +1; FE code'a göre dallanmıyor, yalnız label render — davranışsal FE etkisi yok), yeni `debtor.service.risk-very-high-mapping.spec.ts`. Repo-geneli tarama: `RISK_VERY_HIGH` çakışmasız; tek üretici doğrulandı; `RISK_BANKRUPTCY` aktif consumer'ı yok; gözlem — `RISK_CONCORDAT`/`RISK_ADDRESS_SUSPECT` üreticisiz/ölü kod (dokunulmadı). Testler: yeni spec 6/6 PASS; komşu debtor modülü 27 suite/209 test PASS (4/69 pre-existing skip); changed-file typecheck (api+types+web) 0 hata. **Frozen scope korundu:** schema/migration YOK, `Debtor.legalStatus` kararı YOK, gerçek bankruptcy detection YOK, `DebtorScoringService` YOK, risk formülü/API shape/UI DEĞİŞMEDİ. **MPB-028(d) AÇIK KALIR** — `Debtor.legalStatus` hayalet alan / gerçek iflas detection ayrı workstream. Hard Stop Triggered: NONE; Frozen Decisions Violated: NONE. Cleanup: remote+local branch silindi; worktree git-side unregistered/pruned; fiziksel dizin Windows "Filename too long" nedeniyle force-delete KULLANILMADAN `ORPHANED_WORKTREE_DIR` → `maintenance-register.md` **MR-007**. |
| ENFORCEMENT-ACTION-TENANT-CASEDEBTOR-MIGRATION | Debtor / Legal / Data Integrity | `EnforcementAction`'ın tenant sınırını ve dosya-borçlusu (`CaseDebtor`) bağını doğrudan kurma migration tasarımı — MPB-028 kapanışında ID'siz PROPOSED bırakılan takip maddesi (c)'nin ilk somut çıktısı | PR-EA-1 = PR #1080; squash-merge SHA bu PR merge edildiğinde bilinir hale gelir ve merge-sonrası Master Register doğrulama turunda teyit edilir (bkz. Bölüm 9.10); CI 4/4 SUCCESS beklenir; docs-only design spec (`project/docs/design/enforcement-action-tenant-case-debtor-migration.md`, tek dosya). **Ground truth (VERIFIED):** `EnforcementAction` bugün ne `tenantId` ne `caseDebtorId` taşıyor (yalnız `caseId → Case`, Cascade); tek üretici tüm repo'da `WorkflowEngine.createEnforcementAction` (`workflow-engine.service.ts:317`, yalnız `.create`, hiç `.update/.delete/.upsert` yok); 3 tüketici (`AiService`/`RiskService`/`WorkflowEngine.buildContext`) — ilk ikisi parent Case'i tenant-scoped okuyor, `RiskService`'in include'u fiilen dead-read, `buildContext` tenant'sız `Case.findUnique({id})` kullanıyor (ayrı, daha geniş bir bulgu — OD-3). `CaseDebtor`'a hiçbir FK/join yolu yok (Collection/Tebligat'ın aksine); `targetDetails` hiçbir üretici tarafından doldurulmuyor. **D1-D12 frozen kararlar (belgede nihai, burada yeniden yazılmaz — bkz. Bölüm 8):** additive-first (nullable `tenantId`/`caseDebtorId`), `tenantId` backfill'i %100 deterministik, `caseDebtorId` yalnız tek-CaseDebtor'lu dosyalarda otomatik yazılır, INFERABLE/AMBIGUOUS asla guess ile yazılmaz, `caseDebtorId` kalıcı nullable kalabilir, FK `onDelete: Restrict` (Collection/Tebligat DBND-D5B/D5C emsali), unique constraint YOK, consumer switch YOK. **Backfill sınıflandırması:** `TENANT_DETERMINISTIC`/`CASE_DEBTOR_DETERMINISTIC` (otomatik) vs `INFERABLE`/`AMBIGUOUS`/`ORPHAN` (asla otomatik yazılmaz) vs `INTEGRITY_FAILURE` (hard stop). **OD-1—OD-5 owner kararları nihai** (Bölüm 15): INFERABLE owner-review kuyruğu, ambiguous-oranı sabit eşik DONDURULMAZ (gerçek veri profili owner'a sunulmadan backfill merge edilmez), `WorkflowEngine.buildContext` tenant-guard boşluğu ayrı security workstream, `RiskService` dead include ayrı maintenance, FE `lastEnforcementActionAt` phantom field ayrı workstream. **PR sırası:** PR-EA-1 (bu belge, design/governance) → PR-EA-2 (additive schema) → PR-EA-3 (data profiling + backfill) → PR-EA-4 (guarded write-path) → PR-EA-5 (tenantId NOT NULL hardening) → PR-EA-6 (cleanup/follow-up, OD-3/OD-4/OD-5). **GO-DOCS: YES, GO-IMPLEMENT (PR-EA-1): NO** — bu kayıt yalnız PR-EA-1'i kapsar; PR-EA-2..6'nın her biri kendi ayrı owner GO-IMPLEMENT'ini gerektirir, bu kayıt hiçbirini yetkilendirmez. **PR-EA-2 — MERGED/CLOSED (additive schema, halka 2/6):** `EnforcementAction.tenantId String?`+`tenant Tenant?` (Cascade) ve `caseDebtorId String?`+`caseDebtor CaseDebtor?` (Restrict) + 3 index (`tenantId`/`caseDebtorId`/`tenantId+caseId`) + `Tenant`/`CaseDebtor` karşı-ilişkileri eklendi; backfill/NOT NULL/write-path validation/consumer switch YOK (D9/D12, PR-EA-3/4/5'e bırakıldı). PR #1085, branch commit `f4c2e4c1`, squash merged SHA `532e67e0e1bec81aefd60c4e4d47d74d14a82ec1`; CI 4/4 SUCCESS; disposable-DB migration replay + 5 testlik DB-gated FK/nullable/Restrict/Cascade/index spec PASS; `ai.service`/`risk.service`/`ai-suggestions`/`automation` modülü (36 test) regresyon PASS; changed-file tsc 0 hata; kapanış doğrulaması sırasında canonical main == origin/main == `532e67e0` (VERIFIED, 2026-07-11). İzole worktree (`HUKUK_ea-schema-migration`) "Filename too long" nedeniyle fiziksel silinemedi → `maintenance-register.md` **MR-026**. **GO-IMPLEMENT (PR-EA-2): YES/MERGED.** **PR-EA-3A — MERGED/CLOSED (read-only classifier + profiler, halka 3/6):** `classifyEnforcementAction()` saf classifier (tenant: `ALREADY_POPULATED`/`TENANT_DETERMINISTIC`/`INTEGRITY_FAILURE`; caseDebtor: `ALREADY_POPULATED`/`CASE_DEBTOR_DETERMINISTIC`/`INFERABLE_SINGLE_ACTIVE`/`INFERABLE_SINGLE_PRIMARY`/`AMBIGUOUS`/`ORPHAN`/`INTEGRITY_FAILURE`) + salt-okuma profiler (summary.json + 5 CSV) eklendi; **hiçbir mutation/apply/confirm/write/execute/commit yeteneği YOK** (statik guard + disposable-DB before/after-count testiyle kanıtlandı); cross-case/cross-tenant caseDebtorId ve tenant mismatch INTEGRITY_FAILURE olarak işaretlenir; rapor çıktısında PII yok. PR #1090, branch commit `12279910`, squash merged SHA `dbae23426490ccaccc446cec54a0166143adcd8d`; CI 4/4 SUCCESS; 27/27 test (15 classifier + 5 statik-saflık guard + 7 disposable-DB entegrasyon) PASS; eslint/changed-file tsc temiz; kapanış doğrulaması sırasında canonical main == origin/main == `dbae2342` (VERIFIED, 2026-07-11). İzole worktree (`HUKUK_ea3a-profiler`) "Filename too long" nedeniyle fiziksel silinemedi → `maintenance-register.md` **MR-028** (MR-027 eşzamanlı olarak başka bir workstream — PR #1056 disposition — tarafından alındığı için renumber edildi, çakışma yok). **GO-IMPLEMENT (PR-EA-3A): YES/MERGED.** **PR-EA-3A.1 — MERGED/CLOSED (profiler report hardening, halka 3.1/6):** `summary.json`'a credential'sız `database` kimliği (host/port/databaseName/environment/readOnlyMode) + `profilerVersion` + `outputFiles` eklendi; deterministik SHA-256 hash manifest'i (`manifest.sha256`, sabit sıra, self-hash yok, hash'ler summary.json'a gömülmedi) 6 rapor dosyasını kapsıyor. Hash mantığı Prisma/NestJS'ten bağımsız ayrı bir dosyaya (`enforcement-action-report-hash.ts`) taşındı — `crypto.Hash.update()`'in mevcut statik guard'ı yanlışlıkla tetiklemesi nedeniyle (guard GEVŞETİLMEDİ, yeni dosya için "Prisma/Nest import yok" testiyle GENİŞLETİLDİ). PR #1100, branch commit `b4b94c3d`, squash merged SHA `c1ad9f55c8e64a34ff90a78e001df71cb3cf81d8`; CI 4/4 SUCCESS; 44/44 test (32 mevcut değişmeden + 12 yeni: credential-redaction gerçek disposable-DB bağlantı dizesiyle, manifest correctness/ordering/self-exclusion) PASS; eslint/changed-file tsc temiz; manuel end-to-end koşum credential sızıntısı olmadığını doğruladı; kapanış doğrulaması sırasında canonical main == origin/main == `c1ad9f55` (VERIFIED, 2026-07-11). İzole worktree (`HUKUK_ea3a1-report-hardening`) "Filename too long" nedeniyle fiziksel silinemedi → `maintenance-register.md` **MR-031** (MR-029/MR-030 eşzamanlı başka workstream'ler — ADR-014 PR-1B/W0.3 — tarafından zaten alınmış olduğu tazeden doğrulandı, çakışma yok). **GO-IMPLEMENT (PR-EA-3A.1): YES/MERGED.** **PRODUCTION PROFILE: NOT EXECUTED. REAL DISTRIBUTION: UNKNOWN. PR-EA-3B: BLOCKED / NOT AUTHORIZED** — gerçek veri profili owner'a sunulmadan (OD-2) backfill başlatılamaz. **MPB-028(c): DESIGN CLOSED / IMPLEMENTATION PARTIAL-OPEN** (PR-EA-3B/4/5/6 hâlâ ayrı owner GO bekler; consumer switch hâlâ BLOCKED). **PROFILER-EXECUTION-ENVIRONMENT-BLOCKER:** Profiler execution, repository bağlamından erişilebilir veya dokümante edilmiş doğrulanmış bir sanitized production copy, production read replica veya representative staging ortamı bulunmadığı için ilerleyemiyor. Yerel `docker-compose.staging.yml` (sabit `postgres/postgres` placeholder credential) ve CI `STAGING_API_URL` referansı (gövdesiz `# TODO: Implement live smoke tests`) representative execution ortamı sayılmaz. Gerekli owner/altyapı kararları: (1) production PostgreSQL konumu/sahipliği, (2) snapshot veya sanitized-copy üretim kapasitesi, (3) read-replica erişilebilirliği, (4) PII maskeleme politikası, (5) SELECT-only rol oluşturulabilirliği, (6) yetkili execution operatörü, (7) güvenli output dizini, (8) güvenli artefakt-teslim kanalı. Bu parametrelerin tamamı çözülene kadar execution BLOCKED kalır; credential hiçbir koşulda chat/tool-call/PR/issue/governance belgesi üzerinden paylaşılmaz. **Durum: BLOCKED — OWNER / INFRASTRUCTURE ACTION REQUIRED.** **LOCAL DEV PROFILER DRY-RUN — COMPLETED / SUPERSEDES BLOCKER FOR LOCAL-DEV VALIDATION ONLY:** Owner onayıyla, bekleyen 2 canonical migration'ın (`20260711002529_enforcement_action_tenant_case_debtor_fk`, `20260711143000_add_rich_interest_type_code`) local development database'e uygulanmasının ardından profiler local dev DB'ye (host: localhost, port: 5432, database: hukuk_db, environment: development) karşı bir kez çalıştırıldı. `EnforcementAction`/`Tenant`/`CaseDebtor` tabloları BEFORE=AFTER=0 satır (mutation YOK); manifest bağımsız SHA-256 yeniden hesaplamayla PASS; credential/PII sızıntı taraması temiz. **LOCAL DEV PROFILE: COMPLETED — ZERO DATA** — sonuç yalnız script'in uçtan uca çalışabilirliğini ve sıfır-mutasyon garantisini kanıtladı, gerçek dağılım sinyali ÜRETMEDİ. **Yukarıdaki execution-environment blocker yalnız local-dev doğrulaması için supersede edildi — production execution hâlâ erişilemez, çünkü hiçbir production ortamı mevcut değil** (owner tespiti, 2026-07-11: "Production PostgreSQL location: YOK / HENÜZ KURULMADI"; database class: LOCAL DEVELOPMENT DATABASE; read replica/sanitized copy: NOT AVAILABLE). **PRODUCTION PROFILE: NOT APPLICABLE WHILE NO PRODUCTION ENVIRONMENT EXISTS** (önceki "NOT EXECUTED" ifadesinin güncel karşılığı). Migration senkronizasyonu yalnız LOCAL DEV DB'ye uygulandı (**APPLIED LOCALLY**), production deployment değildir, runtime cutover yetkisi ima etmez. **Sıfır aday kayıt nedeniyle PR-EA-3B: HOLD — NO CURRENT BACKFILL CANDIDATES** (CLOSED değil; legacy import/database restore/manual data import veya NULL `tenantId`/deterministic `caseDebtorId` adayı tespit edilirse yeniden açılır). **NEXT RECOMMENDED WORKSTREAM: PR-EA-4 — Guarded Write Path** (gerekçe: backfill edilecek legacy kayıt yok; yeni eksik kayıtları önlemek artık backfill tooling'den daha öncelikli) — bu kayıt PR-EA-4 implementasyon yetkisi VERMEZ, ayrı owner GO-ANALYZE veya GO-IMPLEMENT gerektirir. **MPB-028(c): PARTIAL / OPEN** (değişmedi). **PR-EA-4 — MERGED/CLOSED (guarded write-path, halka 4/6):** `WorkflowEngine.createEnforcementAction()` artık `CreateEnforcementActionInput` (tenantId zorunlu, caseId, type, opsiyonel caseDebtorId) alır; tenantId `buildContext()`'in mevcut Case sorgusundan `RuleContext` üzerinden taşınır, caseId'den yeniden tahmin edilmez. Composite doğrulama + RFA-007 duplicate-guard (tenant-scoped, semantik değişmedi) + create tek `$transaction` içinde: Case `findFirst({id, tenantId})` (yalnız `findUnique({id})` DEĞİL — OD-3 emsali tekrarlanmadı); caseDebtorId verildiyse `CaseDebtor.findFirst({id, caseId})` (doğrudan tenantId yok, tenant transitive caseId üzerinden). Her iki doğrulama hatası generic `NotFoundException` döner (enumeration yok). Otomatik caseDebtor seçimi/tahmini YOK — tek üretici (`executeRule`) hiçbir zaman per-debtor kimlik taşımadığı için `caseDebtorId` her zaman `null` gönderilir. Duplicate-guard filtresine `caseDebtorId` eklenmedi (mevcut aksiyonların dosya/borçlu-seviyesi ayrımı type bazında belirsiz — kapsam bilinçli olarak genişletilmedi). Backward compatible: tarihsel `tenantId=null`/`caseDebtorId=null` satırlar etkilenmedi. PR #1134, branch commit `37ef5d96`, squash merged SHA `bb34c17eaad36f5e19a81d4904cdfc60093cde0e`; CI 4/4 SUCCESS; 69/69 test (25 yeni unit + 8 yeni DB-gated + 7 yeni statik guard + 3 güncellenmiş RFA-007 + 26 mevcut regresyon) PASS; eslint/changed-file tsc temiz (rule-engine.service.ts'deki 2 hata benim tek satırlık eklentimin dışında, önceden mevcut); kapanış doğrulaması sırasında canonical main == origin/main == GitHub remote main == `bb34c17e` (VERIFIED, 2026-07-12). İzole worktree (`HUKUK_ea4-guarded-write-path`) "Filename too long" nedeniyle fiziksel silinemedi → `maintenance-register.md` **MR-039**. **GO-IMPLEMENT (PR-EA-4): YES/MERGED.** **PR-EA-3B: HOLD — NO CURRENT BACKFILL CANDIDATES** (değişmedi). **PR-EA-5: NOT AUTHORIZED** — tenantId NOT NULL hardening ayrı owner GO gerektirir. **MPB-028(c): PARTIAL / OPEN** (değişmedi). **WORKFLOWENGINE.BUILDCONTEXT TENANT GUARD (OD-3) — MERGED/CLOSED (PR-EA sırasının DIŞINDA, ayrı security workstream — OD-1—OD-5 owner kararlarında öngörülen tam olarak bu ayrım):** `buildContext(caseId)` → `buildContext(caseId, tenantId)`, `Case.findUnique({id})` → `Case.findFirst({id, tenantId})`, tenant/case mismatch generic `NotFoundException("Dosya bulunamadı")` (enumeration yok); `processCase(caseId, tenantId)` aynı tenant-scoped ikinci iç sorguyu da kapsar; tenantId üç çağıran zincirden taşınır (`processPendingCases` cron, `checkNotificationExpiries` cron, `AutomationController`'ın iki endpoint'i — `@CurrentUser() user.tenantId`). PR #1161, squash merged SHA `901f33f40358d05edbd04cbf4d124d707415c3e6`; CI 4/4 SUCCESS; kapanış doğrulamasında canonical main == origin/main == GitHub remote main == `901f33f4` (VERIFIED, 2026-07-12). 4 yeni test dosyası (unit mock + statik source-guard + disposable-DB entegrasyon + controller/service propagation), tümü PASS; schema/migration YOK; backward compatible. **OD-3 CLOSED.** `calculateNextActionTime`/`updateCaseStage` tenant guard'ı bu patch'in KAPSAMADIĞI, ayrı yetkisiz aday olarak kalır (owner OD-1—OD-5 kararında zaten "ayrı security workstream" olarak sınıflandırılmıştı — bu kayıt onu kapatmaz). İzole worktree (`HUKUK_workflow-buildcontext-tenant-guard`) "Filename too long" nedeniyle fiziksel silinemedi → `maintenance-register.md` **MR-041**. **PR-EA-5: NOT AUTHORIZED (değişmedi).** **MPB-028(c): PARTIAL / OPEN (değişmedi)** — OD-3 kapandı ama MPB-028(c)'nin tamamı bu patch ile kapanmadı. **CALCULATENEXTACTIONTIME + UPDATECASESTAGE TENANT BOUNDARY — MERGED/CLOSED (GO-ANALYZE→GO-IMPLEMENT→GO-COMPLETE zinciri, PR-EA sırasının DIŞINDA, ayrı security workstream):** GO-ANALYZE'de `calculateNextActionTime` **CONFIRMED CROSS-TENANT IDOR** (`GET /automation/cases/:id/next-action` `@CurrentUser()` hiç almıyordu, tenant'sız `Case.findUnique({id})`) ve `updateCaseStage` **DEFENSE-IN-DEPTH GAP** (bugün yalnız tenant-doğrulanmış `executeRule` zincirinden erişilebilir ama method-level guard'ı yok) olarak sınıflandırıldı. İkisi de owner kararıyla tek patch'te ele alındı: `calculateNextActionTime(caseId, tenantId)` ve `updateCaseStage(caseId, tenantId, newStage, reason, triggerType)` artık `Case.findFirst({id, tenantId})` + generic `NotFoundException` kullanır (PR-EA-4/OD-3 emsali); cross-tenant `updateCaseStage` çağrısında `$transaction` hiç tetiklenmez (mutation yok); tek çağıran (`executeRule`) `context.tenantId` aktarır; cron (`caseData.tenantId`) ve controller (`user.tenantId`) çağıranları güncellendi. PR #1166, squash merged SHA `93ab9345222101bbf1beb032fd656f62e737b045`; CI 4/4 SUCCESS; kapanış doğrulamasında canonical main == origin/main == GitHub remote main == `93ab9345` (VERIFIED, 2026-07-12). 18 unit+statik guard test + 4 disposable-DB entegrasyon test (gerçek Postgres, cross-tenant sıfır mutasyon doğrulandı) + 111/111 automation modülü tam regresyon PASS; schema/migration YOK; backward compatible (same-tenant response contract korunur). **CALCULATENEXTACTIONTIME + UPDATECASESTAGE CLOSED.** **NEW FINDING / NOT AUTHORIZED:** `RuleEngine.checkNotificationExpiry(caseId)` (processCase içinden çağrılıyor, tenantId almıyor gibi görünüyor) — bu kayıt onu açmaz, analiz edilmedi. İzole worktree (`HUKUK_workflow-tenant-boundaries`) "Filename too long" nedeniyle fiziksel silinemedi → `maintenance-register.md` **MR-042**. **PR-EA-5: NOT AUTHORIZED (değişmedi).** **MPB-028(c): PARTIAL / OPEN (değişmedi)** — bu iki ek tenant-boundary bulgusu kapandı ama MPB-028(c)'nin tamamı hâlâ kapanmadı. |

## Items

Legacy `strategic-backlog.md` içerik migration'ı ayrı onaylı governance işi olarak yapılacaktır (aşağıdaki maddeler bu migration'dan bağımsız, ADR-009 kararından doğan yeni maddelerdir).

---

## Migrated Strategic Backlog (MPB-026)

Bu bölüm `project/docs/strategic-backlog.md` içindeki SB-* kayıtlarının yeni Product Backlog formatına taşınmış kanonik kopyasıdır. Legacy dosya tarihsel snapshot olarak korunur; yeni güncellemeler burada yapılır.

---

ID: SB-001
Title: Party Registry — dış taraf kimliği konsolidasyonu + CaseParty + cross-case istihbarat
Problem: Müvekkil/borçlu/üçüncü kişi/mirasçı gibi dış taraf kimlikleri ayrı yapılarda yaşadıkça duplicate, cross-case istihbarat ve lifecycle kararları dağınık kalır.
Business Value: Gerçek veri hacmi oluştuğunda kişi/kurum kimliği tekilleşir, dosyalar arası istihbarat ve hukuki ilişki görünürlüğü artar.
Technical Value: Party/CaseParty ekseniyle Debtor/Client/third-party kimliklerini ileride tek mimari altında toplar.
Priority: HIGH
Depends On: Gerçek veri girişi; debtor intelligence yüzeyinin stabilize olması; SB-005 dahil açık ürün/hukuk kararları; Av. sign-off
Unlock Condition: Party Faz 0 owner kararı ve hukuk/mimari sign-off
Estimated Size: XL
Related Modules: party-registry-design.md, party-registry-design-review.md, debtor-identity-resolution-ir0.md
Status: HOLD

ID: SB-002
Title: IR-0 → PartyMatch kimlik çözümleme motoru
Problem: Update akışlarında “mevcut kayda birleştir” UX’i yok; standalone kimlik çözümleme Party mimarisinden koparsa ikinci bir çözümleme hattı doğar.
Business Value: Aynı kişi/kurum kayıtları owner onayıyla güvenli şekilde birleştirilebilir.
Technical Value: DebtorIdentityCandidate gelecekte PartyMatchCandidate altında modellenir; standalone IR motoru yapılmaz.
Priority: HIGH
Depends On: SB-001 Party Registry
Unlock Condition: Party Faz 5 içinde PartyMatch tasarımının owner tarafından açılması
Estimated Size: L
Related Modules: debtor-identity-resolution-ir0.md, PartyMatchCandidate
Status: HOLD

ID: SB-003
Title: Debtor soft-delete modelinin Party lifecycle ile çözülmesi
Problem: Debtor soft-delete tek başına yapılırsa Party lifecycle ile aynı problemi ikinci kez çözer.
Business Value: Borçlu görünürlüğü ve dosya ilişkileri hukuki/lifecycle bağlamıyla tutarlı kalır.
Technical Value: Party.isActive + CaseParty role-detach yaklaşımıyla standalone debtor soft-delete tekrarından kaçınılır.
Priority: MEDIUM
Depends On: SB-001 Party Registry
Unlock Condition: Party lifecycle tasarımı netleşir
Estimated Size: M
Related Modules: reliability-ledger RFA-009, Debtor, Party, CaseParty
Status: HOLD

ID: SB-004
Title: Asset → PartyAsset + CaseAssetAttachment
Problem: Varlık bilgisi kişi istihbaratı mı yoksa dosyadaki haciz/işlem kaydı mı ayrımı net değil.
Business Value: Varlık istihbaratı ve dosya bazlı haciz işlemleri ayrışır.
Technical Value: PartyAsset kişinin bilinen varlığını, CaseAssetAttachment dosya bağlamındaki işlemi temsil eder.
Priority: MEDIUM
Depends On: SB-001 Party Registry
Unlock Condition: Party Faz 2 açılır
Estimated Size: L
Related Modules: reliability-ledger DEAD-2, PartyAsset, CaseAssetAttachment
Status: HOLD

ID: SB-005
Title: EstateHeir modeli
Problem: Mirasçı ilişkisinin PartyRelation(HEIR_OF) mı yoksa alt-Party modeliyle mi temsil edileceği hukuki/mimari olarak açık.
Business Value: Mirasçı ilişkileri ileride doğru hukuki temsil ile izlenir.
Technical Value: Estate/heir modellemesi Party Faz 2’ye bağlanır; erken yanlış şema engellenir.
Priority: MEDIUM
Depends On: SB-001 Party Registry
Unlock Condition: Owner + hukuk kararı: PartyRelation(HEIR_OF) veya alt-Party
Estimated Size: M
Related Modules: party-registry-design-review.md §11
Status: HOLD

ID: SB-006
Title: PublicInstitution kapsamı (DETSİS)
Problem: Kamu kurumu kaydının tam Party mi yoksa hafif referans mı olacağı ürün kararı gerektirir.
Business Value: Kamu kurumlarıyla ilişki tutarlı ve gereksiz karmaşa yaratmadan izlenir.
Technical Value: DETSİS/kurum modellemesi Party mimarisi içinde doğru ağırlıkta konumlanır.
Priority: MEDIUM
Depends On: SB-001 Party Registry
Unlock Condition: Owner ürün kararı: tam Party veya hafif referans
Estimated Size: M
Related Modules: party-registry-design-review.md §11
Status: HOLD

ID: SB-007
Title: Cross-case istihbarat besleme
Problem: Aynı borçluya ait farklı dosyalardaki son adres, telefon, haciz ve temas bilgisinin güvenli ortak görünümü yok.
Business Value: Operasyon ekibi dosyalar arası değerli istihbaratı görebilir.
Technical Value: Party alt-ağaçları ve okuyucuları taşındıktan sonra cross-case read model kurulabilir.
Priority: HIGH
Depends On: SB-001 Party Registry
Unlock Condition: Party Faz 2 alt-ağaçlar + Faz 4 okuyucular tamamlanır
Estimated Size: L
Related Modules: party-registry-design.md §5
Status: HOLD

ID: SB-008
Title: Saha istihbaratı idempotency
Problem: DebtorIntelligence çift-submit riski Party ailesine taşınmadan önce açık kalabilir.
Business Value: Saha istihbaratında tekrar kayıt ve yanlış sinyal riski azalır.
Technical Value: Asıl çözüm PartyIntelligence Faz 2’dedir; gerçek saha girişi Party’den önce başlarsa küçük guard yapılabilir.
Priority: MEDIUM
Depends On: SB-001 Party Registry
Unlock Condition: PartyIntelligence Faz 2 veya Party öncesi gerçek saha-istihbarat kullanımı başlar
Estimated Size: S/M
Related Modules: reliability-ledger RFA-015, DebtorIntelligence, PartyIntelligence
Status: HOLD

ID: SB-009
Title: Junk/test verisi cleanup
Problem: 9 junk adres `street="."`, Ayşe Yılmaz test borçluları ve benzer QA kayıtları canonical veride kalıyor.
Business Value: Demo/QA/operasyon verisi daha güvenilir görünür.
Technical Value: Party’den bağımsız dry-run’lı operasyonel cleanup olarak yapılabilir.
Priority: LOW
Depends On: —
Unlock Condition: Owner dry-run/apply cleanup GO verir
Estimated Size: S
Related Modules: audit junk notu, data cleanup scripts
Status: READY

ID: SB-010
Title: Bağımsız küçük temizlikler
Problem: RFA-011 legacy debtor bypass, RFA-012 `_count`, RFA-014 GroupDefinition reactivate gibi küçük bağımsız borçlar dağınık duruyor.
Business Value: Düşük riskli temizliklerle bakım maliyeti azalır.
Technical Value: Party’den bağımsız küçük PR’larla kapatılabilir.
Priority: LOW
Depends On: —
Unlock Condition: Owner ilgili küçük cleanup dilimini seçer
Estimated Size: S/M
Related Modules: reliability-ledger RFA-011/RFA-012/RFA-014
Status: READY

ID: SB-011
Title: Calc / Faiz / TBK100 reliability audit turu
Problem: Para/faiz hesapları ayrı uzman alan; önceki reliability audit kapsamına girmedi.
Business Value: Hukuki hesaplamalarda güven artar, yanlış faiz/mahsup riski azalır.
Technical Value: Reliability Audit deseniyle ledger + canlı doğrulama ayrı turda yürütülür.
Priority: HIGH
Depends On: Owner audit GO
Unlock Condition: Calc/Faiz/TBK100 reliability audit için ayrı uzman tur açılır
Estimated Size: L
Related Modules: reliability-ledger, interest-engine, TBK100 hesaplama yüzeyleri
Status: HOLD

ID: SB-012
Title: Soft-delete model tam sweep
Problem: Audit yüksek trafikli modelleri taradı ama soft-delete yapan tüm modeller eksiksiz enumerate edilmedi.
Business Value: Lifecycle ve görünürlük politikaları daha tutarlı hale gelir.
Technical Value: Kalan soft-delete modeller için düşük öncelikli kapsam tamamlama sağlar.
Priority: LOW
Depends On: —
Unlock Condition: Owner düşük öncelikli tam sweep çalışması açar
Estimated Size: M
Related Modules: Client, Debtor, Lawyer, Staff, Lookup, Group, Portal ve kalan soft-delete modeller
Status: READY

ID: SB-013
Title: Web CI `next build` gate
Problem: Vitest geçerken Next route/build hatası main’e girebiliyordu; test yeşili uygulama boot garantisi değildi.
Business Value: Frontend boot kırıkları main’e daha zor girer.
Technical Value: Web Tests job artık vitest + build gate içerir.
Priority: MEDIUM
Depends On: —
Unlock Condition: —
Estimated Size: S
Related Modules: Web CI, Next build, PR #491
Status: DONE (shipped #491 → cb2203c; web-tests artık vitest + build çalıştırır)

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
Problem: ACCT-1 is now partially wired: CollectionDispositionLine, ClientPayout, ClientOffset, direct CREDIT/DEBIT BalanceLedger, generic AccountingJournalEntry reversal, and manual adjustment paths write AccountingJournal entries; remaining closure gaps are expense live writer wiring and any posting-mode cutover decision.
Business Value: Read-time türetilen cari → kanonik POSTED ledger; trial balance / ekstre / firma-geneli mutabakat açılır.
Technical Value: Writer/builder/validator/idempotency/source replay exist for wired sources. ACCT-1R Generic Reversal CLOSED via contract #738 (`70cf07b8`), service #741 (`6fd1b979`), and HTTP boundary #744 (`d44078c5`): tenant/auth-context reversal service, idempotent replay, audit transaction, CPE metadata, and focused service/HTTP smoke tests are merged. MPB-001 manual adjustment CLOSED via PR #757 (`56ea55ad`): manual adjustment contract, service and HTTP boundary are merged with focused service/HTTP smoke coverage. Posting-mode helper exists but is not the live gate for existing fail-closed writer paths; DEFAULT-OFF/SHADOW gating of live paths requires separate owner/mimari decision. ExpenseRequest/ExpensePayment/ExpenseApplication wiring, Client Accounting UI / Financial Statement projection consumption, and journal movements cutover production decision remain separate ACCT-1 scope.
Priority: HIGH
Depends On: #645 şema (MET); ADR-010 SoT north-star
Unlock Condition: Owner-selected next ACCT-1 slice for expense live writer wiring, projection/UI consumption, or journal movements production cutover; any posting-mode behavior change requires owner/mimari decision.
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
Problem: ClaimItem mutasyonu audit'siz + capability-sizdi (B4/S10/RC9); OWN-29-D ile public/user create/update/delete yolu low-impact metadata ve high-impact receivable mutation olarak ayrıştırıldı.
Business Value: Kim-ne-zaman-neyi-değiştirdi denetlenebilirliği; ADR-009/K4 tutarlılığı.
Technical Value: Public/user ClaimItem mutasyonları için capability + immutable audit + high-impact OfficeApproval gate; system/internal sync yolları user approval flow dışında kalır.
Priority: HIGH
Depends On: ADR-009 (Universal Office Approval, LOCKED ama POST-P4 sonrasına ertelendi — bkz UA-1)
Unlock Condition: Public/user mutation remediation OWN-29-D ile tamamlandı; kalan ALC canonical balance/ledger/TBK100 riskleri kendi P0/P1 maddelerinde izlenir.
Estimated Size: M
Related Modules: claim-item.service.ts, office-approval
Status: PARTIAL / OWN-29-D RUNTIME IMPLEMENTED — düşük etkili metadata capability+audit ile uygulanır; yüksek etkili ClaimItem değişiklikleri `CLAIM_ITEM_HIGH_IMPACT_CHANGE` OfficeApproval request üretir ve approval öncesi mutasyon yapmaz. Bu kapanış B1/B5/B6 canonical balance/ledger risklerini kapatmaz.

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
Status: **SUPERSEDED BY PR #917 (ALC-AUTH-3B)** — bkz. aşağıdaki reconciliation kararı. `ALC-AUTH-1C-IMPL` implement EDİLMEYECEK.

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

**Reconciliation kararı (2026-07-05, owner):** ALC-AUTH-1C-IMPL uygulanmayacak. `totalDebtAmount`'ın
kanonik tanımı PR #917'nin `grossPrincipal + gross faiz + costs + ancillaries` formülüdür (zaten
merge edilmiş, canlı) — `outstandingAmount + totalPaidAmount` formülü retire edildi (ALC-AUTH-1A'da
tespit edilen `totalPaidAmount` şişkinlik kuirkliği nedeniyle daha az güvenilir kabul edildi).
ALC-AUTH-1C **SUPERSEDED BY PR #917 (ALC-AUTH-3B)** olarak kapatıldı, ikinci bir implementasyon
YAPILMAYACAK. Sıradaki aktif iş **ALC-AUTH-3D** (guard alignment — bkz. aşağıdaki bölüm, Status: BACKLOG)
owner GO-IMPLEMENT'ini bekliyor.
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
Problem: ALC-AUTH-3C'nin kanitladigi guard/backend kopuklugunun kapatilmasi. Mimari soru: frontend'in primary-display kararı için tek otorite backend cutoverReadiness mi olacak, yoksa frontend kendi HARD_NO_GO_CODES listesini taşımaya devam mı edecek?
Business Value: Guarded primary pilot flag guvenle acilabilir hale gelir (bugun NO-GO). Ayrica ileride ayni guard mantiginin iki yerde yasamasi (drift riski) yapisal olarak kapanir.
Technical Value: Kod okumasiyla dogrulandi (2026-07-05): `guarded-primary-display.ts:254` zaten `report.cutoverReadiness.blockers`'i `codes` set'ine katiyor, ama backend'in kendi `safeForPrimaryDisplay` boolean'ini HIC okumuyor — onun yerine sabit 9 elemanli `HARD_NO_GO_CODES` ile kesisim testi yapiyor, bu yuzden `OUTSTANDING_DELTA`/`PAID_DELTA`/`PRINCIPAL_BUCKET_DELTA` (backend blockers'ta var, HARD_NO_GO_CODES'ta yok) sessizce elenip hic kontrol edilmiyor. **Onerilen 3. secenek** (1 ve 2'den farkli, ideal mimariye - "Backend cutoverReadiness -> Frontend sadece render eder" - en yakin, en dar degisiklik): `HARD_NO_GO_CODES` + `NOT_COMPARABLE` kontrolu tamamen KALDIRILIR; yerine `if (!report.cutoverReadiness.safeForPrimaryDisplay) reasonCodes.push(...report.cutoverReadiness.blockers)`. Boylece domain-safety verdict'i backend'de TEK yerde hesaplanir, backend yeni blocker ekledikce frontend otomatik hizali kalir (kalici, XS-S buyuklukte, (1)'in guvenlik-agi hizini + (2)'nin kalicilik faydasini birlikte verir, (2)'nin buyuk `buildGuardedPrimaryCalculationResult()` alan-bazli override yeniden yazimi kadar riskli degil). Frontend'de KALMASI GEREKENLER (domain-safety duplikasyonu degil, gercek frontend kaygisi): `FEATURE_FLAG_OFF`/`UNSUPPORTED_SCENARIO`/`PAYMENT_DESIGNATION_REQUIRED`/`UNSUPPORTED_PERIODIC_OBLIGATION`/`CLAIM_ITEM_AUTHORITY_CONTAMINATION` (rollout/policy, backend'in bilmesi gerekmez) ve `canonicalPrimaryAmounts()` finite-check (render-veri-mevcudiyeti, "guvenli mi" degil "gosterecek veri var mi").
Priority: —
Depends On: ALC-AUTH-3C
Unlock Condition: Owner karari — (1) HARD_NO_GO_CODES genisletme, (2) buildGuardedPrimaryCalculationResult() alan-bazli partial-cutover, (3) [ONERILEN] HARD_NO_GO_CODES'i kaldirip dogrudan cutoverReadiness.safeForPrimaryDisplay'e devret. (3), (1)'in yerini alir (ikisi birlikte anlamsizdir); (2) ayri/daha sonraki bir konu (hangi alanlarin override edilecegi), (3) ile catismaz.
Estimated Size: (1) XS, (2) M-L, (3) XS-S
Related Modules: guarded-primary-display.ts, balance-display-shadow-diff.service.ts
Status: **MERGED/CLOSED — FINAL (2 PR'lı kapanış)**. **Adım 1 — PR #922** (partial/preceding), commit SHA `a3a7872b`, squash merge SHA `8a340c23` (2026-07-05): `HARD_NO_GO_CODES`/`issueCodes()`/`NOT_COMPARABLE` kaldırıldı, domain-safety `report.cutoverReadiness.safeForPrimaryDisplay`/`blockers`'a bağlandı — ama `SHADOW_OR_CANONICAL_SOURCE_FAILURE`/`FINAL_DEBT_STATES_REQUIRED`/`DISPLAY_CURRENCY_UNSAFE`/report-provenance `CLAIM_ITEM_AUTHORITY_CONTAMINATION` gibi backend'in zaten kapsadığı kalıntı "ikinci authority" kontrolleri korunmuştu. **Adım 2 — PR #925 "strict cleanup"** (FINAL closure), commit SHA `6df8b814`, squash merge SHA `6c1304a3` (2026-07-05, owner talimatı: "Frontend'de backend cutoverReadiness.safeForPrimaryDisplay dışında domain-safety authority bırakma"): PR #922 üzerine rebase edilip yukarıdaki 4 kalıntı kontrol de kaldırıldı. Nihai `evaluateGuardedPrimaryDisplayPilot()`'ta domain-safety mantığı TEK satıra indi: `if (!report.cutoverReadiness.safeForPrimaryDisplay) reasonCodes.push(...report.cutoverReadiness.blockers)`. Frontend'de yalnız genuine kaygılar kaldı: `FEATURE_FLAG_OFF`/`UNSUPPORTED_SCENARIO`/`PAYMENT_DESIGNATION_REQUIRED`/`UNSUPPORTED_PERIODIC_OBLIGATION`/policy-tabanlı `CLAIM_ITEM_AUTHORITY_CONTAMINATION` + `canonicalPrimaryAmounts()` render-veri-mevcudiyeti. CI 4/4 PASS (Architectural Guardrails, Test Suite, Web Tests (vitest), Client Workspace Live Smoke); `balance-shadow-display.test.tsx` 78/78 PASS (2 yeni test eklendi); `tsc --noEmit` temiz; diff scope doğrulandı (yalnız 2 dosya, 1 commit). Allocation-engine/Q5/schema/case.service.ts legacy display'e dokunulmadı. **ÖNEMLİ SINIRLILIK (değişmedi, PR #925 ile de kapanmadı):** `COSTS_DELTA`/`ATTORNEY_FEE_DELTA`/`EXPENSE_BUCKET_DELTA`/`ATTORNEY_FEE_BUCKET_DELTA` kasıtlı olarak `cutoverReadiness.safeForPrimaryDisplay`'i bloklamadığından (B1_SCOPE_EXEMPT_DIFF_CODES), cost/attorney-fee ClaimItem'ı olmayan bir case'te guard GEÇER ve `buildGuardedPrimaryCalculationResult()` `toplamBorc`/`sonBorc`/`kalanBorc`'u canonical `totalDebtAmount`/`outstandingAmount` ile override eder — bu değerler eksik ClaimItem'ları sessizce 0 sayar (`sumRecord()`, null değil). ALC-AUTH-3C'nin ~34.311 TL under-display riski **HÂLÂ AÇIK** — bkz. **ALC-AUTH-3E (OPEN/NEXT)**. **Guarded primary pilot flag hala varsayilan KAPALI** ve ALC-AUTH-3E kapanmadan AÇILMAMALI. Bu kayıtla artık frontend/backend authority-source drift'i TAM olarak kapandı; kalan tek B1 blocker'ı ALC-AUTH-3E'dir.

ID: ALC-AUTH-3E
Title: Guarded Primary Cost/Attorney-Fee Understatement Risk — toplamBorc/sonBorc/kalanBorc override scoping
Problem: `buildGuardedPrimaryCalculationResult()` (`guarded-primary-display.ts:360-363`) guard geçtiğinde `toplamBorc`/`sonBorc`/`kalanBorc`'u koşulsuz canonical `totalDebtAmount`/`outstandingAmount` ile override ediyor. Bu alanlar `costs`/`ancillaries` ClaimItem'ı yoksa (`case-balance-display.ts:483-486`, `sumRecord()`) sessizce 0 sayılıyor — ve `COSTS_DELTA`/`ATTORNEY_FEE_DELTA`/`EXPENSE_BUCKET_DELTA`/`ATTORNEY_FEE_BUCKET_DELTA` kasıtlı olarak (ALC-AUTH-1A kararı, B1 kapsamı principal+interest+payment ile sınırlı) `cutoverReadiness.safeForPrimaryDisplay`'i bloklamıyor. Sonuç: cost/vekalet ClaimItem'ı olmayan case'lerde guard geçer AMA gösterilen "TOPLAM BORÇ/SON BORÇ" gerçek borcun altında kalır (ALC-AUTH-3C'nin 2026/9502 için ölçtüğü ~34.311 TL örneği).

**GO-ANALYZE tamamlandı (2026-07-05), 2 paralel araştırma turu — 2. tur 1. turun bir varsayımını DÜZELTTİ:**

1. **Risk yalnız 3 alanla sınırlı, 8 alanla DEĞİL.** `GUARDED_SUMMARY_CANONICAL_PRIMARY_OVERRIDE_ROW_IDS` (`guarded-primary-display.ts:114-123`) 8 alan içeriyor: `asilAlacak`/`takipTutari`/`takipSonrasiFaiz`/`toplamBorc`/`sonBorc`/`toplamTahsilat`/`kalanBorc`/`kalanAnapara`. Kaynak eşlemesi (`:356-364`): `asilAlacak`/`takipTutari`/`kalanAnapara` ← `principalAmount` (GÜVENLİ), `takipSonrasiFaiz` ← `interestAmount` (GÜVENLİ), `toplamTahsilat` ← `totalPaidAmount` (GÜVENLİ). Yalnız **`toplamBorc` ← `totalDebtAmount`** ve **`sonBorc`/`kalanBorc` ← `outstandingAmount`** (ikisi de `costs`+`ancillaries`'i içeriyor, ALC-AUTH-3B/`case-balance-display.ts:510-512`) risk taşıyor.
2. **Bu 3 alan tam olarak en görünür ekran alanları.** `HesapOzetiPanel.tsx:278-310`: "TOPLAM BORÇ" (kalın mavi banner), "SON BORÇ" (büyük yeşil text-xl), "KALAN BORÇ" (turuncu banner) — avukatın önce baktığı, en öne çıkan 3 rakam.
3. **DÜZELTME — cost/vekalet ClaimItem'ı "evrensel olarak yok" YANLIŞ önermeydi.** İlk araştırma turu yalnız otomatik/sistem yollarını (`due-to-claim-item.mapper.ts`, NAFAKA-tipi due-sync) taradı ve dosya-açılış sihirbazındaki manuel yolu KAÇIRDI. İkinci, bağımsız araştırma turu şunu kanıtladı: `ProfessionalClaimItemForm.tsx`'te **"PR-i2: GENEL FER'İ / MASRAF KALEMLERİ"** grubu altında kullanıcı dosya açılışında `MASRAF`/`VEKALET_UCRETI`/`HARC` vb. `kalemTuru` seçebiliyor (satır 116-231) — bu seçim `mapClaimKalemTuruToDueType()` (`case-due-payload.ts:174-192`) → `dues[]` payload → backend `mapDueTypeToClaimItemType()` (`due-to-claim-item.mapper.ts:18-33`, doğrulandı: `DueType.EXPENSE→ClaimItemType.EXPENSE`, `DueType.VEKALET_UCRETI→ClaimItemType.ATTORNEY_FEE`) → `CaseService.createClaimItemsFromDues()` (`case.service.ts:1194-1211`, `POST /cases` transaction'ında çağrılıyor, satır 1822, doğrulandı) ile GERÇEK `tx.claimItem.create()` yazımına dönüşüyor. Ayrıca genel `POST /claim-items/case/:caseId/add-expense`/`add-fee`/`add-attorney-fee` uçları da çalışır durumda (`claim-item.service.ts:598-658`) — yalnız case detay sayfasındaki `ClaimItemPanel` `readOnly` olduğu için (ALC-P0-3A2, `cases/[id]/page.tsx:2806-2809`) bu genel API'ye UI'dan POST-HOC erişilemiyor; DOSYA AÇILIŞINDA erişilebiliyor. **Sonuç: cost/vekalet ClaimItem coverage case'e göre DEĞİŞİR** (dosya açılışında fer'i/masraf alanları dolduruldu mu dolmadı mı) — gerçek oranı yalnız DB sorgusuyla ölçülebilir, bu turda ölçülmedi.
4. **Bulgu 3'ün sonucu: Seçenek (a) artık "kayıpsız" DEĞİL.** Cost/vekalet ClaimItem'ı GERÇEKTEN olan case'lerde (dosya açılışında dolduruldu), `toplamBorc`/`sonBorc`/`kalanBorc`'u kalıcı olarak legacy'ye sabitlemek gerçek canonical coverage kaybı olur — Seçenek (a) yalnızca "hiçbir case'te cost/vekalet verisi yok" varsayımı altında güvenliydi, bu varsayım artık geçersiz.
5. **Yeni, üçüncü seçenek (c) bulundu — mevcut veriyle, yeni backend contract'sız:** Frontend zaten `report.totals.diffs`'te (`COSTS_DELTA`/`ATTORNEY_FEE_DELTA`, `balance-display-shadow-diff.service.ts:336-354`) legacy-vs-canonical karşılaştırmasını ALIYOR — `classifyAmountDiff()` (`:83-145`) legacy≠0/canonical=0 durumunda güvenilir şekilde `severity:'RED'`/`status:'MAJOR_DELTA'` üretiyor (deltaPercent=-100%), legacy=canonical=0 durumunda `EXACT_MATCH`/`GREEN`. **Öneri**: `buildGuardedPrimaryCalculationResult()`'ta `toplamBorc`/`sonBorc`/`kalanBorc`'u override etmeden ÖNCE `report.totals.diffs`'te `COSTS_DELTA`/`ATTORNEY_FEE_DELTA` kodlarının `severity==='RED'` olup olmadığını kontrol et — RED ise (legacy nonzero, canonical muhtemelen data-gap-zero) bu 3 alanı case-bazlı legacy'de bırak; değilse (ikisi de gerçekten ~0 veya ikisi de tutarlı nonzero) canonical override'a devam et. **Bu seçenek ne yeni backend alanı/migration gerektirir (b'nin aksine) ne de cost/vekalet verisi olan case'lerde gereksiz coverage kaybeder (a'nın aksine)** — case-bazlı, mevcut veriyle, dar bir frontend-only değişiklik.

**Öneri (owner karar bekliyor, GÜNCELLENDİ): Seçenek (c) öncelikli aday**, (a) ve (b) hâlâ masada ama (c) daha üstün görünüyor: (a)'nın aksine cost/vekalet-doldurulmuş case'lerde canonical coverage kaybetmiyor; (b)'nin aksine yeni backend contract/migration gerektirmiyor, yalnız zaten API'de mevcut `report.totals.diffs` verisini okuyor. Riskler: RED-eşiği (`MINOR_DELTA_PERCENT`) legacy=canonical=küçük-ama-farklı-nonzero durumlarda yanlış sinyal verebilir mi (kenar durum, gerçek veriyle test edilmeli); DB'de gerçek prevalence ölçülmedi (bulgu 3) — (c) prevalence'tan bağımsız çalışsa da, owner (a)'yı hâlâ tercih ederse (basitlik için, coverage kaybını kabul ederek) bu da geçerli bir karardır.
Business Value: Guarded primary pilot flag'in gerçekten güvenle açılabilmesi için son, somut, ölçülmüş blocker'ın kapatılması — flag açılmadan önce avukatın gördüğü toplam borcun asla gerçek borcun altında olmaması garantisi, cost/vekalet verisi olan case'lerde canonical coverage kaybetmeden.
Technical Value: Seçenek (c): `buildGuardedPrimaryCalculationResult()`'a case-bazlı bir suppress-kontrolü eklenir (`report.totals.diffs.find(d => d.code==='COSTS_DELTA' || d.code==='ATTORNEY_FEE_DELTA')?.severity==='RED'` ise `toplamBorc`/`sonBorc`/`kalanBorc` override edilmez, `...legacy` korunur). Yeni backend alanı/migration/allocation-engine değişikliği YOK — yalnız zaten var olan `report.totals.diffs` okunuyor.
Priority: —
Depends On: ALC-AUTH-3D (MERGED — bu kayıt olmadan bu risk zaten görünür değildi çünkü guard hiç çalışmıyordu), ALC-AUTH-1A (B1 kapsam daraltması — cost/vekalet legacy-retained kararının kaynağı)
Unlock Condition: Owner GO-IMPLEMENT onayı — (a) dar-blanket-legacy, (b) yeni backend cost-coverage sinyali, (c) [ÖNERİLEN] mevcut COSTS_DELTA/ATTORNEY_FEE_DELTA severity'sine göre case-bazlı suppress.
Estimated Size: (a) XS, (b) S-M, (c) XS-S
Related Modules: guarded-primary-display.ts, case-balance-display.ts, case-balance.service.ts, balance-display-shadow-diff.service.ts
Status: **MERGED/CLOSED** — Seçenek (c) implement edildi ve merge edildi (2026-07-05). PR #929, commit SHA `dd5901e9` (asıl implementasyon) → güncel branch SHA `991c118c` (origin/main merge sonrası, PR #925 ile çakışma yok doğrulandı), squash merge SHA `d23003e8`. `guarded-primary-display.ts`'e `hasCostOrAttorneyFeeUnderstatementRisk(report)` eklendi — `report.totals.diffs`'te COSTS_DELTA/ATTORNEY_FEE_DELTA `severity==='RED'` ise `buildGuardedPrimaryCalculationResult()` `toplamBorc`/`sonBorc`/`kalanBorc`'u override etmiyor (`...legacy` korunuyor); diğer 5 canonical-override alan (asilAlacak/takipTutari/takipSonrasiFaiz/toplamTahsilat/kalanAnapara) etkilenmedi. Yeni backend alanı/migration/allocation-engine değişikliği YOK. 3 yeni test (COSTS_DELTA RED→suppress+diğer-5-etkilenmez, ATTORNEY_FEE_DELTA RED→aynı suppress, RED yok→mevcut tam-override korunur/regresyon yok). CI 4/4 PASS; `balance-shadow-display.test.tsx` 81/81 PASS (76 mevcut+3 yeni ALC-AUTH-3E+2 PR #925'ten); `tsc --noEmit` temiz. **Bilinen, kapsam-dışı kozmetik boşluk**: `buildGuardedSummaryRuntimeBoundaryPlan()` (statik/audit görünümü, `report` almıyor) hâlâ bu 3 alanı koşulsuz `CANONICAL_PRIMARY_OVERRIDE` olarak listeliyor — gerçek override davranışı doğru, yalnız diagnostic-plan görünümü case-bazlı inceliği yakalamıyor; güvenlik sorunu değil, ayrı bir kozmetik iyileştirme adayı. **B1/guarded-primary-pilot ekseninde owner'ın bildiği başka açık blocker kalmıyor** — flag rollout kararı (ayrı, ürün/Av. sign-off gerektiren bir konu) sıradaki gerçek karar noktası.
---

## ALC-AUTH-4A/4B/4C — Guarded Primary Pilot Sign-off, Rollout & Kill-Switch Governance (2026-07-05)

Owner kararı: B1 technical blocker zinciri (ALC-AUTH-3B/3C/3D/3E) kapandı, `NEXT_PUBLIC_GUARDED_PRIMARY_DISPLAY_PILOT` hâlâ varsayılan KAPALI. Flag'e dokunmadan önce üç ayrı governance/rollout maddesi açıldı: **ALC-AUTH-4A = FIRST/GO-ANALYZE**, **ALC-AUTH-4B = BACKLOG (depends on 4A)**, **ALC-AUTH-4C = BACKLOG (depends on 4A+4B)**. ⚠️ **İsim-alanı notu:** `master-triage-register.md` ACT-27/ACT-28 (principal gross/net split, Collection/LedgerEntry/LedgerAllocation üç-otorite reconciliation) daha önce "gerçek iş muhtemelen ALC-AUTH-4/5 olarak devam eder" diye tahmin etmişti — bu tahmin YANLIŞ ÇIKTI, "ALC-AUTH-4" numarası burada FARKLI bir konuya (sign-off/rollout/kill-switch) verildi. ACT-27/28'in kendi konusu hâlâ AÇIK ve numarasız; ileride ALC-AUTH-5 veya ayrı bir alt-numara alacak. Cross-reference notu ACT-27/28'e eklendi (bkz `master-triage-register.md`).

⚠️ **RECONCILE TAMAMLANDI (2026-07-05):** ALC-AUTH-4A'nın GO-ANALYZE bulguları, repo kökündeki (`project/` dışı) 8 dosyalık bağımsız `docs/audit/` guarded-primary rollout denetim setiyle (ayrı, issue#/CB-# numaralandırmalı, ALC-AUTH-* isim-alanından habersiz bir governance hattı) `docs/design/alc-auth-4a-display-authority-reconcile.md` belgesinde reconcile edildi. Sonuç: alt-satır (bottom-line) governance kararında çelişki YOK (her iki hat da NO-GO/CONDITIONAL-GO'da hemfikir); ALC-AUTH-4A'nın stop condition bulgusu (partial-canonical/partial-legacy misleading-display) 8 dosyanın HİÇBİRİNDE ele alınmamış, gerçek ve doldurulmamış bir boşluk olarak doğrulandı. Reconcile ayrıca 2 yeni, ALC-AUTH-4A-IMPL scope'u DIŞINDA tutulan madde açtı: **ALC-AUTH-3E-B-NEXT** (backend/display-adapter sınıflandırma sorusu) ve **ALC-AUTH-DOC-REFRESH** (docs/audit/ içinde 2 dosyanın artık stale olan "HesapOzetiPanel=saf legacy" önermesi, canlı risk yok).

ID: ALC-AUTH-4A
Title: UI / Avukat Sign-off Contract — guarded primary pilot enablement öncesi
Problem: Avukatın canonical primary display açılmadan önce ekranda neyi gördüğü, neyi kabul ettiği ve hangi durumda legacy fallback oluştuğu netleşmemişti. GO-ANALYZE (docs-only, kod değişikliği yok) repo kanıtıyla tamamlandı.
Business Value: Guarded primary pilot flag'in (4B/4C'den önce) avukata ne göstereceğinin, hangi rakamların hangi otoriteden geldiğinin ve sign-off'un hukuken neyi kapsayıp kapsamadığının net olması — yanlış-güven/yanlış-anlama riskinin flag açılmadan önce kapanması.
Technical Value: Repo kanıtı — birincil dosyalar `apps/web/src/lib/guarded-primary-display.ts` (karar/override mantığı), `apps/web/src/components/finance/HesapOzetiPanel.tsx:166-228,278-310` (fiili gösterim + tek banner), `apps/web/src/components/finance/BalanceShadowDiffPanel.tsx` (bağımsız audit-only shadow paneli), `apps/web/src/lib/config/feature-flags.ts:157-173` (iki bağımsız flag). Üç madde doğrulandı: (1) bugünkü fallback bildirimi YALNIZ ham kod (`"OUTSTANDING_DELTA, PAID_DELTA"`, `"ELIGIBLE"` vb.) — Türkçe/insan-okur çevirisi YOK, 81 test bu ham stringlere kilitli (`balance-shadow-display.test.tsx`). (2) `HesapOzetiPanel` (guarded banner) ve `BalanceShadowDiffPanel` (audit-only shadow) BAĞIMSIZ iki URL-param + flag çiftiyle açılıyor (`guardedPrimary=1` / `balanceShadow=1`) — biri açıkken diğeri kapalı olabilir. (3) **STOP CONDITION TESPİT EDİLDİ (misleading-display):** ALC-AUTH-3E'nin `hasCostOrAttorneyFeeUnderstatementRisk()` suppress'i tetiklendiğinde (`guarded-primary-display.ts:348-352,364-381`) `toplamBorc`/`sonBorc`/`kalanBorc` sessizce legacy'de kalıyor AMA `decision.reasonCodes` boş kalıyor ve banner "Guarded canonical primary candidate"/"ELIGIBLE" göstermeye devam ediyor (`evaluateGuardedPrimaryDisplayPilot`'ta suppress kontrolü hiç yok — yalnız `buildGuardedPrimaryCalculationResult`'ta) — panelin en öndeki 3 rakamı (`HesapOzetiPanel.tsx:278-310`, TOPLAM BORÇ/SON BORÇ/KALAN BORÇ) sessizce legacy iken banner "sorun yok" diyor. Bu senaryo `balance-shadow-display.test.tsx:556-635`'te DEĞER seviyesinde test edilmiş ama banner/UI metni hiç doğrulanmamış (grep-doğrulandı, sıfır assertion). Tam bulgu seti + UI copy taslağı + sign-off checklist + pilot kabul kriterleri bu oturumun GO-ANALYZE raporunda (chat, 2026-07-05).
Priority: HIGH
Depends On: ALC-AUTH-3D (MERGED, PR #922/#925), ALC-AUTH-3E (MERGED, PR #929)
Unlock Condition: —
Estimated Size: — (analiz tamamlandı; UI-copy/partial-state-fix implementasyonu ayrı, küçük bir GO-IMPLEMENT gerektirir)
Related Modules: guarded-primary-display.ts, HesapOzetiPanel.tsx, BalanceShadowDiffPanel.tsx, balance-shadow-display.ts, feature-flags.ts, balance-display-shadow-diff.types.ts
Status: **DONE — STOP CONDITION KAPANDI (2026-07-05, güncelleme).** GO-ANALYZE + reconcile tamamlandı (bkz `docs/design/alc-auth-4a-display-authority-reconcile.md`). Bu kayıt yazıldığında sıradaki adım "ALC-AUTH-4A-IMPL (henüz başlamadı)" olarak not edilmişti; **eşzamanlı, bağımsız bir oturumda bu tam eşdeğer** GO-IMPLEMENT PR #942 → squash SHA `50aa2e33` ile MERGED oldu: `hasCostOrAttorneyFeeUnderstatementRisk()` artık `evaluateGuardedPrimaryDisplayPilot()` içinde de çalışıyor, yeni `COST_ATTORNEY_FEE_SUPPRESSED` reasonCode tetiklendiğinde `primarySource` otomatik `LEGACY_CALCULATION_SUMMARY`'ye düşüyor — banner artık suppress varken "eligible" demiyor. 82/82 test PASS, kapsam bu kayıtta tarif edilenle birebir (yalnız `guarded-primary-display.ts` + `balance-shadow-display.test.tsx`, UI copy/rollout/flag açma dokunulmadı). **ALC-AUTH-4A-IMPL ayrı bir ek iş olarak AÇILMAYACAK — PR #942 onun yerini doldurdu.** Partial-canonical/partial-legacy misleading-display stop condition'ı KAPALI sayılır; ALC-AUTH-4B artık yalnız owner'ın GO-IMPLEMENT onayını bekliyor (bkz aşağıdaki güncellenmiş Unlock Condition).

ID: ALC-AUTH-4B
Title: Guarded Primary Pilot Rollout Plan
Problem: `NEXT_PUBLIC_GUARDED_PRIMARY_DISPLAY_PILOT` için kademeli rollout tanımı henüz yok — bugün flag ya tamamen kapalı ya da (env+URL-param ile) tek-case opt-in; tenant/kullanıcı bazlı kademeli açılış mekanizması yok.
Business Value: Flag güvenle, ölçülü ve geri-alınabilir şekilde genişletilebilir hale gelir.
Technical Value: Prior-art AYNI dosyada zaten var — `feature-flags.ts:21-82`'deki `UnifiedPreviewRolloutConfig` (killSwitch/rolloutPercent/tenantWhitelist/fallbackRateThreshold + `trackLegacyFallback()`/`getFallbackRate()`) ilgisiz bir özellik (Unified Preview) için zaten bu deseni uyguluyor. `guarded-primary-display.ts` bu makineye BAĞLI DEĞİL (grep doğrulandı) — 4B muhtemelen bu deseni adapte eder, sıfırdan icat etmez.
Priority: —
Depends On: ALC-AUTH-4A-IMPL (MERGED, PR #948), ALC-AUTH-4B-0 (DONE)
Unlock Condition: Owner GO-ANALYZE/GO-IMPLEMENT onayı sırayla ALC-AUTH-4B-IMPL için. (⚠️ Bu satır daha önce yalnız PR #942'yi referans veriyordu — DÜZELTİLDİ: ALC-AUTH-4A'nın stop-condition bulgusu partial-canonical/partial-legacy misleading-display, PR #942'nin ÜZERİNE PR #948 [ALC-AUTH-4A-IMPL] ile TAM kapandı, bkz yukarı. **Ayrıca bkz ALC-AUTH-6** — B1/guarded-primary flag'in genel rollout'u için ayrı, DAHA DERİN bir ön-koşul: legacy `getCalculationSummary()`'nin kendisi bazı alanlarda [faiz stub, harç hardcoded sabit] authority değil, bu yüzden "legacy==canonical eşleşti" tek başına cutover kanıtı sayılamaz. ALC-AUTH-4B/4B-IMPL bu satırda tanımlanan DAR kapsamı (URL-opt-in + tenant whitelist + locked pilot case set) aşmaz — ALC-AUTH-6'nın component-coverage/ground-truth harness'ı AYRI, bu kayıtların hiçbiriyle yetkilendirilmeyen bir iştir.)
Estimated Size: —
Related Modules: feature-flags.ts, guarded-primary-display.ts
Status: BACKLOG — ALC-AUTH-4A ekseni (GO-ANALYZE→RECONCILE[#938]→IMPL[#948]) TAM kapandı. ALC-AUTH-4B-0 (docs sync) DONE — bkz altta. ALC-AUTH-4B-IMPL (tenant whitelist + hibrit rollout) henüz GO-IMPLEMENT almadı. **ALC-AUTH-6 (ayrı, paralel oturum bulgusu) hâlâ açık ve B1'in genel rollout'u için owner'ın ayrıca değerlendirmesi gereken bir bulgu — bu docs-only turla ne çözüldü ne kapsandı.**

ID: ALC-AUTH-4B-0
Title: docs/audit rollout checklist + fixture design — ALC-AUTH-4A-IMPL (#948) senkronu + locked pilot case set
Problem: `docs/audit/GUARDED-PRIMARY-PILOT-ROLLOUT-CHECKLIST.md` §7.8/§9, PR #948'den (ALC-AUTH-4A-IMPL, `PARTIAL_CANONICAL_LEGACY_TOTALS`) ÖNCEki davranışı ("suppress → her zaman tam legacy") tarif ediyordu — artık yanlış. `PRIMARY-ELIGIBLE-FIXTURE-DESIGN.md`'nin "Option C ilk pilot için erken" hükmü de PR #948 sonrası geçersizleşti.
Business Value: Rollout checklist gerçek implementasyonun gerisinde kalırsa yanlış sistem doğrulanmış olur (aynı ders, `decision-log.md` 2026-07-05 "governance-drift'ten arındırıldı" kaydının tekrarı — bu kez #948 nedeniyle).
Technical Value: Docs-only. (1) §7.8 PR #948 davranışına göre yeniden yazıldı (partial-state + safe-default-preserved iki alt-senaryo). (2) Yeni §7A "Locked Pilot Case Set" eklendi (4 senaryo, owner-onaylı). (3) §9 rollback tetikleyicisi "ALC-AUTH-3E regression" → "authority-copy/etiket görünmezse rollback" olarak düzeltildi. (4) `PRIMARY-ELIGIBLE-FIXTURE-DESIGN.md`'ye §1.1 eki: Option C artık zorunlu pilot senaryosu.
Priority: HIGH
Depends On: ALC-AUTH-4A-IMPL (MERGED, PR #948)
Unlock Condition: —
Estimated Size: — (docs-only)
Related Modules: docs/audit/GUARDED-PRIMARY-PILOT-ROLLOUT-CHECKLIST.md, docs/audit/PRIMARY-ELIGIBLE-FIXTURE-DESIGN.md
Status: DONE — bu commit ile tamamlandı. Owner-onaylı 4 senaryo: (1) tam canonical eligible, (2) PARTIAL_CANONICAL_LEGACY_TOTALS, (3) tam legacy fallback, (4) cost/attorney risk + başka blocker birlikte.

ID: ALC-AUTH-4B-IMPL
Title: Hibrit rollout modeli — tenant whitelist + URL opt-in (percent rollout altyapısı, başlangıçta kapalı)
Problem: Kademeli, tenant-bazlı bir rollout mekanizması yok — bugün flag ya tüm tenant'lar için kapalı ya da (env+URL-param ile) herkese açık tek-case opt-in.
Business Value: Flag güvenle, ölçülü ve geri-alınabilir şekilde genişletilebilir hale gelir.
Technical Value: Owner-kilitli IN/OUT: IN = `shouldEnableGuardedPrimaryDisplayPilot(..., tenantId)` imza genişlemesi, tenant whitelist, URL opt-in KORUNUR (kaldırılmaz), percent-rollout altyapısı varsa default 0/disabled, testler. OUT = production default-on, percent rollout'u aktif başlatma, runtime kill-switch (ALC-AUTH-4C), telemetry (ALC-AUTH-4C), backend authority logic, `CLAIM_ITEM_COLLECTED_AMOUNT_NOT_AUTHORITY` (ALC-AUTH-3E-B-NEXT). Prior-art: `feature-flags.ts:21-82`'deki `UnifiedPreviewRolloutConfig` deseni adapte edilebilir.
Priority: —
Depends On: ALC-AUTH-4B-0 (DONE)
Unlock Condition: Owner GO-ANALYZE, sonra ayrı GO-IMPLEMENT onayı
Estimated Size: — (analiz henüz yapılmadı)
Related Modules: feature-flags.ts, guarded-primary-display.ts, cases/[id]/page.tsx
Status: BACKLOG — ALC-AUTH-4B-0 tamamlanmadan başlamaz (artık tamamlandı, başlayabilir; owner GO-ANALYZE bekliyor).

ID: ALC-AUTH-4C
Title: Controlled Enablement / Kill-Switch Governance
Problem: Runtime enablement, kill-switch, telemetry, rollback ve decision-log kuralları tanımlı değil.
Business Value: Pilot genişledikçe hızlı ve güvenli geri-dönüş garantisi.
Technical Value: `guarded-primary-display.ts` bugün `trackLegacyFallback()`/`trackUnifiedSuccess()`'a (yalnız `usePreviewCoordinator.ts`'te kullanılan, ilgisiz Unified Preview telemetrisi) HİÇ bağlı değil (grep doğrulandı) — guarded-primary için telemetri sıfırdan bağlanmalı. Flag bugün yalnız env-var (redeploy gerektirir) + URL-param; DB-backed/runtime instant kill-switch yok.
Priority: —
Depends On: ALC-AUTH-4A, ALC-AUTH-4B
Unlock Condition: ALC-AUTH-4B tamamlanması
Estimated Size: —
Related Modules: feature-flags.ts
Status: BACKLOG — ALC-AUTH-4A+4B kapanmadan başlamaz.

ID: ALC-AUTH-3E-B-NEXT
Title: Primary Eligible Fixture Preconditions — Contamination vs Guardrail Classification
Problem: `docs/audit/PRIMARY-ELIGIBLE-FIXTURE-DESIGN.md` (§3/§4/§11 Risk 1) bulgusu — display adapter `CLAIM_ITEM_COLLECTED_AMOUNT_NOT_AUTHORITY` diagnostic'ini HER ZAMAN genel bir bilgi/guardrail sinyali olarak üretiyor ve mevcut shadow-readiness bunu blocker listesine taşıyor. Bu, gerçek veriyle `safeForPrimaryDisplay=true` elde etmeyi YAPISAL olarak imkânsız kılabilir — sorun veri eksikliği değil, sinyalin "gerçek contamination" ile "genel bilgilendirici uyarı" arasında ayrılmamış olması.
Business Value: Guarded pilot'un gerçek dev/prod verisiyle hiç `safeForPrimaryDisplay=true` üretemediği bir kör noktanın önceden tespit edilip kapatılması.
Technical Value: Kod değişikliği bu kayıtla YAPILMAZ — yalnız sınıflandırma kararı (gerçek contamination ile genel guardrail'i ayıran bir kural/alan gerekip gerekmediği) owner GO-ANALYZE'ı bekliyor. `ALC-AUTH-4A-IMPL`'in (UI copy/authority visibility) scope'undan KASITLI olarak AYRIDIR — biri backend/display-adapter sınıflandırması, diğeri frontend UI transparency'sidir.
Priority: —
Depends On: — (ALC-AUTH-4A-IMPL'i beklemez, bağımsız)
Unlock Condition: Owner GO-ANALYZE onayı
Estimated Size: — (analiz)
Related Modules: case-balance-display.ts (toCaseBalanceDisplay), balance-display-shadow-diff.service.ts
Status: BACKLOG — `alc-auth-4a-display-authority-reconcile.md` Bölüm 9'da retroaktif kayda geçirildi, henüz GO-ANALYZE verilmedi.

ID: ALC-AUTH-DOC-REFRESH
Title: docs/audit/ governance drift düzeltmesi — "HesapOzetiPanel = saf legacy" önermesi stale
Problem: `docs/audit/DISPLAY-AUTHORITY-AUDIT.md` ve `docs/audit/OVERPAYMENT-DISPLAY-WORDING-SIGNOFF.md`, "`HesapOzetiPanel` legacy `calculation-summary`'de kalıyor, değiştirilmedi" önermesini taşıyor — ALC-AUTH-3B/3D/3E (bağımsız hat) `guarded-primary-display.ts`'i `HesapOzetiPanel.tsx:166-172`'ye fiilen bağladığından beri bu önerme artık doğru değil.
Business Value: Doğrulama artefaktı gerçek implementasyonun gerisinde kalırsa yanlış sistem doğrulanmış olur (aynı ders, `decision-log.md`'nin 2026-07-05 "Guarded primary rollout dokümanları governance-drift'ten arındırıldı" kaydında zaten bir kez uygulanmıştı — bu kez sıra bu 2 dosyada).
Technical Value: Docs-only, dar kapsamlı düzeltme — yalnız "HesapOzetiPanel artık guarded-primary aktifken canonical/kısmi-canonical de gösterebiliyor" notu eklenir. Canlı risk YOK (overpayment senaryoları zaten guarded-eligible kapsamı dışında tutuluyor, `GUARDED-PRIMARY-CUTOVER-SCOPE-FREEZE.md` §6 — CB-05/CB-06 wording kurallarının pratik geçerliliği bozulmuyor).
Priority: LOW
Depends On: —
Unlock Condition: Owner GO-IMPLEMENT onayı (docs-only, düşük risk)
Estimated Size: XS
Related Modules: docs/audit/DISPLAY-AUTHORITY-AUDIT.md, docs/audit/OVERPAYMENT-DISPLAY-WORDING-SIGNOFF.md
Status: BACKLOG — düşük öncelik, canlı risk yok.

## ALC-AUTH-6 — Canonical Hesap Özeti Component Coverage / Ground Truth Harness (2026-07-05, GO-ANALYZE + GO-IMPLEMENT)

ID: ALC-AUTH-6
Title: Canonical Hesap Özeti Component Coverage / Ground Truth Harness
Problem: İlk taramada (tek-ajan Explore araması) 15 bileşenlik UYAP-tarzı Hesap Özeti'nin ("Senet, Takip Öncesi Faiz, Takip Tutarı, Başvurma/Vekalet/Peşin Harcı, Dosya Gideri, Tebligat Gideri, Vekalet Pulu, İcra Masrafları, Peşin Harç Dahil/Hariç Tahsil Harcı, Vekalet Ücreti, Takip Sonrası Faiz, Toplam/Son Borç, Tahsil Harcı Oranlarına Göre Senaryo Tablosu") canonical (ClaimItem/TBK100 tabanlı) modelde büyük kısmının hiç bulunmadığı sonucuna varılmıştı. Spot-check (repo taraması, `case.service.ts:getCalculationSummary()` + `fee-engine` modülü) bu sonucu **düzeltti**: legacy `getCalculationSummary()` (bugünkü fiili `HesapOzetiPanel` DTO kaynağı) 15+1 bileşenin TAMAMINI isimli alan olarak zaten taşıyor. Ancak "alan var" ile "alan otoriter/doğru" AYNI ŞEY DEĞİL — legacy'nin kendisi bazı alanlarda authority değil: `takipOncesiFaiz`/`takipSonrasiFaiz` hardcoded `0` (STUB, kod içi TODO: "interest-engine entegrasyonu tamamlandığında aktif edilecek" — docstring "Faiz: interest-engine" der ama kod bunu yapmıyor), harç kalemleri (`basvurmaHarci`/`vekaletHarci`/`dosyaGideri`/`tebligatGideri`/`vekaletPulu`) hardcoded sabitler (738.50/105.00/50.00/252×borçlu/165.60) — docstring "Masraf/harç: fee-engine" der ama bu metod ayrı, bağlı-olmayan `fee-engine`/`tariff.service.ts` modüllerini hiç çağırmıyor. Buna karşılık `pesinHarcDahil/HaricTahsilHarci` ve 5 satırlı `tahsilOranlari` senaryo tablosu (0/2.27/4.55/9.10/11.38 — gerçek İİK oranları) gerçek formülle hesaplanıyor. Canonical taraf ise tersine: faiz gerçek/TBK100-tabanlı ama harç/tahsil-oranı granülerliği SIFIR (ALC-AUTH-1A'nın kasıtlı kapsam daraltması + ALC-AUTH-3E'nin suppress-yerine-model-etmeme kararı).
Business Value: B1 (guarded primary display) rollout kararının, kendisi de kısmen yanlış/stub olan bir legacy referansla "eşleşme" kontrolüne dayanmasını önler — sahte-pozitif cutover-readiness riskini (legacy'nin faiz stub'ı `0` olduğu için canonical düşük çıksa bile "eşleşti" görünebilmesi) governance seviyesinde kapatır.
Technical Value: **Ana bulgu — legacy calculation-summary component-complete ama authority-complete DEĞİL; canonical bazı hesaplamalarda (özellikle faiz/TBK100) authority-güçlü ama UYAP-uyumlu Hesap Özeti component-complete DEĞİL. Bu yüzden legacy calculation-summary, B1 canonical cutover doğrulaması için golden reference olarak KULLANILAMAZ.** B1 doğrulaması üçüncü, bağımsız bir zemin gerektirir: UYAP-tarzı gerçek Hesap Özeti örnekleri, güncel statüter tarife formülleri, kontrollü icra-dosyası fixture'ları. Önerilen `ComponentCoverageReport` tasarımı — her satırda: `component`, `legacyValue`, `legacySource`, `canonicalValue`, `canonicalSource`, `groundTruthValue`, `groundTruthSource`, `coverageStatus`, `risk`, `notes`. `coverageStatus` enum'u basit MODELED/PROXY/MISSING DEĞİL, granüler olmalı: `CANONICAL_COVERED | STATUTORY_FORMULA_COVERED | MANUAL_ENTRY_COVERED | LEGACY_ONLY | STUB | HARDCODED_CONSTANT | AGGREGATE_ONLY | MISSING | UNVERIFIED`. **Bir bileşen sadece DTO'da alan olarak bulunduğu için "COVERED" sayılmaz** — modelli olmalı, doğru kaynak/provenance'a sahip olmalı, güncel statüter formül veya canonical veriyle beslenmeli, ground truth'a karşı doğrulanmış olmalı. Golden-file harness en az bir gerçek/kontrollü dosya için legacy/canonical/ground-truth üçlüsünü satır satır kaydetmeli; false-negative ölçümü legacy==canonical eşleşmesini tek başına yeterli SAYMAMALI.
Priority: HIGH
Depends On: ALC-AUTH-1A (MERGED, PR #914 — canonical kapsam daraltması), ALC-AUTH-3E (MERGED, PR #929 — suppress kararı), ALC-AUTH-4A (DONE — PR #942, bkz yukarı)
Unlock Condition: Owner GO-IMPLEMENT onayı — **VERİLDİ (2026-07-05), bkz Status.**
Estimated Size: M (tamamlandı — 4 dosya, 1045 satır, 23 test)
Related Modules: case.service.ts (getCalculationSummary, buildCalculationSummaryCanonicalShadow), fee-engine.service.ts, tariff.service.ts, case-balance-display.ts, `project/apps/api/src/modules/hesap-ozeti-coverage/` (YENİ modül — component-coverage.types.ts, component-coverage.analyzer.ts, fixtures/ornek-icra-dosyasi-2026.ts, __tests__/component-coverage.analyzer.spec.ts)
Status: **GO-ANALYZE DONE + GO-IMPLEMENT DONE (2026-07-05, owner onaylı).** PR #952 → squash SHA `7b222c50` MERGED: `project/apps/api/src/modules/hesap-ozeti-coverage/` altında bağımsız, NestJS DI'ye bağlanmayan saf TS modülü — `ComponentCoverageStatus` (9 değer) + 19 Hesap Özeti bileşeni için kod-doğrulanmış sınıflandırma, `buildComponentCoverageReport()` saf fonksiyonu, 1 ground-truth fixture (statüter kaynaklı, teyitsiz kalemler PLACEHOLDER işaretli), 23 golden-file testi (23/23 PASS). Adversarial-verify turunda bulunan gerçek bir bulgu (faiz satırlarında `canonicalValue===0` iken koşulsuz `CANONICAL_COVERED` üretilmesi — motorun gerçekten mi çalıştığı yoksa sessizce mi başarısız olduğu ayırt edilemezken) bu PR'da düzeltildi: bu durum artık `UNVERIFIED`'a düşer ve `b1ReadinessBlocked` sinyaline dahildir. Kapsam tam olarak onaylanan sınırlar içinde kaldı — kod/schema/migration/flag-açma/rollout/ClaimItem-materialization/payment-reconciliation YOK, hiçbir mevcut dosya değişmedi (yalnız 4 yeni dosya). **B1 flag varsayılan KAPALI kalmaya devam eder.** Rapor artık çalıştırılabilir/test edilebilir durumda ama HİÇBİR canlı endpoint/UI'ya bağlanmadı — bu kasıtlı (onaylanan kapsam "wiring" içermiyordu); B1 rollout kararı için bu raporun gerçek dev-DB case verisiyle çalıştırılması ayrı, sonraki bir adımdır. Bu, ALC-AUTH-4A'nın (PR #942, MERGED) kapanışını GERİ ALMAZ — 4A kendi dar kapsamında (banner/reasonCodes mismatch) tamdır; ALC-AUTH-6 ondan sonraki, daha derin bir doğrulama katmanıdır.
---

## Product Architecture Control (PAC)

ID: PAC-001-A
Title: Authority Maps for ADR-013 Fee / Harç / Snapshot / Journal line
Problem: GOV-ADR-NAMING-000 resolved the ADR-012 collision by reserving ADR-013 for the future Fee / Harç / Snapshot / Journal architecture line, but ADR-013 implementation would still cross calculation, fee, projection, persistence, presentation and external-adapter responsibilities. Without a pre-implementation authority map, fee fixes can accidentally introduce presentation formulas, projection duplication, persistence decisions, or snapshot/journal scope creep.
Business Value: Keeps fee/harç implementation auditable and legally bounded by making every calculation-like producer declare its authority before code PRs start.
Technical Value: Records AS-IS authority evidence plus six authority classes, forbidden-edge audit candidates, duplicate-formula taxonomy and candidate ADR-013 gate map. This prevents unclassified calculation owners while avoiding premature final producer ownership or PR-sequence decisions; CCB-001/CAN-CUT-02 separation is preserved.
Priority: CRITICAL
Depends On: GOV-ADR-NAMING-000 CLOSED/MERGED; CCB-001 release-blocker track closure; ADR-013 reserved as canonical Fee / Harç / Snapshot / Journal target.
Unlock Condition: Owner GO-IMPLEMENT PAC-001-A AUTHORITY MAPS — docs-only. ADR-013 implementation remains blocked until PAC-001-A is merged and the later ADR-013 Boundary Audit gate is separately authorized/closed.
Estimated Size: M docs-only
Related Modules: `project/docs/design/pac-001-a-authority-maps.md`, `project/docs/governance/architecture-index.md`, `project/docs/governance/decision-log.md`; classification anchors include interest-engine, case-balance, fee-engine, tariff, expense-request, accounting-journal, calc-preview diagnostics, report/template/UI and external adapter surfaces.
Status: **CLOSED / MERGED / CANONICAL_MAIN_INCLUDED (2026-07-10)**. PR #1024, merge SHA `281befe70acbe585c2a1bb7640533e17e7c19a8d`, CI 4/4 SUCCESS. Source: `project/docs/design/pac-001-a-authority-maps.md`. This is an AS-IS evidence map and audit rubric, not an owner-approved final producer map or PR sequence. ADR-013 evidence delta is reconciled and accepted as official owner-review input. It does not start PAC-Full, ADR-013 Boundary Audit, fee implementation, peşin harç code, TariffService/FeeEngine refactor, snapshot/journal spec, projection layer, UI/report adapter changes, tests, schema, migration or runtime behavior.

---

## Architecture Decision Preparation — ADR-014 Scenario Infrastructure

ID: ADR-014-SCENARIO-INFRA
Title: ADR-014 Scenario Infrastructure — ortak scenario contract + hybrid materializer + diagnostic dual-mode (owner-arbitrated design preparation)
Master Register State (2026-07-11): **CLOSED / CANONICAL**
ADR-014 PR-1B Governance State (2026-07-11): **CLOSED / CANONICAL**
PR-1B Closure State: **VALID LINKED FULL PAYMENT + REVERSAL = NET-ZERO / CANONICAL; LEDGER PROVENANCE = PRESERVED; MALFORMED REVERSAL = FAIL-CLOSED / CANONICAL; PRODUCTION CANCELLATION DB GATE = PASS / CANONICAL**
ADR-014 PR-2 Governance State (2026-07-11): **CLOSED / CANONICAL**
PR-2 Closure State: **PAYMENT-EFFECT NO_BUCKETS = FATAL / UNAVAILABLE / UNSAFE_FOR_PRIMARY_DISPLAY; DISPLAY/EVIDENCE BLOCKER = LOSSLESS; NORMAL BUCKET + PR-1B REVERSAL BEHAVIOR = PRESERVED**
ADR-014 PR-3h Governance State (2026-07-11): **CLOSED / CANONICAL**
PR-3h Closure State: **ALLOCATIONENGINE COMPONENT MATH = CENT-NORMALIZED; NEGATIVE DIRECT PAYMENT = FAIL-CLOSED; TBK100 CORE ORDER = UNCHANGED; DUPLICATE ALLOCATOR DISPOSITION = NOT INCLUDED**
ADR-014 PR-4 Governance State (2026-07-11): **CLOSED / CANONICAL**
PR-4 Closure State: **FUTURE INTEREST BASE REDUCES ONLY BY PRINCIPAL-ALLOCATED AMOUNT; COST/ANCILLARY/INTEREST-ONLY PAYMENT DOES NOT MUTATE PRINCIPAL; MULTI-PERIOD CONTINUITY + CENT BOUNDARY = CANONICAL**
ADR-014 PR-5 Governance State (2026-07-11): **CLOSED / CANONICAL**
PR-5 Closure State: **CASE.CASEDATE = ENFORCEMENT BOUNDARY; VARIABLE/FIXED PRE+POST = TOTAL IN CENTS; START/END-OF-DAY + PRINCIPAL-ONLY FUTURE-BASE MUTATION = PRESERVED**
ADR-014 PR-6 Governance State (2026-07-11): **CLOSED / CANONICAL**
PR-6 Closure State: **SUPPORTED CURRENCIES = INDEPENDENT GROUPS; MISSING/UNSUPPORTED + PAYMENT/REVERSAL MISMATCH = FAIL-CLOSED; CROSS-CURRENCY CONVERSION/AGGREGATION = NONE**
ADR-014 PR-7 Governance State (2026-07-11): **CLOSED / CANONICAL**
PR-7 Closure State: **PERSISTED CLAIMITEM PROJECTION = PER-CURRENCY SOURCE DTO; MISSING/INVALID/MISMATCH/BLOCKER = NULL + FAIL-CLOSED; ZERO FALLBACK/CROSS-CURRENCY TOTAL = NONE; FEE POLICY/AUTHORITY = OWNER-GATED**
ADR-014 PR-8a Governance State (2026-07-11): **CLOSED / CANONICAL**
PR-8a Closure State: **SNAPSHOT-READINESS BLOCKER COVERAGE = 5/5; DISPLAY/AUTHORITY/READINESS CONSISTENCY = FAIL-CLOSED; OFFICIAL SNAPSHOT = NONE**
ADR-014 PR-8b Governance State (2026-07-11): **CLOSED / CANONICAL**
PR-8b Closure State: **DETERMINISTIC ALLOCATION/INTEREST TRACE = NON-AUTHORITATIVE; SNAPSHOT DTO = NON-OFFICIAL / EPHEMERAL; PERSISTENCE/HASH/LIFECYCLE AUTHORITY = NONE**
Classification: **Architecture Decision Preparation** — teknik borç DEĞİL, bug DEĞİL, maintenance DEĞİL, verification DEĞİL. Bu, ADR-014 canonical calculation cutover'ının doğrulanmasını mümkün kılacak test/diagnostic altyapısının owner-arbitre edilmiş tasarım hazırlık kararıdır.
Current Status (2026-07-11 — authoritative; aşağıdaki tarihsel PR-1A paragrafının yalnız PR-1B/known-defect next-disposition'ını supersede eder): **PR-1B CLOSED / IMPLEMENTATION CANONICAL.** PR #1089 (branch commit `816554ee619d24aff938525f9759c1c4655d081d`; squash `61cfc2b03a819616ad168b889ff9b3e4ac4963a7`; CI 4/4 SUCCESS; exact 7 technical/CI files), production `CaseBalanceService` read yolunda CONFIRMED PAYMENT + REVERSAL'ı yalnız `reversesLedgerEntryId` ile eşler. Aynı tenant/case/currency bağlamındaki exact-opposite **valid matched full reversal** bağlı PAYMENT'ın hukuki ödeme etkisini sıfırlar; net-sıfır `LEDGER` provenance'ını korur ve Collection fallback'e düşmez. **KNOWN REVERSAL-NETTING DEFECT: FIXED FOR VALID MATCHED FULL REVERSALS ONLY.** Bu kapanış partial reversal/refund desteği, inferred matching, tarihsel repair/backfill veya tüm olası reversal kusurlarının çözüldüğü anlamına gelmez. Eksik/unknown ilişki, tenant/case/currency uyumsuzluğu, yanlış işaret/tutar ve duplicate cancellation mevcut `REVERSAL_INTEGRITY_INVALID` fatal/unavailable yoluyla **FAIL-CLOSED / CANONICAL** kalır. Gerçek disposable-Postgres production-path acceptance gate'i `CollectionService.create()` → `CollectionService.cancel()` → `CaseBalance` zincirinde exact ilişki/tutar/para birimi, mirrored allocation, tenant isolation, duplicate cancellation ve transaction rollback kanıtını **PASS / CANONICAL** yapmıştır; materializer evidence tek başına production fidelity sayılmaz. Production cancellation writer değişmedi; schema/migration/endpoint/public API shape/UI/governance authority/yeni hukuki formül yoktur. **PR-1A CLOSED / CHARACTERIZATION CANONICAL; W0.2/W0.3 CLOSED / UNCHANGED.** PR #1071/#1076 bağlayıcıdır; PR #1082/#1084 tarihsel PR-1A kapanışı olarak korunur; PR #1073 CLOSED/UNMERGED/SUPERSEDED kalır. **Runtime cutover NOT AUTHORIZED**; fee/FX/snapshot/trace, accounting-authority cutover ve sonraki ADR-014 split-plan halkaları ayrı owner gate'lerine tabidir. Teknik branch/worktree registry cleanup complete; residual fiziksel orphan non-blocking olarak MR-029/MR-002 altında izlenir.

PR-2 Current Status (2026-07-11 — authoritative): **CLOSED / NO_BUCKETS FAIL-CLOSED CANONICAL.** PR #1104 (head `372146a5c4710310e2972084e7b21b97ac953e09`; squash `11023234457e57bdad108b0fb753a9892389ee4c`; CI 4/4 SUCCESS; exact 6 orchestration/display/evidence test files), payment etkisi bulunan fakat hesaplanabilir bucket'ı olmayan currency grubunun mevcut `result: null / skippedReason: NO_BUCKETS` kanıtını korur ve case-level tekil `NO_BUCKETS` fatal blocker ekler. Display savunmacı olarak `UNAVAILABLE / UNSAFE_FOR_PRIMARY_DISPLAY` kalır; typed blocker ve sıralı currency nedeni scenario evidence'a kayıpsız taşınır. Normal bucket davranışı, valid linked full reversal net-zero, malformed reversal fail-closed, tenant isolation, duplicate cancellation ve transaction rollback regresyonları PASS. Collection writer, ledger provenance, schema/migration, backfill/historical repair, TBK100, fee/FX/snapshot/trace, API/UI consumer switch, financial authority ve runtime cutover değişmedi. Teknik git-side cleanup complete; fiziksel orphan non-blocking olarak MR-032/MR-002 altında izlenir. **NEXT ELIGIBLE: PR-3h; runtime cutover NOT AUTHORIZED.**

PR-3h Current Status (2026-07-11 — authoritative): **CLOSED / TBK100 CENT-HARDENING CANONICAL.** Existing PR #1101 old base'ten canonical `ac8611ea159b6438f02f15ebb55784853d78ff4b` üzerine rebased edildi (head `336d33baae17ce997e64616d27d6ef8051e5166a`; squash `566ae47a26e505a79ba8867b3c21c5f724c3b1ef`; CI 4/4 SUCCESS; exact 4 technical/test/reporting files). `AllocationEngineService.allocateSinglePayment()` COST/ANCILLARY/INTEREST/PRINCIPAL component math'i mevcut `minor-unit.ts` cents boundary'sini kullanır; negatif direct payment normalize öncesi `E_ALLOCATION_OVERFLOW` ile reddedilir. MASRAF → FER'İ → FAİZ → ANAPARA sırası değişmedi; SummaryEngine'deki iki stale comment gerçek davranışla hizalandı. Duplicate allocator disposition/unification, PR-4 interest-base mutation, Collection writer, schema/migration, fee/FX/snapshot/trace, API/UI switch ve financial authority kapsama alınmadı. PR-2 NO_BUCKETS ve PR-1B reversal regressions PASS. Teknik git-side cleanup complete; fiziksel orphan non-blocking olarak MR-033/MR-002 altında izlenir. **NEXT ELIGIBLE: PR-4; runtime cutover NOT AUTHORIZED.**

PR-4 Current Status (2026-07-11 — authoritative): **CLOSED / PARTIAL-PAYMENT INTEREST-BASE CANONICAL.** PR #1109 updated canonical `c9759a1f9b39ef1a438490917a1087c221d27221` tabanında (head `4ffc283cbf78875e99ce4196ef41a30614769523`; squash `77a4ca353cbbc7687deb44d9eb794a3df511967c`; CI 4/4 SUCCESS; exact 3 technical/test files), payment-bearing `computeBalance()` akışını payment boundary'lerde sequential faiz tahakkukuna bağlar. Existing TBK100 allocation sonrasında yalnız PRINCIPAL'a fiilen giden cent-exact tutar sonraki dönemin faiz matrahını azaltır; masraf/fer'i/faiz-only payment principal'i değiştirmez. START_OF_DAY/END_OF_DAY ve date+id determinism korunur. PR-3h cent/negative guard, PR-2 NO_BUCKETS, PR-1B reversal/ledger provenance ve tenant isolation regresyonları PASS. Collection writer, schema/migration/backfill, fee/FX/snapshot/trace, allocator disposition, API/UI consumer switch, financial authority ve runtime cutover değişmedi. Teknik git-side cleanup complete; fiziksel orphan non-blocking olarak MR-034/MR-002 altında izlenir. **NEXT ELIGIBLE: PR-5 enforcement-date / pre-post interest; runtime cutover NOT AUTHORIZED.**

PR-5 Current Status (2026-07-11 — authoritative): **CLOSED / ENFORCEMENT-DATE PRE/POST INTEREST CANONICAL.** PR #1113 updated canonical `79eecd1362b9aa3dd311171a97f700e8f48dc1a9` tabanında (head `058cfe05cc8e267d76a7e433e73a47992638372f`; squash `6df5560bbab79a1314c41aadd412b6497d1f23af`; CI 4/4 SUCCESS; exact 8 technical/test-support files), tenant-scoped `Case.caseDate` değerini existing `CalculationRequest.enforcementDate` boundary'sine taşır. Variable-rate ve fixed-rate periods `[start, end)` kuralıyla PRE/POST ayrılır; TOTAL_ONLY dust deterministically POST'a taşınarak phase totals total interest'e cent-exact mutabık kalır. Enforcement öncesi/aynı gün/sonrası payment existing START_OF_DAY/END_OF_DAY ve date+id policy'lerini, yalnız PRINCIPAL allocation'ın future base'i azaltması kuralını korur. PR-4/PR-3h/PR-2/PR-1B ve tenant isolation regresyonları PASS. Collection writer, schema/migration/backfill, fee/harç, FX, snapshot/trace, allocator disposition, API/UI consumer switch, financial authority ve runtime cutover değişmedi. Teknik git-side cleanup complete; fiziksel orphan non-blocking olarak MR-035/MR-002 altında izlenir. **NEXT ELIGIBLE: PR-6 currency-aware foreign claim engine; runtime cutover NOT AUTHORIZED.**

PR-6 Current Status (2026-07-11 — authoritative): **CLOSED / CURRENCY-ISOLATION FAIL-CLOSED CANONICAL.** PR #1118 updated canonical `e06f956dd07ae6045591b66c6e8a69cf4f738dd9` tabanında (head `2ed6b1eccbd4170d44b7d9e56648c9e81b3a5d1b`; squash `371a6552717f6bc01ba4084450e45b5a4986cb1e`; CI 4/4 SUCCESS; exact 8 engine/orchestration/evidence/test files), canonical TRY/USD/EUR/GBP/CHF domain guard'ını grouping ve display katmanında tek kaynaktan kullanır. Eligible gruplar ayrı `computeBalance` çağrılarına gider; missing/unsupported currency hesaplanmaz; payment-only currency mismatch `NO_BUCKETS + CURRENCY_MISMATCH`, linked reversal mismatch ise PR-1B fatal netting + typed evidence blocker olarak taşınır. Multi-currency top-level totals kullanılabilir authority üretmez; normalization/conversion/fallback yapılmaz. PR-5 PRE/POST, PR-4 interest-base mutation, PR-3h cent normalization, PR-2 `NO_BUCKETS`, PR-1B reversal ve tenant isolation regressions PASS. Collection writer, schema/migration/backfill, fee/harç, FX/rate authority, conversion policy, snapshot/trace, allocator disposition, API/UI consumer switch, financial authority ve runtime cutover değişmedi. Teknik git-side cleanup complete; fiziksel orphan non-blocking olarak MR-036/MR-002 altında izlenir. **NEXT ELIGIBLE: PR-7 Fee Projection Layer; runtime cutover NOT AUTHORIZED.**

PR-7 Current Status (2026-07-11 — authoritative): **CLOSED / FEE-PROJECTION PLUMBING FAIL-CLOSED CANONICAL.** PR #1120 updated canonical `20d7b64257f660c33969fd07f32c57455b2185eb` tabanında (head `842425b74a96424bea7c8cfecc5a18ccdde771ee`; squash `a3bfb26b719fe9dbf7cd9f197305ed7709867b5e`; CI 4/4 SUCCESS; exact 11 assembler/orchestration/display/evidence/test-support files), tenant/case-scoped persisted ClaimItem cost/ancillary projection evidence'ını source item, kategori, exact currency ve cent-normalized amount ile typed `CaseBalanceFeeProjection` DTO'suna taşır. Source yoksa `NOT_CALCULATED`, invalid/missing/unsupported/mismatch veya legal-balance blocker varsa `UNAVAILABLE`; satır ve toplam `null`, sessiz `0` yoktur. Currency grupları bağımsızdır; multi-currency top total ve conversion yoktur. Projection `SOURCE_PROJECTION_ONLY`, fee policy `OWNER_GATED`; legal balance totals/status/authority ve PR-6/PR-5/PR-4/PR-3h/PR-2/PR-1B davranışları değişmedi. Fee/harç formula/policy, new authority, FeeEngine/tariff source, schema/migration/backfill, official snapshot/persistence, Collection writer, API/UI switch ve runtime cutover yoktur. Teknik git-side cleanup complete; fiziksel orphan non-blocking olarak MR-037/MR-002 altında izlenir. **NEXT ELIGIBLE: PR-8a Snapshot blocker/authority consistency hardening; runtime cutover NOT AUTHORIZED.**

PR-8b Current Status (2026-07-11 — authoritative): **CLOSED / NON-OFFICIAL EXPLAINABILITY TRACE CANONICAL.** PR #1128 updated canonical `07ee172b29645e8639256f062ac4cce119f2b714` tabanında (head `136a0100aad22817cb67062083c26b13ea249e44`; squash `995333a77aba63ad8c3b093d714ba6c529f13485`; CI 4/4 SUCCESS; exact 8 orchestration/display/evidence/test files), canonical allocation/interest result evidence'ını deterministic currency-first/canonical-result order ile non-authoritative trace'e taşır. Principal/interest/cost/ancillary/fee-projection sources remain separate. Additive display snapshot DTO'su `NON_OFFICIAL / authority=NONE / persisted=false`; ID/hash/lifecycle authority yoktur. PR-8a readiness/blocker listesi, `snapshotAvailable=false`, legal totals, display authority ve primary eligibility değişmedi. Official snapshot persistence, schema/migration/backfill, writer, consumer switch, new financial authority ve runtime cutover yoktur. Technical branch/worktree cleanup complete; yeni fiziksel orphan oluşmadı. **NEXT ELIGIBLE: PR-9 Golden Fixture Matrix; runtime cutover NOT AUTHORIZED. MR-038 OPEN / NON-BLOCKING ve değişmedi.**
Problem: Golden fixture matrix (in-memory, saf `engine.computeBalance`) ile DB-gated readiness diagnostic (`diagnostic-cutover-readiness.ts`, organik Prisma state) yalnız `engine.computeBalance` seviyesinde buluşuyor; ortak scenario tanımı ve materialization katmanı yok. Diagnostic çalışıyor ama kontrollü senaryo ile beslenemiyor (ADR-014 Readiness Evidence Run, 2026-07-10: disposable Docker Postgres'te empty-DB koşumu → yalnız `SCRIPT_OPERABILITY_EVIDENCE`; mevcut seed'ler kanonik `ClaimItem`/risk-fixture üretmiyor, HARD STOP doğru uygulandı). Denetim boşluğu dört katmana ayrıştırdı: (1) scenario definition, (2) domain fixture builder (kopyalı `makeBalance` ×4), (3) DB materializer/persistence adapter, (4) diagnostic runner'ın organik DB'ye aşırı bağımlılığı.
Business Value: ADR-014 cutover'ın HIGH riskleri (PR-4 interest-base mutation, PR-8 snapshot 5 blocker'dan 2'sini kapsıyor, PR-6 FX, authority/snapshot sinyal tutarsızlığı) bugün yalnız statik-analiz/unit kanıta dayanıyor (`PRODUCTION_EVIDENCE` sütunu boş). Bu altyapı, o riskleri DB-gated kanıta taşıyacak tek yol; onsuz split-PR'lar doğrulanamaz.
Technical Value: Owner-arbitre tasarım — üç sınır: (1) SAF domain scenario contract (Prisma/Nest bağımsız), (2) contract'ı TÜKETEN ama SAHİPLENMEYEN persistence materializer, (3) organik-readiness + synthetic-scenario iki modlu diagnostic runner (seam arkasına alınmış PrismaClient). Kanıtla desteklenmiş minimal kapsam — Scenario Platform DEĞİL.
Priority: HIGH (ADR-014 split-PR doğrulamasının önkoşul-enabler'ı; ADR-014 normatif PR dizisinin PARÇASI değil, test-tooling)
Depends On: Diagnostic Readiness Architecture Audit (COMPLETE, 2026-07-10); Scenario Infrastructure Design GO-ANALYZE (COMPLETE, 2026-07-10); ADR-014 (`docs/adr/ADR-014-CCB-001-CANONICAL-LEGAL-CALCULATION-CORE.md`, LOCKED direction).
Wave 0 Acceptance Criteria: `project/docs/design/adr-014-wave0-acceptance-criteria.md` — canonical governance contract pointer; normative criteria are not duplicated in backlog.
Unlock Condition: **CLOSED / SATISFIED.** Wave 0 Acceptance Criteria, Master Register closures, W0.1/W0.2/W0.3, Conditional Option B, PR-1A, PR-1B, PR-2, PR-3h, PR-4, PR-5, PR-6, PR-7, PR-8a ve PR-8b canonical main'e dahil edilmiştir. Bu scenario-infra kaydı yeniden açılmaz; sıradaki unresolved ADR-014 teknik dilimi PR-9'dur ve kendi closure sırasını izler.
Estimated Size: M (minimal dilim; platform DEĞİL)
Related Modules: `project/apps/api/scripts/diagnostic-cutover-readiness.ts`, `.../interest-engine/orchestration/__tests__/ccb001-golden-legal-fixture-matrix.spec.ts`, interest-engine domain tipleri (`ClaimBucket`/`Payment`/`CalculationRequest`), case-balance orchestration; materializer hedef modelleri Case/ClaimItem/Collection/LedgerEntry.

**POST-PR-10 CURRENT-STATUS OVERRIDE (2026-07-12):** Aşağıdaki uzun `Status` paragrafı W0 uygulamasının tarihsel teslim kaydı olarak korunur; içindeki `W0 IMPLEMENTATION IN PROGRESS` ve `sıradaki PR-1A/PR-1B` ifadeleri current status değildir. Güncel authoritative durum: **W0.1/W0.2/W0.3 ve PR-1A/PR-1B/PR-2/PR-3h/PR-4/PR-5/PR-6/PR-7/PR-8a/PR-8b/PR-9/PR-10 CLOSED / CANONICAL. PR-10 typed/additive compatibility adapter'dır; consumer switch veya authority promotion değildir. Next eligible step owner-gated `UNASSIGNED` cutover-authorization governance decision; PR-11 ve runtime cutover NOT AUTHORIZED.** **Cutover-authorization governance policy (split-plan §12 seq 11 decision record) DEFINED / CANONICAL** — `docs/design/adr-014-cutover-authorization-policy.md`: PR-11 scope = Hesap Özeti UI/API switch only (UYAP → CAN-CUT-01/PR-A4/PR-A5, independently gated); synthetic evidence SATISFIED ama representative evidence ABSENT/BLOCKING ve operational thresholds `OWNER TO SET BEFORE PR-11`. Policy DEFINED olması PR-11'i açmaz; PR-11 authorization NOT `APPROVED`, runtime cutover NOT AUTHORIZED. **Cutover OWNER DECISIONS (policy §9, 2026-07-12): DEFINED / CANONICAL** — 15 karar: representative evidence env SELECTED IN PRINCIPLE (sanitized-prod-copy-on-staging + read-only-prod-shadow) NOT YET AVAILABLE; dataset = mandatory edge-case set + representative sample (case/tenant minimums portföyden türetilir); pilot phased owner→internal→allowlist (default exposure 0); triple activation gate (server flag + backend allowlist + explicit pilot gate); financial discrepancy 0-cent tolerance + stop-on-any-unexplained; latency p95≤20%/p99≤30% + 0 material error/timeout, baseline-required; smoke 3 gün/500 istek/≥2 tenant; bake PR-11 14 gün, PR-12 ≥30 gün, PR-14 owner-set ≥PR-12; kill-switch (emergency dual-approval YOK, deploy-free, audited); rollback ≤5dk (hard financial/security auto, performance manual); reactivation new owner GO; legal sign-off owner/legal + refresh-on-semantic-change; pre-evidence work = DOCS/MONITORING PREPARATION ONLY. "Decisions defined" ≠ "cutover approved"; authorization measured-baseline + representative-evidence + explicit owner APPROVED gerektirir. **LOCAL EVIDENCE RECONCILIATION (policy §10, 2026-07-12): DEFINED / CANONICAL** — binding owner decision evidence env'i **LOCAL owner PC / ofis, gerçek dosya verisi doğrudan**, harici aktarım YOK, masking/sanitization önkoşul DEĞİL olarak sabitler; §9.1/§9.2/§9.15/§2'deki sanitized-copy/staging/KVKK-pipeline framing'i SUPERSEDE eder (eski metin tarih için korunur, SYS-EVID-006). "no production environment" meta-blocker'ı ADR-014 için düşer; kalan yol local+teknik. Anayasal çelişki yok (sayısal+opak-ID çıktı SYS-AUTH-012/EVID-005'i, read-only SYS-AUTH-011'i karşılar). Kalan gate = measured local baseline + local representative evidence + explicit owner APPROVED. Sonraki enablement adımı (ayrı): local read-only baseline + shadow evidence runner (read-only, consumer-switch değil). PR-11 ve runtime cutover NOT AUTHORIZED.
Status: **OWNER ARBITRATED (2026-07-10) / W0 IMPLEMENTATION IN PROGRESS (2026-07-10)** — tasarım kararı sabitlendi; **W0.1 MERGED** (PR #1037, squash SHA `f998af79`: saf `ScenarioDefinition` contract + shared builder `scenario-support/` + tek main-`makeBalance` adoption + statik saflık guard'ı; CI 4/4 PASS, runtime davranış değişmedi, daraltılmış owner-onaylı kapsam — branch-porting ve geniş helper konsolidasyonu bilinçli dışarıda). **W0.2 MERGED** (PR #1050, squash SHA `a4167f35`: hybrid materializer `scenario-materializer/` + G4/§13 statik guard + DB-gated integration spec; v1.2 iskele revizyonu uygulandı — Prisma-direct iskele, G1–G6 gate'leri disposable `hukuk_w02_gate` üzerinde 4/4 PASS, Conditional-B REVERSAL `writePathNote=WRITE_PATH_NOT_EXERCISED`, runtime davranış değişmedi); **W0.3 MERGED** (PR #1058, squash SHA `31eb84d3`: `scenario-diagnostic/` dual-mode runner + SAF evidence katmanı — SYNTHETIC: contract→materializer→gerçek `computeCaseBalance`→`toCaseBalanceDisplay`→expected-vs-actual; ORGANIC: tenant-scoped tarama, `excludeCaseIds` yalnız organik modda; §8'in beş evidence sınıfı dışında YENİ sınıf yok; §12 karşılaştırıcı hesaplamaz; DB-gated 3/3 disposable `hukuk_w03_gate`, W0.2 regresyonu 4/4, runtime davranış değişmedi; characterization: mevcut main display authority'si OK durumunda her zaman `SHADOW_ONLY` — `CANONICAL_CANDIDATE` ataması cutover PR-11/12'nin işi). **Wave 0 (W0.1+W0.2+W0.3) TAMAMLANDI** — sıradaki: PR-1A/PR-1B ayrı owner GO bekler. **ONAYLANDI:** (a) *Domain Scenario Contract* — saf, persistence-bağımsız; (b) *Minimal Domain Builder* — kopyalı `makeBalance` ×4 tek builder'a konsolide; (c) *Hybrid Materializer* — **BAĞLAYICI ŞART: akış `Scenario Definition → Materializer → DB`; ASLA `Materializer → Scenario` değil — materializer domain owner DEĞİLDİR, contract'ı yalnız tüketir.** Hybrid, kanıtla zorunlu: `ClaimItemService.create` `demandedAmount`/`originalAmount` yazmaz (B1) ve REVERSAL'ın bağımsız API'si yoktur (yalnız `CollectionService.cancel()` yan-etkisi, C) — bu yüzden saf-servis yaklaşımı risk senaryolarının tam kümesini üretemez; **iskele (Tenant/Client/Debtor/Case/CaseDebtor) — v1.2 owner arbitration (2026-07-10, Hard Stop → RESOLVED BY OWNER DECISION) ile REVİZE: materializer içinde Prisma-direct kurulur, G1–G6 acceptance gate'leri bağlayıcı (bkz. `adr-014-split-pr-plan.md` v1.2 §3; ground-truth: CaseService 10-bağımlılık/elle kurulamaz, gerçek servisler Conditional-B'nin kaçındığı event/outbox/audit yan-etkilerini getirir, repo DB-gated emsali zaten Prisma-direct)**; ClaimItem üç-tutar + LedgerEntry PAYMENT/REVERSAL dedicated materializer, Prisma yalnız adapter içi; (d) *Diagnostic Dual Mode* — organik-readiness DEĞİŞMEZ + synthetic-scenario yeni mod, `QA_SEED_CASE_IDS` dışlaması yalnız organik modda; (e) *Evidence Model* — aynı scenario id'sinin unit ve DB-gated koşumları `expected-vs-actual` karşılaştırılır. **ERTELENDİ:** *Registry* (düz typed liste yeter; merkezî registry ancak ikinci bounded context gelince) ve *Platformlaştırma* — **ADR-014 bir Scenario Platform İSTEMİYOR.** **REVERSAL — RESOLVED / CONDITIONAL OPTION B (owner arbitration, 2026-07-10):** Wave 0 materializer REVERSAL'ı **direct-write** üretir (deterministik fixture setup, yalnız test/disposable DB, production runtime'dan erişilemez; tenant/case/collection/original-payment ilişkileri zorunlu; `reversalOfPaymentId` açık ilişki; timeline/journal TAKLİT EDİLMEZ, yoksa evidence'ta `WRITE_PATH_NOT_EXERCISED`). **GUARDRAIL: Materializer PASS ≠ production cancel path PASS** — materializer sonucu cancellation fidelity kanıtı sayılmaz. Gerçek `CollectionService.cancel()` write-path'i AYRI bir DB-gated integration test'iyle doğrulanır (PAYMENT_RECEIVED → CASH_RECEIPT → cancel() → REVERSAL ledger → net balance) ve **PR-1B acceptance gate'inin zorunlu parçasıdır** (materializer fixture PASS tek başına yetmez — bkz. `adr-014-split-pr-plan.md` v1.2 §11 + PR-1B gate). **Kapsam sınırı (anti-bloat):** ADR-013'e ertelenen = fee/harç/snapshot-journal fixture'ları; genel test-platforma ertelenen = registry + balance-dışı domain materializer'ları + ikinci diagnostic wiring. Bu kayıt hiçbir ADR-014 normatif kuralını/invariant'ını değiştirmez.

**GOVERNANCE RECONCILIATION (2026-07-10, owner decision — bağlayıcı, nihai):** Aşağıdaki satırda (PR #1066 kaynaklı, "Superseding W0.2/W0.3 remediation register") kayıtlı "PR #1050 frozen-decision violation'dı; W0.2/W0.3 NOT CLOSED" anlatısı **REDDEDİLMİŞTİR**. Bu Status alanındaki Conditional Option B kararı, **PR #1050 (W0.2) ve PR #1058/#1059 (W0.3) kapanışları CANONICAL ve GEÇERLİ** olarak teyit edilmiştir; **W0.2/W0.3 yeniden açılmamıştır.** PR #1063'ün getirdiği transaction-atomicity/duplicate-rejection/rollback-tenant-isolation kanıtı + açık CI hardening'i (A grubu) **geçerli teknik katkı olarak KORUNUR.** PR #1063'ün REVERSAL yüzeyini kaldırması (B grubu) owner'ın gerçek kararıyla **uyumsuzdu** — bu, Conditional Option B'yi bozmadan, PR #1063'ün hardening mimarisi İÇİNDE dar bir REVERSAL restoration ile ayrı bir teknik remediation GO-COMPLETE'i gerektirdi. Bu paragraf `decision-log.md`'nin aynı tarihli "ADR-014 GOVERNANCE RECONCILIATION — OWNER DECISION" kaydına karşılık gelir.

**TEKNİK REMEDIATION TAMAMLANDI (2026-07-10):** PR #1076, squash SHA `a9afedfc` — `MaterializeReversalIntent` + opt-in `reversals` + `reversalLedgerEntryIds` + `writePathNote` PR #1063'ün transaction/deterministic-id mimarisi İÇİNDE (bozmadan) geri eklendi; REVERSAL yazımı aynı `materializeInTransaction` callback'i içinde `tx.*` ile yapılır; `reversesLedgerEntryId` zorunlu (G1, bulunamazsa in-transaction throw + tam rollback); cleanup REVERSAL'ı önce siler (self-FK Restrict). Concurrent bulgu: hazırlık sırasında ayrı, ilgisiz bir WIP (`codex/adr014-w03-ratification-hardening`) PR #1072 olarak merge oldu (W0.3 diagnostic SETUP/CALCULATION/OBSERVATION/CLEANUP hata-toparlama hardening, `ScenarioDiagnosticFailure`) — REVERSAL'a dokunmuyordu; PR #1076 bu yeni yapıya rebase edilip #1072'nin hardening'i korunarak tamamlandı, WIP branch'ine hiç dokunulmadı. Doğrulama: prod typecheck temiz; statik guard 30/30 (REVERSAL-yokluğu guard'ı kaldırıldı — önkoşulu owner kararıyla geçersizdi; transaction-callback assertion'ı yeni `(tx, def, opts)` imzasına güncellendi); W0.2 DB-gated **7/7** (5 payment-only regresyon + 2 yeni REVERSAL testi); W0.3 DB-gated 5/5 (değişmeden); golden-scenarios+case-balance+orchestration regresyonu 96/96; CI 4/4 SUCCESS. Payment-only davranış DEĞİŞMEDİ (reversals opt-in, default yok). **GUARDRAIL korunuyor:** Materializer PASS ≠ gerçek tahsilat-iptal write-path PASS (PR-1B ayrı gate). **ADR-014 GOVERNANCE INTEGRITY REPAIR + REVERSAL RESTORATION zinciri FULLY CLOSED.**

**PR #1056 DISPOSITION (2026-07-11): CLOSED WITHOUT MERGE — superseded/conflicting.** Taze ground-truth: PR #1056 branch commit `96a52844`nin tüm teknik içeriği (transaction/deterministic-id/duplicate-rejection hardening) zaten PR #1063 ile main'e girmişti ve bugün de duruyor; PR #1056'nın kendi governance eklentileri (`v1.3`, `AUTHORIZATION_AND_TECHNICAL_SCOPE_VIOLATION`) yukarıdaki owner reconciliation'da (PR #1071) açıkça reddedilen anlatıdır — canonical split-plan hâlâ `v1.2`. Merge edilmedi; kapsamlı gerekçeli yorumla CLOSED yapıldı; branch/worktree cleanup tamamlandı (fiziksel orphan → **MR-027**). PR-1A (MERGED/CLOSED, PR #1082/#1084) ve PR-1B (MERGED, PR #1089) bu işlemden etkilenmedi.

**PR-1A MASTER REGISTER CLOSURE (2026-07-11 — güncel authoritative durum):** **PR-1A CLOSED / CHARACTERIZATION CANONICAL.** PR #1082 (branch commit `c71af6c95ceb982d0c231f54efca26e84316724c`; squash `00ea01f95003c8a8cb8342c7797e6642ec2209d7`) yalnız `.github/workflows/ci.yml` ile `project/apps/api/src/modules/interest-engine/orchestration/__tests__/case-balance.service.spec.ts` dosyalarını değiştirdi ve production `CaseBalanceService` read yolunda eşleşen PAYMENT+REVERSAL çiftinin bugün netlenmediğini kalıcı karakterizasyon olarak kaydetti. **KNOWN DEFECT: OPEN / NOT FIXED** — testin geçmesi netting düzeltmesi, gerçek `CollectionService.cancel()` write-path kanıtı veya production cancellation fidelity anlamına gelmez. Kanıt: CI 4/4 SUCCESS; CaseBalance 13/13; yeni characterization PASS/executed; payment mapper 10/10; W0.2 static 4/4; W0.2 disposable DB 7/7; PR #1076 opt-in REVERSAL evidence PASS; production typecheck PASS; teknik cleanup COMPLETE. Runtime/API/UI/schema/migration/authority/legal-formula değişikliği yoktur. W0.2/W0.3 CLOSED kalır; PR #1071/#1076 bağlayıcıdır; PR #1073 CLOSED/UNMERGED/SUPERSEDED kalır. Yukarıdaki önceki "Sıradaki: PR-1A/PR-1B" ifadesinin güncel disposition'ı budur: **sıradaki owner-gated ADR-014 işi yalnız PR-1B** — production netting düzeltmesi ve gerçek cancellation-path disposable DB gate; ayrı owner GO olmadan başlamaz. Runtime cutover yetkilendirilmemiştir.

Master Register Closure — ADR-014 Wave 0 Acceptance Criteria: **MERGED / CANONICAL_MAIN_INCLUDED / REGISTER_CLOSURE_PREPARED (2026-07-10)**. PR `#1042`; branch commit `f56eed97c177c0ed47c8078fa8be3792e49beec0`; squash merge SHA `bc7a2e731a5179083beec0e8d68df9c89d6309ca`; CI **4/4 SUCCESS** (Architectural Guardrails, Test Suite, Web Tests (vitest), Client Workspace Live Smoke). PR changed files exactly: `project/docs/design/adr-014-wave0-acceptance-criteria.md`, `project/docs/governance/architecture-index.md`, `project/docs/governance/product-backlog.md`, `project/docs/governance/decision-log.md`. Runtime impact: **none**; source, test, Prisma/schema, migration, runtime wiring and authority changes: **none**. PR closure canonical main was `bc7a2e731a5179083beec0e8d68df9c89d6309ca`; current verification main is `06ef066f2814ac405d2d4c0b7739b61c10df630e` and contains that merge. Remote/local branch and isolated worktree cleanup: **complete**; `.codex/`: **untouched**. Hard Stop Triggered: **NO**. Frozen Decisions Violated: **NO**. Next eligible work after this register-closure patch is merged: owner-authorized **ADR-014 W0.2 Hybrid Materializer**. Blocked work: W0.2/W0.3/PR-1A/PR-1B remain blocked until this register closure is merged and the owner issues the applicable separate explicit GO; CCB runtime cutover remains blocked by its later gates. This bookkeeping record does not authorize implementation and does not duplicate the normative criteria in the canonical contract.

**[SUPERSEDED BY OWNER RECONCILIATION, 2026-07-10 — bkz. yukarıdaki "GOVERNANCE RECONCILIATION" paragrafı ve `decision-log.md`'nin aynı tarihli kaydı. Bu paragrafın "frozen-decision violation" ve "W0.2/W0.3 NOT CLOSED" iddiaları owner tarafından REDDEDİLMİŞTİR; Conditional Option B / PR #1050 / W0.2 / W0.3 kapanışları CANONICAL'dır. Aşağıdaki metin yalnız TARİHSEL KAYIT olarak korunur, artık canonical anlatı DEĞİLDİR. PR #1063'ün transaction/duplicate/rollback/isolation/CI hardening kazanımları (A grubu) ayrıca değerlendirilip geçerli teknik katkı olarak korunmuştur; REVERSAL kaldırması (B grubu) ise ayrı bir teknik remediation ile telafi edilmektedir.]** ~~Superseding W0.2/W0.3 remediation register (2026-07-10):~~ PR #1050's direct-write REVERSAL surface was a frozen-decision violation; PR #1058 created W0.3 contract drift by depending on it. PR #1063 (`a31f3915` branch commit; squash `0bd078032d7fd02d7dfb917b799bcefd0542e111`; CI **4/4 SUCCESS**) restores the canonical **PAYMENT-only** W0.2 contract while preserving W0.3 diagnostic/evidence behavior. No REVERSAL materialization, `reversesLedgerEntryId`, reversal option forwarding, `fileNumberPrefix` materializer forwarding, cancel simulation, runtime/API/UI/schema/migration, or authority change remains in the W0.2/W0.3 seam. Validation: W0.2 static 5/5, W0.3 static 4/4, evidence 6/6, W0.2 disposable DB 5/5, W0.3 disposable DB 3/3, production type-check PASS. ~~**Status: TECHNICAL_REMEDIATION_MERGED / GOVERNANCE_REGISTER_CLOSURE_PENDING.** Historical Conditional-B and Wave 0 completion language above is superseded for W0.2/W0.3 only. W0.2/W0.3, PR-1A, PR-1B, and runtime cutover remain **NOT CLOSED / owner-gated**; this register record does not grant a new implementation authorization.~~

---

## ADR-014 Split-PR Baseline Execution Plan

ID: ADR-014-SPLIT-PR-PLAN
Title: ADR-014 Canonical Legal Calculation Core — post-PR-10 split-PR yürütme planı (owner-approved v2.10)
Classification: **Execution Plan / Release Plan** — analiz DEĞİL, teknik borç DEĞİL. ADR-014 implementasyonunu küçük, doğrulanabilir, en düşük riskli PR'lara bölen program-yönetimi artefaktı. Uygulama ekipleri için referans plan.
Problem: ADR-014 cutover'ının implementasyonu 15 normatif PR adımı (PR-0..PR-14) + `ADR-014-SCENARIO-INFRA` enabler'ı içeriyor; branch `961bbaf3` bu işi 72 dosya/+6623 satırda topluca taşıyor ama wholesale merge NO-GO (GO-ANALYZE). Yapılandırılmış bir yürütme planı olmadan hangi PR'ın hangi kanıtla merge edilebileceği belirsiz kalır ve "CI geçti, merge edelim" refleksi risk taşır.
Business Value: "Done ≠ Mergeable" ayrımını her PR için Acceptance Gate ile sabitler; production-görünür/geri-dönüşü-zor değişiklikleri (Owner Gate REQUIRED) otomatik-gate'lilerden ayırır; gereksiz onay trafiğini azaltır; anti-bloat sınırıyla cutover hattının platform projesine dönüşmesini engeller.
Technical Value: Wave 0 (verification capability enabler) → Wave 1 (core hardening) → Wave 2 (fee/trace/snapshot + ✗ fix) → Wave 3 (cutover) yapısı; hazırlık-bağımlılığı vs merge/verification-bağımlılığı ayrımı; her PR için Acceptance Gate + Evidence Source + Owner Gate; dalga-bazlı rollback; seri/paralel yürütme kuralları; ADR-014/ADR-013/PAC-001-A disposition sınırları.
Priority: HIGH (implementasyonun referans yol haritası)
Depends On: `ADR-014-SCENARIO-INFRA` (CLOSED/CANONICAL); PR-1A (CLOSED); PR-1B (CLOSED); PR-2 (CLOSED); PR-3h (CLOSED); PR-4 (CLOSED); PR-5 (CLOSED); PR-6 (CLOSED); PR-7 (CLOSED); PR-8a (CLOSED); PR-8b (CLOSED); PR-9 (CLOSED); PR-10 (CLOSED); ADR-014 (LOCKED).
Unlock Condition: PR-10 technical + governance closure sonrası sıradaki uygun adım owner-gated **`UNASSIGNED` cutover-authorization governance decision**'dır. Bu kararın governance policy record'u `docs/design/adr-014-cutover-authorization-policy.md` olarak **DEFINED / CANONICAL**'dir; ancak policy DEFINED olması authorization `APPROVED` anlamına gelmez (representative evidence ABSENT/BLOCKING + operational thresholds unset). PR-11 consumer switch bu karar `APPROVED` olmadan yetkili değildir. Mandatory canonical merge/closure sırası korunur.
Estimated Size: S docs-only (plan belgesi)
Related Modules: `project/docs/design/adr-014-split-pr-plan.md` (kanonik plan belgesi), `docs/adr/ADR-014-CCB-001-CANONICAL-LEGAL-CALCULATION-CORE.md`, `product-backlog.md` `ID: ADR-014-SCENARIO-INFRA`/`ID: CCB-001`.
Status: **APPROVED / POST-PR-10 BASELINE EXECUTION PLAN v2.10 / DIRECT_RESCUE_MERGE_NO_GO / RESCUE_SOURCE_ONLY (2026-07-12).** W0.1/W0.2/W0.3, Conditional Option B ve PR-1A..PR-10 CLOSED/CANONICAL. Canonical merge, governance closure ve downstream eligibility mandatory sıra izler; paralellik yalnız analiz/hazırlık/branch geliştirmesidir. İlk unresolved adım owner-gated `UNASSIGNED` cutover-authorization governance decision'dır. Fee/harç formula/policy, official persistence, new FX/conversion authority ve duplicate allocator disposition owner-held kalır. Runtime cutover NOT AUTHORIZED; PR-11/PR-12/PR-14 owner-gated; cutover-auth, PR11-stability, PR12-bake, post-cutover verification ve final ADR closure owner ID atayana kadar `UNASSIGNED` kalır. Ayrıntılı current chain `project/docs/design/adr-014-split-pr-plan.md` §12'dedir.

**Master Register Reconciliation Closure (2026-07-11):** Baseline `bda6339893a00d03b4788cc889814e3ef356c003`; PR #1098; initial content commit `0ec54ce7`. Scope yalnız ADR-014 constitution, split-plan, Architecture Index, Product Backlog, Decision Log ve Maintenance Register'dır. Runtime/source/test/schema/migration/API/UI/database/financial-authority etkisi yoktur. Next eligible technical task: PR-2 `NO_BUCKETS` fail-closed. ALC-AUTH-4B/4B-IMPL/4C açık kanıt ve rollout kayıtları olarak korunur, fakat CCB-001 PR-10/11 cutover hattına tabidir; bağımsız/rakip cutover authority değildir ve bu reconciliation ile kapatılmaz.

**PR-2 Master Register Closure (2026-07-11):** Technical baseline `4610b205e5bc8ac6c2d4d8b2402df70a6e740af5`; PR #1104; head `372146a5c4710310e2972084e7b21b97ac953e09`; squash `11023234457e57bdad108b0fb753a9892389ee4c`; CI 4/4 SUCCESS; mergeStateStatus CLEAN. Exact six-file technical scope and separate six-file docs/governance closure preserve Collection writer/reversal/schema/API/UI/financial-authority boundaries. PR-2 technical and governance states are CLOSED/CANONICAL; next eligible technical task is PR-3h. Runtime cutover remains NOT AUTHORIZED.

**PR-3h Master Register Closure (2026-07-11):** Technical baseline `ac8611ea159b6438f02f15ebb55784853d78ff4b`; PR #1101; rebased head `336d33baae17ce997e64616d27d6ef8051e5166a`; squash `566ae47a26e505a79ba8867b3c21c5f724c3b1ef`; CI 4/4 SUCCESS; mergeStateStatus CLEAN. Exact four-file technical scope and separate six-file docs/governance closure preserve duplicate-allocator, PR-4, writer, schema/API/UI, and financial-authority boundaries. PR-3h technical and governance states are CLOSED/CANONICAL; next eligible technical task is PR-4. Runtime cutover remains NOT AUTHORIZED.

**PR-4 Master Register Closure (2026-07-11):** Initial owner baseline `13a0fdefd24744109772515360f9e1e9c9f75bca`; updated technical base `c9759a1f9b39ef1a438490917a1087c221d27221`; PR #1109; head `4ffc283cbf78875e99ce4196ef41a30614769523`; squash `77a4ca353cbbc7687deb44d9eb794a3df511967c`; CI 4/4 SUCCESS; mergeStateStatus CLEAN. Exact three-file technical scope and separate six-file docs/governance closure preserve PR-3h/PR-2/PR-1B behavior, Collection writer, schema/API/UI and financial-authority boundaries. PR-4 technical and governance states are CLOSED/CANONICAL; next eligible technical task is PR-5. Runtime cutover remains NOT AUTHORIZED.

**PR-5 Master Register Closure (2026-07-11):** Initial owner baseline `dcad4e378c99193bb954a81941302d1427bf4a0d`; updated technical base `79eecd1362b9aa3dd311171a97f700e8f48dc1a9`; PR #1113; head `058cfe05cc8e267d76a7e433e73a47992638372f`; squash `6df5560bbab79a1314c41aadd412b6497d1f23af`; CI 4/4 SUCCESS; mergeStateStatus CLEAN. Exact eight-file technical scope and separate six-file docs/governance closure preserve PR-4/PR-3h/PR-2/PR-1B behavior, tenant isolation, Collection writer, schema/API/UI and financial-authority boundaries. PR-5 technical and governance states are CLOSED/CANONICAL; next eligible technical task is PR-6. Runtime cutover remains NOT AUTHORIZED.

**PR-6 Master Register Closure (2026-07-11):** Initial owner baseline `32d76863738e5d36a378c6477f84e542932cc1a2`; updated technical base `e06f956dd07ae6045591b66c6e8a69cf4f738dd9`; PR #1118; head `2ed6b1eccbd4170d44b7d9e56648c9e81b3a5d1b`; squash `371a6552717f6bc01ba4084450e45b5a4986cb1e`; CI 4/4 SUCCESS; mergeStateStatus CLEAN. Exact eight-file technical scope and separate six-file docs/governance closure preserve PR-5/PR-4/PR-3h/PR-2/PR-1B behavior, tenant isolation, Collection writer, schema/API/UI and financial-authority boundaries. Missing/unsupported and payment/reversal currency mismatch are fail-closed; no cross-currency conversion/aggregation or new FX/rate authority exists. PR-6 technical and governance states are CLOSED/CANONICAL; next eligible technical task is PR-7. Runtime cutover remains NOT AUTHORIZED.

**PR-7 Master Register Closure (2026-07-11):** Initial owner baseline `6793eb736bb06f3246b4e476e7bc8e8b967e19a3`; updated technical base `20d7b64257f660c33969fd07f32c57455b2185eb`; PR #1120; head `842425b74a96424bea7c8cfecc5a18ccdde771ee`; squash `a3bfb26b719fe9dbf7cd9f197305ed7709867b5e`; CI 4/4 SUCCESS; mergeStateStatus CLEAN. Exact eleven-file technical scope and separate six-file docs/governance closure preserve PR-6/PR-5/PR-4/PR-3h/PR-2/PR-1B behavior, tenant isolation, legal totals/display authority, Collection writer, schema/API/UI and financial-authority boundaries. Persisted ClaimItem projection is typed/per-currency/fail-closed; missing data is never zero, cross-currency total/conversion does not exist, fee/harç policy/formula and official persistence remain owner-gated. PR-7 technical and governance states are CLOSED/CANONICAL; next eligible technical task is PR-8a. Runtime cutover remains NOT AUTHORIZED.

**PR-8a Master Register Closure (2026-07-11):** Initial owner baseline `61ac1da2fc5f4a1a21a89b4db6a7ad24d9e7b279`; updated technical base `40f95b5934714e3f10472097379c9915d153a379`; PR #1125; head `1ce46b3bedc5c0a5ca7da777a6f6c1e9e4ab0615`; squash `ce40d98a47fcf77431468275a993e4f2a0255276`; CI 4/4 SUCCESS; mergeStateStatus CLEAN. Exact eight-file technical scope and separate six-file docs/governance closure preserve PR-7/PR-6/PR-5/PR-4/PR-3h/PR-2/PR-1B behavior, tenant isolation, Collection writer, schema/API/UI and financial-authority boundaries. Five canonical readiness blocker classes are deterministic and typed; display/authority/snapshot/evidence signals are fail-closed, while blocker-free behavior remains `SHADOW_ONLY` with `snapshotAvailable=false`. Official snapshot persistence/hash/lifecycle, trace layer, new authority and runtime cutover remain excluded. PR-8a technical and governance states are CLOSED/CANONICAL; next eligible technical task is PR-8b. Runtime cutover remains NOT AUTHORIZED.

**PR-8b Master Register Closure (2026-07-11):** Initial owner baseline `c7ea67f92cdeefc58451f6e669f11b8035676d93`; updated technical base `07ee172b29645e8639256f062ac4cce119f2b714`; PR #1128; head `136a0100aad22817cb67062083c26b13ea249e44`; squash `995333a77aba63ad8c3b093d714ba6c529f13485`; CI 4/4 SUCCESS; mergeStateStatus CLEAN. Exact eight-file technical scope and separate five-file docs/governance closure preserve PR-8a/PR-7/PR-6/PR-5/PR-4/PR-3h/PR-2/PR-1B behavior, tenant isolation, legal totals/display authority, Collection writer, schema and financial-authority boundaries. Deterministic trace and non-official snapshot carry only existing calculation/display evidence with `authority=NONE / persisted=false`; official snapshot availability remains false and blockers stay visible. The additive `/balance/display` contract does not switch consumers. Official persistence/hash/lifecycle, schema/migration, writer, new authority and runtime cutover remain excluded. PR-8b technical and governance states are CLOSED/CANONICAL; next eligible technical task is PR-9. MR-038 remains OPEN/NON-BLOCKING. Runtime cutover remains NOT AUTHORIZED.

**PR-9 Master Register Closure (2026-07-11):** Initial owner baseline `8a07bb7c09d738b28eb3bddc258ba973f63f8ead`; final technical base `e06a5e0a6f4d3eb2f2d81b8cac4d1352b4ff6ee5`; PR #1132; head `7269098d4e515535b42342a2867ac57228a36416`; squash `6ca5b6333abdc288bb6001e794230501fb1178f6`; CI 4/4 SUCCESS; mergeStateStatus CLEAN. Exact ten-file technical scope and separate five-file docs/governance closure preserve PR-8b/PR-8a/PR-7/PR-6/PR-5/PR-4/PR-3h/PR-2/PR-1B behavior, tenant isolation, Collection writer, schema/API/UI and financial-authority boundaries. The existing Wave 0 contract drives 12 canonical scenarios through one cent-normalized expected model; unit and real disposable-PostgreSQL observations are exact twins and repeatability is mandatory. Reversal, `NO_BUCKETS`, TBK100, interest-base, PRE/POST, currency, fee projection, blocker 5/5, trace/non-official snapshot and deterministic ordering evidence all pass. No runtime calculation/authority, schema/migration, writer, official snapshot, consumer switch or cutover was introduced. PR-9 technical and governance states are CLOSED/CANONICAL; next eligible technical task is PR-10 Canonical primary adapter. MR-038 remains OPEN/NON-BLOCKING; no new maintenance record was required. Runtime cutover remains NOT AUTHORIZED.

**PR-10 Master Register Closure (2026-07-12):** Initial owner baseline `914a7bd1bb252276cf358cc51e9f6183563adbbe`; final technical base `72ab40082796608a8c86ca31ba57c85f4c98aca5`; PR #1137; head `6ff6d097bfa1ecc01cf70281bc8f29c7a6ee6e0a`; squash `681203fad25ffd6e2e51f3c92e4656b0c853a6f8`; CI 4/4 SUCCESS; mergeStateStatus CLEAN. Exact eight-file technical scope and separate five-file docs/governance closure preserve all legacy calculation-summary fields and PR-9..PR-1B behavior, tenant isolation, Collection writer, schema and financial-authority boundaries. Typed/additive `canonicalCompatibility` maps canonical per-currency principal, interest, payment, cost projection, fee status, blockers/readiness, trace and non-official snapshot; zero fallback does not exist and parity conflict is fail-closed. Adapter remains `ADDITIVE_SHADOW_ONLY`; consumer switch, feature activation, primary authority promotion, API/UI rendering change, official persistence and runtime cutover were not introduced. Technical branch/worktree cleanup completed normally with no orphan; MR-038 remains OPEN/NON-BLOCKING and no new maintenance record was required. PR-10 technical and governance states are CLOSED/CANONICAL. Next eligible step is the owner-gated `UNASSIGNED` cutover-authorization governance decision; PR-11 and runtime cutover remain NOT AUTHORIZED.

---

## Canonical Claim Balance Clean-Break Workstream (CCB)

ID: CCB-001
Title: Canonical Claim Balance Clean-Break Cutover
Problem: MPB-011 owner decision closed the architecture question: canonical `computeBalance` / ClaimItem + TBK100 + Interest Engine is the target single claim-balance engine / SoT, and legacy `getCalculationSummary` will not remain the future production authority. The implementation now needs a separate clean-break workstream instead of extending MPB-011.
Business Value: Removes the long-term two-headed balance architecture before live production reliance, so displayed claim balance has one auditable canonical source.
Technical Value: Moves cutover execution into a dedicated workstream covering component coverage, ground-truth harness, shadow acceptance, legal/Product Owner sign-off, pilot, and final cutover decision.
Priority: CRITICAL
Depends On: MPB-011 owner decision; ALC-P0-3 / ALC-AUTH guarded-primary chain; component coverage; ground-truth harness; shadow comparison acceptance; Avukat/Product Owner sign-off; pilot success.
Unlock Condition: Separate owner GO for CCB-001 design/implementation scope. This MPB-011 closeout does not authorize runtime changes, feature-flag enablement, or legacy removal.
Estimated Size: XL
Related Modules: case.service.ts (`getCalculationSummary`), interest-engine `computeBalance`, CaseBalanceService, guarded-primary-display, balance-display-shadow-diff, ClaimItem, TBK100 allocation, Interest Engine.
Status: **IMPLEMENTATION AUTHORITY / MASTER STREAM** (owner reconciliation, 2026-07-09; naming clarified by GOV-ADR-NAMING-000 on 2026-07-09; ADR number finally settled by owner arbitration on 2026-07-10 — see below). CCB-001 is the single implementation-authority workstream for the legacy→canonical claim-balance cutover. `canonicalization-register.md`'s **CAN-CUT-02** (legacy `getCalculationSummary` faiz=0 stub cutover, same `case.service.ts` seam) is a milestone tracked under this workstream, not an independent or competing stream — CAN-CUT-02 remains OPEN/needs-owner-decision in its own register; this does not close it. `ADR-012` is canonical on main only for DX-005 / Waiting & Progress Policy; `ADR-013` is the separate Fee/Harç/Snapshot/Journal draft owner-review ADR (GOV-ADR-NAMING-000's original scope, PR #1026). **CCB-001's own architecture document is `docs/adr/ADR-014-CCB-001-CANONICAL-LEGAL-CALCULATION-CORE.md`** (owner arbitration, 2026-07-10, final). **Correction history (2026-07-10, same day):** this document briefly existed as main-canonical `ADR-013` under an "Option C" interpretation (PR #1019) that broadened `ADR-013`'s reserved scope to mean CCB-001, framing Fee/Harç/Snapshot/Journal as sub-components. After a side-by-side comparison of the two candidate resolutions, the owner's final arbitration reverted this: `ADR-013` stays narrowly scoped per `GOV-ADR-NAMING-000`'s original text, and CCB-001's document is renumbered to `ADR-014`. This is not a case of "whichever merged first wins" — it is an explicit, considered owner correction superseding the earlier same-day decision. Branch-local commits `6dfa958d` (CRLF forward-fix) and `0a169f23` (branch-local CCB-001↔CAN-CUT-02↔ADR-012 alignment) remain WIP context on that unmerged branch — they are **not** a global closure and do not by themselves authorize any change here. This entry is the main-synced authoritative record of the CCB-001/CAN-CUT-02/ADR naming relationship. **ADR-014 split-plan update (2026-07-10):** `codex/ccb-001-pr1-pr6-rescue @ 961bbaf3` is direct-merge NO-GO and rescue/evidence source only; runtime cutover remains blocked by scenario infra, REVERSAL owner decision, PR-1A..PR-9 revalidation, and DB-gated validation.

**CCB-001-R (architectural reconciliation, 2026-07-09) — WIP-branch-only, NOT a main production state change:** ADR-014's own PR sequence (PR-11 UI/API/report/template switch, PR-12 legacy fallback disable, PR-13 shadow/diff cleanup, PR-14 legacy quarantine/deletion) is formally listed as not-yet-started in governance records, but repo evidence on the WIP branch shows parts of that scope already implemented in code (`case.service.ts`'s canonical-primary cutover with no legacy fallback = PR-10/11 territory; `apps/web/src/lib/legacy-reference/guarded-primary-display.ts`'s own header comment `"PR-14 QUARANTINE_REFERENCE_ONLY"`; `feature-flags.ts`'s `"PR-13 sonrasinda..."` comment). **This is a governance-record-vs-code lag, not a behavior discrepancy** — the code on the WIP branch is genuinely ahead of what this backlog entry's PR-sequence framing described; this note exists to close that gap in the record, not to claim the sequence rule was violated at runtime (branch is unmerged, `main` behavior is unaffected). Five narrow reconciliation patches were applied on the branch (commit `961bbaf3`) to close remaining architectural gaps found during the CCB-001-R audit, all preserving existing behavior/order/invariants (no ADR-014 work, no fee/harç, no legacy deletion, no snapshot/trace persistence): **R1** forward-ports `FIN-TBK100-DI-001` (main PR #989/`f1bab70c`) onto the branch, verified blob-hash-identical to main's fix across all 4 touched files (`interest-engine.module.ts` + 3 spec files) — zero merge risk. **R2** cent-normalizes COST/ANCILLARY/INTEREST/PRINCIPAL allocation steps (float-dust removal, reuses existing `minor-unit.ts`). **R3** adds a negative-payment guard to `allocateSinglePayment()`. **R5** fixes `case-balance-display.ts`'s `authority` field from hardcoded `SHADOW_ONLY` to `CANONICAL_CANDIDATE` when `status==='OK'`, aligning the label with the code's actual production-authority role. **R4** was the branch's own (now superseded) governance sync attempt for this same entry. **Test evidence — Phase B Full Validation (2026-07-10):** independently and reproducibly re-verified against revision `961bbaf3` — **Backend** 152 suites total (149 executed, 3 DB-gated skipped), 1644 PASS / 27 skipped / 2 pre-existing FAIL (`collection-payment-reversed.integration.spec.ts` — untouched by CCB-001, blob-identical to merge-base/main, diff-identity verified). **Web** 1 suite (`balance-shadow-display.test.tsx`), 75 PASS / 10 intentional historical skips. **Combined**: 153 suites / 1758 tests, 1719 PASS / 37 skipped / 2 pre-existing FAIL. API+web `tsc --noEmit` clean. This count is now authoritative, superseding the branch's own earlier "60 suites/785 tests" and "50 suites/670 tests" claims. Phase B verdict: `READY_FOR_PR`. **Per the "supersede: evidence vs. governance attachment" principle — this technical validation (tied to commit `961bbaf3`) remains valid regardless of the ADR-013/ADR-014 naming back-and-forth above; only the naming/numbering was superseded, not the test results.** All patches preserve behavior/order/invariants; ADR/fee/harç/legacy-deletion/snapshot-persistence/UI-report-refactor untouched.

**POST-PR-10 CCB-001 STATUS OVERRIDE (2026-07-12):** Yukarıdaki branch-only CCB-001-R evidence tarihsel kalır ve canonical-main runtime state değildir. Current main için W0 ve PR-1A..PR-10 CLOSED/CANONICAL. PR-10 yalnız additive/shadow compatibility adapter'dır; branch-only rescue cutover yaklaşımı canonical olmamıştır. Next eligible step owner-gated `UNASSIGNED` cutover-authorization governance decision; PR-11 consumer switch ve runtime cutover NOT AUTHORIZED. Fee/harç policy/formula, official persistence, new FX/conversion authority ve duplicate allocator disposition owner-held; ALC-AUTH pilot/rollout kayıtları PR-11 gate'i için reconciliation girdisidir.

**RCV Program/Register Cross-Pointer (RCV-GOV-001 / DEC-0030, 2026-07-13; CANONICAL UPON APPROVED MERGE):** `RCV`, `RCV-P0` ve `RCV-P1`, program identity/register anchor amacıyla bu `CCB-001` master stream'i altında subordinate planning decomposition olarak izlenir; ayrı veya rakip Master Register entry oluşturmaz. Bu identity-only pointer work-item execution/status owner'lığını `CCB-001`e taşımaz: `CAN-CUT-01/VER-05`, `CAN-CUT-02/ADR-014` ve external-domain owner kayıtları kendi canonical gate'lerini korur. Phase 0 closure owner-supplied `RCV-P0-T01..T09 COMPLETE / PHASE 0 CLOSED` attestation'ına dayanır ve repository içinde yeniden üretilmez. `RCV-P0-CP-01`, `Receivable Program Governance and Source Control` control-plane node'udur; Phase 1 entry condition'ı cross-pointer'ın Product Backlog + Canonicalization Register + Decision Log + `RCV-PHASE-1-AUTHORIZATION.md` ile aynı approved merge'de canonical olmasını ve mevcut owner kayıtlarının override edilmemesini gerektirir. `RCV-P0-BAR-0021:PHASE1_ENTRY`, bundan ayrı olarak explicit owner `GO-PHASE-1` gerektirir. İlk ve tek eligible aday `WAVE 0 / RCV-P1-T15-A`dır; authorized veya started değildir. RCV `WAVE 0`, ADR-014 split-plan'daki tarihsel W0 değildir. Bu kayıt açık canonicalization/verification statülerini kapatmaz, representative evidence/PR-11/runtime cutover yetkisi üretmez ve WAVE 1+ açmaz.

**RCV-GOV-001 Post-Merge Closure (2026-07-14):** Identity-only program/register cross-pointer PR #1222 ile canonical main'e merge edilmiştir (squash `fcffb12941f33e36e6e42d9d742d0249eb210ab8`); DEC-0030 `CLOSED` ve `RCV-P0-CP-01` entry condition `SATISFIED`dır. Bu bookkeeping yeni Master Register ID veya execution authority üretmez. `RCV-P0-BAR-0021:PHASE1_ENTRY` explicit owner GO bulunmadığı için `OPEN`; Phase 1 `NOT AUTHORIZED` kalır. `CAN-CUT-01/VER-05`, `CAN-CUT-02/ADR-014`, representative evidence, PR-11, runtime cutover ve external-owner statüleri değişmemiştir.

**ADR014-PE-01A Master Register Closure (2026-07-12):** Canonical PE-01 zero-cent contract ile shadow readiness implementation hizalandı ve `CLOSED / CANONICAL` oldu. Technical PR #1154; head `54102a50e2399ee5df393b180959bacb52d670ff`; squash `52668ff97007a72496f351a701b1dbeaf8fe60d8`; CI `4/4 SUCCESS`; pre-merge `CLEAN / MERGEABLE`. Dar sekiz-dosya scope yalnız `balance-display-shadow-diff` service/type/module, bounded PII-free metrics ve doğrudan test/evidence yüzeyidir. Non-zero financial delta, `UNKNOWN`, missing-side ve `NOT_COMPARABLE` fail-closed; B1 istisnası kaldırılmış; direct total row ve missing allocation/interest-base/fee-projection evidence blocker'ları eklenmiştir. Calculation algorithm, schema/migration, fee/FX policy, feature activation, consumer switch, financial authority ve runtime authority değişmemiştir. Representative evidence `ABSENT / BLOCKING`; PR-11 ve runtime cutover `NOT AUTHORIZED`; `CAN-CUT-02` `OPEN / needs-owner-decision` kalır. Yeni backlog ID yoktur. Teknik worktree fiziksel kalıntısı `MR-040 / OPEN / NON-BLOCKING` olarak izlenir. Tek sonraki uygun görev `ADR014-PE-02 — Evidence/Data-Access Procedure`dır ve canonical local-owner/office real-data policy ile yürütülmelidir.

**ADR014-PE-02 Master Register Closure (2026-07-12):** Evidence lifecycle, evidence/dataset/environment classes, separate access and execution approvals, PII-safe package standard, access roles, monitoring/incident/retention ownership and current gap classes `docs/design/adr-014-evidence-data-access-procedure.md` içinde `DEFINED / CANONICAL` hale getirildi. Bu yalnız procedure-definition kapanışıdır: representative environment oluşturulmadı, data kullanılmadı/kopyalanmadı, access veya execution approval verilmedi, monitoring/dashboard/alert/runtime uygulanmadı. “Representative staging” yalnız owner-controlled local environment üzerindeki logical isolated/read-only evidence session anlamındadır; remote/cloud staging yetkisizdir. `CCB-001` owner/master stream ve `CAN-CUT-02` open milestone olarak korunur; PE-01 ve PE-01A kapalı kalır. Yeni backlog ID yoktur. Representative environment verification, measured baseline ve representative evidence `ABSENT / BLOCKING`; PR-11 ve runtime cutover `NOT AUTHORIZED`. Tek sonraki uygun görev `ADR014-PE-03 — Representative Staging Environment Contract`tır ve yalnız local environment contract/verification kapsamıdır.

**ADR014-PE-03 Master Register Closure (2026-07-12):** Owner-controlled local representative evidence session için physical/logical boundary, enforced source read-only modeli, no-egress/secrets sınırı, dataset-manifest attachment, capacity/clock suitability, deterministic state machine, opening/active/closing kuralları, failure/hard-stop taxonomy, evidence-validity classes, ownership matrix ve environment attestation `docs/design/adr-014-local-evidence-session-environment-contract.md` içinde `DEFINED / CANONICAL` hale getirildi. Minimum model yeni DB copy/schema değildir: local source üzerinde doğrulanabilir `REPEATABLE READ, READ ONLY` session + pinned config/SHA/session ID + dedicated local output/manifest'tir. Bu yalnız contract kapanışıdır; environment/dataset oluşturulmadı, gerçek veri okunmadı/kopyalanmadı, access/execution/evidence acceptance verilmedi. `CCB-001` ve açık `CAN-CUT-02` korunur; yeni backlog ID yoktur; `MR-040` OPEN/NON-BLOCKING ve untouched kalır. Representative evidence `ABSENT / BLOCKING`; PR-11 ve runtime cutover `NOT AUTHORIZED`. Tek sonraki uygun görev `ADR014-PE-04 — Representative Dataset Matrix and Sampling Manifest`tır.

**ADR014-PE-04 Master Register Closure (2026-07-12):** Canonical dataset classes, production-origin source ile representative qualification ayrımı, source-derived distributional base ve ayrı etiketli edge-case supplement metodolojisi, business/financial/legal/technical/operational coverage, inclusion/exclusion, bias değerlendirmesi, reference-only immutable sampling manifest, traceability, validity ve owner-only final dataset approval `docs/design/adr-014-representative-dataset-matrix-sampling-manifest.md` içinde `DEFINED / CANONICAL` hale getirildi. Bu yalnız contract kapanışıdır; dataset seçilmedi/materialize edilmedi, gerçek veri okunmadı/kopyalanmadı, manifest instance oluşturulmadı, environment/session aktive edilmedi ve access/execution/evidence acceptance verilmedi. `CCB-001` ve açık `CAN-CUT-02` korunur; yeni backlog ID yoktur; `MR-040` OPEN/NON-BLOCKING ve untouched kalır. PR #1159 eski tabanda `OPEN / HOLD FOR OWNER REVIEW` ve non-canonical kalır; bu hat onu consume etmez. Representative evidence `ABSENT / BLOCKING`; PR-11 ve runtime cutover `NOT AUTHORIZED`. Tek sonraki uygun görev `ADR014-PE-05 — ADR-014 Metrics, Audit, Dashboard and Alert Operational Contract`tır; docs-only monitoring preparation, data/evidence execution yetkisi yoktur.

**ADR014-PE-05 Master Register Closure (2026-07-12):** Bounded metric catalogue, PII-safe label ve structured-log envelope, durable correlation/audit gereksinimleri, dört dashboard görünümü, readiness state modeli, alert taxonomy/routing/delivery, baseline-window metadata, retention/integrity, monitoring evidence sub-package ve ownership `docs/design/adr-014-metrics-audit-dashboard-alert-operational-contract.md` içinde `DEFINED / CANONICAL` hale getirildi. Canonical inventory, mevcut Prometheus registry ve dört ADR-014 metric ailesini implemented; component/session metrics, durable log/audit correlation, ADR-014 dashboard/rules/delivery ve evidence sealing'i partial/absent prerequisites olarak kaydeder. Bu yalnız contract kapanışıdır: production code, monitoring/dashboard/alert/audit storage, environment/session, dataset, baseline veya representative evidence uygulanmadı/aktive edilmedi. `CCB-001` ve açık `CAN-CUT-02` korunur; yeni backlog ID yoktur; `MR-040 OPEN / NON-BLOCKING / UNTOUCHED`. PR #1159 non-canonical/HOLD kalır. Representative evidence `ABSENT / BLOCKING`; PR-11 ve runtime cutover `NOT AUTHORIZED`. Tek sonraki uygun görev `ADR014-PE-05A — Metrics, Audit and Alert Implementation Preparation`dır; bu kayıt implementation yetkisi vermez.

**ADR014-PE-05A1a Master Register Closure (2026-07-12):** Shadow component duration/outcome metrics technical implementation `CLOSED / CANONICAL` oldu. Technical PR #1168; head `2e404312494a22d18492e8ba837b391dc7aa874e`; squash `49d7986507e62bb39a3d6de97a1b8fefccd39891`; CI `4/4 SUCCESS`; pre-merge `CLEAN / MERGEABLE`. Existing singleton `PROM_REGISTRY` içinde `adr014_calculation_duration_seconds{component,result}` histogramı bounded `LEGACY`, `CANONICAL`, `SHADOW_COMPARE` component ve `SUCCESS`, `ERROR` result değerleriyle eklendi; ikinci registry, PII/high-cardinality veya tenant/case/session/amount/free-text label'ı ve external telemetry yoktur. Runtime etkisi additive in-process telemetry ile sınırlıdır; API/DTO, legal calculation, readiness/blocker, schema/migration, financial algorithm ve runtime authority değişmemiştir. `CCB-001` existing master-stream state ve `CAN-CUT-02 OPEN / needs-owner-decision` korunur; yeni backlog ID yoktur. Representative evidence `ABSENT / BLOCKING`; PR-11 ve runtime cutover `NOT AUTHORIZED`; PR #1159 non-canonical/HOLD kalır; `MR-040` untouched. Teknik worktree fiziksel residue'su `MR-043 / OPEN / NON-BLOCKING` olarak izlenir ve sonraki ADR-014 işini bloklamaz. Tek sonraki uygun görev `ADR014-PE-05A2 — PII-Safe Structured Operational Events`tır; ayrı GO gerektirir.

**ADR014-PE-05A2 Master Register Closure (2026-07-13):** PII-safe structured operational event implementation `CLOSED / CANONICAL` oldu. Technical PR #1171; head `1492a91cf98a6968887f583788cab7bd7bb27a98`; squash `3a8224fab6310800bfc09138d78936c776701118`; CI `4/4 SUCCESS`; pre-merge `CLEAN / MERGEABLE`. Version `1` event envelope; bounded event/severity/component/operation/result/failure-code vocabularies; exact allowlist DTO; strict canonical-SHA/environment normalization ve deterministic readiness-derived terminal mapping eklendi. Existing Nest `Logger` yalnız serialized allowlisted envelope alır; eventler non-durable, in-process operational telemetry'dir. Optional session/manifest/trace/evidence references canonical producer olmadığı için omit edilir. PII, tenant/case/person ID, secret, raw exception/stack, free-text/arbitrary metadata ve monetary payload yasaktır; external egress veya AuditLog persistence yoktur. Financial calculation, readiness/blocker, metric values/names, API/DTO, schema/migration ve financial/runtime authority değişmemiştir. `CCB-001` existing master-stream state ve `CAN-CUT-02 OPEN / needs-owner-decision` korunur; yeni backlog ID yoktur. Representative evidence `ABSENT / BLOCKING`; PR-11 ve runtime cutover `NOT AUTHORIZED`; PR #1159 non-canonical/HOLD kalır. `MR-040` ve `MR-043` untouched; teknik worktree fiziksel residue'su `MR-044 / OPEN / NON-BLOCKING` olarak izlenir. Tek sonraki uygun görev `ADR014-PE-05A3 — Durable ADR-014 Audit Correlation Preparation`dır; ayrı GO gerektirir.

**ADR014-PE-05A3 Master Register Closure (2026-07-13):** Future durable audit writer için correlation preparation implementation `CLOSED / CANONICAL` oldu. Technical PR #1175; head `edbbb0c5c1e5f7aaa50327ec716de7b50a653ce6`; squash `64e71c8f8feece7f711e07e85543248ab20009a5`; CI `4/4 SUCCESS`; pre-merge `CLEAN / MERGEABLE`. Typed contract/version `1`, process-generated opaque correlation reference, exact PE-05A2 source-envelope defensive copy, `NON_DURABLE` durability ve `NOT_CONFIGURED` persistence status eklendi. Runtime validator yalnız canonical bounded vocabulary, strict SHA/environment/timestamp ve allowlisted optional opaque references kabul eder; unexpected/PII/financial/raw-error/arbitrary-metadata alanlarını fail-closed reddeder. Existing PE-05A2 envelope/logger/service/metrics, financial/readiness behavior ve API/DTO değişmemiştir. AuditService/AuditLog/Prisma/DB write, schema/migration, external sink/network, metric veya log emission yoktur; preparation durable audit/evidence authority değildir. `CCB-001` existing master-stream state ve `CAN-CUT-02 OPEN / needs-owner-decision` korunur; yeni backlog ID yoktur. Representative evidence `ABSENT / BLOCKING`; durable audit persistence, PR-11 ve runtime cutover `NOT AUTHORIZED`; PR #1159 non-canonical/HOLD kalır. `MR-040`, `MR-043`, `MR-044` untouched; teknik worktree fiziksel residue'su pending concurrent MR-045 kaydıyla çakışmaması için `MR-046 / OPEN / NON-BLOCKING` olarak izlenir. Tek sonraki uygun görev `ADR014-PE-05A4`tır; ayrı GO gerektirir.

**ADR014-PE-05A4 Master Register Closure (2026-07-13):** Future durable audit persistence için writer abstraction preparation `CLOSED / CANONICAL` oldu. Technical PR #1180; final rebased head `f80cbf70be7c59fd1781fcd0be470c31a055202c`; squash `347e7b3dde8391ffbb1ac7d1a905f067118078c6`; CI `4/4 SUCCESS`; pre-merge `CLEAN / MERGEABLE`. Typed `Adr014DurableAuditWriter` portu, `ADR014_DURABLE_AUDIT_WRITER` Nest tokenı ve immutable disabled `NoopAdr014DurableAuditWriter` providerı eklendi. Default provider `enabled=false` ve `write()` NO-OP'tur; mevcut service/controller execution path'ine writer dependency veya call-site eklenmedi. PE-05A1a metric contract, PE-05A2 event vocabulary/envelope/logger ve PE-05A3 correlation contract değişmedi; full shadow regression 117/117 PASS oldu. AuditLog/AuditService/Prisma/DB write, schema/migration, queue/worker, external sink/network, telemetry, API/DTO, financial calculation, readiness/blocker veya runtime authority değişikliği yoktur. `CCB-001` existing master-stream state ve `CAN-CUT-02 OPEN / needs-owner-decision` korunur; yeni backlog ID yoktur. Representative evidence `ABSENT / BLOCKING`; durable persistence/retention, PR-11 ve runtime cutover `NOT AUTHORIZED`; PR #1159 non-canonical/HOLD kalır. Existing open MR kayıtları untouched; teknik worktree fiziksel residue'su `MR-047 / OPEN / NON-BLOCKING` olarak izlenir. Canonical olarak atanmış bir sonraki PE-05A workstream bulunmadığından next eligible task owner assignment gerektirir; bu closure yeni backlog veya workstream açmaz.

**ADR014-PE-05B Master Register Closure (2026-07-13):** Shadow financial-integrity metrics completion `CLOSED / CANONICAL` oldu. Technical PR #1187; head `6cade02059491e5f4066eb13973f6f4dedc8c193`; squash `215f8b20c901c1cf88be723df84ae5dc57cc868e`; CI `4/4 SUCCESS`; pre-merge `CLEAN / MERGEABLE`. Existing shadow comparison reportlarından deterministik olarak türetilen `adr014_financial_discrepancies_total`, `adr014_missing_evidence_total`, `adr014_integrity_failures_total` ve `adr014_primary_display_safety_total` metric aileleri bounded exact-allowlist label'larla eklendi. Duplicate blocker kodları de-duplicate edilir; telemetry arızaları business execution'dan izole kalır. PII, identifier, monetary payload, raw error/stack ve arbitrary metadata taşınmaz. Existing metric isim/label'ları, PE-05A2 envelope, PE-05A3 correlation ve PE-05A4 writer abstraction değişmedi; financial calculation, readiness, blockers, API/DTO, persistence, schema/migration ve authority etkisi yoktur. Full shadow regression 123/123 ve tüm technical CI gate'leri PASS oldu; full API type-check'teki 490 hata fresh canonical baseline ile aynıdır ve changed PE-05B dosyaları sıfır yeni hata üretir. `CCB-001` existing master-stream state ve `CAN-CUT-02 OPEN / needs-owner-decision` korunur; yeni backlog ID yoktur. Representative evidence `ABSENT / BLOCKING`; PR-11 ve runtime cutover `NOT AUTHORIZED`. Existing MR kayıtları untouched; iki fiziksel worktree residue'su birlikte `MR-049 / OPEN / NON-BLOCKING` olarak izlenir. Canonical successor atanmadığından next eligible task `OWNER DECISION REQUIRED`dır; bu closure yeni workstream açmaz.

**ADR014-PE-06A Master Register Closure (2026-07-13):** Disabled local evidence-harness preparation `CLOSED / CANONICAL` oldu. Technical PR #1190; head `bb841996cac20db8d7f9cba24b81b9f04d974e4f`; squash `77d8e6bdcb16199d01a920a95f78f370837dd28f`; CI `4/4 SUCCESS`; pre-merge `CLEAN / MERGEABLE`. Pure typed/immutable contract default olarak disabled kalır ve yalnız caller-supplied canonical SHA ile opaque PE-03 environment/session, PE-04 manifest ve birbirinin yerine geçmeyen access/execution authorization reference'larını ortak binding altında doğrular. Sonuç vocabulary'si yalnız `BLOCKED`/`PREPARED`dır; `PREPARED` data access, execution, evidence acceptance, readiness, PR-11 veya cutover authority üretmez. CLI/main/Nest bootstrap, import-time execution, database/filesystem/network, scheduler, persistence/writer activation, monetary/PII payload, financial calculation, API/DTO, readiness/blocker ve mevcut telemetry davranışı yoktur/değişmemiştir. Direct testler 33/33, full shadow regression 123/123 ve technical validation/CI PASS olmuştur. PR #1159 `OPEN / HOLD / NON-CANONICAL` kalır; rebase/merge/cherry-pick yapılmamış ve implementation authority olarak kullanılmamıştır. `CCB-001` ve `CAN-CUT-02 OPEN / needs-owner-decision` korunur; yeni backlog ID yoktur. Representative evidence `ABSENT / BLOCKING`; PR-11 ve runtime cutover `NOT AUTHORIZED`. Git worktree kaydı ile technical local/remote branch'ler temizlenmiş, ancak `C:\Development\HUKUK_YAZILIMI\HUKUK_adr014-pe06a-disabled-harness` dizini Windows long-path hatası nedeniyle fiziksel residue olarak kalmıştır; recursive delete yapılmamış ve bu kalıntı `OPEN / NON-BLOCKING`dir. Canonical successor atanmadığından next eligible task `OWNER DECISION REQUIRED`dır; bu closure yeni workstream açmaz.

**ADR014-PE-06B1 Master Register Closure (2026-07-13):** Typed Session / Control Observation Fact Contract `CLOSED / CANONICAL` oldu. Technical PR #1194; final rebased head `fc0eb8b5e622c61bdcc1d4d02e98a66d9e647d07`; squash `8841faa9128e758df2aa20e1e49ee5532e578c9f`; final-base CI `4/4 SUCCESS`; pre-merge `CLEAN / MERGEABLE`. Yalnız dört allowlist dosyasında immutable/deterministic/PII-safe `SESSION`, `PHASE`, `MANIFEST`, `COVERAGE`, `BOUNDARY`, `CONTROL` ve `HEALTH` observation fact contract'ı, owner-approved bounded vocabularies, compile-time exhaustive producer mapping, direct unit/security testleri ve non-authoritative runbook eklendi. Producer sahipliği session-bound fact'ler için `ADR014_LOCAL_EVIDENCE_SESSION_ORCHESTRATOR`, control için `ADR014_CONTROL_OBSERVER`, health için `ADR014_INSTRUMENTATION_HEALTH_OBSERVER` olarak sabittir; caller override edemez. Fact'ler timestamp, SHA, opaque correlation/reference, business identifier, monetary payload, raw error, free text veya arbitrary metadata taşımaz. Metric/event emit, session/manifest/evidence creation, DB/filesystem/network/Nest/scheduler, audit writer/persistence, dashboard/alert, financial calculation, API/DTO, readiness/blocker veya authority değişikliği yoktur. Existing PE-05 metric/event contract'ları ve PE-06A harness değişmedi; `PREPARED` execution/evidence/readiness/PR-11/cutover authority üretmez. Direct testler 34/34, PE-05/PE-06A regression selection 76/76, ESLint, production TypeScript, exact allowlist, security/static checks ve CI PASS olmuştur. `CCB-001` ve `CAN-CUT-02 OPEN / needs-owner-decision` korunur; representative evidence `ABSENT / BLOCKING`, PR-11 ve runtime cutover `NOT AUTHORIZED`; yeni product backlog ID yoktur. Technical worktree Git kaydı ve local/remote branch'ler temizlenmiş, fakat `C:\Development\HUKUK_YAZILIMI\project\.worktrees\adr014-pe-06b1` Windows long-path hatası nedeniyle fiziksel residue olarak kalmış ve `MR-051 / OPEN / NON-BLOCKING` altında izlenmiştir; recursive delete yapılmamıştır. Canonical successor atanmadığından next eligible task `OWNER DECISION REQUIRED`dır; bu closure yeni workstream açmaz.

**ADR014-PE-06B2 Master Register Closure (2026-07-13):** Default-Disabled Session / Control Observation Producer and Telemetry Mapping Preparation `CLOSED / CANONICAL / PREPARATION-ONLY` oldu. Technical PR #1196; head `ef0c380d3aa94b3d4f9032de4398ff7aa60a3d08`; squash `e3b9639c71943d7ea45be5c27da52d48daa16389`; CI `4/4 SUCCESS`; pre-merge `CLEAN / MERGEABLE`. PE-06B1'in yedi canonical factory'si tek pure producer boundary'sinde aynen kullanılır; producer default `DISABLED`, yalnız explicit `TEST_ONLY` moduyla direct test edilebilir ve production call-site/module wiring taşımaz. Six bounded metric projection mappings are defined; PHASE duration source absent olduğu için sahte süre üretilmeden typed blocker taşınır. PE-05A2 shadow event envelope değişmez; session/control event mapping canonical vocabulary yokluğu nedeniyle typed blocker olarak kalır ve ikinci event sistemi kurulmaz. NO-OP default sink production emission yapmaz; in-memory sink yalnız testtedir. Fact contract, existing metrics/event/correlation/writer contracts, financial/readiness/blocker/API/DTO sonuçları ve authority değişmemiştir; session/environment/dataset execution, persistence ve external egress yoktur. Direct + PE-06B1 tests 50/50, PE-06A/PE-05 regressions 156/156, production TypeScript, changed-file ESLint, exact five-file allowlist, security/cardinality, determinism/immutability ve CI PASS olmuştur. `CCB-001` ve `CAN-CUT-02 OPEN / needs-owner-decision` korunur; representative evidence `ABSENT / BLOCKING`, PR-11 ve runtime cutover `NOT AUTHORIZED`; yeni product backlog ID yoktur. Technical worktree Git kaydı ve local/remote branch'ler temizlenmiş, fakat `C:\Development\HUKUK_YAZILIMI\project\.worktrees\adr014-pe-06b2` Windows long-path hatası nedeniyle fiziksel residue olarak kalmış ve `MR-052 / OPEN / NON-BLOCKING` altında izlenmiştir; recursive delete yapılmamıştır. Canonical successor atanmadığından next eligible task `OWNER DECISION REQUIRED`dır; bu closure yeni workstream açmaz.

**ADR014-PE-06C0 Master Register Closure (2026-07-13; governance PR #1199):** Canonical session/control
structured-event vocabulary and phase-timing owner decisions are `CLOSED / CANONICAL / OWNER
DECISIONS DEFINED` after approved merge. OD-C0-01..18 and the 7/7 mapping matrix are fixed in
`docs/design/adr-014-session-control-event-vocabulary-phase-timing-decisions.md`. PE-05A2 v1
remains immutable; a backward-compatible `event_version=2` / `event_profile=SESSION_CONTROL`
profile uses the same canonical envelope family and creates no second event system. PE-06B1 facts
remain clock-free and unchanged. The future local session orchestrator owns monotonic phase timing
and supplies immutable duration context; fact factory, mapper and producer do not invent time.
PE-06C1 is limited to pure default-disabled mappings, v1/v2 compatibility and security tests,
session-counter mapping, phase-duration context/validation and typed source-absent blockers.
Production call-sites, metric/event emission, activation, timeout/cancellation behavior, session
execution, control mutation, persistence, external egress, data/evidence execution and authority
remain excluded. No new backlog ID is created; `CCB-001` and `CAN-CUT-02 OPEN /
needs-owner-decision` remain unchanged. Representative evidence is `ABSENT / BLOCKING`; PR-11 and
runtime cutover remain `NOT AUTHORIZED`. Existing maintenance records, including MR-052, remain
untouched. The single next eligible task is `ADR014-PE-06C1 — Default-Disabled Observation
Contract Completion`, requiring separate task authorization.

**ADR014-PE-06C1 Master Register Closure (2026-07-13; governance PR #1202):** Default-Disabled Observation Contract
Completion is `CLOSED / CANONICAL / DEFAULT-DISABLED` after technical PR #1201 (head
`ca1d8baf1a25f2e7cba1219e4d2880e4a8676eb9`; squash
`8948cadb7ce4c2061edb82bcff9afd901af98acf`; CI `4/4 SUCCESS`; pre-merge `CLEAN /
MERGEABLE`). PE-05A2 v1 serialization and semantics remain unchanged. The same event-envelope
family has the bounded v2 `SESSION_CONTROL` profile and exhaustive pure event mapping for all seven
PE-06B1 fact families. Existing bounded state projections remain; session start/terminal facts add
`adr014_evidence_sessions_total`, and terminal PHASE facts map
`adr014_evidence_phase_duration_seconds` only from caller-supplied finite monotonic seconds.
`adr014_execution_requests_total` and `adr014_control_events_total` remain typed
`BLOCKED_WITH_REASON` because their real producers are absent. Default mode remains `DISABLED`;
only `TEST_ONLY` can project to the local sink. There is no production call-site, registry
registration/emission, runtime timer, session/control activation, persistence, external egress,
environment/dataset access, evidence execution, financial/readiness/blocker/API/DTO behavior or
authority change. Direct tests 82/82 and wider PE-05/PE-06 regressions 267/267 passed; changed-file
ESLint, static runtime/egress guard, exact seven-file allowlist and `git diff --check` passed. No new
backlog ID is created. `CCB-001` remains unchanged; `CAN-CUT-02 OPEN / needs-owner-decision`,
representative evidence `ABSENT / BLOCKING`, PR-11 and runtime cutover `NOT AUTHORIZED`. Existing
maintenance records remain untouched. No successor is auto-opened; next eligible task is `OWNER
DECISION REQUIRED`.

**ADR014-PE-06D Master Register Closure (2026-07-13; governance PR #1204):** Local Session Orchestrator
Dry-Validation is `CLOSED / CANONICAL / DRY-VALIDATION-ONLY` after technical PR #1203 (head
`075a079a2b680abf246bd9b173fc3e77bcb89ddf`; squash
`2d626b156cab5ed726c2ac9ae551220e8d51392b`; CI `4/4 SUCCESS`; pre-merge `CLEAN / MERGEABLE`).
The five-file technical scope adds a pure default-disabled orchestrator, direct functional/security
tests, non-authoritative runbook and explicit CI selection. Only explicit `TEST_ONLY` composes the
PE-06A preparation gate, PE-06B1 factories and PE-06C1 same-family v2 mappings. Bounded synthetic
fixtures cover success, phase failure/timeout/cancellation, session abort, invalid transition,
missing authorization and disabled no-emission; terminal phase duration comes only from an injected
finite monotonic test clock. Direct tests 14/14 and PE-06A–PE-06D regressions 162/162 passed;
changed-file ESLint, isolated TypeScript and `git diff --check` passed. There is no production
call-site, real/local-production data access, environment or telemetry activation, persistence,
external egress, financial/readiness/blocker/API/DTO behavior or authority change. `DRY_VALIDATED`
is synthetic test evidence, not representative evidence or execution authority. No new backlog ID
is created. Existing maintenance records remain untouched. `CCB-001` remains unchanged;
`CAN-CUT-02 OPEN / needs-owner-decision`, representative evidence `ABSENT / BLOCKING`, PR-11 and
runtime cutover `NOT AUTHORIZED`. The owner-designated next bounded workstream is ADR014-PE-06E and
requires separate explicit authorization; this closure does not activate telemetry or evidence
execution.

**ADR014-PE-06E Master Register Closure (2026-07-13; governance PR #1207):** Audit / Evidence
Sealing / Monitoring Surfaces is `CLOSED / CANONICAL / LOCAL-PREPARATION-ONLY` after technical PR
#1206 (head `8c6a42cdbf39c39491a97ec70df8e1f99d7d70be`; squash
`31cf03e79b4c734cf574f6fd17311a6bb49ec722`; CI `4/4 SUCCESS`; pre-merge `CLEAN / MERGEABLE`).
The five-file technical scope adds a pure default-disabled contract, direct functional/security
tests, a non-authoritative runbook and explicit CI selection. In explicit `TEST_ONLY` mode it can
prepare a deterministic immutable append-only audit-reference chain, validate and seal the four
required non-official evidence references, and describe four inert local read-only dashboard
sections plus rule-only alerts. It reuses existing PE-05/PE-06 bounded metric and correlation
vocabularies. Direct tests 10/10 and PE-05/PE-06 regressions 211/211 passed; targeted ESLint and
`git diff --check` passed; PE-06E TypeScript diagnostics are absent while unrelated repository-wide
diagnostics remain. There is no production call-site, artifact fetch, runtime emission,
audit/evidence persistence, external egress, alert delivery, real-data access,
financial/readiness/blocker/API behavior or authority change. `REFERENCE_SEALED` is explicitly
non-official, non-persisted and authority-free. No new backlog ID is created. Existing maintenance
records remain untouched. `CCB-001` remains unchanged; `CAN-CUT-02 OPEN / needs-owner-decision`,
representative evidence `ABSENT / BLOCKING`, PR-11 and runtime cutover `NOT AUTHORIZED`. Authorized
pre-evidence observability preparation is complete. Next: `OWNER DECISION REQUIRED —
Representative Evidence Preparation`; this closure does not authorize preparation or execution.

**ADR014-REP-01B Master Register Closure (2026-07-13; governance PR #1213):** Local Read-Only
Representative Evidence Runner is `CLOSED / CANONICAL / EXECUTION-MECHANISM-ONLY` after technical
PR #1211 (head `e34faea3a45127edd29d15cb5b7bd7f91448ca53`; squash
`a4c72414ab3cea26e36cd9b6c42735024c01db7b`; CI `4/4 SUCCESS`; pre-merge `CLEAN /
MERGEABLE`). The exact five-file scope adds a default-disabled runner, direct functional/security
tests, a non-authoritative runbook and explicit CI selection. It composes PE-06A and PE-06D,
requires bound canonical/environment/session/manifest/access/execution references, enforces
`REPEATABLE READ / READ ONLY`, provides a guarded query port, rejects write-capable SQL, supports
deterministic abort and creates one local JSON artifact below a realpath-verified owner root with
exclusive write semantics. There is no production call-site, import-time execution, telemetry
activation, network/external service, schema/migration, financial/readiness/API behavior or
authority change. Output remains `CAPTURED_NOT_ACCEPTED`, non-official and authority-free. No new
backlog ID or maintenance record is created. REP-01A remains `OPEN / BLOCKED`; environment and
manifest instances, named roles, access/execution authorizations, baseline, retention and sign-offs
are not approved. Representative execution/evidence remain `ABSENT / BLOCKING`; CAN-CUT-02 remains
`OPEN / needs-owner-decision`; PR-11 and runtime cutover remain `NOT AUTHORIZED`. Single next
eligible task after closure: `ADR014-REP-01A — Run-Specific Authorization Package Completion`.

**ADR014-REP-01A Master Register Closure (2026-07-13):** Run-Specific Authorization Package
mechanism is `CLOSED / CANONICAL / PACKAGE-MECHANISM-ONLY` after technical PR #1216 (rebased head
`14064893c10a511925f203f499b16cfd1266dfe6`; squash
`da0d70061f21da1db4ff5aae0e0583c3ed3f4e75`; final-base CI `4/4 SUCCESS`; pre-merge `CLEAN /
MERGEABLE`). The exact five-file scope adds a pure deterministic contract, direct
functional/security tests, a non-authoritative runbook and explicit CI selection. The contract
requires the exact canonical/environment/session/approved-manifest binding, separate access and
execution authorization records/windows, distinct operator/reviewer assignments, read-only and
no-egress proofs, owner-controlled create-once output, retention, baseline/population/request-count
definition and five approved-for-run sign-offs. Missing or conflicting values fail closed.
`PACKAGE_COMPLETE` remains `executionStarted=false`, `representativeEvidenceProduced=false`,
`representativeEvidenceAccepted=false`, `pr11Ready=false`, `runtimeCutoverAuthorized=false` and
creates no runtime authority. No package instance, environment activation, data read, evidence
execution/acceptance, telemetry activation, schema/migration or consumer switch occurred. No new
backlog ID or maintenance record is created. Representative evidence remains `ABSENT / BLOCKING`;
CAN-CUT-02 remains `OPEN / needs-owner-decision`; PR-11 and runtime cutover remain `NOT
AUTHORIZED`. REP-02 is eligible to start only after the owner provides a complete run-specific
package instance. Single next action: `OWNER INPUT REQUIRED — RUN-SPECIFIC PACKAGE INSTANCE`.

**ADR014-REP-01A-R2 Master Register Closure (2026-07-13):** Run-Specific Authorization Contract
Phase Separation is `CLOSED / CANONICAL / PHASED-CONTRACT-ONLY` after technical PR #1219 (head
`82ccff90f1734a623ef0928dcba6ab40c7ecd1b5`; squash
`3421f5c46b8b32268731fa6d96c72fd290c416b4`; CI `4/4 SUCCESS`; pre-merge `CLEAN /
MERGEABLE`). The exact four-file scope preserves the v1 one-shot contract and adds a pure,
immutable v2 phase boundary with direct functional/security tests and a runbook update. Pre-run
owner decisions now produce `PRE_RUN_AUTHORIZED / runtimeBindingStatus=RUNTIME_BINDING_REQUIRED`;
missing pre-run decisions remain execution blockers. Session, approved manifest, actual reviewer,
UTC windows and observed counts remain runtime/post-capture facts; missing facts block
`CAPTURE_COMPLETE` and evidence acceptance without invalidating the pre-run package. V2 supports
owner-controlled indefinite retention with `automaticDeletion=false`, owner-only disposition and
non-replacing supersession. `CAPTURE_COMPLETE` remains `representativeEvidenceAccepted=false`,
`rep02Authorized=false`, `pr11Ready=false`, `runtimeCutoverAuthorized=false` and
`authority=CAPTURE_REFERENCE_ONLY`. No package instance, data access, execution, evidence,
schema/migration, production call-site or authority change occurred. No new backlog or maintenance
ID is created. Representative evidence remains `ABSENT / BLOCKING`; CAN-CUT-02 remains open;
PR-11 and runtime cutover remain `NOT AUTHORIZED`. Next eligible workstream: separately
owner-authorized v2 pre-run package-instance materialization.

**ADR014-REP-01A-R2-I1 Master Register Closure (2026-07-14):** The first v2 pre-run
owner-decision instance is `CLOSED / CANONICAL / PRE-RUN-INSTANCE-ONLY` after technical PR #1224
(head `b4f88941360e7442430d98183f8967a3780f9312`; squash
`d15f35a327ea3ddda74a15cfb98414568214a32a`; CI `4/4 SUCCESS`; pre-merge `CLEAN / MERGEABLE`).
The exact five-file scope adds one pure instance materializer, functional/security tests, runbook
clarification and CI selection. Approved environment/data/operator/reviewer-policy/access/execution/
output/retention/sign-off/baseline decisions are bound to deterministic opaque references. The
verified canonical HEAD is supplied at materialization and validated by the unchanged v2 contract.
The result is `PRE_RUN_AUTHORIZED / runtimeBindingStatus=RUNTIME_BINDING_REQUIRED`, with
`executionStarted=false`, `representativeEvidenceProduced=false`,
`representativeEvidenceAccepted=false`, `rep02Authorized=false`, `pr11Ready=false` and
`runtimeCutoverAuthorized=false`. Exact manifest/approval, reviewer actor, session, UTC windows,
counts and capture hash remain runtime facts and are absent. No database access, representative
run, evidence, schema/migration, API/consumer or authority change occurred. No new backlog or
maintenance ID is created. Representative evidence remains `ABSENT / BLOCKING`; CAN-CUT-02 stays
open; PR-11 and runtime cutover remain `NOT AUTHORIZED`. Next action: `OWNER DECISION REQUIRED —
ADR014-REP-02 LOCAL REPRESENTATIVE EVIDENCE EXECUTION`; this closure does not grant that GO.

---
## D6 Domain — Borçlu Çapraz-Dosya Bildirimi & İlgili Framework'ler (2026-07-04, GO-ANALYZE + owner ratifikasyonu)

2026-07-04 tarihli D6 GO-ANALYZE (14 ajanlı workflow: repo forensics + bağımsız hukuki/mimari analiz + adversarial kritik + sentez) sonucu owner tarafından ratifiye edilen nihai mimari: bkz `docs/design/d6-final-architecture.md` (kanonik karar kaydı) ve `decision-log.md` 2026-07-04 satırları. **D6A-1** (PR #878) ve **D6A-2 çekirdek** (PR #880, `DebtorCrossCaseNotification`) KAPALI/DOKUNULMAZ — aşağıdaki maddeler yalnız bunların eksik dışa-açılan yüzünü (D6A-2-SURFACE) ve ayrı-epic frameworkleri (ESF, IAF) kapsar. "D6B" etiketi emekli edilmiştir, kullanılmaz.

---

**Status reconcile notu (2026-07-09, governance-only):** Repo kanıtı D6 bölümündeki bazı BACKLOG/READY ifadelerinin main'e merge edilmiş runtime gerçekliğini yansıtmadığını gösterdi. Bu patch yalnız bookkeeping düzeltmesidir; runtime/test/schema/migration değişikliği yoktur. `D6A-2-SURFACE-1` tamamen kapatılmaz, `PARTIAL / MERGED_CORE` olarak kalır; `D6-INACTIVE-RECIPIENT-SWEEP`, `D6-TEBLIGAT-BRIDGE` ve `D6-TASK-LINK` repo kanıtıyla CLOSED kabul edilir. Retention ailesi, `ESF-1` ve `IAF-1` statüleri bu patch'te açık/deferred kalır.

ID: D6A-2-SURFACE-1
Title: D6A-2 dışa açılan yüzü — list/acknowledge endpoint + expiry cron + gözlem
Problem: Reconcile öncesi kayıt `DebtorCrossCaseNotification` yüzeyini tamamen eksik gösteriyordu. Repo gerçeği: list/acknowledge endpoint'leri, expiry cron'u ve no-recipient `logger.warn` gözlemi merge edilmiş durumda; ancak backlog kapsamındaki reporting/groupBy sorguları ve create()/transaction hata yolu için persistent Hata Logları/event hook kanıtı bulunmadı.
Business Value: Üretilen bildirimler gerçekten sorumlu avukat/personel tarafından görülüp kapatılabilir hale gelir; sessiz-veri-kaybı riski gözlemlenebilir olur.
Technical Value: MERGED_CORE kapsamı: `listForRecipient()` + `GET /debtors/cross-case-notifications`, `POST /debtors/cross-case-notifications/:id/acknowledge`, `AutomationService.expireCrossCaseNotifications()` hourly cron wiring, `resolveRecipients()` boş dönüşünde `logger.warn`. Remaining follow-up: reporting/groupBy sorguları ve persistent error-log/event hook ayrı küçük follow-up olarak kalır; yeni migration gerekmez.
Priority: HIGH
Depends On: — (D6A-2 çekirdek zaten canlı)
Unlock Condition: Kalan follow-up'lar için ayrı owner GO gerekir.
Estimated Size: Remaining S (docs-reconciled; merged core already in main)
Related Modules: debtor-cross-case-notification.service.ts, debtor.controller.ts (veya yeni küçük controller), automation.service.ts
Status: PARTIAL / MERGED_CORE — repo kanıtı: `a421e93a` ile `listForRecipient()` + `GET /debtors/cross-case-notifications`, `POST /debtors/cross-case-notifications/:id/acknowledge`, `AutomationService.expireCrossCaseNotifications()` hourly cron wiring ve `resolveRecipients()` boş dönüşünde `logger.warn` merge edildi. Fully CLOSED değil; reporting/groupBy sorguları ve persistent error-log/event hook follow-up açık.

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

ID: D6-RETENTION (ŞEMSİYE — bkz alt-maddeler, bu ID artık doğrudan implement edilmez)
Title: D6A-2 retention/anonymize politikası (Q2 çerçeve kararının implementasyonu)
Problem: `DebtorCrossCaseNotification` kayıtları (PENDING/ACKNOWLEDGED/EXPIRED) süresiz saklanıyor; ne purge ne anonymize mekanizması var — KVKK veri-minimizasyonu açısından bir risk yüzeyi.
Business Value: KVKK m.4/m.7 uyumluluğu; aynı zamanda özen-borcu audit izini erken silmeden dengeli bir saklama rejimi.
Technical Value: Bu şemsiye madde, aşağıdaki 5 alt-maddeye BÖLÜNMÜŞTÜR (2026-07-05, owner kararı — bkz `docs/design/d6-kvkk-retention-policy.md`).
Priority: MEDIUM
Depends On: —
Unlock Condition: —
Estimated Size: — (alt-maddelere bakın)
Related Modules: d6-retention-decision.provider.ts, schema.prisma (DebtorCrossCaseNotification, SystemConfig)
Status: SPLIT — bu governance kaydı, gerçekte zaten MERGED olan PR #935'i (D6-RETENTION-POLICY-INFRA) yansıtmıyordu; bu commit ile düzeltildi. Aşağıdaki 5 alt-madde bu şemsiyenin yerini alır.

ID: D6-RETENTION-POLICY-INFRA
Title: Policy-driven retention eligibility karar katmanı (hardcoded süre yok)
Problem: Retention kararının kod içinde sabit gün sayısıyla değil, tenant-scoped `SystemConfig` kaydından okunan bir politikayla verilmesi gerekiyordu.
Business Value: Büroda resmi KVKK politikası girilmeden hiçbir kayıt "silinebilir" sayılmaz (fail-closed) garantisi.
Technical Value: `D6RetentionDecisionProvider.getPolicy()`/`isEligibleForDeletion()` — `SystemConfig` key=`d6_retention_policy`'den okur, `enabled!==true` ise NULL (fail-closed). `hardCeilingDays` bağımsız üst sınır; `caseClosureBufferDays` case açıkken bloke eder; "hangisi uzunsa" ilkesi uygulanır. Gerçek silme/cron/wiring YOK — yalnız karar katmanı. 19 yeni test + tam modül regresyonu 30 suite/272 test PASS.
Priority: —
Depends On: `docs/design/d6-legal-semantics-triage.md` Q2 (çerçeve kararı)
Unlock Condition: —
Estimated Size: S
Related Modules: d6-retention-decision.provider.ts
Status: DONE — **MERGED**. PR #935, commit `c3e7d1e7`. Bu governance kaydı daha önce hiç yazılmamıştı (drift); bu commit ile retroaktif olarak kayda geçirildi.

ID: D6-RETENTION-POLICY-DOC
Title: Resmi KVKK saklama/imha politika iskeleti (docs-only scaffold)
Problem: D6-RETENTION-DELETE'e geçmeden önce veri envanteri, hukuki dayanak taslağı, yetki matrisi, SystemConfig sözleşmesi ve açık karar noktalarının resmi bir belgede toplanması gerekiyordu.
Business Value: Yazılımın hukukî karar üreten değil, resmen kabul edilmiş kurumsal politikayı uygulayan bir sistem olması.
Technical Value: `docs/design/d6-kvkk-retention-policy.md` — 11 başlık (Scope/Evidence/Data Inventory/Legal Basis Draft/Retention Decision Model/SystemConfig Contract/Authorization Matrix/Deletion Method/Open Decisions/Delete Phase Blockers/References). Kod/migration YOK.
Priority: HIGH
Depends On: D6-RETENTION-POLICY-INFRA (DONE)
Unlock Condition: —
Estimated Size: — (docs-only)
Related Modules: docs/design/d6-kvkk-retention-policy.md
Status: DONE — bu commit ile eklendi. Owner kararları (hukuki dayanak taslağı KVKK m.5/2-e+f, gün sayıları TBD, yetki=PARTNER/ADMIN, policyReference=YES ayrı scope, SystemConfig yazma=ops-script/seed ilk faz) belgeye işlendi.

ID: D6-RETENTION-POLICY-REF
Title: `policyReference` alanı — interface + provider validation
Problem: `enabled=true` yapıldığında hangi resmi politika belgesine dayandığının izlenebilir olması gerekiyor; bugün `D6RetentionPolicy`'de böyle bir alan yok.
Business Value: Her aktif retention konfigürasyonunun hangi resmi belgeye/versiyona dayandığı denetlenebilir olur.
Technical Value: `D6RetentionPolicy.policyReference?: string | null` eklenir; `enabled=true` iken `policyReference` boş/null ise provider reddeder (validation). Format: `KVKK-D6-RETENTION-vYYYY-MM-DD`. `deleteMany`/cron YOK.
Priority: —
Depends On: D6-RETENTION-POLICY-DOC (DONE)
Unlock Condition: Owner GO-IMPLEMENT onayı
Estimated Size: S
Related Modules: d6-retention-decision.provider.ts, d6-retention-decision.provider.spec.ts
Status: BACKLOG — henüz GO-IMPLEMENT verilmedi.

ID: D6-RETENTION-CONFIG-ADMIN
Title: SystemConfig `d6_retention_policy` için admin endpoint/UI (ikinci faz)
Problem: Bugün `SystemConfig` kaydını yazan hiçbir HTTP endpoint/UI yok; ilk faz kasıtlı olarak yalnız audited ops-script/seed üzerinden yazılacak.
Business Value: Politika nadiren değiştiği ve hukuki onay gerektirdiği için ilk fazda UI açmamak gereksiz risk/scope büyütmeyi önler; ikinci fazda gerçek ihtiyaç doğarsa PARTNER/ADMIN-gated bir yüzey açılabilir.
Technical Value: —
Priority: LOW
Depends On: resmi retention politikası netleşmesi, D6-RETENTION-POLICY-REF (policyReference desteği), PARTNER/ADMIN yetki kararının uygulanması
Unlock Condition: Owner GO-IMPLEMENT onayı — üç bağımlılık da kapanmadan açılmaz
Estimated Size: —
Related Modules: —
Status: BACKLOG — owner-gated, ilk faz (ops-script/seed) yeterli kabul edildi.

ID: D6-RETENTION-DELETE
Title: Gerçek `deleteMany` + cron + module wiring (hard-delete)
Problem: `D6RetentionDecisionProvider` yalnız karar veriyor; hiçbir yerde gerçek silme/cron/wiring yok.
Business Value: KVKK m.4/m.7 veri-minimizasyonu yükümlülüğünün fiilen yerine getirilmesi.
Technical Value: Hard-delete öngörülen imha yöntemidir (şema non-nullable FK'ler nedeniyle anonymize migration gerektirirdi — owner 2026-07-05'te bu revizyonu onayladı, bkz `docs/design/d6-kvkk-retention-policy.md` Bölüm 8). `NotificationRetentionService.deleteEligibleNotifications()` + cron (muhtemelen `automation.service.ts` idiomu) + `DebtorModule`'e provider wiring.
Priority: —
Depends On: D6-RETENTION-POLICY-DOC (DONE), D6-RETENTION-POLICY-REF, D6-RETENTION-CONFIG-ADMIN (veya bilinçli ops-script-only karar)
Unlock Condition: 4 blocker owner tarafından tek tek kapanmalı — (1) resmi KVKK Saklama/İmha politikası onayı, (2) kesin resolvedRetentionDays/caseClosureBufferDays/hardCeilingDays, (3) policyReference implementasyon kararı, (4) SystemConfig yazma yolu kararının fiilen uygulanması. Dördü kapanmadan bu madde için GO-ANALYZE bile önerilmez.
Estimated Size: M (BE — cron + gerçek silme + wiring, migration muhtemelen gerekmez)
Related Modules: d6-retention-decision.provider.ts, automation.service.ts (muhtemel), schema.prisma (DebtorCrossCaseNotification)
Status: BLOCKED — owner-gated, yukarıdaki 4 blocker kapanmadan başlamaz.

ID: D6-INACTIVE-RECIPIENT-SWEEP
Title: Deaktif alıcının PENDING D6 bildirimlerini erken-expire eden sweep (Q3)
Problem: `resolveRecipients()` yalnız ÜRETİM anında `user.isActive` kontrol ediyor; üretimden sonra deaktive olan bir personelin var olan PENDING kayıtları hiç ek işlem görmeden kalıcı olarak "kimse görmeyecek" halde PENDING kalabilir.
Business Value: Sessiz/asla-görülmeyecek PENDING birikimini önler; gözlem/raporlama netliği.
Technical Value: `DebtorCrossCaseNotificationService.expireStaleNotificationsForInactiveRecipients()` + `AutomationService.expireInactiveRecipientCrossCaseNotifications()` hourly cron wiring merge edildi. Migration yok; yalnız PENDING kayıtlar etkilenir, ACKNOWLEDGED/EXPIRED dokunulmaz.
Priority: LOW
Depends On: —
Unlock Condition: —
Estimated Size: DONE
Related Modules: debtor-cross-case-notification.service.ts, automation.service.ts
Status: CLOSED — MERGED. Repo kanıtı: `728f979b` (inactive-recipient sweep service + cron + tests). Migration yok; yalnız PENDING kayıtlar etkilenir, ACKNOWLEDGED/EXPIRED dokunulmaz.

ID: D6-TEBLIGAT-BRIDGE
Title: CaseDebtor bazında aktif Tebligat sinyali — salt-okuma bridge (Q5, Tebligat-only)
Problem: Borçlu adres/kimlik değişikliği aktif bir tebligat sürecini etkileyebilir ama D6A-2 bu etkiyi üretmez. Repo gerçeği: aktif Tebligat sinyali salt-okuma bridge olarak merge edildi; Collection bilinçli olarak kapsam dışı bırakıldı.
Business Value: Görünürlük artışı — avukat manuel incelemeye yönlendirilir; D6'nın hukukî sınırı (otomatik hüküm üretmeme) korunarak.
Technical Value: `GET /debtors/case-debtors/:caseDebtorId/active-process-summary` + `CaseDebtorService.getActiveProcessSummary()` merge edildi. Salt-okuma Tebligat sayımı yapar, `manualReviewRecommended` döner, D6A-2/Collection/Tebligat kayıtlarına yazmaz. Migration yok.
Priority: MEDIUM
Depends On: —
Unlock Condition: —
Estimated Size: DONE
Related Modules: debtor-cross-case-notification.service.ts, Tebligat, CaseDebtor
Status: CLOSED — MERGED, Tebligat-only. Repo kanıtı: `bcdcc0bd` (`GET /debtors/case-debtors/:caseDebtorId/active-process-summary` + `CaseDebtorService.getActiveProcessSummary()`). Collection signal ayrı adaydır; bu kapanışın parçası değildir. D6 otomatik hukukî hüküm ÜRETMEYECEK ilkesi korunur.

ID: D6-TASK-LINK
Title: acknowledge sonrası opsiyonel Task/workflow linki (Q6)
Problem: D6A-2 modelinde "gördüm" (acknowledgedAt) dışında hiçbir "önlem alındı" izi yoktu; repo gerçeği: D6A-2 çekirdeğine yazmadan, kullanıcı-tetikli idempotent Task oluşturma yüzeyi merge edildi.
Business Value: "Gördüm" ile "işlem yaptım" hukukî/operasyonel ayrımını net tutarken, isteyen ekiplere iş-takibi imkânı sağlar.
Technical Value: `POST /debtors/cross-case-notifications/:id/create-task` + `DebtorCrossCaseNotificationTaskLinkService.createTaskForNotification()` merge edildi. `Task.dedupeKey = "D6-TASK-LINK:" + notification.id` ile idempotenttir. D6A-2 şemasına `linkedTaskId` eklenmedi; migration yok; acknowledge semantiği değişmedi.
Priority: LOW
Depends On: D6A-2-SURFACE core (merged)
Unlock Condition: —
Estimated Size: DONE
Related Modules: debtor-cross-case-notification.service.ts, Task domain, schema.prisma
Status: CLOSED — MERGED. Repo kanıtı: `4a53c222` (`POST /debtors/cross-case-notifications/:id/create-task` + `DebtorCrossCaseNotificationTaskLinkService.createTaskForNotification()`). No `linkedTaskId`, no migration, no D6A-2 lifecycle write; idempotency `Task.dedupeKey = "D6-TASK-LINK:" + notification.id` ile sağlanır.

## CAN-P0-001 — Canonicalization P0 Remediation (ARCHITECTURAL_DRIFT temizliği, 2026-07-05, 2026-07-06'da böldü)

**Governance düzeltmesi (2026-07-06):** Bu madde ilk açıldığında (2026-07-05) 3 ARCHITECTURAL_DRIFT alt-maddesini (CAN-DRIFT-01/02/03) tek `CAN-P0-001` kaydı altında topluyordu. PR #981 yalnız CAN-DRIFT-01'i (icrabot email/SMS notification truth) kapattı; CAN-DRIFT-02 (icrabot→Case bypass) ve CAN-DRIFT-03 (workflowStage single-owner) implemente EDİLMEDİ. D6-RETENTION'da uygulanan desenle tutarlı olarak, kayıt owner talimatıyla ikiye bölündü: `CAN-P0-001` artık YALNIZ icrabot email/SMS truth kapsamını temsil eder (CLOSED), kalan iki alt-madde `CAN-P0-002`'ye taşındı (NEXT/PENDING, değişmedi).

ID: CAN-P0-001
Title: icrabot email/SMS notification truth — send_email/send_sms provider-success olmadan 'sent' yazmasın
Problem: `canonicalization-register.md` CAN-DRIFT-01 — `action-handler.service.ts:485-533`'teki `send_email`/`send_sms` handler'ları hiçbir zaman gerçek bir provider'a bağlı değildi ama `IcrabotEmailLog.status`/`IcrabotSmsLog.status`'a koşulsuz `'sent'` yazıyordu.
Business Value: icrabot bildirim doğruluğu — gerçek provider onayı olmadan "gönderildi" denmemesi; sessiz/yanıltıcı "sent" kaydı riskini kapatır.
Technical Value: `ICRABOT_NOTIFICATION_NOT_SENT_STATUS = 'NOT_SENT'` sabiti eklendi; her iki handler artık provider entegrasyonu gelene kadar `NOT_SENT` yazıyor. Schema değişikliği yok (`status` her iki modelde de serbest `String`, enum değil).
Priority: HIGH (register'da P0 = "önce temizlenir")
Depends On: CAN-REG-001 (MERGED, PR #977)
Unlock Condition: — (implemente edildi, kapandı)
Estimated Size: S (BE — tek dosya + tek yeni test dosyası, migration yok)
Related Modules: action-handler.service.ts, action-handler-notification-truth.spec.ts
Status: **CLOSED/MERGED** — PR #981 squash merged, SHA `2646e0f3e6e57b1ff97f3ec26a412d948133f807`; CI 4/4 PASS (Architectural Guardrails, Client Workspace Live Smoke, Test Suite, Web Tests (vitest)); mergeStateStatus CLEAN; diff yalnız 2 dosya (`action-handler.service.ts` + yeni `action-handler-notification-truth.spec.ts`); hedeflenen test 5/5 PASS (`--forceExit` olmadan, asılı kalma yok), modül regresyonu `icrabot/v28-engine` 33 passed/2 skipped (pre-existing)/1 suite skipped (pre-existing) — regresyon yok. Migration/schema/package/lock değişikliği YOK. `send_notification`, `webhook`/`IcrabotWebhookLog`, `CaseService`, `workflowStage`, `Due/ClaimItem`, `validation-gate`, `policy-engine`, `DebtorAddress` dokunulmadı.

## CAN-P0-002 — Icrabot Case direct-write bypass (NO_SAFE_PATCH / VERIFICATION_REQUIRED, 2026-07-06 patch-generation denemesi sonucu yeniden sınıflandırıldı)

**Governance düzeltmesi (2026-07-06, 2. tur):** CAN-P0-002 ilk açıldığında (2026-07-06, 1. tur) "NEXT/PENDING" olarak kaydedilmişti ve CAN-DRIFT-02/03'ü tek kapsam olarak topluyordu. Owner talimatıyla patch-generation denemesi yapıldı (base HEAD `e65dc08564c09bfbe6db09a680606ac3d4b1f828`, working tree temiz) ve **güvenli/dar bir patch üretilemedi** — sonuç `NO_SAFE_PATCH / VERIFICATION_REQUIRED` olarak kaydedildi (kod/commit/PR/branch YOK, yalnız bu bulgu). Denemede 6 direct-write noktası tespit edildi (önceki bir taslak metinde yanlışlıkla "5" denmişti — bu düzeltildi). Owner kararıyla madde 3 alt-parçaya bölündü (CAN-P0-002-A/B/C) + `workflowStage`/`nextActionAt`/`riskScore` karışan noktalar ayrı `CAN-P0-003`'e taşındı.

ID: CAN-P0-002
Title: Icrabot → Case direct-write bypass — 6 tespit edilen nokta, güvenli dar patch üretilemedi
Problem: icrabot modülünde `Case` core aggregate'ine `CaseService`'i bypass eden 6 direct-write noktası tespit edildi:
```text
1. job-monitor.service.ts:136 — Case.metadata quarantine flag — patch yok (CaseService.patchFlags metadata allowlist içermiyor; DI genişlemesi + audit/side-effect riski)
2. job-monitor.service.ts:174 — Case.metadata unquarantine — patch yok (#1 ile aynı gerekçe)
3. icrabot.service.ts:118,153 — isAutomationEnabled + isAutoMode — patch yok (isAutomationEnabled patchFlags allowlist'te olabilir, isAutoMode değil; CaseService injection + audit davranış değişikliği ayrı GO-FIX gerektirir)
4. icrabot.service.ts:358 — workflowStage — CAN-P0-003'e taşındı, patch yok
5. task-orchestrator.service.ts:307 applyUpdates — workflowStage/nextActionAt/riskScore — CAN-P0-003'e taşındı, patch yok (workflowStage aynı update payload içinde karışık, dar patch ile güvenli ayrılamıyor)
6. action-handler.service.ts:571 update_case_status — legacy Case.status — patch yok (en kritik bulgu: CaseStatusService.changeStatus() yanlış canonical target olur — o servis caseStatus/LegalCaseStatus semantiğini yönetiyor, legacy status/CaseStatus alanını DEĞİL; dar canonical write owner yok)
```
Business Value: Planlanmamış çoklu-yazıcı riskinin körlemesine (yanlış owner'a bağlanarak) "çözülmüş" gibi görünüp aslında sessiz semantik bozulma yaratmasını önler.
Technical Value: `canonicalization-policy.md` §7 kuralı ihlali doğrulandı, ama düzeltme dar bir patch değil, üç ayrı owner kararı + bir ayrı orchestration refactor'u gerektiriyor — bu yüzden tek patch olarak zorlanmadı.
Priority: HIGH (register'da P0 = "önce temizlenir") — ama **VERIFICATION_REQUIRED** olduğu için implementasyon başlamıyor.
Depends On: CAN-REG-001 (MERGED, PR #977). CAN-P0-001 (MERGED, PR #981) — kardeş madde, teknik bağımlılık yok.
Unlock Condition: Bu madde artık tek bir GO-IMPLEMENT ile açılamaz. Alt-parçalara bölündü — her biri kendi owner kararını ve ayrı GO-ANALYZE/GO-FIX'ini gerektirir (aşağıya bakın).
Estimated Size: — (parent kayıt artık implementasyon birimi değil, yalnız sınıflandırma/yönlendirme kaydı)
Related Modules: job-monitor.service.ts, icrabot.service.ts, task-orchestrator.service.ts, action-handler.service.ts, case.service.ts
Status: **NO_SAFE_PATCH / VERIFICATION_REQUIRED** — main'de implemente EDİLMEDİ, implemente EDİLEMEDİ (dar/güvenli patch üretilemedi). Kod/commit/PR/branch YOK.

## CAN-P0-002-A — Icrabot automation flags canonicalization

**Governance güncellemesi (2026-07-09, GO-ANALYZE sonrası):** Owner talimatıyla GO-ANALYZE tamamlandı (kod yazılmadı, yalnız statik trace + tüketici haritası). **Sonuç: tek patch'e zorlanmadı, CAN-P0-002/CAN-P0-002-B emsaliyle tutarlı şekilde 3 alt-maddeye bölündü.** Ana bulgu: `isAutomationEnabled` ve `isAutoMode` **aynı bounded context'e ait DEĞİL** — `isAutomationEnabled` statü-güdümlü bir izin kapısı (`CaseStatusService.changeStatus()` tarafından `HITAM/INFAZ/MUVEKKILE_IADE/ACIZ/BATAK/MAHSUP/TEMLIK` statülerinde bilinçli olarak `false` yazılıyor, `case-status.service.ts:117-121`; `scheduler.service.ts`'in 3 ayrı cron sorgusu ve `CaseSummaryCard.tsx`/`AutomationPanel.tsx` bunu tek başına okuyor), `isAutoMode` ise kullanıcının fiilen bastığı otomasyon toggle'ı (`AutomationPanel.tsx`'te ayrı buton; `workflow-engine.service.ts:127` ve `automation.service.ts`'in notification-yolu YALNIZ bunu kontrol ediyor). `icrabot.service.ts:118-124`'ün `startAutomation()`'ı ikisini birlikte, statü/gate kontrolü YAPMADAN `true` yazması — kapanmış/HITAM bir dosyada bile `CaseStatusService`'in bilinçli kill-switch'ini sessizce ezebilecek gerçek bir risk (teorik değil, kod okunarak doğrulandı). `isAutomationEnabled` için mevcut owner (`CaseService.patchFlags()`, case.service.ts:2371) zaten allowlist'te ve audit'li — icrabot bunu çağırmıyor, yol eksik değil, atlanıyor; human-actor de mevcut (`icrabot.controller.ts` JwtAuthGuard korumalı, `req.user` var, yalnız `userId` şu an threadlenmiyor). `isAutoMode` için mevcut "owner" (`AutomationService.toggleAutoMode()`, automation.service.ts:342) kendisi de audit'siz/tenant-guard'sız, genişletilmesi `nextActionAt` side-effect'i getirir (icrabot'un bugünkü davranışında yok). Analiz sırasında, bu ticket'ın kapsamı DIŞINDA ayrı bir bulgu ortaya çıktı: `automation.service.ts:154`'ün notification-tetikli işleme yolu `isAutomationEnabled` kill-switch'ini hiç kontrol etmiyor (cron yolu kontrol ediyor) — bu CAN-P0-002-A3 olarak ayrı triage'a açıldı, kapsam büyütülmedi.

ID: CAN-P0-002-A
Title: isAutomationEnabled / isAutoMode direct-write bypass canonicalization (parent — 3 alt-maddeye bölündü)
Problem: `icrabot.service.ts:118,153` `isAutomationEnabled` + `isAutoMode` alanlarına `CaseService`'i bypass ederek doğrudan yazıyor.
Business Value: Otomasyon durumu yazımının tek, denetlenebilir bir yoldan geçmesini sağlar.
Technical Value: `isAutomationEnabled`'ın `CaseService.patchFlags` allowlist'ine eklenip eklenemeyeceği, `isAutoMode`'un ayrı ele alınması gerektiği, `IcrabotService`'e `CaseService` injection'ının audit/duplication etkisi — hepsi ayrı GO-FIX kapsamında değerlendirilecek.
Priority: HIGH
Depends On: CAN-P0-002 (parent, VERIFICATION_REQUIRED)
Unlock Condition: Owner GO-ANALYZE tamamlandı (bu kayıt) — implementasyon alt-maddelerin kendi GO-FIX onayını bekliyor.
Estimated Size: M (BE — DI + allowlist kararı + audit doğrulama)
Related Modules: icrabot.service.ts, case.service.ts, automation.service.ts, case-status.service.ts, scheduler.service.ts
Status: **NO_SAFE_PATCH / VERIFICATION_REQUIRED** — parent madde olarak implemente EDİLMEDİ, 3 alt-maddeye bölündü (aşağıda).

## CAN-P0-002-A1 — isAutomationEnabled direct-write → CaseService.patchFlags redirect

**Governance güncellemesi (2026-07-09, GO-FIX + merge sonrası):** Owner dar kapsamlı GO-FIX verdi (yalnız bu redirect; `isAutoMode`/`AutomationService`/`nextActionAt`/`workflowStage`/A2/A3/CAN-P0-003/schema/migration kesin yasaktı). İzole `origin/main`-tabanlı worktree'de (`HUKUK_can-p0-002-a1-fix`) uygulandı: `IcrabotModule` artık `CaseModule`'ü import ediyor, `IcrabotService` `CaseService`'i inject ediyor, `startAutomation()`/`stopAutomation()` artık `patchFlags(tenantId, caseId, {isAutomationEnabled}, {userId})` çağırıyor (`userId` `icrabot.controller.ts`'teki `req.user.id`'den thread edildi). `isAutoMode` yazımı bilinçli olarak aynen bırakıldı (ayrı `prisma.case.update()` çağrısına taşındı, değer/koşul DEĞİŞMEDİ). Hiçbir kaçış koşulu (owner'ın önceden tanımladığı NO_SAFE_PATCH tetikleyicileri) tetiklenmedi. Doğrulama: CI'ın gerçek type-check komutu (`tsc --noEmit -p tsconfig.prod.json`) temiz; `icrabot-digital-twin-tenant-guard.spec.ts` (patchFlags-redirect assertion'ları eklenerek güncellendi) 22/22 PASS; `case-flags-audit.spec.ts` (hiç değiştirilmedi, regresyon kontrolü) 5/5 PASS. Diff merge-base'e göre kesinlikle 4 dosya.

ID: CAN-P0-002-A1
Title: `icrabot.service.ts`'in `isAutomationEnabled` yazımını `CaseService.patchFlags()`'e yönlendirme
Problem: `startAutomation()`/`stopAutomation()` (icrabot.service.ts:118,156) `isAutomationEnabled`'ı ham `prisma.case.update()` ile, statü/gate kontrolü olmadan yazıyor — `CaseStatusService`'in HITAM/INFAZ/vb. statülerde bilinçli kapattığı kill-switch'i sessizce ezebiliyor, audit trail yok.
Business Value: Statü-güdümlü otomasyon kill-switch'inin icrabot tarafından sessizce ezilmesini önler; audit trail ekler.
Technical Value: Owner zaten var ve audit'li (`CaseService.patchFlags()`, allowlist'te `isAutomationEnabled` mevcut) — yalnız çağrı yeri değişmeli + `userId` threading (`icrabot.controller.ts`'teki `req.user`'dan) eklenmeli. `nextActionAt` side-effect'i yok (her iki yol da dokunmuyor) — davranış değişikliği yalnız audit ekleme + statü-kill-switch koruması.
Priority: HIGH (gerçek correctness riski — kill-switch bypass)
Depends On: CAN-P0-002-A (parent, NO_SAFE_PATCH/VERIFICATION_REQUIRED)
Unlock Condition: Yok — implemente edildi, merge edildi. Ek yetkilendirme gerekmiyor.
Estimated Size: S-M (BE — çağrı yeri değişikliği + userId threading + 1 test güncellemesi)
Related Modules: icrabot.service.ts, icrabot.controller.ts, icrabot.module.ts, case.service.ts, icrabot-digital-twin-tenant-guard.spec.ts
Status: **CLOSED/MERGED** — PR #1006, squash SHA `0367ba163dbce1f234df56be112c9ee6c1c08a70`; CI 4/4 PASS (Architectural Guardrails/Test Suite/Web Tests (vitest)/Client Workspace Live Smoke), mergeStateStatus CLEAN (merge öncesi doğrulandı); diff kesinlikle 4 dosya (`icrabot.service.ts`+`icrabot.controller.ts`+`icrabot.module.ts`+test), migration/schema/package/lock değişikliği YOK. `isAutoMode`/`AutomationService`/`nextActionAt`/`workflowStage`'e dokunulmadı (doğrulandı). Remote branch silindi; izole worktree'de `git worktree remove --force` "Filename too long" hatası verdi (Windows path-limiti, pnpm node_modules) — git-side unregistered oldu ama fiziksel dizin force-delete EDİLMEDİ, `ORPHANED_WORKTREE_DIR` olarak bırakıldı (`C:\Development\HUKUK_YAZILIMI\HUKUK_can-p0-002-a1-fix`). Ana canonical `main`'e hiç dokunulmadı.

## CAN-P0-002-A2 — isAutoMode owner/audit/tenant/nextActionAt tasarım kararı

ID: CAN-P0-002-A2
Title: `isAutoMode` için audit'li, tenant-guard'lı bir owner tasarımı gerekip gerekmediği kararı
Problem: `icrabot.service.ts:118,153` `isAutoMode`'u ham yazıyor; mevcut "owner" adayı (`AutomationService.toggleAutoMode()`, automation.service.ts:342) de audit'siz ve tenant-guard'sız — icrabot'u ona yönlendirmek sorunu çözmez, yalnız taşır. Ayrıca `toggleAutoMode()` `nextActionAt`'a da dokunuyor (icrabot'un bugünkü davranışında olmayan yeni bir side-effect).
Business Value: `isAutoMode` yazımının da denetlenebilir/tenant-güvenli hale gelmesi (bugün ikisi de değil).
Technical Value: Kendi başına bir tasarım kararı gerekir — `AutomationService`'e audit+tenant-guard eklenmesi mi, yoksa `CaseService`'te `isAutoMode`'a özel dar bir metot mu, `nextActionAt` side-effect'inin icrabot akışına eklenmesinin kabul edilebilir olup olmadığı.
Priority: MEDIUM (isAutomationEnabled'daki kadar acil correctness riski yok — ama audit boşluğu gerçek)
Depends On: CAN-P0-002-A (parent, NO_SAFE_PATCH/VERIFICATION_REQUIRED)
Unlock Condition: Owner GO-ANALYZE (tasarım kararı) + ayrı GO-FIX onayı.
Estimated Size: M (BE — tasarım kararı + audit/tenant-guard ekleme, hangi serviste netleşecek)
Related Modules: icrabot.service.ts, automation.service.ts, automation.controller.ts
Status: **VERIFICATION_REQUIRED** — implemente EDİLMEDİ, tasarım kararı bekliyor.

## CAN-P0-002-A3 — AutomationService notification path kill-switch bypass (yeni bulgu, CAN-P0-002-A GO-ANALYZE sırasında keşfedildi)

ID: CAN-P0-002-A3
Title: `automation.service.ts`'in notification-tetikli işleme yolu `isAutomationEnabled` kill-switch'ini kontrol etmiyor
Problem: `automation.service.ts:46-50`'deki cron sorgusu (`processPendingCases`) hem `isAutoMode` hem `isAutomationEnabled`'ı AND'liyor; ama `automation.service.ts:154`'teki notification-tetikli yol (`if (notification.case?.isAutoMode && ...)`) YALNIZ `isAutoMode`'a bakıyor — `isAutomationEnabled=false` (statü-kapalı) bir dosyada `isAutoMode` hâlâ `true` ise (icrabot'un CAN-P0-002-A1 düzeltilmeden önceki davranışıyla mümkün), bu yol kill-switch'i atlayıp `workflowEngine.processCase()`'i çağırabilir.
Business Value: Kapanmış/statü-kapalı dosyalarda otomasyonun her koşulda durdurulduğunun garanti edilmesi.
Technical Value: `automation.service.ts:154`'e `isAutomationEnabled` kontrolü eklenmesi gerekip gerekmediği — bu CAN-P0-002-A'nın icrabot direct-write kapsamından TAMAMEN BAĞIMSIZ, `AutomationService`'in kendi iç tutarlılık sorunu.
Priority: MEDIUM-HIGH (correctness riski, ama icrabot'un direct-write'ından ayrı bir kök neden)
Depends On: Yok — bağımsız bulgu, CAN-P0-002-A1/A2'nin sonucunu beklemez.
Unlock Condition: Owner triage — bu maddenin kapsamı, önceliği ve GO-ANALYZE/GO-FIX ayrımı henüz belirlenmedi.
Estimated Size: S (BE — muhtemelen tek koşul eklemesi, ama önce GO-ANALYZE ile diğer çağrı yolları da taranmalı)
Related Modules: automation.service.ts
Status: **NEW FINDING / TRIAGE REQUIRED** — implemente EDİLMEDİ, henüz GO-ANALYZE bile görmedi.

## CAN-P0-002-B — Legacy Case.status write owner decision

**Governance güncellemesi (2026-07-06, GO-ANALYZE + RUNTIME-VERIFY sonrası):** İki ayrı doğrulama turu tamamlandı — (1) statik trace: schema semantiği + read/write haritası + owner adayları, (2) runtime-verify: yerel dev DB'de `IcrabotRulePack`/`IcrabotRule`/`IcrabotRuleRevision`/`IcrabotOutboxAction`/`CaseLifecycle` tabloları salt-okunur sorgulandı. Sonuç aşağıda; **implementasyon bu turda da YAPILMADI.**

ID: CAN-P0-002-B
Title: action-handler.service.ts update_case_status — legacy Case.status için doğru canonical write owner kararı
Problem: `action-handler.service.ts:579-587` `update_case_status` action'ı legacy `Case.status` alanına ham `prisma.case.update()` ile doğrudan yazıyor (enum doğrulaması yok, `auditService.log()` çağrılmıyor). `CaseStatusService.changeStatus()` yanlış hedef — o servis yalnız `caseStatus`/`isAutomationEnabled` yazıyor (case-status.service.ts:127-130 ile doğrulandı), legacy `status`/`CaseStatus` alanına HİÇ dokunmuyor. Legacy alan "ölü legacy" değil — GET /cases?status= liste filtresi (case.controller.ts:49→case.service.ts:827), dashboard sayaçları (case.service.ts:2292-2293), create/update DTO'ları (`@IsEnum(CaseStatus)`, dto/case.dto.ts:462,711) ve frontend (cases list/edit/detail, BulkOperationsPanel, case-statuses.ts) üzerinden aktif okunuyor/yazılıyor.
**YENİ BULGU (statik trace):** `CaseService.update()` (genel PUT /cases/:id) zaten legacy `status`'u generic data spread'inden ÇIKARMIYOR (yalnız `caseStatus` ve `clientId` açıkça siliniyor, case.service.ts:2132-2154) — yani doğru alana yazan, DTO-doğrulanmış, audit'li bir yol teknik olarak zaten var. Ama bu, gerçek `userId` (insan aktör) gerektiren, geniş-yüzeyli bir genel update metodu — SYSTEM-tetikli otomatik bir action handler için otomatik uygun owner SAYILMAZ (dar, semantik olarak birebir bir metot yok).
**RUNTIME-VERIFY BULGUSU (2026-07-06):** Yerel dev DB'de (`hukuk_db`) `IcrabotRulePack`/`IcrabotRule`/`IcrabotRuleRevision` tabloları TAMAMEN BOŞ (0/0/0) — rule engine bu ortamda hiç yapılandırılmamış. `IcrabotOutboxAction`'da tüm zamanların `actionType` dağılımı yalnız 4 farklı `EVENT_PUBLISHED:*` değeri (91 satır, hepsi `domain-event-ingest.service.ts` kaynaklı) — `update_case_status` dahil ActionHandlerService'in KAYITLI HİÇBİR action type'ı (send_email/send_sms dahil — CAN-P0-001'de az önce düzeltilen, kesinlikle canlı/kasıtlı handler'lar) bu DB'de hiç üretilmemiş. `CaseLifecycle` tablosu toplam 0 satır. **Bu sonuç confounded/inconclusive sayıldı:** aynı sıfır-satır deseni, bilinen-canlı `send_email`/`send_sms` için de çıkıyor — yani "rule engine bu dev DB'de hiç kurulmamış" ile "update_case_status'a özgü olarak hiç kullanılmamış" ayırt edilemiyor. Owner kararı: **bu kanıt cleanup için yeterli değil**, DEAD_OR_ORPHANED_ACTION_REMOVE_CANDIDATE kararı bu yüzden verilmedi.
Business Value: Yanlış canonical servise körlemesine bağlanarak sessiz semantik bozulma (status'un iki farklı anlamının karışması) riskini önler — en kritik bulgu.
Technical Value: Dar, explicit bir owner method (örn. `CaseService.setLegacyStatus()` benzeri, sistem/otomasyon aktörünü kabul eden, `CaseService.update()`'in enum-doğrulama+audit desenini yeniden kullanan ama insan-aktör zorunluluğu olmayan) tasarlanacak — implementasyon ayrı GO-FIX ile yapılacak, bu kayıtla yetkilendirilmez.
Priority: **CRITICAL** — owner'ın "en önce bu yapılmalı" değerlendirmesi: legacy alan aktifse yanlış owner'a bağlanmak sessiz semantik bozulma yaratır.
Depends On: CAN-P0-002 (parent, NO_SAFE_PATCH/VERIFICATION_REQUIRED)
Unlock Condition: Owner GO-ANALYZE tamamlandı (bu kayıt) + owner kararı (doğru canonical owner tasarımı) + GO-FIX onayı. **Production trace gate:** CAN-P0-002-B-FIX implementasyonuna geçilmeden önce, production/staging rule pack içeriğinde `update_case_status` action'ının gerçekten referans alınıp alınmadığı ayrıca doğrulanmalı (yerel dev DB bunu kanıtlayamadı — bkz. yukarı). Varsa handler owner method'a yönlendirilecek; yoksa handler cleanup'ı (CAN-P0-002-B-CLEANUP) ayrı bir karar olarak açık kalacak.
Estimated Size: M (BE — dar servis metodu tasarımı + production trace doğrulaması; migration muhtemelen gerekmez, teyit gerekir)
Related Modules: action-handler.service.ts, case.service.ts, case-status.service.ts (mevcut, yanlış hedef olarak doğrulandı), dto/case.dto.ts
Status: **ACTIVE_LEGACY_FIELD_REQUIRES_OWNER / PRODUCTION TRACE REQUIRED** — implemente EDİLMEDİ.
**CAN-P0-002-B-FIX attempt (2026-07-06): BLOCKED / NO_PATCH_TRACE_INCONCLUSIVE.** Production/staging trace gate denendi; yalnız yerel dev DB erişimi vardı, `IcrabotRulePack`/`IcrabotRule`/`IcrabotRuleRevision` tamamen boş çıktı — bu boşluk `update_case_status` için anlamlı bir "kullanılmıyor" kanıtı değil (rule-engine runtime kullanımını temsil etmiyor, aynı desen bilinen-canlı send_email/send_sms için de çıkardı). Bu yüzden ne patch üretildi ne de cleanup açıldı — ikisi de bu kanıtla güvenli değil. Status değişmedi. **Next unlock: gerçek production/staging rulepack/action-history trace** (owner veya production erişimi olan biri tarafından doğrulanmalı).
**Öncelik sırasında CAN-P0-002-A/C'den önce ele alınması önerilir** (owner değerlendirmesi).

## CAN-P0-002-C — Quarantine metadata direct-write classification

**Governance güncellemesi (2026-07-09/10, GO-ANALYZE + ürün kararı + GO-FIX + merge sonrası):** Owner GO-ANALYZE verdi (yalnız teşhis). Bulgu: `Case.metadata` (tipsiz, shared, "ESKİ ALANLAR" bölümünde bir JSON alanı) üzerine `job-monitor.service.ts`'in quarantine/unquarantine yazımı **tam-obje-değiştirme** (merge değil) yapıyordu — `executionOffice` ([document.service.ts:82](project/apps/api/src/modules/document/document.service.ts:82)) ve `monthlyNafaka` ([scheduler.service.ts:206](project/apps/api/src/modules/scheduler/scheduler.service.ts:206)) gibi başka legacy fallback anahtarlarını sessizce silme riski taşıyordu. **Ama `Case.metadata.quarantined`'ın kendisinin hiçbir okuyucusu yoktu** (backend/frontend/audit-export'ta exhaustive grep ile doğrulandı) — gerçek gate zaten `IcrabotJobRun.status` üzerinden çalışıyordu ([recipe-runner.service.ts:93](project/apps/api/src/modules/icrabot/runner/recipe-runner.service.ts:93)), audit zaten `IcrabotJobAction` tablosunda duruyordu (CAN-P0-002-A1'in aksine audit eksikliği burada sorun DEĞİLDİ). **Owner'ın kritik itirazı:** "kimse okumuyor" statik-kod gerçeği "gelecekte de gerekmeyecek" anlamına gelmez — bu bir ürün kararı. GO-FIX vermeden önce tek soru soruldu: *quarantine bilgisi ileride UI'da gösterilecek mi?* Cevap **HAYIR** olarak kesinleşti — bu, owner'ın önceden tanımladığı koşullu patch'i tetikledi (HAYIR → write'ı tamamen kaldır; EVET olsaydı → tenant-guard+merge-safe writer eklenecekti). Sonuç: `Case.metadata` yazımı `quarantineCase()`/`unquarantineCase()`'den tamamen kaldırıldı; `IcrabotJobRun.status` (gate) ve `IcrabotJobAction`/`logJobAction()` (audit) DEĞİŞMEDİ.

ID: CAN-P0-002-C
Title: job-monitor.service.ts quarantine/unquarantine metadata write — bounded-context exception mi, canonical patch owner mı gerekiyor?
Problem: `job-monitor.service.ts:136,174` `Case.metadata` üzerindeki quarantine/unquarantine flag'lerini `CaseService`'i bypass ederek doğrudan yazıyor. `CaseService.patchFlags` bugün metadata alanı için allowlist içermiyor.
Business Value: Bu write'ın kasıtlı bir bounded-context istisnası mı yoksa gerçek bir ARCHITECTURAL_DRIFT mi olduğunun netleşmesi — yanlış sınıflandırma ya gereksiz refactor'a ya da gerçek bir driftin gözden kaçmasına yol açar.
Technical Value: Metadata allowlist genişletilecekse audit/DI etkisi ayrıca değerlendirilmeli; genişletilmeyecekse bu write deseni `canonicalization-policy.md`'nin INTENTIONAL_BOUNDED_CONTEXT kategorisine mi yoksa ARCHITECTURAL_DRIFT'e mi girdiği açıkça karara bağlanmalı.
Priority: MEDIUM
Depends On: CAN-P0-002 (parent, VERIFICATION_REQUIRED)
Unlock Condition: Yok — implemente edildi, merge edildi. Ek yetkilendirme gerekmiyor.
Estimated Size: S (BE — sınıflandırma kararı + gerekirse küçük allowlist genişletmesi)
Related Modules: job-monitor.service.ts, case.service.ts
Status: **CLOSED/MERGED** — PR #1014, squash SHA `2542ba5da4dd0de918d905116ddaab600cbad966`; CI 4/4 PASS (Architectural Guardrails/Test Suite/Web Tests (vitest)/Client Workspace Live Smoke), mergeStateStatus CLEAN (merge öncesi doğrulandı); diff kesinlikle 1 dosya (`job-monitor.service.ts`, +15/-25), migration/schema/package/lock değişikliği YOK. `IcrabotJobRun.status`/`IcrabotJobAction`'a dokunulmadı (doğrulandı). Repo genelinde `JobMonitorService` için hiç mevcut test bulunamadı — saf silme, regresyon riski yok. Remote branch silindi; izole worktree'de yine `git worktree remove --force` "Filename too long" hatası verdi (Windows path-limiti, pnpm node_modules) — git-side unregistered oldu ama fiziksel dizin force-delete EDİLMEDİ, `ORPHANED_WORKTREE_DIR` olarak bırakıldı (`C:\Development\HUKUK_YAZILIMI\HUKUK_can-p0-002-c-fix`). Ana canonical `main`'e hiç dokunulmadı.

## CAN-P0-003 — workflowStage / nextActionAt / riskScore single-owner orchestration refactor (CAN-P0-002'den carry-forward, 2026-07-06)

ID: CAN-P0-003
Title: workflowStage tek-owner konsolidasyonu (CAN-DRIFT-03) + nextActionAt/riskScore ayrıştırması
Problem: `workflowStage` alanına tek owner servis olmadan birden fazla yerden yazılıyor (`icrabot.service.ts:358`, `task-orchestrator.service.ts:307` `applyUpdates` içinde `nextActionAt`/`riskScore` ile karışık, ayrıca `workflow-engine.service.ts`/`scheduler.service.ts`/`case.service.ts` — CAN-REG-001/CAN-DRIFT-03'te tespit edilen 5 yazıcı). `task-orchestrator.service.ts`'teki `applyUpdates` özellikle `workflowStage`'i `nextActionAt`/`riskScore` ile aynı update payload'ında karıştırıyor — dar bir patch ile güvenle ayrılamıyor, orchestration-seviyeli bir refactor gerektiriyor.
Business Value: Case orchestration alanlarının (workflowStage/nextActionAt/riskScore) tutarlı, tek-kaynaklı yazılmasını sağlar.
Technical Value: Henüz var olmayan `CaseWorkflowStageService` (veya benzeri) tasarımı + `applyUpdates`'in workflowStage'i diğer orchestration alanlarından ayrıştıracak şekilde refactor edilmesi.
Priority: HIGH (register'da P0 = "önce temizlenir")
Depends On: CAN-REG-001 (MERGED, PR #977). CAN-P0-002 (VERIFICATION_REQUIRED) — kardeş madde, aynı patch-generation denemesinden carry-forward edildi.
Unlock Condition: Owner GO-ANALYZE (5 yazıcının tam envanteri + `applyUpdates` orchestration-refactor tasarımı) + ayrı GO-IMPLEMENT onayı. Bu kayıt implementasyonu YETKİLENDİRMEZ.
Estimated Size: L (BE — orchestration refactor + yeni servis + characterization testleri; migration muhtemelen gerekmez, teyit GO-ANALYZE'da yapılmalı)
Related Modules: icrabot.service.ts, task-orchestrator.service.ts, workflow-engine.service.ts, scheduler.service.ts, case.service.ts
Status: NEXT / PENDING — main'de implemente EDİLMEDİ.

## CAN-P0-008 — IcrabotWebhookLog ghost model / webhook fake-sent pattern (CAN-P0-001 kapanışında tespit edilen follow-up, 2026-07-06)

ID: CAN-P0-008
Title: webhook action handler'ı gerçek HTTP çağrısı yapmadan `IcrabotWebhookLog.status='sent'` yazıyor; model şemada yok (ghost model)
Problem: CAN-P0-001 (PR #981) metadata'sında kapsam-dışı bulgu olarak not düşüldü: `action-handler.service.ts` içindeki `webhook` handler'ı (satır ~638-655) `icrabotWebhookLog.create({ status: 'sent' })` çağırıyor ama gerçek HTTP çağrısı yapılmadan bu yazılıyor — CAN-DRIFT-01 ile birebir aynı desen (provider/hedef onayı olmadan "sent"). Ayrıca `IcrabotWebhookLog` modeli `prisma/schema.prisma`'da hiç TANIMLI DEĞİL — `(prisma as any)` ile çağrılıyor (ghost model, migration'sız).
Business Value: Aynı yanıltıcı-"sent" riskinin webhook kanalında da kapanması; ghost model'in ya şemaya eklenmesi ya da kaldırılması kararı.
Technical Value: Önce DB'de bu tabloya karşılık gelen gerçek bir tablo/veri olup olmadığının doğrulanması gerekir (ghost model'in ya raw-SQL ile önceden yaratılmış bir tablo mu yoksa hiç yazılamayan ölü bir çağrı mı olduğu netleşmeli) — CAN-P0-001/CAN-DRIFT-01'in aksine burada schema durumu belirsiz, bu yüzden doğrudan "aynı fix'i uygula" denemez.
Priority: MEDIUM (CAN-DRIFT-01 ile aynı risk deseni ama schema belirsizliği nedeniyle önce doğrulama gerekiyor)
Depends On: CAN-P0-001 (MERGED, PR #981) — aynı ARCHITECTURAL_DRIFT sınıfının bir başka örneği olarak tespit edildi.
Unlock Condition: Owner GO-ANALYZE onayı — önce `IcrabotWebhookLog`'un DB'de gerçekten var olup olmadığı (raw SQL/migration geçmişi) doğrulanmalı; şemaya hiç eklenmemişse bu, CAN-DEAD-tipi bir "ghost model" sorunu haline gelir ve fix stratejisi değişir (schema ekleme + migration gerekebilir — CAN-P0-001'in migration-free doğası burada garantı değildir).
Estimated Size: M (BE — önce DB/schema doğrulaması, sonra fix; migration gerekip gerekmediği GO-ANALYZE'da netleşecek)
Related Modules: action-handler.service.ts (webhook handler, satır ~638-655), prisma/schema.prisma
Status: NEXT / PENDING / **VERIFICATION_REQUIRED** — kod değişikliği YAPILMADI, yalnız CAN-P0-001 kapanışında tespit edilen bir kapsam-dışı bulgu olarak kaydedildi. Implementasyon bu kayıtla yetkilendirilmez.

## FIN-TBK100-DI-001 — TBK100AllocatorService DI export eksikliği (CCB-001 mimari denetimi sırasında keşfedilen, CCB-001'den bağımsız finansal-yol defekti, 2026-07-09)

ID: FIN-TBK100-DI-001
Title: `TBK100AllocatorService` `InterestEngineModule` exports'undan eksikti; gerçek tahsilat kaydı yolu sessizce deprecated `allocateLegacy()` sırasını kullanıyordu
Problem: `interest-engine.module.ts`'in `providers` dizisinde `TBK100AllocatorService` vardı ama `exports` dizisinde yoktu. `SummaryEngineService` (`@Optional()` DI ile enjekte ediyordu) bu yüzden servisi hiç alamıyor, sessizce `undefined` kalıyordu; `allocatePaymentToLedgerInTx()` her çağrıda `allocateLegacy()` (deprecated, doc-27 P-0 sırasını izlemeyen YAML tabanlı eski mahsup) dalına düşüyordu, `allocateWithTBK100()` (canonical MASRAF→FER'İ→FAİZ→ANAPARA sırası) hiç çalışmıyordu. İki gerçek production route etkileniyordu: `POST /summary-engine/case/:caseId/payment` ve `POST /collections` (`CollectionService.create()` üzerinden). Bu bulgu CCB-001 mimari denetiminin (canonical hesap-özeti display otoritesi doğrulaması) yan ürünü olarak ortaya çıktı; CCB-001/ADR-012 kapsamının kendisi değil, ondan bağımsız bir NestJS modül `exports` eksikliği.
Business Value: Gerçek tahsilat kayıtlarının artık doğru (doc-27 P-0 hard rule) mahsup sırasıyla işlenmesini garanti eder.
Technical Value: Tek satırlık `exports` düzeltmesi + DI-graph'ı gerçekten derleyen 2 regresyon testi (`interest-engine.module.wiring.spec.ts`, `summary-engine.module.wiring.spec.ts`) + `allocateLegacy()`/`allocateWithTBK100()`'ün aynı ödeme üzerinde farklı sonuç ürettiğini kanıtlayan 1 davranışsal test (`summary-engine.allocation-divergence.spec.ts`).
Priority: CRITICAL (finansal doğruluk — mahsup sırası)
Depends On: CCB-001 mimari denetimi (2026-07-09, TBK100/AllocationEngine duplication incelemesi sırasında keşfedildi)
Unlock Condition: Yok — forward-only hotfix zaten uygulandı ve merge edildi, ek owner GO gerekmiyor.
Estimated Size: XS (tek satır export + testler)
Related Modules: `interest-engine.module.ts`, `summary-engine.service.ts`, `collection.service.ts` (`POST /collections` tüketicisi)
Status: **CLOSED/MERGED** — PR #989, commit SHA `f1bab70c17b2090a8e993f9ab82c274dc20d5fa0`, base `main`, squash/merge dahil tek commit; CI 4/4 PASS (SUCCESS/SUCCESS/SUCCESS/SUCCESS); diff kesinlikle 4 dosyayla sınırlı (`interest-engine.module.ts` + 3 yeni spec dosyası) — migration/schema/package/lock değişikliği YOK. Forward-only hotfix: geçmiş ledger/veri rewrite YAPILMADI. **Owner Decision (2026-07-09)**: bu defektten etkilenmiş olabilecek geçmiş kayıtların test/fixture/demo kapsamında olduğu değerlendirildi; historical ledger remediation açılmayacak. **Repository Evidence**: bu değerlendirmeyi doğrulayan/çürüten bağımsız bir production-wide DB taraması bu kayıt kapsamında yapılmadı — owner kararı ile repo kanıtı ayrı şeylerdir, biri diğerinin yerine geçmez. Bu nedenle **`FIN-TBK100-HIST-001` (production ledger historical remediation) AÇILMAYACAK** — geçmiş-etki analizi kapsam dışı bırakıldı. Gerçek/organik production verisinde bu bug'ın etkisine dair yeni kanıt ortaya çıkarsa bu karar yeniden değerlendirilmelidir.

---

## FEE-TARIFF-2026-001A/001B — 2026 tarife `penalties` eksikliği: runtime crash hotfix (uncommitted) + tarife veri tamamlama owner/hukuki karara bırakıldı (2026-07-09)

ID: FEE-TARIFF-2026-001A / FEE-TARIFF-2026-001B
Title: `apps/api/src/config/tariffs/2026.yaml` zorunlu `penalties` bölümünü içermiyordu; `TariffService.toSharedFormat()` bunu koşulsuz `Object.entries()` ile okuduğu için tariffYear=2026 çözen her çağrı `TypeError` ile çöküyordu
Problem: `2026.yaml` (13.01.2026'da tek commit'te `051ab4c5` sıfırdan yazıldı, o günden beri hiç değişmedi) `penalties` bölümünü hiç içermiyor; `2025.yaml`'da var (`bad_check_compensation` %10/%20, `contractual_penalty` null/null). `tariff.service.ts:toSharedFormat()` (satır ~58-107) `data.penalties`'i `Object.entries()` ile koşulsuz okuyor, null-guard yoktu — izole bir scratchpad'e gerçek `js-yaml` kurulup gerçek dosyalara karşı reprodüksiyon yapıldı: 2025.yaml OK, 2026.yaml `TypeError: Cannot convert undefined or null to object`. `FeeEngineService.currentYear = new Date().getFullYear()` process-boot'ta sabitlendiği için (bugün 2026), tariffYear parametresi verilmeyen HER çağrı 2026 tarifesini çözmeye çalışıp throw ediyor. Koddan tek tek doğrulanan etkilenen uç noktalar: `GET /fee-engine/interest-rate`, `GET /fee-engine/postage-types`, `POST /fee-engine/calculate-penalty`, `POST /fee-engine/calculate-interest`, `POST /fee-engine/calculate` (DTO'larında tariffYear parametresi hiç yok → HER ZAMAN throw); `POST /fee-engine/calculate-opening-fees` (tariffYear atlanırsa throw — `apps/web/.../cases/new/page.tsx` iki çağrı noktası da atlıyor); `GET /tariffs/active`, `GET /tariffs/2026`; `template-engine.service.ts:getCaseData()` (satır 323, `determineInterestInfo()` satır 519/553/577/587 üzerinden) — bu da Takip Talebi/Ödeme Emri/İcra Emri/PDF/Word/UDF/XML dahil hemen hemen TÜM belge üretiminin ortak veri kaynağı. `interest-engine` modülü (canonical faiz/bakiye motoru, Prisma/DB tabanlı, `TariffService`'e bağımlı DEĞİL) ve `claim-engine.service.ts:calculatePenalty()` (gerçek "karşılıksız çek tazminatı" otoritesi, kendi `penalty_calculators` rule set'inden okuyor) bu bug'dan ETKİLENMEDİĞİ koddan doğrulandı. Kasıtlı kaldırma ihtimali araştırılıp REDDEDİLDİ: `packages/types/src/fee.ts`'te `Tariff.penalties` zorunlu (opsiyonel değil) alan; git geçmişinde bir "kaldırma" commit'i yok; `product-backlog.md`/`decision-log.md`'de ilgili hiçbir owner kararı yok; projenin kendi `fee-engine/__tests__/integration.spec.ts` mock fixture'ı 2026 mock'unu 2025'ten (penalties dahil) türetiyor.
Business Value: 2026'da açılan davalarda masraf/faiz/ceza hesaplaması ve belge üretiminin production'da sessizce (frontend'de yutulan hata) veya gürültülü (500) şekilde bozulmasını önler; hata kaynağını cryptic native `TypeError` yerine teşhis edilebilir kılar.
Technical Value: **001A (bu oturumda uygulandı):** `tariff.service.ts`'e `MissingTariffSectionError` (year+section taşıyan, isimli hata sınıfı) eklendi; `toSharedFormat()` artık `TariffData`'nın 5 zorunlu `Record<...>` bölümünü (`fixed_fees`, `rate_fees`, `postage`, `interest_rates`, `penalties`) `REQUIRED_TARIFF_SECTIONS` listesiyle döngüyle kontrol ediyor, herhangi biri eksikse fail-closed throw ediyor — sessizce `{}`/`0` ASLA üretilmez (CCB-001'in "NO_BUCKETS → throw" disipliniyle bilinçli tutarlılık, owner talimatı). `version`/`year`/`effective_date` skaler alanları bilinçli dışarıda bırakıldı (farklı hata modeli: crash değil sessiz `undefined`). Gerçek js-yaml ile hem gerçek 2025/2026 dosyaları hem sentetik "her bölüm tek tek eksik" senaryolarıyla (4/4 PASS) doğrulandı. **İlk turda ajan 2025'teki penalties değerlerini otomatik olarak 2026.yaml'a kopyalamıştı — owner bunu REDDETTİ ve geri aldırdı** (hukuki/statüter bir veri kararı mühendislik kararıyla karıştırılmamalı). **001B (implementasyon YOK, owner/hukuki karar bekliyor):** 2026 `penalties` verisinin gerçek içeriği (2025'teki %10/%20 karşılıksız çek tazminatı + null/null cezai şart ile aynı mı, yoksa 2026 için mevzuat değişikliği var mı) doğrulanmadı ve koda yazılmadı.
Priority: CRITICAL (001A: aktif production crash riski; 001B: süregelen hukuki veri eksikliği)
Depends On: Yok — CCB-001/ALC-AUTH/interest-engine'den bağımsız, ayrı bir finansal-yol defekti (FIN-TBK100-DI-001 emsaline benzer keşif deseni)
Unlock Condition: **001A** — commit/PR/merge için ayrı owner GO gerekiyor (bu kayıt itibarıyla henüz istenmedi). **001B** — 2026 karşılıksız çek tazminatı / cezai şart oranlarının owner/hukuk ekibi tarafından teyidi/belirlenmesi; teyit gelmeden YAML'a veri yazılmayacak.
Estimated Size: 001A: XS (tek dosya `tariff.service.ts`, ~18 satır, 2 yeni export). 001B: belirsiz (hukuki/statüter araştırma gerektirebilir)
Related Modules: `apps/api/src/modules/tariff/tariff.service.ts` (001A, değişti), `apps/api/src/config/tariffs/2026.yaml` (001B'de değişecek, şu an HEAD'e eşit), `apps/api/src/modules/fee-engine/fee-engine.controller.ts` (tüketici, değişmedi), `apps/api/src/modules/template-engine/template-engine.service.ts` (tüketici, değişmedi)
Status: **001A: MERGED/CLOSED** — PR #997, squash SHA `d21135ea08c0cd3ad15f8e5400589909eaba1859`, base `main`; CI 4/4 PASS (Architectural Guardrails, Test Suite, Web Tests (vitest), Client Workspace Live Smoke); mergeStateStatus CLEAN doğrulandıktan sonra squash merge yapıldı; diff kesinlikle 3 dosyayla sınırlı kaldı (51 ekleme, 0 silme) — scope dışı değişiklik yok. Gerçek js-yaml reprodüksiyonuyla doğrulandı (gerçek 2025/2026 dosyaları + 4 sentetik eksik-bölüm senaryosu, hepsi PASS). Canonical main bu SHA'ya senkronize edildi; remote+local branch silindi; izole worktree git-tarafı prune edildi (fiziksel dizin `ORPHANED_WORKTREE_DIR` olarak kaldı, `rm -rf`/force-delete kullanılmadı). Kalan blocker yok. **001B-1: LEGAL_RULE_CONFIRMED / MERGED/CLOSED** — `bad_check_compensation.default_rate = 0.10` olarak `2026.yaml`'a yazıldı. Kaynak: TTK 6102 m.783/3 ("muhatap nezdinde karşılığı kısmen veya tamamen bulunmayan bir çek düzenleyen kişi, çekin karşılıksız kalan bedelinin %10'unu ödemekle yükümlü olduktan başka, hamilin bu yüzden uğradığı zararı da tazmin eder") + Yargıtay 12. HD 05/03/2015 kararı (aynı madde metnini alıntılayan gerçek içtihat) + bağımsız web araştırmasıyla çapraz doğrulandı (owner'ın ilk sunduğu tek linke güvenilmedi, ayrıca doğrulandı). Oran 01.07.2012'de (6102 sayılı TTK yürürlüğe girdiğinde, eski 6762 sayılı TTK m.695/3'teki %5'ten) %10'a çıkarıldı, o günden beri sabit — yıllık tarife değil, kanuni sabit kural; yalnız keşideciden istenebilir, cirantalardan istenemez. Gerçek js-yaml reprodüksiyonuyla doğrulandı: `calculatePenalty('bad_check_compensation', 100000)` = 10.000 TL, cap uygulanmıyor (Yargıtay kararındaki örnek hesaplamayla birebir eşleşiyor). **Merge teyidi**: PR #1004, squash SHA `86736dbcc5842d659d90a9e69b9a942f923c80a1`, base `main`; CI 4/4 SUCCESS (Architectural Guardrails, Test Suite, Web Tests (vitest), Client Workspace Live Smoke); diff kesinlikle 3 dosyayla sınırlı (`2026.yaml` + 2 governance dosyası). GitHub'ın kendi `mergeStateStatus`/`mergeable` alanı merge öncesi `UNKNOWN` takıldı (main, PR açıldığından beri 7 commit ilerlemişti, GitHub'ın asenkron hesaplaması gecikti) — bunun yerine `git merge-tree --write-tree origin/main <PR-head>` ile yerel, salt-okunur bir conflict-check yapıldı, temiz sonuç alındıktan sonra merge edildi; merge sonrası gerçekten çakışmasız/temiz olduğu doğrulandı. Canonical main bu SHA'ya senkronize edildi (`git rev-parse main origin/main` ile doğrulandı, ikisi de eşit). Remote branch (`codex/fee-tariff-2026-001b1-legal-rate`) merge sırasında zaten silinmişti (silme denemesi 404 döndü, teyit edildi); bu branch için hiç local worktree açılmamıştı. Kalan blocker yok. **001B-2: CLOSED / SEMANTIC_MISCLASSIFICATION** — `2025.yaml`'daki `bad_check_compensation.max_rate: 0.20` alanı iki bağımsız araştırma turunda da (owner'ın verdiği tek linke güvenmeden, farklı kaynak setleriyle) TTK 6102 m.783/3 (çek tazminatı) kapsamında hiçbir bağımsız kaynakla (kanun metni, Yargıtay kararı, akademik kaynak) doğrulanamadı; kanun sabit %10 + hamilin ayrıca ispatlayacağı açık uçlu zarar öngörüyor, bu ikinci bir yüzde oranı/tavanı değil. **Kök neden bulundu (owner hipotezi, ayrıca doğrulandı):** İİK m.67 "icra inkâr tazminatı" gerçekten "alacağın **en az %20**'sinden az olamaz" hükmünü içeriyor (borçlunun ilamsız icra takibine haksız itirazı, itirazın iptali davasında hükmedilir) — ama bu **(a) tamamen farklı bir hukuki kurum** (çek tazminatı değil, itirazın iptali/icra inkârı) **ve (b) yönü ters** (kanunda bir **alt sınır/minimum**, `max_rate` alanının ima ettiği **üst sınır/maximum** değil). En olası açıklama: `2025.yaml` hazırlanırken iki farklı kurumun oranı aynı veri alanına (`bad_check_compensation`) karıştırılarak girilmiş — isim ve alan doğru, oran başka bir hukuki kurumdan (ve ters yönde) sızmış. Owner kararı: ne eski `0.20` korunacak ne yeni bir değer yazılacak; `max_rate` `2026.yaml`'da kasıtlı olarak yok (tip zaten opsiyonel, `maxRate?: number`). Eğer sistemde gerçekten icra inkâr tazminatı hesaplanması gerekirse, bu `bad_check_compensation`'ın bir alt alanı değil, kendi hukuki semantiğiyle **ayrı bir tarife kalemi** (örn. `execution_denial_compensation`, `minimum_rate: 0.20`) olarak modellenmelidir — bu turda böyle bir alan eklenmedi, yalnız not düşüldü. `contractual_penalty` (sözleşmeye bağlı, default_rate/max_rate: null) değişmedi, aynen taşındı. **Owner önerisi, kapsam dışı not**: tarife verisi (yıllık değişebilir) / kanuni sabit kural (mevzuat) / sözleşmesel (kullanıcı) üçlü sınıflandırması ADR-012'de resmileştirilebilir — ADR-012 henüz main'de yok (yalnız `codex/ccb-001-pr1-pr6-rescue` branch'inde, CCB-001 workstream'inin kendi kapsamı), bu PR ona dokunmadı.
**GOV-ADR-NAMING-000 güncel adlandırma düzeltmesi:** Bu kayıttaki tarihsel "ADR-012'de resmileştirilebilir" ifadesi artık kanonik değildir. `ADR-012` main üzerinde yalnız DX-005 / Waiting & Progress Policy'dir; tarife verisi / kanuni sabit kural / sözleşmesel sınıflandırma için kanonik hedef ADR numarası `ADR-013` olarak ayrılmıştır — **`GOV-ADR-NAMING-000`'ın orijinal metni, DEĞİŞMEDEN.** **Düzeltme (2026-07-10, owner arbitration, final):** Aynı gün kısa süre `ADR-013` dosyası CCB-001'in kendi mimari dokümanı olarak oluşturulmuştu ("Option C", PR #1019) ve bu not o sırada tarife/kanuni-sabit/sözleşmesel sınıflandırmayı CCB-001'in bir alt bileşeni olarak çerçevelemişti. Owner'ın nihai kararıyla bu tersine çevrildi: **CCB-001'in mimari dokümanı `ADR-014`'e taşındı** (`docs/adr/ADR-014-CCB-001-CANONICAL-LEGAL-CALCULATION-CORE.md`), **`ADR-013` yeniden `GOV-ADR-NAMING-000`'ın orijinal dar kapsamına (Fee/Harç/Snapshot/Journal) döndü ve PR #1026 ile draft owner-review ADR olarak oluşturuldu.** Tarife verisi / kanuni sabit kural / sözleşmesel sınıflandırma dolayısıyla CCB-001'in (ADR-014) değil, **`ADR-013`'ün** potansiyel bir alt bölümü olarak kalır — bu satırın önceki hâlindeki gibi. Bu üçlü sınıflandırmanın ADR-013 içinde ayrı bir bölüm olarak resmileştirilmesi henüz yapılmadı — ayrı owner GO gerekir (bu kayıt onu yetkilendirmez).

---

## ADR-014-PR4-DEBT-A — Dead Allocation Orchestration Path Divergence (PR-4 post-merge architecture conformity review, 2026-07-11)

ID: ADR-014-PR4-DEBT-A
Title: `AllocationEngineService.allocateMultiplePayments(..., interestCalculator)` extension point hiçbir zaman production'a bağlanmadı; PR-4 bunun yerine kendi orkestrasyon mekanizmasını kurdu ve repo'da şu an iki farklı payment-sort tie-break mantığı eş zamanlı var
Problem: PR-4 GO-COMPLETE talimatı (Karar 1) `allocateMultiplePayments(..., interestCalculator)` mevcut extension point'inin kullanılmasını öngörmüştü. Gerçek implementasyon (PR #1109, squash `77a4ca35`) bunun yerine `InterestEngineService.allocatePaymentsWithInterestBaseMutation()` adıyla kendi özel orkestrasyon mekanizmasını kurdu: `createInitialClaimDebtStates()`, `accrueInterestForCurrentPrincipal()`, `buildSegmentResultsFromClaimStates()` yardımcı metodları, paylaşılan PR-3h hardened çekirdeği (`allocationEngine.allocateSinglePayment()`) kendi payment-loop'u içinde çağırıyor. Post-merge architecture conformity review (read-only, bu backlog kaydından önce tamamlandı) şunu kanıtladı: `git log -S"interestCalculator"` main'in TÜM geçmişinde `interest-engine.service.ts` içinde SIFIR sonuç döndürüyor — yani `interestCalculator` parametresi hiçbir zaman, hiçbir production caller tarafından production'da kullanılmadı; callback path'e dönüş PR-4'ün dört private helper metodundan hiçbirini ortadan kaldırmazdı; `allocateMultiplePayments()`'ın kendi imzası (`initialSegments: Map<string, Segment[]>`) PR-4'ün segment-lifecycle ihtiyaçları için yanlış abstraction seviyesinde. Bu nedenle mimari sapma teknik olarak haklı bulundu ve owner tarafından Classification B (ACCEPT WITH DOCUMENTED DEBT) ile kabul edildi — callback migration/revert YETKİLENDİRİLMEDİ. Geriye kalan somut, ölçülebilir risk: iki payment-sort tie-break mantığı repo'da eş zamanlı yaşıyor — `interest-engine.service.ts`: `sortedPayments = [...request.payments!].sort((a,b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))` (date+id, deterministik) vs `allocation-engine.service.ts`'in kendi `allocateMultiplePayments()`'ı: yalnız date (id tie-break YOK). Şu an aktif zarar YOK çünkü `allocateMultiplePayments()`'ın `interestCalculator`'lı çağrı yolu hiç production'da tetiklenmiyor (dead code). Risk yalnız gelecekte biri bu dead path'i canlandırırsa veya iki mekanizma aynı veri kümesi üzerinde paralel çalışırsa aynı ödeme setinde farklı/tutarsız sıralama sonucu (ve dolayısıyla farklı allocation sonucu) üretebilir olmasıdır.
Business Value: Aynı ödeme kümesinin iki farklı sıralama mantığıyla iki farklı allocation sonucu üretme riskini repo-genelinde görünür kılar; gelecekte dead path yeniden etkinleştirilirse (yeni bir caller eklenirse) sessiz bir tutarsızlık yerine bilinen, kayıtlı bir riskle karşılaşılır.
Technical Value: İki seçenekten biri owner tarafından ayrı bir GO-IMPLEMENT ile seçilebilir: (a) `allocateMultiplePayments()`'ın kendi sort'unu `interest-engine.service.ts` ile aynı date+id tie-break'e hizala (davranış değişikliği yok çünkü dead path zaten hiç çağrılmıyor, yalnız tutarlılık), veya (b) dead `interestCalculator` parametresini ve callback-path'i `allocateMultiplePayments()`'tan tamamen kaldır (kullanılmayan yüzey alanını azaltır). Bu kayıt kapsamında HİÇBİRİ uygulanmadı.
Priority: MEDIUM (aktif runtime etkisi yok — dead code path; ama finansal sıralama mantığı olduğu için gelecekte etkinleşirse yüksek etkili olabilir)
Depends On: ADR-014 PR-4 (teknik PR #1109, squash `77a4ca35`) ve post-merge architecture conformity review (owner arbitration kaydı, `decision-log.md`, 2026-07-11)
Unlock Condition: Ayrı, açık owner GO-IMPLEMENT — hangi seçeneğin (sort hizalama vs dead-code temizliği) uygulanacağına dair owner kararı olmadan kod değişikliği yapılmaz. PR-4/PR-5 yeniden açılmaz; bu iş kendi ayrı PR'ında ele alınır.
Estimated Size: XS–S (sort hizalama: tek satır; dead-code temizliği: imza + çağıran taraf temizliği, muhtemelen tek dosya)
Related Modules: `apps/api/src/modules/interest-engine/allocation/allocation-engine.service.ts` (`allocateMultiplePayments()`), `apps/api/src/modules/interest-engine/interest-engine.service.ts` (`allocatePaymentsWithInterestBaseMutation()`, karşılaştırma referansı)
Status: OPEN / DOCUMENTED — runtime remediation NOT AUTHORIZED (owner-held). Post-PR-5 dar yeniden doğrulama (2026-07-11) bu borcun hâlâ geçerli ve PR #1113/PR-5 değişikliğinden etkilenmediğini doğruladı.

---

## ADR-014-PR4-DEBT-B — Direct Zero-Payment Guard Verification (PR-4 post-merge architecture conformity review, 2026-07-11)

ID: ADR-014-PR4-DEBT-B
Title: `allocatePaymentsWithInterestBaseMutation()` eski `validateInputs()` (`payment.amount<=0` reddi) guard'ını doğrudan uygulamıyor; koruma yalnız yukarı akışta, dolaylı olarak sağlanıyor
Problem: PR-4 öncesi allocation yolu, ödeme başına `validateInputs()` ile `payment.amount<=0` durumunu doğrudan reddediyordu. PR-4 ile eklenen `InterestEngineService.allocatePaymentsWithInterestBaseMutation()` bu guard'ı kendi payment-loop'unda DOĞRUDAN tekrar uygulamıyor. Post-merge architecture conformity review şunu buldu: bu boşluk şu an `case-balance.service.ts` → `payment-mapper.ts` içindeki `ZERO_OR_NEGATIVE_PAYMENT` diagnostic filtresi (satır ~139 civarı) tarafından KISMEN mitige ediliyor — bilinen tek production caller zinciri (`CaseBalanceService`) sıfır/negatif ödemeleri `allocatePaymentsWithInterestBaseMutation()`'a ulaşmadan önce filtreliyor. Ancak bu iki katmanlı, garantili bir savunma DEĞİL: guard, çağıranın (`payment-mapper.ts`) sorumluluğuna bırakılmış durumda; `allocatePaymentsWithInterestBaseMutation()`'ın kendisi sıfır/negatif payment.amount değerine karşı doğrudan fail-closed değil. `payment-mapper.ts` filtresini atlayan (veya farklı bir üst katmandan gelen) herhangi bir gelecekteki caller eklenirse, guard yokluğu doğrudan, kanıtlanmamış bir davranışa dönüşür.
Business Value: Sıfır/negatif ödeme girdisinin interest-base mutation yoluna hiçbir koşulda sessizce sızmamasını garanti altına alma ihtiyacını görünür ve izlenebilir kılar; mevcut kısmi mitigasyonun sınırlarını (tek caller zincirine bağımlı olması) açıkça kaydeder.
Technical Value: `allocatePaymentsWithInterestBaseMutation()`'ın kendi payment-loop'una eski `validateInputs()` ile aynı semantikte (`payment.amount<=0` → fail-closed red) doğrudan bir guard eklenmesi, savunmayı çağıran-bağımsız hale getirir (defense-in-depth). Bu kayıt kapsamında HİÇBİR kod değişikliği uygulanmadı.
Priority: MEDIUM (şu an bilinen tek production caller zinciri tarafından kısmen mitige ediliyor; ancak finansal girdi doğrulaması olduğu için çağıran-bağımlı koruma kırılgan kabul edilir)
Depends On: ADR-014 PR-4 (teknik PR #1109, squash `77a4ca35`) ve post-merge architecture conformity review (owner arbitration kaydı, `decision-log.md`, 2026-07-11)
Unlock Condition: Ayrı, açık owner GO-IMPLEMENT — guard eklenmesi kendi ayrı PR'ında, ayrı test kapsamıyla (sıfır/negatif payment.amount senaryoları) ele alınır. PR-4/PR-5 yeniden açılmaz.
Estimated Size: XS (tek guard ekleme + odaklı unit test)
Related Modules: `apps/api/src/modules/interest-engine/interest-engine.service.ts` (`allocatePaymentsWithInterestBaseMutation()`), `apps/api/src/modules/interest-engine/calc-prep/payment-mapper.ts` (`ZERO_OR_NEGATIVE_PAYMENT` filtresi, mevcut kısmi mitigasyon kaynağı)
Status: OPEN / DOCUMENTED — runtime remediation NOT AUTHORIZED (owner-held). Post-PR-5 dar yeniden doğrulama (2026-07-11) bu borcun hâlâ geçerli ve PR #1113/PR-5 değişikliğinden etkilenmediğini doğruladı.
