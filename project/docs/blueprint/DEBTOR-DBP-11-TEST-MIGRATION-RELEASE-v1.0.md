# DEBTOR DBP-11 — TRANSITION, MIGRATION, TEST & RELEASE ARCHITECTURE v1.0

> **Canonical Phase 1 L9-yatay artifact.** Bu belge, `DEBTOR CANONICAL DOMAIN BLUEPRINT CHARTER
> v1.0` §9 kapsamındaki DBP-11 work package'ının owner-onaylı çıktısıdır (Charter artefaktları
> #27 Migration & Backfill Blueprint · #28 Test & Release Gate Architecture). İçerik GO-ANALYZE
> (DBP-11 R0.1 → R0.2 → v1.1 matrix/entry-gate completion) çıktısıdır; bu GO-DOCS turunda yeni
> analiz veya owner kararı üretilmemiştir. **PROGRAM IMPLEMENTATION ENTRY = HOLD.** Bu belge
> DBP-01..10'un tüm açık bulgu register'larını TEK Master Blocker Register'da konsolide eder;
> hiçbir source-finding disposition'suz kaybolmaz; hiçbir ratified karar yeniden açılmaz.
>
> **GÜVENLİK SINIRI (owner-directed public-safe boundary kararı, 2026-07-16; DBP-10-SEC-REDACT ile
> tutarlı):** Master Blocker Register'daki güvenlik-ilişkili kalemler bu belgede AYRI ayrı teknik
> başlıklarla LİSTELENMEZ — yalnız restricted-register'ın VARLIĞI + program-etkisi (Implementation
> Entry HOLD) + remediation'ın ayrı owner GO-IMPLEMENT gerektirdiği görünür. Mekanizma, yüzey/route/
> servis kombinasyonu ve enumeration/bypass ayrıntısı owner-local/restricted register'dadır (git-
> tracked DEĞİL; repository/PR/CI-artifact DEĞİL; cloud/3rd-party DEĞİL). Legal sign-off/migration/
> evidence-gap/cutover/non-blocking-tech-debt sınıfları (güvenlik-açığı DEĞİL) DBP-04/07/08'de zaten
> public olan düzeyde aynen korunur.

---

## 1. Document Status and Authority

```text
PROGRAM            : BORÇLU PLATFORMU
PHASE              : PHASE 1 — CANONICAL DOMAIN BLUEPRINT
WORKSTREAM         : DBP-11 — TRANSITION, MIGRATION, TEST & RELEASE ARCHITECTURE (L9-yatay)
VERSION            : v1.0 (R0.2 + v1.1 matrix/entry-gate completion + GO-DOCS pre-normalizasyonu)
PRODUCED UNDER     : GO-ANALYZE (R0.1 → R0.2 MIGRATION PATTERN CORRECTION → v1.1 MASTER BLOCKER
                     REGISTER + ENTRY-GATE COMPLETION); canonicalization: GO-DOCS
ARTIFACT STATUS    : OWNER-APPROVED (2026-07-15; onay kapsamı [A]–[M] — bkz. §12)
REVIEW DISPOSITION : OWNER-APPROVED / PROGRAM IMPLEMENTATION ENTRY HOLD — yeni bir repository
                     lifecycle state'i DEĞİLDİR; yalnız review disposition'dır.
AÇIK KALANLAR      : QUEUE-A remediation'ların ayrı owner GO-IMPLEMENT'i (bu belge açmaz) ·
                     QUEUE-B new-capability activation HOLD · capability-specific entry status'lar ·
                     representative/local evidence toplama prosedürünün fiili yürütülmesi
CANONICAL STATUS   : CANONICAL UPON APPROVED MERGE TO MAIN
ANALYSIS BASE (PIN): analiz turları Phase 1 GO-ANALYZE (2026-07-15); bu belgenin girdisi DBP-01..10
                     canonical belgelerinin (main @ e3988cf7 itibarıyla) kendi AS-IS/VERIFIED
                     kayıtlarıdır — DBP-11 yeni AS-IS kanıt toplamaz, KONSOLİDE eder
IMPLEMENTATION AUTHORITY: NONE — bu belge hiçbir migration/test/release/remediation için
                     implementasyon, schema, cutover veya workstream açılışı yetkisi üretmez
                     (SYS-GOV-003, SYS-DEC-003, SYS-GOV-008). **DBP-11 ≠ GO-IMPLEMENT AUTHORITY.**
KİMLİK UZAYI       : MBR/QA/QB/EG kimlikleri DBP-11-local PROPOSED'dur (DBP-12'ye kadar). Kaynak
                     bulgu ID'leri (V-*/LDV-*/LRV-*/EEV-*) ilgili DBP-03/04/07/08 belgelerinin
                     (public) kimlikleridir — bu belge onları YENİDEN üretmez, REFERANS eder.
                     DBP-10-kaynaklı restricted güvenlik bulguları owner-local register'da izlenir;
                     bu belgede ayrı ID/teknik başlıkla LİSTELENMEZ.
```

**Authority basis.** Semantic — `SYSTEM-CONSTITUTION.md` (SYS-MIG; SYS-SOT-006) →
`DEBTOR-GOVERNANCE.md` (§N/R/S migration/release ilkeleri) → DBP-01..10 canonical belgeleri.
Execution/safety — `AGENTS.md` + task authorization + ADR-014 local evidence emsali.

## RELATED DOCUMENTS

- Charter: `.../DEBTOR-CANONICAL-DOMAIN-BLUEPRINT-CHARTER-v1.0.md` (artefakt #27/#28)
- DBP-03 (V-01..07) · DBP-04 (LDV-01..07) · DBP-07 (LRV-02/03) · DBP-08 (EEV-01/02) — bu belgelerin
  bulgu register'ları Master Blocker Register'a konsolide edilir (public-safe).
- DBP-10 (restricted security findings — public-safe disposition; ayrıntı owner-local register'da,
  bu belgeye AKTARILMAZ).
- ADR-014 local evidence harness emsali (owner-PC-only representative evidence prosedürü)

---

## 2. Statü Sözlüğü

```text
AUTH / MAT / EVD / DEC / S-OWN / HOST / EXEC — DBP-02..10 sözlüğüyle aynı.
MBR-CLASS ∈ { CURRENT_PRODUCTION_REMEDIATION · IMPLEMENTATION_ENTRY_BLOCKER ·
  CAPABILITY_ACTIVATION_BLOCKER · CUTOVER_BLOCKER · LEGAL_SIGN_OFF_BLOCKER · EVIDENCE_GAP ·
  NON_BLOCKING_TECH_DEBT }  (7 sınıf).
QUEUE-A = current-production remediation (mevcut runtime'da yaşayan, Twin/DBP-12 beklemez).
QUEUE-B = new-capability activation (Twin/score/NBA gibi yeni yüzeylerin aktivasyonu; HOLD).
```

---

## 3. Migration Pattern — OWNER-APPROVED [A] (EXPAND→...→CONTRACT; big-bang yasak)

```text
EXPAND → BACKFILL → SHADOW/DUAL-READ → RECONCILE → CUTOVER → CONTRACT/RETIRE.
- EXPAND     : yeni schema/alan additive eklenir; eski davranış DEĞİŞMEZ.
- BACKFILL   : yalnız DOĞRULANABİLİR tekil veri taşınır; fuzzy/otomatik-consolidation YASAK
               (DBP-06 §10; DBP-07 §10 no-backfill ilkesiyle tutarlı).
- SHADOW/DUAL-READ : yeni yol eskiyle PARALEL çalışır, karşılaştırılır; kullanıcıya yansımaz.
- RECONCILE  : fark/drift ölçülür, kapatılır; count/drift reconciliation ZORUNLU.
- CUTOVER    : yalnız reconcile temiz + evidence + rollback yolu hazırsa; insan-onaylı (geri-
               alınamaz aksiyonda N-21).
- CONTRACT/RETIRE : eski yol kaldırılır — YALNIZ cutover kanıtlandıktan sonra.
BIG-BANG MIGRATION PROHIBITED (N-18); destructive migration ilk geçişte YOK (N-19; EXPAND-first).
```

---

## 4. Release / Cutover / Rollback — OWNER-APPROVED [B] (OPTION D)

```text
RELEASE MODEL = OPTION D: her cutover kendi shadow-first kanıtı + rollback yolu + evidence-gate'i
  taşır; TEK bir global "release günü" YOKTUR — capability-by-capability, gate'i geçen ilerler.
Her cutover için ZORUNLU: shadow-karşılaştırma kanıtı · rollback prosedürü (test edilmiş) ·
  evidence-gate (temsili veri + reconciliation sonucu) · insan-onaylı go/no-go.
Flag deseni (PR-3/4/5 emsali): kill-switch + kademeli aktivasyon + gözlemlenebilirlik.
```

---

## 5. Test & Verification Architecture — OWNER-APPROVED [C]

```text
Katmanlar: unit (deterministik kural/hesap) · static-purity/guard (yasak-girdi taraması; ör.
  debtor-scoring static-purity emsali) · disposable-DB integration (production/local-dev DB'ye
  KARŞI TEST KOŞULMAZ — izole container) · CI-coverage (yeni test suite ci.yml allowlist'ine
  EKLENMELİDİR — aksi halde ay'larca sessiz rot riski, bkz. CI narrow-allowlist gap emsali) ·
  representative/local evidence (owner PC/office-only; §8).
Freshness/conflict/rebuild/failure test-gate (DBP-09 Twin unlock koşulu) BU KATMANDA tanımlanır;
  gerçek test senaryosu yazımı ayrı GO-IMPLEMENT'e tabidir (bu belge test kodu ÜRETMEZ).
```

---

## 6. Master Blocker Register — OWNER-APPROVED [D] (31 kayıt / 7 sınıf; tek tracker)

```text
İLKE: bu register TEK TRACKER'dır — hiçbir kaynak-bulgu (DBP-03..10) disposition'suz kaybolamaz;
her kayıt kaynak-ID'sini taşır (yeniden ID üretilmez). Sınıflandırma bulgunun ETKİ ALANINA göredir,
kaynak DBP'ye göre değil.
```

**7-sınıf dağılım özeti (kaynak-ID referanslı; ayrıntı ilgili DBP belgesinde):**

| Sınıf | Örnek kayıtlar (kaynak-ID) | Not |
|---|---|---|
| CURRENT_PRODUCTION_REMEDIATION | *(restricted — owner-local register; public'te yalnız "PRESENT")* | QUEUE-A; owner GO ile açılabilir |
| IMPLEMENTATION_ENTRY_BLOCKER | *(restricted kalemler — owner-local register)* | yeni implementasyon öncesi çözülmeli — **LRV-02 REMEDIATED + LRV-03 SPLIT (LRV-03A REMEDIATED; LRV-03B RECLASSIFIED → `DBP-P2-BP-01`, business-policy / automation-semantics eksenine TAŞINDI — artık bu security implementation-entry-blocker satırında DEĞİL), bkz. aşağıdaki reconciliation notları** |
| CAPABILITY_ACTIVATION_BLOCKER | DBP-09 office tenant-only read gap — DTIB (public) · *(+ restricted kalemler — owner-local register)* | Twin/yeni-yüzey aktivasyonu bekler |
| CUTOVER_BLOCKER | DBP-04 AS-IS scheduler itiraz-fact'siz geçiş (owner-kabullü bilinen risk; public) | cutover öncesi kapanmalı |
| LEGAL_SIGN_OFF_BLOCKER | DBP-04 LSR (OF-02/03/04, DA-03..07, LG-01..10 içerikleri) · DBP-07 LSR (müteselsillik/kefalet/iflas) (public) | LDO/Finance sign-off bekler |
| EVIDENCE_GAP | DBP-08 EEV-01/EEV-02 · RC-G3-07'nin 3 NOT-VERIFIED (AuditLog-as-state/as-feature/duplicate-side-effect) (public) | VERIFICATION REQUIRED |
| NON_BLOCKING_TECH_DEBT | `identityNo` deprecated çift-okuma · `CaseObjectionPeriodDaysProvider` dead-logic (DBP-04 §20) (public) | acil değil, kayıtlı |

**Restricted güvenlik bulguları (owner-local register; bu tabloda ayrı ID/teknik başlıkla
LİSTELENMEZ):** CURRENT_PRODUCTION_REMEDIATION ve IMPLEMENTATION_ENTRY_BLOCKER/CAPABILITY_
ACTIVATION_BLOCKER sınıflarının DBP-10-kaynaklı alt-kümesi (template/download scope doğrulaması
dahil) owner-local restricted register'da izlenir; disposition'ları KAYBOLMAZ, yalnız bu public
belgede detaylandırılmaz.

**Ambiguous legacy alanlar (otomatik canonical YASAK — §3 backfill sınırı ile tutarlı):**
`liabilityAmount`/`liabilityType` (DBP-07 §6) · `DebtorRole` `@default(ASIL_BORCLU)` (DBP-07 §4) ·
`shareRatio` string (DBP-07 §8) · `endorsers`/`avals` JSON (DBP-07 §7) · `debtorLawyer*` düz alan
(DBP-07 §5) · `isPledgorDebtor` (DBP-07 §7) · NULL-kimlik kayıtları (DBP-06 §17) · historical
`Case.riskScore` (DBP-08 §5) · AuditLog-türev sinyaller (DBP-08 §4/§11). **UNRESOLVED geçerli bir
sonuçtur**; bu alanlardan hiçbiri analiz veya migration sırasında otomatik canonical KABUL EDİLMEZ.

**Kayıt sayısı:** 31 kayıt (yukarıdaki kategorilerin toplamı; tam liste = kaynak DBP belgelerinin
kendi register'ları + bu belgenin sınıflandırma eşlemesi). Bu belge sayıyı DEĞİŞTİRMEZ, yalnız
sınıflar.

**LRV-02 REMEDIATION RECONCILIATION (2026-07-16, DBP-P2-SEC-P01-GOV — bkz. `decision-log.md`
aynı tarihli kayıt):** Yukarıdaki IMPLEMENTATION_ENTRY_BLOCKER satırındaki "DBP-07 LRV-02/LRV-03"
ifadesi bu register'ın yazıldığı tarihte doğruydu; bu not onu SİLMEZ/DEĞİŞTİRMEZ, yalnız güncel
repository truth ile uzlaştırır. **LRV-02 (UYAP `DebtorRole`→`rolTur` mapping — `uyap-xml.service.ts`
`mapDebtorRoleToUyapKod`) IMPLEMENTED / MERGED / EVIDENCED** (PR #1322, squash
`fa359a1d78801e6b560a78ec61c3fc5e9ca2585b`, 2026-07-16; CI 4/4 SUCCESS). Kapsam: 6/12 rol eşlemesi
(`MUSETEREK_BORCLU`/`ADI_KEFIL`/`MUTESELSIL_KEFIL`/`AVAL`/`LEHDAR`/`MUHATAP`) düzeltildi + exhaustive
mapping guard eklendi. **RISK CLASS: PRE-PRODUCTION LEGAL DATA INTEGRITY RISK** (gerçek UYAP
submission — `uyapService.submitDocument` — bugün bir `[STUB]`'dır; **RUNTIME AUTHORIZATION EFFECT:
NONE PROVEN**). **TENANT ISOLATION EFFECT: NONE.** **`TASFIYE_MEMURU`/`IFLAS_MASASI`: AS-IS korunur,
ayrı OWNER-LDO DECISION PENDING** (UYAP `exchange.dtd`'de karşılık gelen kod yok). **İkinci UYAP
mapper (`uyap-case-mapper.service.ts`): kapsam dışı, ayrı analiz gerekir.** **LRV-03: HENÜZ
BAŞLAMADI** — bu kayıt onu kapatmaz, yukarıdaki tablo satırında AÇIK kalmaya devam eder. Bu kayıt
Phase 2'yi genel olarak yetkilendirmez; **IMPLEMENTATION ENTRY: tamamlanan bu remediation birimi
HARİCİNDE HOLD** olarak kalır.

**DBP-P2-SEC-P02 GOVERNANCE RECONCILIATION (2026-07-16, bkz. `decision-log.md` aynı tarihli
kayıt):** Yukarıdaki nottaki "İkinci UYAP mapper (`uyap-case-mapper.service.ts`): kapsam dışı,
ayrı analiz gerekir" ifadesi o tarihte doğruydu; bu not onu SİLMEZ/DEĞİŞTİRMEZ, yalnız o ayrı
analizin sonucunu kaydeder. **İkinci UYAP mapper (`UyapCaseMapperService.mapDebtorRole`)
HARDENING: IMPLEMENTED / MERGED / EVIDENCED** (PR #1327, squash
`af29e60e9da3cdcea922a74b77d97ca325cd24a6`, 2026-07-16; CI 4/4 SUCCESS). **BEHAVIOR CHANGE: 0**
— 12/12 mevcut rol çıktısı AS-IS korundu; yalnız exhaustive mapping guard
(`Record<Exclude<DebtorRole, TASFIYE_MEMURU|IFLAS_MASASI>, UyapTarafRolu>`) eklendi. **RISK
CLASS: PRE-PRODUCTION EXPORT DATA INTEGRITY HARDENING.** **SECOND MAPPER CONTRACT: LEGACY /
NARROW EXPORT CONTRACT** (kendi hata mesajında "Legacy UYAP export yolu" olarak öz-tanımlı;
6-değerli `UyapTarafRolu` sözleşmesi, `uyap-xml.service.ts`'in 10-kodlu `exchange.dtd`
sözleşmesinden yapısal olarak farklı — LRV-02'nin duplikasyonu DEĞİL). **`TASFIYE_MEMURU`/
`IFLAS_MASASI`: AS-IS korunur, OWNER-LDO DECISION PENDING** (LRV-02 ile ORTAK açık karar).
**`LEHDAR`/`MUHATAP` hedef sınıflandırması: OWNER-LDO DECISION PENDING** (bu iki rol için
"BORCLU" sınıflandırmasının hukuki uygunluğu repo'dan kanıtlanamaz — DBP-P2-SEC-P02 analizinde
UNPROVEN olarak işaretlendi). **LRV-02: CLOSED / NOT REOPENED.** **LRV-03: HENÜZ BAŞLAMADI** —
bu kayıt açmaz. Bu kayıt Phase 2'yi genel olarak yetkilendirmez; **IMPLEMENTATION ENTRY:
tamamlanan remediation birimleri HARİCİNDE HOLD** olarak kalır.

**DBP-P2-SEC-P03A GOVERNANCE RECONCILIATION (2026-07-16, bkz. `decision-log.md` aynı tarihli
kayıt):** Yukarıdaki notlardaki "LRV-03: HENÜZ BAŞLAMADI" ifadesi o tarihte doğruydu; bu not onu
SİLMEZ/DEĞİŞTİRMEZ, yalnız `DBP-P2-SEC-P03` GO-ANALYZE'inin sonucunu uzlaştırır. **LRV-03 SPLIT:
analiz, LRV-03'ü iki ayrı bulguya böldü — LRV-03A (mekanik invariant: eksik CaseDebtor lifecycle
guard) ve LRV-03B (iş kuralı: bir/bazı `CaseDebtor` PASSIVE iken Case-seviyesi otomasyon
semantiği).** **LRV-03A (`WorkflowEngine.createEnforcementAction`'ın `caseDebtorId` dalına
`CaseDebtor.lifecycleStatus` guard'ı — DBP-07 §11 "Passivation Guard Is Universal"):
IMPLEMENTED / MERGED / EVIDENCED** (PR #1336, squash
`93f5f77f4b447bc6cd15e77908e386b635107bf1`, 2026-07-16; CI 4/4 SUCCESS; yeni CI step canlı
çalıştı — 6/6 PASS; disposable Postgres 10/10 PASS). **LRV-03A INVARIANT: `caseDebtorId` PROVIDED
+ PASSIVE = REJECT (`BadRequestException`); `caseDebtorId` PROVIDED + ACTIVE = ALLOW;
`caseDebtorId` OMITTED = AS-IS/UNCHANGED.** **BEHAVIOR CHANGE: 0** — bugünkü tek üretici
(`executeRule`) `caseDebtorId` vermediği için üretim davranışı kanıtlı şekilde değişmez.
**RISK CLASS: PRE-PRODUCTION LEGAL-STATE / WORKFLOW INTEGRITY.** **TENANT EFFECT: NONE.**
**AUTHORIZATION EFFECT: NONE.** **SCHEMA/MIGRATION: NONE.** **PUBLIC API: NONE.**
**LRV-03B: NOT STARTED / SEPARATE OWNER PROGRAM** (Case-seviyesi "tüm/bazı borçlular pasif iken
otomasyon" politikası; Liability modeli / çok-borçlulu dosya / OD-07 ile kesişir — bu kayıt onu
AÇMAZ, karara bağlamaz; yukarıdaki tablo satırında `LRV-03B` AÇIK blocker olarak kalır).
**PHASE 2 GENEL GİRİŞ: YETKİLENDİRİLMEDİ (NOT AUTHORIZED).** **IMPLEMENTATION ENTRY:
tamamlanan remediation birimleri (LRV-02, ikinci mapper hardening, LRV-03A) HARİCİNDE HOLD**
olarak kalır. **AYRI CI BULGUSU (yalnız referans, bu görevde remediate EDİLMEDİ):** LRV-02 ve
DBP-P2-SEC-P02'nin test dosyaları ci.yml'in dosya-adı bazlı allowlist'inde YER ALMIYOR olabilir —
ayrı OWNER task'ıdır, LRV-03A-GOV'un parçası DEĞİLDİR.

**DBP-P2-BP-01 GOVERNANCE RECORD & LRV-03B RECLASSIFICATION (2026-07-17, bkz. `decision-log.md`
aynı tarihli kayıt):** Yukarıdaki DBP-P2-SEC-P03A notundaki "LRV-03B: NOT STARTED / SEPARATE OWNER
PROGRAM ... yukarıdaki tablo satırında `LRV-03B` AÇIK blocker olarak kalır" ifadesi o tarihte
doğruydu; bu not onu SİLMEZ/DEĞİŞTİRMEZ, yalnız `DBP-P2-SEC-P03B` GO-ANALYZE'i sonrası owner
kararını uzlaştırır. **RECLASSIFICATION: eski `LRV-03B` bir güvenlik açığı DEĞİL, bir iş-kuralı
tasarım sorusudur** — analiz kanıtladı ki Case-seviyesi otomasyon (cron seçimi + `processCase` +
6 kural) CaseDebtor lifecycle'a tamamen kördür ve tartışılan konu "tüm borçlular pasif olduğunda
case-seviyesi otomasyonun hukuken ne yapması gerektiği"dir. Bu nedenle kayıt **`LRV-03B` (security
implementation-entry-blocker) → `DBP-P2-BP-01`** olarak yeniden sınıflandırıldı ve
**BUSINESS POLICY / AUTOMATION SEMANTICS / LEGAL RESPONSIBILITY** eksenine taşındı (güvenlik
remediation listesinde artık izlenmez; yukarıdaki IMPLEMENTATION_ENTRY_BLOCKER satırından
çıkarıldı). **KANONİK İŞ KURALI (OWNER-DECIDED): tüm `CaseDebtor` kayıtları PASSIVE ise
case-seviyesi otomasyon = STOP / FAIL-CLOSED; en az bir `CaseDebtor` ACTIVE ise = CONTINUE.**
Bu karar case closure OLUŞTURMAZ, claim satisfaction OLUŞTURMAZ, `Case.isAutoMode` değerini
DEĞİŞTİRMEZ, CaseDebtor-bazlı rule classification OLUŞTURMAZ, LegalResponsibility realization
AÇMAZ. **OPTION A: AUTHORIZED** (bounded fail-closed all-passive stop; migration'sız,
LegalResponsibility aggregate'ını varsaymayan, OD-07 realization'ını beklemeyen). **OPTION B
(tam rule-classification / debtor-bound execution): DEFERRED TO OD-07 PROGRAM** (artık remediation
değil, yeni domain capability tasarımı). **OPTION C: NOT SELECTED.** **AÇIK İSTİSNA:
ESTATE / SUCCESSION / TEREKE senaryoları bu kararla ÇÖZÜLMEDİ** — ayrıca owner/LDO
değerlendirmesine açık; ancak bu açık konu Option A implementation'ını otomatik BLOKE ETMEZ.
**IMPLEMENTATION: NOT STARTED** — bu kayıt yalnız owner kararını ve yeniden sınıflandırmayı
kaydeder; `DBP-P2-BP-01` implementation'ı ayrı owner GO-IMPLEMENT gerektirir. **LRV-03A: CLOSED /
NOT REOPENED.** **PHASE 2 GENEL GİRİŞ: YETKİLENDİRİLMEDİ (NOT AUTHORIZED).** Metodolojik ayrım
korunur: **LRV-03A = mechanical invariant (implemented); LRV-03B/`DBP-P2-BP-01` = business policy
(owner decision)** — güvenlik remediation ile iş-kuralı tasarım kararları ayrı eksenlerde izlenir.

**DBP-P2-BP-01 IMPLEMENTATION EVIDENCE RECONCILIATION (2026-07-17, bkz. `decision-log.md` aynı
tarihli kayıt):** Yukarıdaki DBP-P2-BP-01 GOVERNANCE RECORD notundaki "**IMPLEMENTATION: NOT
STARTED**" ifadesi o tarihte (owner kararı kaydedilirken) doğruydu; bu not onu SİLMEZ/DEĞİŞTİRMEZ,
yalnız `OWNER GO-IMPLEMENT — DBP-P2-BP-01` sonucunu current-state olarak uzlaştırır.
**`DBP-P2-BP-01` (Option A — all-passive case automation stop): IMPLEMENTED / MERGED / EVIDENCED**
(PR #1346, squash `fc761c4ebb683b324c819094d3603d1466652c1d`, 2026-07-17; CI 4/4 SUCCESS;
her iki yeni CI step canlı çalıştı — unit 9/9 PASS + db-gated 3/3 PASS). **IMPLEMENTED POLICY:
CaseDebtor kaydı VARSA ve TÜMÜ PASSIVE ise case-seviyesi otomasyon = STOP / CONTROLLED NO-OP;
en az bir ACTIVE varsa = CONTINUE; hiç CaseDebtor yoksa (debtorless) = AS-IS / CONTINUE.** Guard
`WorkflowEngine.processCase` içinde, rule değerlendirmesinden ÖNCE; lifecycle dağılımı mevcut
caseData sorgusuna eklendi (yeni/duplicate query YOK). **SIDE-EFFECT CONTRACT: NO-OP / NO PARTIAL
WRITE.** **CASE CLOSURE: NOT CREATED. CLAIM SATISFACTION: NOT CREATED. `Case.isAutoMode`:
UNCHANGED. CASE STATUS: UNCHANGED. CASEDEBTOR LIFECYCLE: UNCHANGED. ERROR/API CONTRACT: UNCHANGED.
SCHEMA/MIGRATION: NONE. PUBLIC API: NONE.** Kanıt: production tsc PASS (0 yeni hata),
diff-aware ESLint 0 error/0 warning, automation modülü regresyon 113 PASS / 0 FAIL (LRV-03A +
RFA-007 dahil), disposable Postgres migrate deploy PASS + db-gated 3/3, shared/dev DB mutation
NONE. **OPTION A: IMPLEMENTED / CLOSED.** **OPTION B (tam rule-classification / debtor-bound
execution): DEFERRED TO OD-07 PROGRAM (açık).** **OD-07: HOLD / UNTOUCHED.** **RULE
CLASSIFICATION / DEBTOR-BOUND EXECUTION: NOT STARTED.** **ESTATE / SUCCESSION / TEREKE
SINIFLANDIRMASI: OPEN / NOT DECIDED** (bu implementation yeni istisna/hukuki sonuç ÜRETMEDİ).
**LRV-03A: CLOSED / NOT REOPENED.** **PHASE 2 GENEL GİRİŞ: YETKİLENDİRİLMEDİ.** Bu kayıt yeni
workstream başlatmaz.

**DBP-P2-LDO-01 UYAP ROLE-CONTRACT DISPOSITION & CUTOVER GATE (2026-07-17, bkz. `decision-log.md`
aynı tarihli kayıt):** Yukarıdaki DBP-P2-SEC-P02 notundaki "`TASFIYE_MEMURU`/`IFLAS_MASASI`: AS-IS
korunur, OWNER-LDO DECISION PENDING" ve "`LEHDAR`/`MUHATAP` hedef sınıflandırması: OWNER-LDO
DECISION PENDING ... UNPROVEN" ifadeleri o tarihte doğruydu; bu not onları SİLMEZ/DEĞİŞTİRMEZ,
yalnız `DBP-P2-LDO-01` GO-ANALYZE'i sonrası owner disposition'ını uzlaştırır. **DBP-P2-LDO-01:
ANALYSIS COMPLETE.** **OWNER DISPOSITION: INTERIM OPTION C SELECTED** (transitional AS-IS + açık
risk); **OPTION A (fail-closed): PREFERRED CONDITIONAL TARGET, IMPLEMENTATION NOT AUTHORIZED**;
**OPTION B (representation/organ model): DEFERRED TO OD-07 + PARTY FOUNDATION.** **BAĞLAYICI
SINIFLANDIRMA:** `LEHDAR → LEHTAR` **REPOSITORY-CONTRACT CONSISTENT / PRESERVED** (XML 10-kod
sözleşmesi; NO GLOBAL DEBTOR OR LIABILITY CONCLUSION); `MUHATAP → MUHATAP` **REPOSITORY-CONTRACT
CONSISTENT / PRESERVED** (legal effect senet türüne ve kabule bağlıdır; NO GLOBAL DEBTOR OR
LIABILITY CONCLUSION); `TASFIYE_MEMURU`/`IFLAS_MASASI → BORCLU FALLBACK` **TRANSITIONAL /
NON-CANONICAL** (her iki sözleşmede). **UYAP ROLE-CONTRACT CUTOVER GATE (kurulur):** gerçek UYAP
submit cutover'ı (`uyapService.submitDocument` STUB'ının kaldırılması) `TASFIYE_MEMURU`/
`IFLAS_MASASI` için doğru taraf/temsil hedefi owner/LDO + resmi UYAP rolTur sözleşmesiyle
kararlaştırılana kadar **HOLD**; iki UYAP sözleşmesi (XML 10-kod / export 6-değer `UyapTarafRolu`)
ayrı izlenir. **FAIL-CLOSED ROLE PATCH: NOT YET AUTHORIZED.** **ESTATE / SUCCESSION EXCEPTION: NOT
CREATED** (DBP-P2-BP-01 UNCHANGED). **OD-07 / PARTY FOUNDATION REOPEN TRIGGERS: PRESERVED** (bu
kayıt OD-07'yi açmaz, Party Foundation'ı reopen etmez). Bu kayıt kod/test/CI/schema/UYAP-kodu
ÜRETMEZ ve şu görevleri BAŞLATMAZ: `DBP-P2-UYAP-CONTRACT-01`, fail-closed role patch, OD-07/Party
reopen. **NEXT ELIGIBLE TASK: OWNER SEÇİMİ** — bu governance kaydı tamamlandıktan sonra owner
`DBP-P2-UYAP-CONTRACT-01` veya başka owner-gated birimi ayrıca yetkilendirebilir.

**DBP-P2-LDO-01-GOV-R1 OWNER DISPOSITION REVISION RECONCILIATION (2026-07-17, bkz. `decision-log.md`
aynı tarihli kayıt):** Yukarıdaki DBP-P2-LDO-01 notundaki "**OPTION A (fail-closed): PREFERRED
CONDITIONAL TARGET**" ifadesi o tarihte doğruydu; bu not onu SİLMEZ/DEĞİŞTİRMEZ, yalnız owner'ın
`DBP-P2-UYAP-CONTRACT-01` GO-VERIFY sonrası verdiği revize kararını uzlaştırır. **REVİZYON GEREKÇESİ
(owner):** GO-VERIFY, resmî UYAP party-rolTur sözleşmesinin ne repository'den ne kamusal birincil
kaynaktan kanıtlanabildiğini gösterdi (BLOCKED). Fail-closed davranış üretmek de bir **ÜRÜN
KARARIDIR** — "unknown role → current transitional" davranışını "unknown role → REJECT"e çevirir;
resmî sözleşme doğrulanmadan bu davranış değişikliği de erkendir. **REVİZE DISPOSITION:** **OPTION A
(fail-closed): NOT YET AUTHORIZED / DEFERRED** (önceki "PREFERRED" konumu geri çekildi). **INTERIM
OPTION C: CONFIRMED.** **OPTION B (representation/organ): DEFERRED TO OD-07 + PARTY FOUNDATION**
(değişmedi). **REVİZE BAĞLAYICI SINIFLANDIRMA:** `LEHDAR → LEHTAR` **XML CANONICAL** (yükseltildi;
XML 10-kod sözleşmesinde kendi kambiyo kodu doğru); `MUHATAP → MUHATAP` **XML CANONICAL**
(yükseltildi; legal effect senet türü + kabule bağlı, global borçlu/sorumluluk sonucu YOK);
`LEHDAR`/`MUHATAP` **EXPORT: TRANSITIONAL**; `TASFIYE_MEMURU`: **TRANSITIONAL**; `IFLAS_MASASI`:
**TRANSITIONAL**; **REAL UYAP CUTOVER: HOLD**; **FAIL-CLOSED IMPLEMENTATION: DEFERRED.** **NEXT
ELIGIBLE TASK REFRAMED:** artık `DBP-P2-UYAP-CONTRACT-01` (teknik doğrulama) DEĞİL — analizin kendi
sonucu (repo + kamusal kaynak KANITLAYAMIYOR) gereği sıradaki owner görevi **OFFICIAL UYAP TECHNICAL
PACKAGE ACQUISITION** (resmî UYAP entegrasyon paketi — DTD/XSD/şartname — teminidir; owner/procurement
tarafı eylem, teknik analiz DEĞİL). **IMPLEMENTATION FREEZE:** resmî UYAP paketi temin edilmeden
şunlar için implementation yetkisi VERİLMEZ: fail-closed role patch · `TASFIYE_MEMURU` · `IFLAS_MASASI`
· export target değişiklikleri. **OD-07 / PARTY FOUNDATION: NOT REOPENED. `DBP-P2-BP-01`: UNCHANGED.**
Bu kayıt kod/test/CI/schema/UYAP-kodu ÜRETMEZ ve yeni workstream başlatmaz.

---

## 7. QUEUE-A / QUEUE-B Disposition — OWNER-APPROVED [E]

```text
QUEUE-A (CURRENT_PRODUCTION_REMEDIATION, ~15 kayıt) = REMEDIATION-ONLY ELIGIBLE:
  - Mevcut runtime'da yaşar; Digital Twin/DBP-12'yi BEKLEMEZ.
  - Her remediation: AYRI owner GO-IMPLEMENT + izole worktree + DAR kapsam + negative-test + CI +
    rollback yolu (bu belge hiçbirini OTOMATİK AÇMAZ — yalnız eligibility'i kaydeder).
QUEUE-B (CAPABILITY_ACTIVATION_BLOCKER + new-capability) = ACTIVATION HOLD:
  - Digital Twin (DBP-09) · Score/NBA (DBP-08) gibi yeni yüzeyler; DBP-10 authz/KVKK + bu belgenin
    test-gate'i + owner GO-IMPLEMENT tamamlanmadan AÇILMAZ.
REMEDIATION-ELIGIBLE ≠ AUTHORIZATION (RC): eligibility bir ön-koşul listesidir, GO-IMPLEMENT
  YERİNE GEÇMEZ.
```

---

## 8. Local Representative Evidence Policy — OWNER-APPROVED [F] (owner-binding; ADR-014 emsali)

```text
KAPSAM: owner local PC / office ortamı YALNIZ. Cloud / external / 3rd-party-AI / remote-staging /
  cross-border ortam YASAK.
MASKING: zorunlu ön-koşul DEĞİLDİR (representative evidence toplarken maskeleme şart koşulmaz) —
  ANCAK tenant-authz, access-control, audit, integrity, export-yasağı ve local-storage-güvenliği
  HER DURUMDA korunur.
YAYILIM YASAĞI: toplanan evidence repo / PR / CI / herhangi bir dış servise ASLA yüklenmez (ADR-014
  local evidence harness emsali; PR-3 Operational Gate deseniyle tutarlı).
```

---

## 9. Score/NBA Package Candidate Constraint — OWNER-APPROVED [G] (DBP-08 ile tutarlı)

Score/NBA package-candidate = **shadow-only**: user-visibility OFF · domain-command-write OFF ·
`Case.riskScore` write (yeni) OFF · CPE fact-write OFF. Bu kısıt DBP-08 §8'in DBP-11 test/release
katmanındaki YANSIMASIDIR; DBP-11 yeni bir kural üretmez, gate'e bağlar.

---

## 10. Program Implementation Entry Verdict — OWNER-APPROVED [H] (öneri; owner adına karar DEĞİL)

```text
VERDICT SEÇENEKLERİ (bu belge SEÇER ama owner adına GO-IMPLEMENT VERMEZ): OPEN CANDIDATE · HOLD ·
  DEFER · BLOCKED.
PROGRAM IMPLEMENTATION ENTRY = HOLD (owner-ratified 2026-07-15): domain sözleşmeleri (DBP-03..10)
  netleşti (Charter §9 "domain sözleşmeleri netleşmeden kapanamaz" koşulu artık sağlanıyor) —
  ANCAK Master Blocker Register'daki IMPLEMENTATION_ENTRY_BLOCKER + LEGAL_SIGN_OFF_BLOCKER sınıfları
  + DBP-12 final synthesis tamamlanmadan program-geneli implementasyon AÇILMAZ.
CAPABILITY-SPECIFIC İSTİSNA (RC): QUEUE-A remediation'ları capability-specific + ayrı owner GO ile
  DBP-12'den ÖNCE açılabilir (§7); bu program-geneli HOLD'u BOZMAZ.
```

---

## 11. DBP-12 Routing

| Hedef | Giden |
|---|---|
| **DBP-12** | Master Blocker Register final konsolidasyon · DBP-03 V-*/DBP-04 LDV-* verbatim doğrulama (traceability; ratified karar açılmaz) · Final Implementation Entry Gate · Risk/KPI + Owner Decision Pack + Execution Handoff (artefakt #29-31) |

---

## 12. Owner Approval Record

```text
APPROVE DBP-11 v1.1 — OWNER-APPROVED / PROGRAM IMPLEMENTATION ENTRY HOLD (2026-07-15, chat-only
owner kararı; bu belge kaydın repo taşıyıcısıdır)
ONAYLANAN ([A]–[M]): Migration Pattern (EXPAND→BACKFILL→SHADOW/DUAL-READ→RECONCILE→CUTOVER→
CONTRACT/RETIRE; big-bang yasak) · Release/Cutover/Rollback (OPTION D; capability-by-capability) ·
Test & Verification katmanları · Master Blocker Register (31 kayıt/7 sınıf; tek tracker; source-
finding disposition'suz kaybolamaz) · QUEUE-A/QUEUE-B disposition (remediation-eligible≠
authorization) · Local Representative Evidence Policy (owner-PC-only; masking-not-mandatory-ama-
authz/audit/export-yasağı-korunur) · Score/NBA package-candidate shadow-only kısıtı · Program
Implementation Entry verdict çerçevesi.
KARARLAR: Migration Pattern = EXPAND→...→CONTRACT (ratified) · Release = OPTION D · PROGRAM
IMPLEMENTATION ENTRY = HOLD · QUEUE-A = remediation-only eligible · QUEUE-B = activation hold.
ONAYLANMAMIŞ/AÇIK: QUEUE-A remediation'ların fiili owner GO-IMPLEMENT'i (bu belge açmaz) · QUEUE-B
activation (DBP-09/10 gate'leri + owner GO) · capability-specific entry status'lar · representative
evidence toplamanın fiili yürütülmesi — statüleri OWNER-GATED / HOLD olarak korunur.
```

**Revizyon geçmişi (özet):** R0.1 ilk L9 analizi (migration/test/release mimarisi taslağı; DBP-01..10
bulgu envanteri) → R0.2 MIGRATION PATTERN CORRECTION (EXPAND→...→CONTRACT kesinleşmesi; big-bang/
destructive-migration yasağı; Release=OPTION D; local evidence policy ADR-014 hizası) → v1.1 MASTER
BLOCKER REGISTER + ENTRY-GATE COMPLETION (31 kayıt/7 sınıf finalize; QUEUE-A/B ayrımı; ambiguous-legacy
listesi; RC-DBP11-01..10) → GO-DOCS pre-normalizasyonu (repo artefakt #27/#28 cross-ref'i; DBP-03..10
canonical kaynak-ID'lerine bağlama — V-*/LDV-*/LRV-*/EEV-* yeniden üretilmeden referans; GÜVENLİK
SINIRI DÜZELTMESİ (2026-07-16, DBP-10-SEC-REDACT ile eşzamanlı): DBP-10-kaynaklı güvenlik
kalemleri bu belgede artık ayrı ID/teknik başlıkla LİSTELENMEZ, opak public-safe disposition'a
çevrildi; RC clarification'ların gövdeye absorbe edilmesi). Ara revizyon metinleri görev
sohbetindedir; bağlayıcı olan bu konsolide belgedir.

## GOVERNANCE DOCUMENT SELF-CHECK

```text
- Design-readiness execution/evidence/cutover-readiness ile karıştırıldı mı:  NO (§10; ayrı kavramlar)
- DBP-03 V-*/DBP-04 LDV-* verbatim değiştirildi mi:                          NO (§6/§11; referans, DBP-12'de doğrulanır)
- Master Blocker Register'da source-finding disposition'suz mu:             NO (§6; tek tracker)
- Template/download scope FOUND olarak mı gösterildi:                       NO (§6; NOT VERIFIED/HIGH kalır)
- Remediation-eligible authorization yerine mi geçti:                       NO (§7; ayrı owner GO şart)
- Score/NBA package shadow-only kısıtı korundu mu:                          YES (§9)
- Local evidence cloud/external/3rd-party'ye mi gitti:                      NO (§8; owner-PC-only)
- Masking zorunlu-ön-koşul olarak mı dayatıldı:                             NO (§8; authz/audit/export korunur)
- Current-production queue Twin/DBP-12'yi bekliyor mu:                      NO (§7; QUEUE-A bağımsız)
- Her remediation izole-worktree+negative-test+rollback şartı korundu mu:   YES (§7)
- Ambiguous legacy alanlar otomatik canonical kabul edildi mi:              NO (§6; UNRESOLVED)
- Bu belge owner adına GO-IMPLEMENT verdi mi:                               NO (§10; DBP-11≠GO-IMPLEMENT authority)
- Güvenlik bulgusu exploit/route ayrıntısı ifşa edildi mi:                  NO (§6; PUBLIC-SAFE — DBP-10-kaynaklı kalemler owner-local register'da, ayrı ID/başlıkla listelenmedi)
- Zaten-public olmayan güvenlik detayı bu belgede yeniden mi üretildi:      NO (§6; yalnız DBP-04/07/08'de zaten public olan düzey korundu)
- Ratified bir karar bu belgede yeniden açıldı mı:                          NO
- IMPLEMENTATION AUTHORITY: NONE korundu:                                   YES
- Register/decision-log değişikliği:                                       NO
- Orphan referans:                                                          NO (path'ler main'de mevcut)
```
