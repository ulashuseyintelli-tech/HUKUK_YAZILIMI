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
