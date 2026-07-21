# DEBTOR DBP-04 — DOMAIN MODEL, LEGAL STATE & LEGALGUARD ARCHITECTURE v1.0

> **Canonical Phase 1 L3 artifact.** Bu belge, `DEBTOR CANONICAL DOMAIN BLUEPRINT CHARTER v1.0`
> §9 kapsamındaki DBP-04 work package'ının owner-onaylı çıktısıdır (Charter artefaktları #12
> Legal Fact Dictionary'nin aday katmanı · #13 LegalGuard Rule Catalogue'un yapı/metadata
> katmanı · #14/#15'e girdiler). İçerik GO-ANALYZE (DBP-04 R0.1 → R0.2 → R0.2.1) çıktısıdır;
> bu GO-DOCS turunda yeni analiz, owner kararı, LDO sign-off'u veya mimari üretilmemiştir.
> **Hiçbir hukuki kural içeriği bu belgeyle doğrulanmış/yürürlükte SAYILMAZ** — hukuki içerik
> ve etkiler LDO SIGN-OFF PENDING'dir.

---

## 1. Document Status and Authority

```text
PROGRAM            : BORÇLU PLATFORMU
PHASE              : PHASE 1 — CANONICAL DOMAIN BLUEPRINT
WORKSTREAM         : DBP-04 — DOMAIN MODEL, LEGAL STATE & LEGALGUARD ARCHITECTURE (L3)
VERSION            : v1.0 (R0.2.1 onaylı analizin konsolidasyonu + GO-DOCS pre-normalizasyonu)
PRODUCED UNDER     : GO-ANALYZE (R0.1 → R0.2 LEGAL MODEL CORRECTION → R0.2.1 MICRO-CORRECTION);
                     canonicalization: GO-DOCS
ARTIFACT STATUS    : OWNER-APPROVED (2026-07-15; onay kapsamı [A]–[L] — bkz. §21)
REVIEW DISPOSITION : OWNER-APPROVED / LDO SIGN-OFF PENDING — yeni bir repository lifecycle
                     state'i DEĞİLDİR; yalnız review disposition'dır. Hukuki kural içerikleri,
                     OF-02/03/04 alan setleri, DA-03..07 türetim kuralları, legal-condition
                     adları/etkileri, LG-01..10 hukuki içerikleri ONAYLANMAMIŞTIR.
CANONICAL STATUS   : CANONICAL UPON APPROVED MERGE TO MAIN
ANALYSIS BASE (PIN): analiz turları origin/main @ a170da3e; GO-DOCS drift kontrolü ve bu
                     belgenin base'i origin/main @ 18da1ed7 (fetch 2026-07-15; DBP-04 girdi
                     kaynaklarında a170da3e→18da1ed7 arası SIFIR değişiklik — drift yok)
IMPLEMENTATION AUTHORITY: NONE — bu belge hiçbir model/kural/servis için implementasyon,
                     schema, migration, cutover, workstream açılışı veya register
                     genişletmesi yetkisi üretmez (SYS-GOV-003, SYS-DEC-003, SYS-GOV-008).
KİMLİK UZAYI       : DC/OF/DA/AE/HD/PCI/AX/PL kimlikleri DBP-04-local PROPOSED'dur (DBP-12'ye
                     kadar). LG-01..10, MS/DEBTOR-GOVERNANCE kataloğunun mevcut kimlikleridir —
                     bu belge YENİ LG kuralı üretmez. BC/OBD kimlikleri DBP-03'ündür.
NAMING CONVENTION  : §3'teki adlandırma şablonu PROPOSED NAMING CONVENTION — OWNER REVIEW
                     statüsündedir; repository-genel bağlayıcı adlandırma kuralı DEĞİLDİR.
```

**Authority basis.** İki eksen (SYS-AUTH-006): Semantic — `SYSTEM-CONSTITUTION.md` →
`DEBTOR-GOVERNANCE.md` → ADR. Execution/safety — `AGENTS.md` + task authorization.
`SYS-GOV-004`: yürürlükteki mevzuat bu belgeden üstündür; hukuki yorum belirsizse sistem
fail-closed davranır ve LDO sign-off'suz production authority oluşmaz.

## RELATED DOCUMENTS

- Charter: `project/docs/blueprint/DEBTOR-CANONICAL-DOMAIN-BLUEPRINT-CHARTER-v1.0.md`
- DBP-02 (L1): `project/docs/blueprint/DEBTOR-DBP-02-BUSINESS-CAPABILITY-VALUE-STREAM-v1.0.md`
- DBP-03 (L2): `project/docs/blueprint/DEBTOR-DBP-03-BOUNDED-CONTEXT-MAP-v1.0.md`
- Domain Law: `project/docs/governance/DEBTOR-GOVERNANCE.md` (§3/§4/§5/§7/§8)
- Legal-time tasarımı: `project/docs/design/legal-time-authority-rebase.md` (6 rejim + Owner
  Decision 3 canonical legal time model + PR-1..6 gerçekleşen kapsam kayıtları)
- CPE spec: `project/.kiro/specs/case-policy-engine/requirements.md` + `design.md`
- Phase 0 kapanışı: `project/docs/governance/DEBTOR-PHASE-0-COMPLETION-ROADMAP.md`
- Kanıt katmanı: `project/docs/analysis/debtor-master-synthesis-v2.md` (MS §U LG kataloğu)

---

## 2. Statü Sözlüğü

```text
AUTH / MAT / EVD / DEC(DECISION STATUS) / S-OWN / HOST / EXEC  — DBP-02/03 sözlüğüyle aynı.
DEC ∈ { CANONICALLY DEFINED (CD) · PROPOSED · OWNER DECISION REQUIRED (ODR) ·
        VERIFICATION REQUIRED (VR) }
LSO  = LEGAL-SIGN-OFF REQUIRED (LDO) — hukuki içerik/etki onayı; owner onayından AYRIDIR.
NI   = NOT_IMPLEMENTED.
Aksi yazılmadıkça: S-OWN=DEBTOR (BC-05/06/13) · HOST=DEBTOR api (tebligat/legal-deadline/
policy-engine modülleri) · EXEC=NOT AUTHORIZED (implementasyon ayrı GO ister).
```

---

## 3. Concept Taxonomy (4 sınıf) — OWNER-APPROVED [A]

```text
A. OBSERVED LEGAL FACT        : dış dünyada gerçekleşen, kanıtla kaydedilen olgu. Ad: *Record/*Occurrence.
B. DERIVED LEGAL ASSESSMENT   : fact'ler + VERSİYONLU hukuk kuralından türetilen değerlendirme. Ad: *Assessment.
C. ACTION ELIGIBILITY DECISION: belirli bir aksiyon için versiyonlu değerlendirme çıktısı. Ad: *Assessment/*Evaluation.
D. HUMAN DECISION / APPROVAL  : yetkili insanın teyit/onay kaydı. Ad: *Approval/*Verification.
İLKE: "fact" adı B/C/D için kullanılmaz. Her B/C kaydı girdi-fact referansları + rule version taşır.
STATÜ: PROPOSED NAMING CONVENTION — OWNER REVIEW (repository-genel bağlayıcı kural değildir).
```

### 3.1 Domain Concept Catalog (ubiquitous language — özet)

| DC | Kavram | Sınıf/anlam | AUTH·MAT·EVD |
|---|---|---|---|
| DC-01 | LegalServiceDateAssessment (tebliğ-sayılma) | B — OF-01 + 6-rejim kuralından türetilir | CURRENT·PARTIAL·VERIFIED |
| DC-02 | PeriodStart (`legalServiceDate + 1`) | B (kural bileşeni; Owner Decision 3) | CURRENT·PARTIAL·VERIFIED |
| DC-03 | Paralel süreler + `nextActionWaitingDays = max(...)` | B (DA-02 bileşeni); hardcode gün YASAK | CURRENT·PARTIAL·VERIFIED |
| DC-04 | NextActionType (7 tür-özgü yetki tipi) | tür-özgü sonuç sözlüğü; universal finalization YOK | CURRENT·PARTIAL·VERIFIED |
| DC-05 | ObjectionFiledRecord | A — itiraz başvurusu olgusu | NI·NONE·VERIFIED (yokluk) |
| DC-06 | SuspensiveEffectAssessment | B — durdurucu etki değerlendirmesi | NI·NONE — içerik LSO |
| DC-07 | FinalizationAssessment | B — tür-özgü kesinleşme değerlendirmesi; bugün üretilmiyor (PR-4 kararı: `finalizationDate` legacy-compat; UI "Kesinleşti" hükmü göstermez) | NI·NONE·VERIFIED |
| DC-08 | EnforcementCapabilityAssessment | B — cebrî icra kabiliyeti değerlendirmesi | NI·NONE |
| DC-09 | Legal Condition (kişi-düzeyi; temporal küme) | AX-C state ekseni; ROOT SUBJECT: ODR (Q1/OD-06) | NI·NONE·VERIFIED (`Debtor.legalStatus` şemada YOK) |
| DC-10 | EligibilityAssessment | C — aksiyon-bazlı karar kaydı | NI·NONE |
| DC-11 | LegalGuard / GuardRule / GuardEvaluation | hukuki kural kapısı; katalog otoritesi LDO | NI (katalog DOCUMENTED_ONLY)·NONE |
| DC-12 | CPE (PolicyDecision/Gate/FactStore/StateMachine) | merkezi AKSIYON-İZİN motoru; HIGH-risk fail-closed | CURRENT·PARTIAL·VERIFIED |
| DC-13 | HumanApproval (OfficeApproval REUSE — büro-içi) | D sınıfının mevcut altyapısı | CURRENT·PARTIAL |
| DC-14 | ProceedingType ≠ InstrumentType; MTS ayrı süreç sınıfı | sınıflandırma ilkesi (PR-3C) | CURRENT·PARTIAL·VERIFIED |
| DC-15 | WorkflowStage | Case OPERASYONEL akışı — hukuki state DEĞİL (SYS-LEGAL-001); `OBJECTION` stage'i fact'siz operasyonel etikettir | CURRENT·PARTIAL·VERIFIED |

---

## 4. Observed Legal Fact Record Candidates — OWNER-APPROVED [B] (yapı); alan setleri LSO

| OF | Olgu | Kanıt/kaynak | AUTH·MAT·EVD | DEC |
|---|---|---|---|---|
| OF-01 | Service occurrence (teslim / kapıya yapıştırma / muhtara teslim / e-ulaşma tarihi + rejim koşulları) | ServiceAttempt/Tebligat; insan-onaylı; NO-MOCK (LG-06) | CURRENT·PARTIAL·VERIFIED | CD (mevcut kayıt yolu) |
| OF-02 | ObjectionFiledRecord (itiraz başvurusu: tarih, mercii, kapsam iddiası, evrak) | icra dairesi/mahkeme evrakı | NI·NONE·VERIFIED (yokluk: şemada alan yok) | PROPOSED — alan seti **LSO** |
| OF-03 | CourtDecisionRecord (itirazın iptali/kaldırılması vb. karar) | mahkeme kararı evrakı | NI·NONE | PROPOSED — **LSO** |
| OF-04 | ExternalLegalConditionEvidence (ölüm/iflas/konkordato/tasfiye kaynak kaydı) | resmî kayıt/karar; CDC-06 ACL'den | NI·NONE | PROPOSED — **LSO** |
| OF-05 | Takip açılış/işlem olguları | UYAP/dosya kaydı (CDC-06C teyitli) | CURRENT·PARTIAL | CD (evidence-sınıfı) |

Record lifecycle: §12 normalizasyon tablosuna tabidir — bu katalog append-only/immutable
kanonik hükmü ÜRETMEZ (DBP-05 doğrulaması gereklidir).

---

## 5. Derived Legal Assessment Catalog — OWNER-APPROVED [C] (yapı); DA-03..07 kural içerikleri LSO

### 5.1 Negative-Fact / Source-Completeness kuralı

```text
RULE STATUS         : OWNER-APPROVED PROPOSED LEGAL-MODEL RULE (2026-07-15)
LEGAL CONTENT/EFFECT: LDO SIGN-OFF PENDING
KURAL               : "Sistemde itiraz kaydı yok → itiraz yapılmamıştır" çıkarımı ASLA kurulamaz.
                      Kayıt yokluğu bir OBSERVED FACT değildir; hukuki süreçte yalnız kapsamı
                      belgelenmiş bir COVERAGE ASSESSMENT sonucu kullanılabilir. Salt kayıt
                      yokluğu HİÇBİR finalization, enforcement-capability veya eligibility
                      ÜRETEMEZ. Owner onayı ve merge, hukuki içeriğe LDO sign-off verildiği
                      anlamına gelmez.
```

### 5.2 Katalog

| DA | Assessment | Girdi | Kural kaynağı | AUTH·MAT | DEC |
|---|---|---|---|---|---|
| DA-01 | LegalServiceDateAssessment | OF-01 + rejim | 6-rejim tablosu (rebase §3) | CURRENT·PARTIAL (persist: `tebligSayilmaDate`) | CD (kural seti owner-ratified) |
| DA-02 | DeadlineAssessment (`LegalDeadlineSnapshot`) | DA-01 + **PCI** (§8) | Owner Decision 3 / 6A.2 tür tablosu | CURRENT·PARTIAL | CD · lifecycle VR→DBP-05 |
| DA-03 | SuspensiveEffectAssessment | OF-02 (+tür) | takip-türü etki kuralları | NI·NONE | PROPOSED + **LSO** |
| DA-04 | FinalizationAssessment (tür-özgü; universal DEĞİL — §9 PL-D) | AX-A/AX-B durumları + DA-06 + tür kuralı | **LSO** | NI·NONE | PROPOSED + **LSO** — ön koşul: `DA-06 = NO_OBJECTION_FOUND_WITH_VERIFIED_COVERAGE` VEYA hukuki etkisi çözülmüş itiraz kaydı (OF-02+OF-03/DA-03); diğer tüm DA-06 sonuçları → DA-04 = NOT_EVALUABLE |
| DA-05 | EnforcementCapabilityAssessment (aksiyon-ailesi bazlı) | DA-04 + AX-C/DA-07 taraması | **LSO** | NI·NONE | PROPOSED + **LSO** |
| DA-06 | **ObjectionCoverageAssessment** | kaynak taramaları | **LSO** | NI·NONE | PROPOSED + **LSO** — sonuçlar: `OBJECTION_FOUND · NO_OBJECTION_FOUND_WITH_VERIFIED_COVERAGE · NOT_EVALUATED · SOURCE_COVERAGE_INCOMPLETE · CONFLICTING_INFORMATION`; zorunlu alanlar: checked sources · authoritative source · search scope · checkedAt/asOf · proceeding subject · evidence references · completeness status · rule/version · human verification reference |
| DA-07 | **LegalConditionCoverageAssessment** | kaynak taramaları | **LSO** | NI·NONE | PROPOSED + **LSO** — sonuçlar: `NO_KNOWN_RESTRICTION_WITH_VERIFIED_COVERAGE · UNKNOWN · NOT_EVALUATED · SOURCE_COVERAGE_INCOMPLETE · CONFLICTING_INFORMATION`; DA-06 ile aynı 9-alan şablonu; `NO_KNOWN_RESTRICTION` bir condition DEĞİL, coverage sonucudur |

**Yasak girdiler (DBP-02/03'ten devralınan sınır — o katmanlarda onaylı):** receipt/bakiye
(CC-01/02), skor, NBA veya AI çıktısı hiçbir OF/DA/AE'ye girdi olamaz (INV-06; SYS-AI-001;
SYS-LEGAL-001).

---

## 6. Action Eligibility Decision Catalog — OWNER-APPROVED [D]

| AE | Karar kaydı | İçerik |
|---|---|---|
| AE-01 | EligibilityAssessment (aksiyon × bağlam) | sonuç ∈ `ELIGIBLE / NOT_ELIGIBLE / NOT_EVALUABLE`; girdi OF/DA referansları + rule version; her değerlendirme YENİ kayıt. `NOT_EVALUABLE ≠ NOT_ELIGIBLE` (değerlendirilemedi ≠ hukuken uygun değil) |
| AE-02 | GuardEvaluation (LG kuralı × aksiyon) | `ALLOW/BLOCK/WARN/NOT_EVALUABLE` + kural versiyonu + girdi referansları |

---

## 7. Human Decision Record Catalog — OWNER-APPROVED [E]

```text
İLKE (OWNER-APPROVED PROPOSED LEGAL-MODEL RULE; hukuki teyidi LSO): İnsan onayı hukuki olguyu
YARATMAZ — ölümü, iflası, konkordatoyu veya itirazın yapılmış olmasını insan kaydı var etmez.
HD kayıtları yalnız şunları taşır: assessment'ın incelenmesi · kabul/red · işlemin yapılmasına
izin · sorumluluk + gerekçe kaydı.
```

| HD | Kayıt | Bağlandığı | Rol |
|---|---|---|---|
| HD-01 | **FinalizationAssessmentApproval** | DA-04'ün insan incelemesi/kabulü-reddi | ODR |
| HD-02 | ActionApproval | yüksek-risk aksiyon izni (haciz vb.) | kademe ODR |
| HD-03 | **LegalConditionVerification** | OF-04 evidence + condition kaydının doğrulanması | ODR |
| HD-04 | Tebligat sonucu kanonikleştirme onayı | OF-01 kaydı | ODR |

---

## 8. PCI — Proceeding Classification Input (**REFERENCE CONFIGURATION INPUT**)

| Alan | İçerik |
|---|---|
| Sınıf | **REFERENCE CONFIGURATION INPUT** — dış dünyada gerçekleşen observed legal fact DEĞİLDİR; derived assessment DEĞİLDİR; proceeding classification için versiyonlu ve kanonik configuration girdisidir |
| Source authority | `ProceedingClassificationService` + `legal-period-rule-matrix` (PR-3C; gizli fallback YOK) — CURRENT·PARTIAL·VERIFIED |
| İçerik | `proceeding type (ProceedingType/9) · subtype (Rental/Bankruptcy/JudgmentExecution) · classification version · unresolved status (PLEDGE/MORTGAGE/bağımsız EVICTION/PUBLIC_RECEIVABLE → UNRESOLVED) · evidence/configuration reference` |
| Tüketiciler | DA-02, DA-04/05, AE-01 |

---

## 9. ORTHOGONAL LEGAL MODEL — OWNER-APPROVED [F] (SUBJECT kararları AYRIK/ODR)

```text
STATE AXES (yalnız POZİTİF kayıtlı hukuki süreç durumları; OF tetikler):
  AX-A SERVICE / DEADLINE STATE : SERVED → WINDOW_OPEN → WINDOW_ELAPSED
      Kayıt bulunmaması otomatik "NOT_SERVED hukuki gerçeği" ÜRETMEZ; service occurrence
      (OF-01) kaydedilmeden AX-A state'i İLERLEMEZ/ATANMAZ — bilinmezlik coverage/verification
      katmanında kalır.
  AX-B OBJECTION / DISPUTE STATE: OBJECTION_RECORDED → DISPUTE_PENDING →
      RESOLVED_UPHELD | RESOLVED_REJECTED
      İtiraz bilgisi yokluğu/kaynak yetersizliği AX-B state'i DEĞİLDİR — yalnız DA-06
      ObjectionCoverageAssessment üzerinde gösterilir. Hukuki yokluk state'i üretilmez.
  AX-C PERSON LEGAL CONDITION   : temporal condition KÜMESİ (§11); tekil enum değil;
      "no known restriction" DA-07 coverage sonucudur, AX-C üyesi DEĞİLDİR.

ASSESSMENT / DECISION PLANES (state DEĞİL; versiyonlu KAYIT üretir, hiçbir state'i mutate etmez):
  PL-D Proceeding-Specific Legal Effect Assessment : DA-04/DA-05 çıktıları — tür-özgü sonuçlar
      (payment-demand-elapsed / objection-window-elapsed / {HACIZ|SALE|EVICTION|BANKRUPTCY|
      FORCED_*|FINALIZATION}_REQUEST-aday / NOT_EVALUABLE); NextActionType-hizalı; universal
      FINALIZED / universal finalizationEligibleDate YOKTUR.
  PL-E Action-Specific Eligibility Decision        : AE-01/AE-02 kayıtları.

Eksenler arası ve eksen→plane OTOMATİK dönüşüm YOK: pencerenin dolması (AX-A) kendiliğinden
kesinleşme/capability üretmez; her PL-D/PL-E sonucu ayrı değerlendirme kaydıdır.

LEGAL PROCEDURE STATE SUBJECT (AX-A/B ve PL-D'nin bağlandığı özne): OPEN — OWNER DECISION
REQUIRED. Adaylar: Case / CaseDebtor / EnforcementProceeding / CaseDebtor+Proceeding / kanıtla
başka özne. Not: bir dosyada birden çok borçlu VE birden çok takip yolu olabilir (şemada
ExecutionPath + çoklu CaseDebtor); tekil özne varsayımı erken.
LEGAL CONDITION SUBJECT (AX-C öznesi): OPEN — ODR (Q1/OD-06; Party-vs-Debtor).
```

---

## 10. Transition / Assessment Matrix — OWNER-APPROVED [G] (yapı); kural içerikleri LSO

Kolonlar: source dim/state · trigger OBSERVED fact · assessment rule (versiyonlu) · resulting
dim/state veya plane kaydı · human confirmation · rule ver. · unknown outcome · action impact.
Derived assessment hiçbir satırda trigger-fact olarak kullanılmaz.

| Source | Trigger OF | Assessment rule | Result | Human | Ver. | Unknown outcome | Action impact |
|---|---|---|---|---|---|---|---|
| AX-A (state yok) | OF-01 | DA-01 (rejim) | AX-A SERVED | HD-04 (rol ODR) | 6-rejim vX | rejim belirsiz → state atanmaz + NOT_EVALUABLE | bağımlı yüksek-risk komutlar BLOCK |
| AX-A SERVED | — (deterministik takvim gözlemi) | DA-02 | AX-A WINDOW_OPEN→WINDOW_ELAPSED | — | 6A.2 vX | tür UNRESOLVED → NOT_EVALUABLE | **başka eksene/plane'e otomatik etki YOK** |
| AX-B (state yok) | OF-02 | — (saf gözlem kaydı) | AX-B OBJECTION_RECORDED | kayıt teyidi (rol ODR) | — | kapsam belirsiz → kayıt + DA-03 UNKNOWN | DA-03 tetiklenir; UNKNOWN → bağımlı komutlar BLOCK |
| AX-B OBJECTION_RECORDED | OF-03 | LDO kuralı | AX-B RESOLVED_* | HD (rol ODR) | **LSO** | karar yorumu belirsiz → NOT_EVALUABLE | BLOCK sürer |
| (AX-A ELAPSED ∧ AX-B durumu ∧ DA-06 sonucu) | — (yeni OF yok) | **DA-04 (tür-özgü)** | **PL-D effect KAYDI** (state değişimi değil) | **HD-01 zorunlu** | **LSO** | girdi eksik / DA-06 uygun değil → NOT_EVALUABLE | effect'siz aksiyon adayı üretilmez |
| AX-C | OF-04 | doğrulama kuralı | AX-C condition eklendi | HD-03 | **LSO** | doğrulanamayan kaynak → condition YAZILMAZ (evidence-only kalır) | LG-03/04/05 taraması AE'de |

**AS-IS risk kaydı (VERIFIED; bu belge davranışı DEĞİŞTİRMEZ):** Scheduler bugün
`WAITING_RESPONSE→ENFORCEMENT` OPERASYONEL geçişini itiraz fact'i olmadan, "itiraz yapılmadı"
sabit varsayımıyla yapmaktadır (Phase-0 Roadmap §7 — owner-kabullü bilinen risk; PR-5 bilinçli
dokunmadı). TARGET modelde bu geçişin OF/DA-06/DA-04 zincirine bağlanması gerekir;
bağlama tasarımı ve yetkisi ayrı GO'ya tabidir.

---

## 11. Legal Condition Temporal Model — OWNER-APPROVED [H] (yapı); adlar/etkiler LSO

Her condition kaydı: `conditionType` (aday küme: `DECEASED · BANKRUPTCY_CONDITION ·
CONCORDAT_CONDITION · LIQUIDATION_CONDITION` — adlar+hukuki etkiler **LSO**) ·
`effectiveFrom / effectiveTo?` · evidence/provenance (OF-04 ref) · source authority ·
verification status (HD-03) · revocation/supersession zinciri · **aynı anda birden fazla
condition mümkün** (küme semantiği). Bilinmezlik/yokluk halleri AX-C üyesi DEĞİLDİR — DA-07
coverage sonuçlarıdır (`NO_KNOWN_RESTRICTION_WITH_VERIFIED_COVERAGE` dahil). `NONE` değeri
KULLANILMAZ. Subject: ODR (Q1/OD-06).

---

## 12. Aggregate / Record Candidates + Lifecycle Normalization — OWNER-APPROVED [I]

**Aggregate adayları (PROPOSED):** LEGAL CONDITION AGGREGATE (AX-C küme+history; ROOT SUBJECT
ODR) · PROCEDURE STATE aggregate (AX-A/B tutucu; SUBJECT ODR) · GuardRule (katalog; LDO
otoriteli). **Karar/record katmanları:** OF-01..05 (observed) · DA-01..07 (assessment) ·
AE-01/02 (decision) · HD-01..04 (human) — üç sınıf AYNI listede birleştirilmez.

**Lifecycle normalization (kanonik append-only/immutable hükmü YOK; doğrulama DBP-05):**

| Record sınıfı | RECORD MODEL | INTENDED LIFECYCLE | IMMUTABILITY | EXISTING IMPLEMENTATION EVIDENCE |
|---|---|---|---|---|
| OF-01 | PROPOSED | APPEND-NEW-REVISION / SUPERSESSION CANDIDATE | **AS-IS MUTABLE VERIFIED** (DBP-04-05-LIFECYCLE-VR-RECONCILE-01-GOV): `TebligatService.update()`/`markAsSent()`/`recordPttResult()`/`recordElectronicResult()` aynı kaydı yerinde değiştiriyor (örn. MERNİS-retry akışında eski kaydın `nextAction` alanı). AS-IS MUTABLE ≠ TARGET APPEND-NEW-REVISION/SUPERSESSION. REMEDIATION OPEN / NOT SELECTED. | CURRENT (Tebligat/ServiceAttempt mevcut; davranış doğrulandı) |
| OF-02/03/04 | PROPOSED | APPEND-NEW-REVISION / SUPERSESSION CANDIDATE | VR — DBP-05 | ABSENT |
| DA-01 | PROPOSED | SUPERSESSION CANDIDATE (calculationVersion mevcut tasarımda) | VR — DBP-05 | CURRENT (persist alanları) |
| DA-02 (`LegalDeadlineSnapshot`) | PROPOSED | APPEND-NEW-REVISION | ÇÖZÜLDÜ: SUPERSESSION VERIFIED (DBP-05 §14) — idempotent no-op → eski kayıt yalnız `status: ACTIVE→SUPERSEDED`, yeni create; "immutable" DEĞİL (status alanı mutable). | CURRENT (tablo main'de) |
| `LegalTimeShadowDiff` (DBP-05-introduced, DA-02-adjacent) | PROPOSED | CREATE-ONLY (tasarım niyeti) | **SERVICE LEVEL: CREATE-ONLY VERIFIED** (`LegalTimeShadowService` yalnız `.create()`/`.findMany()`; testte açık "update/delete asla tanımlanmadı" notu). **DATABASE LEVEL: IMMUTABILITY UNENFORCED** (migration'da update/delete-prohibition trigger/rule/constraint YOK). CODE-LEVEL CREATE-ONLY VR CLOSED; DB-LEVEL IMMUTABILITY VR OPEN. | CURRENT (tablo main'de) |
| DA-03..07 | PROPOSED | APPEND-NEW-REVISION | VR — DBP-05 | ABSENT |
| AE-01/02 | PROPOSED | APPEND-NEW-REVISION | **`CpeExecutionRecord` MUTABLE VERIFIED** (DBP-04-05-LIFECYCLE-VR-RECONCILE-01-GOV): create PENDING → `completeExecution`/`markAsNoop` update SUCCESS/FAILED/NOOP → `cleanupStaleExecutions` updateMany. **Precision:** bu bulgu `CpeDecisionLog`'un TÜM lifecycle davranışının otomatik çözüldüğü anlamına GELMEZ — `CpeDecisionLog` yalnız ayrıca doğrulanan kapsam kadar kaydedilir (create-only + retention `deleteMany`; süresiz-immutable DEĞİL), çözülmemiş residual korunur. REMEDIATION OPEN / NOT SELECTED. | CURRENT (CPE DecisionLog/ExecutionRecord mevcut; eşleme doğrulandı) |
| HD-01..04 | PROPOSED | APPEND-NEW-REVISION | **`OfficeApprovalRequest` MUTABLE VERIFIED** (DBP-04-05-LIFECYCLE-VR-RECONCILE-01-GOV): PENDING_APPROVAL create → APPROVED/APPROVED_WITH_CHANGES/REJECTED/REVISION_REQUESTED/CANCELLED + `executionStatus` update'leri. CAS/conditional `updateMany` race-protection VAR; orijinal `savedIntent` ASLA ezilmez (approver değişikliği yalnız `replacementSavedIntent` ile gelir). RACE-SAFE MUTATION ≠ APPEND-ONLY IMMUTABILITY. REMEDIATION OPEN / NOT SELECTED. | CURRENT (OfficeApproval altyapısı mevcut; eşleme doğrulandı) |

Statü yükseltme yalnız repository kanıtıyla yapılır; isim/niyetten immutability türetilmez. **Yukarıdaki "AS-IS MUTABLE VERIFIED" bulguları, bu satırların TARGET (INTENDED LIFECYCLE) sütunundaki APPEND-NEW-REVISION modelini henüz karşılamadığının kanıtıdır — bu bir remediation seçimi veya implementasyon yetkisi DEĞİLDİR; gelecekteki ayrı bir owner-gated remediation kararının girdisidir.**

---

## 13. Eligibility & Enforcement Capability Architecture

Girdiler: OF-01/05 + DA-01/02 (CURRENT) + OF-02/03/04 + DA-03..07 (TARGET) + PCI + LG kataloğu.
Çıktı: **aksiyon-tipine-göre** AE-01 kayıtları (NextActionType hizalı), deterministik +
versiyonlu. Üç-değerli sonuç korunur; eksik/çelişkili girdi → `NOT_EVALUABLE` (hukuki yasak
değil — §15 scope matrisi uygulanır). Zincir: SYS-LEGAL-007
(`fact → assessment → eligibility → LegalGuard → HumanApproval → command`).

---

## 14. LegalGuard Rule Catalog + Metadata Contract — OWNER-APPROVED [K] (yalnız YAPI)

```text
A. CATALOG STRUCTURE           : owner review ile onaylanabilir (bu belgede onaylandı)
B. LEGAL CONTENT AND EFFECT    : LDO SIGN-OFF REQUIRED — LG-01..10'un mevcut kısa ifadeleri
                                 evrensel-yürürlükte hukuk kuralı olarak KANONİKLEŞTİRİLMEZ
```

LG-01..10 (MS §U / DEBTOR-GOV §7 kataloğu; statü: DOCUMENTED_ONLY; yeni kural üretilmedi):
LG-01 tebligatsız haciz BLOK (İİK m.78) · LG-02 itirazda haciz BLOK (m.66) · LG-03 ölümde
takip BLOK · LG-04 konkordatoda haciz/satış BLOK (m.294) · LG-05 iflasta ferdi takip BLOK
(m.191) · LG-06 mock ≠ legal fact · LG-07 AI finansal yazamaz · LG-08 NBA sulh indirimi
REQUIRE_APPROVAL · LG-09 KVKK izinsiz iletişim BLOK (m.5) · LG-10 zamanaşımı WARN.

**Zorunlu kural-metadata sözleşmesi (12 alan; her kural implementasyon-öncesi LDO
kataloğunda doldurulur):** `legal source · article/reference · jurisdiction · effective-from ·
effective-to · proceeding types · action types · exceptions · required facts (OF/DA referans
tipleri) · unknown behavior · rule version · LDO approval reference`.

---

## 15. CPE–LegalGuard Responsibility, Fail-Policy ve Scope — OWNER-APPROVED [J]

**Sorumluluk ayrımı (PROPOSED):** aksiyon-İZİN orkestrasyonu (tek soru noktası, state/gate/
lock/idempotency/DecisionLog) → **CPE (CURRENT)**; İİK-dayanaklı hukuki kural SEMANTİĞİ →
**LegalGuard kataloğu (TARGET; LDO otoriteli)**; hukuki fact üretimi → hiçbiri (kaynak
context'ler); öneri → CPE Rule_Engine (operasyonel) ↔ NBA (advisory; INV-06 sınırı).

**Entegrasyon deseni — OBD-09 (karar owner+LDO; bu belge SEÇMEZ):**
Opsiyon A — LegalGuard, CPE Gate_Checker'a takılan hukuki-gate rule-set'i (ayrı LDO-katalog
kaynağından derlenir) · Opsiyon B — LegalGuard ayrı değerlendirme servisi, CPE
`canPerformAction` içinde zorunlu çağırır (dış kapı yine CPE) ·
Opsiyon C — iki bağımsız paralel kapı → **CANONICALLY INCONSISTENT** (N-07 + CPE Req 1.1) —
eş-değer seçenek olarak sunulmaz. Hangi desen seçilirse seçilsin paralel karar otoritesi
KURULMAZ; hukuki içerik LDO kataloğunda kalır; guard sonuçları AE-02'ye yazılır.

**Fail-policy ayrımı:**

```text
CPE operasyonel gate'ler (CURRENT — CPE Req 12): HIGH → fail-closed · LOW → fail-open (kalır).
LEGAL-SEMANTIC plane (LegalGuard/DA/AE): resolver failure · rule version yok · required fact
eksik · conflicting facts · UNKNOWN legal effect → sonuç HER ZAMAN NOT_EVALUABLE (aksiyonun
CPE risk sınıfından bağımsız). (PROPOSED — CPE spec'ine ek sınır önerisi; spec değiştirilmedi.)
```

**Legal-semantic fail-closed SCOPE matrisi:**

```text
KURAL: REQUIRED LEGAL PRECONDITION = NOT_EVALUABLE → DEPENDENT EXECUTION COMMAND BLOCKED.
NOT_EVALUABLE hukuki YASAK değildir; yalnız bağımlı yürütmeyi durdurur — sistemi global bloklamaz.

BLOCKED : assessment'a bağımlı icra komutları (haciz/satış/tahliye talebi vb.) · legal state
          veya eligibility ön koşullu WRITE command'lar
ALLOWED : read-only görüntüleme · evidence yükleme (OF kayıtları) · eksik fact tamamlama ·
          manuel inceleme görevi oluşturma · reconciliation · verification/remediation ·
          assessment'ı yeniden çalıştırma
```

---

## 16. OBD Impact ve Cross-Domain Boundary Notes

- **OBD-03 (condition subject):** AX-C aggregate'i kesinleşemez; taxonomy DEĞERLERİ subject'ten bağımsız tanımlanabilir (LSO ile).
- **OBD-05 (closure):** `FULL_PAYMENT/CLOSED` stage'i hukuki kapanış değildir; kapama guard'ı LDO katalog çalışmasına adaydır (kaynak: DBP-02 §8.2 kapanış-adayı kuralı — OWNER-APPROVED PROPOSED).
- **OBD-06 (tereke/mirasçı):** DECEASED-sonrası geçişler OPEN — owner+LDO.
- **OBD-09:** §15 desen seçimi yapılmadan LegalGuard implementasyonu AÇILAMAZ.
- **OFFICE:** onay ROLLERİ OFFICE yetki modelinde çözülür (CDC-04); bu belge rol atamaz.
- **CASE:** `WorkflowStage` operasyoneldir; hukuki state stage'den TÜRETİLEMEZ (tersi yön read-only görünüm serbest).
- **CLIENT:** sulh onayı client-instruction fact'idir (XC-01/CDC-03) — OF kataloğuna girmez.
- **COLLECTION/RECEIVABLE:** ödeme/bakiye hiçbir hukuki state/fact üretemez.

---

## 17. DBP-05/06/07 Routing

| Hedef | Giden |
|---|---|
| **DBP-05** | OF/DA/AE/HD record lifecycle + immutability doğrulaması (§12 VR kalemleri; `LegalDeadlineSnapshot`/`LegalTimeShadowDiff` dahil) · DomainEvent vs EventOutbox lifecycle · submission contract · `LEGAL_*` event yayını · FND-09..13 taze kanıt |
| **DBP-06** | Q1 Party seçilirse condition-subject bağı; kimlik-ölüm kaydı eşleşmesi — **OBD-01/OD-04 kararı DBP-06'da VERİLMEZ** |
| **DBP-07** | DECEASED × Liability kesişimi (tereke sorumluluğu, müteselsillik) — OBD-02/OD-07'ye tabi |

---

## 18. ODR / LSO Açık Kayıtları (bu belge hiçbirini vermez/kapatmaz)

**ODR:** LEGAL PROCEDURE STATE SUBJECT (§9) · LEGAL CONDITION SUBJECT (Q1/OD-06) · insan onay
rolleri (HD-01..04) · OBD-09 desen seçimi (A/B) · tereke modeli (OBD-06; owner+LDO) ·
UNRESOLVED tür kuralları (GAP-09).
**LSO:** hukuki kural içerikleri ve etkileri (genel) · OF-02/03/04 alan setleri · DA-03/04/05/
06/07 türetim kuralları · legal-condition adları ve hukuki etkileri · LG-01..10 hukuki
içerikleri + metadata doldurumu · negative-fact kuralının ve HD ilkesinin hukuki teyidi ·
UNKNOWN-etki politikası · TK m.20 şema senaryosu (rebase §8).

---

## 19. Exit Blocker Matrisi (iki gate ayrı)

| Konu | (i) ANALYSIS APPROVAL WITH OPEN ITEMS? | (ii) FULLY RESOLVED L3 ARCHITECTURE? |
|---|---|---|
| STATE SUBJECT ODR'leri | NO | **YES** |
| DA-03..07 + OF-02/03/04 LSO'ları | NO | **YES** |
| AX-C condition modeli LSO | NO | **YES** |
| LG içerik katmanı LSO | NO | **YES** |
| OBD-09 desen seçimi | NO | **YES** |
| OBD-06 tereke | NO | YES |
| Onay rolleri (ODR) | NO | CONDITIONAL (OPEN taşınabilir) |
| Record lifecycle VR | NO | CONDITIONAL (DBP-05 kanıtıyla çözülür) |
| OBD-05 closure guard | NO | CONDITIONAL (LDO katalog çalışmasına devredilebilir) |

DBP-04, açık kalemleri görünür taşıyarak **OWNER-APPROVED / LDO SIGN-OFF PENDING**
disposition'ıyla kapanmıştır (2026-07-15); **FULLY RESOLVED** statüsü yukarıdaki kararlar/
sign-off'lar tamamlanmadan VERİLEMEZ.

---

## 20. AS-IS Bulgular Özeti (VERIFIED — bu belge davranış değiştirmez)

`WorkflowStage.OBJECTION` fact'siz operasyonel etikettir · itiraz fact alanları şemada YOK ·
`Debtor.legalStatus` şemada YOK (risk bayrakları var olmayan alanı okur) · scheduler otomatik
ENFORCEMENT geçişi itiraz-fact'siz sürer (owner-kabullü) · `finalizationDate` legacy-compat,
gerçek kesinleşme üretilmez · `LegalDeadlineSnapshot` paralel-süre alanları + 7 NextActionType
+ `Tk21Type{TK_21_1,TK_21_2,TK_20}` main'de CURRENT · CPE (fact-store/state-machine/gate/
decision-log/execution-record) repo'da CURRENT·PARTIAL · `CaseObjectionPeriodDaysProvider`
dead-logic (her zaman 7 döner; rebase 6A.3).

---

## 21. Owner Approval Record

```text
APPROVE DBP-04 R0.2.1 — OWNER-APPROVED / LDO SIGN-OFF PENDING (2026-07-15, chat-only owner
kararı; bu belge kaydın repo taşıyıcısıdır)
ONAYLANAN ([A]–[L]): dört-sınıf taksonomi · OF katalog YAPISI · DA katalog YAPISI · AE kataloğu ·
HD kataloğu · Orthogonal Legal Model · Transition/Assessment Matrix YAPISI · Temporal Legal
Condition modeli · Aggregate/Record ayrımı · CPE–LegalGuard fail-policy ayrımı · LG Catalog
Metadata Contract YAPISI · negative-fact ve source-coverage yaklaşımı.
ONAYLANMAMIŞ/AÇIK: hukuki kural içerikleri-etkileri · OF-02/03/04 alan setleri · DA-03..07
türetim kuralları · legal-condition adları/etkileri · LG-01..10 hukuki içerikleri · legal
procedure state subject · legal condition root subject · OBD-09 desen seçimi · tereke/mirasçı
modeli · insan onay rolleri — statüleri LDO SIGN-OFF REQUIRED veya OPEN — ODR olarak korunur.
```

**Revizyon geçmişi (özet):** R0.1 ilk L3 analizi → R0.2 LEGAL MODEL CORRECTION (fact/assessment/
decision/state ayrımı; ortogonal eksenler; universal FINALIZED kaldırıldı; subject ODR; temporal
condition modeli; LG iki-katman; legal-semantic fail-closed) → R0.2.1 MICRO-CORRECTION
(negative-fact/source-coverage modeli DA-06/07; AX-B pozitif-kayıt ilkesi; PCI; lifecycle
normalizasyonu; HD adları/anlamları; fail-closed scope matrisi; naming convention PROPOSED)
→ GO-DOCS pre-normalizasyonu (negative-fact RULE STATUS ayrımı; AX-A/B coverage ayrımı;
"Record Candidates" terminolojisi; PCI=REFERENCE CONFIGURATION INPUT). Ara revizyon metinleri
görev sohbetindedir; bağlayıcı olan bu konsolide belgedir.

## GOVERNANCE DOCUMENT SELF-CHECK

```text
- Owner-approved YAPI ile LDO-pending İÇERİK ayrımı net:            YES (her bölümde işaretli)
- OWNER-APPROVED / LDO SIGN-OFF PENDING yalnız review disposition:  YES (lifecycle state değil)
- Negative fact'ten hukuki sonuç türetme yasağı:                    YES (§5.1; AX-A/B §9)
- Universal FINALIZED geri geldi mi:                                NO (PL-D tür-özgü)
- State axes ↔ assessment/decision planes ayrımı:                   YES (§9)
- Receipt/bakiye/skor/NBA/AI'dan hukuki türetim:                    NO (yasak girdiler §5.2)
- CPE–LegalGuard paralel karar otoritesi kuruldu mu:                NO (Opsiyon C inconsistent)
- Record immutability çözülmüş gösterildi mi:                       NO (§12 tümü VR — DBP-05)
- "fact" adı derived/decision/human kayıtlarında:                   NO (adlandırma §3; PCI=REFERENCE CONFIGURATION INPUT)
- Yeni LG kuralı üretildi mi:                                       NO (LG-01..10 aynen; içerik LSO)
- IMPLEMENTATION AUTHORITY: NONE korundu:                           YES
- Register/decision-log değişikliği:                                NO
- Orphan referans:                                                  NO (path'ler main'de mevcut)
```
