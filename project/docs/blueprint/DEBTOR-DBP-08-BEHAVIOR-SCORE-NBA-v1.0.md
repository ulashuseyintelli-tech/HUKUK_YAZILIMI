# DEBTOR DBP-08 — BEHAVIOR, FEATURE, SCORE & NBA ARCHITECTURE v1.0

> **Canonical Phase 1 L6-behavior artifact.** Bu belge, `DEBTOR CANONICAL DOMAIN BLUEPRINT
> CHARTER v1.0` §9 kapsamındaki DBP-08 work package'ının owner-onaylı çıktısıdır (Charter
> artefaktları #18 BehaviorFeature Dictionary · #19 DebtorScore Spec · #20 NBA Command & Guard
> Catalogue; Charter BR-13 Icrabot disposition · BR-14 Rule-NBA vs Score-NBA · BR-15 DebtorScore
> feature sourcing/lineage · BR-20 M5 Behavioral Foundation). İçerik GO-ANALYZE (DBP-08 R0.1 →
> R0.2 → v1.1 matrix completion) çıktısıdır; bu GO-DOCS turunda yeni analiz veya owner kararı
> üretilmemiştir. **PRODUCTION CUTOVER NOT AUTHORIZED; PHASE 1 SHADOW-ONLY.** Feature bir hukuki
> fact DEĞİLDİR (INV-06); NBA hukuki/finansal işlem YAPMAZ (N-09); skor hukuki/finansal SoT
> DEĞİLDİR; CPE tek action-enforcement authority'dir (N-07).

---

## 1. Document Status and Authority

```text
PROGRAM            : BORÇLU PLATFORMU
PHASE              : PHASE 1 — CANONICAL DOMAIN BLUEPRINT
WORKSTREAM         : DBP-08 — BEHAVIOR, FEATURE, SCORE & NBA ARCHITECTURE (L6-behavior)
VERSION            : v1.0 (R0.2 + v1.1 matrix-completion onaylı analizin konsolidasyonu +
                     GO-DOCS pre-normalizasyonu)
PRODUCED UNDER     : GO-ANALYZE (R0.1 → R0.2 → v1.1 A18/A19/A20 record-level completion);
                     canonicalization: GO-DOCS
ARTIFACT STATUS    : OWNER-APPROVED (2026-07-15; onay kapsamı [A]–[N] — bkz. §16)
REVIEW DISPOSITION : OWNER-APPROVED / SHADOW-ONLY · KVKK+TEST SIGN-OFF PENDING — yeni bir
                     repository lifecycle state'i DEĞİLDİR; yalnız review disposition'dır.
AÇIK KALANLAR      : OBD-07 event-distribution/PL sınıfı (DBP-05) · OD-05 Case.riskScore RETIRE ·
                     P1 shadow-eligible score/NBA SUBSET'in owner-seçimi (execution planning) ·
                     KVKK feature/score sign-off (DBP-10) · freshness/conflict/rebuild test-gate
                     (DBP-11) · V28/Icrabot evidence gap'leri (EEV-01/EEV-02; SEPARATE OWNER
                     TRIAGE) · 4 NOT-VERIFIED evidence gap (audit-as-state/audit-as-feature/
                     duplicate-side-effect)
CANONICAL STATUS   : CANONICAL UPON APPROVED MERGE TO MAIN
ANALYSIS BASE (PIN): analiz turları Phase 1 GO-ANALYZE (2026-07-15; DBP-08 AS-IS temeli
                     origin/main @ 038dbbb9); GO-DOCS drift kontrolü ve bu belgenin AS-IS kanıt
                     re-verification base'i origin/main @ fc06a0b3 (fetch 2026-07-15/16):
                     Score/Feature/PaymentPromise/Settlement/NBA modelleri YOK · Case.riskScore
                     CANLI (automation nightly cron) · DebtorScoring modülü consumer'sız ·
                     V28EngineModule AKTİF / IcrabotModule DEVRE DIŞI — SIFIR davranış değişikliği
IMPLEMENTATION AUTHORITY: NONE — bu belge hiçbir model/servis/skor/NBA için implementasyon,
                     schema, cutover, aktivasyon veya register genişletmesi yetkisi üretmez
                     (SYS-GOV-003, SYS-DEC-003, SYS-GOV-008).
KİMLİK UZAYI       : BF/SC/NBA/BLV kimlikleri DBP-08-local PROPOSED'dur (DBP-12'ye kadar).
                     BR/BC/OBD/OD/AGG/N/INV kimlikleri Charter/DBP-03/DEBTOR-GOVERNANCE'ındır.
```

**Authority basis.** İki eksen (SYS-AUTH-006): Semantic — `SYSTEM-CONSTITUTION.md` (SYS-AI-001/002;
SYS-DEC-007) → `DEBTOR-GOVERNANCE.md` (§8.1 M5/M8 foundation; INV-06) → tasarım kaynakları.
Execution/safety — `AGENTS.md` + task authorization. `INV-06`: guard'sız aday çıkamaz + feature
legal-fact olamaz. `N-26`: foundation order ihlali Hard Stop (`AI_NBA_FOUNDATION_ORDER_VIOLATION`).

## RELATED DOCUMENTS

- Charter: `project/docs/blueprint/DEBTOR-CANONICAL-DOMAIN-BLUEPRINT-CHARTER-v1.0.md` (BR-13/14/15/20)
- DBP-03 (L2): `.../DEBTOR-DBP-03-BOUNDED-CONTEXT-MAP-v1.0.md` (BC-11 Behavior&Features · BC-12
  Scoring · BC-14 NBA · BC-15 AI Recommendation · BC-09 PaymentPromise&Settlement · BC-13
  LegalGuard · BC-10 Events/Outbox OBD-07; AGG-10/11/12A/15/16)
- DBP-04 (L3): `.../DEBTOR-DBP-04-LEGAL-STATE-LEGALGUARD-v1.0.md` (LegalGuard/CPE fail-policy;
  yasak girdiler: skor/NBA/AI hiçbir OF/DA/AE'ye giremez)
- DBP-05 (L4): `.../DEBTOR-DBP-05-EVENT-EVIDENCE-TIMELINE-v1.0.md` (event/outbox lifecycle; OBD-07)
- Domain Law: `project/docs/governance/DEBTOR-GOVERNANCE.md` (§8.1 M5 Behavioral Foundation)
- Kaynak: `project/apps/api/src/modules/debtor-scoring/` (adapte edilecek motor; consumer'sız) ·
  `.../modules/icrabot/v28-engine/` (V28; EXTRACT adayı)

---

## 2. Statü Sözlüğü

```text
AUTH / MAT / EVD / DEC / S-OWN / HOST / EXEC — DBP-02/03/04/05 sözlüğüyle aynı.
DEC ∈ { CANONICALLY DEFINED (CD) · PROPOSED · OWNER DECISION REQUIRED (ODR) ·
        VERIFICATION REQUIRED (VR) }
SHADOW-ONLY = hesaplanır/karşılaştırılır ama HİÇBİR user-facing görünürlük · stage değişimi ·
              domain command · CPE fact write · Case.riskScore write ÜRETMEZ.
NI  = NOT_IMPLEMENTED.  EEV = EVENT/ENGINE EVIDENCE gap.
Aksi yazılmadıkça: S-OWN=DEBTOR · TENANT SCOPE=tenant-local · EXEC=NOT AUTHORIZED.
```

---

## 3. Katman Ayrımı — OWNER-APPROVED [A] (behavior/feature ≠ score ≠ NBA ≠ legal-fact ≠ enforcement)

```text
A. BEHAVIOR / FEATURE (BC-11)   : gözlem-tabanlı DERIVED büyüklük. Bir hukuki fact DEĞİLDİR
                                  (INV-06); FEATURE NEVER BECOMES A LEGAL FACT.
B. SCORE (BC-12)                : feature'lardan türetilen versiyonlu skor. Hukuki/finansal SoT
                                  DEĞİLDİR (DBP-03 §8B); yüksek skor hiçbir hukuki guard'ı AŞAMAZ.
C. NBA / RECOMMENDATION (BC-14) : guard'lı ÖNERİ adayı — advisory. Hukuki/finansal İŞLEM YAPMAZ
                                  (N-09); guard-blocked bir öneri ÜRETİLMEZ.
D. AI RECOMMENDATION (BC-15)    : açıklama/taslak — advisory-only WRAP; kanonik state YAZMAZ (N-11).
E. LEGAL FACT / GUARD (BC-06/13): hukuki olgu + deterministik kapı — score/NBA/AI GİRDİSİ OLAMAZ.
F. ENFORCEMENT (CPE, N-07)      : tek action-enforcement authority; paralel/bypass ikinci otorite
                                  KURULAMAZ.
İLKE: bu katmanlar tek yönlüdür — fact → (feature) → score → NBA → HumanApproval → CPE → command.
Hiçbir alt katman üst hukuki katmanı türetemez/aşamaz (INV-06; SYS-AI-001; SYS-LEGAL-001).
```

---

## 4. BehaviorFeature Dictionary (#18) — OWNER-APPROVED [B] (BC-11; derived; PROPOSED)

**AS-IS (VERIFIED @fc06a0b3):** `BehaviorFeature`/`FeatureSnapshot` modeli schema'da YOK; davranış
türevi tek yer `getCrossFileDebtorAlerts` (debtor.service / debtor-cross-case-notification /
debtor.controller — AuditLog okuyan **advisory** çapraz-dosya uyarısı; SoT değil).

```text
FEATURE İLKELERİ (PROPOSED):
- Feature = OBSERVED-DERIVED (girdi olay/sonuç referansları + hesap versiyonu); ahlaki yargı DEĞİL.
- PAYMENT_WILLINGNESS → kanonik ad PAYMENT_RESPONSE_PROPENSITY: kişi karakteri değil GÖZLEM-tabanlı
  yanıt eğilimi; "willing/unwilling person" ETİKETİ YASAK.
- Outcome feature'ları (serviceSuccessRatio · enforcement* · addressReliability · assetCoverage):
  ahlaki yargı DEĞİL; explanation'da sınırlılık/uncertainty taşır.
- EVENT RECORD (BC-10): producer-owned domain OUTCOME semantics ALLOWED; ham event infra tablosu
  business SoT DEĞİL. Feature girdisi domain outcome event'i üzerindendir (ExecutionRecord DIRECTLY
  feature-input DEĞİL — RC-G3-05).
```

---

## 5. DebtorScore Spec (#19) — OWNER-APPROVED [C] (BC-12; ADAPTED shadow-only; BR-15=OPTION C)

**AS-IS (VERIFIED @fc06a0b3):** `DebtorScore/ScoreFactor/ScoreSnapshot` modeli schema'da YOK;
`modules/debtor-scoring/` (module + service + types + inputs/adapters + saf scoring-engine +
static-purity/module-registration testleri) MEVCUT ama **TÜKETİCİSİZ (dead-code-by-design)**.
`Case.riskScore Int?` (schema.prisma:1080) CANLI: yazıcı `automation.service.ts` nightly cron
(`calculateRiskScore` :248-252; `getRecommendedAction` :311-314), okuyucu `ai.service.ts`
(:196/229/314 — advisory prompt).

```text
CANONICAL SCORE AUTHORITY = ADAPTED DebtorScoringService (owner-approved):
- Target/shadow-only. PARALEL primary skor motoru PROHIBITED (tek motor).
- automation `calculateRiskScore` + `ai.service` + `Case.riskScore` = SHADOW-COMPARE → DEPRECATE →
  RETIRE hedefi (OD-05; new-consumer prohibition BINDING).
- Icrabot/V28 priority NOT REUSED AS AUTHORITY (§7).
BR-15 çözümü = OPTION C (hybrid feature sourcing + lineage): feature store TEK BAŞINA yeni SoT
  KURAMAZ; her skor girdi-feature referansı + lineage + rule/model version taşır.
KURALLAR:
- SKOR HUKUKİ/FİNANSAL SoT DEĞİLDİR (yüksek skor guard AŞMAZ; RC: legal facts GUARD/ELIGIBILITY
  INPUT ONLY, score içinde eritilemez).
- HUMAN OVERRIDE = skor DEĞERİNİ elle değiştirmek DEĞİL: skor immutable/versioned; insan
  reddedebilir/itiraz/yeniden-hesap ister → eski skor korunur + yeni snapshot+version.
- 8 skor tipi = TARGET CATALOGUE; "8 production skor authorized" DEĞİL. P1 shadow-eligible SUBSET
  owner tarafından execution planning'de seçilir.
- PAYMENT_CAPACITY + SETTLEMENT_SUITABILITY = PHASE 2 + legal+KVKK sign-off; user-facing NOT authorized.
- Case.riskScore CPE POLICY-FACT DEĞİLDİR (VERIFIED @fc06a0b3: CPE fact-store okuyucusu bulunamadı;
  "CPE riskScore kullanıyor" supersede); blocker NO; ancak yeni-consumer yasağı BAĞLAYICI kalır.
```

---

## 6. NBA Command & Guard Catalogue (#20) — OWNER-APPROVED [D] (BC-14/15; BR-14=OPTION C)

```text
BR-14 çözümü = OPTION C (TEK orkestratör — kanonik zincir):
  domain facts → deterministic candidate → eligibility → LegalGuard → eligible → (optional) ranking
  → recommendation → human review → task/draft → CPE + approval → domain command.
  GUARD-BLOCKED ≠ RECOMMENDATION (bloklu aday öneri olarak ÇIKMAZ; INV-06).
DOUBLE/TRIPLE GUARD: recommendation-creation + acceptance + execution = 3 AYRI guard check.
  Eski recommendation guard sonucu execution yetkisi DEĞİL; stale → expire.
NO_ACTION / WAIT ≠ LegalGuard BLOCK (öneri-yokluğu hukuki blok değildir).
N-09 : NBA hukuki/finansal işlem yapmaz.  N-14 : Rule-based NBA Shadow DebtorScore'u beklemez
       (Rule-NBA ∥ Score-NBA; Rule-NBA önce gelebilir).  N-26 : foundation order Hard Stop.
BC-15 AI Recommendation = advisory-only WRAP (açıklama/taslak; kanonik state yazmaz).
```

**AS-IS (VERIFIED @fc06a0b3):** `NBARecommendation/NBAOutcome/AIRecommendationLog` modeli YOK; NBA
UI YOK (icrabot panelleri orphan); PaymentPromise/SettlementOffer modeli YOK (AGG-10/11
NOT_IMPLEMENTED; sulh onay fact'i → OBD-04).

---

## 7. Icrabot / V28 Disposition — OWNER-APPROVED [E] (BR-13 = EXTRACT)

**AS-IS (VERIFIED @fc06a0b3):** `V28EngineModule` AKTİF (`app.module.ts:94` import, `:235`
kayıtlı; `modules/icrabot/v28-engine/`); `IcrabotModule` DEVRE DIŞI (`app.module.ts:104-105/243`
yorumlu — "Prisma client regenerate gerekli"); `IcrabotTimelineEntry` (schema.prisma:7290).

```text
BR-13 çözümü = EXTRACT: davranış/skor yeteneği Icrabot/V28'den ÇEKİLİR (extract), Icrabot bir
bütün olarak canonical authority olarak REUSE EDİLMEZ. V28 recipe/priority mantığı canonical NBA/
score AUTHORITY olarak devralınMAZ.
EVIDENCE GAP (SEPARATE OWNER TRIAGE — bu belge kapatmaz):
  EEV-01 : v28 modelleri tenant-partition zayıf; IcrabotTimelineEntry.tenantId nullable adayı → VR.
  EEV-02 : v28 OutboxService sarmalayıcı baypası (kasıtlı/guard'lı nüans) → VR; event+outbox aynı-tx
           deseni (DBP-05) korunur.
Disposition realization DBP-05 (event/outbox) + DBP-11 (migration/test) ile koordine; DBP-08 yön verir.
```

---

## 8. Phase 1 Shadow-Only Scope — OWNER-APPROVED [F] (aktivasyon YOK)

```text
PHASE 1 = SHADOW-ONLY. Aşağıdakilerin HEPSİ NOT AUTHORIZED:
  müvekkil/borçlu/personel görünürlüğü · workflow stage değişimi · CPE fact write · domain command ·
  Case.riskScore write (yeni) · score/NBA user-facing surface · otomatik mali etki (AGG-10/11 REJECT).
Behavior Summary P1 = internal/authorized/read-only; KVKK sign-off olmadan müvekkil/borçlu/personele
GÖSTERİLMEZ (→ DBP-10). PRODUCTION CUTOVER NOT AUTHORIZED.
```

---

## 9. Aggregate / Record Candidates + Lifecycle — OWNER-APPROVED [G]

| Aday model | BC | Sınıf | AS-IS | Not |
|---|---|---|---|---|
| DebtorScore (+ScoreFactor/ScoreSnapshot) | BC-12 | versiyonlu skor kayıt otoritesi; **SoT değil** | NI (schema'da yok) | ADAPTED engine |
| FeatureSnapshot / BehaviorFeature | BC-11 | derived feature | NI | lineage zorunlu |
| NBARecommendation / NBAOutcome | BC-14 | advisory öneri + sonuç | NI | guard-gated |
| AIRecommendationLog | BC-15 | açıklama/taslak log | NI | advisory-only |
| PaymentPromise / SettlementOffer | BC-09 | vaat/sulh | NI (AGG-10/11) | onay fact'i → OBD-04 |
| DebtorIntelligence / AssetSignal | BC-08 | istihbarat/varlık sinyali | AGG-15 CURRENT / AGG-16 TARGET | tenant-scoped |

Record model/lifecycle/immutability = **VR → DBP-05**; isim/niyetten immutability türetilmez.

---

## 10. Event / Fact Delta Disposition (behavior/score/NBA event adayları)

Behavior/score/NBA event adayları **CANDIDATE**'tir; `PL/DELIVERY: OBD-07 DEPENDENT`, `SEMANTIC
OWNER: producer context (BC-11/12/14)`, `SCHEMA VERSION: NOT DEFINED`. Producer iç domain event'i
VARSAYILMAZ; yalnız published integration/query contract kanoniktir (RC-G3-01). Foundation order
korunur: BC-10 → BC-11 → BC-12 → BC-14 (N-26). Final ad/payload/versiyon → DBP-12 reconciliation.

---

## 11. AS-IS Evidence & Gap Register (VERIFIED @fc06a0b3 — bu belge davranış değiştirmez)

Score/Feature/NBA/PaymentPromise/Settlement modelleri YOK · `Case.riskScore` CANLI (automation cron
yazar; ai.service advisory okur; CPE policy-fact DEĞİL) · DebtorScoring modülü consumer'sız
dead-code-by-design · V28EngineModule aktif / IcrabotModule devre dışı · NBA UI orphan · davranış
tek yer `getCrossFileDebtorAlerts` (AuditLog advisory).

| Gap | İçerik | Disposition |
|---|---|---|
| EEV-01 | v28 tenant-partition / IcrabotTimelineEntry.tenantId | VR → SEPARATE OWNER TRIAGE (DBP-11) |
| EEV-02 | v28 OutboxService baypas nüansı | VR → DBP-05 |
| EG-1..4 | 4 NOT-VERIFIED (audit-as-state · audit-as-feature · duplicate-side-effect · ilişkili) | EVIDENCE GAP → DBP-10(KVKK)/DBP-11(test)/Implementation Entry Gate |

---

## 12. DBP-09/10/11/12 Routing

| Hedef | Giden |
|---|---|
| **DBP-09** | NBA → read-model; Behavior Summary tile'ı (internal/read-only); Min Twin NBA'dan bağımsız (N-15) |
| **DBP-10** | feature/score KVKK sign-off; behavior/score user-facing görünürlük default-deny; AI context allowlist |
| **DBP-11** | shadow→cutover test-gate (freshness/conflict/rebuild); V28 EEV triage; migration; Master Blocker Register |
| **DBP-12** | OD-05 riskScore retire final disposition; shadow-eligible subset; skor/NBA event delta final; 8-skor katalog |

---

## 13. ODR / Open Kayıtları (bu belge hiçbirini vermez/kapatmaz)

**ODR:** OBD-07 event-distribution sınıfı (DBP-05) · P1 shadow-eligible score/NBA SUBSET seçimi ·
skor/NBA insan-onay rolleri.
**Owner-gated:** OD-05 Case.riskScore RETIRE · PAYMENT_CAPACITY/SETTLEMENT_SUITABILITY Phase 2 ·
V28/EEV separate owner triage · production cutover.
**Sign-off:** feature/score KVKK (DBP-10) · freshness/conflict/rebuild test-gate (DBP-11).

---

## 14. Exit Blocker Matrisi (iki gate ayrı)

| Konu | (i) ANALYSIS APPROVAL WITH OPEN ITEMS? | (ii) FULLY RESOLVED L6 ARCHITECTURE? |
|---|---|---|
| Katman ayrımı (§3) · feature/score/NBA/legal-fact | NO | **YES** |
| BR-13=EXTRACT · BR-14=C · BR-15=C · Score Authority | NO | **YES** |
| Shadow-only scope (§8) | NO | **YES** |
| Canonical orchestration chain (§6) | NO | **YES** |
| OD-05 riskScore retire | NO | CONDITIONAL (owner-gated) |
| Shadow-eligible subset seçimi | NO | CONDITIONAL (execution planning) |
| KVKK/test sign-off | NO | CONDITIONAL (DBP-10/DBP-11) |
| V28/EEV evidence gaps | NO | CONDITIONAL (separate triage) |

DBP-08, açık kalemleri görünür taşıyarak **OWNER-APPROVED / SHADOW-ONLY · KVKK+TEST SIGN-OFF
PENDING** disposition'ıyla kapanmıştır (2026-07-15); **FULLY RESOLVED** statüsü ve production
aktivasyonu yukarıdaki kararlar/sign-off'lar tamamlanmadan VERİLEMEZ.

---

## 15. AS-IS Bulgular Özeti (VERIFIED @fc06a0b3)

Score/Feature/NBA/PaymentPromise/Settlement modelleri YOK · `Case.riskScore Int?` CANLI (automation
nightly cron) · `debtor-scoring/` motoru + adaptörleri consumer'sız · V28EngineModule aktif /
IcrabotModule devre dışı · NBA UI orphan · `getCrossFileDebtorAlerts` AuditLog advisory · CPE
Case.riskScore'u policy-fact olarak OKUMAZ.

---

## 16. Owner Approval Record

```text
APPROVE DBP-08 v1.1 — OWNER-APPROVED / SHADOW-ONLY · KVKK+TEST SIGN-OFF PENDING (2026-07-15,
chat-only owner kararı; bu belge kaydın repo taşıyıcısıdır)
ONAYLANAN ([A]–[N]): katman ayrımı (behavior/feature ≠ score ≠ NBA ≠ legal-fact ≠ enforcement) ·
BehaviorFeature Dictionary YAPISI (PAYMENT_RESPONSE_PROPENSITY adı; ahlaki-yargı-değil) · DebtorScore
Spec (ADAPTED DebtorScoringService shadow-only; skor SoT değil; human-override=değer-değiştirme-değil;
8-skor target catalogue) · NBA Command & Guard Catalogue (tek orkestratör kanonik zincir; GUARD-
BLOCKED≠RECOMMENDATION; double/triple guard; NO_ACTION≠BLOCK) · Icrabot/V28 disposition (EXTRACT;
priority-not-reused) · Phase 1 shadow-only scope · Aggregate/Record ayrımı · Event delta disposition ·
AS-IS evidence & gap register.
KARARLAR: BR-13 = EXTRACT · BR-14 = OPTION C · BR-15 = OPTION C · Canonical Score Authority =
ADAPTED DebtorScoringService (shadow-only; parallel primary engine PROHIBITED).
ONAYLANMAMIŞ/AÇIK: OD-05 Case.riskScore RETIRE · P1 shadow-eligible score/NBA SUBSET seçimi ·
PAYMENT_CAPACITY/SETTLEMENT_SUITABILITY (Phase 2) · KVKK feature/score sign-off (DBP-10) · freshness/
conflict/rebuild test-gate (DBP-11) · V28/EEV evidence gap'leri (separate owner triage) · production
cutover — statüleri owner-gated / SIGN-OFF PENDING / OPEN olarak korunur.
```

**Revizyon geçmişi (özet):** R0.1 ilk L6 analizi (feature/score/NBA/AI katman ayrımı; AS-IS
DebtorScoring consumer'sız + V28 aktif tespiti) → R0.2 (ADAPTED score authority shadow-only; tek
orkestratör kanonik zincir; EXTRACT; shadow-only scope; feature≠legal-fact; NBA no legal/financial;
PAYMENT_RESPONSE_PROPENSITY yeniden-adlandırma; Case.riskScore CPE-policy-fact-değil düzeltmesi) →
v1.1 A18/A19/A20 record-level completion (feature/score/NBA record matrisleri; double/triple guard;
8-skor target catalogue; 4 evidence gap) → GO-DOCS pre-normalizasyonu (repo BR-13/14/15/20 + BC-11/
12/14/15/09/13/10 + AGG-10/11/12A/15/16 + N-07/09/14/26 + INV-06 cross-ref'leri; AS-IS @fc06a0b3
re-verification; RC clarification'ların gövdeye absorbe edilmesi). Ara revizyon metinleri görev
sohbetindedir; bağlayıcı olan bu konsolide belgedir.

## GOVERNANCE DOCUMENT SELF-CHECK

```text
- Feature bir legal-fact olarak mı sunuldu:                    NO (§3/§4; INV-06; FEATURE NEVER LEGAL FACT)
- Skor hukuki/finansal SoT olarak mı:                          NO (§5; guard aşmaz)
- Paralel primary skor motoru önerildi mi:                     NO (§5; tek ADAPTED motor)
- Human override skor değerini elle değiştirme mi:             NO (§5; immutable/versioned)
- NBA hukuki/finansal işlem yapıyor mu:                        NO (§6; N-09)
- GUARD-BLOCKED bir recommendation olarak çıktı mı:            NO (§6; INV-06)
- Tek eylem-enforcement authority CPE mi (paralel yok):        YES (N-07; §3-F/§6)
- Case.riskScore CPE policy-fact olarak mı gösterildi:         NO (§5; CPE okuyucusu bulunamadı)
- riskScore yeni consumer prohibition korundu mu:              YES (§5; OD-05 retire hedefi)
- Phase 1 shadow-only + production cutover NOT authorized:     YES (§8; user-facing/domain-write OFF)
- Icrabot bütün olarak authority reuse edildi mi:              NO (§7; EXTRACT, priority-not-reused)
- 8 skor "production authorized" olarak mı sunuldu:            NO (§5; target catalogue; subset owner)
- Otomatik mali etki / otomatik sulh:                          NO (§6/§9; AGG-10/11 REJECT)
- Event adayları PROPOSED + OBD-07/RC-G3-01 bağlı mı:          YES (§10)
- Record immutability çözülmüş gösterildi mi:                  NO (VR — DBP-05; §9)
- V28/EEV evidence gap'leri kapatıldı mı:                      NO (§7/§11; separate owner triage)
- IMPLEMENTATION AUTHORITY: NONE korundu:                      YES
- Register/decision-log değişikliği:                           NO
- Orphan referans:                                             NO (path'ler main'de mevcut)
```
