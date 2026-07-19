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

**DBP-P2-UYAP-PUBLIC-SOURCES-01-GOV OFFICIAL CONTRACT DIVERGENCE RECONCILIATION (2026-07-18, bkz. `decision-log.md` aynı tarihli kayıt):** `DBP-P2-UYAP-PUBLIC-SOURCES-01` GO-VERIFY (kamuya açık resmî UYAP kaynak taraması) sonucu canonical'a geçirilir; yukarıdaki R1 notunun `LEHDAR → LEHTAR XML CANONICAL` / `MUHATAP → MUHATAP XML CANONICAL` sınıflandırması **SUPERSEDED**'dir (R1 notu SİLİNMEZ; bu not onu güncel repository-truth ile uzlaştırır). **RESMÎ KAYNAK (VERIFIED):** `uyap.gov.tr/e-takip-tanitimi-ve-programlari` → `rayp.adalet.gov.tr` 20.03.2024 XML paketi (`etakipsetup21-03-20242-17-pm.rar`); resmî `exchange.dtd` VERSION 1.2 / 2015-12-17 / SHA-256 `124a9a96848299d8abf216111572d7c8286777819422a5e29089b956f56a8fe6`; resmî rol sözlüğü `KodluBilgilerData.xml` = **17 rol / rolID 21-71** (ALACAKLI 21, BORÇLU/MÜFLİS 22, İFLAS İDARE MEMURU 23, …ADAYI 24, İSTİHKAK İDDİASI SAHİBİ 25, ÜÇÜNCÜ ŞAHIS 26, KEFİL 33, TEREKE SORUMLUSU 34, MÜFLİS 41, YED-İ EMİN 43, REHİN SAHİBİ 44, İHALE KATILIMCISI 45, HİSSEDAR 46, İPOTEK SAHİBİ 47, KİRACI 53, İŞGALCİ 54, ARACI 71). DTD ve rol listesi **2023 ve 2024 paketlerinde AYNI** (stabil/otoritatif). **CONTRACT A — EXCHANGEDATA: PUBLIC OFFICIAL SOURCE VERIFIED.**
**REPOSITORY MISMATCH:** repo `exchange.dtd` SHA-256 `5a3ea03c4f92e92949408cb98532132436a8028836030b86a2de422529e55a5f` — resmî DTD ile **BYTE EQUALITY: NO / SHA-256 EQUALITY: NO / SEMANTIC DIFFERENCE: STRUCTURAL + ROLE VOCABULARY.** Repo `rolTur` = `taraf` attribute / CDATA; resmî `rolTur` = child element (`rolID`/`Rol` attributes). Repo kod sözlüğü **1-10**; resmî **21-71**; **OVERLAP: NONE.** Repo DTD yorumundaki `Kaynak`/`Versiyon 2024.03` ibaresi resmî dosyayla **byte veya semantic eşitlik KANITLAMAZ** (elle yeniden yazılmış yaklaşım).
**SUPERSEDED CLASSIFICATION (yeni hüküm):** `LEHDAR`/`LEHTAR` = INSTRUMENT ATTRIBUTE / NOT OFFICIAL rolTur; `MUHATAP` = INSTRUMENT ATTRIBUTE / NOT OFFICIAL rolTur; `KESIDECI`/`CIRANTA`/`AVALCI` = INSTRUMENT-LEVEL SEMANTICS / NOT OFFICIAL rolTur (resmî DTD'de kambiyo tarafları `police`/`senet`/`cek` element attribute'larında — `lehtarAdSoyad`/`kesideciAdSoyad`/`odeyecekKisiAdSoyad`). **rolTur TARGET: NO VALID OFFICIAL TARGET VERIFIED.** Bu kayıt hukuki borçluluk/sorumluluk kararı ÜRETMEZ.
**ROL DISPOSITION:** ALACAKLI (ID 21), BORÇLU/MÜFLİS (ID 22/41 — domain mapping NOT DECIDED), KEFİL (ID 33), ÜÇÜNCÜ ŞAHIS (ID 26), İFLAS İDARE MEMURU (ID 23), TEREKE SORUMLUSU (ID 34) = OFFICIAL ROLE EXISTS. Eşleme İLAN EDİLMEZ (PROHIBITED WITHOUT LDO/OWNER DECISION): `MIRASCI → TEREKE SORUMLUSU`, `IFLAS_MASASI → MÜFLİS`, `IFLAS_MASASI → İFLAS İDARE MEMURU`, `TASFIYE_MEMURU → İFLAS İDARE MEMURU`. MÜFLİS / İFLAS İDARE MEMURU / TEREKE SORUMLUSU ayrı resmî rollerdir; otomatik domain mapping YETKİLENDİRİLMEZ.
**CONTRACT B — TAKIPTALEPLERI:** PUBLIC OFFICIAL SOURCE NOT FOUND (yalnız portal giriş — `avukat.uyap.gov.tr`/`kurum.uyap.gov.tr`; XSD/WSDL kamusal değil). `UyapTarafRolu` 6-değer union = REPOSITORY-CONSISTENT NAMES ONLY / OFFICIAL CONTRACT AUTHORITY UNPROVEN; gerekli kaynak PORTAL / INTEGRATOR / MINISTRY. Contract A rol listesi Contract B'ye **otomatik uygulanamaz.**
**CUTOVER & FREEZE:** REAL UYAP CUTOVER = HARD HOLD; `submitDocument` = STUB; CURRENT REPOSITORY CONTRACT COMPLIANCE = NOT VERIFIED; **RISK CLASS = HIGH — EXTERNAL CONTRACT DIVERGENCE** (repo DTD/kod sözlüğü resmî sözleşme gibi adlandırılıp yanlış authority izlenimi üretiyor; production effect NONE — STUB). IMPLEMENTATION FREEZE = ACTIVE: DTD replacement · rolTur code migration · mapper behavior change · fail-closed patch · `TASFIYE_MEMURU`/`IFLAS_MASASI`/`MIRASCI`/`LEHDAR`/`MUHATAP` mapping · export target changes = NONE authorized. Resmî artefaktlar repo-DIŞI READ-ONLY intake `C:\Development\HUKUK_YAZILIMI\UYAP_OFFICIAL_PACKAGE_REVIEW\`'a kaynak yapısı korunarak alındı (repository'ye KOPYALANMADI; installer/binary çalıştırılmadı). **NEXT ELIGIBLE TASK: `DBP-P2-UYAP-CONTRACT-A-REMEDIATION-01` — GO-ANALYZE ONLY** (ayrı owner GO; bu kayıt başlatmaz). Bu not kod/test/CI/schema/UYAP-kodu ÜRETMEZ; OD-07/Party reopen etmez; `DBP-P2-BP-01` değiştirmez.

**DBP-P2-UYAP-CONTRACT-A-REMEDIATION-01-GOV OWNER REMEDIATION DECISION (2026-07-18, bkz. `decision-log.md` aynı tarihli kayıt):** `DBP-P2-UYAP-CONTRACT-A-REMEDIATION-01` GO-ANALYZE (owner ACCEPTED) → owner remediation kararı canonical'a geçirilir; yukarıdaki PUBLIC-SOURCES-01-GOV notunu SİLMEZ, üzerine remediation yönünü kaydeder.
**OFFICIAL CONTRACT A: VERIFIED** (yukarısı). **CURRENT REPOSITORY CONTRACT: STRUCTURAL + SEMANTIC DIVERGENCE** — repo builder (`uyap-xml.service.ts`) resmî `exchange.dtd`'ye valide OLMAZ: element↔attribute, `sira`↔ID/IDREF `ref`, rolTur attribute+1-10 vs element+21-71, encoding UTF-8 vs ISO-8859-9; `validateXml` gerçek DTD doğrulaması değil (string-only). **DATA MIGRATION: NONE** (`NO_DATA_MIGRATION` — 1-10 kodları + üretilen XML persist edilmiyor; yalnız `DebtorRole` 12-değer enum `CaseDebtor.role`'de).
**PRIMARY REMEDIATION: PARALLEL OFFICIAL BUILDER / SHADOW (OPTION A SELECTED).** **OFFICIAL BOUNDARY: DOMAIN → TRANSLATOR → OFFICIAL XML (OPTION C PATTERN, yeni builder içinde; DOMAIN MODEL + `DebtorRole` STABLE).** **IN-PLACE REPLACEMENT (OPTION B): NOT SELECTED.**
**RUNTIME CLASSIFICATION (precise — "runtime effect NONE" GENELLEMESİ YAZILMAZ):** REAL UYAP TRANSMISSION = NONE / STUB (`submitDocument` stub); **AUTHENTICATED XML PREVIEW-DOWNLOAD API = LIVE** (`GET /uyap/xml/case/:caseId` + `…/download` + `POST …/submit` authenticated erişilebilir); FRONTEND CONTRACT-A COMPONENTS = UNMOUNTED (shipped UI'da rota yok); **CURRENT RISK = LATENT BUT REACHABLE MISREPRESENTATION** (dış iletim etkisi yok; ancak canlı authenticated API + yanıltıcı "exchange.dtd v2024.03"/doğrulama-başarılı sunumu erişilebilir); CURRENT LEGACY OUTPUT = NOT PROVEN OFFICIAL-CONTRACT-COMPLIANT.
**REMEDIATION DECOMPOSITION (hiçbiri bu kayıtla başlatılmaz):** `CONTRACT-A-P01` LEGACY SURFACE TRUTHFULNESS CONTAINMENT — OWNER GO REQUIRED (P01 kapsamında sonra değerlendirilecek: "Official/UYAP-compliant" iddiaları · false-positive `validateXml` sonucu · v2024.03 authority iması · preview/download response labeling · duplicate role-table `uyap-codes.ts` tuzağı); `CONTRACT-A-P02` PARALLEL OFFICIAL BUILDER SKELETON — OWNER GO REQUIRED; `CONTRACT-A-P03` LDO-GATED ROLE TRANSLATION — BLOCKED BY LDO; `CONTRACT-A-P04` SHADOW / OFFICIAL DTD EVIDENCE — NOT STARTED; `CONTRACT-A-P05` CUTOVER DECISION — NOT AUTHORIZED.
**OFFICIAL PATH ROLE & FALLBACK PRINCIPLE (yalnız gelecekteki additive official path için):** resolved official mapping → EMIT; UNRESOLVED ROLE → NO XML EMISSION / REJECT; **SILENT BORCLU FALLBACK PROHIBITED IN OFFICIAL PATH.** **LEGACY PATH: bu governance kararıyla DEĞİŞMEZ.** **ROLE TARGET VALUES: NOT DECIDED.** Şu eşlemeler karar olarak KAYDEDİLMEZ (LDO+owner-gated, P03): `MIRASCI → TEREKE SORUMLUSU`, `TASFIYE_MEMURU → <official role>`, `IFLAS_MASASI → MÜFLİS`, `IFLAS_MASASI → İFLAS İDARE MEMURU`, `MUSETEREK_BORCLU → BORÇLU/MÜFLİS`.
**CONTRACT B: OUTSIDE this remediation** (takipTalepleri; authority PORTAL/INTEGRATOR gerektirir); **Contract A bulguları Contract B'ye KOPYALANMAZ.**
**CUTOVER: HARD HOLD. IMPLEMENTATION FREEZE: ACTIVE.** Bu not kod/test/schema/mapper/`validateXml`/endpoint/UI-label/DTD DEĞİŞTİRMEZ; official DTD repo'ya kopyalanmaz; hukuki borçluluk türetmez; OD-07/Party reopen etmez; `DBP-P2-BP-01` değiştirmez. **NEXT ELIGIBLE TASK: `DBP-P2-UYAP-CONTRACT-A-P01` — OWNER GO-ANALYZE OR GO-IMPLEMENT REQUIRED** (ayrı owner GO; bu kayıt başlatmaz).

**DBP-P2-UYAP-CONTRACT-A-P01-GOV IMPLEMENTATION/EVIDENCE CLOSURE (2026-07-18, bkz. `decision-log.md` aynı tarihli kayıt):** `DBP-P2-UYAP-CONTRACT-A-P01` GO-IMPLEMENT (owner-ACCEPTED) kapanışı canonical'a geçirilir; yukarıdaki REMEDIATION-01-GOV notunu SİLMEZ, P01 implementation/evidence sonucunu ekler.
**P01: IMPLEMENTED / EVIDENCED / CANONICAL** — PR #1385 / squash `e3c881b34f72603fd356b47dbadd1fb847c65cde`; required CI 4/4 SUCCESS (Architectural Guardrails · Test Suite [prod tsc + dedicated P01 spec step] · Web Tests · Client Workspace Live Smoke); canonical `main == origin/main == e3c881b3` senkron.
**F1 LEGACY ENVELOPE: CONTAINED** (`GET /uyap/xml/case` → `contractMode=LEGACY_LOCAL`, `officialContractCompliant=false`, `officialContractVersion=null`, `cutoverStatus=HOLD`; hard-coded `version='2024.03'` kaldırıldı). **F2 VALIDATION: LOCAL STRUCTURAL PRECHECK / OFFICIAL DTD VALIDATION FALSE** (`validateXml` → `validationMode=LOCAL_STRUCTURAL_PRECHECK` + `officialDtdValidated=false`). **F3 SUBMISSION: STUB / TRANSMITTED FALSE / FAKE EVK REMOVED** (`POST /uyap/xml/submit` → `mode=STUB`, `transmitted=false`, `evkNo=null`, `stubReference`; "UYAP kuyruğuna alındı" kaldırıldı). **F4 AUTHORITY CLAIMS: CORRECTED** (`exchange.dtd` + `uyap-xml.service.ts` yorumları LOCAL/LEGACY/NOT-OFFICIAL/NOT-PROVEN-COMPLIANT; "Versiyon: 2024.03" iması kaldırıldı; dosya adı DEĞİŞMEDİ). **F5 DUPLICATE ROLE TABLE: REMOVED** (importer'sız `uyap-codes.ts` `UYAP_ROL_TURLERI` silindi; tek runtime tablo `uyap-xml.service.ts`).
**KORUNAN (açıkça):** LEGACY XML SHAPE UNCHANGED (`generateExchangeXml` + `<!DOCTYPE ... "exchange.dtd">` + rolTur attribute + 10-kod; golden regression PASS) · ROLE CODES/MAPPINGS UNCHANGED (`mapDebtorRoleToUyapKod` + 1-10 tablo) · SCHEMA/MIGRATION NONE · REAL UYAP TRANSMISSION NONE (`submitDocument` STUB) · UYAP CUTOVER HARD HOLD.
**EVIDENCE:** yeni `uyap-legacy-truthfulness.spec.ts` (13 test, F1-F10) PASS + ci.yml dedicated step; regresyon `uyap-xml.numeric-interest-projection` 33/33 + `uyap-xml.debtor-role-mapping` 22/22 PASS; CI prod type-check (`tsconfig.prod.json`) 0 error.
**LOCAL CLEANUP:** `ORPHANED_WORKTREE_DIR` PRESENT / GIT-DETACHED (git worktree registration temiz, remote+local branch cleaned) / **NON-BLOCKING**; FORCE DELETE NOT PERFORMED (validation `pnpm install` node_modules → Windows "Filename too long"; CLAUDE.md runbook gereği). Bu, canonical kapanış için blocker DEĞİLDİR.
**SONRAKİ BİRİMLER (hiçbiri başlatılmadı):** `CONTRACT-A-P02` PARALLEL OFFICIAL BUILDER SKELETON = NOT STARTED / OWNER GO REQUIRED; `CONTRACT-A-P03` LDO-GATED ROLE TRANSLATION = BLOCKED BY LDO; `CONTRACT-A-P04` SHADOW EVIDENCE = NOT STARTED; `CONTRACT-A-P05` CUTOVER DECISION = NOT AUTHORIZED; `CONTRACT B` = SEPARATE / OPEN (portal/integrator). Bu not production/test/CI/schema/DTD/mapper DEĞİŞTİRMEZ; P02-P05 başlatmaz; Contract B varsayımı / rol mapping kararı üretmez; OD-07/Party reopen etmez; cutover yetkilendirmez. **NEXT ELIGIBLE TASK: OWNER SELECTION — `CONTRACT-A-P02` veya başka owner-gated birim.**

**DBP-P2-UYAP-CONTRACT-A-P02A-GOV IMPLEMENTATION/EVIDENCE CLOSURE (2026-07-18, bkz. `decision-log.md` aynı tarihli kayıt):** `DBP-P2-UYAP-CONTRACT-A-P02A` GO-IMPLEMENT (owner-ACCEPTED) kapanışı canonical'a geçirilir; yukarıdaki P01-GOV notunu SİLMEZ, P02A implementation/evidence sonucunu ekler. Owner P02 SPLIT'i (P02A/P02B) ve iki bağlayıcı düzeltmeyi taşır: ISO-8859-9 = yalnız `xmlDeclarationEncoding` etiketi + `byteEncodingPerformed=false` (gerçek byte dönüşümü + Türkçe round-trip P04); serializer sonucu `SERIALIZED_DRAFT` veya `REJECTED` (`EMITTED` DEĞİL — P02B).
**P02A: IMPLEMENTED / EVIDENCED / CANONICAL** — PR #1395 / squash `52dbb0ef562fe6fafa6a97cf6ac18c91bd8212dc`; required CI 4/4 SUCCESS (Architectural Guardrails · Test Suite [prod tsc + dedicated P02A step] · Web Tests · Client Workspace Live Smoke); canonical `main` ancestry PRESENT.
**PROVENANCE: CODE-RECORDED** (tek authority yüzeyi `uyap/official/official-contract-provenance.ts`): Contract=UYAP exchangeData Contract A · VERSION=1.2 · OFFICIAL DTD DATE=2015-12-17 · PACKAGE DATE=2024-03-20 · SHA-256=`124a9a96848299d8abf216111572d7c8286777819422a5e29089b956f56a8fe6` · DTD FILE IN REPOSITORY=NO · OFFICIAL DTD VALIDATION=NOT PERFORMED · RUNTIME CUTOVER AUTHORITY=NONE. Bu kayıt internal type modelinin resmî DTD ile doğrulandığı anlamına GELMEZ.
**ROLE TRANSLATION BOUNDARY: IMPLEMENTED** (`OfficialRoleResolution` union: RESOLVED / UNRESOLVED_AUTHORITY_REQUIRED / UNSUPPORTED_FOR_ROLTUR / INVALID_INPUT; `resolveOfficialRole` skeleton). PRODUCTION RESOLVED TARGETS=0 · RESOLUTION TABLE=EMPTY · DEFAULT rolID=NONE · SILENT BORCLU FALLBACK=NONE.
**INSTRUMENT-ONLY (KESIDECI/CIRANTA/AVAL/LEHDAR/MUHATAP) → UNSUPPORTED_FOR_ROLTUR:** LEGAL DEBTOR CLASSIFICATION NOT CREATED · INSTRUMENT XML MAPPING NOT CREATED (yalnız "resmî rolTur sözlüğüne ait değil" teknik ifadesi).
**AUTHORITY-REQUIRED → UNRESOLVED_AUTHORITY_REQUIRED:** OWNER (`ASIL_BORCLU`/`MUSETEREK_BORCLU`/`ADI_KEFIL`/`MUTESELSIL_KEFIL`) · LDO+OWNER (`MIRASCI`/`TASFIYE_MEMURU`/`IFLAS_MASASI`). Hiçbirine `rolID` değeri KAYDEDİLMEDİ.
**İZOLASYON:** RUNTIME WIRING=NONE · CONTROLLER REFERENCE=NONE · UYAP MODULE PROVIDER/EXPORT=NONE · LEGACY SERVICE IMPORT=NONE · PRISMA SERVICE DEPENDENCY=NONE · ROUTE/FLAG/SHADOW=NONE (yalnız test-reachable).
**KORUNAN:** LEGACY BUILDER UNCHANGED · LEGACY XML SHAPE UNCHANGED · LEGACY ROLE CODES/MAPPINGS UNCHANGED · SCHEMA/MIGRATION NONE · REAL TRANSMISSION NONE/STUB · UYAP CUTOVER HARD HOLD.
**EVIDENCE:** P02A translator 29/29 + provenance 7/7 PASS; regresyon P01 `uyap-legacy-truthfulness` 13/13 + `uyap-xml.debtor-role-mapping` 22/22 PASS; production type-check (`tsconfig.prod.json`) 0 error; CI 4/4 SUCCESS; 6 changed dosya (5 yeni `uyap/official/` + ci.yml dedicated step).
**LOCAL CLEANUP:** `ORPHANED_WORKTREE_DIR` PRESENT / GIT-DETACHED / NON-BLOCKING; FORCE-RECURSIVE DELETE NOT PERFORMED. Governance blocker/open item DEĞİL.
**SONRAKİ BİRİMLER (hiçbiri başlatılmadı):** `CONTRACT-A-P02B` OFFICIAL SHAPE SERIALIZER SKELETON (sonuç SERIALIZED_DRAFT veya REJECTED) = NOT STARTED / OWNER GO REQUIRED; `CONTRACT-A-P03` DOMAIN ROLE → OFFICIAL rolID VALUES = BLOCKED BY OWNER/LDO; **FAIZTIPKOD VALUE AUTHORITY = SEPARATE ADR-014 / FINANCIAL AUTHORITY REQUIRED**; `CONTRACT-A-P04` SHADOW + BYTE-LEVEL EVIDENCE = NOT STARTED; `CONTRACT-A-P05` CUTOVER = NOT AUTHORIZED; `CONTRACT B` = SEPARATE / OPEN. Bu not production/test/CI/schema/mapper DEĞİŞTİRMEZ; P02B/P03/P04/P05 başlatmaz; rolID/faiz değeri türetmez; hukuki borçluluk veya instrument XML mapping üretmez; OD-07/Party reopen etmez; cutover yetkilendirmez. **NEXT ELIGIBLE TASK: OWNER SELECTION — `CONTRACT-A-P02B` veya başka owner-gated birim.**

**DBP-P2-UYAP-CONTRACT-A-P02B-GOV IMPLEMENTATION/EVIDENCE CLOSURE (2026-07-18, bkz. `decision-log.md` aynı tarihli kayıt):** `DBP-P2-UYAP-CONTRACT-A-P02B` GO-IMPLEMENT (owner-ACCEPTED) kapanışı, R1 reconciliation ile birlikte canonical'a geçirilir; yukarıdaki P02A-GOV notunu SİLMEZ, P02B implementation/evidence sonucunu ekler.
**P02B: IMPLEMENTED / EVIDENCED / CANONICAL** — implementation PR #1403 / squash `28260137fff9c237b94146d4d6b24de6ccd7e5e8` + R1 (ID ANCHOR INTEGRITY + REF BOUNDARY) PR #1405 / squash `64bc4c404652684ca7cf5f1eb30e45b2f5d755e9`; her ikisi required CI 4/4 SUCCESS; canonical `main` ancestry PRESENT.
**SERIALIZER (`serializeOfficialExchange`):** contract-derived (resmî exchange.dtd v1.2) DETERMİNİSTİK; sonuç `SERIALIZED_DRAFT` veya `REJECTED` (owner düzeltmesi: `EMITTED` YOK); official şekil `<rolTur rolID Rol/>` ELEMENT + attribute-carrier kişi/kurum/adres + exchangeHeader v1.2 + DOCTYPE + alacakKalemi/faiz. UNRESOLVED-ROLE → REJECTED (no XML).
**ID ANCHOR INTEGRITY (R1):** tüm `id` anchor'ları (taraf + alacakKalemi) belge genelinde BENZERSİZ + BOŞ-OLMAYAN; boş/çift → REJECTED (`idViolations` {id, issue: EMPTY_ID/DUPLICATE_ID, source}).
**REF/IDREF: EXPLICITLY UNSUPPORTED / CORRECTLY BOUNDED (R1)** — girdi tipi `ref`/`to` taşımaz (ref-bearing input TYPE TARAFINDAN İFADE EDİLEMEZ), serializer `<ref>` ÜRETMEZ; yanıltıcı "ID/IDREF çapraz-referans" type-yorumu R1'de kaldırıldı (FALSE SUPPORT CLAIM: NONE).
**ENCODING (owner düzeltmesi):** yalnız `xmlDeclarationEncoding='ISO-8859-9'` + `byteEncodingPerformed=false` + `officialDtdValidated=false` (gerçek byte + Türkçe round-trip P04).
**KORUNAN:** domain→rolID mapping NONE (P03) · runtime wiring NONE (test-reachable) · LEGACY BUILDER UNCHANGED (P01 F10 13/13 intact) · SCHEMA/MIGRATION NONE · REAL TRANSMISSION NONE/STUB · UYAP CUTOVER HARD HOLD. **KAPSAM DIŞI:** instrument (cek/senet/police) elementleri (P04-adjacent), gerçek byte encoding + DTD doğrulama (P04), rol hedef değerleri (P03).
**EVIDENCE:** P02B serializer 21/21 PASS (15 + 6 R1); regresyon P02A translator 29/29 + provenance 7/7 + P01 `uyap-legacy-truthfulness` 13/13 + `uyap-xml.debtor-role-mapping` 22/22 PASS; production type-check (`tsconfig.prod.json`) 0 error; CI 4/4 SUCCESS. **GO-VERIFY→R1 DÖNGÜSÜ:** owner `P02B-R1` GO-VERIFY, GO-COMPLETE raporundaki eksik REF/IDREF disposition alanını yakaladı → verdict INCONSISTENT → dar BOUND-IT R1 fix (#1405).
**LOCAL CLEANUP:** `ORPHANED_WORKTREE_DIR` PRESENT / GIT-DETACHED / NON-BLOCKING; FORCE-RECURSIVE DELETE NOT PERFORMED. Governance blocker/open item DEĞİL.
**SONRAKİ BİRİMLER (hiçbiri başlatılmadı):** `CONTRACT-A-P03` DOMAIN ROLE → OFFICIAL rolID VALUES = BLOCKED BY OWNER/LDO; **FAIZTIPKOD VALUE AUTHORITY = SEPARATE ADR-014 / FINANCIAL AUTHORITY REQUIRED**; `CONTRACT-A-P04` SHADOW + BYTE-LEVEL EVIDENCE + INSTRUMENT SERIALIZATION = NOT STARTED; `CONTRACT-A-P05` CUTOVER = NOT AUTHORIZED; `CONTRACT B` = SEPARATE / OPEN. Bu not production/test/CI/schema/mapper DEĞİŞTİRMEZ; P03/P04/P05/instrument/Contract B başlatmaz; rolID/faiz değeri türetmez; hukuki borçluluk veya instrument XML mapping üretmez; OD-07/Party reopen etmez; cutover yetkilendirmez. **NEXT ELIGIBLE TASK: OWNER SELECTION — `CONTRACT-A-P03`/`P04` veya başka owner-gated birim.**

**DBP-P2-UYAP-CONTRACT-A-P03A-GOV IMPLEMENTATION/EVIDENCE CLOSURE (2026-07-18, bkz. `decision-log.md` aynı tarihli kayıt):** `DBP-P2-UYAP-CONTRACT-A-P03A` GO-IMPLEMENT (owner-ACCEPTED, OWNER DECISION OPTION A) kapanışı canonical'a geçirilir; yukarıdaki P02B-GOV notunu SİLMEZ, P03A implementation/evidence sonucunu ekler.
**P03A: IMPLEMENTED / EVIDENCED / CANONICAL** — PR #1413 / squash `3962b8bc9391c0b1f3713c377c9fd393368c1276`; required CI 4/4 SUCCESS; canonical `main` ancestry PRESENT.
**RATİFİYE MAPPING MATRİSİ (owner-ratified, tek immutable `OWNER_SAFE_ROLE_TARGETS` Object.freeze tablosu; değerler switch dallarında tekrarlanmaz):** `ASIL_BORCLU` → {rolID "22", Rol "BORÇLU/MÜFLİS"} · `MUSETEREK_BORCLU` → {"22", "BORÇLU/MÜFLİS"} · `ADI_KEFIL` → {"33", "KEFİL"} · `MUTESELSIL_KEFIL` → {"33", "KEFİL"}. Resmî Rol metinleri KodluBilgilerData (Contract A) birebir; adi/müşterek/müteselsil ayrımı domain modelinde KORUNUR (wire 22/33 projeksiyonu hukuki sorumluluk sonucu DEĞİLDİR).
**KORUNAN AUTHORITY SINIRLARI:** `MIRASCI`/`TASFIYE_MEMURU`/`IFLAS_MASASI` → UNRESOLVED_AUTHORITY_REQUIRED / requiredAuthority=LDO_OWNER (hedef SEÇİLMEDİ, P03B); `KESIDECI`/`CIRANTA`/`AVAL`/`LEHDAR`/`MUHATAP` → UNSUPPORTED_FOR_ROLTUR (değişmedi). translator'da rolID literal'i YALNIZ {22,33}; 21/23/34/41/43/44/47 SIZMADI (test-kilitli).
**KORUNAN TEKNİK DAVRANIŞ:** silent BORÇLU fallback NONE · default rolID NONE · reverse mapping NONE · domain role mutation/persistence NONE · mixed resolved+unresolved dosya → REJECTED / XML NONE · pure owner-safe 22/33 dosya → SERIALIZED_DRAFT (rolTur emisyonu doğrulandı) · runtime wiring NONE · schema/migration NONE · real transmission NONE · UYAP CUTOVER HARD HOLD.
**EVIDENCE:** translator spec 23/23 + builder spec 23/23 PASS; regresyon provenance 7/7 + P01 `uyap-legacy-truthfulness` 13/13 + `uyap-xml.debtor-role-mapping` 22/22 PASS; production type-check (`tsconfig.prod.json`) 0 error; ESLint PASS; CI 4/4 SUCCESS.
**BUILDER-SPEC DEĞİŞİKLİĞİ:** minimal / test-only / FORCED reconciliation — ratified `ASIL_BORCLU→RESOLVED`, P02B'nin "ASIL_BORCLU→REJECTED" testinin öncülünü geçersiz kıldığından o test hâlâ-unresolved `MIRASCI`'ye çevrildi + 2 P03A serializer entegrasyon testi eklendi; feature veya serializer davranış genişletmesi DEĞİLDİR, fail-closed zayıflatılmadı.
**LOCAL CLEANUP:** `ORPHANED_WORKTREE_DIR` PRESENT / GIT-DETACHED / NON-BLOCKING; FORCE-RECURSIVE DELETE NOT PERFORMED.
**SONRAKİ BİRİMLER (hiçbiri başlatılmadı):** `CONTRACT-A-P03B` (MIRASCI/TASFIYE_MEMURU/IFLAS_MASASI target seçimi) = BLOCKED BY OWNER/LDO; **FAIZTIPKOD VALUE AUTHORITY = SEPARATE ADR-014 / FINANCIAL AUTHORITY REQUIRED**; `CONTRACT-A-P04` (shadow + byte-level evidence + instrument serialization) = NOT STARTED; `CONTRACT-A-P05` CUTOVER = NOT AUTHORIZED; `CONTRACT B` = SEPARATE / OPEN. Bu not production/test/CI/schema/mapper DEĞİŞTİRMEZ; P03B/P04/P05/instrument/faizTipKod/Contract B başlatmaz; MIRASCI/TASFIYE/IFLAS hedefi seçmez; hukuki borçluluk üretmez; OD-07/Party reopen etmez; cutover yetkilendirmez. **NEXT ELIGIBLE TASK: OWNER SELECTION — `CONTRACT-A-P03B`/`P04` veya başka owner-gated birim.**

**DBP-P2-UYAP-CONTRACT-A-P04A-ENC-GOV IMPLEMENTATION/EVIDENCE CLOSURE (2026-07-19, bkz. `decision-log.md` aynı tarihli kayıt):** `DBP-P2-UYAP-CONTRACT-A-P04A-ENC` GO-IMPLEMENT (owner-ACCEPTED, OWNER DECISION D1-D5) kapanışı canonical'a geçirilir; yukarıdaki P03A-GOV notunu SİLMEZ, P04A-ENC implementation/evidence sonucunu ekler. Owner D4 ile `P04` dört birime bölünmüştür: `P04A-ENC` (byte encoding) / `P04B-VAL` (DTD validation) / `P04C-SHADOW` / `P04D-INSTRUMENT`.
**P04A-ENC: IMPLEMENTED / EVIDENCED / CANONICAL** — PR #1420 / squash `6497502057b7c0cc658f8c718b5c0dcd45554702`; required CI 4/4 SUCCESS; canonical `main` ancestry PRESENT.
**ENCODING AUTHORITY:** ISO-8859-9 / LATIN-5; `iconv-lite` 0.7.3 EXACT-PIN (MIT; tek transitive dep `safer-buffer` zaten mevcut; native addon / postinstall / gyp NONE; `@types/iconv-lite` NONE); NODE latin1 PROHIBITED; CUSTOM HAND-WRITTEN CODEC NOT SELECTED. iconv çağrısı kanonik `'iso88599'` (kütüphanenin `Encoding` union'ında `'ISO-8859-9'` tireli/büyük casing YOK → tsc engeli; runtime byte-özdeş codec), etiket/kanıt yüzeyi `'ISO-8859-9'`.
**RESULT CONTRACT:** girdi YALNIZ `Extract<OfficialSerializationResult,{status:'SERIALIZED_DRAFT'}>` (rastgele string / `REJECTED` giremez) → `BYTE_ENCODED` {bytes; evidence: encoding=ISO-8859-9 · byteEncodingPerformed=true · roundTripVerified=true · declarationConsistent=true · officialDtdValidated=false · byteLength · encodedBytesSha256} veya `ENCODING_REJECTED` {reason: DECLARATION_MISMATCH / UNREPRESENTABLE_CHARACTER / ROUND_TRIP_MISMATCH; unrepresentable[]}. Yasak statü adları (UYAP_READY/SUBMITTABLE/OFFICIAL_ACCEPTED/COMPLIANT/VALIDATED_BYTES) NONE; `officialDtdValidated` DAİMA false.
**FAIL-CLOSED:** encode→decode exact round-trip REQUIRED; silent '?' substitution / replacement character / character removal / transliteration PROHIBITED; Unicode normalization (NFC/NFD) NONE; herhangi ikame/kayıp → ENCODING_REJECTED (code-point düzeyi konum raporu). **TÜRKÇE KRİTİK BYTE KANITI:** Ğ=D0 · İ=DD · Ş=DE · ğ=F0 · ı=FD · ş=FE (Node yerleşik latin1'in Türkçe için yanlışlığı test-doğrulandı). **BYTE CUSTODY (D5):** in-memory return YES · disk persistence NONE · transmission NONE · runtime wiring NONE · raw XML / raw byte logging NONE.
**KORUNAN:** legacy builder / official serializer / official translator UNCHANGED · schema/migration NONE · real transmission NONE/STUB · **UYAP CUTOVER HARD HOLD**.
**EVIDENCE:** P04A-ENC spec 23/23 PASS; regresyon official 4 suite / 76 test (translator 23 + provenance 7 + builder 23 + encoder 23) + P01 `uyap-legacy-truthfulness` 13/13 PASS; production type-check (`tsconfig.prod.json`) 0 error; ESLint PASS; CI 4/4 SUCCESS. **DEPENDENCY:** `iconv-lite` 0.7.3 exact-pin; lockfile 10 addition / 0 deletion (iconv-lite-only additive; apps/api direct dep; `safer-buffer` zaten mevcut); license MIT; pnpm audit iconv-lite advisory NONE.
**LOCAL CLEANUP:** git worktree registration REMOVED · local/remote implementation branch REMOVED · physical directory `ORPHANED_WORKTREE_DIR` / NON-BLOCKING (cause: Windows MAX_PATH / pnpm node_modules); FORCE-RECURSIVE DELETE NOT PERFORMED.
**P04 DECOMPOSITION (owner D4 — canonical roadmap):** `P04A-ENC` (ISO-8859-9 actual byte encoding foundation) = **CLOSED / CANONICAL**; `P04B-VAL` (official DTD hash-gated LOCAL validation evidence / CI-DIŞI) = NOT STARTED; `P04C-SHADOW` (local representative shadow evidence) = NOT STARTED; `P04D-INSTRUMENT` (instrument serialization + data-gap analizi) = NOT STARTED. Ratifiye sıra: `P04A-ENC-GOV → P04B-VAL → P04C-SHADOW → P04D-INSTRUMENT → P03B alt birimleri → Contract B → P05`. **P04B-VAL İÇİN KORUNAN KARARLAR (bu not başlatmaz):** official DTD in repository PROHIBITED · official DTD in CI fixture PROHIBITED · validation location = LOCAL EVIDENCE / CI-DIŞI · preferred validator = xmllint/libxml2 isolated disposable container (network NONE) · DTD SHA-256 gate REQUIRED · libxmljs2 native dependency NOT SELECTED.
**SONRAKİ BİRİMLER (hiçbiri başlatılmadı):** `CONTRACT-A-P03B` (MIRASCI/TASFIYE_MEMURU/IFLAS_MASASI target seçimi) = BLOCKED BY OWNER/LDO; **FAIZTIPKOD VALUE AUTHORITY = SEPARATE ADR-014 / FINANCIAL AUTHORITY REQUIRED**; `CONTRACT-A-P05` CUTOVER = NOT AUTHORIZED; `CONTRACT B` = SEPARATE / OPEN. Bu not production/test/CI/package/lockfile/schema/mapper/encoder/serializer/translator DEĞİŞTİRMEZ; P04B-VAL/P04C-SHADOW/P04D-INSTRUMENT/P03B/P05/Contract B başlatmaz; DTD repo'ya kopyalamaz; DTD validation implementasyonu yapmaz; hukuki borçluluk üretmez; OD-07/Party reopen etmez; cutover yetkilendirmez. **NEXT ELIGIBLE TASK: OWNER SELECTION — `CONTRACT-A-P04B-VAL` veya başka owner-gated birim.**

**DBP-P2-UYAP-CONTRACT-A-P04B-VAL-I1-GOV IMPLEMENTATION/EVIDENCE CLOSURE (2026-07-19, bkz. `decision-log.md` aynı tarihli kayıt):** `DBP-P2-UYAP-CONTRACT-A-P04B-VAL-I1` GO-IMPLEMENT (owner-ACCEPTED, OWNER DECISION D1-D6) kapanışı canonical'a geçirilir; yukarıdaki P04A-ENC-GOV notunu SİLMEZ, P04B-VAL-I1 implementation/evidence sonucunu ekler. Owner D2 ile `P04B-VAL` iki iterasyona bölünmüştür: `P04B-VAL-I1` (validator image foundation) + `P04B-VAL-I2` (hash-gated local validation harness + evidence).
**P04B-VAL-I1: IMPLEMENTED / EVIDENCED / CANONICAL** — PR #1425 / squash `50d73eabf39842f6821f6c8efd2bf7aecd6e5feb`; required CI 4/4 SUCCESS; canonical `main` ancestry PRESENT.
**VALIDATOR IMAGE AUTHORITY:** project-controlled minimal validator image (`project/tools/uyap-contract-a-validator/`: Dockerfile + build-validator-image.sh + README.md + image-contract.json). BASE = Docker Official Alpine 3.22.5 @ manifest digest `sha256:14358309a308569c32bdc37e2e0e9694be33a9d99e68afb0f5ff33cc1f695dce` (linux/amd64); VALIDATOR = `libxml2-utils=2.13.9-r1` EXACT-PIN (libxml2 2.13.9); LICENSE MIT; USER 65532:65532 (non-root); ENTRYPOINT /usr/bin/xmllint; REGISTRY PUSH NONE.
**REPRODUCIBILITY AUTHORITY:** implementation SHA + Dockerfile SHA-256 `5ad2b3e34ef4b1d34b6b9587b5b1c6ec2f0ac0e3c21923b3b9e3a9f17a175550` + base manifest digest + exact package pin kombinasyonudur. **LOCAL BUILD IMAGE ID `sha256:665f737b6ea1debf36f5bd56fa7b1513d36111ad6f08963f46b92be200a8a75d` = NON-CANONICAL / LOCAL EXECUTION EVIDENCE** (reusable image identity / registry artifact / rebuild equality garantisi DEĞİLDİR).
**LOCAL IMAGE EVIDENCE:** local build PASS · boundary checks 12/12 PASS · non-root execution PASS · execution by local image ID PASS · security-profile smoke PASS (`--network none --read-only --cap-drop ALL --security-opt no-new-privileges --user 65532:65532 --pids-limit 64 --memory 128m --cpus 1`). **CAPABILITY GATE:** --dtdvalid / --noout / --nocatalogs / --max-ampl / --maxmem / stdin `-` = PRESENT. **IMAGE CONTENT BOUNDARY:** xmllint PRESENT; compiler/build-tool / official exchange.dtd / XML fixture / repository source / Node runtime / native addon = NONE (base'in shell/apk'sı runtime authority / ENTRYPOINT DEĞİLDİR).
**KORUNAN SINIRLAR:** DTD file/mount/hash-validation NONE · XML input/validation NONE · result union NONE · host validation adapter NONE · PII error normalization NONE · application runtime wiring NONE · schema/migration NONE · real transmission NONE · **UYAP CUTOVER HARD HOLD**. `--network none` = I2 execution birincil authority; `xmllint --nonet` = DEFENSE-IN-DEPTH ONLY.
**CI/LOCAL-EVIDENCE AYRIMI:** required CI 4/4 repository checks PASS; local image build+smoke CI'da ÜRETİLMEZ (LOCAL-ONLY); CI'da image build/pull/exec/official-DTD NONE.
**CLEANUP:** implementation worktree REMOVED · local/remote implementation branch REMOVED · physical orphan NONE · disposable local image REMOVED (rebuildability Dockerfile + build script üzerinden korunur; canonical kapanışı ETKİLEMEZ).
**P04B DECOMPOSITION (owner D2):** `P04B-VAL-I1` = CLOSED / CANONICAL; `P04B-VAL-I2` (hash-gated local validation harness + evidence) = NOT STARTED. Ratifiye sıra: `P04B-VAL-I1-GOV → P04B-VAL-I2 → P04B-VAL-I2-GOV → P04C-SHADOW → P04D-INSTRUMENT → P03B → Contract B → P05`. **P04B-VAL-I2 KORUNAN OWNER KARARLARI (bu not başlatmaz):** INPUT = P04A-ENC `BYTE_ENCODED` only · XML transport = stdin-only (host/container temp XML PROHIBITED) · official DTD = repo-dışı / hash-gated / read-only single-file mount · validation image = project-controlled P04B-VAL-I1 image · network = none · result union = `LOCAL_DTD_VALIDATED` / `DTD_VALIDATION_REJECTED` / `VALIDATION_INFRASTRUCTURE_REJECTED` · raw XML / raw byte / raw stderr evidence = PROHIBITED.
**SONRAKİ BİRİMLER (hiçbiri başlatılmadı):** `CONTRACT-A-P03B` = BLOCKED BY OWNER/LDO; **FAIZTIPKOD VALUE AUTHORITY = SEPARATE ADR-014 / FINANCIAL AUTHORITY REQUIRED**; `CONTRACT-A-P05` CUTOVER = NOT AUTHORIZED; `CONTRACT B` = SEPARATE / OPEN. Bu not Dockerfile/build-script/README/image-contract/production/test/CI/package/lockfile/schema/mapper DEĞİŞTİRMEZ; P04B-VAL-I2/P04C-SHADOW/P04D-INSTRUMENT/P03B/P05/Contract B başlatmaz; DTD validation / container execution yapmaz; hukuki borçluluk üretmez; OD-07/Party reopen etmez; cutover yetkilendirmez. **NEXT ELIGIBLE TASK: OWNER SELECTION — `CONTRACT-A-P04B-VAL-I2` veya başka owner-gated birim.**

**DBP-P2-UYAP-CONTRACT-A-P04B-VAL-R1-GOV STRICT-VALIDATION BLOCKER RECONCILIATION (2026-07-19, bkz. `decision-log.md` aynı tarihli kayıt):** `DBP-P2-UYAP-CONTRACT-A-P04B-VAL-I2` GO-IMPLEMENT owner tarafından ilk çalıştırıldığında **critical stop condition** tetiklenmiş; ardından `DBP-P2-UYAP-CONTRACT-A-P04B-VAL-R1` GO-ANALYZE (READ-ONLY) yürütülmüş, owner ACCEPTED etmiştir; bu not yukarıdaki P04B-VAL-I1-GOV notunu SİLMEZ, R1 bulgu ve owner kararlarını (D1-D7) ekler. **P04B-VAL-I2: BLOCKED / NOT IMPLEMENTED / NO MERGE.**

**TAM NONDETERMINISTIC-MODEL ENVANTERİ (6/26 element bildirimi, ampirik `xmllint --valid` ile doğrulandı):** `exchangeData` (kök, `(dosyalar,exchangeHeader?)|(exchangeHeader?,dosyalar)`) · `taraf` (6 permütasyon) · `kisiKurumBilgileri` · `kontratKefil` · `VekilKisi` (6 permütasyon) · `ilam`. Kalan 20/26 element deterministic (ampirik + desen-eşleşmesi doğrulandı: `dosyalar`,`dosya`,`cek`,`senet`,`police`,`kontrat`,`digerAlacak`,`alacakKalemi`,`evrak` + 11 `EMPTY` element).

**MINIMAL exchangeData WITNESS:** `<exchangeData><dosyalar><dosya dosyaTipi="1"/></dosyalar></exchangeData>` — `taraf`/`kisiKurumBilgileri` hiç kullanılmadan bile reddedildi; `exchangeData`'nın kök-seviyesi ambiguity'si TEK BAŞINA, belge içeriğinden bağımsız, HER belgeyi reddetmeye yeterlidir.

**RESMÎ ÖRNEK ENVANTERİ SONUCU:** `UYAP_OFFICIAL_PACKAGE_REVIEW/04_sample_xml/28_48_takip_talebi.xml` — tek dosya, kök `<template format_id="1.7">` (takip talebi form-render şablonu); `exchangeData` ile ORTAK ELEMENT YOK; Contract A instance'ı DEĞİLDİR. Bağımsız çapraz-doğrulama örneği MEVCUT DEĞİL.

**STRICT VALIDATOR KARAKTERİZASYONU:** libxml2/xmllint 2.13.9'a özgü bir tuhaflık DEĞİLDİR; XML 1.0 §3.2.1 normatif Validity Constraint (SGML uyumluluğu için). Terminoloji: **"nondeterministic content model"** kullanılır; XML Schema'ya özgü farklı bir terim KULLANILMAZ.

**DETERMİNİSTİK ADAY / EŞDEĞERLİK DISPOSITION:** `exchangeData` için TAM dil-eşdeğer deterministik aday TANIMLANDI (`(dosyalar,exchangeHeader?)|(exchangeHeader,dosyalar)` — yalnız 2. dalın opsiyonelliği kaldırılarak). `taraf`/`kisiKurumBilgileri`/`kontratKefil`/`VekilKisi` için yalnız dil-DARALTAN adaylar bulundu (tam eşdeğerlik yok — DTD'nin XML'de karşılığı olmayan SGML "serbest sıra" deyimini taklit etme girişiminden kaynaklanıyor). `ilam` için eşdeğer aday BULUNAMADI (teminat öncesi/sonrası semantik ayrım aynı iki element adıyla deterministik ifade edilemiyor). **Tam dil-eşdeğerliği sağlanmayan hiçbir profile implementasyona geçirilmeyecektir.**

**SERIALIZER EMİTTED-ELEMENT KARAKTERİZASYONU:** P02B/P03A'nın mevcut `OfficialExchangeInput` tip yüzeyi yalnız `exchangeData`,`exchangeHeader`,`dosyalar`,`dosya`,`taraf`,`rolTur`,`kisiKurumBilgileri`,`kisiTumBilgileri`,`kurum`,`adres`,`alacakKalemi`,`faiz` üretir (`VekilKisi`/`kontratKefil`/`ilam`/`cek`/`senet`/`police` hiç desteklenmiyor, P02B kendi kapsamı dışı). Bunlardan 3'ü (`exchangeData`,`taraf`,`kisiKurumBilgileri`) nondeterministic.

**alacakKalemi PARENT VERDICT:** `<alacakKalemi>`, P02B builder'ında `<dosya>`'nın doğrudan çocuğu olarak emit ediliyor; resmî DTD'de bu YASAK. Sınıflandırma: nondeterministic-model blocker'dan BAĞIMSIZ, ayrı bir serializer/document-shape divergence adayı; routing = `P02B-R2 GO-ANALYZE CANDIDATE` (implementasyon NOT AUTHORIZED). Bu divergence düzeltilse bile P04B strict-validation blocker'ı TEK BAŞINA kaldırılmaz.

**VALIDATION OPTION DISPOSITION:** tolerant/non-strict validator NOT AUTHORIZED · resmî DTD onarımı/normalizasyonu NOT AUTHORIZED · derived DTD commit NOT AUTHORIZED · XSD'ye geçiş yardımcı olmaz (XSD'nin kendi eşdeğer-belirsizlik kısıtı DTD'ninkinden daha katı) · serializer modifikasyonu NOT AUTHORIZED. **EXTERNAL AUTHORITY QUESTION PACKAGE (D7, gönderilmedi):** seçilen birincil yol = UYAP/BİGM/yetkili entegratöre teknik yetki talebi (STATUS REQUIRED); sorular: gerçek parser/validator+sürüm, tam content-model validasyonu yapılıp yapılmadığı, nondeterministic bildirimlerin ele alınışı, güncellenmiş DTD/XSD varlığı, otoriter Contract A örneği, server-side kabul kuralları.

**KORUNAN:** P02B/P03A CANONICAL STATUS UNCHANGED · OFFICIAL DTD CONFORMANCE UNVERIFIED (DTD grammar failure, document-level conformans testinden ÖNCE oluşuyor) · OFFICIAL ACCEPTANCE NOT CLAIMED · resmî DTD byte içeriği UNCHANGED · Dockerfile/validator/serializer/production/test/CI/package/schema/migration DEĞİŞTİRMEZ · P04B-VAL-I2/typed-harness/derived-DTD-profile/P02B-R2-analiz-veya-implementasyon/external-mesaj-gönderimi/P04C-SHADOW/P04D-INSTRUMENT/P03B/Contract B/P05 başlatmaz · runtime wiring yapmaz · **UYAP CUTOVER HARD HOLD**.

**NEXT ELIGIBLE TASK (bu bölümdeki 2026-07-19 R1-GOV notu zamanında geçerliydi; aşağıdaki P02B-R2 notu güncel durumu taşır).**

**DBP-P2-UYAP-CONTRACT-A-P02B-R2 CLAIM-WRAPPER AUTHORITY GUARD RECONCILIATION (2026-07-19, bkz. `decision-log.md` aynı tarihli kayıt; impl PR #1436 squash `0b09ebbd3f3afec797c5da77c6f747059b19345f`, CI 4/4):** yukarıdaki "**alacakKalemi PARENT VERDICT**" notu `P02B-R2 GO-ANALYZE CANDIDATE` olarak bıraktığı açık maddeyi kapatır; bu not önceki notu SİLMEZ, sonucunu ekler. **OWNER GO-ANALYZE** (DTD parent matrix: `alacakKalemi` yalnız `cek`/`senet`/`police`/`kontrat`/`digerAlacak`/`ilam` sarmalayıcıları altında geçerli, `dosya`'nın DOĞRUDAN çocuğu OLAMAZ — legacy `uyap-xml.service.ts`'de de AYNI divergence tespit edildi, P02B'ye özgü değil; 5 semantic-wrapper seçeneği A-E karşılaştırması; `digerAlacak` otomatik-fallback için **NO AUTHORITY/FAIL-CLOSED** verdiği; data-sufficiency gap matrix — instrument type/legal source/issuer-drawee-beneficiary-endorser rolleri `OfficialAlacakKalemi`'de YOK, domain'de parçalı-ama-gerçek veri var `CaseInstrument`/`ClaimItem.metadata.ilam`/`ClaimItem.sourceDocumentType`) ardından **OWNER GO-IMPLEMENT: Option 1 — claim-item emission fail-closed** seçildi.

**RESULT CONTRACT:** `serializeOfficialExchange` result union korunur (`SERIALIZED_DRAFT | REJECTED`, yeni statü YOK); `REJECTED` varyantına additive `claimShapeViolations?: Array<{code:'UNAUTHORIZED_ALACAK_KALEMI_PARENT', path:'dosya/alacakKalemi', count:number}>` eklendi. **REJECTION PRIORITY (ratifiye sıra):** (1) ID anchor integrity → (2) unresolved/unsupported role → (3) empty taraf list → **(4) claim-wrapper authority guard, YENİ** → (5) XML serialization; testle doğrulandı ki claim-wrapper guard, (1)/(2)/(3)'ü MASKELEMEZ (geçersiz/çift alacakKalemi ID, unresolved role+claim, boş taraf+claim senaryolarının hepsi kendi mevcut rejection nedenleriyle REJECTED olur, `claimShapeViolations` doldurulmaz).

**REMOVED/PRESERVED BEHAVIOR:** artık-erişilemez `addOfficialAlacakKalemi` emitter TAMAMEN kaldırıldı; doğrudan `dosya`→`alacakKalemi` emisyonu, otomatik `digerAlacak`/`ilam`/`cek`/`senet`/`police`/`kontrat` sarmalayıcı seçimi hiçbirinin kaynakta bulunmadığı statik kaynak-grep testleriyle kanıtlandı. `OfficialAlacakKalemi`/`OfficialFaiz` tip yüzeyi korunur — **bu koruma aktif emisyon yetkisi VERMEZ**, yalnız gelecekteki owner-gated typed discriminated-union wrapper birimi için tip iskeletidir. Taraf-only `SERIALIZED_DRAFT` davranışı (undefined/boş `alacakKalemleri` dahil) DEĞİŞMEDİ; ASIL_BORCLU/ADI_KEFIL owner-safe rolID 22/33 emisyonu PRESERVED; `officialDtdValidated=false` korunur.

**EVIDENCE:** 43/43 builder-spec (23 yeni P02B-R2 testi: non-empty→REJECTED, claimShapeViolations exact code/path/count, no-xml, no-`<alacakKalemi`/`digerAlacak`/`<ilam`/instrument-wrapper, undefined/[]→SERIALIZED_DRAFT preserved, rejection-priority 3 senaryosu, iki-kalem count=2, determinizm, result-union, officialDtdValidated hiçbir yerde true, 4 static-containment testi) + 23/23 `official-role-translator.spec.ts` + 7/7 `official-contract-provenance.spec.ts` + 23/23 `official-iso8859-9-encoder.spec.ts` + 13/13 `uyap-legacy-truthfulness.spec.ts` regresyon PASS. `official/` dosyalarında `tsc --noEmit` 0 hata (repo-wide ~499 pre-existing hata bu değişiklikle ilgisiz, farklı modüllerde: icrabot/interest-engine/scheduler/staff/lawyer/adr014 vb.); değişen-dosya ESLint temiz; `git diff --check` temiz. **CI:** mevcut exact P02B step (`official-exchange-builder\.spec\.ts$`) zaten yeni testleri kapsıyor → `.github/workflows/ci.yml` **UNCHANGED**.

**EXACT CHANGED SCOPE:** `official-exchange-builder.ts` + `official-exchange.types.ts` + `official-exchange-builder.spec.ts` — başka hiçbir dosya. **P04B BLOCKER İLİŞKİSİ:** P02B-R2, bağımsız bir invalid document-shape yolunu (yanlış-parent) kapatır; resmî DTD'nin 6/26 nondeterministic-content-model blocker'ını TEK BAŞINA ÇÖZMEZ (bağımsız, önceki not §'de tanımlı). **KORUNAN:** P02B/P02B-R1/P03A/P04A-ENC/P04B-VAL-I1/P04B-VAL-R1-GOV canonical status UNCHANGED · OFFICIAL DTD CONFORMANCE UNVERIFIED · OFFICIAL ACCEPTANCE NOT CLAIMED · runtime wiring/schema/migration NONE · legacy builder/role-translator/provenance/encoder/validator-image/ClaimItem/CaseInstrument/InstrumentChain/Collection/ADR-014 DEĞİŞTİRİLMEDİ · **P04B-VAL-I2 BLOCKED/HOLD** · **UYAP CUTOVER HARD HOLD**.

**CLEANUP:** implementation worktree git-registry'den REMOVED; local+remote implementation branch REMOVED; **physical directory `C:\Development\HUKUK_YAZILIMI\HUKUK_uyap-p02b-r2` ORPHANED_WORKTREE_DIR** (Windows MAX_PATH, recursive-delete YASAK gereği bırakıldı — canonical kapanışı ETKİLEMEZ). Bu not Dockerfile/serializer/test/CI/package/schema/migration DEĞİŞTİRMEZ; typed-wrapper/instrument-implementation/`P04B-EXT-01`-gönderimi/`P04B-VAL-I2`/`P04C-SHADOW`/`P04D-INSTRUMENT`/`P03B`/Contract B/`P05` başlatmaz.

**NEXT ELIGIBLE TASK (güncel): OWNER SELECTION — `P04B-EXT-01` (external UYAP/BİGM authority-request preparation) veya typed discriminated-union wrapper future birimi — ikisi de NOT STARTED** (bu not hiçbirini başlatmaz/varsaymaz).

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
