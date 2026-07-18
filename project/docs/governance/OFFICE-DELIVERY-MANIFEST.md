# OFFICE Delivery Manifest — Authoritative Living Delivery Source

```text
Belge yolu    : project/docs/governance/OFFICE-DELIVERY-MANIFEST.md
Durum         : OWNER-APPROVED CANONICALIZATION v1.0 (2026-07-14); CANONICAL UPON APPROVED MERGE TO MAIN
Rol           : AUTHORITATIVE LIVING DELIVERY SOURCE — Finding/Decision/Slice/Wave/Milestone/
                Dependency ilişki modelinin TEK kaynağı; Phase 1 (Incremental Canonical Slice
                Delivery) boyunca YAŞAYAN, yerinde güncellenen tek belge (milestone başına yeni
                sürüm ÜRETİLMEZ).
Kapsam        : OFFICE domain, Phase 1 delivery tracking. Phase 0 (WS0.1-WS0.4) kapanmış
                foundation'ın çıktısını (12 Finding, 20 Decision, 3 Slice) girdi olarak alır.
IMPLEMENTATION AUTHORITY: NONE — bu belge hiçbir slice'ı GO-IMPLEMENT ile başlatmaz; yalnız
                readiness'i hesaplar. Owner selection + explicit GO ayrı ve zorunludur.
```

## RELATED DOCUMENTS

- Domain Law: `OFFICE-GOVERNANCE.md` · Risk dossier: `OFFICE-RISK-REGISTER.md` (STF-PRD-*) ·
  Decision dossier: `OFFICE-OWNER-DECISIONS.md` (OFF/OD-*) · Evidence: `OFFICE-MASTER-SYNTHESIS.md`
- Global register pointer'ları (bu belge tarafından mutable durum KOPYALANMAZ): `active-roadmap.md`,
  `product-backlog.md` (MPB-031), `master-triage-register.md`
- Sibling precedent (analog, farklı domain): `COLLECTION-DECOMPOSITION.md`

## 1. Veri Modeli

```text
PHASE 1 (Incremental Canonical Slice Delivery)
 └─ WAVE                (sıralama konteyneri — hangi bölüm önce yürütülür)
     └─ SLICE            readinessStatus{NOT_READY,NEXT_ELIGIBLE,READY_FOR_CONTRACT}
                          (READY_FOR_CONTRACT owner eklentisi, 2026-07-14 — bir Candidate owner
                          tarafından SELECTED edildiğinde ama Contract henüz taslak DEĞİLKEN ara
                          durumu adlandırmak için; NEXT_ELIGIBLE'ın yerini almaz, iki değer
                          arasındaki kesin sınır ileride ayrıca netleştirilebilir) ·
                          ownerSelectionStatus{NOT_SELECTED,SELECTED,NOT_A_SELECTABLE_SLICE}
                          (NOT_A_SELECTABLE_SLICE owner eklentisi, 2026-07-14 — ürün niyeti
                          netleşmeden Contract'a giremeyecek adaylar için; NOT_SELECTED'tan farkı:
                          NOT_SELECTED "seçilebilir ama seçilmedi", bu ise "seçilebilir hâle
                          gelmemiş") ·
                          implementationAuthorization{NONE,GO_IMPLEMENT_ISSUED,CONSUMED}
                          (CONSUMED owner eklentisi, 2026-07-14 — GO_IMPLEMENT_ISSUED'ın
                          implementasyon merge sonrası vardığı son durum; yetki "harcanmıştır",
                          aynı slice için tekrar implementasyon açmaz) ·
                          implementationCategory{WIRING,HARDENING,EXTENSION,NEW_SUBSYSTEM}
                          (owner eklentisi, 2026-07-14 — WAVE 1 decomposition'da CANDIDATE-A/B'nin
                          aynı sınıfta olmadığını ayırt etmek için: WIRING = mevcut mekanizmayı
                          tetikleyen küçük değişiklik, NEW_SUBSYSTEM = sıfırdan altyapı) ·
                          contractStatus{NOT_DRAFTED,DRAFT,RATIFIED} (owner eklentisi, 2026-07-14 —
                          Contract Draft/Validation/Ratification akışının kendi durumu; SLICE'ın
                          implementationAuthorization'ından AYRI — Contract RATIFIED olması
                          implementasyonu başlatmaz, yalnız GO-IMPLEMENT için hazır kılar)
         └─ MILESTONE     (derived event — Slice.status→CANONICAL olduğunda otomatik üretilir;
                            elle yazılmaz)

FINDING ──┬─(governance sorusu varsa)────────> DECISION ──┐
DOMAIN LAW/ADR ─(açık owner kapısı, ör. §6/§15)─> DECISION ─┼──> SLICE ──IMPLEMENTS──> DECISION
FINDING ──(salt mühendislik, karar gerekmez)────────────────┘        └──RESOLVES──> FINDING

DECISION   lifecycleStatus{OPEN,CLOSED_CANONICAL,DEFERRED,SUPERSEDED} ·
           resolutionMode{OWNER_SELECTED,SAFE_DEFAULT,NOT_RESOLVED} ·
           gateEffect{BLOCKING,NON_BLOCKING}

DEPENDENCY typed edge (HARD|SOFT): REQUIRES · BLOCKED_BY · IMPLEMENTS · RESOLVES · SUPERSEDES · EVIDENCED_BY
SLICE      ayrıca taskDecompositionRefs[] taşır (T0.3.x/PR/GO-IMPLEMENT kanıt zinciri)
```

**Wave seviyesi readiness (owner düzeltmesi, 2026-07-14):** Bir Wave'in altındaki bağımlılıklar
(Decision'lar) kapansa bile, somut bir Slice kaydı henüz OLUŞTURULMADIYSA Wave `NEXT_ELIGIBLE`
DEĞİLDİR — `READY_FOR_CANDIDATE_DECOMPOSITION`'dır. `NEXT_ELIGIBLE`, yalnız gerçek bir Slice kaydı
var olduğunda ve o Slice'ın kendi bağımlılıkları kapandığında kullanılır (bkz. SLICE-01/02/03,
§4). Bir Wave'in kaç slice'a böleceği candidate decomposition sırasında belirlenir, önceden
varsayılmaz.

## 2. Finding Register (12/12 — hepsi bir disposition aldı)

| ID | Sev | İlgili Decision(lar) | Decision Durumu | DISPOSITION | Not |
|---|---|---|---|---|---|
| STF-PRD-BOLA-001 | P1 | OFF/OD-08, OFF/OD-09 | OD-08 CLOSED (2026-07-16) · OD-09 CLOSED | LINKED TO SLICE | **CANDIDATE-I** ile mapping yapıldı (2026-07-16) — ilk dilimi **CANDIDATE-I1** **CANONICAL/CONSUMED** (2026-07-16/17, PR #1325, squash `05e73579f295615db8a0f3f3ff5816caa958acd5`, additive-only şema temeli, sıfır enforcement değişikliği). **Finding KAPANMADI** — tam object-scope enforcement ayrı, sonraki bir Contract. **RECORDED SECURITY EXCEPTION:** CLIENT-SEC-H1 S1–S4 emergency containment ayrıca ve dar biçimde yetkilendirildi, PR #1291 ile tamamlandı (squash SHA `328dcdf6689575da8a4849f4b632a737079c22ad`, CI 4/4 SUCCESS; bkz. `decision-log.md` CLIENT-SEC-H1 kaydı, `OFFICE-RISK-REGISTER.md` STF-PRD-BOLA-001 remediation bloğu). **EFFECT:** Bu istisna OFF/OD-08'i çözmez; CANDIDATE-I1 de bu bulguyu kapatmaz, yalnız gelecekteki enforcement'ın şema temelini kurar. **AYRI CROSS-REFERENCE (farklı root-cause, bu finding'in KENDİ disposition'ını DEĞİŞTİRMEZ):** CLIENT-SEC-H2 (H2A/H2B/H2C/H2D) — bir audit/entegrasyon log yüzeyi ailesinde şema-seviyesi tenant ownership boşluğu (RC-1, BOLA-001'in kod-seviyesi object-scope boşluğundan farklı bir kök-neden; etkilenen model/tablo adları kasıtlı olarak public repository dışında tutulur). H2A fail-closed containment CANONICAL (PR #1304, squash `676eead29cc2249051398ba20d504c82ba937402`); H2B code-level tenant enforcement CANONICAL (PR #1311, squash `a46d320072c6e80f983832be02aba305fc8b5940`); H2C structural analysis ANALYSIS COMPLETE/PATH RATIFIED (2026-07-16, nullable-first additive schema; STRUCTURAL REMEDIATION: PARTIALLY FEASIBLE). **H2C-P01 (nullable schema) / P02 (new-write population) / P02-R1 (write-ownership completion) CANONICAL** (PR #1329 `d209a967`, #1334 `12155041`, #1339 `cfc59b74`). **H2C-P03 (backfill evidence) ANALYSIS COMPLETE (2026-07-17):** backfill mantığı disposable synthetic üzerinde teknik doğrulandı ama temsili production verisi YOK → PRODUCTION BACKFILL READINESS: INSUFFICIENT EVIDENCE. **H2C-RETIRE-DOCS — PERMANENT HISTORY ENDPOINT RETIREMENT OWNER RATIFIED/CANONICAL (2026-07-17, Route B):** kullanıcıya-dönük history/stats read yüzeyi kalıcı olarak H2A fail-closed'da kalır — **H2A fail-closed artık PERMANENT PRODUCT POLICY (≠ temporary containment)**; production backfill DEFERRED INDEFINITELY, endpoint restoration YENİ owner ratification gerektirir. P01/P02/P02-R1/P03 CANONICAL korunur (nullable kolonlar + write-ownership internal audit/operational için geçerli). Ayrı risk kartları: `OFFICE-RISK-REGISTER.md` `CLIENT-SEC-H2-STRUCT-01`/`CLIENT-SEC-H2-STRUCT-02` (STF-PRD-* ailesine dahil değil). **CLIENT-P0-T03 (Security & KVKK Deep Analysis) — ANALYSIS COMPLETE / OWNER REVIEW REQUIRED (2026-07-17):** T03'ün altı-alan post-H2 sentezi tamamlandı, LIVE CRITICAL BLOCKER NONE; **SECURITY CONTAINMENT PHASE CLOSED** (critical security/containment/structural ownership/tenant isolation hepsi CLOSED); **PROGRAM STAGE: POLICY → GOVERNANCE → BUSINESS ARCHITECTURE**; kalan bulgular normal governance/policy input (X-01 aggregate visibility = OWNER POLICY DECISION). **CLIENT-P0-T04 (Financial Boundary Map): NEXT ELIGIBLE / NOT STARTED — ayrı owner GO gerekir** (T04 started/authorized/in-progress DEĞİL). Detay: `decision-log.md` CLIENT-SEC-H2 + OWNER RATIFICATION + CLIENT-SEC-H2C-P03 + CLIENT-SEC-H2C-RETIRE-DOCS + CLIENT-P0-T03 kayıtları. **IMPLEMENTATION AUTHORITY: NONE for code/response-contract/production backfill/NOT NULL-FK/endpoint restoration.** **CLIENT-P0-T04-C1 (müvekkil finansal bakiye yüzeyi tenant fail-closed containment) — DELIVERED / CANONICAL (2026-07-18):** CLIENT-P0-T04 Financial Boundary Map'te doğrulanan müvekkil finansal bakiye okuma/yazma yüzeyi tenant-sınırı maruziyeti (**F-STOP-1**) **service-level fail-closed** kapatıldı — PR #1367, squash `412b9a2c`, CI 4/4. SCOPE: tenant fail-closed containment + zero-side-effect regression coverage + zorunlu CI test-wiring. PRODUCTION FILE EFFECT: bounded service-level tenant enforcement. TEST-ONLY SHARED FILE: CI workflow test-wiring (production kapsam genişlemesi DEĞİL). SCHEMA/MIGRATION/BACKFILL: NONE. PRODUCTION EXPLOIT: NOT ASSERTED. FINANCIAL ROLE POLICY: UNRESOLVED / OWNER DECISION REQUIRED. **CLIENT-P0-T04: STARTED → PAUSED / POST-CONTAINMENT RECONCILIATION REQUIRED** (yukarıdaki "CLIENT-P0-T04 ... NEXT ELIGIBLE / NOT STARTED" ifadesi bu güncellemeyle artık CURRENT DEĞİLDİR). Detay: `decision-log.md` CLIENT-P0-T04-C1-GOV kaydı. **CLIENT-P0-T04 (Financial Boundary Map) — DELIVERED / ANALYSIS COMPLETE / OWNER ACCEPTED (2026-07-18):** DELIVERABLE = AS-IS Financial Boundary Map (owner-local 16-çıktı gövdesi). SECURITY CONTAINMENT DEPENDENCY: CLOSED / CANONICAL (F-STOP-1 via C1/C1-GOV). LIVE CRITICAL BLOCKER: NONE. OPEN POLICY INPUTS (financial role policy · CLIENT financial Domain Law + settlement contract · calc cutover · fee/harç ownership · stored balance/ledger reconciliation · portal legacy projection · precision/currency · reversal/manual recovery): **T04 COMPLETION'ı BLOKE ETMEZ** (owner-review/governance kararları). Yeni CLIENT Domain Law oluşturulmadı (G1 açık input). **CLIENT-P0-T05: NEXT ELIGIBLE / NOT STARTED** (started/authorized/in-progress DEĞİL; ayrı owner GO). Bu güncelleme yukarıdaki C1 "PAUSED" statüsünü CURRENT açısından supersede eder (T04 artık ANALYSIS COMPLETE / OWNER ACCEPTED). Detay: `decision-log.md` CLIENT-P0-T04-GOV kaydı. **CLIENT-P0-T05 (Governance Baseline Decision) — OWNER DECISION RATIFIED: OPTION C / BOUNDED CLIENT GOVERNANCE CHARTER — DELIVERED / CANONICAL (2026-07-18):** GOVERNANCE BASELINE = OPTION C (yeni bounded `CLIENT-GOVERNANCE-CHARTER.md`; client ownership + CL-INV-001..008 + cross-domain contract map konsolidasyonu). FULL CLIENT DOMAIN LAW: NOT REQUIRED FOR PHASE 0 (upgrade owner-gated). OPTION B: REJECTED. Charter mevcut Domain Law/owner-kararı otoritesini korur/override etmez; hiçbir ürün/finans/portal/KVKK politikası seçilmedi (**OPEN POLICY DECISIONS REMAIN OWNER-GATED**). **CLIENT-P0-T06 (Phase 0 Synthesis): NEXT ELIGIBLE / NOT STARTED** (ayrı owner GO-ANALYZE). NOT: T01–T04 formal register-close olarak toplu İLAN EDİLMEZ (T04 CLOSED/CANONICAL; T03 ANALYSIS COMPLETE/OWNER REVIEW REQUIRED; T01/T02 analiz gövdeleri COMPLETE, formal register-close değil). Detay: `decision-log.md` CLIENT-P0-T05 kaydı. **CLIENT PHASE 0 — DELIVERED / CLOSED / CANONICAL (2026-07-18):** DELIVERABLES = current-state + write/read analysis evidence · security/KVKK baseline · Financial Boundary Map · bounded Client Governance Charter · Phase 0 synthesis (T06). CRITICAL CONTAINMENT: DELIVERED / CANONICAL (H1/H2 + CLIENT-P0-T04-C1). OPEN POLICY INPUTS: DEFERRED / OWNER-GATED / NON-BLOCKING (charter §8). STATUS PRECISION (geriye normalize edilmedi): T03 OWNER REVIEW REQUIRED · T01/T02 standalone closure record yok · T04/T05 CLOSED/CANONICAL · T06 SYNTHESIS COMPLETE/OWNER ACCEPTED. **CLIENT PHASE 1: ENTRY DECISION ELIGIBLE / NOT STARTED / NOT AUTHORIZED** (ayrı owner kararı; roadmap/tasklist/blueprint/policy ÜRETİLMEDİ). Detay: `decision-log.md` CLIENT-P0-CLOSE kaydı. **CLIENT-P1-ENTRY-GOV — CLIENT PHASE 1 ENTRY AUTHORIZED / OPTION D — HYBRID STAGED ENTRY (2026-07-18):** ENTRY MODEL = OPTION D (sequencing: cross-domain contract canonicalization → workstream-specific owner policy decisions → bounded blueprint → selected remediation; formal roadmap DEĞİL, her aşama ayrı owner GO). FIRST WORKSTREAM = CLIENT-P1-XDC-01 (Cross-Domain Contract Analysis) — **AUTHORIZED FOR ANALYSIS / NOT STARTED** (GO-ANALYZE ELIGIBLE). BLUEPRINT: NOT STARTED. REMEDIATION: NOT AUTHORIZED. IMPLEMENTATION: NOT AUTHORIZED (**ENTRY AUTHORIZED ≠ kod/blueprint delivery**). OPEN POLICY DECISIONS: WORKSTREAM-SCOPED / OWNER-GATED / PRESERVED. OTHER-PROGRAM BOUNDARY korundu (ADR-014 calc cutover · ADR-013 fee/harç · RECEIVABLE/COLLECTION/OFFICE redesign Client Phase 1 critical path'ine taşınMADI). Detay: `decision-log.md` CLIENT-P1-ENTRY-GOV kaydı. **CLIENT-P1-XDC-01 — CROSS-DOMAIN CONTRACT CANONICALIZATION — DELIVERED / CANONICAL (2026-07-18):** DELIVERABLE = five named bounded cross-domain contracts (XDC-A–E). MODEL = HYBRID (Model D). AUTHORITY EFFECT = **CONSOLIDATION ONLY** (yeni command/write/approval/SOT authority YOK; AUTHORITY CONFLICT NONE). CLIENT-side home = CLIENT-GOVERNANCE-CHARTER §6; reciprocal clauses = OFFICE §21 / RECEIVABLE §6 / COLLECTION §4.6 / DEBTOR §6; XDC-E = no new Domain Law (shared-kernel). NEW POLICY: NONE (open policy PRESERVED/owner-gated). BLUEPRINT: NOT STARTED. IMPLEMENTATION: NOT AUTHORIZED. NEXT = ayrı owner GO — CLIENT-P1-POL-01. Detay: `decision-log.md` CLIENT-P1-XDC-01 kaydı. **CLIENT-P1-POL-01 — MINIMUM BLUEPRINT-PREREQUISITE POLICY SET — DELIVERED / OWNER MODEL DECISION RATIFIED (2026-07-18):** SELECTED MODEL = MODEL B (minimum two-decision set). DELIVERABLE = minimum pre-blueprint policy set + decision order. POLICY OUTCOME: NONE (POL-A/POL-B substantive kararları YAPILMADI). DECISION SEQUENCE = POL-B → POL-A. FIRST DECISION UNIT = CLIENT-P1-POL-B-01. SECOND = POL-A (yalnız POL-B disposition sonrası). OPEN-SLOT BLUEPRINT: NOT SELECTED. BLUEPRINT: NOT STARTED (entry condition = POL-B AND POL-A canonical). IMPLEMENTATION: NOT AUTHORIZED. Detay: `decision-log.md` CLIENT-P1-POL-01-GOV kaydı. **CLIENT-P1-POL-B — DUAL-TRACK APPROVAL PROVENANCE — DELIVERED / OWNER DECISION RATIFIED (2026-07-18):** MODEL = OPTION C (dual-track provenance). POLICY EFFECT = iki ayrı provenance fact sınıfı kuruldu (authenticated external-client decision · staff-recorded statement; DISTINCT/NON-EQUIVALENT/NON-CONVERTIBLE, CL-INV-007). INTERNAL OFFICE APPROVAL + TARGET-DOMAIN EXECUTION = ayrı fact'ler (korundu). PER-SUBJECT POLICY: NOT DECIDED. PORTAL: NOT AUTHORIZED (POL-C open). IMPLEMENTATION: NOT AUTHORIZED (external approval capability teslim EDİLMEDİ). NEXT PREREQUISITE = POL-A (CLIENT-P1-POL-A-01). Detay: `decision-log.md` CLIENT-P1-POL-B-GOV kaydı. **CLIENT-P1-POL-A — FINANCIAL PREDICATE MATRIX — POLICY DELIVERED / OWNER DECISION RATIFIED (2026-07-18):** MODEL = SUBJECT-SPECIFIC EXISTING PREDICATE MATRIX (Model B). POLICY EFFECT = mevcut kanonik predicate'ler bounded financial subject'lere atandı (disposition/payout/offset/manual-recovery/client-balance/expense/client-statement/fee); NEW ROLE/CAPABILITY: NONE. MANAGER asymmetry = subject-specific/intentional. POL-B consumption = consent/provenance fact financial authority VERMEZ. NON-SELECTIONS: canApproveFinance/CasePolicyEngine/PermissionGrant. **MINIMUM POLICY SET: COMPLETE** (POL-B + POL-A). AS-IS ENFORCEMENT: PARTIAL / remediation NOT AUTHORIZED (policy delivery ≠ code delivery). BLUEPRINT: NOT STARTED (entry reconciliation NEXT). IMPLEMENTATION: NOT AUTHORIZED. NEXT = ayrı owner GO-VERIFY — CLIENT-P1-BP-ENTRY-01. Detay: `decision-log.md` CLIENT-P1-POL-A-GOV kaydı. |
| STF-PRD-SES-001 | P1 | OFF/OD-14, OFF/OD-15 | ikisi de CLOSED_CANONICAL | LINKED TO DECISION | WAVE 1 kapsamına giriyor (SES-002 ile birlikte triyaj edilecek) |
| STF-PRD-RBAC-001 | P2 | OFF/OD-05, OFF/OD-09 | ikisi de CLOSED_CANONICAL | LINKED TO DECISION | WAVE 2 kapsamına giriyor — CANDIDATE-E1 (additive-only şema temeli) CANONICAL (2026-07-16, PR #1312); **finding OPEN/NOT CLOSED kalır** (şema temeli sıfır consumer/enforcement değişikliğiyle geldi, riskin davranışsal kısmı değişmedi; bkz. OFFICE-RISK-REGISTER.md) |
| STF-PRD-SCP-001 | P2 | OFF/OD-08 | CLOSED (2026-07-16) | LINKED TO SLICE | BOLA-001 ile aynı gate; **CANDIDATE-I** ile mapping yapıldı (2026-07-16) — ilk dilimi **CANDIDATE-I1** **CANONICAL/CONSUMED** (2026-07-16/17, PR #1325, squash `05e73579f295615db8a0f3f3ff5816caa958acd5`, additive-only şema temeli). **Finding KAPANMADI** — tam object-scope enforcement (SCP-001'in kapsadığı geniş case/client CRUD yüzeyi) ayrı, sonraki bir Contract |
| STF-PRD-CFG-001 | P2 | — | yok | UNMAPPED — OWNER REVIEW REQUIRED | Hiçbir OD'ye bağlı değil; owner karar-gerekmez mi onaylamalı |
| STF-PRD-LIFE-001 | P2 | OFF/OD-16, OFF/OD-17 | OD-16 OPEN(NON_BLOCKING) · OD-17 CLOSED | LINKED TO DECISION | OD-16 non-blocking — owner bunun gerçekten gate olup olmadığını teyit etmeli |
| STF-PRD-PRIV-001 | P2 | OFF/OD-18 | CLOSED_CANONICAL | LINKED TO SLICE | = SLICE-03 → CANDIDATE-F1/F2/G/H decomp (WAVE 3 CLOSED WITH RESIDUALS, 2026-07-16). F1+H1 CANONICAL (list+case-embedded maskeli, MILESTONE 04/05); STF-PRD-PRIV-001 OPEN / CARRIED FORWARD — WAVE 3 closure bunu KAPATMAZ (kalan detay yüzeyi = CANDIDATE-G, BLOCKED) |
| STF-PRD-OPS-001 | P2 | OFF/OD-19 | OPEN(BLOCKING) | LINKED TO DECISION | — |
| STF-PRD-PERF-001 | P3 | — | yok | UNMAPPED — OWNER REVIEW REQUIRED | Karar gerekmez (salt mühendislik) ama henüz slice'a triyaj edilmedi |
| STF-PRD-BOLA-002 | P3 | OFF/OD-10 | CLOSED (2026-07-16) | LINKED TO SLICE | OD-10 kapandı (Access-Scope Owner Decision Package). **CANDIDATE-J** (Task-atama) + **CANDIDATE-K** (Case-atama) ile mapping yapıldı (2026-07-17). **J-tarafı:** CANDIDATE-J DECOMPOSED → ilk dilimi **CANDIDATE-J1** (Task Assignee Baseline Eligibility Gate) **CANONICAL/CONSUMED** (2026-07-17, impl PR #1338 squash `7210ea7c`, closure PR #1344 squash `dfbe8258`, PHASE 1 MILESTONE 08). **K-tarafı:** CANDIDATE-K DECOMPOSED (K1/K2/K3) → ilk dilimi **CANDIDATE-K1** (Case Team-Membership Baseline Eligibility Gate) **CANONICAL/CONSUMED** (2026-07-17, impl PR #1356 squash `423d72ea`, PHASE 1 MILESTONE 09). **Finding KAPANMADI (OPEN / PARTIALLY MITIGATED)** — J1 yalnız Task-atama baseline'ını IMPLEMENTED, K1 yalnız Case ekip-ekleme baseline'ını IMPLEMENTED; K2 (toplu atama, **ASSIGN-4d** ürün-kararına bağlı) + K3 (legal-sorumlu terfi re-check) + kalan J rol/kapasite policy AYRI, owner-gated future scope. Detay: bkz. §4f |
| STF-PRD-DATA-001 | P3 | OFF/OD-01, OFF/OD-03 | OD-01 CLOSED · OD-03 OPEN(BLOCKING) | LINKED TO DECISION | OD-03 kapanmadan DB-constraint işi başlamaz |
| STF-PRD-SES-002 | P3 | OFF/OD-15 | CLOSED_CANONICAL | LINKED TO DECISION | WAVE 1 kapsamına giriyor (SES-001 ile birlikte triyaj edilecek) |

### 2b. Yeni Bulgular (WAVE 1 decomposition sırasında keşfedildi — Risk Register kaydı BEKLİYOR)

Bu bölümdeki kayıtlar `OFFICE-RISK-REGISTER.md`'nin resmi `STF-PRD-*` register'ında HENÜZ YOKTUR —
kanonik risk otoritesi hâlâ o dosyadır, bu tablo yalnız keşif anını ve disposition'ı kaydeder.
Bu satır tek başına global triage/backlog yetkisi üretmez.

| Kayıt | Keşif Bağlamı | relatedInvariant | DISPOSITION |
|---|---|---|---|
| Staff offboarding audit trail eksikliği | WAVE 1 Candidate Decomposition (`staff.service.ts:remove()`'un hiç audit log yazmadığı, `lawyer.service.ts:delete()`'in aksine, kod okunarak doğrulandı) | OFF-INV-08 | NEW FINDING — FUTURE WAVE |
| `staff.controller.ts:remove()` HTTP exception swallowing (her exception `{error: message}` ile HTTP 200'e düşüyor; `update()` metodundaki `instanceof HttpException` re-throw guard'ı bu metotta YOK — mevcut asimetri) | CANDIDATE-A Contract Validation (kod okunarak doğrulandı; `lawyer.controller.ts`'in `delete()`'i aynı sorunu TAŞIMIYOR, try/catch yok, exception'lar doğru status'la geçiyor) | — (spesifik OFF-INV atanmadı — genel mühendislik/hata-yönetimi bulgusu) | NEW FINDING — FUTURE WAVE / NOT AUTHORIZED |

## 3. Decision Register (20/20 — 3-eksen model)

| ID | lifecycleStatus | resolutionMode | gateEffect | dependsOn (REQUIRES) |
|---|---|---|---|---|
| OFF/OD-01 | CLOSED_CANONICAL | OWNER_SELECTED | BLOCKING | OD-02, OD-11 |
| OFF/OD-02 | OPEN | NOT_RESOLVED | NON_BLOCKING | OD-01, OD-07 |
| OFF/OD-03 | OPEN | NOT_RESOLVED | BLOCKING | OD-04 |
| OFF/OD-04 | DEFERRED | NOT_RESOLVED | NON_BLOCKING | OD-03 |
| OFF/OD-05 | CLOSED_CANONICAL | OWNER_SELECTED | BLOCKING | OD-06, OD-09, ADR-009 |
| OFF/OD-06 | OPEN | NOT_RESOLVED | NON_BLOCKING | OD-05, DBIND§5 |
| OFF/OD-07 | OPEN | NOT_RESOLVED | BLOCKING | OD-02 |
| OFF/OD-08 | CLOSED_CANONICAL | OWNER_SELECTED | BLOCKING | OD-09, OD-10 |
| OFF/OD-09 | CLOSED_CANONICAL | OWNER_SELECTED | BLOCKING | OD-05, OD-08 |
| OFF/OD-10 | CLOSED_CANONICAL | OWNER_SELECTED | BLOCKING | OD-08 |
| OFF/OD-11 | CLOSED_CANONICAL | OWNER_SELECTED | NON_BLOCKING | OD-01, ADR-009 — IMPLEMENTS→SLICE-02 |
| OFF/OD-12 | OPEN | NOT_RESOLVED | BLOCKING | OD-11, ADR-009 |
| OFF/OD-13 | OPEN | NOT_RESOLVED | BLOCKING | OD-12 |
| OFF/OD-14 | CLOSED_CANONICAL | OWNER_SELECTED | BLOCKING | OD-15 |
| OFF/OD-15 | CLOSED_CANONICAL | OWNER_SELECTED | BLOCKING | OD-14, Platform |
| OFF/OD-16 | OPEN | NOT_RESOLVED | NON_BLOCKING | §18 orchestration |
| OFF/OD-17 | CLOSED_CANONICAL | OWNER_SELECTED | BLOCKING | OD-03, OD-16 |
| OFF/OD-18 | CLOSED_CANONICAL | OWNER_SELECTED | BLOCKING | Privacy, HR — IMPLEMENTS→SLICE-03 (deferred) |
| OFF/OD-19 | OPEN | NOT_RESOLVED | BLOCKING | Product, HR |
| OFF/OD-21 | CLOSED_CANONICAL | OWNER_SELECTED | NON_BLOCKING | OD-05 |

*(9 OPEN: OD-02,03,04,06,07,12,13,16,19 · 11 CLOSED_CANONICAL: OD-01,05,08,09,10,11,14,15,17,18,21
— `OFFICE-OWNER-DECISIONS.md` ile birebir tutarlı, 2026-07-16 itibarıyla — OD-08/OD-10 Access-Scope
Owner Decision Package'da kapandı.)*

## 4. Slice Register

| ID | status | readinessStatus | relatedDecision | relatedFinding | ownerSelectionStatus | implementationAuthorization | implementationCategory | contractStatus | taskDecompositionRefs | Not |
|---|---|---|---|---|---|---|---|---|---|---|
| SLICE-01 | DEFERRED | NOT_READY | OFF/OD-21 (CLOSED) | — | — | — | — | — | T0.3.1, T0.3.3, T0.3.4 | Karar kapalı ama implementation surface yok (User rol/deaktivasyon hiç inşa edilmemiş) |
| SLICE-02 | CANONICAL | — | OFF/OD-11 (CLOSED) | — | SELECTED | GO_IMPLEMENT_ISSUED (tamamlandı) | — | RATIFIED (tamamlandı) | T0.3.1 REV2, T0.3.3 REV2/3, T0.3.4 REV3, GO-IMPLEMENT | PR #1226, mergeSha `a3eee8b8` |
| SLICE-03 | DEFERRED | NOT_READY | OFF/OD-18 (CLOSED) | STF-PRD-PRIV-001 | — | — | — | — | T0.3.1 REV2 | Karar kapalı; WAVE 3 Candidate Decomposition ile CANDIDATE-F1/F2/G/H'e ayrıldı (2026-07-15). bkz. §4d |
| CANDIDATE-A | **CANONICAL** | — | OFF/OD-14 (CLOSED) | STF-PRD-SES-001 | SELECTED (2026-07-14) | **CONSUMED** (2026-07-14) | WIRING | RATIFIED (2026-07-14) | GO-ANALYZE + Contract Draft/Validation + GO-IMPLEMENT | Offboarding → User Deactivation Wiring — bkz. §4b. PR #1239, branch commit `55dc2374`, squash SHA `b0ce36db`, CI 4/4 PASS |
| CANDIDATE-B | **DEFERRED** (2026-07-14) | NOT_READY | OFF/OD-15 (CLOSED) | STF-PRD-SES-002 | NOT_SELECTED | NONE | **NEW_SUBSYSTEM** | NOT_DRAFTED | GO-ANALYZE (WAVE 1 decomposition) | JWT/Session Revocation Mechanism (tokenVersion) — bkz. §4b. DEFERRED gerekçesi: CANDIDATE-A ile WAVE 1'in acil offboarding riski kapatıldı; bu, geniş auth/session altyapısı gerektiren ayrı bir iş |
| CANDIDATE-C | **CANONICAL** | — | OFF/OD-05, OFF/OD-09 (ikisi de CLOSED) | STF-PRD-RBAC-001 | **SELECTED** (2026-07-14) | **CONSUMED** (2026-07-15) | **HARDENING** | **RATIFIED_WITH_RECORDED_LIMITATIONS** (2026-07-14) | GO-ANALYZE (WAVE 2 decomposition) + Owner Re-scope + Contract Draft/Validation/Ratification + GO-IMPLEMENT | Canonical Actor Capacity Read Consolidation — bkz. §4c. PR #1255, branch commit `33cc6710`, squash SHA `038dbbb9`, CI 4/4 PASS |
| CANDIDATE-D | **PRODUCT_DECISION_REQUIRED** | NOT_READY | — | STF-PRD-RBAC-001 (dolaylı) | **NOT_A_SELECTABLE_SLICE** (2026-07-14) | NONE | — | — | GO-ANALYZE (WAVE 2 decomposition) | Ürün niyeti netleşmeden Contract açılamaz. Detay: private evidence (bkz. §4c) |
| CANDIDATE-E | **DECOMPOSED** (2026-07-16) | NOT_READY | OFF/OD-05, OFF/OD-09, OFF/OD-08 (hepsi CLOSED) | STF-PRD-RBAC-001 | NOT_SELECTED | NONE | **NEW_SUBSYSTEM** | — | GO-ANALYZE (WAVE 2 decomposition) + CANDIDATE-E first-slice re-scope (2026-07-16) | Tam consumer-migration kapsamı (yaklaşık 20 sert yetkilendirme noktası + StaffMember izin bayrakları + auth çekirdeği) tek Contract için çok büyük/yüksek riskli bulundu (CANDIDATE-C'nin kendi re-scope emsaliyle aynı desen) → **CANDIDATE-E1** (additive-only şema temeli) SEÇİLDİ; kalan tam kapsam AYRI, HENÜZ candidate ID'si olmayan, owner-gated future scope olarak kalır. Bu satırın kendisi hiç seçilmedi. Detay: bkz. §4c |
| CANDIDATE-E1 | **CANONICAL** (2026-07-16) | — | OFF/OD-05, OFF/OD-09, OFF/OD-08 (hepsi CLOSED) | STF-PRD-RBAC-001 | **SELECTED** (2026-07-16) | **CONSUMED** (2026-07-16) | **NEW_SUBSYSTEM** | **RATIFIED** (2026-07-16) | GO-ANALYZE (CANDIDATE-E first-slice re-scope) + OWNER SELECTION + GO-CANONICALIZE (Contract Draft → Canonical) + OWNER RATIFICATION + GO-IMPLEMENT + GO-CANONICALIZE (Implementation Closure) | PermissionGrant/SystemRole Şema Temeli — additive-only, sıfır consumer-yeniden-kablolama, sıfır enforcement/runtime davranış değişikliği; OD-05/08/09'un ratifiye hedef modelini yapısal olarak temsil eder. Tam consumer-migration kapsamı bu candidate'ın DIŞINDA, ayrı/gelecek bir iş. PR #1308 (Contract Draft canonical), PR #1312 (implementasyon, squash SHA `fa6851c0`), CI 4/4 PASS. STF-PRD-RBAC-001 finding **OPEN/NOT CLOSED kalır** (bkz. OFFICE-RISK-REGISTER.md). Detay: bkz. §4c |
| CANDIDATE-F1 | **CANONICAL** | — | OFF/OD-18 (CLOSED) | STF-PRD-PRIV-001 | **SELECTED** (2026-07-15) | **CONSUMED** (2026-07-15) | **HARDENING** | **RATIFIED_WITH_RECORDED_LIMITATIONS** (2026-07-15) | GO-ANALYZE (WAVE 3 decomposition) + Contract Draft/Validation/Ratification + GO-IMPLEMENT | Personnel List Masked Default — mevcut masking altyapısı REUSE; OFF/OD-18 yeterli. bkz. §4d. PR #1270, branch commit `a08932fb`, squash SHA `a170da3e`, CI 4/4 PASS |
| CANDIDATE-F2 | **DORMANT** | NOT_READY | OFF/OD-18 (CLOSED) | STF-PRD-PRIV-001 | NOT_SELECTED | NONE | — | — | GO-ANALYZE (WAVE 3 decomposition) | Personnel Export Masking — IMPLEMENTATION SURFACE NOT FOUND (owner disposition 2026-07-15). bkz. §4d |
| CANDIDATE-G | **BLOCKED** | NOT_READY | OFF/OD-18 (CLOSED) | STF-PRD-PRIV-001 | NOT_SELECTED | NONE | **NEW_SUBSYSTEM** | NOT_DRAFTED | GO-ANALYZE (WAVE 3 decomposition) | Detail Masking + Field-Level Unmask Permission — blocker: FIELD-LEVEL UNMASK GOVERNANCE / MECHANISM UNRESOLVED. bkz. §4d |
| CANDIDATE-H | **VERIFICATION COMPLETE** (2026-07-15) | NOT_READY | OFF/OD-18 (CLOSED) | STF-PRD-PRIV-001 | NOT_SELECTED | NONE | HARDENING | — | GO-ANALYZE (WAVE 3 decomposition) + H-READMODEL consumer validation | Audit/Read-Model Minimization Verification — H-AUDIT: EVIDENCE COMPLETE / NO IMPLEMENTATION; H-READMODEL: EDIT-SAFE MASKING PATH → CANDIDATE-H1. bkz. §4d |
| CANDIDATE-H1 | **CANONICAL** | — | OFF/OD-18 (CLOSED) | STF-PRD-PRIV-001 | **SELECTED** (2026-07-15) | **CONSUMED** (2026-07-15) | **HARDENING** | **RATIFIED_WITH_RECORDED_LIMITATIONS** (2026-07-15) | GO-ANALYZE (H-READMODEL consumer validation) + Contract Draft/Validation/Ratification + GO-IMPLEMENT | Case-Embedded Personnel Sensitive Field Edit-Safe Masking — read-model varsayılan maskeli + edit-safe kontrat; CANDIDATE-G AÇILMAZ. bkz. §4d. PR #1283, branch commit `8f7dd1c8`, squash SHA `29eb6384`, CI 4/4 PASS |
| CANDIDATE-I | **DECOMPOSED** (2026-07-16) | NOT_READY | OFF/OD-08 (CLOSED) | STF-PRD-BOLA-001, STF-PRD-SCP-001 | NOT_SELECTED | NONE | **NEW_SUBSYSTEM** | — | GO-ANALYZE (WAVE 4+ decomposition) + CANDIDATE-I first-slice re-scope (2026-07-16) | Object-Scope Evaluation Foundation — tam kapsam (case/client'ın tüm nesne-erişim yüzeyine gerçek bir kapsam-değerlendirme adımı eklemek) tek Contract için çok büyük bulundu (CANDIDATE-C/E'nin kendi re-scope emsaliyle aynı desen) → **CANDIDATE-I1** (additive-only hiyerarşi şema temeli) SEÇİLDİ; kalan tam enforcement kapsamı AYRI, HENÜZ candidate ID'si olmayan, owner-gated future scope olarak kalır. Bu satırın kendisi hiç seçilmedi. Detay: bkz. §4e |
| CANDIDATE-I1 | **CANONICAL** (2026-07-16/17) | — | OFF/OD-08 (CLOSED) | STF-PRD-BOLA-001, STF-PRD-SCP-001 | **SELECTED** (2026-07-16) | **CONSUMED** (2026-07-16/17) | **NEW_SUBSYSTEM** | **RATIFIED** (2026-07-16) | GO-ANALYZE (CANDIDATE-I first-slice re-scope) + OWNER SELECTION + GO-ANALYZE (Contract Draft) + OWNER RATIFICATION + GO-CANONICALIZE + GO-IMPLEMENT + GO-CANONICALIZE (Implementation Closure) | Team/Manager-Hiyerarşi additive-only şema temeli (`ReportingLine`) — sıfır consumer-bağlama, sıfır enforcement/runtime davranış değişikliği; OD-08'in hedef modelini (manager-tipi erişimde varsayılan direct-report/team scope) yapısal olarak temsil eder. Tam object-scope enforcement (CANDIDATE-J/K ve BOLA-002 dahil değil, ayrı) bu candidate'ın DIŞINDA. PR #1325 (implementasyon, squash SHA `05e73579`), CI 4/4 PASS. STF-PRD-BOLA-001/SCP-001 finding **OPEN/NOT CLOSED kalır** (bkz. OFFICE-RISK-REGISTER.md). Detay: bkz. §4e |
| CANDIDATE-J | **DECOMPOSED** (2026-07-17) | NOT_READY | OFF/OD-10 (CLOSED) | STF-PRD-BOLA-002 | NOT_SELECTED | NONE | **HARDENING** | — | GO-ANALYZE (CANDIDATE-J/K next-slice selection) + CANDIDATE-J first-slice re-scope (2026-07-17) | Task Assignment Eligibility Gate — tam kapsam (Task-atama uygunluğu + rol/kapasite policy) tek Contract için gereğinden geniş bulundu; ilk davranış-değiştiren enforcement dilimi olarak baseline'a daraltıldı (CANDIDATE-C/E/I'nin re-scope emsaliyle aynı desen) → **CANDIDATE-J1** (baseline tenant+aktiflik kapısı) SEÇİLDİ; kalan rol/kapasite policy kapsamı AYRI, HENÜZ candidate ID'si olmayan, owner-gated future scope olarak kalır. Bu satırın kendisi hiç seçilmedi. Detay: bkz. §4f |
| CANDIDATE-J1 | **CANONICAL** (2026-07-17) | — | OFF/OD-10 (CLOSED) | STF-PRD-BOLA-002 | **SELECTED** (2026-07-17) | **CONSUMED** (2026-07-17) | **HARDENING** | **RATIFIED** (2026-07-17) | GO-ANALYZE (CANDIDATE-J first-slice re-scope) + OWNER SELECTION + CONTRACT RATIFICATION + GO-CANONICALIZE + GO-IMPLEMENT + GO-CANONICALIZE (Implementation Closure) | Task Assignee Baseline Eligibility Gate — görev oluşturma/güncelleme sırasında dolu atama alanı için aynı-tenant + aktiflik doğrulaması; yalnız ileriye-dönük (write-time) enforcement; null atama davranışı korunur; mevcut kayıtlar retroaktif taranmaz/reddedilmez; **schema/migration YOK**. Mevcut çalışan tekil-sorumlu uygunluk kapısının kalıbını (User modeli için) izler. OD-10 Option B'nin (assignment≠access, explicit policy) hedef modelini davranışsal olarak temsil eder. **İlk davranış-DEĞİŞTİREN WAVE 4+ enforcement dilimi** (E1/I1'in additive-only deseninden farklı). Rol/kapasite policy · UI filtreleme · CANDIDATE-K (Case ekip-atama) bu dilimin DIŞINDA. PR #1338 (implementasyon, squash SHA `7210ea7c`), CI 4/4 PASS. STF-PRD-BOLA-002 finding **OPEN/NOT CLOSED kalır** — yalnız Task-atama alt-boşluğu ele alındı, Case porsiyonu (CANDIDATE-K) açık (bkz. OFFICE-RISK-REGISTER.md). Detay: bkz. §4f |
| CANDIDATE-K | **DECOMPOSED** (2026-07-17) | NOT_READY | OFF/OD-10 (CLOSED) | STF-PRD-BOLA-002 | NOT_SELECTED | NONE | **HARDENING** | — | GO-ANALYZE (CANDIDATE-J/K next-slice selection) + GO-ANALYZE (CANDIDATE-K re-scope) (2026-07-17) | Case Assignment Scope Alignment — geniş case-assignment kapsamı (ekip-ekleme + toplu atama + legal-sorumlu terfi) tek Contract için gereğinden geniş bulundu → K1/K2/K3'e ayrıştırıldı; ilk dilimi **CANDIDATE-K1** (ekip-ekleme baseline uygunluk kapısı, ürün-kararından bağımsız) SEÇİLDİ. Bu satırın kendisi hiç seçilmedi. Detay: bkz. §4f |
| CANDIDATE-K1 | **CANONICAL** (2026-07-17) | — | OFF/OD-10 (CLOSED) | STF-PRD-BOLA-002 | **SELECTED** (2026-07-17) | **CONSUMED** (2026-07-17) | **HARDENING** | **CONSUMED** (2026-07-17) | GO-ANALYZE (CANDIDATE-K re-scope) + OWNER SELECTION + CONTRACT RATIFICATION + GO-CANONICALIZE + GO-IMPLEMENT + GO-CANONICALIZE (Implementation Closure) | Case Team-Membership Baseline Eligibility Gate — dosya ekibine avukat/personel eklerken hedefin aynı-tenant (zaten uygulanıyor) + **aktif** olması; yalnız ileriye-dönük (write-time) enforcement; mevcut ekip kayıtları retroaktif taranmaz/değiştirilmez; **schema/migration YOK**. **GOVERNANCE-PRECISE:** ekip-üyesi uygunluğu = tenant + aktiflik YALNIZCA — sorumlu-uygunluk bayrağı (yalnız "dosya sorumlusu" alanı için) DEĞİL. Mevcut tenant + rank-default + legal-sorumlu guard'ları korunur. J1'in kardeş deseni (davranış-değiştiren enforcement) ama farklı model (Lawyer/StaffMember). K2 (toplu atama, ASSIGN-4d) · K3 (legal-sorumlu terfi re-check) · rol/kapasite policy · CANDIDATE-J kalan · BOLA-001/SCP-001 bu dilimin DIŞINDA. PR #1356 (implementasyon, squash SHA `423d72ea`), CI 4/4 PASS, PHASE 1 MILESTONE 09. STF-PRD-BOLA-002 finding **OPEN / PARTIALLY MITIGATED kalır** — yalnız Case ekip-ekleme baseline'ı ele alındı; K2/K3 + rol/kapasite policy açık (bkz. OFFICE-RISK-REGISTER.md). Detay: bkz. §4f |
| CANDIDATE-K2 | **BLOCKED_ON_PRODUCT_DECISION** (2026-07-17) | NOT_READY | OFF/OD-10 (CLOSED) | STF-PRD-BOLA-002 | NOT_SELECTED | NONE | **HARDENING** | — | GO-ANALYZE (CANDIDATE-K re-scope) | Bulk Case-Assignment — toplu-avukat yolu **ASSIGN-4d** ürün-kararına BLOKE (toplu sorumluluk yeniden-atama semantiği: düşürme/görev-devri/audit/çok-avukatlı dosya); toplu-personel aktiflik-kontrolü (K2a) ürün-kararından bağımsız ama legacy alan dokunur. ASSIGN-4d owner tarafından yanıtlanmadan seçilemez. Detay: bkz. §4f |
| CANDIDATE-K3 | **DEFERRED** (2026-07-17) | NOT_READY | OFF/OD-10 (CLOSED) | STF-PRD-BOLA-002 | NOT_SELECTED | NONE | **HARDENING** | — | GO-ANALYZE (CANDIDATE-K re-scope) | Legal-Responsible Promotion Active Re-check — legal-sorumlu terfisinde ileriye-dönük aktiflik re-check'i (küçük/edge-case; ekipte olup sonradan pasifleştirilen avukatın terfisi). Ürün-kararından bağımsız, düşük öncelik, owner-gated future scope. Detay: bkz. §4f |

### 4b. WAVE 1 Candidate Detay (Objective/Scope/Risk — GO-ANALYZE'den kanonikleştirildi)

```text
CANDIDATE-A — Offboarding → User Deactivation Wiring
Objective     Staff/Lawyer pasifleştirmesi bağlı User hesabını da (varsa) deaktive etsin —
              mevcut per-request enforcement'ı (auth.service.ts:validateUser(), her istekte
              User.isActive kontrol eder) tetiklesin.
Scope         staff.service.ts:remove() · lawyer.service.ts:delete()
Dependencies  Yok
Est. impl. surface   KÜÇÜK — schema/migration YOK (User.isActive + Lawyer/StaffMember.userId
                     FK zaten var)
Risk                 DÜŞÜK — additive
Suggested order      1.

CONTRACT STATUS: RATIFIED (2026-07-14) — RATIFIED WITH RECORDED LIMITATIONS
IMPLEMENTATION: CANONICAL (2026-07-14) — PR #1239, branch commit `55dc2374`,
  squash SHA `b0ce36db`, CI 4/4 PASS (Architectural Guardrails/Test Suite/Web Tests/
  Client Workspace Live Smoke), mergeStateStatus CLEAN

BINDING RULE (fail-closed + atomic — owner düzeltmesi, ilk taslaktaki "best-effort" REDDEDİLDİ):
  userId dolu ise:
    tx.user.updateMany({ where: { id: existing.userId, tenantId }, data: { isActive: false } })
    result.count !== 1  →  ConflictException fırlatılır, TÜM transaction (Staff/Lawyer write'ı
                            dahil) rollback edilir. "Profil inactive + User active" durumu
                            YAPISAL OLARAK üretilemez.
    result.count === 1  →  devam (Staff/Lawyer isActive=false write'ı aynı tx'te tamamlanır)
  userId null ise:
    mevcut profile-only davranış korunur (User write hiç denenmez)

RECORDED LIMITATIONS (4) — CARRIED FORWARD post-implementation (implementasyon bunları
ÇÖZMEDİ, hâlâ geçerli açık kayıtlar):
  1. Dar TOCTOU relink senaryosu (fetch↔transaction arası userId farklı bir User'a relink
     edilirse) — düşük olasılık, satır kilitleme ile pratikte ihmal edilebilir
  2. Staff offboarding audit eksikliği bu Contract'la DÜZELTİLMEZ (§2b, ayrı FUTURE WAVE)
  3. CANDIDATE-B'nin kapsadığı senaryolar (tokenVersion/tekil-oturum iptali) bu Contract'ta YOK
  4. staff.controller.ts'in exception-to-200 asimetrisi bu Contract'la DÜZELTİLMEZ (§2b, ayrı
     NEW FINDING — FUTURE WAVE/NOT AUTHORIZED); fail-closed rollback SERVİS/VERİ katmanında
     tam çalışır, yalnız HTTP status'u Staff tarafında 200'e düşer (pre-existing davranış)

Exact affected files (IMPLEMENTED, main @ b0ce36db):
  DEĞİŞTİ: lawyer.service.ts (delete()) · staff.service.ts (remove(), $transaction eklendi)
           · lawyer-deactivate-lifecycle.spec.ts (+5 senaryo, 18 mevcut DEĞİŞMEDEN geçti)
  YENİ:    staff/__tests__/staff-deactivate-lifecycle.spec.ts (6 senaryo)
  DEĞİŞMEDİ: controller'lar (imza aynı) · schema.prisma (migration yok)
  Test: Lawyer 23/23 · Staff 6/6 · regresyon (staff 43/43, lawyer 89/89, invite 32/32,
        auth 73/74+1 pre-existing skip) · tsc --noEmit: 4 dosyada sıfır yeni hata

CANDIDATE-B — JWT/Session Revocation Mechanism (tokenVersion)
Objective     OD-15'in seçtiği mekanizma: kısa access TTL + refresh-time DB check +
              tokenVersion.
Scope         schema migration (User.tokenVersion) · JwtPayload + validateUser() genişletmesi ·
              tokenVersion increment tetikleyicileri · muhtemelen yeni refresh-token akışı
              (şu an YOK — grep: 0 eşleşme)
Dependencies  Yok (teknik blok yok) — CANDIDATE-A'nın önce gitmesi önerilir
Est. impl. surface   ORTA-BÜYÜK — migration + auth çekirdeğine dokunan geniş blast-radius
Risk                 ORTA-YÜKSEK — Contract fazı muhtemelen High/Ultra çalışma seviyesi gerektirir
Suggested order      2.

OWNER DISPOSITION: DEFERRED (2026-07-14)
REASON: CANDIDATE-A ile WAVE 1'in acil offboarding riski kapatıldı. CANDIDATE-B geniş
  auth/session altyapısı gerektiren ayrı bir iştir.
Contract başlatılmadı, implementationAuthorization NONE — DEFERRED, iptal DEĞİLDİR; owner'ın
  ayrı, açık bir GO'suyla ileride yeniden ele alınabilir.
```

### 4c. WAVE 2 Candidate Detay (redakte — güvenlik containment, 2026-07-14)

```text
Bu bölüm, WAVE 2 GO-ANALYZE sırasında üretilen ayrıntılı teknik kod-kanıtını KASITLI OLARAK
içermez. Gerekçe: bulgular hâlâ UNPATCHED'tır (WAVE 2 için henüz hiçbir Contract veya
implementasyon başlamadı) ve bu repo PUBLIC'tir; mekanizma-seviyesi açıklama (etkilenen
dosya/metot isimleri, enforcement/bypass ayrıntıları, hangi permission flag'in nerede
tüketilmediği) exploitation-grade bilgi teşkil eder ve owner talimatıyla (2026-07-14,
containment kararı) public manifest'ten çıkarılmıştır.

Tutulan güvenli seviye — yalnız governance metadata (bkz. §4 Slice Register):

CANDIDATE-C   name: Canonical Actor Capacity Read Consolidation (owner re-scope 2026-07-14) ·
              status CANONICAL (2026-07-15) · implementationCategory HARDENING ·
              ownerSelectionStatus SELECTED · implementationAuthorization CONSUMED (2026-07-15) ·
              contractStatus RATIFIED_WITH_RECORDED_LIMITATIONS (2026-07-14)
              OWNER RE-SCOPE (2026-07-14, APPROVED): Eski "resolver enforcement mode" hedefi
              SUPERSEDED BY OWNER RE-SCOPE. #503 observe-only invariant KORUNUR (enforce/assert
              modu EKLENMEZ, permission semantiği değişmez). Yeni objective: authorization
              davranışını birebir koruyarak, aynı actor-capacity okuma desenini tek canonical
              kaynağa taşıyan davranış-nötr HARDENING. Prior Contract Draft verdict: NOT READY —
              SUPERSEDED, tarihsel evidence olarak korunur. Ayrıntılı teknik gerekçe (dosya/metot
              ismi, consumer sayısı, mekanizma detayı) yalnız private evidence'ta — public'e YAZILMAZ.

              CONTRACT STATUS: RATIFIED (2026-07-14) — WITH RECORDED LIMITATIONS
              BINDING SCOPE (redakte governance metadata):
                - capacity mapping tek canonical kaynağa taşınır
                - eşdeğer consumer'lar ve resolver mapping'i buna bağlanır
                - fetch/query davranışları korunur (yalnız mapping ortaklaşır)
                - mevcut authorization sonucu değişmez
                - #503 observe-only invariant korunur (resolver sorgu/metadata/decision/mode/
                  enforced:false dokunulmaz)
              RECORDED LIMITATIONS (4) — CARRIED FORWARD post-implementation (implementasyon
              bunları ÇÖZMEDİ, hâlâ geçerli açık kayıtlar):
                1. Fetch/query katmanı ortaklaştırılmaz (yalnız capacity mapping).
                2. Runtime Capacity doğrulaması eklenmez.
                3. Resolver yalnız leaf-mapping için delege edilir.
                4. Davranış-eşdeğerlik, capacity-kaynak alanlarının non-null schema invariant'ına
                   bağlıdır (invariant değişirse yeniden doğrulanmalı).
              IMPLEMENTATION: CANONICAL (2026-07-15) — PR #1255, branch commit `33cc6710`,
              squash SHA `038dbbb9`, CI 4/4 PASS (Architectural Guardrails/Test Suite/Web Tests/
              Client Workspace Live Smoke), mergeStateStatus CLEAN. Davranış-nötr HARDENING;
              regresyon + yeni unit testleri PASS. Ayrıntılı teknik Contract (kanonik helper imzası,
              exact affected files, silinecek yerel duplicate'ler, non-null invariant kanıtı, test
              sayıları) yalnız private evidence'ta — public'e YAZILMAZ.
CANDIDATE-D   PRODUCT DECISION REQUIRED · NOT A SELECTABLE SLICE
CANDIDATE-E   status DECOMPOSED (2026-07-16) · readinessStatus NOT_READY · ownerSelectionStatus
              NOT_SELECTED (bu satırın kendisi hiç seçilmedi) · implementationAuthorization NONE ·
              contractStatus — (bkz. CANDIDATE-E1)
              CANDIDATE-E'nin orijinal WAVE 2 objective'i (tam OrganizationalTitle/SystemRole/
              PermissionGrant consumer-migration'ı) owner GO-ANALYZE'ında (2026-07-16) tek Contract
              için çok büyük/yüksek riskli bulundu — CANDIDATE-C'nin kendi re-scope emsaliyle aynı
              desen (bkz. yukarıdaki CANDIDATE-C bloğu). DECOMPOSED → CANDIDATE-E1 (first slice,
              SEÇİLDİ) + kalan tam consumer-migration kapsamı (future, henüz candidate ID'si yok,
              owner-gated).

CANDIDATE-E1  name: PermissionGrant/SystemRole Schema Foundation (CANDIDATE-E first-slice
              re-scope, 2026-07-16) · status CANONICAL (2026-07-16, main @ `fa6851c0`, PHASE 1
              MILESTONE 06) · implementationCategory NEW_SUBSYSTEM · ownerSelectionStatus SELECTED
              (2026-07-16) · implementationAuthorization CONSUMED (2026-07-16) · contractStatus
              RATIFIED (2026-07-16)
              OWNER RE-SCOPE (2026-07-16, APPROVED): CANDIDATE-E'nin orijinal kapsamı (yeni şema +
              geniş consumer-yeniden-kablolama + auth çekirdeği) tek Contract için çok büyük/yüksek
              riskli bulundu. Yeni objective: OD-05/08/09'un ratifiye hedef modelini (title≠SystemRole;
              scope+geçerlilik penceresiyle verilen PermissionGrant; dar/gerçek-ihtiyaç explicit deny)
              yapısal olarak temsil eden, YALNIZ EKLEYEN (additive-only) bir şema temeli — sıfır
              mevcut alan değişikliği, sıfır consumer-yeniden-kablolama, sıfır enforcement/runtime
              davranış değişikliği.

              CONTRACT STATUS: RATIFIED (2026-07-16) — Contract Draft (PR #1308) başarılı, tam
              uyumlu implementasyonla (PR #1312) uzlaştırıldı; ayrı bir ön-Validation round'u
              yapılmadı, owner draft'tan doğrudan GO-IMPLEMENT verdi, implementasyon Contract'ın
              tüm invariant/stop-condition'larına uyumlu tamamlandığı için ratifikasyon bu
              canonicalization'la kayda geçti.
              BINDING SCOPE (redakte governance metadata):
                - yeni, yalnız-ekleyen şema yapısı (aktör + izin tanımlayıcı + kapsam ekseni +
                  geçerlilik penceresi + opsiyonel açık red)
                - migration additive-only: mevcut hiçbir alan/tablo DROP/ALTER/RENAME edilmez
                - mevcut rank/rol/StaffMember izin alanları TEK gerçek kaynak kalır, değişmez
                - hiçbir mevcut authorization consumer'ı yeni yapıya bağlanmaz (sıfır tüketici,
                  grep-doğrulanabilir)
                - opsiyonel: salt-okunur parity/backfill işi — hiçbir karar yolunca tüketilmez
              OUT-OF-SCOPE (bu dilim için): mevcut sert yetkilendirme noktalarının migrasyonu ·
                StaffMember'ın aktif izin bayraklarının değiştirilmesi · OFF/OD-06 (FoundingLawyer)
                çözümü · BOLA-001/SCP-001/BOLA-002 (ilgisiz bulgu kümesi, bu candidate'la bağlantısız)
              STOP CONDITIONS: mevcut bir alana dokunma ihtiyacı ortaya çıkarsa · bir tüketici
                değişikliği gerekirse · OD-06 çözümü gerekirse · mevcut test paketinde regresyon ·
                implementasyon sırasında kazayla bir tüketici bağlanırsa → hepsi STOP, re-scope/
                escalate, ayrı Contract gerekir.
              Kalan tam consumer-migration kapsamı AYRI, HENÜZ bir candidate ID'si olmayan,
              owner-gated bir future scope olarak kalır — bu canonicalization onu yetkilendirmez/
              başlatmaz.
              IMPLEMENTATION: CANONICAL (2026-07-16) — PR #1312, squash SHA `fa6851c0`, CI 4/4
              PASS (Architectural Guardrails/Test Suite/Web Tests vitest/Client Workspace Live
              Smoke), mergeStateStatus CLEAN. Additive-only migration (yalnız CREATE TYPE/TABLE/
              INDEX, hiç ALTER/DROP yok); zero-consumer grep-doğrulandı; rollback disposable
              ortamda 2 kez temiz test edildi; 951 regresyon testi PASS; tsc çıktısı değişiklikle/
              değişiklik olmadan birebir özdeş (pre-existing borç dokunulmadı). Ayrıntılı teknik
              Contract (şema alan isimleri, etkilenen dosya/consumer sayıları, mekanizma detayı)
              yalnız private evidence'ta — public'e YAZILMAZ.

Ayrıntılı teknik evidence (call-chain, dosya/metot isimleri, mekanizma açıklaması,
kod-kanıtı) yalnız private handoff/scratchpad kaydındadır — bu public repo'ya
taşınmayacaktır. Contract Draft aşamasına geçildiğinde bu evidence o aşamanın kendi
sürecinde ayrıca ele alınacaktır.
```

### 4d. WAVE 3 Candidate Detay (redakte — privacy containment, 2026-07-15)

```text
Bu bölüm, WAVE 3 GO-ANALYZE'nin (SLICE-03 scope narrowing) ayrıntılı teknik kanıtını KASITLI
OLARAK içermez. Gerekçe: STF-PRD-PRIV-001 açık (unpatched) bir gizlilik/minimizasyon boşluğudur
ve bu repo PUBLIC'tir; hangi yüzeylerin hassas alanı maskesiz döndürdüğüne ilişkin dosya/metot/
mekanizma ayrıntısı exploitation-grade bilgidir ve public manifest'ten çıkarılmıştır (STF-PRD-
PRIV-001'in Risk Register'daki mevcut redaksiyonuyla tutarlı). Governance kökenleri: OFF-INV-10
(OFFICE-GOVERNANCE §20) + OFF/OD-18 (Option B CLOSED/CANONICAL: maskeli varsayılan + field-level
permission + export allowlist).

Tutulan güvenli seviye — yalnız governance metadata (bkz. §4 Slice Register):

CANDIDATE-F1  name: Personnel List Masked Default · status CANONICAL (2026-07-15) ·
              implementationCategory HARDENING · ownerSelectionStatus SELECTED ·
              implementationAuthorization CONSUMED (2026-07-15) ·
              contractStatus RATIFIED_WITH_RECORDED_LIMITATIONS (2026-07-15)
              Objective (soyut): personel LIST yüzeyinde hassas alanları mevcut masking
              altyapısını REUSE ederek varsayılan maskele. OFF/OD-18 YETERLİ (Option B doğrudan
              "maskeli varsayılan"ı yetkilendirir). Davranış değişir (açık gösterim kısıtlanır —
              OD-18 bunu MANDATE ediyor); round-trip gerektirmeyen görüntüleme yüzeyi.

              CONTRACT STATUS: RATIFIED (2026-07-15) — WITH RECORDED LIMITATIONS
              BINDING SCOPE (redakte governance metadata):
                - personel liste yüzeyleri varsayılan maskeli olur
                - yalnız ratifiye hassas alanlar kapsanır
                - mevcut masking altyapısı REUSE edilir (yeni algoritma yok)
                - null değer semantiği korunur (null→null; sentinel response'a yazılmaz)
                - detail/edit/search davranışları DEĞİŞMEZ
              ACCEPTED RECORDS (CARRIED FORWARD post-implementation — implementasyon bunları
              ÇÖZMEDİ, hâlâ geçerli açık kayıtlar):
                - exact-identity list-search residual vector → NEW FINDING / FUTURE WAVE / NOT AUTHORIZED
                - ek contact/tax PII alanları (F1-dışı) → OWNER REVIEW REQUIRED
                - OFF-INV-10 → PARTIAL IMPLEMENTATION (F1 yalnız list-display boşluğunu daraltır)
                - STF-PRD-PRIV-001 → OPEN / NOT CLOSED (F1 bunu KAPATMAZ)
              IMPLEMENTATION: CANONICAL (2026-07-15) — PR #1270, branch commit `a08932fb`,
              squash SHA `a170da3e`, CI 4/4 PASS (Architectural Guardrails/Test Suite/Web Tests/
              Client Workspace Live Smoke), mergeStateStatus CLEAN. List-display HARDENING;
              regresyon + yeni unit testleri PASS. Ayrıntılı teknik Contract (metot isimleri,
              alan-endpoint eşlemesi, masking util adı, null-preserving contract, test contract)
              yalnız private evidence'ta — public'e YAZILMAZ.
CANDIDATE-F2  name: Personnel Export Masking · status DORMANT ·
              reason: IMPLEMENTATION SURFACE NOT FOUND (owner disposition 2026-07-15) ·
              ownerSelectionStatus NOT_SELECTED · implementationAuthorization NONE
CANDIDATE-G   name: Detail Masking + Field-Level Unmask Permission ·
              implementationCategory NEW_SUBSYSTEM · status BLOCKED ·
              blocker: FIELD-LEVEL UNMASK GOVERNANCE / MECHANISM UNRESOLVED
              (OFF/OD-18 policy'yi belirler ama unmask MEKANİZMA tasarımı — kim/purpose-binding —
              tanımsız; olası ek owner decision gerekir)
CANDIDATE-H   name: Audit/Read-Model Minimization Verification · status VERIFICATION COMPLETE (2026-07-15)
              H-AUDIT: EVIDENCE COMPLETE / NO IMPLEMENTATION REQUIRED — personel audit minimization
              doğrulandı (audit yazımları ratifiye hassas alan taşımıyor; mevcut minimization altyapısı
              yeterli). Ayrıntı private evidence.
              H-READMODEL: EDIT-SAFE MASKING PATH SELECTED (owner, 2026-07-15) → CANDIDATE-H1 üretti.
              Consumer validation: purpose-bound (raw-bağımlı) düzenleme tüketicisi tespit edildi;
              naif maskeleme veri bütünlüğünü bozar → edit-safe kontrat seçildi. CANDIDATE-G
              field-level-unmask subsystem AÇILMAZ. Ayrıntı (yüzey/alan/edit mekanizması) private evidence.
CANDIDATE-H1  name: Case-Embedded Personnel Sensitive Field Edit-Safe Masking ·
              status CANONICAL (2026-07-15) · implementationCategory HARDENING · ownerSelectionStatus SELECTED ·
              implementationAuthorization CONSUMED (2026-07-15) ·
              contractStatus RATIFIED_WITH_RECORDED_LIMITATIONS (2026-07-15)
              Objective (soyut): case read-model yüzeylerinde personel hassas alan varsayılan
              maskeli döner; düzenleme akışı edit-safe kontratla veri bütünlüğünü korur (kontrat
              ayrıntısı private evidence). OFF/OD-18 mask-default'u yetkilendirir; edit-safe yol
              CANDIDATE-G field-level-unmask'a İHTİYAÇ DUYMAZ.
              CONTRACT STATUS: RATIFIED (2026-07-15) — WITH RECORDED LIMITATIONS
              BINDING UPDATE CONTRACT (redakte governance metadata):
                - hassas alan update: omit/undefined → mevcut değer korunur
                - tam görünür, boş olmayan, maskeli olmayan değer → update edilir
                - maskeli / boş / whitespace / null / non-string → reddedilir (400)
                - format/checksum doğrulaması bu slice'ta EKLENMEZ
              BINDING READ/UI CONTRACT (redakte governance metadata):
                - case read-model yüzeyleri null-preserving maskeli döner
                - UI raw/maskeli değeri edit alanına prefill etmez; yalnız generic "tanımlı/tanımsız" göstergesi
                - frontend boş input'u update payload'ına eklemez; kasıtlı silme desteklenmez
              RECORDED LIMITATIONS (CARRIED FORWARD):
                - raw reveal / field-level unmask YOK (CANDIDATE-G açılmaz)
                - değişiklik için tam değer yeniden girilir
                - phone/email/address/bankName kapsam dışı (F1 OWNER-REVIEW carried forward)
                - guard yalnız update akışında; create kapsam dışı
                - F1 (list) ve H1 (case) ayrı projeksiyon katmanları
              IMPLEMENTATION: CANONICAL (2026-07-15) — PR #1283, branch commit `8f7dd1c8`,
              squash SHA `29eb6384`, CI 4/4 PASS (Architectural Guardrails/Test Suite/Web Tests/
              Client Workspace Live Smoke), mergeStateStatus CLEAN. Masked-read + edit-safe kontrat CANLI;
              regresyon + yeni unit testleri PASS. Ayrıntılı Contract (yüzey/metot, alan-endpoint, exact
              guard, edit-mekanizma) yalnız private evidence — public'e YAZILMAZ.
              EVIDENCE LIMITATION (CI ALLOWLIST): yeni hedefli testler LOKAL 10/10 PASS; mevcut CI test
              allowlist'ine dahil oldukları AYRICA kanıtlanmadı. Bu kayıt implementation sonucunu veya
              CI 4/4 PASS iddiasını DEĞİŞTİRMEZ.
              CARRIED FORWARD (H1 KAPATMAZ): OFF-INV-10 → PARTIAL IMPLEMENTATION ·
              STF-PRD-PRIV-001 → OPEN / NOT CLOSED.
              DEPENDENCY: CANDIDATE-G BLOCKED/NOT_SELECTED korunur — bu slice onu AÇMAZ.
              Ayrıntılı Contract (yüzey/metot, alan-endpoint, exact guard, edit-mekanizma adımları)
              yalnız private evidence — public'e YAZILMAZ.

DORMANT (slice DEĞİL): "leave/termination reason" masking — ŞEMA SURFACE'İ BULUNAMADI
(OFF-INV-10 bu alanları sayar ama karşılık gelen şema alanı yok; SLICE-01 emsali dormant).

Ayrıntılı teknik evidence (etkilenen yüzeyler, mevcut masking util envanteri, kod-kanıtı) yalnız
private handoff/scratchpad + memory kaydındadır — public repo'ya taşınmayacaktır.
```

### 4e. WAVE 4+ Candidate Detay (redakte — güvenlik containment, 2026-07-16)

```text
Bu bölüm, WAVE 4+ GO-ANALYZE sırasında üretilen ayrıntılı teknik kod-kanıtını KASITLI OLARAK
içermez. Gerekçe: STF-PRD-BOLA-001/SCP-001 hâlâ UNPATCHED'tır (yalnız dar bir cross-tenant
istisnası kapatıldı, intra-tenant kapsam boşluğu açık) ve bu repo PUBLIC'tir; mekanizma-seviyesi
açıklama (etkilenen dosya/metot/route isimleri, mevcut kontrolün tam şekli) exploitation-grade
bilgi teşkil eder — WAVE 2/3'ün aynı containment kuralı uygulanır.

Tutulan güvenli seviye — yalnız governance metadata (bkz. §4 Slice Register):

CANDIDATE-I   implementationCategory NEW_SUBSYSTEM · status DECOMPOSED (2026-07-16) ·
              readinessStatus NOT_READY · ownerSelectionStatus NOT_SELECTED (bu satırın kendisi
              hiç seçilmedi) · implementationAuthorization NONE · contractStatus —
              (bkz. CANDIDATE-I1)
              CANDIDATE-I'nın tam kapsamı (case/client'ın tüm nesne-erişim yüzeyine gerçek bir
              kapsam-değerlendirme adımı + bunun dayanacağı organizasyon-yapısını eklemek) owner
              GO-ANALİZ'ında (2026-07-16) tek Contract için çok büyük bulundu — CANDIDATE-C/E'nin
              kendi re-scope emsaliyle aynı desen. DECOMPOSED → CANDIDATE-I1 (first slice,
              SEÇİLDİ) + kalan tam enforcement kapsamı (future, henüz candidate ID'si yok,
              owner-gated).

CANDIDATE-I1  name: Team/Manager-Hiyerarşi Additive Schema Foundation (CANDIDATE-I first-slice
              re-scope, 2026-07-16) · status CANONICAL (2026-07-16/17, main @ `05e73579`, PHASE 1
              MILESTONE 07) · implementationCategory NEW_SUBSYSTEM · ownerSelectionStatus SELECTED
              (2026-07-16) · implementationAuthorization CONSUMED (2026-07-16/17) · contractStatus
              RATIFIED (2026-07-16)
              OWNER RE-SCOPE (2026-07-16, APPROVED): CANDIDATE-I'nın orijinal kapsamı (case/
              client'ın tüm nesne-erişim yüzeyine gerçek enforcement eklemek) tek Contract için
              çok büyük bulundu. Yeni objective: OD-08'in hedef modelini (manager-tipi erişimde
              varsayılan direct-report/team scope, global ayrı izin) yapısal olarak temsil eden,
              YALNIZ EKLEYEN (additive-only) bir organizasyon-hiyerarşisi şema temeli — sıfır
              mevcut alan değişikliği, sıfır consumer-bağlama, sıfır enforcement/runtime davranış
              değişikliği.

              CONTRACT STATUS: RATIFIED (2026-07-16) — Implementation Contract Draft, mevcut
              kapsamı/invariants/acceptance-criteria/stop-conditions ile owner tarafından
              RATIFIED edildi; implementasyon (PR #1325) bu Contract'ın tüm gereksinimlerine
              tam uyumlu tamamlandığı için ratifikasyon bu canonicalization'la uzlaştırıldı.
              BINDING SCOPE (redakte governance metadata):
                - aktör + amir referansı + tenant kapsamı + geçerlilik penceresi (tek-amirli,
                  tarihsel/append-only model — anlık tek-satır değil)
                - migration additive-only: mevcut hiçbir alan/tablo DROP/ALTER/RENAME edilmez
                - mevcut case/client servis/endpoint/alanları TEK gerçek kaynak kalır, değişmez
                - hiçbir mevcut consumer'ı yeni yapıya bağlanmaz (sıfır tüketici,
                  grep-doğrulanabilir)
                - "team" kapsamı bu dilimde AYRI bir yapı olarak modellenmez (hiyerarşiden
                  türetilecek şekilde ileriye bırakıldı — tasarım tercihi olarak kaydedildi)
              VERİ MODELİ SINIRLARI: tek-amirli (matrix/çoklu-amir desteği YOK) · döngü-önleme
                kısıtı bu dilimde YOK (sıfır yazma-yolu olduğundan gerekmiyor, ileriki bir
                consumer-candidate'ın kapsamına bırakıldı) · amir-ilişkisi kavramı mevcut
                kıdem/unvan etiketlerinden AÇIKÇA ayrı tutulur (birbirine karıştırılmaz)
              CANDIDATE-E1 MODEL ÇAKIŞMASI KONTROLÜ: YOK — CANDIDATE-E1'in izin-kaydı şeması
                (kapsam EKSENİNİ etiketleyen bir yapı) ile bu dilimin hiyerarşi kaydı (o etiketin
                kime karşılık geldiğini çözecek veri) TAMAMLAYICI katmanlar; isim çakışması sıfır
                (taze grep-doğrulandı); duplicate authority riski YOK.
              BACKFILL: KESİN OLARAK YOK / UYGULANAMAZ — şemada bu kavrama ait mevcut hiçbir alan
                yok, türetilecek kaynak veri yok; yeni yapı migration sonrası boş başlar.
              OUT-OF-SCOPE (bu dilim için): mevcut case/client servis/endpoint değişikliği ·
                CANDIDATE-J/K (görev/dosya ataması uygunluğu) · gerçek object-scope enforcement ·
                "team"in hiyerarşiden bağımsız ayrı bir yapı olarak modellenmesi · matrix-org
                desteği
              STOP CONDITIONS: mevcut bir alana dokunma ihtiyacı ortaya çıkarsa · bir consumer
                bağlama ihtiyacı gerekirse (ayrı Contract) · hiyerarşi-ötesi bir "team" yapısı
                ihtiyacı ortaya çıkarsa · mevcut test paketinde regresyon · implementasyon
                sırasında kazayla bir consumer bağlanırsa → hepsi STOP, re-scope/escalate, ayrı
                Contract gerekir.
              ACCEPTANCE CRITERIA: migration'ın additive-only olduğu doğrulanır (mevcut alanlarda
                ALTER/DROP yok) · sıfır tüketici grep ile kanıtlanır · mevcut tam regresyon paketi
                değişmeden PASS · tsc çıktısı değişiklikle/değişiklik olmadan özdeş · rollback
                provası kayıt altına alınır (migrate up → geri al → şema öncekiyle bire bir eşleşir)
              TEST/EVIDENCE PLANI: disposable Docker Postgres (paylaşımlı dev DB'ye asla
                dokunulmaz) · additive-only migration kanıtı · zero-consumer grep · tam regresyon +
                tsc diff · rollback drill — CANDIDATE-E1'in kanıt disipliniyle birebir aynı.
              Kalan tam enforcement kapsamı AYRI, HENÜZ bir candidate ID'si olmayan, owner-gated
              bir future scope olarak kalır — bu canonicalization onu yetkilendirmez/başlatmaz.
              IMPLEMENTATION: CANONICAL (2026-07-16/17) — PR #1325, squash SHA
              `05e73579f295615db8a0f3f3ff5816caa958acd5`, CI 4/4 PASS (Architectural
              Guardrails/Test Suite/Web Tests vitest/Client Workspace Live Smoke), mergeStateStatus
              CLEAN. Additive-only migration (yalnız CREATE TABLE + 3 CREATE INDEX, hiç ALTER/DROP
              yok); zero-consumer grep-doğrulandı; rollback disposable ortamda temiz test edildi;
              1722 regresyon testi PASS (2 pre-existing/ilgisiz hata differential testle bağımsız
              kanıtlandı); tsc çıktısı değişiklikle/değişiklik olmadan birebir özdeş. Ayrıntılı
              teknik Contract (şema alan isimleri, etkilenen dosya/route/consumer sayıları,
              mekanizma detayı) yalnız private evidence'ta — public'e YAZILMAZ.

CANDIDATE-J/K (Task Assignment Eligibility Gate / Case Assignment Scope Alignment — BOLA-002)
BU (I1) canonicalization'ının KAPSAMI DIŞINDAYDI — o turda hiçbiri seçilmedi/başlatılmadı.
GÜNCELLEME (2026-07-17): CANDIDATE-J ayrı bir GO-ANALYZE + OWNER SELECTION ile decompose
edildi, ilk dilimi CANDIDATE-J1 seçildi/ratifiye edildi — bkz. §4f. CANDIDATE-K hâlâ
seçilmedi/başlatılmadı.

Ayrıntılı teknik evidence (route/dosya/metot isimleri, mevcut kontrolün tam şekli, kod-kanıtı)
yalnız private handoff/scratchpad kaydındadır — bu public repo'ya taşınmayacaktır.
```

### 4f. WAVE 4+ Candidate Detay — BOLA-002 (redakte — güvenlik containment, 2026-07-17)

```text
Bu bölüm, CANDIDATE-J/K GO-ANALYZE sırasında üretilen ayrıntılı teknik kod-kanıtını KASITLI
OLARAK içermez. Gerekçe: STF-PRD-BOLA-002 hâlâ UNPATCHED'tır ve bu repo PUBLIC'tir; mekanizma-
seviyesi açıklama (etkilenen dosya/metot/route isimleri, mevcut kontrolün tam şekli, hangi
alanın hangi guard'dan geçmediği) exploitation-grade bilgi teşkil eder — WAVE 2/3/4e'nin aynı
containment kuralı uygulanır.

Tutulan güvenli seviye — yalnız governance metadata (bkz. §4 Slice Register):

CANDIDATE-J    implementationCategory HARDENING · status DECOMPOSED (2026-07-17) ·
               readinessStatus NOT_READY · ownerSelectionStatus NOT_SELECTED (bu satırın kendisi
               hiç seçilmedi) · implementationAuthorization NONE · contractStatus —
               (bkz. CANDIDATE-J1)
               CANDIDATE-J'nin tam kapsamı (Task-atama uygunluğu + herhangi bir rol/kapasite
               uygunluk policy'si) owner GO-ANALYZE'ında (2026-07-17) ilk davranış-değiştiren
               enforcement dilimi için gereğinden geniş bulundu — CANDIDATE-C/E/I'nin kendi
               re-scope emsaliyle aynı desen. DECOMPOSED → CANDIDATE-J1 (first slice, SEÇİLDİ) +
               kalan rol/kapasite policy kapsamı (future, henüz candidate ID'si yok, owner-gated).

CANDIDATE-J1   name: Task Assignee Baseline Eligibility Gate (CANDIDATE-J first-slice re-scope,
               2026-07-17) · status CANONICAL (2026-07-17, main @ `7210ea7c`, PHASE 1 MILESTONE 08) ·
               implementationCategory HARDENING · ownerSelectionStatus SELECTED (2026-07-17) ·
               implementationAuthorization CONSUMED (2026-07-17) · contractStatus RATIFIED (2026-07-17)
               OWNER RE-SCOPE (2026-07-17, APPROVED): CANDIDATE-J'nin orijinal kapsamı (Task-atama
               uygunluğu + rol/kapasite policy) tek Contract için gereğinden geniş bulundu. Yeni
               objective: OD-10 Option B'nin hedef modelini (assignment≠access, her türetim
               explicit policy) davranışsal olarak temsil eden, YALNIZ İLERİYE-DÖNÜK (write-time)
               bir baseline uygunluk kapısı — görev oluşturma/güncelleme sırasında, atama alanı
               doluysa, atanan-kişinin aynı-tenant + aktif olduğunu doğrular. Mevcut çalışan
               tekil-sorumlu uygunluk kapısının kalıbını izler.

               CONTRACT STATUS: RATIFIED (2026-07-17) — Implementation Contract Draft, aşağıdaki
               kapsam/invariants/acceptance-criteria/stop-conditions ile owner tarafından RATIFIED
               edildi; implementasyon (PR #1338) bu Contract'ın tüm invariant/stop-condition'larına
               tam uyumlu tamamlandığı için ratifikasyon bu canonicalization'la CONSUMED'a uzlaştırıldı.
               BINDING SCOPE (redakte governance metadata):
                 - görev oluşturma + güncelleme yazma yolunda, atama alanı doluysa uygunluk
                   doğrulaması (aynı-tenant + aktiflik)
                 - doğrulama mevcut çalışan tekil-sorumlu uygunluk kapısının kalıbını izler
                 - uygun-olmayan atama yazma anında açık bir hata ile reddedilir
                 - null/boş atama serbest kalır (sistem/otomasyon görevleri) — davranış korunur
                 - yalnız ileriye-dönük: mevcut kayıtlar retroaktif taranmaz/reddedilmez
               VERİ MODELİ SINIRLARI: gereken alanlar (tenant, aktiflik) zaten mevcut · yeni alan/
                 tablo YOK · yeni consumer YOK (mevcut yazma yolunun içine tek bir doğrulama eklenir)
               DAVRANIŞ ETKİSİ: Bu, WAVE 4+'te İLK davranış-DEĞİŞTİREN enforcement dilimidir
                 (E1/I1'in additive-only/sıfır-davranış deseninden AÇIKÇA farklı) — önceden kabul
                 edilen uygun-olmayan atamalar artık yazma anında reddedilir. Owner bunu bilerek
                 seçti/ratifiye etti.
               BACKFILL: UYGULANMAZ — bu bir enforcement dilimi, veri-taşıma değil; ileriye-dönük
                 tasarım mevcut satırlara dokunmaz.
               OUT-OF-SCOPE (bu dilim için): rol/kapasite tabanlı uygunluk policy'si (owner POLICY
                 kararı — eşik/kategori icat edilmez) · retroaktif/okuma-anında enforcement · arayüz
                 seçim-listesi kaynağının aktiflik filtresi (ayrı savunma-derinliği UX dilimi) ·
                 CANDIDATE-K (Case ekip-atama yüzeyi) · STF-PRD-BOLA-001/SCP-001/CANDIDATE-I kapsamı
               STOP CONDITIONS: mevcut bir alana dokunma ihtiyacı · bir consumer'ı yeniden kablolama
                 ihtiyacı · retroaktif enforcement ihtiyacı · rol/kapasite policy'ye genişleme
                 ihtiyacı · CANDIDATE-K yüzeyine sıçrama · mevcut test paketinde regresyon → hepsi
                 STOP, re-scope/escalate, ayrı Contract gerekir.
               ACCEPTANCE CRITERIA: aynı-tenant+aktif atama kabul edilir · cross-tenant atama
                 reddedilir · aynı-tenant-fakat-pasif atama reddedilir · null atama serbest kalır ·
                 mevcut tam regresyon paketi değişmeden PASS · tsc çıktısı değişiklikle/değişiklik
                 olmadan özdeş
               TEST/EVIDENCE PLANI: yeni pozitif/negatif enforcement birim testleri · mevcut görev-
                 modülü regresyonu · tsc diff-clean · DB-gated bir entegrasyon testi eklenirse
                 disposable Docker Postgres (paylaşımlı dev DB'ye asla dokunulmaz)
               Kalan rol/kapasite policy kapsamı + tüm CANDIDATE-K AYRI, HENÜZ (K için ayrı) bir
               candidate ID'si olmayan, owner-gated future scope olarak kalır — bu canonicalization
               onları yetkilendirmez/başlatmaz.
               IMPLEMENTATION: CANONICAL (2026-07-17) — PR #1338, squash SHA `7210ea7c`, CI 4/4
               PASS (Architectural Guardrails/Test Suite/Web Tests vitest/Client Workspace Live
               Smoke). Yalnız 2 dosya (görev servisi + testi), sıfır schema/migration; enforcement
               mevcut yazma yolunun içine tek bir tenant+aktiflik uygunluk doğrulaması olarak
               eklendi (atama alanının hedef modeli için, mevcut tekil-sorumlu kapısının aynı
               kalıbı — yeni framework değil); 4 zorunlu senaryo testi + güncelleme-yolu kapsamı; regresyon (görev
               + auth/lawyer/staff/policy-engine/permission-diagnostics/case/claim-item/poa/pdf/
               validation-gate) 1873 PASS (2 pre-existing/ilgisiz hata differential testle bağımsız
               kanıtlandı, dokunulmadı); tsc çıktısı değişiklikle/değişiklik olmadan birebir özdeş.
               Not: PR #1338 owner'ın kendi hesabıyla squash-merge edildi (paralel oturum; ajan gh
               config-kilidi nedeniyle merge edemeden owner tamamladı — repository-authority
               çelişkisi değil, operasyonel merge devri). Ayrıntılı teknik Contract (enforcement
               metot imzaları, helper adı, emsal servis referansı, tam ret koşulları) yalnız private
               evidence'ta — public'e YAZILMAZ.

CANDIDATE-K (Case Assignment Scope Alignment — BOLA-002'nin Case-atama porsiyonu) owner
GO-ANALYZE'ında (CANDIDATE-K re-scope, 2026-07-17) DECOMPOSED edildi. Case-assignment yüzeyi
farklı mevcut-kontrol profillerine sahip ayrık alt-yüzeylere bölünüyor: ekip-üyesi ekleme
(tenant kontrollü, aktiflik YOK) · ekip-üyesi güncelleme (yeni kişi eklenmiyor, minimal) · tekil
"dosya sorumlusu" alanı (ZATEN kapalı — tenant+aktiflik+uygunluk-bayrağı, çalışan emsal) · toplu
atama (personel legacy alan, aktiflik YOK; avukat yolu DEVRE DIŞI) · legal-sorumlu terfi (aktiflik
re-check YOK). → K1/K2/K3'e ayrıştırıldı.

CANDIDATE-K1   name: Case Team-Membership Baseline Eligibility Gate (CANDIDATE-K first-slice
               re-scope, 2026-07-17) · status CANONICAL (2026-07-17, main @ `423d72ea`, PHASE 1
               MILESTONE 09) · implementationCategory HARDENING · ownerSelectionStatus SELECTED
               (2026-07-17) · implementationAuthorization CONSUMED (2026-07-17) · contractStatus
               RATIFIED (2026-07-17)
               OWNER RE-SCOPE (2026-07-17, APPROVED): CANDIDATE-K'nin geniş kapsamı ilk enforcement
               dilimi için gereğinden geniş; ürün-kararından bağımsız en büyük baseline boşluğu =
               ekip-üyesi ekleme. Yeni objective: dosya ekibine avukat/personel eklerken hedefin
               aynı-tenant (zaten uygulanıyor) + AKTİF olduğunu doğrulayan, YALNIZ İLERİYE-DÖNÜK
               (write-time) bir baseline uygunluk kapısı. J1'in kardeş deseni (davranış-değiştiren
               enforcement) ama farklı hedef model (Lawyer/StaffMember).

               CONTRACT STATUS: RATIFIED (2026-07-17) — Implementation Contract Draft, aşağıdaki
               kapsam/invariants/acceptance-criteria/stop-conditions ile owner tarafından RATIFIED.
               BINDING SCOPE (redakte governance metadata):
                 - dosya ekibine avukat/personel ekleme yazma yolunda hedef aktiflik doğrulaması
                   (aynı-tenant + aktif); pasif hedef açık bir hata ile reddedilir
                 - yalnız ileriye-dönük: mevcut ekip kayıtları retroaktif taranmaz/değiştirilmez
                 - mevcut tenant kontrolü + rank-default rol mantığı + legal-sorumlu yapısal
                   guard'lar KORUNUR
               GOVERNANCE-PRECISE AYRIM (kritik): ekip-üyesi uygunluğu = tenant + aktiflik YALNIZCA
                 — sorumlu-uygunluğunun (tenant+aktiflik+uygunluk-bayrağı) daha katı kuralı DEĞİL
                 (o kural yalnız "dosya sorumlusu" alanı için; stajyer/asistan gibi ekip üyeleri
                 meşru şekilde uygunluk-bayrağı taşımaz). Mevcut sorumlu-doğrulayıcı LİTERAL olarak
                 yeniden kullanılmaz — yalnız tenant+aktiflik kontrol ŞEKLİ mevcut kontrol
                 noktalarında yeniden kullanılır (duplicate framework üretilmez).
               VERİ MODELİ SINIRLARI: gereken alanlar (tenant, aktiflik) zaten mevcut · yeni alan/
                 tablo YOK · mevcut ekleme kontrol noktaları genişletilir (yeni consumer eklenmez)
               DAVRANIŞ ETKİSİ: davranış-DEĞİŞTİREN enforcement (J1 kardeşi) — önceden kabul edilen
                 pasif-hedef ekip-eklemeleri artık yazma anında reddedilir. Owner bunu bilerek seçti.
               BACKFILL: UYGULANMAZ — enforcement dilimi; ileriye-dönük tasarım mevcut satırlara
                 dokunmaz (pasifleştirme mevcut ekip satırlarını bilinçli bırakan sevk edilmiş
                 tasarımla tutarlı — retroaktif enforcement YÜKSEK risk taşırdı, o yüzden dışarıda).
               OUT-OF-SCOPE (bu dilim için): toplu atama (K2/ASSIGN-4d) · legal-sorumlu terfi
                 re-check (K3) · retroaktif tarama · tekil sorumlu alanı (zaten kapalı) · rol/kapasite
                 policy · ekip-üyesi güncelleme · CANDIDATE-J kalan kapsamı · BOLA-001/SCP-001
               STOP CONDITIONS: schema ihtiyacı · retroaktif enforcement ihtiyacı · toplu-atama
                 yüzeyine sıçrama · rol/kapasite policy'ye genişleme · legal-sorumlu terfi yüzeyine
                 sıçrama · mevcut test paketinde regresyon → hepsi STOP, re-scope/escalate, ayrı Contract.
               ACCEPTANCE CRITERIA: aktif aynı-tenant avukat/personel → kabul · pasif → ret ·
                 cross-tenant → ret (zaten) · mevcut tam regresyon paketi değişmeden PASS · tsc
                 çıktısı değişiklikle/değişiklik olmadan özdeş
               TEST/EVIDENCE PLANI: ekleme yolu için pozitif/negatif enforcement birim testleri
                 (avukat + personel, aktif/pasif/cross-tenant) · mevcut case-modülü regresyonu · tsc
                 diff-clean · DB-gated bir entegrasyon testi eklenirse disposable Docker Postgres
               DUPLICATE-LOGIC VERDICT: mevcut ekleme kontrol noktaları genişletilir; sorumlu-
                 doğrulayıcıyla YANLIŞ konsolidasyondan kaçınılır (farklı, daha katı kural); J1'in
                 User-kapısı kardeş şekildir ama farklı model olduğu için yeniden kullanılamaz.
               IMPLEMENTATION: CANONICAL (2026-07-17) — PR #1356, squash SHA
               `423d72ea82124d657b91973973e7ccece556f3c1`, CI 4/4 PASS (Architectural Guardrails/
               Test Suite/Web Tests vitest/Client Workspace Live Smoke), mergeStateStatus CLEAN.
               Enforcement mevcut ekip-ekleme kontrol noktalarına eklendi (yeni framework yok);
               yalnız ileriye-dönük; zero schema/migration. Yeni pozitif/negatif enforcement
               testleri (avukat + personel: aktif→kabul/pasif→ret/cross-tenant→mevcut ret); 1780
               regresyon PASS (2 pre-existing/ilgisiz hata differential testle bağımsız kanıtlandı);
               tsc çıktısı değişiklikle/değişiklik olmadan birebir özdeş. **Gate-öncesi yazılmış 4
               mevcut ekip-testinin mock'una `aktiflik=true` eklendi** (yeni kapının gerektirdiği
               alan eksikti — meşru mock-tamamlama, davranış regresyonu değil). Ayrıntılı teknik
               Contract (enforcement metot/site imzaları, tam ret koşulları) yalnız private
               evidence'ta — public'e YAZILMAZ.

CANDIDATE-K2   name: Bulk Case-Assignment · status BLOCKED_ON_PRODUCT_DECISION (2026-07-17) ·
               ownerSelectionStatus NOT_SELECTED · implementationAuthorization NONE
               Toplu-avukat yolu **ASSIGN-4d** ürün-kararına BLOKE: toplu avukat dosya-sorumluluğu
               yeniden-atama semantiği (mevcut sorumluyu düşürme / görev-devri / audit / çok-avukatlı
               dosya) net değil. ASSIGN-4d bu görevde owner tarafından YANITLANMADI (DEFERRED —
               yalnız K2b'yi etkiler, K1'i bloke etmez). Alt-parça K2a (toplu-personel aktiflik-
               kontrolü) ürün-kararından bağımsız ama bir legacy operasyonel-sahip alanına dokunur;
               owner isterse ayrı dar bir hardening olarak önce ele alınabilir. Seçilene kadar
               hiçbir alanı değiştirilmez.
               ASSIGN-4d OWNER DECISION PACKAGE (K2b için, owner yanıtı bekliyor): OPTION A =
               toplu-atama yalnız sorumlu-olmayan ekip üyesi ekler (düşürmez, safe) · OPTION B =
               sorumluyu değiştirir (düşür + görev-devri + audit) · OPTION C = toplu-avukat devre
               dışı kalır (status quo). SAFE DEFAULT: A veya C.

CANDIDATE-K3   name: Legal-Responsible Promotion Active Re-check · status DEFERRED (2026-07-17) ·
               ownerSelectionStatus NOT_SELECTED · implementationAuthorization NONE
               Legal-sorumlu terfi akışı (aktör-yetki + tenant + hedefin zaten ekip üyesi olması
               kontrol ediliyor) terfi anında hedefin aktiflik durumunu yeniden doğrulamıyor —
               ekipte olup sonradan pasifleştirilen bir kişi terfi edilebilir. Küçük/edge-case,
               ürün-kararından bağımsız, düşük öncelik. Owner-gated future scope; bu canonicalization
               onu yetkilendirmez/başlatmaz.

Ayrıntılı teknik evidence (route/dosya/metot isimleri, mevcut kontrolün tam şekli, kod-kanıtı,
enforcement site imzaları) yalnız private handoff/scratchpad kaydındadır — bu public repo'ya
taşınmayacaktır.
```

## 5. Milestone Register (yalnız CANONICAL slice'lardan türetilir)

```text
PHASE 1 MILESTONE 01
SLICE-02 · IMPLEMENTED · MERGED · CANONICAL (main @ a3eee8b8, 2026-07-13)

PHASE 1 MILESTONE 02
CANDIDATE-A · IMPLEMENTED · MERGED · CANONICAL (main @ b0ce36db, 2026-07-14, PR #1239)

PHASE 1 MILESTONE 03
CANDIDATE-C · IMPLEMENTED · MERGED · CANONICAL (main @ 038dbbb9, 2026-07-15, PR #1255)

PHASE 1 MILESTONE 04
CANDIDATE-F1 · IMPLEMENTED · MERGED · CANONICAL (main @ a170da3e, 2026-07-15, PR #1270)

PHASE 1 MILESTONE 05
CANDIDATE-H1 · IMPLEMENTED · MERGED · CANONICAL (main @ 29eb6384, 2026-07-15, PR #1283)

PHASE 1 MILESTONE 06
CANDIDATE-E1 · IMPLEMENTED · MERGED · CANONICAL (main @ fa6851c0, 2026-07-16, PR #1312)

PHASE 1 MILESTONE 07
CANDIDATE-I1 · IMPLEMENTED · MERGED · CANONICAL (main @ 05e73579, 2026-07-16/17, PR #1325)

PHASE 1 MILESTONE 08
CANDIDATE-J1 · IMPLEMENTED · MERGED · CANONICAL (main @ 7210ea7c, 2026-07-17, PR #1338)

PHASE 1 MILESTONE 09
CANDIDATE-K1 · IMPLEMENTED · MERGED · CANONICAL (main @ 423d72ea, 2026-07-17, PR #1356)

────────────────────────────────────────────────────────────────────────────
PHASE 1 — CLOSED / COMPLETE WITH RECORDED RESIDUALS (owner ratification 2026-07-17,
decision-log § "OFFICE Phase 1 Closure with Recorded Residuals"). MILESTONE 01–09 teyitli.
Kapanış hiçbir OPEN/PARTIALLY MITIGATED bulguyu kapatmaz, hiçbir PARTIAL invariant'ı
tamamlamaz; deferred/blocked/dormant/owner-gated tüm residual'lar ileriye taşınır;
candidate seçimi/implementation authorization ÜRETMEZ.
```

## 6. Mapping Completeness ve Orphan Kontrolü

```text
Finding toplam: 12 · disposition atanan: 12/12 (2 UNMAPPED — OWNER REVIEW REQUIRED, açıklamalı)
Decision toplam: 20 · her biri en az bir kökene bağlı (Finding VEYA Domain Law §referansı) — orphan YOK
Slice toplam: 3 · her biri bir Decision'a bağlı — orphan YOK
Decision→Decision dependsOn referansları: tamamı OFFICE-OWNER-DECISIONS.md'nin kendi
  DEPENDENCIES alanından türetildi, ekleme/çıkarma yapılmadı
Yeni bulgu (§2b): 1 — Risk Register'ın 12'sine DAHİL DEĞİL, ayrı izleniyor, sayıya karışmıyor
```

## 7. Wave Önerisi

```text
WAVE 1 — Session/Lifecycle Safety              [P1, karar TAM kapalı]
  Kapsam: STF-PRD-SES-001 + STF-PRD-SES-002 (OD-14 + OD-15 CLOSED_CANONICAL)
  status: PARTIALLY DELIVERED (2026-07-14) — CANDIDATE-A CANONICAL, CANDIDATE-B DEFERRED
  SONUÇ: SES-001+SES-002 TEK slice ÜRETMEDİ — farklı implementationCategory'de 2 candidate:
    CANDIDATE-A (WIRING) → CANONICAL, main @ b0ce36db (PHASE 1 MILESTONE 02)
    CANDIDATE-B (NEW_SUBSYSTEM) → DEFERRED (2026-07-14, owner kararı — bkz. §4b), NOT_SELECTED,
      implementationAuthorization NONE — DEFERRED iptal DEĞİL, ayrı bir GO ile yeniden açılabilir
  Detay: §4 Slice Register + §4b

WAVE 2 — Authority/RBAC Consistency            [P2, karar TAM kapalı]
  Kapsam: STF-PRD-RBAC-001 (OD-05 + OD-09 CLOSED_CANONICAL; OD-08 de CLOSED_CANONICAL, 2026-07-16)
  status: PARTIALLY DELIVERED (2026-07-16) — CANDIDATE-C + CANDIDATE-E1 CANONICAL/CONSUMED,
    CANDIDATE-D hâlâ teslim edilmedi, CANDIDATE-E'nin kalan tam kapsamı hâlâ future/owner-gated.
    STF-PRD-RBAC-001 finding **OPEN/NOT CLOSED kalır** (şema temeli riskin davranışsal kısmını
    kapatmaz — bkz. OFFICE-RISK-REGISTER.md)
  SONUÇ: RBAC-001 TEK slice ÜRETMEDİ — 4 candidate (C/D/E→E1), 3 farklı disposition:
    CANDIDATE-C (HARDENING) → CANONICAL, main @ 038dbbb9 (PHASE 1 MILESTONE 03); "Canonical Actor
      Capacity Read Consolidation" davranış-nötr; eski EXTENSION/enforcement-mode SUPERSEDED,
      #503 observe-only invariant korundu. Contract RATIFIED_WITH_RECORDED_LIMITATIONS (4 CARRIED FORWARD)
    CANDIDATE-D → PRODUCT DECISION REQUIRED / NOT A SELECTABLE SLICE
    CANDIDATE-E (NEW_SUBSYSTEM) → DECOMPOSED (2026-07-16, blocker OFF/OD-08 CLOSED oldu ama tam
      kapsam tek Contract için çok büyük bulundu) → **CANDIDATE-E1** (additive-only şema temeli)
      → **CANONICAL/CONSUMED** (2026-07-16, main @ fa6851c0, PHASE 1 MILESTONE 06, PR #1312);
      kalan tam consumer-migration kapsamı AYRI, HENÜZ candidate olmayan future scope
  Detay: §4 Slice Register + §4c (teknik mekanizma detayı redakte — bkz. §4c gerekçe)

WAVE 3 — Privacy Revival (Sensitive Field Masking)  [P2, karar kapalı]
  Kapsam: SLICE-03 revival (OD-18 CLOSED_CANONICAL, STF-PRD-PRIV-001)
  status: CLOSED / COMPLETE WITH RECORDED RESIDUALS (owner closure decision 2026-07-16) — teslim edilen
    scope CANDIDATE-F1 + CANDIDATE-H1 CANONICAL/CONSUMED (MILESTONE 04/05); H VERIFICATION COMPLETE
    (H-AUDIT: NO IMPLEMENTATION REQUIRED). Kapanış TESLİMAT scope'unadır — bulgu remediation'ı DEĞİL.
  SONUÇ: SLICE-03 TEK slice ÜRETMEDİ — 4 candidate + 1 dormant not:
    CANDIDATE-F1 (HARDENING) → CANONICAL, main @ a170da3e (PHASE 1 MILESTONE 04); Personnel List
      Masked Default; mevcut masking REUSE; OFF/OD-18 yeterli. Contract RATIFIED_WITH_RECORDED_LIMITATIONS
      (accepted records CARRIED FORWARD: OFF-INV-10 PARTIAL, STF-PRD-PRIV-001 OPEN/NOT CLOSED)
    CANDIDATE-F2 → DORMANT (Personnel Export Masking — IMPLEMENTATION SURFACE NOT FOUND, owner disposition)
    CANDIDATE-G (NEW_SUBSYSTEM) → BLOCKED (Detail Masking + Field-Level Unmask Permission;
      blocker: FIELD-LEVEL UNMASK GOVERNANCE / MECHANISM UNRESOLVED)
    CANDIDATE-H → VERIFICATION COMPLETE (H-AUDIT: EVIDENCE COMPLETE/NO IMPLEMENTATION; H-READMODEL:
      EDIT-SAFE MASKING PATH → CANDIDATE-H1)
    CANDIDATE-H1 (HARDENING) → CANONICAL, main @ 29eb6384 (PHASE 1 MILESTONE 05); Case-Embedded
      Personnel Sensitive Field Edit-Safe Masking; read-model maskeli-varsayılan + edit-safe kontrat;
      binding update/read/UI contract + recorded limitations CARRIED FORWARD (OFF-INV-10 PARTIAL,
      STF-PRD-PRIV-001 OPEN/NOT CLOSED); evidence limitation (CI allowlist) kaydedildi; CANDIDATE-G AÇILMAZ
    DORMANT not: "leave/termination reason" masking — ŞEMA SURFACE'İ BULUNAMADI (slice değil)
  Detay: §4 Slice Register + §4d (teknik mekanizma detayı redakte — bkz. §4d gerekçe)
  WAVE 3 CLOSURE (owner decision 2026-07-16): CLOSED / COMPLETE WITH RECORDED RESIDUALS.
    Teslim edilen: F1 (list) + H1 (case-embedded read-model) mask-default CANONICAL/CONSUMED; H-AUDIT
    NO IMPLEMENTATION REQUIRED. ⚠️ Bu FINDING CLOSURE DEĞİLDİR — STF-PRD-PRIV-001 KAPANMAZ, OFF-INV-10 TAMAMLANMAZ.
    ACCEPTED RESIDUALS (carried forward):
      · CANDIDATE-F2 → DORMANT (Personnel Export Masking — surface not found; export yüzeyi belirirse reaktive)
      · CANDIDATE-G → BLOCKED / FUTURE WORKSTREAM (Detail Masking + Field-Level Unmask; field-level-unmask
        governance/mekanizma AYRI owner kararı gerektirir — WAVE 3 kapsamı dışı ileri workstream)
      · OFF-INV-10 → PARTIAL (list + read-model + audit done; detail + export pending)
      · STF-PRD-PRIV-001 → OPEN / CARRIED FORWARD (WAVE 3 closure bunu KAPATMAZ)
      · "leave/termination reason" masking → DORMANT / SURFACE NOT FOUND (slice değil)
    NEXT PROGRAM ACTION: OWNER SELECTION / OWNER DECISION REQUIRED (bkz. §8).

WAVE 4+ — Gated (henüz decision-tarafı kapanmadı)
  DATA-001 ← OD-03 OPEN · OPS-001 ← OD-19 OPEN · LIFE-001 ← OD-16 OPEN(non-blocking, teyit gerekir)

WAVE 4+ — BOLA-001/SCP-001 candidate-decomposition tamamlandı (2026-07-16); CANDIDATE-I1
  CANONICAL (2026-07-16/17)
  BOLA-001 (P1) + SCP-001 (P2) ← OD-08 CLOSED (2026-07-16, Access-Scope Owner Decision Package)
  → **CANDIDATE-I** (Object-Scope Evaluation Foundation) DECOMPOSED → **CANDIDATE-I1**
  (Team/Manager-Hiyerarşi additive-only şema temeli) **CANONICAL/CONSUMED** (2026-07-16/17, main
  @ `05e73579`, PHASE 1 MILESTONE 07, PR #1325). Kalan tam enforcement kapsamı AYRI, HENÜZ
  candidate ID'si olmayan, owner-gated future scope. STF-PRD-BOLA-001/SCP-001 finding'leri
  **OPEN/NOT CLOSED kalır** (şema temeli riskin davranışsal kısmını kapatmaz — bkz.
  OFFICE-RISK-REGISTER.md). Detay: §4 Slice Register + §4e.
  BOLA-002 (P3) ← OD-10 CLOSED (aynı paket) — candidate-decomposition tamamlandı (2026-07-17);
  CANDIDATE-J1 CANONICAL (2026-07-17). **CANDIDATE-J** (Task-atama, Task Assignment Eligibility Gate)
  DECOMPOSED → **CANDIDATE-J1** (Task Assignee Baseline Eligibility Gate — aynı-tenant + aktiflik,
  ileriye-dönük write-time enforcement, schema/migration YOK) **CANONICAL/CONSUMED** (2026-07-17,
  main @ `7210ea7c`, PHASE 1 MILESTONE 08, PR #1338). Kalan J rol/kapasite policy kapsamı + tüm
  **CANDIDATE-K** (Case ekip-atama yüzeyi) AYRI. BOLA-002 finding'i
  **OPEN/NOT CLOSED kalır** — J1 yalnız Task-atama alt-boşluğunun baseline'ını (aynı-tenant+aktiflik,
  ileriye-dönük) kapattı; ayrıca J1 rol/kapasite policy'sini de kapsamıyor (bkz. OFFICE-RISK-REGISTER.md).
  J1 **ilk davranış-DEĞİŞTİREN WAVE 4+ enforcement dilimidir** (E1/I1'in additive-only deseninden farklı).
  **CANDIDATE-K (Case-atama) DECOMPOSED (2026-07-17)** → **CANDIDATE-K1** (Case Team-Membership Baseline
  Eligibility Gate — ekip-ekleme aynı-tenant + aktiflik, ileriye-dönük write-time, schema/migration YOK,
  J1 kardeşi ama Lawyer/StaffMember modeli) **CANONICAL / IMPLEMENTED / MERGED** (main @ 423d72ea,
  PR #1356, PHASE 1 MILESTONE 09; implementationAuthorization CONSUMED) + **CANDIDATE-K2** (Bulk
  Case-Assignment — toplu-avukat yolu **ASSIGN-4d** ürün-kararına BLOKE; ASSIGN-4d DEFERRED, owner yanıtı
  bekliyor) + **CANDIDATE-K3** (Legal-Responsible Promotion Active Re-check — minor, owner-gated future).
  K1 yalnız Case ekip-ekleme baseline'ını ele aldı; K2/K3 + rol/kapasite policy açık kaldığı için
  **BOLA-002 KAPANMAZ (OPEN / PARTIALLY MITIGATED)**. Detay: §4 Slice Register + §4f.

UNMAPPED (owner review required, decision-graph dışı)
  STF-PRD-CFG-001, STF-PRD-PERF-001
```

## 8. NEXT ELIGIBLE UNIT (readiness ≠ authorization)

```text
NEXT ELIGIBLE UNIT: NONE (2026-07-17). CANDIDATE-K1 (Case Team-Membership Baseline Eligibility Gate)
IMPLEMENTED / MERGED / CANONICAL edildi (main @ 423d72ea, PR #1356, PHASE 1 MILESTONE 09);
implementationAuthorization CONSUMED, contractStatus CONSUMED. Bu Implementation Closure yeni bir
GO-IMPLEMENT yetkisi VERMEZ ve yeni bir candidate SEÇMEZ. K1, J1'in davranış-değiştiren enforcement
kardeşiydi (farklı model: Lawyer/StaffMember); yalnız Case ekip-ekleme baseline'ını (aynı-tenant +
aktiflik, ileriye-dönük write-time) ele aldı. STF-PRD-BOLA-002 finding'i **OPEN / PARTIALLY MITIGATED
kalır** — K2 (toplu atama, ASSIGN-4d'ye bağlı) + K3 (legal-sorumlu terfi re-check) + CANDIDATE-J/K
rol/kapasite policy açık; finding KAPANMADI (bkz. §2/§7 + OFFICE-RISK-REGISTER.md). Önceki CANONICAL
slice'lar (A/C/F1/H1/E1/I1/J1) + şimdi K1 değişmedi.

FAZ-STATÜ KAYDI (owner ratification 2026-07-17/18; decision-log kayıtları: "OFFICE PHASE 1 CLOSURE
WITH RECORDED RESIDUALS — OWNER RATIFIED" + "OFFICE PHASE 2 CONSTITUTIONAL FOUNDATION OWNER
TEXT-RATIFICATION" + "TUR 2 CANONICAL EVIDENCE RECONCILIATION DISPOSITION" + "OFFICE PHASE 2
CONSTITUTIONAL DECOMPOSITION RATIFICATION"):
  PHASE 1                    : CLOSED / COMPLETE WITH RECORDED RESIDUALS (MILESTONE 01–09; §5 kaydı)
  PHASE 2 FOUNDATION         : RATIFIED / CANONICAL (4 belge, farklı authority rolleri —
                               OFFICE-PHASE2-{CONSTITUTION,MASTER-SYNTHESIS,PROGRAM-CHARTER,ROADMAP}.md)
  TUR 2 RECONCILIATION       : COMPLETE / CANONICAL EVIDENCE DISPOSITION (NON-NORMATIVE; kanıt
                               `OFFICE-PHASE2-MASTER-SYNTHESIS.md §5a`; finding/ID/karar/yetki ÜRETMEZ)
  PHASE 2 DECOMPOSITION      : COMPLETE / CANONICAL REFERENCE (blueprint
                               `OFFICE-PHASE2-DECOMPOSITION.md`, NON-NORMATIVE / NON-AUTHORIZING;
                               6 capability-bearing + 2 cross-cutting increment, 5 önerilen Wave)
  PROPOSED WAVE ARCHITECTURE : RECORDED / NONE SELECTED
  CURRENT SELECTED WAVE      : NONE
  CURRENT SELECTED DELIVERY UNIT: NONE
  IMPLEMENTATION AUTHORIZATION: NONE
  NEXT OWNER-GATED UNIT      : Phase 2 First-Unit Selection (ayrı owner kararı gerektirir; bu belge
                               ve decomposition blueprint hiçbir Wave/unit SEÇMEZ/BAŞLATMAZ/SIRALAMAZ)

NEXT PROGRAM ACTION: OWNER SELECTION/DECISION REQUIRED — implementasyona hazır, owner-seçili bekleyen
birim YOK; geriye kalan candidate'ların TÜMÜ hâlâ owner-gated; bu belge hiçbirini SEÇMEZ/başlatmaz/
sıralamaz, her biri owner'ın ayrı, açık bir GO/decision'ını bekler:
  · CANDIDATE-D (WAVE 2) — product decision (canApproveFinance ürün niyeti) gerekir · NOT_A_SELECTABLE_SLICE
  · CANDIDATE-E kalan kapsamı (WAVE 2) — tam consumer-migration, HENÜZ candidate ID'si yok, owner-gated future scope
  · CANDIDATE-F2 (WAVE 3) — DORMANT (IMPLEMENTATION SURFACE NOT FOUND, owner disposition)
  · CANDIDATE-G (WAVE 3) — field-level unmask governance/mechanism çözülmeli (olası ek owner decision) · BLOCKED · bu slice (H1) onu AÇMAZ
  · CANDIDATE-B (WAVE 1) — DEFERRED, ayrı owner GO ile yeniden açılabilir
  · CANDIDATE-I kalan kapsamı (WAVE 4+) — tam object-scope enforcement, HENÜZ candidate ID'si yok, owner-gated future scope
  · CANDIDATE-J kalan kapsamı (WAVE 4+) — rol/kapasite uygunluk policy'si, HENÜZ candidate ID'si yok, owner-gated future scope
  · CANDIDATE-K2 (WAVE 4+) — Bulk Case-Assignment, **ASSIGN-4d** ürün-kararına BLOKE (DEFERRED, owner yanıtı bekliyor); K2a toplu-personel aktiflik-kontrolü ürün-kararından bağımsız ama legacy alan dokunur
  · CANDIDATE-K3 (WAVE 4+) — Legal-Responsible Promotion Active Re-check, minor/edge, owner-gated future scope

status (CANDIDATE-A)                      : CANONICAL (2026-07-14, main @ b0ce36db)
ownerSelectionStatus (CANDIDATE-A)        : SELECTED (2026-07-14)
contractStatus (CANDIDATE-A)              : RATIFIED (2026-07-14, WITH RECORDED LIMITATIONS)
implementationAuthorization (CANDIDATE-A) : CONSUMED (2026-07-14) — PR #1239, squash `b0ce36db`
status (CANDIDATE-B)                      : DEFERRED (2026-07-14) — bkz. §4b OWNER DISPOSITION
ownerSelectionStatus (CANDIDATE-B)        : NOT_SELECTED (değişmedi)
contractStatus (CANDIDATE-B)              : NOT_DRAFTED (değişmedi)
implementationAuthorization (CANDIDATE-B) : NONE (değişmedi)
name (CANDIDATE-C)                        : Canonical Actor Capacity Read Consolidation
status (CANDIDATE-C)                      : CANONICAL (2026-07-15, main @ 038dbbb9) — PHASE 1 MILESTONE 03
implementationCategory (CANDIDATE-C)      : HARDENING
ownerSelectionStatus (CANDIDATE-C)        : SELECTED (2026-07-14)
contractStatus (CANDIDATE-C)              : RATIFIED_WITH_RECORDED_LIMITATIONS (2026-07-14) — 4 CARRIED FORWARD, bkz. §4c
implementationAuthorization (CANDIDATE-C) : CONSUMED (2026-07-15) — PR #1255, squash `038dbbb9`, CI 4/4 PASS
ownerSelectionStatus (CANDIDATE-D)        : NOT_A_SELECTABLE_SLICE (2026-07-14) — PRODUCT
                                             DECISION REQUIRED
status (CANDIDATE-E)                      : DECOMPOSED (2026-07-16) — bu satırın kendisi hiç
                                             seçilmedi, bkz. CANDIDATE-E1
readinessStatus (CANDIDATE-E)             : NOT_READY (kalan tam kapsam, henüz candidate değil)
ownerSelectionStatus (CANDIDATE-E)        : NOT_SELECTED
implementationAuthorization (CANDIDATE-E) : NONE
contractStatus (CANDIDATE-E)              : — (bkz. CANDIDATE-E1)
name (CANDIDATE-E1)                       : PermissionGrant/SystemRole Schema Foundation (WAVE 2,
                                             CANDIDATE-E first-slice re-scope)
status (CANDIDATE-E1)                     : CANONICAL (2026-07-16, main @ fa6851c0) — PHASE 1 MILESTONE 06
implementationCategory (CANDIDATE-E1)     : NEW_SUBSYSTEM
ownerSelectionStatus (CANDIDATE-E1)       : SELECTED (2026-07-16)
contractStatus (CANDIDATE-E1)             : RATIFIED (2026-07-16) — Contract Draft (PR #1308)
                                             uyumlu implementasyonla (PR #1312) uzlaştırıldı, bkz. §4c
implementationAuthorization (CANDIDATE-E1): CONSUMED (2026-07-16) — PR #1312, squash `fa6851c0`, CI 4/4 PASS
name (CANDIDATE-F1)                       : Personnel List Masked Default (WAVE 3, SLICE-03 decomp)
status (CANDIDATE-F1)                     : CANONICAL (2026-07-15, main @ a170da3e) — PHASE 1 MILESTONE 04
implementationCategory (CANDIDATE-F1)     : HARDENING
ownerSelectionStatus (CANDIDATE-F1)       : SELECTED (2026-07-15)
contractStatus (CANDIDATE-F1)             : RATIFIED_WITH_RECORDED_LIMITATIONS (2026-07-15) — accepted records CARRIED FORWARD, bkz. §4d
implementationAuthorization (CANDIDATE-F1): CONSUMED (2026-07-15) — PR #1270, squash `a170da3e`, CI 4/4 PASS
status (CANDIDATE-F2)                     : DORMANT — IMPLEMENTATION SURFACE NOT FOUND (owner disposition)
status (CANDIDATE-G)                      : BLOCKED — FIELD-LEVEL UNMASK GOVERNANCE / MECHANISM UNRESOLVED
                                             (implementationCategory NEW_SUBSYSTEM)
status (CANDIDATE-H)                      : VERIFICATION COMPLETE (2026-07-15) — H-AUDIT evidence-complete/no-impl; H-READMODEL edit-safe path → CANDIDATE-H1
name (CANDIDATE-H1)                       : Case-Embedded Personnel Sensitive Field Edit-Safe Masking (WAVE 3)
status (CANDIDATE-H1)                     : CANONICAL (2026-07-15, main @ 29eb6384) — PHASE 1 MILESTONE 05
implementationCategory (CANDIDATE-H1)     : HARDENING
ownerSelectionStatus (CANDIDATE-H1)       : SELECTED (2026-07-15)
contractStatus (CANDIDATE-H1)             : RATIFIED_WITH_RECORDED_LIMITATIONS (2026-07-15) — binding contract + recorded limitations CARRIED FORWARD (OFF-INV-10 PARTIAL, STF-PRD-PRIV-001 OPEN/NOT CLOSED), bkz. §4d
implementationAuthorization (CANDIDATE-H1): CONSUMED (2026-07-15) — PR #1283, squash `29eb6384`, CI 4/4 PASS · evidence limitation (CI allowlist) §4d
status (CANDIDATE-I)                      : DECOMPOSED (2026-07-16) — bu satırın kendisi hiç
                                             seçilmedi, bkz. CANDIDATE-I1
readinessStatus (CANDIDATE-I)             : NOT_READY (kalan tam kapsam, henüz candidate değil)
ownerSelectionStatus (CANDIDATE-I)        : NOT_SELECTED
implementationAuthorization (CANDIDATE-I) : NONE
contractStatus (CANDIDATE-I)              : — (bkz. CANDIDATE-I1)
name (CANDIDATE-I1)                       : Team/Manager-Hiyerarşi Additive Schema Foundation
                                             (WAVE 4+, CANDIDATE-I first-slice re-scope)
status (CANDIDATE-I1)                     : CANONICAL (2026-07-16/17, main @ 05e73579) — PHASE 1 MILESTONE 07
implementationCategory (CANDIDATE-I1)     : NEW_SUBSYSTEM
ownerSelectionStatus (CANDIDATE-I1)       : SELECTED (2026-07-16)
contractStatus (CANDIDATE-I1)             : RATIFIED (2026-07-16) — Contract Draft başarılı
                                             implementasyonla uzlaştırıldı, bkz. §4e
implementationAuthorization (CANDIDATE-I1): CONSUMED (2026-07-16/17) — PR #1325, squash `05e73579`, CI 4/4 PASS
status (CANDIDATE-J)                      : DECOMPOSED (2026-07-17) — bu satırın kendisi hiç
                                             seçilmedi, bkz. CANDIDATE-J1
readinessStatus (CANDIDATE-J)             : NOT_READY (kalan rol/kapasite policy kapsamı, henüz candidate değil)
ownerSelectionStatus (CANDIDATE-J)        : NOT_SELECTED
implementationAuthorization (CANDIDATE-J) : NONE
contractStatus (CANDIDATE-J)              : — (bkz. CANDIDATE-J1)
name (CANDIDATE-J1)                       : Task Assignee Baseline Eligibility Gate
                                             (WAVE 4+, CANDIDATE-J first-slice re-scope)
status (CANDIDATE-J1)                     : CANONICAL (2026-07-17, main @ 7210ea7c) — PHASE 1 MILESTONE 08
implementationCategory (CANDIDATE-J1)     : HARDENING
ownerSelectionStatus (CANDIDATE-J1)       : SELECTED (2026-07-17)
contractStatus (CANDIDATE-J1)             : RATIFIED (2026-07-17) — Contract Draft başarılı
                                             implementasyonla uzlaştırıldı, bkz. §4f
implementationAuthorization (CANDIDATE-J1): CONSUMED (2026-07-17) — PR #1338, squash `7210ea7c`, CI 4/4 PASS
status (CANDIDATE-K)                      : DECOMPOSED (2026-07-17) — bu satırın kendisi hiç
                                             seçilmedi, bkz. CANDIDATE-K1
readinessStatus (CANDIDATE-K)             : NOT_READY (kalan K2/K3 kapsamı)
ownerSelectionStatus (CANDIDATE-K)        : NOT_SELECTED
implementationAuthorization (CANDIDATE-K) : NONE
contractStatus (CANDIDATE-K)              : — (bkz. CANDIDATE-K1)
name (CANDIDATE-K1)                       : Case Team-Membership Baseline Eligibility Gate
                                             (WAVE 4+, CANDIDATE-K first-slice re-scope)
status (CANDIDATE-K1)                     : CANONICAL (2026-07-17, main @ 423d72ea) — PHASE 1 MILESTONE 09
implementationCategory (CANDIDATE-K1)     : HARDENING
ownerSelectionStatus (CANDIDATE-K1)       : SELECTED (2026-07-17)
contractStatus (CANDIDATE-K1)             : CONSUMED (2026-07-17) — Contract Draft başarılı
                                             implementasyonla uzlaştırıldı/tüketildi, bkz. §4f
implementationAuthorization (CANDIDATE-K1): CONSUMED (2026-07-17) — PR #1356, squash `423d72ea`, CI 4/4 PASS
status (CANDIDATE-K2)                     : BLOCKED_ON_PRODUCT_DECISION (2026-07-17) — Bulk
                                             Case-Assignment; toplu-avukat yolu ASSIGN-4d'ye bağlı
                                             (DEFERRED); K2a toplu-personel aktiflik ürün-kararsız
status (CANDIDATE-K3)                     : DEFERRED (2026-07-17) — Legal-Responsible Promotion
                                             Active Re-check; minor/edge, owner-gated future
ASSIGN-4d                                 : DEFERRED (2026-07-17) — owner seçimi yapılmadı; yalnız
                                             K2b'yi etkiler, K1'i bloke etmez
```
```text
NEXT ELIGIBLE ≠ AUTHORIZED.
CANDIDATE-A/C/F1/H1/E1 CANONICAL/CONSUMED'dur (implementationAuthorization GO_IMPLEMENT_ISSUED →
CONSUMED'a vardı; aynı slice için tekrar implementasyon açılmaz). **Güncelleme (2026-07-16,
CANDIDATE-E1 Implementation Closure):** Owner RATIFICATION + GO-IMPLEMENT verdi (Contract Draft,
PR #1308'de canonical), implementasyon Contract'ın tüm invariant/stop-condition'larına tam uyumlu
tamamlandı (additive-only migration, sıfır consumer, sıfır davranış değişikliği, backfill yok,
951 regresyon PASS) ve PR #1312 ile main'e merge edildi (squash `fa6851c0`, CI 4/4 PASS). Bu
canonicalization: **status (CANDIDATE-E1) → CANONICAL** (PHASE 1 MILESTONE 06) ·
**contractStatus → RATIFIED** (Contract Draft başarılı implementasyonla uzlaştırıldı) ·
**implementationAuthorization → CONSUMED** — yeni bir implementasyon yetkisi ÜRETİLMEDİ, yalnız
tamamlanan işin kaydı. **STF-PRD-RBAC-001 finding OPEN/NOT CLOSED KORUNUR** — şema temeli riskin
davranışsal/enforcement kısmını kapatmaz (bkz. §2 + OFFICE-RISK-REGISTER.md); bu bir finding
closure DEĞİLDİR. CANDIDATE-E'nin kendi satırı (kalan tam consumer-migration kapsamı)
DECOMPOSED/NOT_SELECTED kalır — henüz kendi candidate ID'si yok, owner-gated future scope,
BU CANONICALIZATION'LA DEĞİŞMEDİ. OFF/OD-06 (FoundingLawyer) ve BOLA-001/SCP-001/BOLA-002 bu
canonicalization'ın KAPSAMI DIŞINDA bırakıldı (owner BOUNDARY), hiçbiri değişmedi/seçilmedi.
Geriye kalan diğer candidate'lar hâlâ owner-gated (CANDIDATE-B DEFERRED ·
D PRODUCT_DECISION/NOT_A_SELECTABLE_SLICE · G BLOCKED · F2 DORMANT) — hiçbiri bu
canonicalization'la değişmedi. **NEXT ELIGIBLE UNIT yeniden NONE'a döndü** — WAVE 1-3'te
CANONICAL olarak teslim edilmiş başka bir slice yok; NEXT PROGRAM ACTION = OWNER SELECTION/
DECISION REQUIRED (bkz. §8 üst blok). Bu canonicalization CANDIDATE-E1'in IMPLEMENTED/MERGED/
CANONICAL/CONSUMED durumunu + STF-PRD-RBAC-001'in OPEN/NOT CLOSED kalan finding verdict'ini
kaydeder; kod/schema/migration/yeni candidate seçimi başlatmaz.

**Güncelleme (2026-07-16, CANDIDATE-I1 Contract Ratification):** Owner WAVE 4+ GO-ANALYZE'ı
(BOLA-001/SCP-001/BOLA-002 candidate decomposition) + CANDIDATE-I first-slice re-scope + Contract
Draft üretimi sırasıyla verdi, ardından Implementation Contract Draft'ı (kapsam, invariants,
acceptance criteria, stop conditions ile) **RATIFIED** ilan etti. **CANDIDATE-I** DECOMPOSED
edildi (tam object-scope enforcement kapsamı tek Contract için çok büyük bulundu — CANDIDATE-C/E
emsaliyle aynı desen) → **CANDIDATE-I1** (Team/Manager-Hiyerarşi additive-only şema temeli)
SEÇİLDİ ve Contract **RATIFIED** olarak kaydedildi. **implementationAuthorization (CANDIDATE-I1)
NONE KORUNUR** — bu canonicalization GO-IMPLEMENT vermez, owner'ın ayrı, açık bir GO'sunu bekler.
**STF-PRD-BOLA-001/SCP-001** CANDIDATE-I ile mapping yapıldı (bkz. §2/§7) — **finding'ler
KAPANMADI**, tam object-scope enforcement ayrı, sonraki bir Contract'tır. **CANDIDATE-E1 model
çakışması kontrolü: YOK** — E1'in izin-kaydı şeması ile CANDIDATE-I1'in hiyerarşi kaydı
tamamlayıcı katmanlar, isim çakışması sıfır, duplicate authority riski yok (taze doğrulandı).
**Backfill: KESİN OLARAK YOK/UYGULANAMAZ** — kaynak veri yok. STF-PRD-BOLA-002, CANDIDATE-J/K ve
diğer OFFICE hatları (CANDIDATE-B/D/E kalan kapsamı/F2/G) bu canonicalization'ın KAPSAMI DIŞINDA
bırakıldı (owner BOUNDARY), hiçbiri değişmedi/seçilmedi. **NEXT ELIGIBLE UNIT → CANDIDATE-I1 —
GO-IMPLEMENT.** Bu canonicalization CANDIDATE-I'nın decomposition'ını + CANDIDATE-I1'in Contract
Draft RATIFIED durumunu + BOLA-001/SCP-001'in candidate-mapping kaydını kaydeder; kod/schema/
migration/implementasyon başlatmaz.

**Güncelleme (2026-07-16/17, CANDIDATE-I1 Implementation Closure):** Owner IMPLEMENTATION
EVIDENCE'ı (PR #1325 MERGED, squash SHA `05e73579f295615db8a0f3f3ff5816caa958acd5`, CI 4/4 PASS,
additive-only schema/migration, zero consumer, backfill NONE, runtime/enforcement change NONE)
sundu ve **GO-CANONICALIZE — DOCS ONLY** verdi. İmplementasyon Contract'ın tüm invariant/
stop-condition'larına tam uyumlu tamamlandı (additive-only migration — yalnız CREATE TABLE + 3
CREATE INDEX, sıfır ALTER/DROP; sıfır tüketici grep-doğrulandı; 1722 regresyon PASS + 2
pre-existing/ilgisiz hata differential testle bağımsız kanıtlandı; tsc çıktısı özdeş; rollback
provası temiz) ve main'e merge edildi. Bu canonicalization: **status (CANDIDATE-I1) → CANONICAL**
(PHASE 1 MILESTONE 07) · **contractStatus → RATIFIED** (Contract Draft başarılı implementasyonla
uzlaştırıldı) · **implementationAuthorization → CONSUMED** — yeni bir implementasyon yetkisi
ÜRETİLMEDİ, yalnız tamamlanan işin kaydı. **STF-PRD-BOLA-001/SCP-001 finding'leri OPEN/NOT CLOSED
KORUNUR** — şema temeli (`ReportingLine`) finding'lerin davranışsal/enforcement kısmını kapatmaz
(bkz. §2 + OFFICE-RISK-REGISTER.md); bu bir finding closure DEĞİLDİR. CANDIDATE-I'nın kendi satırı
(kalan tam object-scope enforcement kapsamı) DECOMPOSED/NOT_SELECTED kalır — henüz kendi candidate
ID'si yok, owner-gated future scope, BU CANONICALIZATION'LA DEĞİŞMEDİ. STF-PRD-BOLA-002 ve
CANDIDATE-J/K bu canonicalization'ın KAPSAMI DIŞINDA bırakıldı (owner BOUNDARY), hiçbiri
değişmedi/seçilmedi. Geriye kalan diğer candidate'lar hâlâ owner-gated (CANDIDATE-B DEFERRED ·
D PRODUCT_DECISION/NOT_A_SELECTABLE_SLICE · G BLOCKED · F2 DORMANT · CANDIDATE-E kalan kapsamı) —
hiçbiri bu canonicalization'la değişmedi. **NEXT ELIGIBLE UNIT yeniden NONE'a döndü** — WAVE
1-4+'te CANONICAL olarak teslim edilmiş başka bir slice yok; NEXT PROGRAM ACTION = OWNER SELECTION/
DECISION REQUIRED (bkz. §8 üst blok). Bu canonicalization CANDIDATE-I1'in IMPLEMENTED/MERGED/
CANONICAL/CONSUMED durumunu + STF-PRD-BOLA-001/SCP-001'in OPEN/NOT CLOSED kalan finding
verdict'ini kaydeder; kod/schema/migration/yeni candidate seçimi başlatmaz.

**Güncelleme (2026-07-17, CANDIDATE-J1 Contract Ratification):** Owner "CANDIDATE-J/K Next Slice
Selection" GO-ANALYZE'ı verdi (STF-PRD-BOLA-002 — OD-10 Access-Scope Owner Decision Package'da
decision-tarafı kapanmıştı). Taze kod-yüzeyi doğrulaması (HEAD `2487d52b`): CANDIDATE-J (Task-atama)
neredeyse tamamen guard'sız (tenant bile kontrol edilmiyor), küçük blast radius; CANDIDATE-K
(Case-atama) tenant-kontrollü ama aktiflik-kontrolsüz, çok daha büyük blast radius + kod-doğrulanmış
retroaktif-enforcement backward-compat gerilimi + kısmi ürün-kararı bağımlılığı. **CANDIDATE-J**
"dar ve güvenli" ölçütünün net karşılığı olarak önerildi ve owner tarafından SEÇİLDİ, ardından
ilk davranış-değiştiren enforcement dilimi için gereğinden geniş bulunduğundan DECOMPOSED edildi
(CANDIDATE-C/E/I emsaliyle aynı desen) → **CANDIDATE-J1** (Task Assignee Baseline Eligibility Gate —
aynı-tenant + aktiflik, ileriye-dönük write-time enforcement, schema/migration YOK) SEÇİLDİ ve
Contract **RATIFIED** olarak kaydedildi. **implementationAuthorization (CANDIDATE-J1) NONE KORUNUR** —
bu canonicalization GO-IMPLEMENT vermez, owner'ın ayrı, açık bir GO'sunu bekler. **STF-PRD-BOLA-002**
CANDIDATE-J (+ gelecekteki CANDIDATE-K) ile mapping yapıldı (bkz. §2/§7) — **finding KAPANMADI**;
J1 yalnız Task-atama baseline'ını ele alacak. J1, **WAVE 4+'te ilk davranış-DEĞİŞTİREN enforcement
dilimidir** (E1/I1'in additive-only/sıfır-davranış deseninden AÇIKÇA farklı — owner bunu bilerek
seçti). **Backfill: UYGULANMAZ** — enforcement dilimi, veri-taşıma değil; ileriye-dönük tasarım
mevcut satırlara dokunmaz. Rol/kapasite uygunluk policy'si (owner POLICY kararı — eşik icat edilmez),
UI filtreleme, retroaktif enforcement ve tüm CANDIDATE-K bu canonicalization'ın KAPSAMI DIŞINDA
bırakıldı (owner BOUNDARY). Diğer OFFICE hatları (CANDIDATE-B/D/E-kalan/F2/G, CANDIDATE-I-kalan,
BOLA-001/SCP-001) değişmedi/seçilmedi. **NEXT ELIGIBLE UNIT → CANDIDATE-J1 — GO-IMPLEMENT.** Bu
canonicalization CANDIDATE-J'nin decomposition'ını + CANDIDATE-J1'in Contract RATIFIED durumunu +
BOLA-002'nin candidate-mapping kaydını kaydeder; kod/schema/migration/implementasyon başlatmaz.

**Güncelleme (2026-07-17, CANDIDATE-J1 Implementation Closure):** Owner IMPLEMENTATION EVIDENCE'ı
(PR #1338 MERGED, squash SHA `7210ea7c`, CI 4/4 PASS, schema/migration NONE, forward-only enforcement,
differential regression doğrulandı) sundu ve **GO-CANONICALIZE — DOCS ONLY** verdi. İmplementasyon
Contract'ın tüm invariant/stop-condition'larına tam uyumlu tamamlandı (yalnız 2 dosya — görev servisi
+ testi; mevcut yazma yolunun içine tek bir tenant+aktiflik doğrulaması, User modeli için mevcut
tekil-sorumlu kapısının kalıbı, yeni framework değil; 4 zorunlu senaryo + update kapsamı; 1873
regresyon PASS + 2 pre-existing/ilgisiz hata differential testle bağımsız kanıtlandı; tsc çıktısı
özdeş) ve main'e merge edildi. Bu canonicalization: **status (CANDIDATE-J1) → CANONICAL** (PHASE 1
MILESTONE 08) · **contractStatus → RATIFIED** (Contract Draft başarılı implementasyonla uzlaştırıldı)
· **implementationAuthorization → CONSUMED** — yeni bir implementasyon yetkisi ÜRETİLMEDİ, yalnız
tamamlanan işin kaydı. **STF-PRD-BOLA-002 finding'i OPEN/NOT CLOSED KORUNUR** — J1 yalnız Task-atama
alt-boşluğunun baseline'ını (aynı-tenant+aktiflik, ileriye-dönük) kapattı; bulgunun Case-atama
porsiyonu (CANDIDATE-K) hâlâ açık, ayrıca J1 rol/kapasite policy'sini de kapsamıyor (bkz. §2 +
OFFICE-RISK-REGISTER.md); bu bir finding closure DEĞİLDİR. **NOT (merge devri):** PR #1338 owner'ın
kendi hesabıyla squash-merge edildi (paralel oturum; ajan gh config-file kilidi nedeniyle merge
edemeden owner tamamladı) — repository-authority çelişkisi DEĞİL, yalnız operasyonel merge devri;
squash SHA ve içerik `git show origin/main` ile bağımsız doğrulandı. CANDIDATE-J'nin kalan rol/kapasite
policy kapsamı DECOMPOSED/NOT_SELECTED, CANDIDATE-K NOT_SELECTED kalır — owner-gated future scope, BU
CANONICALIZATION'LA DEĞİŞMEDİ. Geriye kalan diğer candidate'lar hâlâ owner-gated (B DEFERRED · D
PRODUCT_DECISION · G BLOCKED · F2 DORMANT · E/I kalan kapsamı) — hiçbiri değişmedi. **NEXT ELIGIBLE
UNIT yeniden NONE'a döndü** — WAVE 1-4+'te CANONICAL olarak teslim edilmiş başka bir slice yok; NEXT
PROGRAM ACTION = OWNER SELECTION/DECISION REQUIRED (bkz. §8 üst blok). Bu canonicalization CANDIDATE-J1'in
IMPLEMENTED/MERGED/CANONICAL/CONSUMED durumunu + STF-PRD-BOLA-002'nin OPEN/NOT CLOSED kalan finding
verdict'ini kaydeder; kod/schema/migration/yeni candidate seçimi başlatmaz.

**Güncelleme (2026-07-17, CANDIDATE-K1 Contract Ratification):** Owner "CANDIDATE-K Re-scope"
GO-ANALYZE'ı verdi; case-assignment yüzeyi ayrık alt-yüzeylere ayrıştırıldı (ekip-ekleme tenant-
kontrollü/aktiflik-yok · tekil sorumlu alanı zaten kapalı · toplu atama avukat-yolu devre dışı ·
legal-sorumlu terfi aktiflik-recheck-yok). **CANDIDATE-K** DECOMPOSED edildi (C/E/I/J re-scope
emsaliyle aynı desen) → **CANDIDATE-K1** (Case Team-Membership Baseline Eligibility Gate — ekip-
ekleme aynı-tenant + aktiflik, ileriye-dönük write-time, schema/migration YOK; J1'in davranış-
değiştiren enforcement kardeşi ama Lawyer/StaffMember modeli) SEÇİLDİ ve Contract **RATIFIED**
olarak kaydedildi. **GOVERNANCE-PRECISE ayrım kanonikleştirildi:** ekip-üyesi uygunluğu = tenant +
aktiflik YALNIZCA (sorumlu-uygunluk bayrağı DEĞİL); mevcut sorumlu-doğrulayıcı literal yeniden
kullanılmaz (duplicate framework yok). **implementationAuthorization (CANDIDATE-K1) NONE KORUNUR** —
bu canonicalization GO-IMPLEMENT vermez. **STF-PRD-BOLA-002** CANDIDATE-K1 ile mapping yapıldı
(bkz. §2/§7) — **finding KAPANMADI**; K1 yalnız Case ekip-ekleme baseline'ını ele alacak. **K2**
(Bulk Case-Assignment) toplu-avukat yolu için **ASSIGN-4d** ürün-kararına BLOKE (**ASSIGN-4d bu
görevde DEFERRED — owner seçimi yapılmadı, yalnız K2b'yi etkiler, K1'i bloke etmez**); K2a toplu-
personel aktiflik-kontrolü ürün-kararından bağımsız ama legacy alan dokunur. **K3** (Legal-
Responsible Promotion Active Re-check) minor/edge, owner-gated future scope olarak kaydedildi.
Diğer OFFICE hatları (CANDIDATE-B/D/E-kalan/F2/G/I-kalan/J-kalan, BOLA-001/SCP-001) değişmedi/
seçilmedi. **NEXT ELIGIBLE UNIT → CANDIDATE-K1 — GO-IMPLEMENT.** Bu canonicalization CANDIDATE-K'nin
decomposition'ını + CANDIDATE-K1'in Contract RATIFIED durumunu + K2/K3/ASSIGN-4d kayıtlarını +
BOLA-002'nin K1-mapping'ini kaydeder; kod/schema/migration/implementasyon başlatmaz.

**Güncelleme (2026-07-17, CANDIDATE-K1 Implementation Closure):** Owner IMPLEMENTATION EVIDENCE'ı
(PR #1356 MERGED, squash SHA `423d72ea`, CI 4/4 PASS, schema/migration NONE, forward-only enforcement,
differential regression doğrulandı) sundu ve **GO-CANONICALIZE — DOCS ONLY** verdi. İmplementasyon
Contract'ın tüm invariant/stop-condition'larına tam uyumlu tamamlandı: mevcut ekip-ekleme yazma
yollarının (dosya ekibine avukat + personel ekleme) içine, hedefin NotFound (tenant-scope) kontrolünden
hemen sonra tek bir **aktiflik** doğrulaması eklendi; ekip-üyesi uygunluğu **tenant + aktiflik YALNIZCA**
(sorumlu-uygunluk bayrağı DEĞİL — o yalnız "dosya sorumlusu" alanına özgü, dokunulmadı); yeni framework
değil; yalnız ileriye-dönük (write-time), mevcut satırlar retroaktif taranmaz/değiştirilmez. Yeni
pozitif/negatif enforcement testleri (avukat + personel: aktif→kabul / pasif→ret / cross-tenant→mevcut
NotFound ret); 1780 regresyon PASS + 2 pre-existing/ilgisiz hata differential testle bağımsız
kanıtlandı; tsc çıktısı değişiklikle/değişiklik olmadan birebir özdeş. **Gate-öncesi yazılmış 4 mevcut
ekip-testinin mock'una `aktiflik=true` eklendi** — yeni kapının gerektirdiği alan bu mock'larda eksikti;
meşru mock-tamamlama, davranış regresyonu DEĞİL (şeffaf raporlandı). Mevcut tenant + rank-default +
legal-sorumlu guard'ları korundu. Bu canonicalization: **status (CANDIDATE-K1) → CANONICAL** (PHASE 1
MILESTONE 09) · **contractStatus → CONSUMED** (Contract Draft başarılı implementasyonla uzlaştırıldı/
tüketildi) · **implementationAuthorization → CONSUMED** — yeni bir implementasyon yetkisi ÜRETİLMEDİ,
yalnız tamamlanan işin kaydı. **STF-PRD-BOLA-002 finding'i OPEN / PARTIALLY MITIGATED KORUNUR** — K1
yalnız Case ekip-ekleme alt-boşluğunun baseline'ını (aynı-tenant + aktiflik, ileriye-dönük) kapattı;
**K2** (toplu atama, ASSIGN-4d'ye bağlı) + **K3** (legal-sorumlu terfi re-check) + CANDIDATE-J/K
rol/kapasite policy hâlâ açık (bkz. §2/§7 + OFFICE-RISK-REGISTER.md); bu bir finding closure DEĞİLDİR.
Geriye kalan CANDIDATE-K kapsamı (K2 BLOCKED_ON_PRODUCT_DECISION · K3 DEFERRED) + diğer OFFICE hatları
(B DEFERRED · D PRODUCT_DECISION · G BLOCKED · F2 DORMANT · E/I/J kalan kapsamı) owner-gated future
scope — BU CANONICALIZATION'LA DEĞİŞMEDİ. **NEXT ELIGIBLE UNIT yeniden NONE'a döndü** — WAVE 1-4+'te
implementasyona hazır, owner-seçili bekleyen başka slice yok; NEXT PROGRAM ACTION = OWNER SELECTION/
DECISION REQUIRED (bkz. §8 üst blok). Bu canonicalization CANDIDATE-K1'in IMPLEMENTED/MERGED/CANONICAL/
CONSUMED durumunu + STF-PRD-BOLA-002'nin OPEN/PARTIALLY MITIGATED kalan finding verdict'ini kaydeder;
kod/schema/migration/yeni candidate seçimi başlatmaz.
```

## 9. Document Self-Check

```text
- WAVE varlığı eklendi:                                YES
- Milestone yalnız CANONICAL slice'tan türetildi:      YES (yalnız SLICE-02)
- readinessStatus/ownerSelectionStatus/                YES (SLICE §4'te ayrı alanlar)
  implementationAuthorization ayrı alanlar:
- Decision 3 eksene ayrıldı:                           YES (§3)
- Dependency tipli + HARD/SOFT:                        Kayıtlı ama bu sürümde tüm mevcut
                                                        edge'ler REQUIRES/IMPLEMENTS/RESOLVES
                                                        tipinde ve HARD (OFF/OD'nin kendi
                                                        DEPENDENCIES alanı hiçbir SOFT ayrımı
                                                        yapmıyor) — SOFT örnek yok, icat edilmedi
- 12/12 Finding disposition aldı:                      YES
- 20/20 Decision işlendi:                              YES
- 3/3 mevcut Slice işlendi:                             YES
- Wave 1/2 kendisi NEXT_ELIGIBLE OLARAK işaretlenmedi:  YES (WAVE 1: CANDIDATE DECOMPOSITION
                                                        COMPLETE, kendi candidate'ları readiness
                                                        taşır · WAVE 2: hâlâ
                                                        READY_FOR_CANDIDATE_DECOMPOSITION)
- Global register'larda mutable durum çoğaltılmadı:     YES (yalnız pointer, bkz. bu PR'ın
                                                        active-roadmap.md/product-backlog.md/
                                                        master-triage-register.md değişiklikleri)
- Kod/schema/implementation değişikliği:                NONE
- implementationCategory eklendi (§1):                  YES (WIRING/HARDENING/EXTENSION/NEW_SUBSYSTEM)
- CANDIDATE-A/B §4 Slice Register'a işlendi:             YES (CANDIDATE statüsünde, SLICE-0N'e
                                                        yeniden numaralandırılmadı — owner'ın
                                                        kendi kullandığı ID korundu)
- Yeni bulgu (audit gap) UNMAPPED yerine NEW FINDING/    YES (§2b, OFF-INV-08, FUTURE WAVE —
  FUTURE WAVE olarak kaydedildi:                        Risk Register'a henüz eklenmedi, ayrıca
                                                        işaretlendi)
- WAVE 2/3/4+ veya orijinal 12 Finding değiştirildi mi:  NO (brief'in BOUNDARY'sine uyuldu)
- Contract başlatıldı mı:                                NO (yalnız manifest bookkeeping)
- CANDIDATE-A Contract RATIFIED işlendi (§4/§4b/§8):     YES — binding fail-closed/atomic
                                                        kural + 4 recorded limitation birebir
- 2. NEW FINDING (staff controller) §2b'ye eklendi:      YES — FUTURE WAVE/NOT AUTHORIZED,
                                                        spesifik OFF-INV icat edilmedi
- NEXT ELIGIBLE UNIT güncellendi:                        YES — "CANDIDATE-A — GO-IMPLEMENT"
- Kod/schema/migration değişikliği:                      NONE
- Implementasyon başlatıldı mı:                          NO
- Başka Wave/Slice durumu değiştirildi mi:               NO (yalnız CANDIDATE-A + §2b)
- CANDIDATE-A status→CANONICAL, implementationAuthorization  YES — §4/§4b/§5(MILESTONE 02)/§8,
  →CONSUMED, PR/commit/squash/CI kaydı işlendi:                PR #1239, `55dc2374`→`b0ce36db`
- 4 recorded limitation CARRIED FORWARD işaretlendi:      YES — §4b, "implementasyon bunları
                                                        ÇÖZMEDİ" notuyla
- WAVE 1 → PARTIALLY DELIVERED:                          YES — §7
- CANDIDATE-B durumu (NOT_SELECTED/NONE) korundu:         YES — değiştirilmedi, §4/§8'de teyitli
- NEXT ELIGIBLE UNIT → OWNER REVIEW/SELECTION CANDIDATE-B: YES — §8, Contract başlatma yetkisi
                                                        DEĞİL olduğu açıkça yazıldı
- CANDIDATE-B Contract başlatıldı mı:                     NO
- Yeni slice üretildi mi:                                 NO
- Kod/schema/migration değişikliği (bu PR):               NONE
- Başka Wave durumu (2/3/4+) değiştirildi mi:              NO
- WAVE 2 Candidate Decomposition kaydedildi mi (§4/§4c):  YES — yalnız güvenli governance
                                                           metadata seviyesinde (bkz. altı)
- Güvenlik containment (2026-07-14):                      Bu PR'ın ilk sürümü (commit
                                                           67bbc27c, branch codex/
                                                           wave2-decomposition) mekanizma-
                                                           seviyesi teknik detay içeriyordu;
                                                           auto-mode sınıflandırıcısı PR
                                                           açılmadan ENGELLEDİ (public repo +
                                                           unpatched finding). Owner kararıyla
                                                           remote branch silindi, local
                                                           history origin/main'den sıfırdan
                                                           yeniden kuruldu, bu redakte sürüm
                                                           onun yerine geçti. Ayrıntılı
                                                           teknik evidence yalnız private
                                                           handoff/scratchpad kaydındadır.
- CANDIDATE-C (EXTENSION/SELECTED/READY_FOR_CONTRACT)     YES — §4/§4c/§8, Contract henüz
  işlendi mi (yalnız governance metadata):                NOT_DRAFTED
- CANDIDATE-D (PRODUCT_DECISION_REQUIRED/                 YES — §4/§4c, owner'ın disposition'ı
  NOT_A_SELECTABLE_SLICE) işlendi mi:                     birebir, mekanizma detayı YOK
- CANDIDATE-E (NEW_SUBSYSTEM/BLOCKED,                     YES — §4/§4c, blocker OFF/OD-08 OPEN
  blocker OD-08) işlendi mi:                              olarak kaydedildi, detay YOK
- NEXT ELIGIBLE UNIT → CANDIDATE-C Contract Draft:        YES — §8, CANDIDATE-A/B tarihi
                                                           korunarak
- Yeni enum değerleri (READY_FOR_CONTRACT,                YES — §1, owner eklentisi 2026-07-14
  NOT_A_SELECTABLE_SLICE) §1 Veri Modeli'ne işlendi mi:   olarak işaretli
- CANDIDATE-D/E için owner kararı varsayıldı mı:          NO — yalnız brief'te verilen
                                                           disposition'lar birebir işlendi
- CANDIDATE-B (WAVE 1) chat-seviyesi "NOT_SELECTED/       NO — bu PR'ın SCOPE'u dışında;
  DEFERRED" beyanı bu PR'a dahil edildi mi:               §8'de açıkça flagged, ayrı bir
                                                           GO-CANONICALIZE bekliyor
- Dosya/metot ismi, bypass/enforcement mekanizma          NO — §4c'nin kendisi bunun
  açıklaması, permission flag tüketilmeme ayrıntısı       yerine yalnız redaksiyon
  bu belgede var mı:                                      gerekçesini açıklıyor
- Contract başlatıldı mı (CANDIDATE-C/D/E):               NO
- Kod/schema/migration değişikliği:                       NONE
- Başka Wave (1/3/4+) durumu değiştirildi mi:              NO (yalnız WAVE 2 kendi §7 satırı)
- CANDIDATE-B status→DEFERRED işlendi mi (§4/§4b/§7/§8):  YES — ownerSelectionStatus
                                                           (NOT_SELECTED) ve implementationAuthorization
                                                           (NONE) değişmedi, yalnız status alanı
                                                           ve REASON eklendi
- CANDIDATE-B Contract başlatıldı mı:                     NO
- CANDIDATE-C Contract başlatıldı mı:                     NO
- NEXT ELIGIBLE UNIT (CANDIDATE-C — Implementation         YES — hiç değiştirilmedi (owner'ın
  Contract Draft) PRESERVE edildi mi:                      açık "PRESERVE" talimatı)
- Kod/schema/migration değişikliği:                       NONE
- Başka durum (CANDIDATE-C/D/E, WAVE 2/3/4+) değiştirildi  NO (yalnız CANDIDATE-B'nin kendi
  mi:                                                      status/REASON alanı, §7'de yalnız
                                                            WAVE 1'in kendi CANDIDATE-B satırı)
- CANDIDATE-C owner re-scope işlendi mi (§4/§4c/§7/§8):   YES — name→"Canonical Actor Capacity
                                                           Read Consolidation", category
                                                           EXTENSION→HARDENING
- Eski "resolver enforcement mode" hedefi SUPERSEDED       YES — §4/§4c/§7'de "SUPERSEDED BY
  BY OWNER RE-SCOPE olarak kaydedildi mi:                  OWNER RE-SCOPE" birebir
- #503 observe-only invariant korunduğu belirtildi mi:    YES — §4c, "enforce/assert modu
                                                           EKLENMEZ, permission semantiği değişmez"
- Yeni objective (davranış-nötr, tek canonical kaynak)    YES — §4/§4c/§7
  kaydedildi mi:
- Korunan alanlar (SELECTED/READY_FOR_CONTRACT/            YES — §4 satırı + §8, hiçbiri
  NOT_DRAFTED/NONE) değişmeden kaldı mı:                   değiştirilmedi
- NEXT ELIGIBLE UNIT (CANDIDATE-C — Contract Draft)        YES — §8, hiç değiştirilmedi
  korundu mu:
- PUBLIC CONTENT RULE: dosya/metot ismi, consumer sayısı,  NO — hiçbiri eklenmedi; yalnız
  bypass/mekanizma ayrıntısı manifest'e eklendi mi:        redakte governance metadata
                                                           (grep ile doğrulandı)
- Contract başlatıldı mı (CANDIDATE-C):                    NO
- Kod/schema/migration değişikliği:                       NONE
- Başka candidate/wave durumu değiştirildi mi:             NO (yalnız CANDIDATE-C re-scope alanları)
- CANDIDATE-C contractStatus RATIFIED işlendi mi           YES — NOT_DRAFTED →
  (§4/§4c/§8):                                             RATIFIED_WITH_RECORDED_LIMITATIONS
- BINDING SCOPE redakte governance metadata olarak         YES — §4c, 5 madde soyut
  kaydedildi mi:                                           (mapping tek kaynak / consumer+resolver
                                                           delege / fetch korunur / auth sonucu
                                                           değişmez / #503 korunur)
- 4 RECORDED LIMITATION kaydedildi mi:                     YES — §4c (fetch ortaklaştırılmaz /
                                                           runtime doğrulama yok / resolver leaf-only /
                                                           non-null schema invariant bağımlılığı)
- Korunan alanlar (SELECTED / NONE) değişmedi mi:          YES — §4 satırı + §8, ikisi de korundu
- NEXT ELIGIBLE UNIT → CANDIDATE-C — GO-IMPLEMENT:         YES — §8 (ratifikasyon ≠ GO-IMPLEMENT
                                                           açıkça yazıldı, implementationAuthorization
                                                           NONE korundu)
- PUBLIC CONTENT RULE (ratifikasyon delta'sı): dosya/metot  NO — hiçbiri eklenmedi; helper adı/imzası,
  ismi, consumer sayısı, helper imzası, mekanizma detayı   silinecek dosyalar, non-null kolon isimleri
  eklendi mi:                                              private evidence'ta (grep ile doğrulandı)
- Kod/schema/migration / implementasyon başlatıldı mı:     NO / NONE
- Başka candidate (D/E) veya wave durumu değiştirildi mi:  NO (yalnız CANDIDATE-C ratifikasyon alanları)
- CANDIDATE-C status→CANONICAL, implementationAuthorization  YES — §4/§4c/§5(MILESTONE 03)/§8,
  →CONSUMED işlendi mi (§4/§4c/§8):                         PR #1255, `33cc6710`→`038dbbb9`, CI 4/4
- PHASE 1 MILESTONE 03 eklendi mi (§5):                    YES — CANDIDATE-C, main @ 038dbbb9, PR #1255
- 4 RECORDED LIMITATION CARRIED FORWARD işaretlendi mi:    YES — §4c, "implementasyon bunları ÇÖZMEDİ"
- WAVE 2 → PARTIALLY DELIVERED (§7):                       YES — CANDIDATE-C CANONICAL, D/E teslim edilmedi
- CANDIDATE-D/E durumu değiştirildi mi:                    NO — aynen korundu (D PRODUCT_DECISION_REQUIRED,
                                                           E BLOCKED/OD-08 OPEN)
- NEXT ELIGIBLE UNIT yeniden hesaplanıp yalnız raporlandı  YES — §8: WAVE 2'de teslim edilebilir
  mı (yeni candidate/decision package başlatılmadan):      slice YOK; owner-gated seçenekler
                                                           SEÇİLMEDEN listelendi
- Yalnızca-operasyonel (repo-dışı) bulgular manifest'e      NO — owner BOUNDARY gereği manifest'e
  eklendi mi:                                              GİRMEDİ (yalnız memory/runbook)
- PUBLIC CONTENT RULE (canonicalization delta'sı): dosya/  NO — yalnız governance metadata + PR/SHA/CI;
  metot ismi, consumer sayısı, helper imzası eklendi mi:   teknik detay private evidence'ta
- Kod/schema/migration değişikliği / yeni candidate:       NONE / NO
- WAVE 3 decomposition kaydedildi mi (§4/§4d/§7/§8):       YES — SLICE-03 → CANDIDATE-F1/F2/G/H +
                                                           dormant not; §7 CANDIDATE DECOMPOSITION COMPLETE
- CANDIDATE-F1 SELECTED/READY_FOR_CONTRACT/HARDENING       YES — §4/§4d/§8, Contract henüz NOT_DRAFTED
  işlendi mi:
- CANDIDATE-F2 DORMANT (IMPLEMENTATION SURFACE NOT FOUND)  YES — §4/§4d, owner disposition birebir
  işlendi mi:
- CANDIDATE-G BLOCKED (FIELD-LEVEL UNMASK GOVERNANCE/      YES — §4/§4d, blocker birebir; category
  MECHANISM UNRESOLVED, NEW_SUBSYSTEM) işlendi mi:         NEW_SUBSYSTEM
- CANDIDATE-H EVIDENCE_REVALIDATION_REQUIRED işlendi mi:   YES — §4/§4d
- leave/termination-reason DORMANT/SCHEMA SURFACE NOT      YES — §4d + §7 dormant not (slice değil)
  FOUND kaydedildi mi:
- NEXT ELIGIBLE UNIT → CANDIDATE-F1 Contract Draft:        YES — §8
- HOLD (CANDIDATE-B DEFERRED / D PRODUCT_DECISION /        YES — hiçbiri değiştirilmedi
  E BLOCKED) korundu mu:
- PUBLIC CONTENT RULE (privacy): açık privacy yüzeyi       NO — §4d yalnız redaksiyon gerekçesi +
  dosya/metot/mekanizma ayrıntısı manifest'e eklendi mi:   governance metadata; STF-PRD-PRIV-001
                                                           redaksiyonuyla tutarlı (grep doğrulandı)
- Contract başlatıldı mı / kod-schema-migration / yeni     NO / NONE / NO (yalnız WAVE 3 governance metadata)
  candidate seçildi mi:
- CANDIDATE-F1 contractStatus RATIFIED işlendi mi          YES — §4/§4d/§8, NOT_DRAFTED →
  (§4/§4d/§8):                                             RATIFIED_WITH_RECORDED_LIMITATIONS
- BINDING SCOPE redakte governance metadata (5 soyut       YES — §4d (liste maskeli / ratifiye alanlar /
  madde) kaydedildi mi:                                    mevcut util reuse / null semantiği / detail-edit-search değişmez)
- 4 ACCEPTED RECORD kaydedildi mi:                         YES — §4d (exact-identity search NEW FINDING /
                                                           contact+tax PII OWNER REVIEW / OFF-INV-10 PARTIAL /
                                                           STF-PRD-PRIV-001 OPEN-NOT-CLOSED)
- Korunan alanlar (SELECTED / NONE) değişmedi mi:          YES — §4 satırı + §8
- NEXT ELIGIBLE UNIT → CANDIDATE-F1 — GO-IMPLEMENT:        YES — §8 (ratifikasyon ≠ GO-IMPLEMENT açık)
- CANDIDATE-F2/G/H durumu değiştirildi mi:                 NO — aynen korundu
- PUBLIC CONTENT RULE (F1 ratifikasyonu): metot/dosya       NO — §4d ABSTRACT; metot/util/alan-endpoint
  ismi, alan-endpoint eşlemesi, masking util eklendi mi:   eşlemesi private evidence'ta
- Kod/schema/migration / implementasyon başlatıldı mı /    NO / NONE / NO
  başka wave-candidate:
- CANDIDATE-F1 status→CANONICAL, implementationAuthorization  YES — §4/§4d/§5(MILESTONE 04)/§8,
  →CONSUMED işlendi mi (§4/§4d/§8):                          PR #1270, `a08932fb`→`a170da3e`, CI 4/4
- PHASE 1 MILESTONE 04 eklendi mi (§5):                     YES — CANDIDATE-F1, main @ a170da3e, PR #1270
- recorded limitations + accepted records CARRIED FORWARD   YES — §4d korundu (OFF-INV-10 PARTIAL +
  işaretlendi mi:                                           STF-PRD-PRIV-001 OPEN/NOT CLOSED dahil)
- OFF-INV-10 → PARTIAL IMPLEMENTATION korundu mu:           YES — §4d ACCEPTED RECORDS
- STF-PRD-PRIV-001 → OPEN / NOT CLOSED korundu mu:          YES — §4d ACCEPTED RECORDS + §2 Finding note
- WAVE 3 → PARTIALLY DELIVERED (§7):                        YES — F1 CANONICAL; F2 DORMANT/G BLOCKED/H revalidation
- CANDIDATE-F2/G/H durumu değiştirildi mi:                  NO — aynen korundu (owner BOUNDARY)
- NEXT ELIGIBLE UNIT yeniden hesaplanıp yalnız raporlandı   YES — §8: implementasyona hazır birim YOK;
  mı (yeni candidate/decision package başlatılmadan):       tüm kalan candidate'lar owner-gated, SEÇİLMEDEN
- Operasyonel worktree/junction bulgusu manifest'e eklendi  NO — owner BOUNDARY gereği (yalnız memory)
  mi:
- PUBLIC CONTENT RULE (F1 canonicalization): metot/dosya    NO — yalnız governance metadata + PR/SHA/CI;
  ismi, alan-endpoint eşlemesi, masking util eklendi mi:    teknik detay private evidence'ta (grep doğrulandı)
- Kod/schema/migration değişikliği / yeni candidate:        NONE / NO
- CANDIDATE-H VERIFICATION COMPLETE işlendi mi (§4/§4d/     YES — EVIDENCE_REVALIDATION_REQUIRED →
  §7/§8):                                                   VERIFICATION COMPLETE; H-AUDIT + H-READMODEL sonucu
- H-AUDIT EVIDENCE COMPLETE / NO IMPLEMENTATION kaydedildi  YES — §4d + §4/§7/§8
  mi:
- CANDIDATE-H1 kaydı oluşturuldu mu (SELECTED/HARDENING/    YES — §4 yeni satır + §4d blok + §8 durum
  READY_FOR_CONTRACT/NONE/NOT_DRAFTED):                     satırları; owner'ın seçtiği ad korundu
- CANDIDATE-G BLOCKED/NOT_SELECTED korundu + H1 onu AÇMAZ:  YES — §4/§4d/§7/§8, "AÇILMAZ" birebir
- WAVE 3 → PARTIALLY DELIVERED güncellendi mi (§7):         YES — F1 CANONICAL; H VERIFICATION COMPLETE →
                                                            H1 SELECTED/READY_FOR_CONTRACT; F2/G değişmedi
- NEXT ELIGIBLE UNIT → CANDIDATE-H1 Implementation          YES — §8; Contract Draft adımı (GO-IMPLEMENT
  Contract Draft:                                           DEĞİL, implementationAuthorization NONE)
- Başka candidate/wave durumu değiştirildi mi:              NO — yalnız CANDIDATE-H/H1 (F1/F2/G/D/E/B korundu)
- Contract başlatıldı mı / kod-schema-migration:           NO / NONE
- PUBLIC CONTENT RULE (H1): açık yüzey/alan/endpoint/metot/  NO — yalnız owner'ın candidate adı + governance
  edit-mekanizma ayrıntısı manifest'e eklendi mi:          metadata + soyut objective; detay private (grep doğrulandı)
- CANDIDATE-H1 contractStatus RATIFIED işlendi mi           YES — NOT_DRAFTED →
  (§4/§4d/§7/§8):                                           RATIFIED_WITH_RECORDED_LIMITATIONS
- BINDING update/read/UI contract redakte governance        YES — §4d (update: omit→koru/valid→update/
  metadata olarak kaydedildi mi:                            masked-empty-null→400; read: null-preserving maskeli;
                                                            UI: no-prefill + generic gösterge + omit-empty)
- RECORDED LIMITATIONS CARRIED FORWARD işaretlendi mi:      YES — §4d (raw-reveal yok/tam değer/phone-email OOS/
                                                            guard update-only/F1-H1 ayrı katman)
- Korunan alanlar (SELECTED / NONE) değişmedi mi:           YES — §4 satırı + §8, ikisi de korundu
- NEXT ELIGIBLE UNIT → CANDIDATE-H1 — GO-IMPLEMENT:         YES — §8 (ratifikasyon ≠ GO-IMPLEMENT açık;
                                                            implementationAuthorization NONE korundu)
- CANDIDATE-G açıldı mı / F1 yeniden açıldı mı:             NO / NO — G BLOCKED korundu (H1 AÇMAZ), F1 dokunulmadı
- Başka candidate/wave durumu değiştirildi mi:              NO — yalnız CANDIDATE-H1 ratifikasyon alanları
- Contract/implementasyon başlatıldı mı / kod-schema:      NO / NONE
- PUBLIC CONTENT RULE (H1 ratifikasyonu): dosya/metot/      NO — binding contract BEHAVIORAL governance seviyede;
  alan-endpoint/exact-guard/edit-mekanizma eklendi mi:     exact guard/mekanizma/dosya private (grep doğrulandı)
- CANDIDATE-H1 status→CANONICAL, implementationAuthorization  YES — §4/§4d/§5(MILESTONE 05)/§8,
  →CONSUMED işlendi mi (§4/§4d/§8):                          PR #1283, `8f7dd1c8`→`29eb6384`, CI 4/4
- PHASE 1 MILESTONE 05 eklendi mi (§5):                     YES — CANDIDATE-H1, main @ 29eb6384, PR #1283
- ratifiye recorded limitations CARRIED FORWARD:           YES — §4d korundu (raw-reveal yok / tam-değer /
                                                            phone-email OOS / guard update-only / F1-H1 ayrı)
- EVIDENCE LIMITATION (CI allowlist) kaydedildi mi:         YES — §4d + §7 + §8; "implementation sonucunu/
                                                            CI 4/4 PASS iddiasını DEĞİŞTİRMEZ" birebir
- OFF-INV-10 → PARTIAL / STF-PRD-PRIV-001 → OPEN korundu mu: YES — §4d CARRIED FORWARD + §2 Finding note
- WAVE 3 → PARTIALLY DELIVERED güncellendi mi (§7):         YES — F1+H1 CANONICAL; F2 DORMANT/G BLOCKED
- CANDIDATE-G/F2 durumu değiştirildi mi:                    NO — aynen korundu (owner BOUNDARY)
- NEXT ELIGIBLE UNIT yeniden hesaplanıp yalnız raporlandı   YES — §8: implementasyona hazır birim YOK;
  mı (yeni candidate/decision package başlatılmadan):       tüm kalan candidate'lar owner-gated, SEÇİLMEDEN
- Operasyonel worktree/junction / CI-config bulgusu         NO — owner BOUNDARY gereği (yalnız memory);
  manifest'e eklendi mi:                                    ci.yml değiştirilmedi
- PUBLIC CONTENT RULE (H1 canonicalization): dosya/metot/   NO — yalnız governance + evidence metadata +
  alan-endpoint/exact-guard/edit-mekanizma eklendi mi:     PR/SHA/CI; teknik detay private (grep doğrulandı)
- Kod/schema/migration/CI-config değişikliği / yeni candidate: NONE / NO
- WAVE 3 CLOSURE (CLOSED / COMPLETE WITH RECORDED           YES — §2 note + §7 status + §7 WAVE 3 CLOSURE
  RESIDUALS) işlendi mi (§2/§7/§8):                         bloğu + §8 NEXT ELIGIBLE NONE
- F1+H1 CANONICAL/CONSUMED + H-AUDIT NO IMPLEMENTATION      YES — §4/§5/§7/§8 değişmedi (MILESTONE 04/05;
  korundu mu:                                               H VERIFICATION COMPLETE)
- 5 residual aynen taşındı mı:                              YES — §7 (F2 DORMANT · G BLOCKED/FUTURE ·
                                                            OFF-INV-10 PARTIAL · STF-PRD-PRIV-001 OPEN/CARRIED
                                                            FORWARD · leave-term DORMANT)
- WAVE 3 closure ≠ finding closure açıkça yazıldı mı:       YES — §2/§7 "KAPATMAZ / remediation DEĞİL" birebir
- Finding/invariant status flip yapıldı mı (owner: yapma):   NO — STF-PRD-PRIV-001 OPEN/CARRIED FORWARD +
                                                             OFF-INV-10 PARTIAL korundu; yalnız WAVE teslimatı kapatıldı
- NEXT ELIGIBLE UNIT → NONE + NEXT PROGRAM ACTION owner      YES — §7/§8; hiçbir birim seçilmedi/başlatılmadı/
  selection/decision:                                       sıralanmadı (program-izolasyon)
- Yeni candidate/wave seçildi mi / kod-schema-migration:     NO / NONE
- PUBLIC CONTENT RULE (WAVE 3 closure): alan/endpoint/      NO — yalnız governance closure + residual metadata
  guard/edit-mekanizma eklendi mi:                         (grep doğrulandı)
- OFF/OD-08 → CLOSED_CANONICAL/OWNER_SELECTED işlendi mi     YES — §3 satırı + OFFICE-OWNER-DECISIONS.md +
  (§3):                                                     decision-log.md; Option B metni owner'dan birebir
- OFF/OD-10 → CLOSED_CANONICAL/OWNER_SELECTED işlendi mi     YES — §3 satırı + OFFICE-OWNER-DECISIONS.md +
  (§3):                                                     decision-log.md; Option B metni owner'dan birebir
- Önceki QUESTION/OPTIONS/SAFE DEFAULT metni korundu mu      YES — yalnız OWNER SELECTION + DECISION-LOG
  (OFFICE-OWNER-DECISIONS.md):                              REFERENCE alanları dolduruldu, geçmiş silinmedi
- CANDIDATE-E blocker recompute: status/readinessStatus      YES — §4/§4c/§8: status UNBLOCKED,
  vs ownerSelectionStatus/implementationAuthorization/       readinessStatus NEXT_ELIGIBLE (hesaplanan gerçek);
  contractStatus ayrımı korundu mu (readiness ≠              ownerSelectionStatus NOT_SELECTED / implementation-
  authorization):                                            Authorization NONE / contractStatus NOT_DRAFTED — DEĞİŞMEDİ
- BOLA-001/SCP-001/BOLA-002 → READY_FOR_CANDIDATE_           YES — §2/§7; üçü de "candidate seçilmedi/
  DECOMPOSITION işlendi mi (candidate seçildi/başlatıldı mı): başlatılmadı" notuyla; hiçbiri SEÇİLMEDİ
- PR #1296 (CLIENT-SEC-H1 dar istisna, 2026-07-15) metni      YES — §2 BOLA-001 satırındaki "RECORDED SECURITY
  korunarak üstüne mi inşa edildi (rebase-onto, çelişki       EXCEPTION" bloğu birebir korundu; bu turun OD-08
  değil):                                                     kapanışı AYRI ve sonraki bir olay olarak eklendi
- CANDIDATE-G/F2/B/D durumu değiştirildi mi:                  NO — yalnız CANDIDATE-E (blocker: yalnız OD-08) +
                                                              yeni decision-readiness kayıtları etkilendi
- Yeni candidate/wave seçildi mi / kod-schema-migration:      NO / NONE
- PUBLIC CONTENT RULE (OD-08/OD-10 closure): alan/endpoint/   NO — yalnız governance decision metadata +
  guard/exact-mekanizma eklendi mi:                          decision-readiness notu (grep doğrulandı)
- CANDIDATE-E → E1 first-slice decompose işlendi mi (§4/§4c/  YES — CANDIDATE-E DECOMPOSED/NOT_SELECTED
  §7/§8):                                                    (kalan tam kapsam, henüz candidate değil) +
                                                              CANDIDATE-E1 yeni satır (SELECTED/
                                                              CONTRACT_DRAFT_READY)
- CANDIDATE-E1 ownerSelectionStatus SELECTED / contractStatus YES — §4/§4c/§8 birebir owner talimatındaki
  CONTRACT_DRAFT_READY işlendi mi:                            terimlerle (\"OWNER_SELECTED /
                                                              CONTRACT_DRAFT_READY\")
- implementationAuthorization (CANDIDATE-E1) verildi mi       NO — NONE korunur; GO-IMPLEMENT owner'ın
  (owner: verme):                                            ayrı, açık bir GO'sunu bekler
- Sunulan Contract Draft (in/out-of-scope, invariants,        YES — §4c CANDIDATE-E1 bloğu, redakte
  acceptance criteria, test/evidence, stop conditions)        (şema alan/dosya/consumer ismi private
  canonical kayda dönüştürüldü mü:                            evidence'ta, grep doğrulandı)
- OFF/OD-06 ve BOLA-001/SCP-001/BOLA-002 kapsam dışı           YES — §4c/§8 açıkça "kapsam dışı" olarak
  bırakıldı mı (owner BOUNDARY):                              not edildi; hiçbiri bu turda değiştirilmedi
- CANDIDATE-G/F2/B/D durumu değiştirildi mi:                  NO — yalnız CANDIDATE-E/E1 etkilendi
- Kod/schema/migration oluşturuldu mu (owner: oluşturma):     NO / NONE
- PUBLIC CONTENT RULE (CANDIDATE-E1 contract): şema alan      NO — yalnız governance-seviyesi soyut
  ismi/dosya/consumer sayısı/mekanizma detayı eklendi mi:    yapı tarifi (grep doğrulandı; STF-PRD-RBAC-001
                                                              hâlâ UNPATCHED, aynı containment kuralı uygulandı)
- CANDIDATE-E1 → CANONICAL/CONSUMED/RATIFIED işlendi mi        YES — §4/§4c/§7/§8; PR #1308+#1312,
  (§4/§4c/§5/§7/§8):                                          squash `fa6851c0`, CI 4/4, PHASE 1 MILESTONE 06
- implementationAuthorization (CANDIDATE-E1) yeni bir          NO — yalnız tamamlanan işin kaydı;
  yetki mi yoksa tamamlanan işin kaydı mı (owner: yeni         GO_IMPLEMENT_ISSUED→CONSUMED aynı slice
  yetki üretme):                                              için tekrar açılmaz
- STF-PRD-RBAC-001 finding CLOSED işaretlendi mi               NO — OPEN/NOT CLOSED KORUNDU (§2/§7/§8/
  (owner: yalnız gerekirse kapat):                             OFFICE-RISK-REGISTER.md); şema temeli
                                                                davranışsal riski kapatmadı
- CANDIDATE-E kalan kapsamı (future scope) değişti mi:         NO — DECOMPOSED/NOT_SELECTED aynen korundu
- NEXT ELIGIBLE UNIT yeniden hesaplandı mı:                    YES — §8: NONE'a döndü (E1 CONSUMED
                                                                oldu, başka hazır candidate yok);
                                                                NEXT PROGRAM ACTION = OWNER SELECTION/
                                                                DECISION REQUIRED
- CANDIDATE-A/B/C/D/F1/F2/G/H/H1 durumu değiştirildi mi:       NO — yalnız CANDIDATE-E1 + ilgili
                                                                finding (RBAC-001) etkilendi
- Yeni candidate seçildi mi / kod-schema-migration:            NO / NONE
- PUBLIC CONTENT RULE (E1 implementation closure): şema        NO — yalnız governance/test-evidence
  alan/dosya/consumer/rename-gerekçesi eklendi mi:            metadata (grep doğrulandı)
- CANDIDATE-I → I1 first-slice decompose + Contract RATIFIED   YES — §4/§4e/§7/§8; CANDIDATE-I
  işlendi mi (§4/§4e/§7/§8):                                  DECOMPOSED/NOT_SELECTED + yeni
                                                                CANDIDATE-I1 (SELECTED/RATIFIED)
- implementationAuthorization (CANDIDATE-I1) verildi mi        NO — NONE korunur; GO-IMPLEMENT
  (owner: verme):                                              owner'ın ayrı, açık bir GO'sunu bekler
- STF-PRD-BOLA-001/SCP-001 kapatıldı mı (owner: kapatma) /     NO / YES — finding OPEN kaldı,
  yalnız candidate mapping eklendi mi:                         CANDIDATE-I mapping'i §2/§7'ye eklendi
- STF-PRD-BOLA-002 ve CANDIDATE-J/K değiştirildi mi:           NO — hiçbiri bu turda dokunulmadı,
                                                                READY_FOR_CANDIDATE_DECOMPOSITION korundu
- CANDIDATE-E1 model çakışması/duplicate authority riski       NO — tamamlayıcı katmanlar (etiket
  bulundu mu:                                                  vs. altında yatan veri), isim
                                                                çakışması sıfır (taze grep)
- Backfill gerekli mi:                                         NO / UYGULANAMAZ — kaynak veri yok
- Sunulan Contract (in/out-of-scope, veri modeli sınırları,    YES — §4e CANDIDATE-I1 bloğu,
  invariants, migration/rollback, acceptance criteria,         redakte (şema alan/dosya/route ismi
  test/evidence, stop conditions) canonical kayda dönüştü mü:  private evidence'ta, grep doğrulandı)
- CANDIDATE-B/D/E/F1/F2/G/H/H1 durumu değiştirildi mi:         NO — yalnız CANDIDATE-I/I1 +
                                                                ilgili finding (BOLA-001/SCP-001) etkilendi
- Kod/schema/migration oluşturuldu mu (owner: oluşturma):      NO / NONE
- PUBLIC CONTENT RULE (CANDIDATE-I1 contract): şema alan       NO — yalnız governance-seviyesi soyut
  ismi/dosya/route/consumer sayısı/mekanizma detayı           yapı tarifi (grep doğrulandı; BOLA-001/
  eklendi mi:                                                  SCP-001 hâlâ UNPATCHED, aynı containment kuralı)
- CANDIDATE-I1 → CANONICAL/CONSUMED/RATIFIED işlendi mi        YES — §4/§4e/§5/§7/§8; PR #1325,
  (§4/§4e/§5/§7/§8):                                           squash `05e73579`, CI 4/4, PHASE 1 MILESTONE 07
- implementationAuthorization (CANDIDATE-I1) yeni bir          NO — yalnız tamamlanan işin kaydı;
  yetki mi yoksa tamamlanan işin kaydı mı (owner: yeni         GO_IMPLEMENT_ISSUED→CONSUMED aynı slice
  yetki üretme):                                               için tekrar açılmaz
- STF-PRD-BOLA-001/SCP-001 finding'leri CLOSED işaretlendi     NO — OPEN/NOT CLOSED KORUNDU (§2/§7/§8/
  mi (owner: yalnız gerekirse kapat):                          OFFICE-RISK-REGISTER.md); şema temeli
                                                                davranışsal riski kapatmadı
- CANDIDATE-I kalan kapsamı (future scope) değişti mi:         NO — DECOMPOSED/NOT_SELECTED aynen korundu
- STF-PRD-BOLA-002 ve CANDIDATE-J/K değiştirildi mi:           NO — hiçbiri bu turda dokunulmadı,
                                                                READY_FOR_CANDIDATE_DECOMPOSITION korundu
- NEXT ELIGIBLE UNIT yeniden hesaplandı mı:                    YES — §8: NONE'a döndü (I1 CONSUMED
                                                                oldu, başka hazır candidate yok);
                                                                NEXT PROGRAM ACTION = OWNER SELECTION/
                                                                DECISION REQUIRED
- CANDIDATE-A/B/C/D/E/F1/F2/G/H/H1/E1 durumu değiştirildi mi:  NO — yalnız CANDIDATE-I1 + ilgili
                                                                finding'ler (BOLA-001/SCP-001) etkilendi
- BOLA-001 risk kartındaki NOTES alanındaki candidate          YES — "CANDIDATE-E"/"§4c" yanlış
  referansı düzeltildi mi (fresh-read'de tespit edilen         referansı "CANDIDATE-I"/"§4e" olarak
  isim hatası):                                                düzeltildi (bu bulgunun kendi kaydı,
                                                                başka bir finding'e ait değildi)
- Yeni candidate seçildi mi / kod-schema-migration:            NO / NONE
- PUBLIC CONTENT RULE (I1 implementation closure): şema        NO — yalnız governance/test-evidence
  alan/dosya/consumer/mekanizma detayı eklendi mi:            metadata (grep doğrulandı)
- CANDIDATE-J → J1 first-slice decompose + Contract RATIFIED   YES — §4/§4f/§7/§8; CANDIDATE-J
  işlendi mi (§4/§4f/§7/§8):                                    DECOMPOSED/NOT_SELECTED + yeni
                                                                CANDIDATE-J1 (SELECTED/RATIFIED)
- implementationAuthorization (CANDIDATE-J1) verildi mi        NO — NONE korunur; GO-IMPLEMENT
  (owner: koru NONE):                                          owner'ın ayrı, açık bir GO'sunu bekler
- STF-PRD-BOLA-002 kapatıldı mı (owner: kapatma) /             NO / YES — finding OPEN kaldı,
  yalnız J1 mapping'i eklendi mi:                               CANDIDATE-J mapping'i §2/§7'ye eklendi
- CANDIDATE-K ve kalan J policy kapsamı owner-gated future     YES — §4/§4f/§8 açıkça "seçilmedi/
  scope olarak bırakıldı mı:                                    future scope" olarak not edildi
- J1 davranış-değiştiren enforcement dilimi olduğu             YES — §4/§4f/§7/§8: "ilk davranış-
  açıkça yazıldı mı (I1/additive-only'den farklı):             DEĞİŞTİREN WAVE 4+ enforcement dilimi"
- Backfill kapsamı doğru mu (enforcement, veri-taşıma değil):  YES — §4f: BACKFILL UYGULANMAZ
                                                                (ileriye-dönük tasarım)
- Sunulan Contract (in/out-of-scope, invariants, acceptance    YES — §4f CANDIDATE-J1 bloğu, redakte
  criteria, test/evidence, stop conditions) canonical kayda    (enforcement metot/helper/emsal ismi
  dönüştü mü:                                                   private evidence'ta, grep doğrulandı)
- CANDIDATE-A/B/C/D/E/F1/F2/G/H/H1/E1/I/I1 durumu               NO — yalnız CANDIDATE-J/J1/K + ilgili
  değiştirildi mi:                                             finding (BOLA-002) etkilendi
- NEXT ELIGIBLE UNIT yeniden hesaplandı mı:                    YES — §8: CANDIDATE-J1 — GO-IMPLEMENT
                                                                (implementationAuthorization NONE ile)
- Yeni candidate seçildi mi (K) / kod-schema-migration:        NO / NONE — K incelendi, SEÇİLMEDİ
- PUBLIC CONTENT RULE (J1 contract): enforcement metot/        NO — yalnız governance-seviyesi soyut
  route/dosya/mekanizma detayı eklendi mi:                     yapı tarifi (grep doğrulandı; BOLA-002
                                                                hâlâ UNPATCHED, aynı containment kuralı)
- CANDIDATE-J1 → CANONICAL/CONSUMED/RATIFIED işlendi mi         YES — §4/§4f/§5/§7/§8; PR #1338,
  (§4/§4f/§5/§7/§8):                                            squash `7210ea7c`, CI 4/4, PHASE 1 MILESTONE 08
- implementationAuthorization (CANDIDATE-J1) yeni bir          NO — yalnız tamamlanan işin kaydı;
  yetki mi yoksa tamamlanan işin kaydı mı (owner: yeni         GO_IMPLEMENT_ISSUED→CONSUMED aynı slice
  yetki üretme):                                               için tekrar açılmaz
- STF-PRD-BOLA-002 finding CLOSED işaretlendi mi               NO — OPEN/NOT CLOSED KORUNDU (§2/§7/§8/
  (owner: Task baseline teslim edildi ama Case=K açık):        OFFICE-RISK-REGISTER.md); J1 yalnız Task-atama
                                                                alt-boşluğunun baseline'ını kapattı
- Yalnız Task alt-boşluğu uzlaştırıldı mı, finding             YES — §2/§7/§8 + risk kartı: J1 Task
  kapatılmadan (owner talimatı):                               baseline IMPLEMENTED; Case (K) + rol/kapasite
                                                                policy açık; verdict OPEN
- CANDIDATE-K NOT_SELECTED future scope korundu mu:            YES — §4f/§8: NOT_SELECTED, dokunulmadı
- CANDIDATE-A/B/C/D/E/F1/F2/G/H/H1/E1/I/I1/J durumu            NO — yalnız CANDIDATE-J1 + ilgili
  değiştirildi mi:                                             finding (BOLA-002) etkilendi
- NEXT ELIGIBLE UNIT yeniden hesaplandı mı:                    YES — §8: NONE'a döndü (J1 CONSUMED
                                                                oldu, başka hazır candidate yok)
- Yeni candidate seçildi mi / kod-schema-migration:            NO / NONE
- PUBLIC CONTENT RULE (J1 implementation closure): şema/       NO — yalnız governance/test-evidence
  enforcement metot/route/mekanizma detayı eklendi mi:        metadata (grep doğrulandı)
- CANDIDATE-K → K1/K2/K3 decompose + K1 Contract RATIFIED       YES — §2/§4/§4f/§7/§8; CANDIDATE-K
  işlendi mi (§2/§4/§4f/§7/§8):                                 DECOMPOSED + yeni K1(RATIFIED)/K2
                                                                (BLOCKED_ON_PRODUCT_DECISION)/K3(DEFERRED)
- implementationAuthorization (CANDIDATE-K1) verildi mi         NO — NONE korunur; GO-IMPLEMENT
  (owner: koru NONE):                                          owner'ın ayrı, açık bir GO'sunu bekler
- STF-PRD-BOLA-002 kapatıldı mı (owner: kapatma) /              NO / YES — finding OPEN kaldı,
  yalnız K1 mapping'i eklendi mi:                               K1 mapping'i §2/§7'ye eklendi
- ASSIGN-4d DEFERRED olarak kaydedildi mi / owner seçimi        YES / NO — §4f/§8: DEFERRED,
  varsayıldı mı (owner: bu görevde seçim yapılmadı):            yalnız K2b'yi etkiler, K1'i bloke etmez
- K2 ASSIGN-4d-bağlı, K3 owner-gated future olarak              YES — §4/§4f/§8: K2 BLOCKED_ON_
  kaydedildi mi:                                                PRODUCT_DECISION, K3 DEFERRED
- GOVERNANCE-PRECISE ayrım (ekip-üyesi = tenant+aktiflik,       YES — §4/§4f'de açıkça: sorumlu-
  sorumlu-bayrağı DEĞİL) kanonikleştirildi mi:                  uygunluk bayrağı ekip için ARANMAZ
- Duplicate-logic verdict (sorumlu-doğrulayıcıyla YANLIŞ        YES — §4f: mevcut kontrol noktaları
  konsolidasyondan kaçın) kaydedildi mi:                        genişletilir, literal reuse YOK
- CANDIDATE-A..J1 durumu değiştirildi mi:                       NO — yalnız CANDIDATE-K/K1/K2/K3 +
                                                                ilgili finding (BOLA-002) etkilendi;
                                                                §2'de J1 durumu yalnız stale→güncel
                                                                (OWNER_SELECTED→CANONICAL/CONSUMED) düzeltildi
- NEXT ELIGIBLE UNIT yeniden hesaplandı mı:                    YES — §8: CANDIDATE-K1 — GO-IMPLEMENT
                                                                (implementationAuthorization NONE ile)
- Yeni implementation/kod-schema-migration yapıldı mı:          NO / NONE
- PUBLIC CONTENT RULE (K1 contract): enforcement metot/        NO — yalnız governance-seviyesi soyut
  site/route/mekanizma detayı eklendi mi:                      yapı tarifi (grep doğrulandı; BOLA-002
                                                                hâlâ OPEN, aynı containment kuralı)
- CANDIDATE-K1 → CANONICAL/CONSUMED/CONSUMED işlendi mi         YES — §2/§4/§4f/§5/§7/§8; PR #1356,
  (§2/§4/§4f/§5/§7/§8):                                         squash `423d72ea`, CI 4/4, PHASE 1 MILESTONE 09
- contractStatus RATIFIED→CONSUMED uzlaştırıldı mı             YES — §4 register + §8 field-summary +
  (owner talimatı):                                            §8 closure paragrafı: CONSUMED
- implementationAuthorization (CANDIDATE-K1) yeni bir          NO — yalnız tamamlanan işin kaydı;
  yetki mi yoksa tamamlanan işin kaydı mı (owner: yeni         GO_IMPLEMENT_ISSUED→CONSUMED aynı slice
  yetki üretme):                                               için tekrar açılmaz
- STF-PRD-BOLA-002 finding CLOSED işaretlendi mi               NO — OPEN / PARTIALLY MITIGATED KORUNDU
  (owner: Case baseline teslim edildi ama K2/K3/policy açık):  (§2/§7/§8/OFFICE-RISK-REGISTER.md); K1 yalnız
                                                                Case ekip-ekleme baseline'ını kapattı
- Yalnız Case ekip-ekleme baseline'ı uzlaştırıldı mı,          YES — §2/§7/§8 + risk kartı: K1 Case
  finding kapatılmadan (owner talimatı):                       baseline IMPLEMENTED; K2/K3 + rol/kapasite
                                                                policy açık; verdict OPEN/PARTIALLY MITIGATED
- Gate-öncesi 4 mevcut test mock'una aktiflik=true             YES — §4f IMPLEMENTATION + §8 closure:
  eklendiği şeffaf kaydedildi mi (meşru mock-tamamlama):       meşru mock-tamamlama, regresyon DEĞİL
- CANDIDATE-K2/K3 + kalan kapsam owner-gated korundu mu:       YES — §4f/§8: K2 BLOCKED_ON_PRODUCT_
                                                                DECISION, K3 DEFERRED, dokunulmadı
- CANDIDATE-A..J1 durumu değiştirildi mi:                      NO — yalnız CANDIDATE-K1 + ilgili
                                                                finding (BOLA-002) etkilendi
- NEXT ELIGIBLE UNIT yeniden hesaplandı mı:                    YES — §8: NONE'a döndü (K1 CONSUMED
                                                                oldu, başka hazır candidate yok)
- Yeni candidate seçildi mi / kod-schema-migration:            NO / NONE
- PUBLIC CONTENT RULE (K1 implementation closure): şema/       NO — yalnız governance/test-evidence
  enforcement metot/route/mekanizma detayı eklendi mi:        metadata (grep doğrulandı)
```
