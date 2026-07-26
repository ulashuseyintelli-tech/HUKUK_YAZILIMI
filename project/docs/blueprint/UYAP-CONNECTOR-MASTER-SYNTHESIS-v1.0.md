# UYAP Connector Master Synthesis v1.0

```text
Belge yolu        : project/docs/blueprint/UYAP-CONNECTOR-MASTER-SYNTHESIS-v1.0.md
Durum             : CANONICAL — UYAP-MASTER-SYNTHESIS-01-GOV (2026-07-21)
Fonksiyon         : Merkezi UYAP Anayasası (connector-wide constitutional boundary)
Kaynak            : UYAP-MASTER-SYNTHESIS-01 GO-ANALYZE (owner-corrected, owner-accepted)
Implementation Authority : NONE
Real Transport    : 0
UYAP Cutover      : HARD HOLD
```

Bu belge, `DEBTOR-UYAP-CONNECTOR-CHARTER-v1.0.md`'yi (mevcut §1-15, tüm kapanmış birimler) **reopen etmez veya değiştirmez** — Charter, connector'ın kronolojik kapanış kaydı olarak kalır. Bu belge onun **üstünde**, connector-geneli kalıcı anayasal kurallar için tek merkezi kaynaktır.

## 1. Program Yapısı

```text
PARENT PROGRAM         : BORÇLU PLATFORMU
ALT PROGRAM / MODÜL 6  : UYAP CONNECTOR
CORE DEBTOR BOUNDED CONTEXT : NO
INTEGRATION RELATION   : Borçlu/case verisi UYAP'a bu connector sınırından geçer
```

## 2. Merkezi Anayasal İlkeler

```text
tenant isolation                                    · authenticated actor
lawyer / operator authority separation              · POA and CPE revalidation
credential non-sharing                              · truthful state representation
attempt lineage                                     · evidence immutability
idempotency                                         · outcome-unknown safety
no blind retry                                      · no real-provider claim without receipt
no legal-effect claim without authoritative evidence · default-disabled real transport
kill switch                                         · controlled cutover
rollback
```

## 3. Merkezi Connector Sahipliği (vs Modüllerin Sahip Olmadığı Doğrular)

**Connector owns:** transport protocol · provider adapter · authentication mechanism · credential custody · signing orchestration · request/response envelope · attempt lifecycle · provider-state normalization · retry eligibility · idempotency · outcome-unknown handling · evidence standard · connector-sınırında tenant isolation · simulator · shadow mode · cutover/rollback · external package provenance.

**Connector does not own** (yeniden hesaplamaz veya değiştirmez): Office hierarchy truth · Lawyer professional identity truth · Client legal identity truth · POA business ownership · Debtor identity/legal-role truth · Receivable/calculation truth · Collection/allocation truth · Case lifecycle business truth.

## 4. Beş Modül Sınır Matrisi (Dar Adapter Kontratları)

```text
OFFICE / LAWYER  → sağlar: actor, lawyer identity, office authority, approval result
CLIENT           → sağlar: legal principal, POA state, instruction/representation context
DEBTOR           → sağlar: identity, legal role, address/party snapshot
RECEIVABLE       → sağlar: canonical claim/calculation snapshot
COLLECTION       → sağlar: receipt, allocation, reversal, reconciliation snapshot
UYAP CONNECTOR   → owns: validation, translation, serialization, signing orchestration,
                   transport, provider result, evidence/status projection
```

Her modül belgesi yalnız şunu içerecektir: sağlanan canonical veri · kabul edilen connector sonucu · yetki devri · hata/mutabakat devri. **Merkezi UYAP kuralları modül belgelerine kopyalanmaz.**

## 5. Aktör/Yetki Matrisi (İşlem Ailesi × Yetki)

```text
                          domain owner  final approver     CPE      POA      e-imza     otomatik/manuel
dosya/tebligat/MTS sorgu   UYAP          n/a                yok      yok      yok        otomatik (salt-okuma)
takip talebi/ödeme emri     UYAP          BELİRLENMEMİŞ      var(*)   koşullu  yok(stub)  manuel
haciz talebi                UYAP          BELİRLENMEMİŞ      var(**)  koşullu  yok(stub)  manuel
evrak gönderme               UYAP          BELİRLENMEMİŞ      YOK      koşullu  yok(stub)  manuel
dava/şikâyet                 UYAP          BELİRLENMEMİŞ      YOK      koşullu  yok(stub)  manuel
retry                        UYAP          n/a (DEVRE DIŞI)   n/a      n/a      n/a        DEVRE DIŞI (503)
status reconciliation         UYAP          n/a                yok      yok      yok        NOT IMPLEMENTED
provider receipt import       UYAP          n/a                n/a      n/a      n/a        NOT IMPLEMENTED
```
(\*) controller-seviyesi `@CpeRequired(UYAP_SEND)` yalnız `xml/submit`'te; `test/payment-order` yalnız service-seviyesi. (\*\*) backstop'lu — bkz §7.3.

**Lawyer↔JWT kimlik köprüsü bugün YOK** — JWT `role` (ADMIN/USER/VIEWER) meslekî kimlik değildir. "Final approver" (partner/manager/super-admin/authorized-lawyer) daha önce owner tarafından bir **şirket-içi yetki politikası** olarak kaydedilmiştir (UYAP-RETRY-CONTAIN-01 disposition); bu, resmî UYAP rol listesiyle karıştırılmamalıdır ve bu belgeyle YENİDEN TEYİT EDİLMEZ, yalnız hatırlatılır.

## 6. Mevcut Kod Gerçeği (Bu Analizde Doğrulandı)

```text
REAL TRANSPORT                    : 0
checkConnection                   : hardcoded true / OPEN (TRANSPORT-RISK-01)
verifyUserEsignature              : dead always-true stub, repo-genelinde SIFIR çağıran / OPEN
official/* (6 dosya)              : test-reachable, hiçbir route/controller/module import ETMİYOR
retry-failed                      : 503 hard-disabled (UYAP-RETRY-CONTAIN-01)
history                           : 503 hard-disabled (CLIENT-SEC-H2A)
stats / status                    : tenant-scoped (SEC-XTEN-UYAP-STATS-01)
lawsuit (criminal/civil) / document CPE : gate YOK (ne controller ne service) — OPEN
POA (sendPaymentOrder/pushHacizRequest) : MEVCUT ama koşullu (skipPoaCheck+kimlik+tenantId
                                    hepsi doluyken çalışır)
haciz CPE (service-seviyesi)      : controller-seviyesi @CpeRequired(TRIGGER_HACIZ) backstop'lu
                                    (hard DI, @Optional değil); service-seviyesi engine-absent
                                    dalı sessizce atlar — bugün yalnız controller üzerinden
                                    çağrıldığı için pratik etki YOK
top-level evkNo alanı              : TÜM dosyada ölü — hiçbir metot gerçek değer atamaz
```

### 6.1 Yeni Teknik Bulguların Sınıflandırılması (kesinleşmiş, owner-korumalı)

```text
HACİZ SCOPE-RESOLVER / DTO assetId ŞEKLİ
  SINIF        : STATIC MISMATCH SIGNAL
  RUNTIME DEFECT: NOT CONFIRMED
  STATUS       : GO-VERIFY REQUIRED
  Gözlem       : ScopeResolvers.fromBody req.body.assetId'yi top-level okur;
                 HacizRequest.targetDetails.assetId iç içedir. Kod-şekli gözlemi;
                 runtime doğrulanmamıştır.

İKİ FARKLI DEBTOR-ROLE MAPPER (uyap-xml.service.ts'in 10-kodlu mapDebtorRoleToUyapKod'u
  vs uyap-export/uyap-case-mapper.service.ts'in 6-değere-çöken mapDebtorRole'ü)
  SINIF        : DUAL IMPLEMENTATION / SEMANTIC DRIFT RISK
  DIRECT RUNTIME CONTRADICTION : NOT YET PROVEN
  STATUS       : BOUNDARY / USAGE VERIFICATION REQUIRED

UNMOUNTED FRONTEND COMPONENTS (UyapStatusPanel dahil 5 component) / lib/api/uyap.ts (uyapApi,
  sıfır importer, ayrıca yanlış route şekilleri)
  SINIF        : MAINTENANCE / UX RESIDUAL
  STATUS       : NOT A CONSTITUTION BLOCKER

CI-KAPSAM-DIŞI UYAP SPEC'LERİ — exact 3 dosya, ci.yml'de hiçbir test -f / --testPathPattern
  içinde YOK (18 uyap spec'inden 15'i kapsanıyor):
  - project/apps/api/src/modules/uyap/__tests__/haciz-decision-audit.spec.ts
  - project/apps/api/src/modules/uyap/__tests__/numeric-interest-projection.adapter.spec.ts
  - project/apps/api/src/modules/uyap/__tests__/uyap-xml.numeric-interest-projection.spec.ts
  SINIF        : CI REGRESYON KÖRLÜĞÜ
  STATUS       : VERIFICATION REQUIRED (dar allowlist step eklenmesi gerekir, implementasyon
                 bu görev tarafından yapılmaz)
```

## 7. State (Hukukî Durum Merdiveni) Constitution

Bağlayıcı eşitsizlikler: `LOCAL SUCCESS ≠ DISPATCHED ≠ PROVIDER RECEIVED ≠ PROVIDER ACCEPTED ≠ JUDICIAL ACCEPTANCE ≠ LEGAL EFFECT CONFIRMED`.

Mevcut model (`PENDING|SENT(kullanılmıyor)|SUCCESS|FAILED|RETRY`) bu ayrımların hiçbirini temsil etmez. **Analysis candidate** (schema/migration kararı ÜRETİLMEZ):
```text
DRAFT → LOCAL_VALIDATED → APPROVAL_REQUIRED → APPROVED → SIGNATURE_REQUIRED → SIGNED →
TRANSPORT_NOT_STARTED → TRANSPORT_STARTED → PROVIDER_RECEIVED → PROVIDER_ACCEPTED/REJECTED →
JUDICIAL_REVIEW_PENDING → LEGAL_EFFECT_CONFIRMED → OUTCOME_UNKNOWN → RETRY_BLOCKED →
MANUAL_REVIEW_REQUIRED
```

## 8. Evidence Constitution

Minimum aday alan seti: `operationId · attemptId · parentAttemptId · tenantId · caseId · domainCommandId · actorUserId · lawyerId · approverId · signatureCertificateReference · payloadHash · canonicalSnapshotHash · serializerVersion · schemaVersion · adapterVersion · requestTime · transportStartTime · providerReceipt · providerResponseHash · providerStatus · legalEffectStatus · errorClassification · retryEligibility · outcomeUnknown · manualReviewDecision · retentionClass · accessClass`.

**Girmemesi gereken:** private key · PIN · raw credential · password · session cookie · full signing secret · unnecessary personal data. Mevcut `logRequest`/`logResponse` bunları yazmaz (doğrulandı); `queryDebtorAssets`'in `requestData`'sı maskesiz `debtorIdentityNo` taşır — secret değil ama kişisel veri, EVIDENCE-01 kapsamında ayrıca ele alınmalıdır.

## 9. KVKK Saklama/İmha — Düzeltilmiş Kural

**Canonicalize EDİLMEYEN ifade:** ~~"Tüm UYAP evidence 10 yıl saklanmalıdır."~~ Bu, mevzuatın **genel bir kuralı değil, belirli koşullara bağlı bir olasılığıdır**.

**Doğru anayasal kural:**
```text
RETENTION PERIOD : data-category / purpose / legal-basis'e ÖZGÜ
DETERMINED BY    : yürürlükteki mevzuat · zamanaşımı süreleri · meslekî sorumluluk ve
                   delil gerekliliği · devam eden dava/icra süreci · veri minimizasyonu
                   ve orantılılık ilkesi
PERIODIC DESTRUCTION : işleme şartları ortadan kalktıktan sonra ilk periyodik imha
                   döngüsünde; azami döngü aralığı 6 ay
10 YIL           : yalnız belirli hukukî/delil kategorileri için MÜMKÜN (Borçlar Kanunu
                   genel zamanaşımı, KVKK meşru-menfaat istisnası) — EVRENSEL BİR UYAP
                   KURALI DEĞİLDİR
```
Ayrı bir `UYAP-EVIDENCE-RETENTION-MATRIX`, gelecekte `EVIDENCE-01` kapsamında, veri-kategorisi bazında hazırlanacaktır. Birincil kaynak: kvkk.gov.tr/Icerik/5387 (KVKK Kişisel Veri Saklama ve İmha Politikası), VERIFIED 2026-07-21.

## 10. Credential Constitution

```text
Adaylar: per-lawyer nitelikli sertifika · operator-present signing · remote signing ·
         HSM-backed custody · signed-payload intake · draft-only mode

PER-LAWYER MODEL     : OWNER ARCHITECTURAL RECOMMENDATION — NOT YET RATIFIED —
                        NOT A VERIFIED UYAP TECHNICAL REQUIREMENT
SHARED CREDENTIAL     : HIGH non-repudiation/custody riski — NOT SELECTED
REMOTE SIGNING/HSM/MOBİL İMZA : EXTERNAL AUTHORITY REQUIRED (genel BTK/KamuSM mevzuatı VAR,
                        UYAP-özel teknik gereklilik DOĞRULANAMADI)
CURRENT MODE          : NO-SIGNATURE / DRAFT / LOCAL SIMULATION
```
Portal kullanım şartları (m.4/m.9, ikincil kaynak) system-to-system connector authority ÜRETMEZ. 5070 sayılı Kanun m.6 (imza-oluşturma-verisi üçüncü kişilerce elde edilemez/kullanılamaz) per-lawyer/HSM-custody modellerini destekler yönde bir hukukî sinyaldir, kesin bir zorunluluk hükmü olarak SUNULMAZ.

## 11. Transport Constitution

```text
domain command → connector application service → actor/authority verification →
domain snapshot validation → official translation/serializer → signing orchestration →
transport port → provider adapter → response normalization → evidence writer →
status projection
```

```text
INSTITUTIONAL WEB SERVICE (BİGM "Kurumsal UYAP Web Servisleri") EXISTENCE : VERIFIED (genel,
                        ikincil kaynak)
LAW-OFFICE WRITE TRANSPORT KULLANILABİLİRLİĞİ                  : UNVERIFIED
TRANSACTION TYPES / ENDPOINTS                                  : UNVERIFIED
AUTHENTICATION / SIGNATURE SPECIFICATION                        : PARTIAL / MISSING
TARGET TRANSPORT SEÇİMİ                                         : NOT AUTHORIZED
STATUS                                                          : EXTERNAL AUTHORITY REQUIRED
```
`browser automation`/`screen scraping`/`session-cookie replay` hedef mimari DEĞİLDİR (repo'da bu yaklaşıma dair hiçbir kod yok, doğrulandı).

## 12. Retry Constitution

```text
OUTCOME_UNKNOWN → BLIND RETRY PROHIBITED → STATUS QUERY FIRST → AUTHORIZED MANUAL REVIEW
```
(Owner tarafından zaten ratifiye edilmiştir, OD-UYAP-07 — bkz §16.) Retry'nin yeniden açılması için minimum koşullar: tenant scope · actor/lawyer authority · POA/CPE revalidation · atomic attempt claim · attempt lineage · idempotency key · provider outcome classification · status query · outcome-unknown handling · evidence · truthful API response. `UYAP-RETRY-CONTAIN-01` retry capability SAĞLAMAZ; yalnız aktif exposure'ı kapatmıştır.

## 13. Simulator Constitution

```text
LOCAL ONLY · DEFAULT DISABLED · NO REAL CREDENTIAL · NO EXTERNAL NETWORK · DETERMINISTIC ·
NO LEGAL EFFECT · NO PROVIDER EVIDENCE · NO CUTOVER AUTHORITY
```
Zorunlu senaryolar: provider accepted/rejected · timeout before send · outcome unknown after send · duplicate command · retry exhaustion · signature unavailable · schema mismatch · status polling · manual review.

## 14. Resmî Kaynak Sınıfları ve Matris

```text
TIER A (binding candidate) : birincil mevzuat / resmî teknik sözleşme
TIER B (context only)      : resmî genel bilgi
TIER C (not binding)       : ikincil kaynak / arama özeti / satıcı içeriği
```

| Kaynak | Sınıf | Durum | Tarih |
|---|---|---|---|
| 5070 sayılı Elektronik İmza Kanunu m.5-6 | A | VERIFIED | 2026-07-21 |
| 1136 sayılı Avukatlık Kanunu m.46 | A | ikincil-çapraz-doğrulandı, birincil PDF indirilmedi | 2026-07-21 |
| HMK m.76 | C | doğrulama önerilir | 2026-07-21 |
| KVKK Kararı 2021/511-512-513 | A | doğrudan fetch ile VERIFIED | 2026-07-21 |
| KVKK Saklama/İmha Politikası | A | VERIFIED | 2026-07-21 |
| UYAP Avukat Portal m.4/m.9 | C | birincil sözleşme metni erişilemedi — **UNVERIFIED, NOT A BINDING CANONICAL RULE** | 2026-07-21 |
| BTK e-imza düzenleyici otorite + sertifika sağlayıcıları | A | VERIFIED | 2026-07-21 |
| BİGM sistemler-arası entegrasyon (genel) | B | genel-düzey context | 2026-07-21 |
| UYAP çağrı merkezi (444 89 27) | B | **GENERAL SUPPORT CHANNEL — entegrasyon SLA'sı veya teknik escalation sözleşmesi DEĞİLDİR** | 2026-07-21 |
| Provider hata/idempotency/status-query/receipt semantiği | — | ARANDI, BULUNAMADI — **EXTERNAL AUTHORITY REQUIRED** | 2026-07-21 |
| Remote signing resmî desteği | — | **EXTERNAL AUTHORITY REQUIRED** | 2026-07-21 |

## 15. External Dependency Register

```text
Contract A resmî artefaktlar         : AVAILABLE / PARTIAL
Contract B (takipTalepleri)          : MISSING
Write-endpoint katalogu               : MISSING
Test ortamı                           : MISSING / EXTERNAL
Authentication specification          : MISSING / PARTIAL
Signature specification               : MISSING / PARTIAL
Provider error catalogue              : MISSING
Idempotency specification             : MISSING
Status-query specification            : MISSING
Receipt/work-order semantiği          : MISSING
Rate limits                           : MISSING
Maintenance windows                   : MISSING
Integration SLA / escalation          : MISSING
```
Bu eksikler **cutover blocker**'dır.

## 16. Owner Decision Register

**Ratifiye edilmiş (bu görevle, önceki turlarda owner tarafından):**
```text
OD-UYAP-01 — PROGRAM HOME: RATIFIED. Parent=BORÇLU PLATFORMU, Alt Program/Modül 6=UYAP
  CONNECTOR, core debtor bounded context DEĞİL.
OD-UYAP-02 — DOCUMENT ARCHITECTURE: RATIFIED. Merkezi tek Anayasa + dar modül/adapter
  kontratları; rule duplication PROHIBITED.
OD-UYAP-07 — RETRY SAFETY BASELINE: RATIFIED. OUTCOME_UNKNOWN → blind retry PROHIBITED →
  status query first → authorized manual review.
```

**Bu görevle SEÇİLMEYEN, açık kalan kararlar:**
```text
OD-UYAP-03 Actor/Lawyer identity model
OD-UYAP-04 Credential/signing model
OD-UYAP-05 Evidence/attempt persistence
OD-UYAP-06 Provider state implementation
OD-UYAP-08 Transport channel
OD-UYAP-09 Simulator implementation
OD-UYAP-10 Cutover execution prerequisites
```

## 17. Risk Register

```text
                                              severity  confirmed/unverified  containment        cutover effect
TRANSPORT-RISK-01 (checkConnection true)      LOW       confirmed             CONTAINED (stub)   BLOCKS
TRANSPORT-RISK-05 (status collapse)           MEDIUM    confirmed             CONTAINED          BLOCKS
TRANSPORT-RISK-07 (retry)                     —         confirmed             CONTAINED (Model D) SAFE CONTRACT OPEN
POA conditional bypass                        MEDIUM    confirmed             PARTIAL            BLOCKS
Haciz service-CPE engine-absence gap          LOW       confirmed, backstop'lu CONTAINED (indirect) BLOCKS (direct path)
Lawsuit/document CPE gates absent             MEDIUM    confirmed             UNCONTAINED         BLOCKS
Scope-resolver/DTO assetId mismatch           LOW-MED   UNVERIFIED (static)   n/a                 GO-VERIFY REQUIRED
İki farklı debtor-role mapper                 MEDIUM    confirmed (existence) UNRESOLVED          VERIFICATION REQUIRED
Lawyer↔JWT identity gap                       MEDIUM    confirmed             OPEN                BLOCKS
verifyUserEsignature dead stub                LOW       confirmed             OPEN (unreachable)  n/a
Provider idempotency/status-query             UNKNOWN   unverified            n/a                 BLOCKS
Contract B                                     —         confirmed absent      n/a                 BLOCKS
Real transport                                 —         confirmed absent (0)  n/a                 BLOCKS (beklenen)
```
**Yeni aktif cross-tenant write, credential exposure veya gerçek-network riski bulunmadı; P0/P1 containment yükseltmesi önerilmez.**

## 18. A2Z Roadmap

```text
WAVE 0  Master Synthesis/Constitution — BU BELGE (CLOSED bu PR ile)
WAVE 1  EVIDENCE-01
WAVE 2  CREDENTIAL-CUSTODY-01 + Lawyer↔JWT identity + UYAP-RETRY-AUTH-02
WAVE 3  TRANSPORT-PORT-01 + official adapter contract
WAVE 4  SIMULATOR-01 + contract tests
WAVE 5  Beş modül boundary kontratı
WAVE 6  P04C-SHADOW / observation
WAVE 7  Controlled cutover preparation
WAVE 8  Owner + external authority cutover decision (P05)
```
Her wave ayrı owner GO gerektirir; mevcut canonical ID'ler yok sayılmaz.

### 18.1 Program Crosswalk (UYAP-PROGRAM-BACKBONE-01)

Bu alt-bölüm ADDITIVE'dir; `decision-log.md` `UYAP-PROGRAM-BACKBONE-01` (2026-07-21) kaydıyla AYNEN tescil edilen owner kararı "UYAP CONNECTOR PROGRAM OMURGASI"nın (KARARLAR 1-11) program-planlama görünümünü taşır. KARAR 3 gereği: **F0-F8 ifadeleri yalnız program planlama ve crosswalk görünümüdür; yeni governance, Charter, WAVE veya roadmap kimliği oluşturmaz; kanonik roadmap otoritesi bu belgenin §18 gövdesinde kalır.** Bu alt-bölüm §1-17'yi, §18 wave listesini ve Owner Approval Record'u değiştirmez.

**F0-F8 ↔ WAVE 0-8 / Charter eşleme tablosu** (F4-a/b, F5-a/b/c, F6-a/b ayrımları owner-kabul edilen program omurgasından gelir; içerik çapaları KARARLAR 1-11 ve F0 görev emrinden türetilmiştir; alt-etiket eşlemesi planlama görünümüdür, normatif kimlik oluşturmaz):

| Faz (planlama görünümü) | İçerik çapası (kaynak) | §18 WAVE / Charter karşılığı | Durum (2026-07-21) |
|---|---|---|---|
| F0 | Karar kilidi ve kapsam dondurma: KARARLAR 1-11 kanonik tescili + bu crosswalk (`UYAP-PROGRAM-BACKBONE-01`) | WAVE 0 üzerine governance kilidi (yeni wave DEĞİL) | CLOSED/CANONICAL (bu kayıtla) |
| F1 | `UYAP-MASTER-ANALIZ-02` delta-analiz (KARAR 4/6: capability kataloğu, resmî kaynak/Tier A-B-C, source ledger + source-conflict register, aktör/yetki/vekâlet modeli, UDF/imza yaşam döngüsü, ödeme/harç/tahsilat/mutabakat, provider state/UNKNOWN_OUTCOME, A0-A5 ANALYSIS_CANDIDATE, observability/incident/cutover gereksinimleri, iki katmanlı tehdit modeli); OD-UYAP-03..10 karar girdilerini üretir | Tek wave'e eşlenmez — WAVE 1-5 içeriklerinin analiz öncülüdür; repo mutation YOK | GO-ANALYZE (Ultra) AUTHORIZED / NOT STARTED |
| F2 | UYAP-CONST-* madde içeriklerinin yazılması ve ratifikasyonu (kimlik uzayı kuralları KARAR 2) + convergence-matrix ratifikasyonu + registry/A0-A5 statü kararları | Governance katmanı — kanonik wave karşılığı YOK | NOT STARTED (F1 çıktısına bağlı) |
| F3 | Bu kayıtla SABİTLENMEZ — tanımı ve eşlemesi owner faz atamasında netleşir | — | UNDEFINED IN THIS RECORD |
| F4-a | `EVIDENCE-01` analiz hattı (KARAR 9) | WAVE 1 | GO-ANALYZE AUTHORIZED / NOT STARTED |
| F4-b | Evidence hattının devam birimi; tanımı ve yetkisi bu kayıtla VERİLMEZ | WAVE 1 devamı | NOT DEFINED / NOT AUTHORIZED |
| F5-a | Capability registry (KARAR 10'un bloklamadığı çalışma; icrabot kalıcı archive/simulator disposition kararı F5 capability değerlendirmesinde — KARAR 8) | Doğrudan tek wave karşılığı YOK (WAVE 2-5 kesişimi) | NOT STARTED |
| F5-b | Simulator (KARAR 10'un bloklamadığı çalışma) | WAVE 4 (`SIMULATOR-01` + contract tests) | NOT STARTED |
| F5-c | Resmî provider adapter (KARAR 10) | WAVE 3 (`TRANSPORT-PORT-01` + official adapter contract) | NOT STARTED / P04B-EXT ÖNKOŞUL |
| F6-a | Offline shadow (KARAR 10'un bloklamadığı çalışma) | WAVE 6 (`P04C-SHADOW`/observation) offline kolu | NOT STARTED |
| F6-b | Provider-linked shadow (KARAR 10) | WAVE 6 provider-linked kolu | NOT STARTED / P04B-EXT ÖNKOŞUL |
| F7 | Controlled cutover → insan kontrollü steady state; birçok capability için kalıcı son durum olabilir (KARAR 11) | WAVE 7 + WAVE 8 (P05 owner + external authority kararı) | NOT AUTHORIZED / P04B-EXT ÖNKOŞUL / CUTOVER HARD HOLD |
| F8 | Capability bazlı otonomi (A5) — KOŞULLU UZANTI, kanonik wave DEĞİL; ayrı eligibility + resmî izin + owner kararı gerektirir (KARAR 5/11) | §18 wave karşılığı YOK | CONDITIONAL / NOT AUTHORIZED |

**Birim-bazlı convergence ilkesi (KARAR 4):** Eşleme faz-bazlı toptan değil, çalışma birimi bazındadır. Her yeni birim mevcut kanonik ID'lere tek tek yakınsar: ya mevcut bir canonical workstream'i REUSE eder, ya sentezin karşılamadığı/eksik bıraktığı/çelişkili/güncelliği doğrulanmamış alanda DELTA olarak tanımlanır, ya da hiçbir mevcut kaydın karşılamadığı GAP-NEW birimidir. Tamamlanmış workstream'ler reopen edilmez; mevcut canonical ID'ler yok sayılmaz (§18 kuralı aynen korunur).

**Convergence-matrix alan şeması — DRAFT (NORMATİF DEĞİL; ratifikasyon F2'de):**

```text
unit_id · faz-görünümü (F*) · §18 wave · mevcut canonical ID (varsa) ·
convergence tipi (REUSE / DELTA / GAP-NEW) · owner gate · status · decision basis
```

Alan adları ve statü değerleri ANALYSIS_CANDIDATE statüsündedir; F2 ratifikasyonuna kadar hiçbir registry durum adı, metrik sınıfı veya A0-A5 tanımı bu şemayla dondurulmaz.

**P04B-EXT kritik yol notu (KARAR 10):** P04B-EXT ve ilgili dış otorite cevabı YALNIZ F5-c (resmî provider adapter), F6-b (provider-linked shadow) ve F7 (cutover) için bloklayıcı önkoşuldur; capability registry, simulator ve offline shadow çalışmalarını BLOKLAMAZ.

**Yürürlük durumu (2026-07-21):** F1 (`UYAP-MASTER-ANALIZ-02`) ve F4-a (`EVIDENCE-01`) GO-ANALYZE yetkileri tescillidir, ikisi de NOT STARTED; fiilî başlatma owner faz atamasına bağlıdır (tek-faz işletim kuralı; KARAR 9 paralelliği ratifiye eder, otomatik başlatma doğurmaz). DEVAM EDEN HOLD'LAR DEĞİŞMEDİ: IMPLEMENTATION AUTHORITY NONE · REAL TRANSPORT 0 · UYAP CUTOVER HARD HOLD · PRODUCTION ADAPTER NOT AUTHORIZED · PORTAL AUTOMATION PROHIBITED · CREDENTIAL/PIN/PRIVATE-KEY CUSTODY PROHIBITED.

## 19. Constitution v1.1 Ratification (UYAP-CONSTITUTION-V11-01)

Bu bölüm ADDITIVE'dir; §1-18.1 substantive metni reopen edilmez veya değiştirilmez. `decision-log.md` `UYAP-CONSTITUTION-V11-01` (2026-07-21) kaydıyla F1 (UYAP-MASTER-ANALIZ-02 R1+R2) ve F4-a (EVIDENCE-01 R1) owner-accepted analiz temeli, owner-ratified normatif hükümlere (D1-D12) dönüştürülmüştür.

**Constitution v1.1 = bu belge (kanonik kök, DEĞİŞMEZ) + tek subordinate normatif annex.** Yeni annex:

```text
UYAP-CONNECTOR-NORMATIVE-ANNEX-v1.0.md
  Durum   : CANONICAL SUBORDINATE ANNEX (bağımsız anayasa DEĞİL)
  Otorite : yalnız bu synthesis kökü tarafından yetkilendirilir
  İçerik  : UYAP-CONST-001..010 (RATIFIED)
  Kural   : modül belgeleri bu kuralları KOPYALAYAMAZ; çelişkide synthesis kök + owner karar kaydı üstündür
```

**Ratifiye normatif maddeler (tam metin annex'te):**
```text
UYAP-CONST-001 — Official Channel and Authority          UYAP-CONST-006 — Idempotency, Retry and OUTCOME_UNKNOWN
UYAP-CONST-002 — Tenant, Actor, Lawyer and Repr. Authority UYAP-CONST-007 — PII Minimization, Evidence and Retention
UYAP-CONST-003 — Credential and Signature Custody         UYAP-CONST-008 — Simulator and Shadow Truthfulness
UYAP-CONST-004 — Operation, Attempt and Evidence Identity UYAP-CONST-009 — Metrics, Incident and Cutover Gates
UYAP-CONST-005 — Three-State Constitution and Non-Equations UYAP-CONST-010 — Capability Autonomy and A0-A5
```

**Owner kararları (D1-D12) özet pointer** (bağlayıcı metin `decision-log.md` `UYAP-CONSTITUTION-V11-01`):
D1 document architecture (tek annex) · D2 evidence target (`UyapOperation` 1→N `UyapAttempt`, TARGET-only) · D3 identity model (operationId/attemptId/idempotencyKey server-controlled; clientRequestId correlation-only) · D4 three-state constitution + non-equations · D5 actor/lawyer/authority · D6 credential/signature · D7 UNKNOWN_OUTCOME/retry · D8 PII/evidence minimization + retention · D9 autonomy A0-A5 · D10 metrics 3-sınıf · D11 simulator/shadow/cutover · D12 F3 tanımı.

**Faz durumu (bu ratifikasyonla):** F2 `UYAP-CONSTITUTION-V11-01` CLOSED/CANONICAL · **F3 (MODULE-BASED UYAP BOUNDARY CONTRACTS): SELECTED / NOT STARTED** (F2 handoff bağımsız doğrulanmadan başlatılmaz; ≈ WAVE 5 governance birimi) · **F4-b: NOT AUTHORIZED / NOT STARTED.** Schema/migration/runtime enum/Prisma model bu ratifikasyonla ÜRETİLMEZ; TARGET mimari kararları implementation authority doğurmaz.

**DEVAM EDEN HOLD'LAR DEĞİŞMEDİ:** IMPLEMENTATION AUTHORITY NONE · REAL TRANSPORT 0 · UYAP CUTOVER HARD HOLD · PRODUCTION ADAPTER NOT AUTHORIZED · PORTAL AUTOMATION PROHIBITED · CREDENTIAL/PIN/PRIVATE-KEY CUSTODY PROHIBITED. `OD-UYAP-08` EXTERNAL-AUTHORITY-BLOCKED · `OD-UYAP-10` HARD HOLD.

## 20. Module Boundary Contracts (UYAP-MODULE-BOUNDARY-CONTRACTS-01)

Bu bölüm ADDITIVE'dir; §1-19 substantive metni reopen edilmez veya değiştirilmez. F2/D12 gereği ratifiye edilen **F3 (MODULE-BASED UYAP BOUNDARY CONTRACTS)** bir canonical contract pack olarak canonicalize edilmiştir:

```text
project/docs/blueprint/UYAP-CONNECTOR-MODULE-BOUNDARY-CONTRACTS-v1.0.md
  Durum   : CANONICAL CONTRACT PACK (subordinate normative annex DEĞİL, yeni constitution DEĞİL)
  İşlev   : mevcut anayasayı (bu §19 + normatif annex UYAP-CONST-001..010) CONSUME eder
  İçerik  : 5 dar modül boundary kontratı + shared envelope + cross-module matrix
```

**Ratifiye kontratlar (tam 20-alan şema + BOUNDARIES/PROHIBITED contract pack'te):**
```text
UYAP-BC-OFFICE-001      — Office / Avukat-Personel     (actor/lawyer/approval/signature authority)
UYAP-BC-CLIENT-001      — Client / Müvekkil            (represented-party/POA/representation scope)
UYAP-BC-DEBTOR-001      — Debtor / Borçlu              (identity/role/address/asset + ServiceOccurrence precision)
UYAP-BC-RECEIVABLE-001  — Receivable / Alacak          (canonical snapshot/hash/amount, ADR-014 calc authority sınırı)
UYAP-BC-COLLECTION-001  — Collection / Tahsilat        (receipt lifecycle owner, provider makbuz correlation)
```

**Kurallar:** merkezi UYAP kuralları modül kontratlarına KOPYALANMAZ (yalnız referans, OD-UYAP-02); domain ownership DEĞİŞMEZ; connector hiçbir bounded context'in domain owner'ı DEĞİLDİR; her kontrat REUSE/DELTA/GAP-NEW sınıflanır; runtime/schema/migration/transport/credential kararı YOK. ServiceOccurrence (PR #1503) schema foundation olarak REUSE edilir; UYAP result → ServiceOccurrence automatic write YOK, runtime wiring F3 tarafından YETKİLENDİRİLMEZ.

**Faz durumu (bu ratifikasyonla):** F3 `UYAP-MODULE-BOUNDARY-CONTRACTS-01` CLOSED/CANONICAL · **F4-b: NOT AUTHORIZED / NOT STARTED.** HOLD'lar 6/6 DEĞİŞMEDİ; OD-UYAP-08 EXTERNAL-AUTHORITY-BLOCKED · OD-UYAP-10 HARD HOLD.

> **NOT (2026-07-26, `UYAP-AUDIT-GOVERNANCE-CLOSURE-R01`):** Yukarıdaki F4-b hükmü
> **2026-07-21 ratifikasyon anını** yansıtır ve metni DEĞİŞTİRİLMEZ. F4-b evidence zinciri
> (`P05A-R1` → `P05C-P04`) sonraki ayrı named `GO-IMPLEMENT` yetkileriyle yürütülmüştür;
> güncel canonical statü §21'e bağlıdır.

## 21. Program Audit Reconciliation (UYAP-AUDIT-GOVERNANCE-CLOSURE-R01)

Bu bölüm ADDITIVE'dir; §1-20 substantive metni reopen edilmez veya değiştirilmez. UYAP programının
audit sonucu ve geçmiş statü çelişkilerinin append-only uzlaştırması ayrı canonical kayda alınmıştır:

```text
Belge   : project/docs/blueprint/UYAP-PROGRAM-AUDIT-RECONCILIATION-v1.0.md
Durum   : CANONICAL AUDIT RECONCILIATION RECORD (yeni constitution DEĞİL, annex DEĞİL)
Kaynak  : decision-log.md `UYAP-AUDIT-GOVERNANCE-CLOSURE-R01` (2026-07-26)
Kapsam  : canonical verdict · F4-a reconciliation · P05 status/closure tablosu ·
          alias/supersession crosswalk (iki ayrı `P05` namespace) · CI test disposition ·
          historical canary izi · open residual listesi · canonical NEXT zinciri
```

**Canonical verdict:** `FOUNDATION COMPLETE / RUNTIME OBJECTIVE NOT ACHIEVED` — evidence modelleri
IMPLEMENTED (schema live-applied), evidence writer'ları CI-PROVEN + DEFAULT-OFF, runtime canary
NOT SUCCESSFULLY COMPLETED, operation/attempt/link live proof ABSENT.

**Bu bölüm yetki üretmez:** §18 roadmap otoritesi, §19 Constitution v1.1, §20 contract pack ve
`UYAP-CONST-001..010` byte-DEĞİŞMEZ. IMPLEMENTATION AUTHORITY NONE · REAL TRANSPORT 0 ·
UYAP CUTOVER HARD HOLD · PRODUCTION ADAPTER NOT AUTHORIZED · PORTAL AUTOMATION PROHIBITED ·
CREDENTIAL/PIN/PRIVATE-KEY CUSTODY PROHIBITED korunur. **NEXT ELIGIBLE TASK (bu bölüm tarafından
başlatılmaz): `UYAP-CPE-POA-AND-ACTING-LAWYER-AUTHORITY-DESIGN-01` — OWNER AUTHORIZATION REQUIRED.**

## Owner Approval Record

```text
UYAP-MASTER-SYNTHESIS-01-GOV — OWNER GO-DOCS + IF GO-COMPLETE
Kaynak: UYAP-MASTER-SYNTHESIS-01 GO-ANALYZE (owner-corrected, owner-accepted) sonucu.
Canonical home: bu belge (project/docs/blueprint/UYAP-CONNECTOR-MASTER-SYNTHESIS-v1.0.md).
Ratifiye: OD-UYAP-01 (program home), OD-UYAP-02 (document architecture), OD-UYAP-07
(retry safety baseline). OD-UYAP-03/04/05/06/08/09/10 AÇIK, bu belgeyle SEÇİLMEZ.
IMPLEMENTATION AUTHORITY: NONE. UYAP CUTOVER: HARD HOLD.
NEXT ELIGIBLE TASK (bu belge tarafından seçilmez): EVIDENCE-01 — OWNER GO-ANALYZE REQUIRED.
```
