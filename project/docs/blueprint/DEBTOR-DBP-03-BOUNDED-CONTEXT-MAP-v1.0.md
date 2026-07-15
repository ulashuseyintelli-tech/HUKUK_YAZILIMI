# DEBTOR DBP-03 — BOUNDED CONTEXT & CONTEXT MAP v1.0

> **Canonical Phase 1 L2 artifact.** Bu belge, `DEBTOR CANONICAL DOMAIN BLUEPRINT CHARTER v1.0`
> §9/§13 kapsamındaki DBP-03 work package'ının owner-onaylı çıktısıdır (Charter artefakt #4
> Final Bounded Context Map · #5 Aggregate Ownership Matrisi'nin aday katmanı · #6
> Source-of-Truth Register bağlaması). İçerik GO-ANALYZE (DBP-03 R0.1→R0.2) çıktısıdır; bu
> GO-DOCS turunda yeni analiz, owner kararı veya mimari üretilmemiştir. `DEBTOR-GOVERNANCE.md`
> §6'nın ratifiye 18-context yapısı YENİDEN TASARLANMAMIŞ; sınıflandırılmış, ownership/
> aggregate/SoT/ilişki katmanları netleştirilmiş ve açık sınırlar OPEN işaretlenmiştir.

---

## 1. Document Status and Authority

```text
PROGRAM            : BORÇLU PLATFORMU
PHASE              : PHASE 1 — CANONICAL DOMAIN BLUEPRINT
WORKSTREAM         : DBP-03 — BOUNDED CONTEXT & CONTEXT MAP
VERSION            : v1.0 (R0.2 onaylı analizin konsolidasyonu + GO-DOCS pre-normalizasyonu)
PRODUCED UNDER     : GO-ANALYZE (DBP-03 R0.1 → R0.2); canonicalization: GO-DOCS
ARTIFACT STATUS    : OWNER-APPROVED (2026-07-15; onay kapsamı [A]–[F])
REVIEW DISPOSITION : OWNER-APPROVED WITH OPEN BOUNDARIES — [G] = OBD-01..09 açık boundary
                     kayıtları ONAYLANMAMIŞTIR. Bu ifade yeni bir artifact lifecycle state
                     DEĞİLDİR; yalnız review disposition'dır.
CANONICAL STATUS   : CANONICAL UPON APPROVED MERGE TO MAIN
ANALYSIS BASE (PIN): analiz turları origin/main @ 081bd961; GO-DOCS drift kontrolü ve bu
                     belgenin base'i origin/main @ 69a1ef98 (fetch 2026-07-15; DBP-03 girdi
                     kaynaklarında 081bd961→69a1ef98 arası SIFIR değişiklik — drift yok)
IMPLEMENTATION AUTHORITY: NONE — bu belge hiçbir context/aggregate için implementasyon,
                     schema, migration, cutover, workstream açılışı veya register
                     genişletmesi yetkisi üretmez (SYS-GOV-003, SYS-DEC-003, SYS-GOV-008).
KİMLİK UZAYI       : BC-xx kimlikleri DEBTOR-GOVERNANCE §6'nın 18 context numarasıyla
                     birebirdir. AGG/CDC/OBD/ACL-xx kimlikleri DBP-03-local'dir ve DBP-12
                     Master Blueprint Synthesis'e kadar PROPOSED statüsündedir (SYS-GOV-011/012).
```

**Authority basis.** İki eksene aynı anda tabidir (SYS-AUTH-006): Semantic —
`SYSTEM-CONSTITUTION.md` → `DEBTOR-GOVERNANCE.md` → ADR. Execution/safety — `AGENTS.md` +
task authorization. Bu belge üst normları yeniden üretmez, referanslar (SYS-GOV-007).

## RELATED DOCUMENTS

- Charter: `project/docs/blueprint/DEBTOR-CANONICAL-DOMAIN-BLUEPRINT-CHARTER-v1.0.md`
- DBP-02 (L1 girdisi): `project/docs/blueprint/DEBTOR-DBP-02-BUSINESS-CAPABILITY-VALUE-STREAM-v1.0.md`
- Domain Law (18-context baseline): `project/docs/governance/DEBTOR-GOVERNANCE.md` (§3/§4/§6)
- Üst norm: `project/docs/governance/SYSTEM-CONSTITUTION.md` (§5–§9)
- Kanıt katmanı: `project/docs/analysis/debtor-master-synthesis-v2.md` (MS §H/§I/§J)
- Phase 0 kapanışı: `project/docs/governance/DEBTOR-PHASE-0-COMPLETION-ROADMAP.md`

---

## 2. Statü Sözlüğü

```text
AUTH (AUTHORITY STATUS)   : CURRENT / TARGET / NOT_IMPLEMENTED / SHADOW_ONLY /
                            PRODUCTION_NO_GO / DEPRECATED / SUPERSEDED
MAT (MATURITY)            : FULL / PARTIAL / NONE / UNKNOWN
SEM-OWN                   : tek domain / CROSS-CUTTING / OWNER DECISION REQUIRED /
                            PARTIALLY DEFINED (yalnız BC-18 — §5 modeli)
DECISION STATUS           : CANONICALLY DEFINED / PROPOSED / OWNER DECISION REQUIRED /
                            VERIFICATION REQUIRED
EVIDENCE STATUS           : VERIFIED / PROVISIONAL / VERIFICATION REQUIRED
```

Kısaltmalar: **CD**=CANONICALLY DEFINED · **ODR**=OWNER DECISION REQUIRED · **C-S**=
Customer–Supplier · **CF**=Conformist · **PL**=Published Language · **ACL**=Anti-Corruption
Layer. `SHARED` semantic-owner değeri KULLANILMAZ. Strategic DDD pattern adları bu belgede
**PROPOSED**'dur; kanonik olan, dayanak gösterilen kural metnidir.

---

## 3. Context Classification Matrix — OWNER-APPROVED [A]

18 kanonik context kimliği (DG §6) korunur; sınıflandırma DBP-03 katkısıdır.

### 3A. DEBTOR-SCOPE INTERNAL DOMAIN CONTEXTS
> Başlık kapsam belirtir, ownership belirtmez; her context'in gerçek semantic owner'ı §5'tedir.
> BC-01, BC-03'ün Liability bileşeni ve BC-06'nın LegalStatus seviyesi owner kararı verilmiş
> gibi GÖSTERİLMEZ (OBD-01/02/03).

| BC | Ad | Misyon | Karar (MS §H) | DBP-02 izi |
|---|---|---|---|---|
| BC-01 | Party & Identity | taraf kimlik kökü + eşleştirme/merge — **ownership OPEN (OBD-01)** | EXTEND | CAP-01 |
| BC-02 | Debtor Profile | borçlu profili | EXTEND | CAP-02 |
| BC-03 | CaseDebtor & Liability | dosya rolü + sorumluluk — **Liability bileşeni OPEN (OBD-02)** | EXTEND+NEW | CAP-03/04 |
| BC-04 | Address & Evidence | adres + delil zinciri | EXTEND | CAP-05 |
| BC-05 | Service of Process | tebligat + kanonik tebliğ/süre girdisi | EXTEND | CAP-06/07 |
| BC-06 | Legal Status & Eligibility | hukuki durum + uygunluk fact'i — **seviye OPEN (OBD-03)** | NEW+EXTEND | CAP-08/09 |
| BC-08 | Intelligence & Asset | saha istihbaratı + varlık sinyali | EXTEND | CAP-16A/16B |
| BC-09 | PaymentPromise & Settlement | vaat + sulh süreci | NEW+EXTEND | CAP-12/13 |
| BC-11 | Behavior & Features | davranış türevleri *(derived üretim — SoT sınıfı §8B)* | NEW | CAP-14A girdisi |
| BC-12 | Scoring | tek skor motoru *(derived üretim — §8B)* | REPLACE | CAP-14A |
| BC-13 | LegalGuard | deterministik hukuki kapı — **CPE deseni OPEN (OBD-09)** | EXTEND | CAP-10 |
| BC-14 | Next Best Action | guard'lı öneri adayı *(advisory — §8B)* | REPLACE/NEW | CAP-14B |
| BC-15 | AI Recommendation | açıklama/taslak *(advisory-only — §8B)* | WRAP | TR-03 |

### 3B. EXTERNAL REFERENCED CONTEXTS
| BC | Ad | Sahip | DEBTOR tarafı |
|---|---|---|---|
| BC-07 | Collection Ledger | **COLLECTION OWNED** | yalnız CDC-01 tüketim sınırı; Debtor-owned BC DEĞİLDİR (SYS-GOV-018; INV-10; N-17) |

### 3C. ENABLING / PLATFORM CONTEXTS
| BC | Ad | Sınıf notu |
|---|---|---|
| BC-10 | Domain Events & Outbox | **CANDIDATE PUBLISHED LANGUAGE / EVENT DISTRIBUTION — CLASSIFICATION OPEN (OBD-07)**; shared-kernel statüsü DBP-05'te (SYS-GOV-019 "olabilir") |

### 3D. PROJECTION / EXPERIENCE CONTEXTS
| BC | Ad | Authority modeli |
|---|---|---|
| BC-16 | Read Models & Reporting | `SOURCE SEMANTICS: UPSTREAM CONTEXTS · PROJECTION/EXPERIENCE OWNERSHIP: DEBTOR · INDEPENDENT SEMANTIC AUTHORITY: NONE` |
| BC-17 | Product Surfaces (360) | aynı model; yüzeyin Debtor ekibince geliştirilmesi business-fact semantiği sahipliği DEĞİLDİR |

### 3E. CROSS-CUTTING RECORD AUTHORITY CONTEXTS
| BC | Ad | Ownership modeli |
|---|---|---|
| BC-18 | Audit & Evidence | üç katman — bkz. §5 BC-18 satırı; `SEM-OWN: PARTIALLY DEFINED — DBP-05 BOUNDARY DECISION REQUIRED (OBD-08)` |

---

## 4. Context Map — OWNER-APPROVED [B]

```text
                     ┌────────────── DIŞ DOMAINLER ──────────────────┐
   CLIENT ◄─CDC-03a── / ──CDC-03b─►   OFFICE ──CDC-04─►   CASE ◄─CDC-05a/05b─►
   COLLECTION ──CDC-01─► (ACL-04)     RECEIVABLE ──CDC-02─► (ACL-02)
   PTT/UETS ──CDC-06A─► (ACL-01a)     MERNİS ──CDC-06B─► (ACL-01b)   UYAP ──CDC-06C─► (ACL-01c)
                     └────────────────────────────────────────────────┘
DEBTOR-SCOPE İÇİ (pattern adları PROPOSED):
BC-01 → BC-02 → BC-03 → {BC-05, BC-09}          (kimlik→profil→dosya zinciri)
BC-02 → BC-04 → BC-05 → BC-06 → BC-13 → BC-14    (delil→tebliğ→fact→kapı→öneri)
BC-{üreticiler} → BC-10 → {BC-11 → BC-12 → BC-14, BC-16}   (candidate event distribution)
BC-16 → BC-17 (tek yön; geri-yazma YOK — INV-09)  ·  BC-15 → BC-17 (advisory)
BC-* → BC-18 : fact/evidence SUBMISSION CONTRACT üzerinden append/integrity (§5)
```

---

## 5. Semantic Ownership Matrix — OWNER-APPROVED [C]

| BC | SEM-OWN | PART | ODS |
|---|---|---|---|
| BC-01 | **OPEN — OWNER DECISION REQUIRED** (MS/OD-04; SC §7 Party Registry TARGET/SB-001 HOLD; SYS-GOV-019 shared-kernel adayı) | DEBTOR, CLIENT | ODR |
| BC-02 / BC-04 / BC-05 / BC-08 / BC-09 / BC-11 / BC-12 / BC-13 / BC-14 / BC-15 | DEBTOR | §6 tüketicileri | CD |
| BC-03 | DEBTOR (CaseDebtor/rol: CD) · **Liability bileşeni OPEN — ODR** (MS/OD-07; N-16 koordinasyonu ortak ownership DEĞİL) | RECEIVABLE, COLLECTION, ACCOUNTING (yalnız koordinasyon) | CD + ODR |
| BC-06 | DEBTOR (kapsam CD) · **seviye/yerleşim OPEN — ODR** (Q1/MS-OD-06) | Case/Workflow | CD + ODR |
| BC-07 | **EXTERNAL (COLLECTION)** | DEBTOR (salt tüketici) | CD |
| BC-10 | DEBTOR (mevcut temel) · sınıf **OPEN (OBD-07)** | üreticiler | CD + ODR (sınıf) |
| BC-13 katalog otoritesi | GV-02 LDO — POLICY / RULE CATALOG AUTHORITY | OFFICE (yetki modeli) | CD |
| BC-16 / BC-17 | `SOURCE SEMANTICS: UPSTREAM · PROJECTION OWNERSHIP: DEBTOR · INDEPENDENT SEMANTIC AUTHORITY: NONE` | upstream BC'ler | CD |
| BC-18 | **PARTIALLY DEFINED — DBP-05 BOUNDARY DECISION REQUIRED**: (A) business fact/evidence **anlamı** → kaynak domain; (B) audit/evidence **integrity+provenance+retention** → BC-18; (C) **legal evidence classification** → OPEN (OBD-08). Akış: `source context → fact/evidence submission contract → BC-18 append/integrity enforcement`. BC-18'e doğrudan dış write YOK; BC-18 kaynak fact'i değiştiremez/yeniden yorumlayamaz. | tümü | PARTIALLY DEFINED + ODR (C katmanı) |

---

## 6. Strategic Relationship Matrix — OWNER-APPROVED [B] (pattern adları PROPOSED)

| Upstream | Downstream | Pattern (PROPOSED) | Dayanak kural | CONTRACT OWNER | DECISION STATUS | EVIDENCE |
|---|---|---|---|---|---|---|
| BC-01 | BC-02, BC-03 | C-S | kimlik≠profil≠rol (DG §3) | **OWNER DECISION REQUIRED** (Party ownership OD-04 ile açık) · `CURRENT IMPLEMENTATION HOST: DEBTOR` (mevcut Debtor-local davranış — implementation host ≠ semantic/contract owner) | kural: CD · pattern: PROPOSED · owner: ODR | VERIFIED |
| BC-04 | BC-05 | C-S | delil zinciri | DEBTOR | PROPOSED | VERIFIED |
| BC-05 | BC-06 | fact akışı | INV-04/05 (yalnız kanonik tarih; NotificationQueue girdisi YASAK) | DEBTOR | kural: CD · pattern: PROPOSED | VERIFIED |
| BC-06 | BC-13 | fact akışı | fact eksik → fail-closed | DEBTOR | PROPOSED | VERIFIED |
| BC-13 | BC-14 | süzgeç | INV-06 (guard'sız aday çıkamaz) | DEBTOR | kural: CD | VERIFIED |
| üreticiler | BC-10 | **candidate PL** | INV-12 + SYS-EVID-002 (transactional outbox) | DEBTOR | mekanizma: CD · **sınıf: OPEN (OBD-07)** | temel: VERIFIED · sınıf: VERIFICATION REQUIRED |
| BC-10 | BC-11→BC-12→BC-14 | event tüketimi | foundation order (N-26) | DEBTOR | kural: CD · pattern: PROPOSED | VERIFIED |
| upstream/BC-10 | BC-16 → BC-17 | CF (tek yön) | INV-09 (geri-yazma yok) | DEBTOR (projection) | kural: CD · **pattern: PROPOSED** | VERIFIED (kural) |
| OFFICE | DEBTOR (tümü) | CF | SYS-GOV-014 (aktör/yetki modeli OFFICE'te) | OFFICE | ownership: CD · **pattern: PROPOSED** | VERIFIED (ownership) |
| BC-* | BC-18 | submission contract | INV-08/11 | BC-18 (integrity) + kaynak domain (anlam) | §5 modeli: PROPOSED | VERIFICATION REQUIRED (DBP-05) |

---

## 7. Aggregate / Record / Derived Model Ayrımı — OWNER-APPROVED [D] (tümü PROPOSED aday)

### 7A. Aggregate Candidates (tx boundary + invariant + lifecycle + command tutarlılığı)

| AGG | BC | Root adayı | Koruduğu invariant | AUTH | MAT | OPEN bağı |
|---|---|---|---|---|---|---|
| AGG-01 | BC-01 | Party (+Identity/Alias/Evolution) | kimlik tekilliği; merge geri-alınabilirliği (INV-07) | TARGET | NONE | **OPEN (OD-04)** |
| AGG-02A | BC-01 | MatchCandidate (eşleştirme süreci) | fuzzy=insan onayı yaşam döngüsü | TARGET | NONE | OPEN (OD-04) |
| AGG-03 | BC-02 | Debtor | profil bütünlüğü; tenant scope | CURRENT | PARTIAL | — |
| AGG-04 | BC-03 | CaseDebtor (+LegalRole) | dosya-rol tutarlılığı; passivation guard | CURRENT | PARTIAL | — |
| AGG-05 | BC-03 | Liability (+Group/Allocation) | rol≠sorumluluk; Σ tutar mutabakatı | NOT_IMPLEMENTED | NONE | **OPEN (OD-07 → DBP-07)** |
| AGG-06 | BC-04 | DebtorAddress | tek aktif birincil adres; delilsiz 'doğrulanmış' yok | CURRENT | PARTIAL | evidence sınırı → OBD-08 |
| AGG-07 | BC-05 | Tebligat (+ServiceAttempt/History) | senkron kapı tek yazım yolu; NO-MOCK (LG-06) | CURRENT | PARTIAL | — |
| AGG-08 | BC-06 | **LEGAL STATUS AGGREGATE CANDIDATE — ROOT SUBJECT: OWNER DECISION REQUIRED (OD-06/Q1)** | delilli, insan-onaylı geçiş | NOT_IMPLEMENTED | NONE | **OPEN** |
| AGG-09 | BC-06 | EnforcementEligibility | fact'siz eligibility yok; fail-closed (EligibilityFact'in fact-record mi üye mi olduğu → DBP-04) | NOT_IMPLEMENTED | NONE | DBP-04 |
| AGG-10 | BC-09 | PaymentPromise (+Outcome) | vaat→sonuç yaşam döngüsü; otomatik mali etki REJECT | NOT_IMPLEMENTED | NONE | — |
| AGG-11 | BC-09 | SettlementOffer | müvekkil onayı şartı; otomatik sulh REJECT | NOT_IMPLEMENTED | NONE | onay fact'i → OBD-04 |
| AGG-12A | BC-13 | GuardRule (policy/katalog adayı) | katalog LDO-onaylı; bypass yok | NOT_IMPLEMENTED | PARTIAL (CPE mevcut) | **OPEN (BR-09/OBD-09)** |
| AGG-15 | BC-08 | DebtorIntelligence | tenant-scoped istihbarat | CURRENT | PARTIAL | — |
| AGG-16 | BC-08 | AssetSignal | yapılandırılmış varlık sinyali | TARGET | NONE | — |

### 7B. Append-Only Record Candidates (aggregate DEĞİL)

MergeLog (merge history) · **GuardEvaluation — APPEND-ONLY DECISION RECORD CANDIDATE**
(aggregate üyesi varsayılmaz) · AuditLog · LegalEvidence (WORM) · AddressEvidence ·
**DomainEvent — immutable business event record adayı** · LegalDeadlineSnapshot ·
LegalTimeShadowDiff.

```text
LegalDeadlineSnapshot / LegalTimeShadowDiff:
  AUTHORITY STATUS                 : CURRENT (canonical migration + code main'de — PR #1185/#1192)
  EXISTENCE EVIDENCE               : VERIFIED
  RECORD LIFECYCLE / IMMUTABILITY  : VERIFICATION REQUIRED — ilgili code/write-path incelemesi DBP-05
  (Append-only/immutable statüsü isimden veya migration varlığından ÇIKARILMAZ.)

EventOutbox — DELIVERY COORDINATION RECORD (DomainEvent'ten AYRI):
  mutable delivery state (processed/status/retry) içerip içermediği repo'dan doğrulanmadı →
  LIFECYCLE: VERIFICATION REQUIRED — DBP-05. APPEND-ONLY sınıfına otomatik ALINMAZ.
```

### 7C. Derived / Versioned Decision Models (aggregate matrisinden çıkarıldı)

DebtorScore · ScoreFactor/ScoreSnapshot · FeatureSnapshot · NBARecommendation · NBAOutcome ·
AIRecommendationLog — hangilerinin aggregate/snapshot/advisory record olduğu **DBP-04/DBP-08'de**
kesinleşir.

---

## 8. Source-of-Truth Matrisleri — OWNER-APPROVED [E] (DG §4'e yeni norm EKLEMEZ; BC bağlaması)

### 8A. Canonical Business Source-of-Truth

| SoT | BC | AUTH | OPEN? |
|---|---|---|---|
| Party / PartyIdentity | BC-01 | TARGET | **OPEN — ODR (OD-04)** |
| Debtor | BC-02 | CURRENT | — |
| CaseDebtor (+LegalRole) | BC-03 | CURRENT | — |
| Liability | BC-03 | NOT_IMPLEMENTED | **OPEN — ODR (OD-07)** |
| AddressEvidence | BC-04 | TARGET | OBD-08 |
| ServiceAttempt / NotificationResult | BC-05 | CURRENT | — |
| LegalServiceDate | BC-05 | CURRENT (dar kapsam; flag'li kademeli) | — |
| LegalStatus | BC-06 | NOT_IMPLEMENTED | **OPEN — ODR (Q1/OD-06)** |
| EnforcementEligibility | BC-06 | NOT_IMPLEMENTED | DBP-04 |
| Collection ledger | BC-07 | CURRENT | **EXTERNAL AUTHORITY (COLLECTION)** — tüketim yalnız CDC-01 |
| PaymentPromise | BC-09 | NOT_IMPLEMENTED | — |
| SettlementOffer | BC-09 | NOT_IMPLEMENTED | onay fact'i → OBD-04 |

### 8B. Derived / Advisory Record Authority (business SoT DEĞİL)

| Kayıt | Authority modeli |
|---|---|
| DebtorScore (+ScoreFactor/Snapshot'lar) | kendi versiyonlu skor kaydının kayıt otoritesi; **skor hukuki/finansal SoT değildir** |
| NBARecommendation / NBAOutcome | kendi öneri+sonuç kaydının kayıt otoritesi; **NBA business command veya karar SoT'si değildir** |
| AIRecommendationLog | kendi advisory çıktı kaydının kayıt otoritesi; **AI hiçbir business/legal SoT üretmez** |
| Read Models / Digital Twin | `PROJECTION-STATE AUTHORITY: YES — yalnız kendi türetilmiş projection sürümü için · BUSINESS/LEGAL SEMANTIC AUTHORITY: NONE · UPSTREAM FACT MUTATION: PROHIBITED` |

Ortak kural: bu sistemlerin hiçbiri upstream fact'leri değiştiremez; en fazla kendi ürettikleri
versiyonlu çıktının kayıt/projection otoritesidirler.

---

## 9. Cross-Domain Contract Catalog — OWNER-APPROVED [F]

| CDC | UPSTREAM DOMAIN | DOWNSTREAM / CONSUMING | İçerik | Sınır / canonicalization kapısı | ACL |
|---|---|---|---|---|---|
| CDC-01 | COLLECTION | DEBTOR | tahsilat kaydı + `COLLECTION_RECORDED` sinyali | salt-okuma/bağlama; tahsis/disposition/closure türetme YASAK (DBP-02 §8.2; INV-10) | ACL-04 (hafif reader) |
| CDC-02 | RECEIVABLE | DEBTOR | bakiye / legal allocation sonuçları | SYS-FIN-001 beş-kavram ayrımı; alternatif hesap YASAK | ACL-02 |
| CDC-03a | DEBTOR | CLIENT | **approval request** (talep + correlation) | kayıt yüzeyi **OPEN (OBD-04)** | ACL-03 |
| CDC-03b | CLIENT | DEBTOR | **instruction / approval fact** | SYS-GOV-015; fact tüketimi tek noktadan | ACL-03 |
| CDC-04 | OFFICE | DEBTOR | aktör/rol/yetki bağlamı | yetki modeli OFFICE'te (SYS-GOV-014) | — |
| CDC-05a | CASE | DEBTOR | case context | — | — |
| CDC-05b | DEBTOR | CASE | debtor facts / guard outcome | **closure authority: OPEN — OBD-05** | — |
| CDC-06A | PTT/UETS (service-of-process) | DEBTOR (BC-05) | tebligat sonuç verisi | delil değeri: resmî tebliğ kanıtı adayı · doğrulama: insan-onaylı kanonikleştirme (LG-06) · failure: sonuçsuz/geç bildirim → fact YAZILMAZ · kapı: ServiceAttempt senkron kapısı | **ACL-01a ZORUNLU** |
| CDC-06B | MERNİS ve benzeri (identity/address) | DEBTOR (BC-01/04) | kimlik/adres verisi | delil değeri: kaynak-kayıtlı adres kanıtı · doğrulama: provenance + insan onayı (SYS-ID-004) · failure: eşleşmeme/eski veri → evidence-only kalır · kapı: AddressEvidence kanonikleştirme | **ACL-01b ZORUNLU** |
| CDC-06C | UYAP (court/enforcement) | DEBTOR (BC-05/06) | dosya/işlem verisi | delil değeri: mahkeme kaynak kanıtı adayı · doğrulama: adapter + domain teyidi (SC §8 import satırı) · failure: ham projection canonical OLMAZ · kapı: reconciliation | **ACL-01c ZORUNLU** |

*(CDC-07 numarası bilinçli boş — Accounting bir contract değildir; bkz. §10.)*

## 10. Cross-Domain Design Coordination Dependencies (contract DEĞİL)

- **ACCOUNTING:** Runtime contract YOK. Liability tasarımı ADR-013 / ADR-014 / DBIND
  sınırlarıyla **tasarım koordinasyonu** gerektirir (N-16); gate: DBP-07 + Finance sign-off.
  CDC kimliği verilmez.

---

## 11. DBP-02 → Context Traceability

CAP-01→BC-01 · CAP-02→BC-02 · CAP-03/04→BC-03 · CAP-05→BC-04 · CAP-06/07→BC-05 ·
CAP-08/09→BC-06 · CAP-10→BC-06+BC-13 · CAP-11→BC-03/13 (+CASE, CDC-05) · CAP-12/13→BC-09 ·
CAP-14A→BC-11/12 · CAP-14B→BC-14 · CAP-16A/B→BC-08 · CC-01→BC-07/CDC-01 · CC-02→CDC-02 ·
XC-01→CDC-03a/03b · EC-01/02→BC-18 · EC-03/04/05→cross-cutting (yetki yüzü CDC-04) ·
PS-01..06→BC-17 (BC-16 besler) · TR-01→BC-10 · TR-02→BC-16 · TR-03→BC-15 ·
VS-01→BC-01/02/03 · VS-02→BC-04/05 · VS-03→BC-05/06 · VS-04→BC-06/13/03 · VS-05/06→BC-09 ·
BH-01→CDC-01/02 · EN-01→BC-10/11/12/14 zinciri. Yetim iz yok (Charter §11).

---

## 12. Open Boundary Decisions — [G]: ONAYLANMAMIŞTIR, açık kayıt

| OBD | Soru | Route |
|---|---|---|
| OBD-01 | BC-01 ownership: DEBTOR-local mi, Party Registry shared-kernel mi? | **OPEN — OWNER DECISION REQUIRED** (MS/OD-04 + SB-001) |
| OBD-02 | Liability yerleşimi (BC-03 içinde aday; ayrı BC mi?) | **OPEN — OWNER DECISION REQUIRED** (MS/OD-07; BR-01/BR-07 → DBP-07) |
| OBD-03 | LegalStatus seviyesi (Q1: Party vs Debtor) — AGG-08 root subject dahil | **OPEN — OWNER DECISION REQUIRED** (MS/OD-06) |
| OBD-04 | Client approval fact kayıt yüzeyi (OfficeApproval–ClientApproval sınırı) | OPEN — EDD+ODR (CDC-03; DBP-09/10 + CLIENT/OFFICE governance) |
| OBD-05 | Dosya kapama semantiğinin sahibi (CASE ↔ DEBTOR closure guard) | OPEN — ODR (kapanış-adayı kuralı DBP-02'de OWNER-APPROVED PROPOSED) |
| OBD-06 | Tereke/mirasçı/birleşme temsili (Q2/Q3/Q4) | OPEN — ODR + LEGAL-SIGN-OFF (BR-03/04/05 → DBP-04/06/07) |
| OBD-07 | BC-10 Published Language / event-distribution sınıfı + shared-kernel statüsü | OPEN — DBP-05 (BR-12; SYS-GOV-019) |
| OBD-08 | Evidence sınıflandırma + aggregate sınırı (AddressEvidence/LegalEvidence; BC-18 C-katmanı) | OPEN — DBP-05 (BR-10) |
| OBD-09 | LegalGuard ↔ CasePolicyEngine deseni + CPE sole-authority tespiti | OPEN — BR-09/N-07 → DBP-04 |

---

## 13. Exit Gate Ayrımı ve Blocker Matrisi

İki gate AYRIDIR: **(i) ANALYSIS APPROVAL WITH OPEN BOUNDARIES** — açık satırlar görünür
taşınarak verilebilir (2026-07-15'te VERİLDİ); **(ii) FULLY RESOLVED / CLOSED CONTEXT MAP** —
aşağıdaki kararlar çözülmeden VERİLEMEZ.

| Konu | (i) Analysis approval'ı bloklar mı? | (ii) Fully resolved map'i bloklar mı? |
|---|---|---|
| Party ownership (OBD-01/OD-04) | NO | **YES** |
| Liability (OBD-02/OD-07) | NO | **YES** |
| LegalStatus seviyesi (OBD-03/Q1) | NO | YES |
| ClientApproval yüzeyi (OBD-04) | NO | YES |
| Tereke/mirasçı (OBD-06) | NO | YES |
| Evidence sınıflandırma (OBD-08 + BC-18 C) | NO | YES (DBP-05 kararıyla) |
| Closure ownership (OBD-05) | NO | YES |
| BC-10 sınıfı (OBD-07) | NO | CONDITIONAL (DBP-05 tasarımıyla çözülebilir) |
| CPE deseni (OBD-09) | NO | CONDITIONAL (DBP-04 çıktısıyla) |
| FND-09..13 doğrulamaları | NO | CONDITIONAL (taze kanıt DBP-05'te) |

---

## 14. Riskler ve Anti-Corruption İhtiyaçları

- **R-01 · ACL-01a/b/c (ZORUNLU):** sağlayıcı ham verisi doğrulanmadan kanonik alana giremez
  (SYS-ID-004; SYS-AUTH-011; LG-06) — intake her zaman evidence-sınıfı + doğrulama kapısından.
- **R-02 · ACL-02:** RECEIVABLE sonuçlarının ham sızması "UI kendi hesabını yapar"
  anti-pattern'ini geri getirir (SYS-SOT-002); okuyucu katman yalnız etiketli kanonik sonuç taşır.
- **R-03 · ACL-03:** CLIENT talimat/onay girişi correlation'sız işlenirse onaysız sulh/indirim
  riski; OBD-04 çözülene dek fact tüketimi tek noktadan.
- **R-04 · ACL-04:** Collection sinyalinden closure/allocation türetme yasağının yapısal
  uygulanması (DBP-02 §8.2 kuralı — OWNER-APPROVED PROPOSED).
- **R-05:** Party belirsizliği (OBD-01) BC-02/03 aggregate kesinleşmesini geciktirir — OPEN
  yönetimiyle ilerlenir; sessiz varsayım YASAK.
- **R-06:** Legacy süre kaynağı (NotificationQueue) yeni tüketici KAZANAMAZ (GAP-01 büyür);
  mevcut flag'li fallback deseni korunur.
- **R-07:** BC ↔ aggregate kavram karışması — bu belgede ayrı matrisler + record/derived
  sınıflarıyla disipline edildi.

---

## 15. DBP-04/05/06/07 Routing (her WP yalnız kendi kapsamını alır)

| Hedef | Giden girdiler |
|---|---|
| **DBP-04** (L3) | LegalStatus taxonomisi + **ROOT SUBJECT ODR** kaydı · EligibilityFact · itiraz/durdurucu etki + enforcement capability (FACT/GATE vizyonu) · LegalGuard kataloğu (LG-01..10; LDO=policy authority) · CPE ilişkisi (OBD-09) · legal state transitions · human approval gates (DBP-02 karar matrisi ODR'leri) |
| **DBP-05** | DomainEvent vs EventOutbox lifecycle doğrulaması · snapshot record lifecycle doğrulaması (§7B) · BC-10 sınıfı (OBD-07) · BC-18 üç-katman sınırı + legal evidence classification (OBD-08) · submission contract deseni · FND-09..13 taze kanıt |
| **DBP-06** | AGG-01/02A + MergeLog ayrımı · exact auto-link önkoşulları · OBD-01 OPEN kaydı — **karar DBP-06'da VERİLMEZ; OD-04 owner'ındır** |
| **DBP-07** | AGG-05 Liability aday sınırı · CDC-02 + Accounting koordinasyonu (§10) · OBD-02 OPEN kaydı · Finance/LDO gate |

---

## 16. Owner Approval Record

```text
APPROVE DBP-03 R0.2 WITH OPEN BOUNDARIES (2026-07-15, chat-only owner kararı; bu belge kaydın
repo taşıyıcısıdır)
[A] Context Classification Matrix                APPROVED
[B] Context Map + Strategic Relationship Matrix  APPROVED (pattern adları PROPOSED kalır)
[C] Semantic Ownership Matrix                    APPROVED
[D] Aggregate / Record / Derived ayrımı          APPROVED (PROPOSED kataloglar)
[E] Business SoT + Derived Record Authority      APPROVED
[F] CDC + Design Coordination + ACL ailesi       APPROVED
[G] OBD-01..09                                   NOT APPROVED — açık boundary kayıtları
REVIEW DISPOSITION: OWNER-APPROVED WITH OPEN BOUNDARIES (lifecycle state DEĞİL)
```

**Revizyon geçmişi (özet):** R0.1 ilk analiz (18-context baseline sınıflandırması, ilk
matrisler) → R0.2 limited correction: 5-sınıf katalog + BC-07/16/17/18 ownership düzeltmeleri +
stratejik ilişki kolonları (pattern'ler PROPOSED) + aggregate/record/derived ayrımı + SoT'nin
ikiye bölünmesi + CDC-06 ailesi/CDC-07'nin koordinasyona taşınması + çift exit-gate → GO-DOCS
pre-normalizasyonu: 3A başlığı "DEBTOR-SCOPE INTERNAL", BC-01 contract-owner/implementation-host
ayrımı, snapshot lifecycle üç-alanı, projection-state authority ifadesi. Ara revizyon metinleri
görev sohbetindedir; bağlayıcı olan bu konsolide belgedir.

## GOVERNANCE DOCUMENT SELF-CHECK

```text
- 18-context baseline korundu (yeniden tasarım yok):          YES
- OBD-01..09 açık; hiçbir owner kararı sonuçlandırılmadı:      YES
- APPROVED WITH OPEN BOUNDARIES yalnız review disposition:     YES (lifecycle state üretilmedi)
- Party/Liability/LegalStatus/ClientApproval/closure/evidence/
  BC-10 sınıfı çözülmüş gösterildi mi:                         NO (tümü OPEN işaretli)
- Strategic DDD pattern'leri PROPOSED:                         YES
- Dış domain semantic authority DEBTOR'a taşındı mı:           NO (BC-07 EXTERNAL; CDC/CF modeli)
- SHARED semantic-owner kullanıldı mı:                         NO
- Aggregate ≠ BC ≠ record ≠ derived ayrımı:                    YES (§7A/7B/7C)
- AUTH yalnız main kanıtından (lokal DB kanıt sayılmadı):      YES (§7B snapshot bloğu)
- DBP-04/05/06/07 routing korundu:                             YES (§15)
- IMPLEMENTATION AUTHORITY: NONE korundu:                      YES
- Orphan referans:                                             NO (path'ler main'de mevcut)
```
