# GOVERNANCE INDEX — Okuma Sırası ve Belge Haritası

```text
Belge yolu : project/docs/governance/GOVERNANCE-INDEX.md
Durum      : RATIFIED / CANONICAL
Rol        : Routing/discovery katmanıdır; semantic veya execution authority üretmeden
             görev için hangi canonical kaynağın hangi sırayla okunacağını gösterir.
```

## RELATED DOCUMENTS

- Üst çatı: `project/docs/governance/SYSTEM-CONSTITUTION.md`
- Ajan baseline: `AGENTS.md` (repo kökü) + `CLAUDE.md` (Claude supplement)
- Beş modül çalışma routing'i:
  `project/docs/governance/CANONICAL-FIVE-MODULE-WORKSPACE-MAP.md`
  (OFFICE/CLIENT/DEBTOR/RECEIVABLE/COLLECTION; non-authorizing discovery map)
- Ratifiye domain governance: `project/docs/governance/DEBTOR-GOVERNANCE.md` ve
  `project/docs/governance/RECEIVABLE-GOVERNANCE.md`
- Receivable Legal Subtype Registry V1 artifact pack:
  `project/docs/governance/receivable-legal-subtype-registry-v1.md`,
  `receivable-legal-subtype-registry-v1.json`, `.schema.json`, `.checksum.json` ve `-crosswalk.md`
- Shared document-source authority contract:
  `project/docs/governance/DOCUMENT-SOURCE-GOVERNANCE.md`
- Collection domain governance: `project/docs/governance/COLLECTION-GOVERNANCE.md`
  (owner-approved canonicalization 2026-07-13; canonical upon approved merge)
- Governance writer coordination:
  `project/docs/governance/governance-writer-coordination-contract.md`
  (V1 fixed `CODEX_LOCAL` executor, manual queue/manual merge, request/result
  immutability ve protected-path coordination contract'i)

- Governance orchestration V2 (T1 ratified):
  `project/docs/governance/coordination-v2/governance-orchestration-contract-v2.md`
  (+ `coordination-v2/schemas/`, `programs.manifest.json`, `environment-evidence.md`;
  GOV-COORD-V1'i supersede ETMEZ, implementation authority üretmez)
## 1. Zorunlu okuma sırası (her yeni görev)

```text
Yeni görev
→ AGENTS.md                                   (execution ve repository-safety authority)
→ GOVERNANCE-INDEX.md                         (routing/discovery; authority değildir)
→ CANONICAL-FIVE-MODULE-WORKSPACE-MAP.md      (workspace module routing; authority değildir)
→ SYSTEM-CONSTITUTION.md                      (system-wide semantic authority)
→ İlgili TÜM RATIFIED / CANONICAL             (cross-domain görevde tek belge seçilmez;
  Domain Law / domain governance               ilgili bütün domain belgeleri okunur)
→ İlgili contract / standard                  (varsa; domain belgesinin RELATED DOCUMENTS listesinden)
→ Architecture Index → ilgili ADR             (architecture-index.md → project/docs/adr/)
→ Canonical split plan                        (varsa)
→ decision-log.md                             (son owner kararları ve supersession kayıtları)
→ Master Register                             (product-backlog.md, master-triage-register.md,
                                               active-roadmap.md — görev ID/durum kontrolü)
→ Pre-implementation consistency check        (scope, authority, invariant, status ve gate kontrolü)
→ Implementation                              (yalnız GO yetkisi + izole worktree ile)
```

`GOVERNANCE-INDEX.md` yalnız routing/discovery katmanıdır; Constitution, Domain Governance,
ADR, owner kararı veya execution izni yerine geçmez. Belge haritasında statüsü açıkça
`RATIFIED` / `CANONICAL` olan domain governance belgeleri binding seçim yüzeyidir.
`PROPOSED`, `DRAFT` veya `OWNER REVIEW` belgeleri kendiliğinden authority üretmez.

Kural: Sıradaki bir belge görev alanıyla ilgisizse atlanabilir. Cross-domain görevde ilgili
tek domain belgesi seçilemez; görevle ilişkili bütün ratified/canonical domain governance
belgeleri ve Master Register birlikte doğrulanır. Yeni domain governance belgesi ratifiye
edilip canonical belge haritasına alındığında aynı discovery kuralına otomatik olarak dahil olur.

Decision Log son owner kararlarını ve supersession kayıtlarını taşır; kayıt tarihi tek başına
üstün norm üretmez. Daha yeni bir Decision Log kaydı açık amendment, ratification veya
supersession olmadan System Constitution'ı ya da ratifiye Domain Governance'ı sessizce
override edemez.

Canonical kaynaklar arasında normatif çelişki tespit edilirse implementation durur ve yalnız
Governance Reconciliation önerilir. Çelişki tespiti tek başına doküman değiştirme, execution,
commit, merge, release veya runtime authority yetkisi oluşturmaz.

## 2. Belge haritası

| Belge | Rol | Durum |
|---|---|---|
| `AGENTS.md` (repo kökü) | agent execution ve repository-safety authority | AKTİF |
| `project/docs/governance/SYSTEM-CONSTITUTION.md` | system-wide semantic authority | RATIFIED / BINDING / CANONICAL v1.9; v1.1 allocation authority + v1.2 RD01 + v1.3 XD-001 + v1.4 ClaimItem formation + v1.5 TPA-02 + v1.6 TPA-03/03A + v1.7 TPA-04 + v1.8 TPA-04A + v1.9 TPA-04B contract. TPA-04B exact two-file amendment PR #1470 / `9dabe8db` ile CLOSED / CANONICAL EVIDENCE; TPA-04C..G ayrı owner gate, runtime/cutover unauthorized |
| `project/docs/governance/GOVERNANCE-INDEX.md` | routing/discovery ve okuma sırası; authority değildir | RATIFIED / CANONICAL |
| `project/docs/governance/CANONICAL-FIVE-MODULE-WORKSPACE-MAP.md` | OFFICE/CLIENT/DEBTOR/RECEIVABLE/COLLECTION çalışma modüllerine ve cross-module/shared hatlara başlangıç routing'i; living status veya authority kopyalamaz | CANONICAL ROUTING MAP / NON-AUTHORIZING; Coordination V2 5-vs-6 program taksonomisini çözmez |
| `project/docs/governance/DEBTOR-GOVERNANCE.md` | ratifiye Debtor Domain Law | RATIFIED / BINDING / CANONICAL v1.0 (2026-07-12; PR #1139 MERGED) |
| `project/docs/governance/RECEIVABLE-GOVERNANCE.md` | ratifiye Receivable Domain Governance ve tek domain giriş noktası | RATIFIED / BINDING / CANONICAL v1.9; ClaimItem source/input ≠ application target; TPA-02/03/03A, TPA-04, TPA-04A ve TPA-04B contract canonicaldır. TPA-04B exact two-file amendment PR #1470 / `9dabe8db` ile CLOSED / CANONICAL; plan/writer/evidence/cutover/retirement NOT AUTHORIZED |
| `project/docs/governance/receivable-legal-subtype-registry-v1.md` + `receivable-legal-subtype-registry-v1.json` + `.schema.json` + `.checksum.json` + `-crosswalk.md` | Receivable Claim Formation için exact seven-code, versioned Legal Subtype Registry V1 ratification, machine payload, closed schema, deterministic checksum ve Legal Basis/evidence crosswalk pack'i | `RCV-CLAIM-FORM-P02-S08-D02-SR01` RATIFIED / CANONICAL UPON APPROVED MERGE; registry `RCV-CLAIM-LEGAL-SUBTYPE-REGISTRY@1`, checksum `320f671e…c26e64`, runtime DORMANT; provider/resolver/key/signature/signed release/schema/migration authority NONE; next D02-PB01 owner-gated |
| `project/docs/governance/DOCUMENT-SOURCE-GOVERNANCE.md` | Shared Evidence / Document Platform için bounded document-source identity, immutable version, integrity/fingerprint, OCR-evidence ve lifecycle authority contract'ı; yeni primary domain/program/register değildir | OWNER-RATIFIED OPTION D / CANONICAL UPON APPROVED MERGE; V4 immutable versioned fingerprint; OCR O1 derived/non-authoritative; writer/resolver/schema/migration NOT AUTHORIZED |
| `project/docs/governance/RCV-PHASE-1-AUTHORIZATION.md` | RCV → CCB-001 identity-only program/register cross-pointer'ı, DEC-0030 disposition'ı, formal phase/workstream/package closure ve owner gate kaydı | CANONICAL / DEC-0030 CLOSED; PHASE 1 CLOSED; WS01–WS03 CLOSED; WS04 OPEN. TPA-02/03/03A, TPA-04/04A ve TPA-04B schema amendment canonical; ACT-28 / REC-AUTH-011/012 OPEN; PR #407 CLOSED/UNMERGED/NO FURTHER ACTION. Next `TPA-04C — PURE LEGALAPPLICATIONPLAN BUILDER ANALYSIS`; owner GO-ANALYZE required, implementation NOT AUTHORIZED. |
| `project/docs/governance/OFFICE-GOVERNANCE.md` | ratifiye OFFICE Domain Law — vocabulary/ownership/boundaries/invariants/contracts | RATIFIED / CANONICAL DOMAIN LAW v1.0 (2026-07-13; PR #1177 MERGED, SHA `6fa8395d`) |
| `project/docs/governance/OFFICE-MASTER-SYNTHESIS.md` | OFFICE kanıt/gerekçe/senaryo katmanı (operasyonel değil) | CANONICAL REFERENCE / NON-NORMATIVE EVIDENCE BASELINE |
| `project/docs/governance/OFFICE-RISK-REGISTER.md` | OFFICE domain risk dossier'i; global triage/execution status otoritesi DEĞİLDİR | CANONICAL DOMAIN RISK DOSSIER |
| `project/docs/governance/OFFICE-OWNER-DECISIONS.md` | OFFICE açık owner karar dossier'i; kapanmış karar otoritesi DEĞİLDİR | CANONICAL OPEN-DECISION DOSSIER |
| `project/docs/governance/OFFICE-DELIVERY-MANIFEST.md` | OFFICE Phase 1 delivery sequencing, dependency and slice-state authority | CANONICAL / AUTHORITATIVE LIVING DELIVERY SOURCE |
| `project/docs/governance/OFFICE-PHASE2-CONSTITUTION.md` | OFFICE Phase 2 program-seviyesi normatif çerçeve; SYSTEM-CONSTITUTION ve OFFICE-GOVERNANCE'a TABİDİR, ikisini de değiştiremez; implementation authority üretmez | RATIFIED / CANONICAL PROGRAM-LEVEL NORMATIVE v1.0 (2026-07-17; kuruluş PR #1359) |
| `project/docs/governance/OFFICE-PHASE2-MASTER-SYNTHESIS.md` | OFFICE Phase 2 capability/dependency sentezi (operasyonel değil; norm kaynağı değildir) | CANONICAL REFERENCE / NON-NORMATIVE / AS-OF EVIDENCE BASELINE v1.0 (2026-07-17; kuruluş PR #1359) |
| `project/docs/governance/OFFICE-PHASE2-PROGRAM-CHARTER.md` | OFFICE Phase 2 program charter — hedef/teslimat/başarı/çıkış kriterleri; authorization belgesi DEĞİLDİR | RATIFIED / CANONICAL PHASE PROGRAM AUTHORITY v1.0 (2026-07-17; kuruluş PR #1359) |
| `project/docs/governance/OFFICE-PHASE2-ROADMAP.md` | OFFICE Phase 2 sıralama/decomposition çerçevesi; Wave/Candidate/Task/implementasyon-sırası SEÇMEZ, authority üretmez | CANONICAL PLANNING REFERENCE / NON-AUTHORIZING v1.0 (2026-07-17; kuruluş PR #1359) |
| `project/docs/governance/OFFICE-PHASE2-DECOMPOSITION.md` | OFFICE Phase 2 decomposition blueprint — dört Phase 2 foundation belgesinden (Constitution/Master-Synthesis/Charter/Roadmap) türetilir; capability delivery map + increment/Wave mimarisi + decision queue + exit coverage + first-unit seçenekleri; hiçbir Wave/unit SEÇMEZ; mutable delivery statü TAŞIMAZ (statü authority = `OFFICE-DELIVERY-MANIFEST.md`) | CANONICAL REFERENCE / NON-NORMATIVE / NON-AUTHORIZING v1.0 (2026-07-18) |
| `project/docs/adr/` + `architecture-index.md` | teknik/mimari kararlar ve gerekçeleri | KAYITLI STATÜYE GÖRE |
| Implementation standards | code/API/test/deployment/operation conventions | BELGE STATÜSÜNE GÖRE |
| Roadmap / Master Register | work sequencing, owner gates ve closure state | AKTİF; authority/implementation izni üretmez |
| `project/docs/governance/README.md` | governance klasör tanımı ve dosya listesi | AKTİF |
| `project/docs/governance/decision-log.md` | kronolojik karar kaydı | AKTİF |
| `project/docs/governance/architecture-index.md` | repo ADR kütüğü indeksi | AKTİF |
| `project/docs/governance/product-backlog.md` | Product Backlog / Master Register | AKTİF |
| `project/docs/governance/master-triage-register.md` | triage/verification register | AKTİF |
| `project/docs/governance/active-roadmap.md` | aktif fazlar | AKTİF |
| `project/docs/governance/dbind-financial-authority-decisions.md` | finansal otorite kararları | AKTİF |
| `project/docs/governance/pending-migration-coordination-register.md` | gerçek hukuk_db'de tespit edilen, henüz live-apply edilmemiş migration kuyruğunun cross-workstream görünürlüğü; domain governance veya implementation izni ÜRETMEZ | LIVING / NON-NORMATIVE (kuruluş 2026-07-21, OFFICE-AUTH-P02-HARDENING-R01-GOMIGRATE-SUSPEND-01); 2026-07-21 kuyruğu (M1-M4) TAMAMEN UYGULANDI — CROSS-WORKSTREAM-LIVE-MIGRATION-TRAIN-R01 CLOSED (register §9, 2026-07-22); 2026-07-23 kuyruğu (M1-M8) TAMAMEN UYGULANDI — CROSS-WORKSTREAM-LIVE-MIGRATION-TRAIN-R02 CLOSED (register §16-§17); register gelecekteki kuyruklar için açık kalır |
| `project/docs/governance/cross-workstream-migration-execution-contract.md` | Herhangi bir gelecekteki cross-workstream migration train'i için tekrar kullanılabilir, train-bağımsız entry/pre-execution/execution/post-execution/failure-rollback prosedürü + authority matrix + evidence-packet tanımı; register'ın instance-level kaydının YERİNE GEÇMEZ | CANONICAL PROCEDURE / OPERATIONAL CONTRACT (kuruluş 2026-07-23, CROSS-WORKSTREAM-LIVE-MIGRATION-TRAIN-R02-EXECUTION-CONTRACT; TRAIN-R02 register §15-§17'den çıkarılmıştır); IMPLEMENTATION AUTHORITY: NONE |
| `project/docs/governance/governance-writer-coordination-contract.md` | Shared governance writer'lar için immutable request → validation → execution PR → result kaydı akışını, protected path'leri, Level 2 mechanical operation sınırını ve authority ayrımını tanımlar | OWNER-RATIFIED V1 / CANONICAL ON APPROVED MERGE; PRIMARY_EXECUTOR `CODEX_LOCAL`; SECONDARY DISABLED; MANUAL_QUEUE_RUN + MANUAL_MERGE; LEASE/AUTO-MERGE/SCHEDULER NONE |
| `project/docs/governance/governance-writer-coordination-register.md` | Immutable request/result instance'larından deterministik üretilen queue/result görünümü | GENERATED / DERIVED / NON-AUTHORITATIVE; semantic veya execution authority ÜRETMEZ |
| `project/docs/governance/governance-writer-coordination-cutover-record.md` | V1 effective-from SHA ve bootstrap öncesi grandfathered owner WIP snapshot'ı | IMMUTABLE BOOTSTRAP CUTOVER RECORD; WIP disposition/removal/reconciliation authority ÜRETMEZ |
| `project/docs/governance/coordination-v2/governance-orchestration-contract-v2.md` | GOV-COORD-V2 execution contract — iki execution profile (`MECHANICAL_GOVERNANCE` + `BOUNDED_CODE_TASK`; ikincisi positive allowlist'tir, V1 `deniedTargetPrefixes`'in inverse'i DEĞİLDİR), immutable task-spec authorization, 14-state lifecycle, revocable SHA-bound `MERGE_READY` attestation, `git update-ref` expected-old-object CAS lease + monoton fencing epoch, executor resolution/process contract, RFC 8785 hash canonicalization, base-drift policy, task plan authoring (COL/OD-18A lane kuralı). GOV-COORD-V1'i supersede ETMEZ | RATIFIED / CANONICAL v1.0 — owner ratification `decision-log.md` 2026-07-26 `GOV-COORD-V2-T1-RATIFICATION`; PR #1600 / squash `1650b57e`. IMPLEMENTATION AUTHORITY: NONE — task/grant/lease instance, live pilot ve auto-merge üretmez |
| `project/docs/governance/coordination-v2/schemas/` (`task` · `grant` · `executor` · `lease` · `program` · `result`) | V2 contract'ının machine-readable schema seti; `additionalProperties: false`, enum'lar, path/hash format sınırları, profile-conditional validation | CANONICAL SCHEMA SET v1.0 (PR #1600) — yalnız SCHEMA; instance İÇERMEZ |
| `project/docs/governance/coordination-v2/programs.manifest.json` | Altı program için KİMLİK ve active-status manifesti; revision-anchored evidence (`sourceCommitSha` + `exactExcerpt` + `excerptSha256`) taşır. Program İÇERİĞİ veya task listesi TAŞIMAZ | GENERATED / DERIVED / NON-AUTHORITATIVE — altı programın tamamı `liveExecutionEligibility: DENIED`; 5-vs-6 taksonomi sorusu AÇIK (`taxonomyLevel: UNKNOWN` fail-closed) |
| `project/docs/governance/coordination-v2/environment-evidence.md` | V2 §14 uyarınca normatif contract'tan AYRILMIŞ, zaman damgalı ortam gözlemi (executable path/version/smoke, required-check kümesi, common-dir topolojisi, base-drift gözlemi) | TIMESTAMPED OBSERVATION / NON-NORMATIVE — hiçbir değeri hüküm olarak alıntılanamaz |
| `project/docs/analysis/debtor-master-synthesis-v2.md` | borçlu hattı kanıt/gerekçe katmanı (operasyonel değil) | KANIT — SUPERSEDED BY governance |
| `project/docs/governance/DEBTOR-PHASE-0-COMPLETION-ROADMAP.md` | BORÇLU PLATFORMU Phase 0 (Wave 0) tamamlanma sentezi — completed foundations, owner kararları, deferred/transferred work, Blueprint girdileri, Phase 1 giriş kriterleri | CANONICAL / PHASE 0 CLOSED — PR #1240 owner-ratified Wave 0 closure'ının sentez belgesi |
| `project/docs/blueprint/` (`DEBTOR-CANONICAL-DOMAIN-BLUEPRINT-CHARTER-v1.0.md` + `DEBTOR-DBP-02..12-*.md`, 13 belge) | BORÇLU PLATFORMU Phase 1 Canonical Domain Blueprint — 9-katman mimari sentez (L1-L9), 12 work-package (DBP-02..12), 31 zorunlu artefakt, BR-01..21/N-01..26 register'ları | BLUEPRINT DOCUMENT SET: IMPLEMENTED/MERGED/CANONICALIZED (her belge kendi `Owner Approval Record`'unu taşır) / GOVERNANCE RECONCILIATION: RECORDED (`decision-log.md` 2026-07-16 DBP-GOV-01) / DBP-P1-CANONICALIZATION: VERIFIED/CLOSED (`DBP-P1-CANON-CLOSE` R1 → `DBP-REMOTE-BRANCH-CLEANUP` → R2) / OWNER BLUEPRINT RATIFICATION: RECORDED/CANONICAL (`decision-log.md` 2026-07-16 DBP-OWNER-RATIFY-01) / PHASE 1 BLUEPRINT: CANONICAL CLOSED / IMPLEMENTATION ENTRY: HOLD / NEXT IMPLEMENTATION WORKSTREAM: OWNER DECISION REQUIRED |
| `project/docs/blueprint/DEBTOR-UYAP-CONNECTOR-CHARTER-v1.0.md` | BORÇLU PLATFORMU Phase 2 UYAP Connector — connector delivery roadmap'ini tek canonical charter'da konsolide eder (8-dilim, canonical reuse matrix, connector dependency graph, authority gates, security constitution); mevcut P01-P02B-R2 zincirini reopen etmez, connector implementasyonu başlatmaz | CANONICAL BLUEPRINT / GOVERNANCE-ONLY (kuruluş `decision-log.md` DBP-P2-UYAP-CONNECTOR-CHARTER-01-GOV, 2026-07-20); UYAP CUTOVER HARD HOLD korunur |
| `project/docs/blueprint/UYAP-CONNECTOR-MASTER-SYNTHESIS-v1.0.md` | Merkezi UYAP Anayasası — connector-geneli kalıcı anayasal ilkeler, 5+1 modül sınır matrisi, aktör/yetki matrisi, State/Evidence/KVKK-retention/Credential/Transport/Retry/Simulator Constitution'ları, official-source Tier A/B/C sınıflandırması, external dependency register, risk register, A2Z roadmap; Charter'ı reopen etmez | CANONICAL CENTRAL CONSTITUTION **v1.1** (kuruluş `decision-log.md` UYAP-MASTER-SYNTHESIS-01-GOV; v1.1 §19 ratifikasyonu `UYAP-CONSTITUTION-V11-01`, 2026-07-21); OD-UYAP-01/02/07 RATIFIED, OD-UYAP-03/04/05/06/08/09/10 AÇIK (03/04/05/06/09/10 için normatif yön UYAP-CONST annex'te); IMPLEMENTATION AUTHORITY: NONE; UYAP CUTOVER HARD HOLD korunur; program omurgası KARARLAR 1-11 tescili: `decision-log.md` UYAP-PROGRAM-BACKBONE-01 (2026-07-21) — F0-F8 yalnız planlama/crosswalk görünümü (sentez §18.1) |
| `project/docs/blueprint/UYAP-CONNECTOR-NORMATIVE-ANNEX-v1.0.md` | Merkezi UYAP Anayasası'nın tek subordinate normatif annex'i — `UYAP-CONST-001..010` (official channel/authority, tenant-actor-lawyer-representation, credential-signature, operation-attempt-evidence identity, three-state+non-equations, idempotency-retry-OUTCOME_UNKNOWN, PII-minimization-retention, simulator-shadow-truthfulness, metrics-incident-cutover, autonomy A0-A5) | CANONICAL SUBORDINATE ANNEX (kuruluş `decision-log.md` UYAP-CONSTITUTION-V11-01, 2026-07-21); bağımsız anayasa DEĞİL, yalnız synthesis §19 yetkilendirir; modül belgeleri kopyalayamaz; çelişkide synthesis kök + owner karar kaydı üstün; UYAP-CONST-001..010 RATIFIED; IMPLEMENTATION AUTHORITY: NONE; UYAP CUTOVER HARD HOLD korunur |
| `project/docs/blueprint/UYAP-CONNECTOR-MODULE-BOUNDARY-CONTRACTS-v1.0.md` | UYAP Connector 5 modül boundary contract pack'i — `UYAP-BC-OFFICE-001`/`-CLIENT-001`/`-DEBTOR-001`/`-RECEIVABLE-001`/`-COLLECTION-001` (her modülün connector'a sağladığı canonical girdi + kabul edilen çıktı + authority/evidence gate + devredilemez ownership + failure/reconciliation), shared envelope + cross-module matrix (18 work-unit) | CANONICAL CONTRACT PACK (kuruluş `decision-log.md` UYAP-MODULE-BOUNDARY-CONTRACTS-01, 2026-07-21; F2/D12); subordinate normative annex DEĞİL, yeni constitution DEĞİL — synthesis §20 + UYAP-CONST-001..010'u CONSUME eder, merkezi kuralları kopyalamaz; domain ownership DEĞİŞMEZ; ServiceOccurrence (PR #1503) REUSE, runtime wiring YETKİLENDİRİLMEZ; IMPLEMENTATION AUTHORITY: NONE; UYAP CUTOVER HARD HOLD korunur |
| `project/docs/blueprint/UYAP-PROGRAM-AUDIT-RECONCILIATION-v1.0.md` | UYAP program audit reconciliation kaydı — canonical verdict (`FOUNDATION COMPLETE / RUNTIME OBJECTIVE NOT ACHIEVED`), F4-a/`EVIDENCE-01` reconciliation, P05 status/closure tablosu (migration taşıyan vs code-only ayrımı), iki ayrı `P05` namespace + alias/supersession crosswalk, CI test disposition düzeltmesi, historical canary izi, open residual listesi, canonical NEXT zinciri | CANONICAL AUDIT RECONCILIATION RECORD (kuruluş `decision-log.md` UYAP-AUDIT-GOVERNANCE-CLOSURE-R01, 2026-07-26; synthesis §21 dar pointer, §1-20 substantive DEĞİŞMEZ); yeni constitution/annex DEĞİL — mevcut canonical kayıtları CONSUME eder; append-only (historical satır silinmez/yeniden yazılmaz); evidence writers `IMPLEMENTED · CI-PROVEN · DEFAULT-OFF · NOT RUNTIME-PROVEN`, `IMPLEMENTATION GOVERNANCE: CLOSED / RUNTIME EVIDENCE OBJECTIVE: OPEN`; IMPLEMENTATION AUTHORITY: NONE; REAL TRANSPORT 0; UYAP CUTOVER HARD HOLD korunur; NEXT `UYAP-CPE-POA-AND-ACTING-LAWYER-AUTHORITY-DESIGN-01` NOT GRANTED / NOT STARTED |
| `project/docs/blueprint/UYAP-CPE-POA-ACTING-LAWYER-AUTHORITY-DESIGN-v1.0.md` | UYAP_SEND authority chain canonical design — current-state map (iki POA modeli: `ClientPowerOfAttorney` LIVE vs `PowerOfAttorney` DEAD; `Lawyer.userId` köprüsü dormant; `case.has_power_of_attorney` production writer'ı YOK; `sendPaymentOrder` POA bloğu fail-open by omission), seçilen **MODEL B (acting-lawyer matched POA)**, authority sequence, temporal/revocation + operation-scope kuralları, 6 tenant invariant, 5 computed CPE fact + `ActionContext` genişletmesi, TOCTOU iki fazlı freshness (TX-1 revalidation), 15 fail-closed hata kodu, evidence/PII sınırı, 16 makine-test-edilebilir invariant, minimum test matrisi, 7 bounded implementation paketi (I01-I07) + preflight bağımlılığı | CANONICAL DESIGN RECORD — OWNER DECISION GATE (kuruluş `decision-log.md` UYAP-CPE-POA-AND-ACTING-LAWYER-AUTHORITY-DESIGN-01, 2026-07-26); tasarım belgesidir, implementation/schema/migration/flag/canary/transport yetkisi ÜRETMEZ; `UYAP-CONST-002` + `UYAP-BC-OFFICE-001`/`-CLIENT-001` CONSUME edilir (Model A canonically inconsistent olduğu için REDDEDİLDİ); açık kararlar `DECISION-1` (office-internal delegation) ve `DECISION-2` (POA lifecycle şema kapsamı), her ikisinde DEFAULT = FAIL-CLOSED / NO IMPLEMENTATION; SCHEMA DELTA REQUIRED (yalnız `ClientPowerOfAttorney.tenantId` + `PoaLawyer.tenantId`, migration ÜRETİLMEDİ); IMPLEMENTATION AUTHORITY: NONE; REAL TRANSPORT NOT AUTHORIZED; UYAP CUTOVER HARD HOLD; NEXT `UYAP-ACTING-LAWYER-RESOLVER-I01` NOT GRANTED / NOT STARTED |
| `project/docs/governance/COLLECTION-GOVERNANCE.md` | Collection Domain Governance — receipt/lifecycle/allocation-execution sınırı, COL-INV-001..048, cross-domain contract haritası | OWNER-APPROVED CANONICALIZATION v1.8; TPA-04B required-evidence schema amendment PR #1470 / `9dabe8db` ile canonical ve M2 live DB'de applied/post-validated; TPA-04C pure-plan contract OD-TPA-04C-01..20 ratified. Collection receipt lifecycle/outer transaction owner; Receivable snapshot/bucket/policy/plan owner; runtime builder/writer/cutover unauthorized |
| `project/docs/governance/COLLECTION-MASTER-SYNTHESIS.md` | Collection kanıt/kalıcı-gerçek katmanı (operasyonel değil) | CANONICAL REFERENCE / NON-NORMATIVE EVIDENCE BASELINE |
| `project/docs/governance/COLLECTION-OWNER-DECISIONS.md` | Collection owner karar dossier'i (COL/OD-01..21 + additive kararlar); kapanmış karar otoritesi DEĞİLDİR | CANONICAL OPEN-DECISION DOSSIER — RECORDED/CANONICAL: COL/OD-01, -03, -04, -05, -06, -06A, -21; COL/OD-18 → COL/OD-18A AMENDED; kalan 14 kök karar OPEN |
| `project/docs/governance/COLLECTION-RISK-REGISTER.md` | Collection domain risk dossier'i; global triage/execution status otoritesi DEĞİLDİR | CANONICAL DOMAIN RISK DOSSIER |
| `project/docs/governance/COLLECTION-DECOMPOSITION.md` | RC-COL Program→Phase→Wave→Workstream haritası; execution yetkisi üretmez | CANONICAL DECOMPOSITION — PHASE 0 CLOSED / CANONICAL; PHASE 1 CLOSED / CANONICAL; PHASE 2 ACTIVE — W2.1/W2.2A/W2.2B/W2.2C-0/W2.2C-1/W2.2C-2/W2.2C-3/W2.2C-4/W2.2C-5 CLOSED; COL/OD-06A RECORDED, W2.2C DECISION GATE SATISFIED; W2.2D-0 PR #1407 / `1156e4de` ile CLOSED / CANONICAL upon approved reconciliation merge; COL-RISK-G03 PARTIALLY MITIGATED — CONFIRMEDAT / PROJECTION HARDENING REMAINS; W2.2D-1 OWNER GO REQUIRED / IMPLEMENTATION NOT AUTHORIZED; W2.3 BLOCKED — W2.2 BOUNDARY PENDING |
| `project/docs/governance/CLIENT-GOVERNANCE-CHARTER.md` | ratifiye CLIENT Governance Charter (bounded) — client ownership/invariants (CL-INV-001..008)/cross-domain contract map konsolidasyonu; **FULL DOMAIN LAW DEĞİLDİR**, mevcut Domain Law ve owner-kararı otoritesini kendi sınırlarında korur/override etmez | RATIFIED / CANONICAL CLIENT NORMATIVE BASELINE (BOUNDED CHARTER) v1.0 (2026-07-18; Option C owner-ratified); CANONICAL UPON APPROVED MERGE TO MAIN (bkz. `decision-log.md` CLIENT-P0-T05) |

## 3. Authority eksenleri

```text
Semantic authority:
SYSTEM-CONSTITUTION → Domain Law → ADR → Implementation

Execution and safety authority:
AGENTS.md + repository policies + task authorization + environment/tool restrictions
```

Bu eksenler tek doğrusal üstünlük sırası değildir. Semantic authority execution izni
vermez; execution authority domain semantiğini değiştirmez. Her görev iki eksene aynı
anda uymalıdır.

## 4. "Neden bu kural var?" zinciri

Bir governance kuralının gerekçesi arandığında iz şudur:

```text
DEBTOR-GOVERNANCE (kural, örn. INV-07)
→ Master Synthesis (project/docs/analysis/debtor-master-synthesis-v2.md — MS/DEC, MS/ADR, MS/FND kanıtı)
→ decision-log.md (ratifikasyon ve sonraki değişiklik kayıtları)

RECEIVABLE-GOVERNANCE (kural, örn. REC-INV-001)
→ İlgili ADR ve authority kayıtları (ADR-010, ADR-013, ADR-014 ve Master Register)
→ decision-log.md (ratifikasyon ve sonraki değişiklik kayıtları)

COLLECTION-GOVERNANCE (kural, örn. COL-INV-010)
→ COLLECTION-MASTER-SYNTHESIS (F-01..F-16 / OF-01..OF-06 kanıt katmanı)
→ tm3-collection-disposition-boundary.md + dbind-financial-authority-decisions.md (bağlayıcı sınır/karar kaynakları)
→ decision-log.md (canonicalization ve sonraki değişiklik kayıtları)

OFFICE-GOVERNANCE (kural, örn. OFF-INV-05)
→ OFFICE-MASTER-SYNTHESIS (LF/OP/PR-RT-* kanıt katmanı) + OFFICE-RISK-REGISTER (STF-PRD-*)
  + OFFICE-OWNER-DECISIONS (OFF/OD-*)
→ decision-log.md (ratifikasyon 2026-07-13 ve sonraki değişiklik kayıtları)

OFFICE-PHASE2-CONSTITUTION (hüküm, örn. OFF-P2-GOV-06)
→ dayanak: OFFICE-GOVERNANCE maddesi / kapanmış OFF-OD kararı / STF-PRD hedef kontrolü /
  Phase 1 delivery kanıtı (OFFICE-DELIVERY-MANIFEST)
→ decision-log.md (owner text-ratification kaydı, 2026-07-17)
```
