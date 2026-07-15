# DEBTOR DBP-02 — BUSINESS CAPABILITY & VALUE STREAM ARCHITECTURE v1.0

> **Canonical Phase 1 L1 artifact.** Bu belge, `DEBTOR CANONICAL DOMAIN BLUEPRINT CHARTER v1.0`
> §9/§13 kapsamındaki DBP-02 work package'ının owner-onaylı çıktısıdır (Charter artefakt #1
> Business Capability Map · #2 Value Stream Architecture · #3 Actor & Decision Rights Matrix).
> İçerik GO-ANALYZE (DBP-02 R0.2.2) çıktısıdır; bu GO-DOCS turunda yeni analiz, owner kararı
> veya mimari üretilmemiştir.

---

## 1. Document Status and Authority

```text
PROGRAM            : BORÇLU PLATFORMU
PHASE              : PHASE 1 — CANONICAL DOMAIN BLUEPRINT
WORKSTREAM         : DBP-02 — BUSINESS CAPABILITY & VALUE STREAM ARCHITECTURE
VERSION            : v1.0 (R0.2.2 onaylı taksonominin konsolidasyonu)
PRODUCED UNDER     : GO-ANALYZE (DBP-02 R0.1→R0.2→R0.2.1→R0.2.2); canonicalization: GO-DOCS
ARTIFACT STATUS    : OWNER-APPROVED — "APPROVE DBP-02 R0.2.2 BUSINESS ARCHITECTURE TAXONOMY"
                     (2026-07-15; onay kapsamı [A]–[F]; [G] NOT APPROVED — bkz. §12)
CANONICAL STATUS   : CANONICAL UPON APPROVED MERGE TO MAIN
ANALYSIS BASE (PIN): analiz turları origin/main @ 90f47703; GO-DOCS drift kontrolü ve bu
                     belgenin base'i origin/main @ c4ee2332 (fetch 2026-07-15; DBP-02 kanıt
                     kaynaklarında 90f47703→c4ee2332 arası SIFIR değişiklik — drift yok)
IMPLEMENTATION AUTHORITY: NONE — bu belge hiçbir capability için implementasyon, schema,
                     migration, cutover, workstream açılışı veya register genişletmesi
                     yetkisi üretmez (SYS-GOV-003, SYS-DEC-003, SYS-GOV-008).
KİMLİK UZAYI       : CAP/EC/PS/TR/CC/XC/VS/BH/EN kimlikleri DBP-02-local'dir ve DBP-12
                     Master Blueprint Synthesis'e kadar PROPOSED statüsündedir; register'daki
                     ACT-* backlog kimlikleriyle İLGİSİZDİR (SYS-GOV-011/012).
```

**Authority basis.** İki eksene aynı anda tabidir (SYS-AUTH-006): Semantic —
`SYSTEM-CONSTITUTION.md` → `DEBTOR-GOVERNANCE.md` (Domain Law) → ADR. Execution/safety —
`AGENTS.md` + task authorization. Bu belge üst normları yeniden üretmez, referanslar
(SYS-GOV-007); alt katman (DBP-03..12) bu taksonomiyi girdi alır.

## RELATED DOCUMENTS

- Charter: `project/docs/blueprint/DEBTOR-CANONICAL-DOMAIN-BLUEPRINT-CHARTER-v1.0.md`
- Domain Law: `project/docs/governance/DEBTOR-GOVERNANCE.md`
- Üst norm: `project/docs/governance/SYSTEM-CONSTITUTION.md`
- Phase 0 kapanışı: `project/docs/governance/DEBTOR-PHASE-0-COMPLETION-ROADMAP.md`
- Kanıt katmanı: `project/docs/analysis/debtor-master-synthesis-v2.md` (MS)
- Okuma sırası: `project/docs/governance/GOVERNANCE-INDEX.md`

---

## 2. Statü Sözlüğü (ayrıştırılmış eksenler)

```text
AUTH  (AUTHORITY STATUS)        : CURRENT / TARGET / NOT_IMPLEMENTED / SHADOW_ONLY /
                                  PRODUCTION_NO_GO / DEPRECATED / SUPERSEDED
MAT   (MATURITY)                : FULL / PARTIAL / NONE / UNKNOWN
EXEC  (EXECUTION AUTHORIZATION) : AUTHORIZED / NOT AUTHORIZED / OWNER DECISION REQUIRED / N/A
SEM-OWN (SEMANTIC OWNER)        : tek domain / CROSS-CUTTING AUTHORITY / OWNER DECISION REQUIRED
PART  (PARTICIPATING DOMAINS)   : katılımcı domain listesi (ownership DEĞİLDİR)
ODS   (OWNERSHIP DECISION STATUS): CANONICALLY DEFINED / PROPOSED / OWNER DECISION REQUIRED /
                                  EXTERNAL DOMAIN DECISION
EVD   (EVIDENCE STATUS)         : VERIFIED / PROVISIONAL / VERIFICATION REQUIRED
DECISION STATUS (realization)   : CANONICALLY DEFINED / PROPOSED / OWNER DECISION REQUIRED /
                                  EXTERNAL DOMAIN DECISION / UNKNOWN — EVIDENCE REQUIRED
```

Kısaltmalar: **CD**=CANONICALLY DEFINED · **ODR**=OWNER DECISION REQUIRED ·
**EDD**=EXTERNAL DOMAIN DECISION. `SHARED` semantic-owner değeri olarak KULLANILMAZ;
katılım yalnız PART alanında gösterilir. CLOSED/MERGED/DEFERRED/REUSE ifadeleri AUTH
ekseninde kullanılmaz.

---

## 3. Business Capability Map (Katman A) — OWNER-APPROVED [A]

| CAP | Capability | Realization → DECISION STATUS | AUTH | MAT | EXEC | SEM-OWN | PART | ODS | EVD |
|---|---|---|---|---|---|---|---|---|---|
| CAP-01 | Kimlik ve taraf çözümleme | Party+PartyIdentity+PartyMatch → ODR (MS/OD-04) | TARGET | NONE | ODR | **ODR** (MS/OD-04; SYS-CONST §7 Party Registry TARGET / SB-001 HOLD; SYS-GOV-019 shared-kernel adayı) | DEBTOR, CLIENT | ODR | VERIFIED |
| CAP-02 | Borçlu profil yönetimi | Debtor → CD | CURRENT | PARTIAL | N/A | DEBTOR | — | CD | VERIFIED |
| CAP-03 | Hukuki rol ve dosya ilişkisi yönetimi | CaseDebtor (mevcut) + rol hardening → PROPOSED | CURRENT | PARTIAL | NOT AUTHORIZED | DEBTOR | Case ctx | CD | VERIFIED |
| CAP-04 | Hukuki sorumluluk yönetimi (**semantik**: kim/neden/ne kadar/hangi rejimde — finansal bakiye/allocation sonuçları DEĞİL) | Liability modeli → ODR (MS/OD-07; BR-07) | NOT_IMPLEMENTED | NONE | ODR | **DEBTOR** (DEBTOR-GOV §4: LiabilityService; CD) | RECEIVABLE, COLLECTION, ACCOUNTING (koordinasyon N-16 — ortak ownership DEĞİL; finansal sonuçların sahibi ilgili dış domain) | CD (semantik) · realization ODR | VERIFIED |
| CAP-05 | Adres tespiti ve delillendirme | DebtorAddress + adres-delil zinciri → PROPOSED | CURRENT | PARTIAL | NOT AUTHORIZED | DEBTOR | sağlayıcılar (kanıt kaynağı) | CD | VERIFIED |
| CAP-06 | Tebligat yönetimi (yürütme + sonucun kanonikleştirilmesi) | Tebligat/ServiceAttempt (senkron kapı korunur) → CD | CURRENT | PARTIAL | N/A | DEBTOR | — | CD | VERIFIED |
| CAP-07 | Hukuki süre yönetimi (tebliğ-sayılma + süre hesabı) | kanonik tebliğ tarihi + takip-tipi kural matrisi + hesap servisi (dar kapsam, flag'li kademeli) → CD | CURRENT | PARTIAL | genişletme: NOT AUTHORIZED | DEBTOR | Case/Workflow | CD | **EVD: VERIFIED** · **OPERATIONAL / CUTOVER VERIFICATION: FLAG DEFAULT STATE — VERIFICATION REQUIRED** |
| CAP-08 | İtiraz ve kesinleşme yönetimi (itiraz fact'i, durdurucu etki, kesinleşme, cebrî icra kabiliyeti) | FACT/GATE vizyonu girdi (Phase-0 Roadmap §8); realization yok → ODR (workstream açılışı) | NOT_IMPLEMENTED | NONE | ODR | DEBTOR | Case/Workflow | CD (kapsam Domain Law'da) | VERIFIED |
| CAP-09 | Borçlu hukuki durum yönetimi (ölüm/iflas/konkordato/tasfiye) | DebtorLegalStatus adayı → ODR (MS/OD-06/13; Q1..Q4) | NOT_IMPLEMENTED | NONE | ODR | **ODR** (Q1: Party-vs-Debtor seviyesi owner kararı; semantic ownership peşinen sabitlenmez; storage/aggregate seviyesi ile semantic ownership ayrımı korunur) | DEBTOR; gerekirse Party Registry | **ODR** | VERIFIED |
| CAP-10 | Hukuki uygunluk ve aksiyon kapıları (eligibility + deterministik guard) | EnforcementEligibility+LegalGuard adayları; mevcut CasePolicyEngine ile entegrasyon deseni → ODR (BR-08/09 → DBP-04) | NOT_IMPLEMENTED | PARTIAL (CPE action-enforcement mevcut) | ODR | DEBTOR | OFFICE (yetki modeli) | CD | VERIFIED |
| CAP-11 | İcra aksiyonu yaşam döngüsü (taslak→onay→yürütme→sonuç) | EnforcementAction (guarded write-path mevcut; NOT NULL hardening kalan) → CD (mevcut kısım) | CURRENT | PARTIAL | kalan hardening: NOT AUTHORIZED | DEBTOR | Case, OFFICE | CD | VERIFIED |
| CAP-12 | Ödeme vaadi yönetimi (vaat→tutma sonucu) | PaymentPromise → PROPOSED | NOT_IMPLEMENTED | NONE | NOT AUTHORIZED | DEBTOR | — | CD (DEBTOR-GOV §2 kapsam) | VERIFIED |
| CAP-13 | **Sulh süreci yönetimi** (yalnız legal-settlement workflow'u; client instruction/approval → XC-01; creditor disposition → kapsam dışı, SYS-LEGAL-010) | SettlementOffer → PROPOSED | NOT_IMPLEMENTED | NONE | NOT AUTHORIZED | **DEBTOR** (DEBTOR-GOV §2/§6 BC9; CD) | CLIENT (XC-01 onay fact'i), COLLECTION/RECEIVABLE (mali sonuç sınırı) | CD | VERIFIED |
| CAP-14A | Davranışsal ölçüm ve skor üretimi | kanonik DebtorScoringService (mevcut; consumer switch açık) → CD (motor) · switch ODR (MS/OD-05) | CURRENT | PARTIAL (consumer yok; feature katmanı yok; legacy `Case.riskScore` görünürlükte) | switch: ODR | DEBTOR | — | CD | VERIFIED |
| CAP-14B | Advisory öneri / NBA (görev adayı üretimi; advisory-only) | Rule/Score-NBA adayları → kapsam ODR (MS/OD-08) | TARGET | NONE | ODR | DEBTOR | — | CD (sınırlar DEBTOR-GOV §11) | VERIFIED |
| CAP-16A | Saha istihbaratı yönetimi | DebtorIntelligence → CD (mevcut temel; EXTEND) | CURRENT | PARTIAL | genişletme: NOT AUTHORIZED | DEBTOR | — | CD | **VERIFIED** — exact path'ler: `project/apps/api/prisma/schema.prisma`; migration `project/apps/api/prisma/migrations/20260616020000_debtor_intelligence/`; `src/modules/debtor/debtor.service.ts` / `debtor.controller.ts` / `dto/debtor.dto.ts`; `src/modules/validation-gate/validation-gate.service.ts` |
| CAP-16B | Yapılandırılmış varlık sinyali yönetimi | AssetSignal → PROPOSED (MS §H BC 8 hedef modeli) | TARGET | NONE | NOT AUTHORIZED | DEBTOR | — | PROPOSED | **EVD: VERIFIED** · **REALIZATION EXISTENCE: ABSENT** — `AssetSignal` grep: `project/apps/api` 0 eşleşme + `project/apps` 0 eşleşme (2026-07-15); realization repo'da mevcut değil |

Not: CAP-15 numarası bilinçli boştur — eski "Müvekkil talimat ve onay yönetimi" adayı Debtor
business capability DEĞİLDİR; XC-01 olarak yeniden sınıflandırılmıştır (§5).

### 3.1 Consumed External Contracts (business capability DEĞİL — sınır sözleşmesi)

| CC | Tüketilen sözleşme | Sahip domain | Sınır kuralı |
|---|---|---|---|
| CC-01 | Tahsilat kayıtları + `COLLECTION_RECORDED` sinyali (salt okuma/bağlama) | COLLECTION | INV-10, N-17: yeniden yazım/bypass yasak; DEBTOR tarafında tahsis kararı yok |
| CC-02 | Alacak bakiye / legal allocation sonuçları | RECEIVABLE (repo ADR-014 hattı) | SYS-FIN-001 beş-kavram ayrımı; DEBTOR yalnız davranış sinyali/görünüm tüketir |

---

## 4. Enabling / Cross-Cutting Capability Map (Katman B) — OWNER-APPROVED [C] (FROZEN)

| EC | Enabling capability | AUTH | MAT | EXEC | SEM-OWN | EVD | Kanıt |
|---|---|---|---|---|---|---|---|
| EC-01 | Hukuki delil koruma (immutable/WORM, provenance, silinemezlik) | TARGET | PARTIAL | NOT AUTHORIZED | CROSS-CUTTING AUTHORITY | VERIFIED | INV-11; SYS-EVID-004/006; BR-10→DBP-05 |
| EC-02 | İşlem izlenebilirliği ve audit (sanitized; iş-sinyalinden ayrık) | CURRENT | PARTIAL | N/A | CROSS-CUTTING AUTHORITY | VERIFIED | repo ADR-011; INV-08 |
| EC-03 | Tenant izolasyonu | CURRENT | PARTIAL | kalan hardening: NOT AUTHORIZED | CROSS-CUTTING AUTHORITY | VERIFIED | FND-01 CLOSED + GATE-1 CI (18 test dosyası); INV-01/02 |
| EC-04 | Yetkilendirme ve onay güvencesi (insan-onay zorunluluklarının uygulanması) | CURRENT | PARTIAL | N/A | CROSS-CUTTING AUTHORITY (aktör/yetki modeli OFFICE'in — SYS-GOV-014) | VERIFIED | DEBTOR-GOV §7; SYS-AUTH-007..009 |
| EC-05 | Kişisel veri koruma (KVKK: minimizasyon, retention, anonymization, iletişim izni) | TARGET | PARTIAL | ODR (BR-19) | CROSS-CUTTING AUTHORITY | VERIFIED | LG-09; SYS-AUTH-012; DBP-10 (KVKK sign-off) |

---

## 5. Required External / Participating Capabilities

| XC | External capability | SEM-OWN | Kaynak durumu | Debtor tarafı katılım sorumluluğu |
|---|---|---|---|---|
| XC-01 | **Client Instruction and Approval Capability** (müvekkil talimat + onay fact'i üretimi) | EXTERNAL (CLIENT) — CD (SYS-GOV-015) · kanonik kayıt yüzeyi: ODR + EDD | **INDEPENDENT CLIENT DOMAIN-LAW ARTIFACT: NOT PRESENT** · **CURRENT CANONICAL BOUNDARY SOURCE: SYSTEM-CONSTITUTION / SYS-GOV-015** · **UNRESOLVED: client approval fact'in kanonik kayıt yüzeyi ve OfficeApproval–ClientApproval sınırı** | Yalnız: (1) onay talebini oluşturma, (2) dosya/işlem correlation'ı, (3) approval fact'ini TÜKETME, (4) sonucu borçlu workflow'una uygulama. Kayıt yüzeyini bu belge ÇÖZMEZ. |

EVD: PROVISIONAL — CLIENT tarafının mevcut yetenekleri bu analizde taranmamıştır.

---

## 6. Product Surface Catalog (Katman C) — OWNER-APPROVED [D]: NON-AUTHORITATIVE TARGET CATALOG

> Bu katalog hiçbir surface için ownership veya implementation yetkisi üretmez.

| PS | Yüzey | AUTH | EXEC | Not |
|---|---|---|---|---|
| PS-01 | Borçlu 360 (read-only başlar) | TARGET | NOT AUTHORIZED | UI_DECISION_SAFETY gate'i; yalnız kanonik/açıkça-türev veri |
| PS-02 | Digital Twin (Min→Full) | TARGET | NOT AUTHORIZED | Twin ≠ SoT (N-11); Min Twin NBA'dan önce (N-15) |
| PS-03 | Müvekkil Onay Merkezi | TARGET | ODR | görünürlük MS/OD-10/11; kayıt yüzeyi XC-01/GAP-16'ya bağlı — Debtor-owned olarak KESİNLEŞTİRİLMEMİŞTİR |
| PS-04 | Portföy Radar | TARGET | NOT AUTHORIZED | feature katmanına bağımlı |
| PS-05 | Evidence Timeline | TARGET | NOT AUTHORIZED | event/evidence contract'ına (DBP-05) bağımlı |
| PS-06 | LegalGuard UX (engel kartı/guard rozeti) | TARGET | NOT AUTHORIZED | CAP-10 realization'ına bağımlı |

---

## 7. Technical Realization Mapping (Katman D — delivery hygiene dahil)

| TR | Teknik iş | Beslediği | AUTH/EXEC | Kanıt |
|---|---|---|---|---|
| TR-01 | DomainEvent + EventOutbox (mevcut temeli EXTEND; transactional+idempotent) | CAP-14A/B, EC-01/02, PS-05 | temel CURRENT (MAT: PARTIAL); EXTEND: NOT AUTHORIZED | DEBTOR-GOV §9 preserve; INV-12; N-12 |
| TR-02 | Timeline/read-model projection altyapısı | PS-01/02/05 | TARGET; NOT AUTHORIZED | BC 16; EVENT_REPLAY gate |
| TR-03 | Tenant-safe AI bağlam hattı + öneri kaydı (AIContextBuilder/AIRecommendationLog) | CAP-14B, EC-05 | NOT_IMPLEMENTED; ODR (MS/OD-09) | SYS-AI-006/008 |
| TR-04 | Feature-flag'li kademeli cutover deseni (kanıtlanmış şablon) | CAP-07 ve gelecek cutover'lar | desen CURRENT | Phase-0 Roadmap §8 (iki kez tekrarlanmış) |
| TR-05 | Skor motoru consumer switch + `Case.riskScore` RETIRE | CAP-14A | ODR (MS/OD-05) | Scoring-canon Phase 3 açık |
| TR-06 | Demo/mock yüzeylerin karantinadan kalıcı temizliği | hijyen | ODR (MS/OD-12) | FND-05 karantinada |
| TR-07 | EnforcementAction NOT NULL hardening + cleanup (PR-EA-5/6) | CAP-11, EC-03 | NOT AUTHORIZED | Phase-0 Roadmap §6 |
| TR-08 | Geçmiş veri backfill'leri (MPB-028(a) PR-6 vb.) | CAP-07 tarihsel veri | NOT AUTHORIZED | Phase-0 Roadmap §6 |
| TR-09 | Disposable-DB temsili senaryo kanıt düzeneği | doğrulama altyapısı | desen CURRENT | Phase-0 Roadmap §5/§8 |

---

## 8. Value Stream Architecture — OWNER-APPROVED [B]

### 8.1 Dallanma modeli

Akış doğrusal değildir; vaat (VS-05) ve sulh (VS-06) her aşamadan tetiklenebilir,
başarısızlıkta icra akışına dönülür; itiraz VS-03'te takibi durdurur (itiraz-sonrası yol
GAP-01/DBP-04 kapsamı). **Tahsilat kaydı, akış üzerinde yalnız dış domain'den gelen bir İŞ
SİNYALİDİR** (CC-01); hiçbir aşamada tek başına kapanış, takip sonlandırma veya bakiye-sıfır
sinyali değildir.

```text
VS-01 Edinim/Kimlik → VS-02 Adres/Tebligat → VS-03 Süre/İtiraz/Kesinleşme → VS-04 İcra Aksiyonu
      ↑ (vaat/sulh her aşamadan dallanır; tahsilat sinyali her aşamada gelebilir — BH-01)
VS-05 Vaat · VS-06 Sulh ←→ VS-01..04    |    EN-01 karar-desteği yatay döngüsü (hiçbir adıma yazamaz)
```

### 8.2 Kapanış-adayı kuralı

```text
RULE STATUS                : OWNER-APPROVED PROPOSED L1 BUSINESS RULE (2026-07-15)
                             GO-DOCS ve approved merge tamamlanmadan CANONICAL sayılmaz; merge
                             sonrasında da implementasyon hükmü ÜRETMEZ — ilgili tasarım
                             (DBP-04/07/09) ve owner gate'lerine girdi olur.
CANONICAL CONSTRAINT SOURCES: SYS-FIN-001 · SYS-SOT-005 · SYS-CAN-005 + mevcut Collection/
                             Receivable sınırları (INV-10, N-17, CC-01/02)
OWNER-SPECIFIED CONDITIONS : dosya ancak şunlar KANONİK doğrulandığında kapanış ADAYI olur —
                             (1) COLLECTION receipt doğrulaması; (2) RECEIVABLE legal
                             allocation sonucu; (3) enforceable balance = 0 doğrulaması;
                             (4) faiz/masraf/ferî kalemlerin durumu; (5) reversal/chargeback/
                             iptal riski değerlendirmesi; (6) creditor disposition veya ilgili
                             hukuki sonuç; (7) Debtor legal closure guard; (8) gerekli insan onayı.

CANONICALLY DEFINED (mevcut sınırlara dayanır): DEBTOR, receipt bilgisinden kendi başına
allocation, disposition veya closure TÜRETEMEZ (INV-10; SYS-FIN-001; SYS-SOT-002).
```

### 8.3 Value stream tablosu

| Alan | **VS-01 Edinim & kimliklendirme** | **VS-02 Adres & tebligat** | **VS-03 Süre, itiraz & kesinleşme** | **VS-04 İcra aksiyon döngüsü** | **VS-05 Vaat yönetimi** | **VS-06 Sulh** |
|---|---|---|---|---|---|---|
| Trigger | dosya açılışı / borçlu ekleme | borçlu bağlandı, adres gerekli | tebliğ sonucu kanonikleşti | kesinleşme + eligibility | borçlu ödeme niyeti beyanı | taraflardan sulh iradesi |
| Primary stakeholder | avukat + müvekkil | avukat | avukat | avukat + müvekkil | avukat + borçlu | müvekkil + borçlu |
| Start state | taraf bilgisi ham | adres doğrulanmamış | süre penceresi açık | aksiyon hukuken mümkün | vaat yok | teklif yok |
| End state | kimliklendirilmiş borçlu + rol | kanonik tebliğ sonucu + tarih | kesinleşti VEYA itirazla durdu | aksiyon sonuçlandı + delillendi | vaat fact'i + KEPT/BROKEN sonucu | onaylı sulh uygulandı VEYA red |
| Üretilen değer | doğru muhatap | hukuken geçerli tebligat | doğru süre; hükümsüzlük riski yok | hukuka uygun cebrî icra | tahsilat öngörü sinyali | ihtilafın ekonomik çözümü |
| SEMANTIC OWNER | ODR (kimlik kökü — MS/OD-04) · süreç lead: DEBTOR | DEBTOR | DEBTOR | DEBTOR | DEBTOR | DEBTOR (süreç lead) |
| PARTICIPATING | CLIENT, dış kaynaklar | sağlayıcılar (kanıt) | Case/Workflow | OFFICE, Case | COLLECTION (fiili ödeme CC-01) | CLIENT (XC-01), COLLECTION/RECEIVABLE (mali sonuç) |
| Primary capabilities | CAP-01/02/03/04 | CAP-05/06 | CAP-07/08 | CAP-10/11 (+CAP-09) | CAP-12 (+CAP-14A sinyal) | CAP-13 + XC-01 |
| Failure/stop | kimlik çelişkisi → insan onayı; tenant ihlali → fail-closed | mock/kanıtsız sonuç → BLOK (LG-06) | süre kaynağı belirsiz → fail-closed; itiraz → DUR | guard BLOK (LG-01..05); onaysız yürütme yok | bkz. §8.4 | müvekkil onayı yok → uygulanamaz; self-service → REJECT |
| Success indicator | mükerrer borçlu ↓ | geçersiz tebligat ↓ | süre kaçırma = 0 | iptal edilen işlem = 0 | kept-ratio ölçülür | onaylı sulh oranı/süresi |

### 8.4 VS-05 hukuki etki ve stop conditions

**LEGAL EFFECT: `RULE CATALOG / LEGAL SIGN-OFF REQUIRED`** (vaadin hukuki etkisi bu belgede
hükme bağlanmaz). **Stop conditions:** (1) borçlu/dosya kimliği belirsiz · (2) vaat tutarı/
tarihi belirsiz · (3) beyanın kaynağı/provenance'ı yok · (4) iletişim/KVKK şartı sağlanmamış
(LG-09) · (5) yetkisiz kullanıcı kaydı · (6) vaat kaydından otomatik bakiye/allocation
değişikliği → REJECT · (7) vaat kaydından otomatik icra veya kapama kararı → REJECT. Vaat
kaydı yalnız fact + davranış sinyali üretir; finansal/hukuki sonucu otomatik değiştirmez.

### 8.5 BH-01 — Collection/Receivable Boundary Handoff (value stream DEĞİL)

Girdi (DEBTOR→dışarı): dosya/borçlu bağlamı, aksiyon sonuç event'leri. Çıktı (dışarı→DEBTOR):
CC-01 tahsilat kaydı sinyali, CC-02 bakiye/allocation sonuçları. Sınır: receipt ≠ allocation ≠
disposition ≠ payout ≠ journal (SYS-FIN-001); DEBTOR hiçbirine yazamaz (INV-10). CC-01/CC-02
sinyalleri kapanış değerlendirmesine yalnız GİRDİdir; kapanış kararı §8.2 kuralına ve karar
matrisi #7'ye tabidir.

### 8.6 EN-01 — Decision Support Feedback Loop (yatay; ana value stream DEĞİL)

`VS-01..06 olay sinyalleri → (TR-01) event → feature → versiyonlu skor → eligibility+guard
süzgeci → advisory öneri/NBA adayı → insan kabul/red → outcome geri beslemesi`. Loop hiçbir
VS adımına YAZAMAZ (INV-06/09); kullanıcıya çıkış MS/GATE-6 shadow kanıtı sonrası; ihlal
`AI_NBA_FOUNDATION_ORDER_VIOLATION` Hard Stop'tur (N-26).

---

## 9. Actor Classification — OWNER-APPROVED [E] (FROZEN)

| Sınıf | Aktör | Not |
|---|---|---|
| A. OPERATIONAL | OP-01 Avukat/dosya sorumlusu · OP-02 Operasyon personeli · OP-03 Büro onay yetkilisi (rol tanımı OFFICE domain'ine tabi) · OP-04 Müvekkil · OP-05 Borçlu | OP-05 değer akışının öznesidir; self-service yüzeyi MS/OD-11'e kilitli |
| B. GOVERNANCE | GV-01 Owner · GV-02 LDO — **POLICY / RULE CATALOG AUTHORITY** (LegalGuard kataloğu + legal migration sign-off; somut dosyadaki işlemlerin onaylayıcısı DEĞİL) · GV-03 KVKK sign-off · GV-04 Finance sign-off | Governance aktörleri işlem akışındaki karar vericilerle karıştırılmaz; sign-off'lar AS APPLICABLE TO THE AFFECTED DOMAIN |
| C. SYSTEM / EXTERNAL | SY-01 Deterministik otomasyon · SY-02 NBA/AI (advisory-only) · SY-03 Dış sağlayıcılar (PTT/UETS/MERNİS/UYAP) | SY-03 kanıt kaynağıdır, authority değildir (SYS-AUTH-011; SYS-ID-004) |

---

## 10. Evidence-backed Decision Rights Matrix — OWNER-APPROVED [F] (yalnız CD bileşenler); ODR/EDD bileşenler [G] kapsamında NOT APPROVED

| # | Karar | PREP | DEC | EXE | Domain owner | Canonical source | DECISION STATUS | Oto. sınıf | Gate / open question |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Tebligat sonucunun kanonikleştirilmesi | OP-02/SY-01 (taslak) | insan — rol tanımsız | tek kanonik yol | DEBTOR | DEBTOR-GOV §4/§7; LG-06 | sınıf: CD · onay rolü: ODR | REQUIRES_HUMAN_APPROVAL | onay rolü → DBP-04/DBP-10 |
| 2 | Hukuki süre hesabı | SY-01 | — | SY-01 | DEBTOR | DEBTOR-GOV §7; LG-10 | CD | SAFE_AUTO | UNRESOLVED türler + tatil kapsamı (GAP-09) |
| 3 | Kesinleşme değerlendirmesi | sistem fact sunar (bugün fact üretilmiyor) | insan — rol tanımsız | insan | DEBTOR | DEBTOR-GOV §7; Phase-0 Roadmap (finalizationDate üretilmez) | sınıf: CD · rol+fact temeli: ODR | REQUIRES_HUMAN_APPROVAL | itiraz fact'i yokken karar dayanağı (GAP-01) |
| 4 | Haciz talebi (taslak→gönderim) | SY-01/OP-02 | insan — kademe tanımsız | insan | DEBTOR | DEBTOR-GOV §7; LG-01/02/03 | sınıf: CD · onay kademesi: ODR | AUTO_PREPARE_ONLY → REQUIRES_HUMAN_APPROVAL | kademe → DBP-04/DBP-10 |
| 5 | İndirim uygulama | OP-01 | yetki sahibi belirsiz | insan | ODR (PART: CLIENT, RECEIVABLE) | DEBTOR-GOV §7; SYS-GOV-015 | NEVER_AUTO: CD · yetki: ODR + EDD | NEVER_AUTO | kaynak durumu XC-01 formülüyle okunur (bağımsız Client Domain-Law artifact'ı NOT PRESENT; boundary source SYS-GOV-015) |
| 6 | Sulh onayı | SY-02/OP-01 (taslak) | müvekkil onayı ŞART (CD); iç review politikası tanımsız | insan | DEBTOR (süreç) — onay fact'i: EXTERNAL(CLIENT), bkz. #10/XC-01 | DEBTOR-GOV §7; LG-08; MS ADR-020 | müvekkil-onay şartı: CD · iç review: ODR | AUTO_PREPARE_ONLY | LDO = policy authority (işlem onaylayıcısı değil) |
| 7 | Dosya kapama | OP-01 | insan — rol tanımsız | insan | ODR (Case supporting context'in kapama semantiği sahibi tanımsız; PART: DEBTOR guard, Case, OFFICE) | DEBTOR-GOV §7 | sınıf: CD · rol+owner: ODR | REQUIRES_HUMAN_APPROVAL + LegalGuard | kapanış-adayı kuralı §8.2 (OWNER-APPROVED PROPOSED) |
| 8 | Party merge (fuzzy) | SY-01 (aday) | insan — rol tanımsız | sistem (undo/SPLIT zorunlu) | DEBTOR | INV-07; DEBTOR-GOV §7 | insan-onay+geri-alınabilirlik: CD · rol: ODR | REQUIRES_HUMAN_APPROVAL | merge yetki rolü → DBP-06 |
| 9 | Exact identity auto-link | SY-01 | izin kanonik ("olabilir"); etkinleştirme kararı verilmedi | SY-01 | DEBTOR | DEBTOR-GOV §7 (MS/ADR-003) | izin: CD · etkinleştirme+önkoşullar: PROPOSED → DBP-06 (MS/OD-04'e bağlı) | SAFE_AUTO (koşullu) | eşik/önkoşul seti |
| 10 | Müvekkil onay fact'inin sahibi ve kaydı | süreç talep eder | OP-04 (müvekkil) | kayıt yüzeyi kararlaştırılmadı | EXTERNAL (CLIENT semantik sahip) | SYS-GOV-015; DEBTOR-GOV §3 (HumanApproval=OfficeApproval REUSE — büro-içi onay için) | semantik sahiplik: CD (CLIENT) · kayıt yüzeyi: EDD + ODR | REQUIRES_HUMAN_APPROVAL | XC-01: OfficeApproval–ClientApproval sınırı → DBP-09/10 + CLIENT/OFFICE governance |
| 11 | LegalStatus geçişi | sinyal/aday | insan + delil — rol tanımsız | insan | DEBTOR (seviye Q1 ODR — bkz. CAP-09) | DEBTOR-GOV §4/§7 | sınıf: CD · rol: ODR | REQUIRES_HUMAN_APPROVAL | Q1..Q4 (MS/OD-06/13) |
| 12 | Tahsilat tahsisi | — | — | dış domain | EXTERNAL (COLLECTION/RECEIVABLE) | DEBTOR-GOV §7; SYS-FIN | EDD | NEVER_AUTO (DEBTOR tarafında) | — |
| 13A | NBA / advisory task candidate üretimi | SY-02 | shadow'da gösterim yok; GATE-6 sonrası insan kabul/red | SY-01 | DEBTOR | DEBTOR-GOV §7/§11; N-26 | CD | SHADOW_ONLY → SAFE_AUTO (GATE-6 sonrası) | Gate: MS/GATE-6 sıfır-yan-etki kanıtı · human review: kabul/red zorunlu, komuta dönüşemez |
| 13B | AI açıklama / taslak üretimi | SY-02 — AI advisory layer | OP-01 veya yetkili insan kullanıcı — çıktıyı kullanma/değiştirme/reddetme kararı | yetkili insan kullanıcı | DEBTOR | DEBTOR-GOV §11; SYS-AI-005/006 | CD | AUTO_PREPARE_ONLY | Human review: **MANDATORY BEFORE USE** — AI hiçbir karar vermez, onay vermez, işlemi yürütmez |
| 14 | Taksonomi/faz kapıları | ajan (analiz) | GV-01; sign-off'lar AS APPLICABLE TO THE AFFECTED DOMAIN (LDO→legal-semantik paketler; KVKK→DBP-10; Finance→DBP-07) | — | governance | SYS-DEC-001/008; Charter §15 | CD | — | DBP-02 onayı için LDO/KVKK/Finance zorunlu ortak onaylayıcı DEĞİLDİR |

---

## 11. Gap Register (sınıflandırılmış) + DBP-03 START/EXIT Blocker Matrisi

"Hiçbir gap DBP-03'ü bloklamaz" ifadesi yalnız **START** için geçerlidir; START'ın tek ön
koşulu [A]/[B] taksonomi onayıdır (2026-07-15'te verildi). EXIT/APPROVAL değerleri yalnız
YES / NO / CONDITIONAL olabilir.

| GAP | Konu | Tür | Sev | Operasyonel etki (bugün) | START? | EXIT/APPROVAL? | Owner kararı? | Hedef |
|---|---|---|---|---|---|---|---|---|
| GAP-01 | İtiraz/durdurucu etki + kesinleşme fact'i yok; scheduler itiraz kontrolsüz otomatik ENFORCEMENT | LEGAL SAFETY GAP | CRITICAL | CANLI (owner-kabullü bilinen risk, Phase-0 Roadmap §7) | NO | NO | workstream açılışı | DBP-04 + deferred WS |
| GAP-02 | Borçlu hukuki durumu yapılandırılmamış | BUSINESS CAPABILITY GAP + DOMAIN DESIGN DECISION | HIGH | risk skorlaması hukuki durumu göremiyor | NO | **CONDITIONAL** — exit kriteri LegalStatus ownership satırının `OPEN (OD-06/Q1)` işaretlenmesine izin veriyorsa bloklamaz; kapalı teslim isteniyorsa bloklar | MS/OD-06/13 | DBP-04 |
| GAP-03 | Sorumluluk modeli yok | BUSINESS CAPABILITY GAP + CROSS-DOMAIN DEPENDENCY | HIGH | sorumluluk sorusu cevapsız | NO | **YES** — Liability aggregate-ownership satırı MS/OD-07 verilmeden kapanamaz | MS/OD-07 | DBP-07 |
| GAP-04 | Çapraz-dosya kimlik çözümleme yok | BUSINESS CAPABILITY GAP + DOMAIN DESIGN DECISION | HIGH | mükerrer borçlu riski | NO | **YES** — kimlik/Party BC sınırı MS/OD-04 verilmeden canonical closure alamaz | MS/OD-04 | DBP-06 |
| GAP-05 | Eligibility+LegalGuard yok; CPE deseni çözülmemiş | BUSINESS CAPABILITY GAP + DOMAIN DESIGN DECISION | HIGH | aksiyon güvenliği CPE+manuel disipline dayalı | NO | NO | BR-08/09 gate | DBP-04 |
| GAP-06 | Vaat/sulh akışı yok | BUSINESS CAPABILITY GAP | MEDIUM | VS-05/06 sistem dışı yürüyor | NO | NO | hayır (Blueprint sırası) | DBP-08 (+DBP-04 LG-08) |
| GAP-07 | Feature/NBA/AI katmanı yok | INTENTIONALLY DEFERRED TARGET | LOW | bilinçli (foundation order) | NO | NO | hayır | DBP-08 |
| GAP-08 | Tereke/mirasçı/birleşme modeli yok | DOMAIN DESIGN DECISION | HIGH | ölüm/birleşme vakaları manuel | NO | **CONDITIONAL** — ilgili aggregate satırları `OPEN (BR-03/04/05)` bırakılabiliyorsa bloklamaz | BR-03/04/05 + LEGAL-SIGN-OFF | DBP-04/06/07 |
| GAP-09 | UNRESOLVED takip türleri + tatil/iş günü dışarıda | INTENTIONALLY DEFERRED TARGET (hukuki kapsam sınırı) | MEDIUM | bu türler legacy fallback'te (bilinçli fail-safe) | NO | NO | EVET (kural doğrulama) | ayrı WS |
| GAP-10 | Skor consumer switch yarım (`Case.riskScore` canlı) | TECHNICAL DEBT | MEDIUM | çift skor kaynağı görünürlükte | NO | NO | MS/OD-05 | Scoring Phase 3 (TR-05) |
| GAP-11 | Müvekkil görünürlük/self-service sınırı kararsız | DOMAIN DESIGN DECISION + CROSS-DOMAIN | MEDIUM | PS-03 tasarımı kilitli | NO | NO | MS/OD-10/11 | DBP-09/10 |
| GAP-12 | Müdürlük/UYAP idari teyit akışı yok | BUSINESS CAPABILITY GAP | MEDIUM | idari teyit sistem dışı | NO | NO | workstream | deferred WS |
| GAP-13 | PR-EA-5/6 (NOT NULL + cleanup) yapılmadı | TECHNICAL DEBT + AUTHORIZATION PENDING | MEDIUM | şema seviyesi zorunluluk yok (guarded write-path telafisi CANLI) | NO | NO | EVET | MPB-028(c) (TR-07) |
| GAP-14 | Geçmiş veri backfill'i yok (PR-6) | DATA MIGRATION/BACKFILL + AUTHORIZATION PENDING | MEDIUM | tarihsel kayıtlar legacy semantikte | NO | NO | EVET | MPB-028(a) PR-6 (TR-08) |
| GAP-15 | FND-09..13 taze doğrulanmadı | VERIFICATION GAP | MEDIUM | bilinmiyor | NO | **CONDITIONAL** — audit/event/evidence ayrım satırları `OPEN — VERIFICATION REQUIRED` işaretlenebiliyorsa bloklamaz (kanıt DBP-05'te üretilir) | hayır | DBP-05/10 girdisi |
| GAP-16 | Client approval boundary — kayıt yüzeyi; bağımsız Client Domain-Law artifact'ı NOT PRESENT (boundary source: SYS-GOV-015) | CROSS-DOMAIN DEPENDENCY + DOMAIN DESIGN DECISION | MEDIUM | onay fact'i yapılandırılmamış | NO | **CONDITIONAL** — onay-fact owner-BC satırı `OPEN (ODR+EDD)` bırakılabiliyorsa bloklamaz | EVET | DBP-09/10 + CLIENT/OFFICE governance |

---

## 12. Owner Approval Record ve Açık Owner Kararları

**Onay kaydı (2026-07-15, chat-only owner kararı; bu belge kaydın repo taşıyıcısıdır):**

```text
APPROVE DBP-02 R0.2.2 BUSINESS ARCHITECTURE TAXONOMY
[A] Business Capability Taxonomy           APPROVED
[B] Value Stream Taxonomy                  APPROVED
[C] Enabling Capability Taxonomy           APPROVED (FROZEN)
[D] Product Surface Catalog                APPROVED — NON-AUTHORITATIVE
[E] Actor Classification                   APPROVED (FROZEN)
[F] Evidence-backed Decision Rights        APPROVED (yalnız CANONICALLY DEFINED bileşenler)
[G] Provisional Decision Rights            NOT APPROVED — açık karar kaydı olarak kalır
Kapanış-adayı kuralı                       OWNER-APPROVED PROPOSED L1 BUSINESS RULE
```

**Revizyon geçmişi (özet):** R0.1 ilk taslak → R0.2 katman ayrımı + statü eksenleri +
solution-neutral adlar → R0.2.1 semantic-ownership normalizasyonu + XC-01 + CAP-14 bölünmesi +
receipt/kapanış ve vaat semantiği → R0.2.2 CAP-16A/B kanıt ayrıştırması + CAP-09 ODR +
kural statü ayrımı + 13B netleştirmesi + blocker normalizasyonu. Ara revizyon metinleri
görev sohbetindedir; bağlayıcı olan bu konsolide belgedir.

**Açık owner kararları (bu belge hiçbirini vermez/kapatmaz):** MS/OD-04 · MS/OD-05 ·
MS/OD-06/13 · MS/OD-07 · MS/OD-08/09 · MS/OD-10/11 · MS/OD-12 · MPB-028(a) PR-6 ve
PR-EA-5/6 yetkileri · karar matrisi #1/3/4/7/8/11 rol atamaları · #5 indirim yetkisi ·
#6 iç review politikası · #9 auto-link etkinleştirme · #10 client-approval kayıt yüzeyi ·
GAP-16 sınır kararı. [G] kapsamındaki tüm ODR/EDD bileşenleri açık kayıttır.

---

## 13. DBP-03 Sözleşmesi (Charter §9: capability→BC eşlemesi)

CAP-01→BC 1 · CAP-02→BC 2 · CAP-03/04→BC 3 · CAP-05→BC 4 · CAP-06/07→BC 5 · CAP-08/09→BC 6 ·
CAP-10→BC 6/13 · CAP-11→BC 3/13 (+Case) · CAP-12/13→BC 9 · CAP-14A/B→BC 11/12/14 ·
CAP-16A/16B→BC 8 · CC-01→BC 7 (REUSE) · XC-01→CLIENT (dış) · EC-*→yatay · PS-*→BC 16/17 ·
TR-01→BC 10. Bu eşleme yalnız yönlendirmedir; BC sınır tasarımı, aggregate ownership ve SoT
register'ı DBP-03'ün işidir. DBP-03 exit'inde GAP-03/04 YES-blocker, GAP-02/08/15/16
CONDITIONAL-blocker kayıtları geçerlidir (§11).

## GOVERNANCE DOCUMENT SELF-CHECK

```text
- Onaylı taksonomi birebir korundu (R0.2.2):        YES
- ODR/EDD/PROPOSED/NOT AUTHORIZED/CONDITIONAL
  kayıtları çözülmüş gibi gösterilmedi:             YES (tümü açık işaretli)
- Yeni owner kararı/mimari üretildi:                NO
- SHARED semantic-owner değeri kullanıldı:          NO
- CAP-16B EVD formatı (VERIFIED + REALIZATION
  EXISTENCE: ABSENT):                               YES
- Kimlikler DBP-12'ye kadar PROPOSED:               YES
- IMPLEMENTATION AUTHORITY: NONE korundu:           YES
- Orphan referans:                                  NO (tüm path'ler main'de mevcut)
```
