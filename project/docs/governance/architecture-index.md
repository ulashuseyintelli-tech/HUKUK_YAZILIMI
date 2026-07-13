# Architecture Index

Bu dosya kesinleşmiş mimari kararların indeksidir. Kararın ayrıntısı ilgili ADR, boundary veya tasarım dokümanında kalır.

Kurallar:

- Kesinleşmiş Architecture Decisions tekrar tartışılmaz.
- Yeni görev mevcut kararı bozuyorsa ajan durur ve kullanıcı kararı ister.
- Bu indeks karar metnini kopyalamaz; authoritative dokümana pointer verir.

## Decision Sources

| ID | Title | Authoritative Source | Status | Notes |
|---|---|---|---|---|
| ADR-009 | Universal Office Approval — durum-değiştiren mutation'lar patron/kurucu-ortak onayından geçer | `docs/adr/ADR-009-UNIVERSAL-OFFICE-APPROVAL.md` | LOCKED | Bilgi girişi doğrudan; durum-değiştiren işlem `OfficeApprovalRequest` (PENDING→kurucu ortak→executor). `OfficeApprovalRequest`(iç) ≠ `ClientApprovalRequest`(dış). Generalization per-action backend (P4/Codex); engine core P4-5C/3B önce. |
| ADR-010 | AccountingJournal North-Star SoT — finansal-olay source-of-truth hedefi; bugün additive/shadow | `docs/adr/ADR-010-ACCOUNTING-JOURNAL-SOT-NORTH-STAR.md` | LOCKED (direction) | AccountingJournal hedef finansal-olay SoT AMA #645 additive-only contract'ı ŞİMDİ supersede ETMEZ. TBK100 KURALLARI yasal otorite KALIR; LedgerEntry/LedgerAllocation STORAGE ileride journal-türevi projection olabilir. Cutover yalnız shadow→prove→legal-signoff sonrası. POST-P4 ana eksen (7-faz Accounting Engine). Execution gated (Codex/owner). |
| ADR-011 | Audit Description Sanitization Policy | `docs/adr/ADR-011-AUDIT-DESCRIPTION-SANITIZATION.md` | LOCKED | `AuditLog.description` system-authored only; user-authored text domain entity only; audit metadata reference/hash/presence/length/system facts only; default audit UI requires safe projection, not raw metadata/oldValues/newValues. |
| RUNBOOK-WTCLEANUP | Worktree Cleanup & Git Safety (Windows+pnpm+çoklu oturum) | `docs/runbooks/worktree-cleanup.md` | Active | Recursive fiziksel silme (cmd rd/Remove-Item -Recurse/rm -rf/.NET Delete(true)) YASAK; yalnız `git worktree remove --force`+`prune`; "Directory not empty"→ORPHANED (owner manuel). Branch: gh-merged doğrula→`-D`+`push --delete`. Cleanup sonrası canonical integrity check zorunlu. `.git/config` torn-write→stop+read-only teşhis. Normatif özet process-rules.md. |
| ADR-012 | Waiting & Progress Policy (DX-005) — dışsal blocker'da (CI/PR/başka worktree/owner action) davranış modeli | `docs/adr/ADR-012-WAITING-PROGRESS-POLICY.md` | ACTIVE | Üç katman: Active Progress (in-scope hazırlık, serbest) / Parallel Preparation (öner, başlatma owner kararı) / Passive Wait (son çare, mevcut CI WAIT/POLLING RULE aynen geçerli). İki ilke: "Passive waiting is the last option" + "An external blocker never authorizes scope expansion." CI bekleme mekaniğini DEĞİŞTİRMEZ, yalnız beklerken ne yapılacağını tanımlar. PR #998'de AGENTS.md'ye tam metin olarak eklenmiş erken versiyonun kanonik/pointer-model reconciliation'ıdır. |
| ADR-013 | Fee / Harç / Snapshot / Journal owner-review draft | `docs/adr/ADR-013-FEE-HARC-SNAPSHOT-JOURNAL.md` | DRAFT / OWNER REVIEW REQUIRED / BOUNDARY AUDIT REQUIRED | PAC-001-A evidence gate sonrası oluşturulan docs-only owner-review taslağı. AS-IS evidence ile TO-BE adaylarını ayırır; final producer ownership, approved producer chain, implementation PR sequence, fee implementation, PAC-Full veya CCB-001/ADR-014 cutover başlatmaz. |
| ADR-014 | CCB-001 Canonical Legal Calculation Core — legacy→canonical claim-balance clean-break cutover constitution | `docs/adr/ADR-014-CCB-001-CANONICAL-LEGAL-CALCULATION-CORE.md` | LOCKED / POST-PR-10 / PR-GATED / RUNTIME CUTOVER NOT AUTHORIZED | Canonical `computeBalance`/ClaimItem+TBK100+Interest Engine hedef tek hesaplama otoritesi. W0.1/W0.2/W0.3, Conditional Option B ve PR-1A..PR-10 CLOSED/CANONICAL. PR-10 existing calculation-summary alanlarını değiştirmeden typed/additive `canonicalCompatibility` payload'ı ekler; canonical per-currency balance, typed fee status, blocker/readiness, trace ve non-official snapshot kayıpsız taşınır, parity conflict fail-closed olur. Adapter `ADDITIVE_SHADOW_ONLY`; consumer switch ve primary authority promotion yoktur. Cutover policy ile PE-01/PE-01A/PE-02 DEFINED/CLOSED; ilk eligible pre-evidence hazırlık adımı PE-03 local environment contract'tır. PR-11 ve runtime cutover NOT AUTHORIZED. Fee/harç policy/formula, new FX/conversion authority ve official persistence owner-gated; duplicate allocator disposition owner-held kalır. `ADR-013` Fee/Harç policy ve official snapshot persistence için ayrı draft/owner-review hattıdır. Rescue branch merge kaynağı değildir. Cutover-authorization governance policy (split-plan §12 seq 11 decision record) `docs/design/adr-014-cutover-authorization-policy.md` olarak DEFINED/CANONICAL'dir — PR-11 scope = Hesap Özeti UI/API switch only (UYAP CAN-CUT-01/PR-A4/PR-A5'te bağımsız gated), synthetic≠representative/live evidence. Policy §9'da 15 cutover **owner decision** DEFINED/CANONICAL; policy §10 (2026-07-12) evidence env'i **LOCAL owner/ofis, gerçek veri doğrudan, harici aktarım/masking YOK** olarak reconcile eder ve §9.1/§9.2/§9.15/§2 sanitized-copy framing'ini SUPERSEDE eder (eski metin korunur). PE-02 procedure `docs/design/adr-014-evidence-data-access-procedure.md` içinde lifecycle/access/package/ownership standardını tanımlar, access veya runtime authority vermez. Anayasal çelişki yok (numeric+opak-ID çıktı SYS-AUTH-012/EVID-005'i, read-only SYS-AUTH-011'i karşılar). Policy + decisions + procedure DEFINED PR-11'i açmaz — authorization verified local environment + measured local baseline + local representative evidence + explicit owner APPROVED ister. Ayrıntılı current plan: `docs/design/adr-014-split-pr-plan.md` v2.14. |
| PAC-001-A | Authority Maps for ADR-013 Fee / Harç / Snapshot / Journal line | `docs/design/pac-001-a-authority-maps.md` | CLOSED / ADR-013 EVIDENCE GATE COMPLETE | Docs-only AS-IS evidence map and audit rubric merged via PR #1024 (`281befe70acbe585c2a1bb7640533e17e7c19a8d`). Official input for ADR-013 owner review; does not decide final producer ownership, approve PR sequence, start PAC-Full, fee code, Boundary Audit, Snapshot/Journal spec, or runtime behavior. |

**ADR-014 post-PE-05 routing override (2026-07-12):** PE-01 zero-cent contract,
PE-01A readiness implementation alignment, PE-02 Evidence/Data-Access Procedure, PE-03
Local Representative Evidence-Session Environment Contract, PE-04 Representative
Dataset Matrix and Sampling Manifest Contract and PE-05 Metrics, Audit, Dashboard and Alert
Operational Contract are `CLOSED / CANONICAL`. Technical/taxonomy
detail is `docs/design/adr-014-zero-cent-discrepancy-monitoring-contract.md`; lifecycle,
separate access/execution approval, local environment/dataset classification, package,
roles and ownership procedure is `docs/design/adr-014-evidence-data-access-procedure.md`;
local physical/logical isolation, read-only/no-egress, state-machine, hard-stop and
attestation contract is
`docs/design/adr-014-local-evidence-session-environment-contract.md`; source versus
representative classification, coverage, sampling, reference-only manifest, validity and
owner-only dataset approval is
`docs/design/adr-014-representative-dataset-matrix-sampling-manifest.md`. PE-04 selected or
materialized no dataset, read/copied no data, created no manifest instance and granted no
access/execution/runtime authority. PE-05 defined observability/evidence requirements but
implemented or activated no metric, log, audit, dashboard, alert, session, baseline or
evidence. This does not change the ADR-014 row's `PR-GATED` or
`RUNTIME CUTOVER NOT AUTHORIZED` status. The single next eligible preparation task is
`ADR014-PE-05A — Metrics, Audit and Alert Implementation Preparation`; it receives no
implementation or evidence-execution authority from this routing record. Representative evidence,
PR-11 and runtime cutover remain blocked/unauthorized. This routing override supersedes the
ADR-014 table row's older PE-03/v2.14 and post-PE-04 next-step wording; calculation,
authority and cutover semantics in that row remain unchanged. Current execution plan:
`docs/design/adr-014-split-pr-plan.md` v2.17.

**ADR-014 post-PE-05B routing override (2026-07-13):** PE-05A1a, PE-05A2, PE-05A3,
PE-05A4 and PE-05B are `CLOSED / CANONICAL`. PE-05A1a adds bounded component/outcome
duration metrics; PE-05A2 adds a typed PII-safe non-durable event envelope; PE-05A3 and
PE-05A4 add non-durable correlation preparation and a disabled NO-OP writer abstraction with
no runtime call-site. PE-05B technical PR #1187 (squash
`215f8b20c901c1cf88be723df84ae5dc57cc868e`) adds four bounded financial-integrity metric
families from existing shadow comparison reports without changing existing metrics, financial
results, readiness, blockers, API/DTO, persistence or authority. Representative evidence remains
`ABSENT / BLOCKING`; PR-11 and runtime cutover remain `NOT AUTHORIZED`. No canonical successor
is assigned, so further implementation requires an owner decision. This routing record supersedes
the older PE-05A next-step wording only; all calculation, evidence and cutover gates remain
unchanged. Current execution plan: `docs/design/adr-014-split-pr-plan.md` v2.18.

**ADR-014 post-PE-06A routing override (2026-07-13):** ADR014-PE-06A is
`CLOSED / CANONICAL`. Technical PR #1190 (squash
`77d8e6bdcb16199d01a920a95f78f370837dd28f`) adds a pure, typed, immutable and
default-disabled local evidence-harness preparation contract. It validates caller-supplied
canonical SHA and opaque PE-03 environment/session, PE-04 manifest and separate
access/execution authorization references under one binding; it neither discovers authority nor
starts execution. The only outcomes are `BLOCKED` and `PREPARED`, and `PREPARED` is not data
access, execution, evidence acceptance, readiness or cutover authority. Database, filesystem,
network, persistence, Nest bootstrap, financial calculation, API/DTO and telemetry behavior are
unchanged. PR #1159 remains open, non-canonical and on hold; it was not rebased, merged,
cherry-picked or used as implementation authority. Representative evidence remains
`ABSENT / BLOCKING`; PR-11 and runtime cutover remain `NOT AUTHORIZED`. No canonical successor
is assigned, so further implementation requires an owner decision. This routing record
supersedes only the prior PE-05B next-step wording; all calculation, evidence and cutover gates
remain unchanged. Current execution plan: `docs/design/adr-014-split-pr-plan.md` v2.19.

**ADR-014 post-PE-06B2 routing override (2026-07-13):** ADR014-PE-06B1 and
ADR014-PE-06B2 are `CLOSED / CANONICAL / PREPARATION-ONLY`. PE-06B1 fixes the
immutable, deterministic and PII-safe seven-family observation fact contract and split producer
ownership. PE-06B2 technical PR #1196 (head
`ef0c380d3aa94b3d4f9032de4398ff7aa60a3d08`; squash
`e3b9639c71943d7ea45be5c27da52d48daa16389`) reuses those factories through a pure,
default-disabled producer and bounded telemetry projection boundary. Six fact families have
PII-safe metric projections; `PHASE` duration mapping is explicitly blocked because no authorized
duration source exists. Session/control structured-event mapping is explicitly blocked because the
canonical PE-05A2 envelope is shadow-comparison-specific; no second event system is introduced.
There is no production call-site, metric registration/emission, structured-event emission, writer
activation, persistence, session/environment/dataset execution, external egress, financial/readiness
change or authority promotion. Representative evidence remains `ABSENT / BLOCKING`; PR-11 and
runtime cutover remain `NOT AUTHORIZED`. No canonical successor is assigned, so further technical
work requires an owner decision. This routing record supersedes only the post-PE-06A next-step
wording; all calculation, evidence and cutover gates remain unchanged. Current execution plan:
`docs/design/adr-014-split-pr-plan.md` v2.20.

**ADR-014 post-PE-06C0 routing override (2026-07-13):** ADR014-PE-06C0 is
`CLOSED / CANONICAL / OWNER DECISIONS DEFINED`. The binding decision contract is
`docs/design/adr-014-session-control-event-vocabulary-phase-timing-decisions.md`.
PE-05A2 v1 remains immutable; session/control observations use a backward-compatible
`event_version=2`, `event_profile=SESSION_CONTROL` profile in the same canonical envelope family,
so no second event system exists. PE-06B1 facts remain unchanged; the PE-06B2 mapper boundary owns
pure event projection. The future local session orchestrator owns monotonic phase timing and
supplies immutable duration context; fact factories, mapper and producer may not invent time.
All seven fact-family mappings and OD-C0-01..18 are decided. PE-06C1 may implement only pure,
default-disabled v2 mappings, session-counter mapping, phase-duration context/validation and typed
source-absent blockers; production call-sites, registry registration/emission, runtime clock,
session/control activation, persistence, external egress and evidence execution remain forbidden.
Representative evidence remains `ABSENT / BLOCKING`; CAN-CUT-02 remains open; PR-11 and runtime
cutover remain `NOT AUTHORIZED`. The single next eligible task is `ADR014-PE-06C1 —
Default-Disabled Observation Contract Completion`, requiring separate task authorization. This
record supersedes only the post-PE-06B2 next-step wording; all receivable, evidence and cutover
gates remain unchanged. Current execution plan: `docs/design/adr-014-split-pr-plan.md` v2.21.

**ADR-014 post-PE-06C1 routing override (2026-07-13):** ADR014-PE-06C1 is
`CLOSED / CANONICAL / DEFAULT-DISABLED` after technical PR #1201 (head
`ca1d8baf1a25f2e7cba1219e4d2880e4a8676eb9`; squash
`8948cadb7ce4c2061edb82bcff9afd901af98acf`). PE-05A2 v1 serialization and semantics remain
immutable; the same operational-event envelope family now contains the bounded
`event_version=2` / `event_profile=SESSION_CONTROL` preparation profile. All seven PE-06B1 fact
families have pure exhaustive event mappings. Session start/terminal states have a bounded counter
projection; terminal phase facts accept only caller-supplied finite monotonic duration. Execution-
request and control-event counters remain typed `BLOCKED_WITH_REASON` because their producers are
absent. The producer remains default `DISABLED`, with no production call-site, registry
registration/emission, runtime clock, session/control activation, persistence, external egress,
evidence execution, financial/readiness/API change or authority promotion. Representative evidence
remains `ABSENT / BLOCKING`; CAN-CUT-02 remains open; PR-11 and runtime cutover remain
`NOT AUTHORIZED`. No successor is assigned automatically; the next workstream requires an explicit
owner decision. This record supersedes only the post-PE-06C0 next-step wording; all receivable,
evidence and cutover gates remain unchanged. Current execution plan:
`docs/design/adr-014-split-pr-plan.md` v2.22.

## ADR Naming Collision Matrix (GOV-ADR-NAMING-000)

Bu bölüm, `ADR-012` numarasının DX-005 için main üzerinde kanonikleşmesinden sonra yanlış ADR referansı üretilmesini engeller. **2026-07-10 owner arbitration (final):** Aynı gün iki aday çözüm değerlendirildi — Option C (`ADR-013`'ün kapsamını CCB-001'i içerecek şekilde genişletme, kısa süre uygulandı, PR #1019) ve ayrı-numara seçeneği (`ADR-013`'ü `GOV-ADR-NAMING-000`'ın orijinal dar kapsamında bırakıp CCB-001'e kendi numarasını verme). Owner'ın nihai kararı: **CCB-001'in mimari dokümanı `ADR-014`'tür; `ADR-013` `GOV-ADR-NAMING-000`'ın orijinal kapsamında (Fee/Harç/Snapshot/Journal) kalır, DEĞİŞMEDEN.** PR #1026 sonrası ADR-013 artık draft/owner-review ADR olarak mevcuttur. Bu patch runtime davranışı, kod, migration veya CCB-001 branch merge'i yaratmaz.

| Name | Canonical meaning on main | Status | Rule |
|---|---|---|---|
| ADR-012 | Waiting & Progress Policy / DX-005 | ACTIVE | Korunur; CCB/FEE mimari kararı için kullanılmaz. |
| ADR-013 | Fee / Harç / Snapshot / Journal architecture | DRAFT / OWNER REVIEW REQUIRED | Bu hattın kanonik ADR numarasıdır; owner-review taslak dosyası `docs/adr/ADR-013-FEE-HARC-SNAPSHOT-JOURNAL.md` olarak oluşturuldu. CCB-001'in mimari dokümanı DEĞİLDİR (bkz. ADR-014) — 2026-07-10'da bir gün içinde bu iki hattın aynı numarada birleştirilmesi (Option C) denenip owner tarafından geri alındı; bu satır `GOV-ADR-NAMING-000`'ın orijinal kapsamını korur. Taslak final producer ownership, approved producer chain, implementation sequence veya runtime davranış yetkisi vermez. |
| ADR-014 | CCB-001 Canonical Legal Calculation Core | LOCKED / POST-PR-10 / PR-GATED | W0 ve PR-1A..PR-10 kapalıdır. Sıradaki uygun adım owner-gated `UNASSIGNED` cutover authorization kararıdır; bu kararın policy record'u `docs/design/adr-014-cutover-authorization-policy.md` olarak DEFINED/CANONICAL'dir fakat policy DEFINED authorization `APPROVED` değildir. PR-11 consumer switch, runtime authority promotion ve cutover yetkilendirilmemiştir. Fee/Harç policy ve official snapshot persistence için kullanılmaz — bunlar ayrı draft/owner-review ADR-013 hattıdır. |
| ADR-012-FEE | Yok | FORBIDDEN_AS_CANONICAL | Yeni belge, backlog, PR veya decision kaydında kanonik isim olarak kullanılmaz. |
| FEE-ADR-WIP | Geçici/historical alias | NON_CANONICAL_ALIAS | Yalnız geçmiş/WIP bağlamını açıklamak için kullanılabilir; kanonik hedef ADR-013'tür (Fee/Harç/Snapshot/Journal, CCB-001 değil). |
| CCB-001 | Canonical claim-balance cutover implementation authority / master stream | ACTIVE / POST-PR-10 | Closure/cutover hattı olarak korunur; kendi mimari dokümanı ADR-014 ve execution planı split-plan v2.10'dur. ALC-AUTH pilot/rollout kayıtları bu master stream altında reconciliation girdisidir; bağımsız veya rakip cutover hattı değildir ve doğrudan kanıt olmadan kapatılmaz. |
| CAN-CUT-02 | CCB-001 altında milestone | OPEN / needs-owner-decision | CCB-001'e bağlı kalır; bağımsız veya rakip stream değildir. |
| REL-001 | Dış umbrella/etiket | NON_EPIC_LABEL | Bu reconciliation REL-001'i bağımsız epic'e dönüştürmez. |
