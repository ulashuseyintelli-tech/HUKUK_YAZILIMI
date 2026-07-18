# OFFICE Phase 2 Constitutional Decomposition — Blueprint

```text
Belge yolu   : project/docs/governance/OFFICE-PHASE2-DECOMPOSITION.md
Durum        : CANONICAL REFERENCE / NON-NORMATIVE / NON-AUTHORIZING — v1.0 (owner decomposition
               decision + GO-CANONICALIZE, 2026-07-18; decision-log § "OFFICE PHASE 2 CONSTITUTIONAL
               DECOMPOSITION RATIFICATION")
Rol          : PHASE 2 DECOMPOSITION BLUEPRINT — capability delivery map, current-to-target mimari,
               dependency/gate matrisi, program increment'leri, önerilen Wave kümeleri, provisional
               workstream envanteri, karar kuyruğu, delivery roadmap, exit coverage ve first-unit
               seçenekleri. Norm kaynağı DEĞİLDİR (norm = OFFICE-PHASE2-CONSTITUTION.md + OFFICE-
               GOVERNANCE.md); authority ÜRETMEZ (SYS-GOV-008); hiçbir Wave/delivery-unit SEÇMEZ/
               BAŞLATMAZ/YETKİLENDİRMEZ.
Kimlik uzayı : Bu belgedeki TÜM increment/Wave/workstream etiketleri (INC-*, W-P2-*, provisional
               adlar) yalnız ANALYSIS LABEL / NON-ID'dir — PROVISIONAL / NON-CANONICAL / NOT_SELECTED.
               Canonical Wave/Candidate/Task/Contract kimliği DEĞİLDİR ve öyle kaydedilemez.
IMPLEMENTATION AUTHORITY: NONE — hiçbir kod/schema/migration/Contract/implementation yetkisi üretmez.
MUTABLE STATUS AUTHORITY: YOK — Phase 2 delivery-statüsünün TEK mutable otoritesi
               `OFFICE-DELIVERY-MANIFEST.md`'dir. Bu belge mutable delivery statüsü TAŞIMAZ.
```

## RELATED DOCUMENTS

- Normatif çerçeve: `project/docs/governance/OFFICE-PHASE2-CONSTITUTION.md` (vizyon/sınır/ilke/kural) · `project/docs/governance/OFFICE-GOVERNANCE.md` (Domain Law) · `project/docs/governance/SYSTEM-CONSTITUTION.md`
- Mimari/kanıt zemini: `project/docs/governance/OFFICE-PHASE2-MASTER-SYNTHESIS.md` (OFF-P2-CAP-*/DEP-* + §5a Tur 2 reconciliation)
- Charter/Roadmap: `project/docs/governance/OFFICE-PHASE2-PROGRAM-CHARTER.md` (OBJ/DLV/SC/EXIT) · `project/docs/governance/OFFICE-PHASE2-ROADMAP.md` (SEQ/ENTRY)
- **Mutable delivery-statü otoritesi:** `project/docs/governance/OFFICE-DELIVERY-MANIFEST.md`
- Kapanmış karar: `project/docs/governance/decision-log.md` · Açık karar dossier'i: `project/docs/governance/OFFICE-OWNER-DECISIONS.md` · Risk dossier'i: `project/docs/governance/OFFICE-RISK-REGISTER.md` · Global triage: `project/docs/governance/master-triage-register.md`

## 1. Authority and Freshness Boundary

Bu belge Phase 2 Constitution → Master Synthesis → Program Charter → Roadmap zincirinin **delivery-planlama katmanı sentezidir**. NON-NORMATIVE ve NON-AUTHORIZING'dir: norm üretmez, capability seçmez, Wave/first-unit başlatmaz, açık owner kararını vermez, hiçbir bulguyu kapatmaz. Ratifiye 4 foundation belgesiyle çelişki halinde üst belge kazanır ve çelişki decision-log'a taşınır (OFF-P2-GOV-07).

**Provenance önceliği:** Güncel `origin/main` repository gerçeği + ratifiye OFFICE Domain Law + kapanmış canonical owner kararları + Phase 1 delivery kanıtı önceliklidir. Tur 2 tarihsel ontoloji raporu HISTORICAL / NON-NORMATIVE'dir (Tur 2 Canonical Evidence Reconciliation, MASTER-SYNTHESIS §5a); bu belge Tur 2'nin hiçbir historical kimliğini (`STF-ONT-*`, nitelenmemiş `OD-01..35`) kanonik kimlik olarak kullanmaz.

**Statü ayrımı disiplini (belge boyunca uygulanır):** structural foundation ≠ runtime wiring ≠ behavioral enforcement; delivery closure ≠ finding closure; readiness ≠ authorization; NEXT ELIGIBLE ≠ NEXT AUTHORIZED; TARGET hiçbir yerde CURRENT gibi sunulmaz.

## 2. Corrected Capability Delivery Map (OFF-P2-CAP-01..12)

*(Format: anayasal amaç · mevcut substrate · Phase 1 zemini · olgunluk · açık finding · owner-decision bağı · cross-cap bağ · migration/data · güv/ops · kanıt güveni · EXIT katkısı. Olgunluk = SCOPE-02 yaşam-döngüsü ekseni. Mekanizma detayı verilmez — PUBLIC CONTENT RULE.)*

| CAP | Amaç | Mevcut substrate | Zemin | Olgunluk | Finding | Owner-decision | Cross-cap | Migration | Güv/ops | Güven | EXIT |
|---|---|---|---|---|---|---|---|---|---|---|---|
| **CAP-01** Kimlik/aktör ayrışması | OFF-INV-01 karıştırma yasağı modelde+davranışta | **Formal Person aggregate ABSENT**; User/Lawyer/StaffMember ayrı, aralarında **optional unique User↔profile linkage**; ClientPortalUser ayrı auth-subject | — (OD-01 CLOSED zemin) | TARGET | DATA-001 (dolaylı) | OD-01 CLOSED; kapı **OD-03/07 BLOCKING**, OD-02 non-blocking, OD-04 DEFERRED | CAP-05/09/11 önkoşulu | YÜKSEK (kimlik remap + backfill) | Orta | Yüksek | EXIT-01/02 |
| **CAP-02** Object-scope enforcement | OFF-INV-05 nesne-kapsam adımı tüm yüzeylerde | Hiyerarşi şema temeli **CURRENT ama ZERO-CONSUMER**; erişim bugün case-membership+tenant+capacity türevi | I1 (structural) | TARGET / NOT_IMPLEMENTED | BOLA-001 (P1), SCP-001, CFG-001 | OD-08 **CLOSED (karar-bağımsız)** | audit-atıf standardı (CAP-09) **önerilir** | Orta (consumer-bağlama, additive-first) | **YÜKSEK (P1)** | Yüksek | EXIT-01/03 |
| **CAP-03** İzin consumer-migration | OFF-INV-03 title≠role≠grant tutarlı uygulaması | İzin/rol şema temeli **CURRENT ama ZERO-CONSUMER**; runtime yetki = capacity-türevi + Json/bool bayraklar | E1 (structural) | TARGET / NOT_IMPLEMENTED | RBAC-001 (P2) | OD-05/09 CLOSED; kapı: finans-onay bayrağı **product-decision (D)** | CAP-07 raw-reveal bunun grant taşıyıcısına dayanır | YÜKSEK (dual-authority SHADOW dönemi) | Orta | Yüksek | EXIT-01/02 |
| **CAP-04** Atama uygunluk zinciri | OFF-INV-04 assignment≠access + eligibility tüm yüzeylerde | J1 (task-assignee) + K1 (case-team) write-time aktiflik gate'leri **CURRENT** | J1+K1 (behavioral) | kısmi CURRENT / TARGET (tam zincir) | BOLA-002 (P3, OPEN/PARTIALLY MITIGATED) | OD-10 CLOSED; kapı: **ASSIGN-4d product-decision (DEFERRED)** + rol/kapasite POLICY | audit-atıf standardı (CAP-09) önerilir | Düşük (baseline forward-only) | Orta | Yüksek (kod-doğrulanmış) | EXIT-01/03 |
| **CAP-05** Oturum/yetki tazeliği | OFF-INV-06 session hesap+membership state'ine bağlı | Session/revocation altyapısı **ABSENT** (stateless token) | — (OD-14/15 mekanizma seçili) | TARGET / NOT_IMPLEMENTED | SES-001 (P1) + SES-002 | OD-14/15 **CLOSED**; kapı: auth-çekirdeği blast-radius (Phase 1'de bilinçli ertelendi) | **CAP-06'nın ters-çevrilemez önkoşulu (revoke)** | YÜKSEK (auth çekirdeği) | **YÜKSEK (P1)** | Yüksek | EXIT-01 |
| **CAP-06** Offboarding orkestrasyonu | OFF-INV-07 freeze→…→audit zinciri | Offboarding wiring **CURRENT** (transaction'lı profil→hesap deaktivasyon); tam orkestrasyon inşa edilmedi; reactivation asimetrik | A (wiring) | TARGET / NOT_IMPLEMENTED (orkestrasyon "yok" sınıfı) | LIFE-001 (P2) | OD-17 CLOSED; kapı **OD-16 non-blocking/teyit** + OD-03/04 | **REQUIRES CAP-05 (ters çevrilemez)** | Orta | Orta-Yüksek | Yüksek | EXIT-01 |
| **CAP-07** Veri minimizasyonu / field-level | OFF-INV-10 tüm projeksiyon yüzeylerinde | Liste-maskeleme + case-embedded maskeleme + edit-safe kontrat **CURRENT**; detail/export/unmask yok | F1+H1 | kısmi CURRENT / TARGET | PRIV-001 (P2) | OD-18 CLOSED; kapı: **field-level unmask governance (BLOCKED)** + export yüzeyi (DORMANT) | **detail/export bağımsız ilerleyebilir; yalnız raw-reveal/unmask field-level authority taşıyıcısına (olası CAP-03) bağlı** | Düşük-Orta | Orta (KVKK) | Yüksek | EXIT-01/03 |
| **CAP-08** Onay aktörü / delegasyon | Domain Law §15/§16 aktör tarafı | **Person-correlated hybrid self-approval guard CURRENT** (formal Person aggregate absent); iç-onay yetki bayrağı runtime'da aktif tüketiliyor; ApprovalAuthority türetilmiş predikat; Delegation lifecycle yok | SLICE-02 (behavioral çekirdek) | çekirdek CURRENT / delegasyon TARGET | — (ADR-009/DBIND dokunulmaz) | kapı **OD-12 + OD-13 BLOCKING**; OD-06 non-blocking | ADR-009/DBIND sınırı | Orta | Yüksek (finansal onay) | Orta (çekirdek revalidation) | EXIT-01/04 |
| **CAP-09** Audit atıf | OFF-INV-08 domain audit standardı | Audit atıf FK'siz aktör kimliği; effective-role/statü snapshot'ı yok | — (non-canonical audit-attribution evidence / register intake pending) | TARGET | non-canonical audit-attribution evidence (register intake pending) | **kapı YOK (karar-bağımsız)** | **EVIDENCE / AUDIT ENABLER — davranışsal enforcement'tan ÖNCE önerilir; SOFT prerequisite (hard blocker DEĞİL)** | Düşük (additive) | Orta (denetlenebilirlik) | Orta | EXIT-01/03 |
| **CAP-10** Read-model güvenilirliği | OFF-INV-09 kaynak/deny≠empty/freshness | Workload/360 canonical writer YOK, projection-only | — | TARGET | OPS-001, PERF-001 (UNMAPPED) | kapı **OD-19 BLOCKING (workload amacı)** | — | Düşük | Düşük (veri kalitesi) | Orta | EXIT-01 |
| **CAP-11** DB-level veri bütünlüğü | Uygulama-katmanı uniqueness→DB constraint | Kimlik/credential uniqueness DB-level YOK, app-level | — (OD-01 zemin) | TARGET / NOT_IMPLEMENTED | DATA-001 (P3) | OD-01 CLOSED (zemin); kapı **OD-03 BLOCKING** | CAP-01 ile ortak | Orta (constraint + veri temizliği) | Düşük-Orta | Yüksek | EXIT-01 |
| **CAP-12** Güçlü çekirdek koruması | Preserve-class regresyon = stop-condition | (aşağıda §6.3 tam-9 milestone) | tüm Phase 1 | korunacak (2 kanıt kademesi) | — | — | **her Wave'de characterization-test-first (SEQ-06)** | Yok | Kritik (regresyon yasak) | Karışık | EXIT-02 |

## 3. Corrected Current-to-Target Software Architecture Map (14 alan, redakte)

*(CURRENT → INTERMEDIATE FOUNDATION → TARGET → REQUIRED DECISIONS → REQUIRED DELIVERY UNITS (provisional/NON-ID). PUBLIC CONTENT RULE: capability/mekanizma seviyesi; somut dosya/route/metot/query verilmez.)*

| Alan | CURRENT | INTERMEDIATE FOUNDATION | TARGET | REQUIRED DECISIONS | DELIVERY UNITS (provisional/NON-ID) |
|---|---|---|---|---|---|
| Identity/actor | Formal Person aggregate absent; üç profil + optional unique User↔profile linkage | — | Person kanonik + UserAccount ayrımı (OFF-INV-01) | OD-01 CLOSED · OD-02/03/07 OPEN | *person-foundation* → *membership/employment ayrışması* |
| Membership/Employment | Ayrı model yok (profile gömülü, temporal yok) | — | OrganizationMembership + Employment ayrı, active-state ayrı (OFF-INV-02) | OD-03 BLOCKING · OD-04 DEFERRED | *employment/membership subsystem* (NEW) |
| Credential | Ayrı model yok (profile kolonları, DB-unique yok, expiry yok) | — | LawyerCredential first-class + uniqueness + temporal | Gap-A/B owner triage | *credential subsystem* (NEW) |
| Org hierarchy | Hiyerarşi şema temeli (zero-consumer) + config dizileri | I1 (teslim) | manager/team-scope davranışsal (OFF-INV-05); team hiyerarşiden türetilir | OD-08 CLOSED · Gap-F | *object-scope enforcement* (hiyerarşi-consumer) |
| Title/Role/Permission | Capacity-türevi runtime + Json/bool + izin şema temeli (zero-consumer) | E1 (teslim) | Title≠SystemRole≠Grant tutarlı; consumer-migration SHADOW→cutover | OD-05/09 CLOSED · D (finans-bayrağı product) | *consumer-migration (SHADOW)* → *cutover* |
| Assignment/Responsibility | 3-katman + J1/K1 gate CURRENT | J1+K1 baseline | eligibility tüm yüzeylerde (toplu atama, terfi anı) | OD-10 CLOSED · ASSIGN-4d DEFERRED · rol/kapasite POLICY | *assignment-eligibility tam zincir* |
| Delegation/Approval | Person-correlated hybrid self-approval guard CURRENT; iç-onay bayrağı aktif; ApprovalAuthority türetilmiş | SLICE-02 çekirdek | ApprovalAuthority scope/amount/validity + Delegation lifecycle | OD-12/13 BLOCKING · OD-06 | *delegation/ApprovalAuthority subsystem* (NEW) |
| Lifecycle/Offboarding | Offboarding wiring CURRENT (tx'li); reactivation asimetrik | A wiring | tam orkestrasyon (OFF-INV-07); reactivation≠rehire davranışsal | OD-16 non-blocking · OD-03/04 | *offboarding orchestration* (REQUIRES session) |
| Audit attribution | FK'siz aktör kimliği, snapshot yok | — | domain audit standardı (OFF-INV-08) + effective-context | kapı yok (karar-bağımsız); register-intake pending | *audit-attribution standard* (enabler) |
| Session/Authz enforcement | Stateless token, revocation yok; object-scope case-membership türevi | — | session hesap+membership state'ine bağlı; revocation (OFF-INV-06) | OD-14/15 CLOSED; blast-radius kapısı | *session-freshness subsystem* (NEW) |
| Privacy/read-models | Liste+case-embedded mask + edit-safe CURRENT | F1+H1 | tüm projeksiyon yüzeyleri (detail/export/unmask) OFF-INV-10 | OD-18 CLOSED; unmask governance (BLOCKED) | *detail/export masking* (bağımsız) + *unmask policy* (CAP-03'e bağlı) |
| Capacity/Workload | Projection-only, canonical writer yok | — | güvenilir read-model (OFF-INV-09) | OD-19 BLOCKING | *read-model reliability* |
| Org automation/non-human | Tipli write-envelope substrate (dar consumer); first-class actor model yok | envelope substrate | first-class non-human actor (gerekirse) | Gap-G (REVALIDATION REQUIRED) | (owner triage, henüz kapsamsız) |
| Data integrity | app-level uniqueness/cardinality | — | DB-level constraints kimlik kararlarıyla tutarlı | OD-01 zemin · OD-03 BLOCKING | *db-constraint hardening* |

## 4. Corrected Dependency and Gate Matrix

`dependsOn` otomatik strict-prerequisite SAYILMADI; her kapı `lifecycleStatus/resolutionMode/gateEffect/repository-surface` üzerinden ayrı doğrulandı.

| Kapı | Etkilediği CAP | Gerçek gate sınıfı | Strict blocker? | Safe default? |
|---|---|---|---|---|
| OFF/OD-03 (Employment) | CAP-01, CAP-06, CAP-11 | owner-decision (BLOCKING) | **EVET** | B mevcut |
| OFF/OD-07 (Tenant↔Org) | CAP-01 | owner-decision (BLOCKING, en ağır migration düğümü) | **EVET** | B mevcut |
| OFF/OD-12 (approval seviyeleri) | CAP-08 | owner-decision (BLOCKING) | **EVET** | B mevcut |
| OFF/OD-13 (delegation kapsamı) | CAP-08 | owner-decision (BLOCKING) | **EVET** | B mevcut |
| OFF/OD-19 (workload amacı) | CAP-10 | owner-decision (BLOCKING, Product/HR) | **EVET** | B mevcut |
| OFF/OD-02 (çoklu membership) | CAP-01 | owner-decision (**OPEN / NON-BLOCKING** — register kaydı) | HAYIR (teyit ister) | B mevcut |
| OFF/OD-06 (FoundingLawyer) | CAP-08 | owner-decision (**OPEN / NON-BLOCKING**) | HAYIR (safe default) | B mevcut |
| OFF/OD-16 (offboarding sırası) | CAP-06 | owner-decision (**OPEN / CONFIRMATION-REQUIRED**) | HAYIR | B mevcut |
| OFF/OD-04 (external counsel) | CAP-01 | owner-decision (**DEFERRED**) | HAYIR (ertelendi) | — |
| **ASSIGN-4d (toplu atama)** | CAP-04 (bulk kısmı) | **SEPARATE PRODUCT DECISION (DEFERRED)** — 9 OFF/OD'den biri DEĞİL | bulk için EVET, baseline için HAYIR | A/C mevcut |
| finans-onay bayrağı niyeti (D) | CAP-03 | **product-decision** | HAYIR (dar hat) | — |
| unmask governance/mekanizma | CAP-07 (yalnız raw-reveal) | governance/product-decision (BLOCKED) | detail/export için HAYIR; unmask için EVET | — |
| CAP-05 (session altyapısı) | CAP-06 | **runtime/architectural prerequisite (ters çevrilemez)** | **EVET** | — |
| **CAP-09 (audit standard)** | CAP-02/03/04 | **EVIDENCE/AUDIT ENABLER — SOFT prerequisite; davranışsal enforcement'tan ÖNCE önerilir; hard blocker DEĞİL** | **HAYIR** (yokluğu ayrı-ratifiye P1 dilimini otomatik bloke ETMEZ) | — |
| İzin/hiyerarşi şema temelleri | CAP-02/03 | schema prerequisite — **TESLİM EDİLDİ** | ✓ karşılandı | — |
| RCV / diğer domain | — | **cross-domain (yalnız tüketici)** | OFFICE'i bloke etmez | OFF-P2-BND-03/04 |

**Karar dağılımı özeti (DÜZELTİLMİŞ):** 9 açık OFF/OD kararı = **BLOCKING (5): OD-03, 07, 12, 13, 19** · **OPEN/NON-BLOCKING veya CONFIRMATION-REQUIRED (3): OD-02, 06, 16** · **DEFERRED (1): OD-04**. **ASSIGN-4d ayrı bir product decision'dır ve 9 açık OFF/OD kararından biri DEĞİLDİR.** OD-19 CAP-10'u (Read-Model, Enablement kümesi) bloke eder — Identity & Approval kümesini DEĞİL.

## 5. Corrected Owner / Product Decision Queue

| Küme | Kararlar | Etkilediği CAP | Strict blocker? | Safe default? | Birlikte-analiz | Ayrı verdict? |
|---|---|---|---|---|---|---|
| CLOSED / binding (yeniden açılmaz) | OFF/OD-01, 05, 08, 09, 10, 11, 14, 15, 17, 18, 21 | tüm hedef zemini | — | — | — | — |
| OPEN / blocking | OFF/OD-03, OFF/OD-07 | CAP-01/06/11 | EVET | B | Identity/Employment kümesi (OD-02/03/04/07) | EVET |
| OPEN / blocking | OFF/OD-12, OFF/OD-13 | CAP-08 | EVET | B | Approval/Delegation kümesi (OD-06/12/13) | EVET |
| OPEN / blocking | OFF/OD-19 | CAP-10 | EVET | B (planlama-only) | tek | EVET |
| OPEN / non-blocking veya confirmation-required | OFF/OD-02, OFF/OD-06, OFF/OD-16 | CAP-01/08/06 | HAYIR (teyit) | B | ilgili küme içinde | teyit yeterli |
| DEFERRED | OFF/OD-04 | CAP-01 | HAYIR | — | Identity kümesi | EVET (yeniden-aç) |
| PRODUCT DECISION (ayrı, OFF/OD DEĞİL) | ASSIGN-4d (toplu atama), finans-onay bayrağı niyeti (D) | CAP-04, CAP-03 | HAYIR (dar) | A/C — | ürün-niyeti | EVET |
| GOVERNANCE gate | unmask governance/mekanizma | CAP-07 (raw-reveal) | detail/export HAYIR; unmask EVET | — | tek | EVET |
| Canonical-gap owner triage (Tur 2 §5a) | Gap A/B/C/D/F (evidence-qualified) + E/G (HISTORICAL CANDIDATE / REVALIDATION REQUIRED) | CAP-01/08/09 | HAYIR (triage) | — | credential kümesi (A/B) | triage |
| Engineering-only | şema-temeli consumer-bağlama mekaniği | CAP-02/03 | HAYIR | — | — | HAYIR |

*Yeni owner kararı verilmedi; yeni canonical decision ID üretilmedi; hiçbir CLOSED karar yeniden açılmadı.*

## 6. Program Increments

*(Increment'ler ANALYSIS LABEL / NON-ID; takvim/yetki üretmez. **6 capability-bearing delivery increment (INC-A..F) + 2 cross-cutting governance/closure increment (INC-X, INC-Z).**)*

### 6.1 Capability-Bearing Delivery Increments (6)

| INC (NON-ID) | Outcome | Kapsanan CAP | Önkoşul karar | Adreslenen finding | Substrate hareketi | Risk sınıfı | Blast radius | Migration profili |
|---|---|---|---|---|---|---|---|---|
| **INC-A** Authorization Enforcement Activation | Şema temellerini tüketiciye bağla + tam atama-zinciri | CAP-02, CAP-03, CAP-04 | OD-05/08/09/10 CLOSED (hazır); D + ASSIGN-4d dar-kısımlar | BOLA-001(P1), SCP-001, RBAC-001, BOLA-002 | zero-consumer şema → SHADOW → enforcement | Yüksek | Orta-Yüksek | SHADOW/dual-write/cutover |
| **INC-B** Lifecycle & Session Integrity | Session-freshness + offboarding orkestrasyonu | CAP-05, CAP-06 | OD-14/15/17 CLOSED; OD-16 teyit; OD-03/04 (CAP-06 kısmı) | SES-001(P1), SES-002, LIFE-001 | yok→session subsystem; wiring→tam orkestrasyon | Yüksek (auth çekirdeği) | Yüksek | additive→cutover |
| **INC-C** Audit & Read-Model Integrity | Audit-attribution standardı + read-model güvenilirliği | CAP-09, CAP-10 | kapı yok (CAP-09); OD-19 (CAP-10) | register-intake pending audit-evidence, OPS-001 | additive audit-standard; read-model reliability | Düşük-Orta | Düşük | additive |
| **INC-D** Privacy Completion | Detail/export masking (bağımsız) + unmask policy (CAP-03'e bağlı) | CAP-07 | OD-18 CLOSED; unmask governance (yalnız raw-reveal kapısı) | PRIV-001 | F1/H1→detail/export | Orta | Düşük-Orta | additive/hardening |
| **INC-E** Identity & Data-Model Foundation | Person/Employment/Membership/Credential ayrışması + DB constraints | CAP-01, CAP-11 | OD-03/07 BLOCKING; OD-02 teyit; Gap-A/B | en ağır remap + backfill | Yüksek (NEW subsystem + migration) | **Çok Yüksek** | EXPAND/BACKFILL/SHADOW/RECONCILE/CUTOVER |
| **INC-F** Approval & Delegation Model | ApprovalAuthority + Delegation lifecycle (aktör tarafı) | CAP-08 (delegasyon) | OD-12/13 BLOCKING; OD-06 | — (ADR-009/DBIND sınırı) | türetilmiş→first-class ApprovalAuthority/Delegation | Yüksek (finansal onay) | Orta | additive→cutover |

### 6.2 Cross-Cutting Governance / Closure Increments (2)

| INC (NON-ID) | Outcome | Kapsam | Önkoşul | Risk | Blast |
|---|---|---|---|---|---|
| **INC-X** Decision-Package Hygiene | 9 açık OFF/OD + program-kapıları (unmask governance, ASSIGN-4d, finans-bayrağı, workload) için karar-hazır paketler | OBJ-04 / DLV-07 (tüm CAP'lere girdi) | — (SEQ-04: her an, hiçbir şeyi beklemez) | Düşük (docs) | Yok |
| **INC-Z** Phase Exit & Reconciliation | EXIT-01..05 kapanış paketi + governance mutabakat | DLV-08 + EXIT criteria | tüm Wave'ler disposition aldıktan sonra | Düşük (docs) | Yok |

### 6.3 CAP-12 Preserve-Class (tam-9 milestone, evidence-tier nitelikli)

Her gelecek delivery unit, aşağıdaki uygulanabilir davranışı, şema temelini ve characterization kanıtını KORUMAK zorundadır (regresyon = stop-condition, SEQ-06):

```text
BEHAVIORAL / ENFORCEMENT:
  SLICE-02  · CANDIDATE-A · CANDIDATE-F1 · CANDIDATE-H1 · CANDIDATE-J1 · CANDIDATE-K1
BEHAVIOR-NEUTRAL CONSOLIDATION:
  CANDIDATE-C
STRUCTURAL FOUNDATIONS:
  CANDIDATE-E1 · CANDIDATE-I1
```
(a) repository-teslimatlı üyeler CURRENT kanıt taşır; (b) evidence-baseline gözlemli çekirdek davranışlar REVALIDATION_REQUIRED mirası taşır (canonical HEAD'e karşı yeniden doğrulanmadan tek başına kanıt sayılmaz — MASTER-SYNTHESIS CAP-12).

## 7. Proposed Wave Architecture (PROPOSED / NON-CANONICAL / NOT_SELECTED)

*(Descriptive adlar PRIMARY; parantez-içi kısa etiket yalnız ANALYSIS LABEL / NON-ID. Hiçbir Wave seçilmedi/başlatılmadı.)*

| # | Wave (descriptive — PRIMARY) | Analiz-etiketi (NON-ID) | Capability cluster | Bağımlılık gerekçesi | Owner-decision kapıları | Risk/blast | Validation | Kapanış kriteri | Beklenen residual |
|---|---|---|---|---|---|---|---|---|---|
| 1 | **Enablement & Decision-Clearing** | *W-P2-α* | CAP-09, CAP-10, INC-X | Karar-bağımsız; CAP-09 downstream enforcement için önerilen enabler; SEQ-04 | OD-19 (CAP-10); diğerleri paket-üretimi | Düşük | additive + characterization | audit-standard CANONICAL + karar-paketleri owner-önünde | 9 karar owner-kapısında |
| 2 | **Authorization Enforcement** | *W-P2-β* | CAP-02, CAP-03, CAP-04 | Şema temelleri teslim (SEQ-02 additive-first tamam); OD-08/05/09/10 CLOSED; CAP-09 (küme 1) **önerilen enabler** | D (finans-bayrağı), ASSIGN-4d, rol/kapasite POLICY | **Yüksek (P1 BOLA-001)** | pozitif/negatif senaryo + differential regression + SHADOW | object-scope ENFORCED + izin cutover başladı | export/unmask + toplu-atama policy |
| 3 | **Lifecycle, Session & Privacy** | *W-P2-γ* | CAP-05, CAP-06, CAP-07 | CAP-06 REQUIRES CAP-05 (ters çevrilemez); OD-14/15/17/18 CLOSED | OD-16 teyit; unmask governance (yalnız raw-reveal); OD-03/04 (CAP-06 kısmı) | **Yüksek (auth çekirdeği + P1 SES-001)** | characterization-first (CAP-12) + regression | session+offboarding CANONICAL; detail/export masking teslim | unmask-governance kararına bağlı kalan |
| 4 | **Identity & Approval Foundations** | *W-P2-δ* | CAP-01, CAP-08, CAP-11 | En ağır; **4 hard owner-decision blocker: OD-03, OD-07, OD-12, OD-13**; kimlik remap tüm downstream'i etkiler | OD-02/03/04/06/07/12/13 + Gap-A/B/C | **Çok Yüksek (NEW subsystem + migration)** | EXPAND/BACKFILL/SHADOW/RECONCILE/CUTOVER + sign-off | external-counsel/multi-employment (owner) |
| 5 | **Phase Exit & Reconciliation** | *W-P2-Ω* | EXIT criteria | Tüm Wave'ler kapanış-disposition aldıktan sonra | owner phase-closure kararı | Düşük | Master Register kontrolü | Phase 2 CLOSED / COMPLETE WITH RECORDED RESIDUALS | owner-gated future scope |

*5 Wave — küçük-doldurma Wave üretilmedi; her Wave gerçek bir bağımlılık-kümesine karşılık gelir. TÜMÜ PROPOSED / NON-CANONICAL / NOT_SELECTED.*

## 8. Provisional Workstream / Candidate Inventory (PROVISIONAL / NON-CANONICAL / NON-ID)

*(Descriptive/geçici etiketler; stable/canonical Candidate ID üretilmedi. "İlk-güvenli-dilim adayı" = first-safe-slice değerlendirmesi, seçim DEĞİL.)*

**Enablement & Decision-Clearing (küme 1):**
| Provisional etiket (NON-ID) | Problem | Hedef invariant | Kategori | Readiness | Blocker | Blast | Şema/mig | BC risk | İlk-güvenli-dilim? |
|---|---|---|---|---|---|---|---|---|---|
| *audit-attribution-standard* | domain audit atıf standardı eksik | OFF-INV-08 | HARDENING/NEW | Yüksek | — (karar yok) | Düşük | olası additive alan | Düşük | **aday** |
| *read-model-reliability* | deny≠empty / kaynak / freshness | OFF-INV-09 | HARDENING | Orta | OD-19 | Düşük | yok | Düşük | kısmi |
| *decision-package-batch* | 9 açık karar + program-kapıları paketlenmemiş | — | GOVERNANCE | Yüksek | — (SEQ-04) | Yok | yok | Yok | **aday** |

**Authorization Enforcement (küme 2):** *object-scope-first-slice* (CAP-02, HARDENING/WIRING, BOLA-001 P1, karar-bağımsız, hiyerarşi-consumer, **ilk-güvenli-dilim adayı**) · *permission-consumer-migration-shadow* (CAP-03, MIGRATION, SHADOW-first additive, D'ye dar bağlı) · *assignment-eligibility-completion* (CAP-04, HARDENING, ASSIGN-4d/POLICY dar-bağlı).

**Lifecycle, Session & Privacy (küme 3):** *session-freshness-subsystem* (CAP-05, NEW SUBSYSTEM, auth blast-radius, additive→cutover) · *offboarding-orchestration* (CAP-06, WIRING/NEW, REQUIRES session) · *detail-export-masking* (CAP-07, HARDENING, **unmask'tan bağımsız**) · *raw-unmask-policy* (CAP-07, governance-bağlı, field-level authority gerektirir).

**Identity & Approval Foundations (küme 4):** *person-employment-foundation* (CAP-01, NEW SUBSYSTEM/MIGRATION, OD-03/07 BLOCKING, çok-yüksek blast) · *credential-subsystem* (CAP-01, NEW, Gap-A/B) · *db-constraint-hardening* (CAP-11, MIGRATION, OD-03) · *approval-authority-delegation* (CAP-08, NEW, OD-12/13 BLOCKING).

*Tüm etiketler descriptive/provisional; hiçbir canonical Candidate ID üretilmedi.*

## 9. Non-Authorizing Delivery Roadmap (OWNER-SELECTION REQUIRED)

```text
Anayasal sıra kısıtı (SEQ): karar → foundation(additive) → wiring → enforcement → migration;
koruma (CAP-12 characterization-first) her adımdan önce gelir.

PARALEL YÜRÜYEBİLİR (karar-bağımsız, düşük çakışma):
  Enablement & Decision-Clearing (audit-standard + read-model + karar-paketleri)
  Authorization Enforcement → object-scope-first-slice (CAP-02, BOLA-001 P1)
  [audit-standard, enforcement'ın atıf izini standartlaştıran SOFT enabler'dır;
   yokluğu ayrı-ratifiye P1 dilimini otomatik bloke ETMEZ]

BLOKE ZİNCİR (ters çevrilemez / schema-önce):
  CAP-05 session-freshness ─REQUIRES─▶ CAP-06 offboarding   (Lifecycle Wave içi sıra)
  İzin/hiyerarşi şema temeli (TESLİM) ─▶ CAP-03/CAP-02 consumer (SHADOW→cutover, SYS-MIG-002/007)

HIGH-RISK NEW-SUBSYSTEM (en sona, en çok karara bloke):
  Identity & Approval Foundations — 4 hard owner-decision blocker (OD-03/07/12/13) açık

DÜŞÜK-RİSK ADDITIVE/HARDENING (erken alınabilir):
  audit-standard · read-model · detail/export-masking · decision-packages

CHECKPOINT'ler: her Wave kapanışında characterization-regression + Master Register mutabakatı +
capability-statü kanıt-izi (statü authority = OFFICE-DELIVERY-MANIFEST).

MILESTONE SINIFLARI (Phase 1 emsali): her teslim = PHASE 2 MILESTONE 0N
(IMPLEMENTED → MERGED → CANONICAL → CONSUMED zinciri, delivery-katmanında).

EXIT'e giden yol: küme 1+2 (enforcement çekirdeği) → küme 3 (lifecycle/privacy)
→ küme 4 (identity/approval, kararlar açılırsa) → küme 5 (phase-close).
```
Takvim tarihi / sprint taahhüdü / otomatik-öncelik ÜRETİLMEDİ. NON-AUTHORIZING; her adım owner'ın ayrı seçim + GO'suna tabidir.

## 10. Phase Exit Coverage Matrix

| EXIT | Kapsam | Kapsayan increment/Wave | Boşluk/bağımlılık |
|---|---|---|---|
| **OFF-P2-EXIT-01** (her DLV kanıtlı-teslim veya açık-disposition) | TAM (proposed) | INC-A..F + INC-Z | DLV-06 unmask-governance kararına, DLV-03 ASSIGN-4d'ye bağlı — disposition yolu açık |
| **OFF-P2-EXIT-02** (capability statü güncel/kanıt-izli) | TAM | her Wave closure (cross-cutting) | statü authority = manifest |
| **OFF-P2-EXIT-03** (tüm bulgular register'lı) | TAM | INC-X/DLV-08 + her enforcement + register-intake pending audit-evidence | register-intake pending kalem küme 1'de adreslenir |
| **OFF-P2-EXIT-04** (kapanış paketi + residual envanteri) | TAM | Phase Exit & Reconciliation (INC-Z) | WAVE 3 emsali |
| **OFF-P2-EXIT-05** (governance mutabakatı) | TAM | canonicalization + INC-Z | — |

**Sessizce kapsam-dışı bırakılan exit criterion YOK.** SC-01..06 success criteria kanıt-bağlı; SC-02 bulgu-kapanışı otoritesi = `master-triage-register.md`. OD-bağımlı kalemler (DLV-03/06) "owner-disposition alır" yolu ile EXIT-01'e uyumlu; cross-domain (RCV tüketici) EXIT'e bloke değil (BND-03/04).

## 11. First-Unit Options (max 3 — SEÇİM YOK)

| Seçenek | Aday (descriptive) | Neden şimdi | Değer | Risk | Blast | Önkoşul | Downstream unlock | Sıralama notu |
|---|---|---|---|---|---|---|---|---|
| **① Highest risk-reduction** | Object-scope first slice (CAP-02) | En yüksek severity açık bulgu **BOLA-001 (P1)**; OD-08 CLOSED (karar-bağımsız); hiyerarşi şeması hazır | P1 güvenlik | Orta-Yüksek (davranış-değiştiren) | Orta | first-slice re-scope; audit-standard **önerilir ama zorunlu değil** | CAP-02 tam-kapsam + RCV tüketicisi | audit-standard'dan sonra red-izi daha temiz — ama onu beklemek zorunda değil |
| **② Lowest-risk enabling** | Audit-attribution standard (CAP-09) | Additive, karar-bağımsız (kapı yok), enforcement'ın atıf izini standartlaştıran **SOFT enabler**; register-intake pending audit-evidence'ı da adresler | denetlenebilirlik + downstream-kolaylaştırıcı | Düşük | Düşük | — | sonraki enforcement dilimlerinin "kim/niye red" izi | önce alınırsa ①'i güçlendirir; ① için ön-koşul DEĞİL |
| **③ Decision/governance-clearing** | Open decision-package batch (INC-X) | 9 açık karar downstream'in çoğunu (küme 4/3) kilitliyor; SEQ-04: her an, hiçbir şeyi beklemez, **sıfır blast** | karar-tıkanıklığını açar | Yok (docs-only) | Yok | — | küme 4/3'ün hard-kararları | enforcement işini yetkilendirmez, hazırlar |

## 12. Recommended First Owner-Gated Unit (NON-BINDING — SEÇİM YAPILMADI)

**Non-binding öneri: ② audit-attribution standard (CAP-09)** — gerekçe: en düşük blast-radius (additive, karar-bağımsız, kapısı yok); sonraki enforcement dilimlerinin atıf izini standartlaştıran **SOFT enabler**; register-intake pending audit-evidence'ı yoluna koyar; CAP-12 preserve-class'a regresyon riski minimum. **Bu bir SOFT enabler'dır, hard prerequisite DEĞİLDİR** — yokluğu ① object-scope P1 dilimini otomatik bloke etmez. **Alternatif eşit-savunulabilir seçenekler:** ① object-scope (en yüksek güvenlik değeri, P1) veya ③ decision-package-batch (tıkanıklık-açıcı, sıfır-risk). **Üç seçenek ayrı bir owner kararıyla karşılaştırılıp seçilmelidir; bu belge hiçbirini seçmez; öneri otomatik seçim haline gelmez.**

## 13. Residual and Evidence Qualifications

- Hiçbir STF-PRD bulgusu kapanmadı; Phase 1 CLOSED / COMPLETE WITH RECORDED RESIDUALS statüsü finding-kapanışı DEĞİLDİR (delivery closure ≠ finding closure).
- `zero-consumer` şema temelleri (izin/hiyerarşi) yapısal CURRENT'tır; runtime enforcement DEĞİLDİR (structural foundation ≠ runtime enforcement).
- CAP-08 çekirdeği ve preserve-class'ın (b) grubu REVALIDATION_REQUIRED mirası taşır — canonical HEAD'e karşı yeniden doğrulanmadan tek başına kanıt sayılmaz.
- 7 Tur 2 canonical-gap adayı (A-G) NON-CANONICAL owner-triage adayıdır; E (audit-actor) ve G (service/non-human actor) **HISTORICAL CANDIDATE / REVALIDATION REQUIRED**; hiçbiri kanonik finding değildir, severity/priority/implementation-authorization ALMAZ.
- SES-001 register-tazelik gözlemi ayrı, non-blocking, owner-gated bir görevdir; bu belge `OFFICE-RISK-REGISTER.md`'yi DEĞİŞTİRMEZ ve SES-001'in kapandığını İDDİA ETMEZ.
- Audit-attribution gözlemi **non-canonical evidence / register intake pending**'dir; yeni kanonik finding DEĞİLDİR.

## 14. Non-Selection and Non-Authorization Statement

Bu belge bir **decomposition blueprint'idir**; şunları YAPMAZ: hiçbir Wave seçmez/başlatmaz; hiçbir first delivery unit seçmez; hiçbir canonical Wave/Candidate/Task/Contract kimliği üretmez; hiçbir Implementation Contract yazmaz/ratifiye etmez; hiçbir implementation authorization vermez; hiçbir açık owner/product kararını vermez; hiçbir CLOSED/CANONICAL kararı yeniden açmaz; hiçbir kod/schema/migration değişikliği yapmaz; hiçbir risk-register verdict/severity değiştirmez; hiçbir mutable delivery statüsü taşımaz (o `OFFICE-DELIVERY-MANIFEST.md`'dedir). Phase 2'nin işe dönüşmesi, owner'ın ayrı **First-Unit Selection** kararı + sonraki decomposition boru hattı adımlarıyla (OFF-P2-ROADMAP §4) olur.

## 15. Document Self-Check

```text
- 12/12 capability kapsandı mı:                                YES (§2)
- 14 mimari alan current-to-target eşlendi mi:                 YES (§3)
- 9 açık OFF/OD doğru sınıflandı mı (5 block / 3 non-block /   YES (§4/§5): BLOCKING 03,07,12,13,19;
  1 deferred; ASSIGN-4d ayrı product-decision):                NON-BLOCK 02,06,16; DEFERRED 04; ASSIGN-4d AYRI
- 6 capability-bearing + 2 cross-cutting increment:            YES (§6.1/§6.2)
- 5 proposed Wave (descriptive-primary, NON-ID):              YES (§7)
- CAP-09 soft enabler (hard blocker DEĞİL):                    YES (§2/§4/§9/§12)
- CAP-07 detail/export bağımsız, yalnız unmask CAP-03'e bağlı: YES (§2/§3/§8)
- CAP-12 preserve-class tam-9 milestone (evidence-tier):       YES (§6.3)
- Terminoloji: optional-unique-linkage / Person-correlated     YES (§2/§3) — "K1 bridge" ve
  hybrid / non-canonical audit-evidence:                       "formal Person aggregate" ibareleri düzeltildi
- Provisional label = ANALYSIS LABEL / NON-ID:                 YES (künye + §6/§7/§8)
- Mutable delivery statü taşınıyor mu:                         NO (authority = OFFICE-DELIVERY-MANIFEST)
- Wave/first-unit seçildi mi / authorization üretildi mi:      NO (§11/§12/§14)
- CLOSED karar açıldı / yeni canonical ID üretildi:            NO
- Tur 2 historical ID kanonik kullanıldı mı:                   NO (§1/§13)
- PUBLIC CONTENT RULE (somut mekanizma detayı):                NO (capability seviyesi)
```
