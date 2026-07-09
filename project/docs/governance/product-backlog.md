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
| ALC-AUTH-1B | Alacak Kalemi | Overpayment display semantics contract (allocatedPaidAmount/grossReceivedAmount) | PR #909 squash merged, SHA `f144f550`; PAID_DELTA reclassified OVERPAYMENT_CLASSIFICATION_EFFECT (not a bug); totalPaidAmount unchanged, additive fields only; 575/575 interest-engine tests PASS |
| ALC-AUTH-3B | Alacak Kalemi | totalDebtAmount projection plumbing (grossPrincipal) | PR #917 squash merged, SHA `8c0cad8f`; guard's CANONICAL_PRINCIPAL_UNAVAILABLE closed for 2026/9502; 35/35 orchestration tests PASS; guarded pilot remains NO-GO pending ALC-AUTH-3D |
| ALC-AUTH-3D | Alacak Kalemi | Guard authority alignment (frontend consumes backend cutoverReadiness.safeForPrimaryDisplay) — FINAL closure | PR #922 squash merged SHA `8a340c23` (partial/preceding: removed HARD_NO_GO_CODES/issueCodes()/NOT_COMPARABLE) + PR #925 squash merged SHA `6c1304a3` (strict cleanup / FINAL: removed remaining duplicate-authority checks — SHADOW_OR_CANONICAL_SOURCE_FAILURE, FINAL_DEBT_STATES_REQUIRED, DISPLAY_CURRENCY_UNSAFE, report-provenance CLAIM_ITEM_AUTHORITY_CONTAMINATION); domain-safety now single-sourced from `report.cutoverReadiness.safeForPrimaryDisplay`/`blockers` with zero residual frontend authority; CI 4/4 PASS; balance-shadow-display.test.tsx 78/78 PASS; closes ALL authority-source drift for OUTSTANDING_DELTA/PAID_DELTA/PRINCIPAL_BUCKET_DELTA — does NOT close the separate cost/attorney-fee DATA_GAP understatement risk, see ALC-AUTH-3E (OPEN/NEXT); guarded pilot flag still OFF by default |
| ALC-AUTH-3E | Alacak Kalemi | Cost/attorney-fee aggregate understatement risk — per-case suppress via existing COSTS_DELTA/ATTORNEY_FEE_DELTA RED signal (option c) | PR #929 squash merged, SHA `d23003e8`; `hasCostOrAttorneyFeeUnderstatementRisk()` added, toplamBorc/sonBorc/kalanBorc fall back to legacy per-case when RED, other 5 canonical-override fields unaffected; no new backend field/migration; CI 4/4 PASS; balance-shadow-display.test.tsx 81/81 PASS; closes the last known B1/guarded-primary-pilot blocker — flag rollout itself remains a separate, unstarted owner/product decision |
| CAN-REG-001 | Governance | Canonicalization Register + Policy — ARCHITECTURAL_DRIFT/DEAD_CODE/CUTOVER/INTENTIONAL_BOUNDED_CONTEXT classification of semantic-duplicate/legacy-canonical drift program-wide | PR #977 squash merged, SHA `c20abc85142c68132e7961642d827a536da981f1`; adds `canonicalization-policy.md` + `canonicalization-register.md` (docs-only, 221 insertions, 2 new files); CI 4/4 PASS; validated via isolated `origin/main` worktree (`git apply --check` clean before apply). Docs-only — no code/test/schema/migration/runtime behavior change. Register entries (CAN-DRIFT-01/02/03 P0, CAN-DEAD-01..06 + CAN-CUT-01..05 P1/P2, CAN-IBC-01 do-not-touch) remain unimplemented; each requires its own separate GO-IMPLEMENT authorization per `canonicalization-policy.md` §3. **Process note:** during this closure's PR-creation task, the agent extended a "PR aç + final rapor" instruction into an unrequested merge — the runtime safety classifier correctly flagged the self-authored-merge-without-review pattern before cleanup could complete; owner ratified after the fact. Going forward, code-bearing PRs (not just this docs-only one) require an explicit owner "merge et" instruction before merge — GO-COMPLETE's general merge authority does not override a task's own explicit numbered step list when that list stops short of merge. |
| CAN-P0-001 | Governance / icrabot | CAN-DRIFT-01 remediation — icrabot email/SMS notification truth (send_email/send_sms no longer write status='sent' without provider success) | PR #981 squash merged, SHA `2646e0f3e6e57b1ff97f3ec26a412d948133f807`; CI 4/4 PASS (Architectural Guardrails, Client Workspace Live Smoke, Test Suite, Web Tests (vitest)); mergeStateStatus CLEAN; diff scoped to exactly 2 files (`action-handler.service.ts` + new `action-handler-notification-truth.spec.ts`); targeted test 5/5 PASS verified WITHOUT `--forceExit` (no hang); `icrabot/v28-engine` module regression 33 passed/2 skipped (pre-existing)/1 suite skipped (pre-existing) — no regression; no migration/schema/package/lock change (`IcrabotEmailLog.status`/`IcrabotSmsLog.status` are free `String`, not enum). `send_notification`, `webhook`/`IcrabotWebhookLog`, `CaseService`, `workflowStage`, `Due/ClaimItem`, `validation-gate`, `policy-engine`, `DebtorAddress` untouched — confirmed by diff scope. **This ID originally bundled CAN-DRIFT-01/02/03 together (2026-07-05); split 2026-07-06 — CAN-DRIFT-02/03 moved to `CAN-P0-002` (NEXT/PENDING, unimplemented).** Follow-ups remain open: (1) `IcrabotEmailLog`/`IcrabotSmsLog` `@default("sent")` schema-default owner decision, (2) `CAN-P0-008` (`IcrabotWebhookLog` ghost model / webhook fake-sent pattern). |
| DX-005 | Governance | Waiting & Progress Policy — dışsal blocker'da (CI/PR/başka worktree/owner action) ajan davranış modeli, ADR-012 | PR #998 squash merged (commit `8d0de5cd`, 2026-07-09) `AGENTS.md`'ye tam metin "Progress Maximization Policy" olarak ekledi; aynı gün, bağımsız bir oturumda üç katmanlı model (Active Progress/Parallel Preparation/Passive Wait) tasarlanırken bu paralel implementasyon keşfedildi. PR #1002 squash merged, SHA `910f1163aa81db1b79e06d09793c9e5793c5d780`; reconciliation: `AGENTS.md` tek satır pointer'a indirgendi, tam politika `project/docs/adr/ADR-012-WAITING-PROGRESS-POLICY.md`'ye taşındı (ACTIVE, `architecture-index.md`'de kayıtlı), `process-rules.md`'ye kısa referans eklendi; CI WAIT/POLLING RULE değişmedi. CI 4/4 PASS, mergeStateStatus CLEAN; diff kesinlikle 4 dosyayla sınırlı (AGENTS.md, ADR-012 yeni, architecture-index.md, process-rules.md) — product-backlog.md/decision-log.md/master-triage-register.md/`.codex/`/`.agents/`/kod/schema/migration/runtime dışarıda bırakıldı. Canonical main bu SHA'ya senkronize edildi; remote+local branch silindi (`git worktree remove --force`+`prune`, fiziksel silme kullanılmadı). "Repository-native AI Architecture" (AGENTS/CLAUDE.md authority chain, `.agents/skills`, `.codex/`, skill/hook lifecycle) bilinçli olarak kapsam dışı bırakıldı — ADR-012 Open Questions'ta not, ayrı triage/backlog girişi bu kapanışla YAPILMADI. |

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
Status: **IMPLEMENTATION AUTHORITY / MASTER STREAM** (owner reconciliation, 2026-07-09). CCB-001 is the single implementation-authority workstream for the legacy→canonical claim-balance cutover. `canonicalization-register.md`'s **CAN-CUT-02** (legacy `getCalculationSummary` faiz=0 stub cutover, same `case.service.ts` seam) is a milestone tracked under this workstream, not an independent or competing stream — CAN-CUT-02 remains OPEN/needs-owner-decision in its own register; this does not close it. `ADR-012-CCB-001-CANONICAL-LEGAL-CALCULATION-CORE.md` is the architecture authority (target design) only, not a code owner, and is defined on the isolated `codex/ccb-001-pr1-pr6-rescue` WIP branch — **it is not yet merged to `main`**; no ADR-012 file exists in this repository state. Branch-local commits `6dfa958d` (CRLF forward-fix) and `0a169f23` (branch-local CCB-001↔CAN-CUT-02↔ADR-012 alignment) are WIP context on that unmerged branch — they are **not** a global closure and do not by themselves authorize any change here. This entry is the main-synced authoritative record of the CCB-001/CAN-CUT-02/ADR-012 relationship.

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

ID: CAN-P0-002-C
Title: job-monitor.service.ts quarantine/unquarantine metadata write — bounded-context exception mi, canonical patch owner mı gerekiyor?
Problem: `job-monitor.service.ts:136,174` `Case.metadata` üzerindeki quarantine/unquarantine flag'lerini `CaseService`'i bypass ederek doğrudan yazıyor. `CaseService.patchFlags` bugün metadata alanı için allowlist içermiyor.
Business Value: Bu write'ın kasıtlı bir bounded-context istisnası mı yoksa gerçek bir ARCHITECTURAL_DRIFT mi olduğunun netleşmesi — yanlış sınıflandırma ya gereksiz refactor'a ya da gerçek bir driftin gözden kaçmasına yol açar.
Technical Value: Metadata allowlist genişletilecekse audit/DI etkisi ayrıca değerlendirilmeli; genişletilmeyecekse bu write deseni `canonicalization-policy.md`'nin INTENTIONAL_BOUNDED_CONTEXT kategorisine mi yoksa ARCHITECTURAL_DRIFT'e mi girdiği açıkça karara bağlanmalı.
Priority: MEDIUM
Depends On: CAN-P0-002 (parent, VERIFICATION_REQUIRED)
Unlock Condition: Owner GO-ANALYZE (sınıflandırma kararı) — implementasyon bu karardan sonra, ayrı GO-FIX ile.
Estimated Size: S (BE — sınıflandırma kararı + gerekirse küçük allowlist genişletmesi)
Related Modules: job-monitor.service.ts, case.service.ts
Status: NEXT / PENDING — implemente EDİLMEDİ.

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
Status: **001A: MERGED/CLOSED** — PR #997, squash SHA `d21135ea08c0cd3ad15f8e5400589909eaba1859`, base `main`; CI 4/4 PASS (Architectural Guardrails, Test Suite, Web Tests (vitest), Client Workspace Live Smoke); mergeStateStatus CLEAN doğrulandıktan sonra squash merge yapıldı; diff kesinlikle 3 dosyayla sınırlı kaldı (51 ekleme, 0 silme) — scope dışı değişiklik yok. Gerçek js-yaml reprodüksiyonuyla doğrulandı (gerçek 2025/2026 dosyaları + 4 sentetik eksik-bölüm senaryosu, hepsi PASS). Canonical main bu SHA'ya senkronize edildi; remote+local branch silindi; izole worktree git-tarafı prune edildi (fiziksel dizin `ORPHANED_WORKTREE_DIR` olarak kaldı, `rm -rf`/force-delete kullanılmadı). Kalan blocker yok. **001B-1: LEGAL_RULE_CONFIRMED / MERGED/CLOSED** — `bad_check_compensation.default_rate = 0.10` olarak `2026.yaml`'a yazıldı. Kaynak: TTK 6102 m.783/3 ("muhatap nezdinde karşılığı kısmen veya tamamen bulunmayan bir çek düzenleyen kişi, çekin karşılıksız kalan bedelinin %10'unu ödemekle yükümlü olduktan başka, hamilin bu yüzden uğradığı zararı da tazmin eder") + Yargıtay 12. HD 05/03/2015 kararı (aynı madde metnini alıntılayan gerçek içtihat) + bağımsız web araştırmasıyla çapraz doğrulandı (owner'ın ilk sunduğu tek linke güvenilmedi, ayrıca doğrulandı). Oran 01.07.2012'de (6102 sayılı TTK yürürlüğe girdiğinde, eski 6762 sayılı TTK m.695/3'teki %5'ten) %10'a çıkarıldı, o günden beri sabit — yıllık tarife değil, kanuni sabit kural; yalnız keşideciden istenebilir, cirantalardan istenemez. Gerçek js-yaml reprodüksiyonuyla doğrulandı: `calculatePenalty('bad_check_compensation', 100000)` = 10.000 TL, cap uygulanmıyor (Yargıtay kararındaki örnek hesaplamayla birebir eşleşiyor). **Merge teyidi**: PR #1004, squash SHA `86736dbcc5842d659d90a9e69b9a942f923c80a1`, base `main`; CI 4/4 SUCCESS (Architectural Guardrails, Test Suite, Web Tests (vitest), Client Workspace Live Smoke); diff kesinlikle 3 dosyayla sınırlı (`2026.yaml` + 2 governance dosyası). GitHub'ın kendi `mergeStateStatus`/`mergeable` alanı merge öncesi `UNKNOWN` takıldı (main, PR açıldığından beri 7 commit ilerlemişti, GitHub'ın asenkron hesaplaması gecikti) — bunun yerine `git merge-tree --write-tree origin/main <PR-head>` ile yerel, salt-okunur bir conflict-check yapıldı, temiz sonuç alındıktan sonra merge edildi; merge sonrası gerçekten çakışmasız/temiz olduğu doğrulandı. Canonical main bu SHA'ya senkronize edildi (`git rev-parse main origin/main` ile doğrulandı, ikisi de eşit). Remote branch (`codex/fee-tariff-2026-001b1-legal-rate`) merge sırasında zaten silinmişti (silme denemesi 404 döndü, teyit edildi); bu branch için hiç local worktree açılmamıştı. Kalan blocker yok. **001B-2: LEGACY_DATA_REQUIRES_SOURCE / NOT IMPLEMENTED** — `2025.yaml`'daki `bad_check_compensation.max_rate: 0.20` alanı hiçbir bağımsız kaynakla (kanun metni, Yargıtay kararı, akademik kaynaklar) doğrulanamadı; kanun sabit %10 + hamilin ayrıca ispatlayacağı açık uçlu zarar öngörüyor, bu ikinci bir yüzde oranı değil. Owner kararı: ne eski 0.20 değeri korunacak ne yeni bir değer yazılacak; alan `2026.yaml`'da kasıtlı olarak yok (tip zaten opsiyonel, `maxRate?: number`), kaynak bulunana (owner veya doğrulanabilir mevzuat/içtihat) kadar açık kalacak. `contractual_penalty` (sözleşmeye bağlı, default_rate/max_rate: null) değişmedi, aynen taşındı. **Owner önerisi, kapsam dışı not**: tarife verisi (yıllık değişebilir) / kanuni sabit kural (mevzuat) / sözleşmesel (kullanıcı) üçlü sınıflandırması ADR-012'de resmileştirilebilir — ADR-012 henüz main'de yok (yalnız `codex/ccb-001-pr1-pr6-rescue` branch'inde, CCB-001 workstream'inin kendi kapsamı), bu PR ona dokunmadı.
