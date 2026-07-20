# UYAP Connector Charter — Bounded Delivery Roadmap (BORÇLU PLATFORMU / Phase 2)

```text
Belge yolu   : project/docs/blueprint/DEBTOR-UYAP-CONNECTOR-CHARTER-v1.0.md
Durum        : CANONICAL BLUEPRINT / GOVERNANCE-ONLY — kuruluş `decision-log.md`
               DBP-P2-UYAP-CONNECTOR-CHARTER-01-GOV kaydı
Sürüm        : v1.0
Rol          : BORÇLU PLATFORMU Phase 2 (UYAP Connector) için TEK canonical delivery
               roadmap'i; mevcut P01-P02B-R2 zincirini KONSOLİDE eder, YENİDEN ANALİZ
               ETMEZ, REOPEN ETMEZ. Implementation authority ÜRETMEZ.
Kimlik uzayı : Bu belge yeni bir invariant/ID uzayı açmaz; DBP-01..12, DEBTOR-GOVERNANCE
               ve mevcut `DBP-P2-UYAP-CONTRACT-A-*` görev kimliklerini REFERANS verir.
Üst otorite  : SYSTEM-CONSTITUTION.md → DEBTOR-GOVERNANCE.md → bu charter (bounded,
               full Domain Law DEĞİLDİR)
```

Bu belge owner tarafından **GO-DOCS + IF GO-COMPLETE** yetkisiyle, `DBP-P2-UYAP-CONNECTOR-MASTER-01` (GO-ANALYZE, owner-accepted) analizinin sonucu olarak canonicalize edilmiştir. **IMPLEMENTATION AUTHORITY: NONE.**

---

## 1. Product Definition

```text
PRODUCT
UYAP CONNECTOR

PRIMARY PURPOSE
Hukuken doğru payload'ın güvenli biçimde UYAP'a taşınması, cevabın normalize
edilmesi ve bütün sürecin denetlenebilir kanıtla saklanması

PAYLOAD GENERATION ALONE
NOT THE FINAL PRODUCT
```

Contract A/B semantik çalışması (DTD, rolTur, ISO-8859-9 encoding, claim-wrapper sınıflandırması) connector'ın **payload-doğruluğu bağımlılığıdır**; bu belgenin veya alt görevlerinin amacı belge/rapor üretmek değil, **çalışan bir UYAP entegrasyonu**dur.

## 2. Bounded-Context Ownership

| Bounded Context | Sahip Olduğu Gerçek |
|---|---|
| Debtor / Case | party, procedural ve case truth |
| ClaimItem / Receivable | claim source ve receivable truth |
| Instrument | instrument identity ve party-chain truth |
| ADR-014 | calculation ve interest authority |
| **UYAP Connector** (bu charter) | contract translation, transport, response normalization ve dispatch evidence |
| Collection | payment ve application truth |

Connector:
```text
HUKUKİ BORÇLULUK ÜRETEMEZ
ClaimItem VEYA Instrument GERÇEĞİNİ YENİDEN SINIFLANDIRAMAZ
faizTipKod VEYA HESAPLAMA POLİTİKASI SEÇEMEZ
UNRESOLVED AUTHORITY'Yİ VARSAYIMLA DOLDURAMAZ
```

Bu sınırlar P02A/P02B/P02B-R2/P03A'nın kendi kod-seviyesi sınırlarıyla (domain→rolID mapping YOK, faizTipKod atanmaz, unresolved role → REJECTED) zaten TUTARLIDIR; bu charter bunları YENİDEN YARATMAZ, konsolide eder.

## 3. Contract Separation

```text
CONTRACT A
exchangeData payload contract

CONTRACT B
separate portal/export/external contract

AUTHORITY TRANSFER BETWEEN A AND B
PROHIBITED WITHOUT EXPLICIT RECONCILIATION
```

Contract A bulguları (6/26 nondeterministic content model, alacakKalemi parent-divergence, ISO-8859-9 encoding kuralları) Contract B'ye otomatik taşınmaz; Contract B kendi bağımsız external-authority sorgusunu, kendi DTD/kod-listesi doğrulamasını gerektirir. Bu charter Contract B'yi AÇMAZ.

## 4. Capability Layers (8 Dilim)

### Slice 1 — Charter and Authority Boundaries

```text
STATUS: PARTIAL / REQUIRES CONSOLIDATION (bu belge ile CONSOLIDATED oluyor)
```
**Purpose:** connector'ın sahibi olduğu/olmadığı gerçekleri, Contract A/B ayrımını, authority gate'lerini tek yerde toplamak. **Existing canonical assets:** P02A provenance (DTD SHA-256 tek yüzey), P02B/P03A role-authority sınırları, P04B-VAL-R1-GOV canonical-claim-boundary, P02B-R2 claim-scope. **Open residuals:** yok (bu charter'ın kendisi bu dilimi kapatır). **Authority owner:** bu charter + SYSTEM-CONSTITUTION/DEBTOR-GOVERNANCE. **Entry:** CONNECTOR-MASTER-01 owner-accepted. **Exit:** bu belgenin merge'i. **Implementation status:** N/A (governance-only dilim).

### Slice 2 — Transport, Authentication, Credential Custody

```text
STATUS: NOT CANONICALIZED / ANALYSIS REQUIRED
```
**Purpose:** connector'ın UYAP'a gerçekten bağlanma biçimini güvenli ve tasarım-seviyesinde tanımlamak. **Existing canonical assets:** yok — bu dilim sıfırdan. **Open residuals:** endpoint abstraction, authentication mekanizması, credential custody, tenant isolation, secret rotation, timeout/retry/backoff, idempotency, replay prevention, circuit-breaker/kill-switch, test/staging/production ayrımı. **Authority owner:** gelecekteki Transport/Auth governance (bu charter'da henüz YOK) + Credential Authority (bkz. §8). **Entry:** bu charter canonical + `TRANSPORT-AUTH-01 GO-ANALYZE`. **Exit:** interface/güvenlik sınırları CANONICAL (gerçek credential/implementasyon HARİÇ). **Implementation status:** NOT STARTED.

**Precision correction (owner-mandated):** `TENANT-SPECIFIC UYAP CREDENTIALS` → **DESIGN ASSUMPTION / REQUIRES AUTHORITY CONFIRMATION**. "Her tenant kesin kendi UYAP hesabına sahiptir" doğrulanmamış bir factual claim olarak KURULMAZ; yalnız makul bir tasarım varsayımı olarak kaydedilir, gerçek confirmasyonu external authority'ye veya owner kararına bağlıdır.

### Slice 3 — Contract A Payload Adapter

```text
STATUS: SUBSTANTIALLY CANONICAL / RESIDUALS OPEN
```
**Purpose:** hukuken/teknik olarak doğru Contract A payload'ının üretimi. **Existing canonical assets (REOPEN EDİLMEZ):** P02A, P02B, P02B-R1, P02B-R2, P03A, P04A-ENC, P04B-VAL-I1, P04B-VAL-R1-GOV — tam liste ve statüleri §5 Canonical Reuse Matrix'te. **Open residuals:** P04B authority response (external), P04D-INSTRUMENT (instrument serialization), P03B (kalan 8 rol), typed wrapper model (Option-E-benzeri discriminated union), official acceptance semantics (hâlâ UNVERIFIED). **Authority owner:** P02B/P02B-R2 (mevcut) + P03B/P04D (gelecek, LDO/OWNER-gated). **Entry:** zaten CANONICAL. **Exit:** P04B authority response + P04D/P03B/typed-wrapper kararları. **Implementation status:** mevcut kısım CLOSED/CANONICAL; residual'lar NOT STARTED.

### Slice 4 — Contract B / Portal Adapter

```text
STATUS: SEPARATE CONTRACT / OPEN
```
**Purpose:** Contract B'nin (takipTalepleri/portal) kendi bağımsız connector-adapter'ı. **Existing canonical assets:** yok (Contract A'dan hiçbir bulgu taşınmadı). **Open residuals:** external-client/portal authority, authentication, request/response contract, Contract A ile ortak/ayrı yönler, bağımsız cutover gereksinimleri — TAMAMI. **Authority owner:** TANIMSIZ, ayrı bir GO-ANALYZE gerekir. **Entry:** ayrı owner kararı. **Exit:** TANIMSIZ. **Implementation status:** NOT STARTED.

### Slice 5 — Request Evidence, Audit, Observability

```text
STATUS: PARTIAL / REQUIRES CONNECTOR-SPECIFIC DESIGN
```
**Purpose:** connector'ın her isteğinin denetlenebilir, immutable kanıtla saklanması. **Existing canonical assets:** doğrudan yok; P04A-ENC'nin kendi encode-evidence'ı (SHA-256/byteLength) transport-öncesi bir emsal. **Open residuals (en az 12 alan):** immutable request identity, payload hash, response hash, attempt number, idempotency key, correlation ID, transport status, normalized failure, PII-safe log, raw payload custody, encrypted evidence, actor/tenant/environment provenance, retention/deletion policy. **Authority owner:** `EVIDENCE-01` (gelecek). **Entry:** bu charter canonical. **Exit:** 12 alanın tam şeması. **Implementation status:** NOT STARTED.

### Slice 6 — Local Simulator / Contract Laboratory

```text
STATUS: FOUNDATION EXISTS
```
**Purpose:** gerçek UYAP ortamı olmadan connector'ı doğrulamak. **Existing canonical assets:** P04B-VAL-I1 (Docker DTD validator image, Alpine 3.22.5 + libxml2-utils 2.13.9-r1), P04A-ENC byte-encoder fixture'ları, P02B/P02B-R2 serializer test-suite'i (66 test). **Open residuals:** synthetic endpoint simulator, deterministic response senaryoları, timeout/retry/malformed-response/auth-failure/duplicate-replay test senaryoları, no-network local test modu. **Authority owner:** `SIMULATOR-01` (gelecek). **Entry:** bu charter canonical + Slice 2/3 iskeleti. **Exit:** tüm senaryo sınıfı simüle edilebilir. **Implementation status:** temel CANONICAL, simulator'ın kendisi NOT STARTED.

### Slice 7 — Shadow Execution

```text
STATUS: P04C-SHADOW / NOT STARTED
```
Mevcut roadmap korunur; **bu charter P04C'yi BAŞLATMAZ.** **Purpose (netleştirme amaçlı, başlatma değil):** shadow input source, no-send guarantee, comparison model, evidence storage, false-positive/negative handling, exit criteria — bunların TANIMI (implementasyonu değil) ilerideki `P04C-SHADOW GO-ANALYZE`'de netleşecektir. **Authority owner:** P04C kendi owner-gate'i. **Implementation status:** NOT STARTED.

### Slice 8 — Controlled Production Cutover

```text
STATUS: P05 / NOT AUTHORIZED
UYAP CUTOVER: HARD HOLD
```
**Purpose:** yetkilendirilmiş canlı geçiş. **Preconditions (hiçbiri bugün karşılanmıyor):** external contract authority, credentials, test environment, accepted payload evidence, replay/idempotency, security review, observability, rollback/kill-switch, incident response, owner final approval. **Authority owner:** P05 final owner approval. **Implementation status:** NOT AUTHORIZED.

## 5. Canonical Reuse Matrix

| TASK | CURRENT STATUS | CONNECTOR SLICE | CLOSED CAPABILITY | OPEN RESIDUAL | REOPEN? | NEXT CONSUMER |
|---|---|---|---|---|---|---|
| P01 | CLOSED/CANONICAL (#1385/#1388) | Slice 3 | Legacy XML truthfulness containment | yok | **NO** | Slice 6 regression baseline |
| P02A | CLOSED/CANONICAL (#1395/#1399) | Slice 3 | Provenance + role-translation skeleton | yok | **NO** | P03A/P02B |
| P02B | CLOSED/CANONICAL (#1403/#1408) | Slice 3 | Deterministik serializer, SERIALIZED_DRAFT/REJECTED | typed wrapper | **NO** | Slice 6, TYPED-WRAPPER (gelecek) |
| P02B-R1 | CLOSED/CANONICAL (#1405) | Slice 3 | ID anchor integrity + ref boundary | yok | **NO** | — |
| P02B-R2 | CLOSED/CANONICAL (#1436/#1437) | Slice 3 | Claim-wrapper fail-closed guard | typed wrapper model | **NO** | TYPED-WRAPPER (gelecek) |
| P03A | CLOSED/CANONICAL (#1413/#1416) | Slice 3 | 4/12 owner-safe rol çözümü (22/33) | P03B (8 rol) | **NO** | P03B |
| P04A-ENC | CLOSED/CANONICAL (#1420/#1422) | Slice 3+6 | Gerçek ISO-8859-9 byte encoding | yok | **NO** | Slice 6 |
| P04B-VAL-I1 | CLOSED/CANONICAL (#1425/#1427) | Slice 6 | Local Docker DTD validator image | P04B-VAL-I2 hiç yapılmadı | **NO** | Slice 6 |
| P04B-VAL-R1-GOV | CLOSED/CANONICAL, analiz (#1431) | Slice 3+6 | Kök-neden: 6/26 nondeterministic content model | P04B-EXT (external) | **NO** | External dependency matrix |
| P04D-INSTRUMENT | NOT STARTED | Slice 3 | — | tüm birim | N/A | — |
| P03B | NOT STARTED / BLOCKED BY OWNER-LDO | Slice 3 | — | tüm birim | N/A | — |
| Contract B | NOT STARTED / SEPARATE-OPEN | Slice 4 | — | tüm birim | N/A | — |
| P04C-SHADOW | NOT STARTED | Slice 7 | — | tüm birim | N/A | — |
| P05 | NOT AUTHORIZED / HARD HOLD | Slice 8 | — | tüm birim | N/A | — |

**Kural uygulandı:** CLOSED/CANONICAL hiçbir görev reopen edilmedi (`REOPEN? = NO`); gelecek kapasite yeni additive birim olarak kaydedildi; silent supersession yok; çatışma bulunamadı.

## 6. External Activity Precision (P04B-EXT-01/02/03)

```text
P04B-EXT-01 / 02 / 03
NON-REPOSITORY OWNER-SESSION ACTIVITY

OWNER-REPORTED STATUS
dispatch package prepared

ACTUAL SEND
UNCONFIRMED

REPOSITORY EVIDENCE
NONE

CANONICAL EXTERNAL AUTHORITY STATUS
NOT YET OBTAINED
```

Bu üç birim hiçbir zaman repository'ye commit edilmedi (mode gereği repository mutation 0 boyunca korundu); durumları yalnız session-tabanlı owner-raporlamasından bilinir, git/PR kanıtı YOKTUR. **E-posta gönderilmiş veya UYAP cevabı alınmış gibi HİÇBİR KAYIT YAPILMAMIŞTIR.**

## 7. Workstreams

| | WS-A Contract Semantics | WS-B Transport & Auth | WS-C Evidence & Security | WS-D Simulator & Test Env | WS-E Shadow Execution | WS-F Controlled Cutover |
|---|---|---|---|---|---|---|
| **Goal** | Doğru payload | Güvenli iletim | Denetlenebilir kanıt | Ortamsız doğrulama | Risk-sız provası | Yetkili canlı geçiş |
| **Entry condition** | P02A-P02B-R2 CLOSED | Charter canonical | WS-A+B iskeleti | WS-A+B temel | WS-A-D tamam | WS-A-E tamam + owner GO |
| **Canonical assets** | 18-commit zincir | yok | yok | P04B-VAL-I1+P04A-ENC | P04C ismi | P05 ismi |
| **Open decisions** | typed-wrapper, P03B hedefleri | auth mekanizması, credential model | evidence şeması, retention | mock-endpoint tasarımı | comparison-model | 10 precondition |
| **Candidate units** | P04D-INSTRUMENT, P03B, TYPED-WRAPPER (gelecek isim) | `TRANSPORT-AUTH-01` | `EVIDENCE-01` | `SIMULATOR-01` | **P04C-SHADOW** (mevcut kimlik) | **P05** (mevcut kimlik) |
| **Exit criteria** | official acceptance netleşene kadar UNVERIFIED korunur | interface CANONICAL (+ mümkünse gerçek bağlantı) | 12 alan canonical şema | tüm senaryo sınıfı simüle | false-positive/negative eşiği + owner exit | owner final approval |
| **Owner gates** | P03B (LDO+OWNER), typed-wrapper seçimi | auth mekanizması seçimi | retention/KVKK (varsa) | yok | P04C GO-* | P05 GO-* (HARD HOLD) |
| **External dependencies** | P04B authority response | endpoint/auth mekanizması | yok | test ortamı (kısmi) | comparison baseline | TÜMÜ |

**WS-A mevcut kimlikleri korunur:** `P04D-INSTRUMENT`, `P03B`, gelecekteki TYPED-WRAPPER birimi, Contract B semantic units. **WS-E ve WS-F mevcut kimlikleri korunur:** WS-E=`P04C-SHADOW`, WS-F=`P05`. **Bu görevler yeni isim verilerek İKAME EDİLMEZ.**

## 8. Connector Authority Gates

```text
PAYLOAD-SHAPE AUTHORITY        → Contract A/B governance (P02B/P02B-R2 + gelecek Contract B)
ROLE / SOURCE AUTHORITY        → OWNER / LDO / domain owners (P03A/P03B)
CALCULATION AUTHORITY          → ADR-014
TRANSPORT AUTHORITY            → gelecek Transport/Auth governance (henüz YOK)
CREDENTIAL AUTHORITY           → tenant-bound credential custodian (tasarım varsayımı, §4 Slice-2 precision correction'a tabi)
SHADOW AUTHORITY               → explicit P04C owner gate
REAL SEND AUTHORITY            → explicit owner dispatch gate
CUTOVER AUTHORITY              → P05 final owner approval
```

**Bir alt gate'in geçilmesi üst gate'i OTOMATİK AÇMAZ.** Örnek: Slice 2'nin interface tasarımının CANONICAL olması, Transport Authority'nin kurulduğu veya Credential Authority'nin doğrulandığı anlamına GELMEZ.

## 9. Security Constitution (minimum invariant seti — implementasyon başlatılmaz)

```text
tenant-bound credentials
encrypted secret custody
no credential logging
no raw payload logging
certificate verification mandatory
network allowlisting
bounded timeout and retry
idempotency
replay protection
environment separation
PII-safe observability
immutable dispatch evidence
operator kill switch
```

**Precision correction 1:** `TENANT-SPECIFIC UYAP CREDENTIALS` = **DESIGN ASSUMPTION / REQUIRES AUTHORITY CONFIRMATION** (bkz. §4 Slice 2). "Her tenant kesin kendi UYAP hesabına sahiptir" doğrulanmamış factual claim olarak KURULMAZ.

**Precision correction 2:** `KILL SWITCH` = **CONTROL REQUIREMENT**; **EXACT IMPLEMENTATION NOT DECIDED.** "Feature flag'den güçlü olmak zorundadır" gibi bir implementation kararı bu charter'da VERİLMEZ — yalnız böyle bir kontrolün VAR OLMASI gerektiği ratifiye edilir.

## 10. Connector Dependency Graph

```
domain truth (Debtor/Case/ClaimItem/CaseInstrument)
  input: Prisma domain state · output: OfficialExchangeInput-uyumlu ham veri
  authority: DEBTOR/RECEIVABLE domain · failure: N/A · status: CANONICAL · blocker: yok
  ↓
role/source classification (P02A/P03A/P02B-R2)
  input: DebtorRole/ClaimItem · output: OfficialRoleResolution + claimShapeViolations
  authority: P03(A/B)+LDO/OWNER · failure: UNRESOLVED/UNSUPPORTED/REJECTED · status: 4/12 rol+claim-wrapper CANONICAL · blocker: P03B, typed-wrapper
  ↓
Contract A/B payload (P02B serializer)
  input: resolved taraf (bugün taraf-only) · output: SERIALIZED_DRAFT
  authority: P02B/P02B-R2 · failure: REJECTED (4 neden) · status: CANONICAL, instrument/ilam/digerAlacak YOK · blocker: P04D, typed-wrapper
  ↓
byte encoding (P04A-ENC)
  input: SERIALIZED_DRAFT extract · output: BYTE_ENCODED
  authority: P04A-ENC · failure: ENCODING_REJECTED · status: CANONICAL · blocker: yok
  ↓
local validation/simulation (P04B-VAL-I1 + Slice 6)
  input: BYTE_ENCODED (tasarımda) · output: LOCAL_DTD_VALIDATED/REJECTED (I2 hiç yapılmadı)
  authority: P04B-VAL · failure: nondeterministic-content-model (DTD'nin kendi kusuru) · status: image CANONICAL, harness BLOCKED · blocker: P04B-EXT
  ↓
transport/authentication (Slice 2, YENİ)
  input: encoded+validated payload · output: transport response (bilinmiyor)
  authority: TANIMSIZ · failure: TANIMSIZ · status: NOT CANONICALIZED · blocker: gerçek endpoint/auth (external)
  ↓
response normalization (YENİ)
  input: raw transport response · output: normalized success/failure
  authority: yeni connector birimi · failure: TANIMSIZ · status: NOT STARTED · blocker: transport katmanı + hata kodu kataloğu (external)
  ↓
evidence/audit (Slice 5, YENİ)
  input: her aşamanın kanıtı · output: immutable dispatch evidence
  authority: yeni connector birimi · failure: N/A · status: NOT STARTED · blocker: yok
  ↓
shadow execution (P04C-SHADOW)
  input: gerçek Case/ClaimItem (dry-run) · output: yapısal karşılaştırma
  authority: P04C · failure: TANIMSIZ · status: NOT STARTED · blocker: comparison-model netliği
  ↓
production cutover (P05)
  input: tüm önceki aşamaların PASS kanıtı · output: gerçek UYAP iletimi (yetkilendirilirse)
  authority: OWNER final approval · failure: N/A · status: NOT AUTHORIZED · blocker: her önceki aşamanın açık kalemi
```

## 11. External Dependency Matrix

| UYAP/BİGM'den gereken bilgi | Blocks design? | Blocks implementation? | Blocks simulator? | Blocks shadow? | Blocks cutover? |
|---|---|---|---|---|---|
| Actual validator behavior | Hayır | **Evet** | Kısmen | **Evet** | **Evet** |
| Current DTD/XSD | Hayır | **Evet** | Kısmen | **Evet** | **Evet** |
| Contract A sample | Hayır | Kısmen | Kısmen | **Evet** | **Evet** |
| Claim-wrapper mapping | Hayır | **Evet** | Hayır | Kısmen | **Evet** |
| Endpoint/authentication mechanism | Kısmen | **Evet** | **Evet** | **Evet** | **Evet** |
| Test environment | Hayır | Kısmen | **Evet** | **Evet** | **Evet** |
| Error-code catalogue | Hayır | **Evet** | Kısmen | **Evet** | **Evet** |
| Contract B contract | Hayır | **Evet** (Slice 4 için) | **Evet** (Slice 4) | **Evet** (Slice 4) | **Evet** (Slice 4) |

## 12. Hard-Hold Conditions

```text
P04B-VAL-I2         : BLOCKED / HOLD
REAL UYAP REQUEST   : NOT AUTHORIZED
P04C-SHADOW         : NOT STARTED
P05                 : NOT AUTHORIZED
UYAP CUTOVER        : HARD HOLD
```

**Bu charter'ın merge'i yukarıdakilerden HİÇBİRİNİ AÇMAZ.**

## 13. Recommended Sequencing

```
CONNECTOR-CHARTER-01 (bu belge)
  → TRANSPORT-AUTH-01 GO-ANALYZE
  → EVIDENCE-01 GO-ANALYZE
  → SIMULATOR-01 GO-ANALYZE
  → external-authority-dependent Contract A residuals (P04D/P03B/typed-wrapper)
  → Contract B units
  → P04C-SHADOW (mevcut kimlik)
  → P05 (mevcut kimlik)
```

Transport/Auth, Evidence ve Simulator'ın ileride PARALEL çalışabilmesi kabul edilir; ancak bu charter canonical olmadan hiçbiri BAŞLATILMAZ.

## 14. Document Self-Check

Bu belge: yeni invariant/ID uzayı AÇMAZ; P01-P02B-R2 arasındaki hiçbir CLOSED/CANONICAL görevi REOPEN ETMEZ veya yeniden analiz ETMEZ; typed-wrapper/P04D/P03B/Contract B/P04C/P05 için implementasyon veya karar SEÇMEZ; P04B-EXT-01/02/03'ün gönderildiğini veya UYAP'tan cevap alındığını İDDİA ETMEZ; tenant-specific credential varsayımını doğrulanmış gerçek olarak SUNMAZ; kill-switch'in kesin implementasyonunu SEÇMEZ; production kod/test/schema/migration DEĞİŞTİRMEZ; **UYAP CUTOVER HARD HOLD'u DEĞİŞTİRMEZ.** **IMPLEMENTATION AUTHORITY: NONE.**

## Owner Approval Record

```text
DBP-P2-UYAP-CONNECTOR-CHARTER-01-GOV — OWNER GO-DOCS + IF GO-COMPLETE
Kaynak: DBP-P2-UYAP-CONNECTOR-MASTER-01 GO-ANALYZE (owner-accepted) sonucu.
Canonical home: bu belge (project/docs/blueprint/DEBTOR-UYAP-CONNECTOR-CHARTER-v1.0.md).
NORTH STAR: production-grade, çalışan, güvenli, denetlenebilir, controlled-cutover UYAP connector.
NEXT ELIGIBLE TASK (bu belge tarafından seçilmez): TRANSPORT-AUTH-01 / EVIDENCE-01 / SIMULATOR-01
GO-ANALYZE adaylarından owner seçimi.
```
