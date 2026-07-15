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
               alınamaz aksiyonda N-22).
- CONTRACT/RETIRE : eski yol kaldırılır — YALNIZ cutover kanıtlandıktan sonra.
BIG-BANG MIGRATION PROHIBITED (N-19); destructive migration ilk geçişte YOK (N-20; EXPAND-first).
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
| IMPLEMENTATION_ENTRY_BLOCKER | DBP-07 LRV-02/LRV-03 (public) · *(+ restricted kalemler — owner-local register)* | yeni implementasyon öncesi çözülmeli |
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
