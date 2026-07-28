# UYAP-OPERATION-EVIDENCE-CANARY-R02-SCENARIO-CONTRACT-R01 — v1.0

| Alan | Değer |
| --- | --- |
| Canonical task | `UYAP-OPERATION-EVIDENCE-CANARY-R02-SCENARIO-CONTRACT-R01` |
| Program | `UYAP-MODULE-FULL-GAP-CLOSURE-R02` |
| Mode | ANALYZE → GOVERNANCE ARTEFACT → PR → CLOSE |
| Kapanılan bulgu | `R-06` — *"UYAP Canary R02 için canonical scenario corpus repository'de yok"* (`UYAP-OFFICIAL-LEGAL-SEMANTIC-MAPPING-AUTHORITY-R01-v1.0.md`) |
| Runtime Canary | NOT AUTHORIZED |
| Real transport | NOT AUTHORIZED |
| Tarih | 2026-07-29 |

## 0. Bu belgenin yaptığı ve yapmadığı

**Yapar:** programın önceden var olan (bu belgeden bağımsız, repository'de zaten
kanıtlanmış) runtime hedeflerini temsil eden minimum-ama-yeterli senaryo korpusunu
sabitler. Her senaryo, mevcut CPE gate'lerine (`UYAP-SEND-HARD-GATE-PREFLIGHT-R02`),
evidence zincirine (`UYAP-EVIDENCE-RUNTIME-INTEGRITY-R02`), authority freshness
TX'ine (`UYAP-AUTHORITY-FRESHNESS-TX-I01`) ve resmî kod matrislerine
(`UYAP-OFFICIAL-LEGAL-SEMANTIC-MAPPING-AUTHORITY-R01`) **iz sürülerek** bağlanır.

**Yapmaz:** Canary yürütmez, gerçek transport açmaz, hukuki kod eşlemesi ratifiye
etmez (`UYAP-OFFICIAL-LEGAL-SEMANTIC-MAPPING-OWNER-RATIFICATION-R01` bekler),
senaryoyu test sonuçlarına göre kolaylaştırmaz — corpus test SONRASINDA değil,
mevcut kanıttan ÖNCE tanımlanır.

## 1. Corpus sabitleri (tüm senaryolarda değişmez)

```text
REAL TRANSPORT:      0
NETWORK:              0
FEATURE FLAG FINAL:   OFF
PRODUCTION DATA:      0
DISPOSABLE TENANT:    REQUIRED
DISPOSABLE CASES:     REQUIRED
```

Kanıt: `official-dormant-dispatch.ts` → `UYAP_DORMANT_DISPATCH_ENABLED = false`,
`networkCallCount: 0`, `transportPerformed: false` (I01A/I01B-1'de doğrulandı).

## 2. Senaryo eksenleri (12 zorunlu + 3 ek)

Zorunlu 12 eksenin her biri en az bir senaryoda temsil edilir. `UNRESOLVED LEGAL
SEMANTIC` ekseni tek başına M-03…M-08 ve T-05…T-11'in kapsanmadığı anlamına gelmez —
her biri kendi satırında `OWNER_RATIFICATION_REQUIRED` olarak ayrıca işaretlenir.

| # | Scenario ID | Legal purpose | Case type | Action code | rolTur req. | mahiyetKodu req. | takipTuru req. | alacakKalemi wrapper | Authority expectation | Operation expectation | Attempt expectation | Evidence expectation | Network expectation | Final flag state | Readiness |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| CS-01 | VALID_AUTHORITY_ORDINARY_EXPENSE | Genel haciz yoluyla takip, masraf engeli yok, POA geçerli | `GENERAL_EXECUTION` | `UYAP_SEND` | RESOLVED `22`/`33` (P03A) | RATIFIED-PENDING `9009`/`1045` (M-01/M-02, `CaseSubCategory.NAFAKA` senaryosu) | RATIFIED-PENDING `1` (T-01) | RATIFIED-PENDING — (bu senaryoda enstrüman yok, `alacakKalemi` emisyonu YOK — P02B-R2 fail-closed) | ALLOWED (tüm HARD gate `false`/`true` pozitif kanıtlı) | `UyapOperation` COMMITTED | `UyapAttempt` SUCCESS (dormant) | `CpeDecisionLog` + `CpeExecutionRecord` + link zinciri TAM | 0 | OFF | **OWNER_RATIFICATION_REQUIRED** (M-01/T-01 owner onayı bekliyor) |
| CS-02 | VALID_AUTHORITY_BLOCKING_EXPENSE | Aynı, ödenmemiş masraf talebi VAR | `GENERAL_EXECUTION` | `UYAP_SEND` | RESOLVED | — (gate'te durur) | — | — | DENIED — `EXPENSE_BLOCKING` (HARD, priority 10) | `UyapOperation` NOT CREATED | `UyapAttempt` NOT CREATED | `CpeDecisionLog` `allowed=false`, `GATE_BLOCKED` | 0 | OFF | **READY** (gate davranışı I01B'ye bağımlı değil, halihazırda test edilmiş) |
| CS-03 | MISSING_POA | Vekaletname kaydı yok | `GENERAL_EXECUTION` | `UYAP_SEND` | RESOLVED | — | — | — | DENIED — `POWER_OF_ATTORNEY_MISSING` (HARD) | NOT CREATED | NOT CREATED | `CpeDecisionLog` `GATE_BLOCKED` | 0 | OFF | **READY** |
| CS-04 | STALE_OR_REVOKED_POA | POA gate zamanı geçti / vekalet iptal edildi, TX-1 revalidation stage 0'da yakalar | `GENERAL_EXECUTION` | `UYAP_SEND` | RESOLVED (decision anında) → STALE (commit anında) | — | — | — | DENIED — `UyapAuthorityStaleError` (TX-1 stage 0) | NOT CREATED (revalidation yazımdan ÖNCE) | NOT CREATED | evidence path ORPHAN OLUŞMAZ (stage 0 hiçbir tabloya yazmadan durur) | 0 | OFF | **READY** (UYAP-AUTHORITY-FRESHNESS-TX-I01 kapsamında zaten kanıtlı) |
| CS-05 | CLOSED_CASE | `case.is_closed = true` | herhangi | `UYAP_SEND` | — | — | — | — | DENIED — `CASE_CLOSED` (HARD, priority 1) | NOT CREATED | NOT CREATED | `CpeDecisionLog` `GATE_BLOCKED` | 0 | OFF | **READY** |
| CS-06 | ARCHIVED_CASE | `case.is_archived = true` | herhangi | `UYAP_SEND` | — | — | — | — | DENIED — `CASE_ARCHIVED` (HARD, priority 2) | NOT CREATED | NOT CREATED | `CpeDecisionLog` `GATE_BLOCKED` | 0 | OFF | **READY** |
| CS-07 | UYAP_DISABLED | `case.allow_uyap_actions = false` | herhangi | `UYAP_SEND` | — | — | — | — | DENIED — `UYAP_DISABLED` (HARD, priority 11) | NOT CREATED | NOT CREATED | `CpeDecisionLog` `GATE_BLOCKED` | 0 | OFF | **READY** |
| CS-08 | UYAP_TEMPORARILY_UNAVAILABLE | `system.uyap_available = false` VEYA `system.uyap_availability_explicit ≠ true` | herhangi | `UYAP_SEND` | — | — | — | — | DENIED — `UYAP_TEMPORARILY_UNAVAILABLE_SEND` veya `UYAP_SEND_PRECONDITIONS_UNPROVEN` (HARD) | NOT CREATED | NOT CREATED | `CpeDecisionLog` `GATE_BLOCKED` | 0 | OFF | **READY** |
| CS-09 | REPLAY_IDEMPOTENCY | Aynı `(tenantId, executionId)` ikinci kez gönderilir | `GENERAL_EXECUTION` | `UYAP_SEND` | RESOLVED | RATIFIED-PENDING | RATIFIED-PENDING | — | ALLOWED (ilk çağrı), ikinci çağrı idempotent NOOP | `UyapOperation` tek kayıt, P2002 tenant-scoped unique yakalar | `UyapAttempt` tekrar YOK | `markAsNoop` yolu; `CpeExecutionRecord` `@@unique([tenantId, executionId])` korunur | 0 | OFF | **OWNER_RATIFICATION_REQUIRED** (CS-01 ile aynı mahiyet/takip bağımlılığı) |
| CS-10 | CONCURRENT_STALE_AUTHORITY | İki eşzamanlı istek, biri commit sırasında POA'yı geçersiz kılar | `GENERAL_EXECUTION` | `UYAP_SEND` | RESOLVED → biri STALE | RATIFIED-PENDING | RATIFIED-PENDING | — | Kazanan ALLOWED, kaybeden `UyapAuthorityStaleError` | tek `UyapOperation`, `pg_advisory_xact_lock` sıralı erişim | tek `UyapAttempt` | atomic rollback kanıtı (FR-01…FR-12) | 0 | OFF | **OWNER_RATIFICATION_REQUIRED** |
| CS-11 | CROSS_TENANT_EXECUTION_ID | Tenant B, Tenant A'nın `executionId`'sini tekrar kullanır | `GENERAL_EXECUTION` | `UYAP_SEND` | RESOLVED (her tenant kendi içinde) | RATIFIED-PENDING | RATIFIED-PENDING | — | Her iki tenant BAĞIMSIZ ALLOWED (composite tenant-scoped unique çakışma üretmez) | iki ayrı `UyapOperation`, farklı `tenantId` | iki ayrı `UyapAttempt` | cross-tenant link path YOK (`@@unique([tenantId, executionId])` izole eder) | 0 | OFF | **OWNER_RATIFICATION_REQUIRED** |
| CS-12 | UNRESOLVED_LEGAL_SEMANTIC | `proceedingType = PLEDGE` (T-07, owner sınırı gereği rule matrix'te yok) | `PLEDGE` | `UYAP_SEND` | RESOLVED | AUTHORITY_REQUIRED | AUTHORITY_REQUIRED | AUTHORITY_REQUIRED | DENIED — codelist kapısı `OFFICIAL_TAKIP_MAPPING_AUTHORITY_REQUIRED` (şekilden ÖNCE, byte üretilmeden) | NOT CREATED | NOT CREATED | `CODELIST_REJECTED`, kısmi XML/byte YOK | 0 | OFF | **MODEL_RESIDUAL** (T-07 owner sınırı — implementasyon değil, owner kararı gerekir) |
| CS-13 | JUDGMENT_ENFORCEMENT_INSTRUMENT_AMBIGUOUS | `proceedingType=JUDGMENT_ENFORCEMENT` VE `CaseInstrument` kaydı birlikte | `JUDGMENT_ENFORCEMENT` | `UYAP_SEND` | RESOLVED | AUTHORITY_REQUIRED (W-05 vs W-01…04 çakışması) | RATIFIED-PENDING `0` (T-04) | AMBIGUOUS (§3.1, W-05 belgesi) | DENIED — wrapper çakışması fail-closed, sarmalayıcı SEÇİLMEZ | NOT CREATED | NOT CREATED | `CODELIST_REJECTED` veya eşdeğer fail-closed red | 0 | OFF | **MODEL_RESIDUAL** (öncelik kuralı tayin edilmemiş) |
| CS-14 | MAHIYET_5045_REJECTED | `mahiyetKodu=5045` çağıran tarafından denenir (codelist tanır, DTD tanımaz) | herhangi | `UYAP_SEND` | RESOLVED | REJECTED — `OFFICIAL_MAHIYET_DTD_UNREPRESENTABLE` | — | — | DENIED — codelist kapısı | NOT CREATED | NOT CREATED | `CODELIST_REJECTED`, byte YOK | 0 | OFF | **EXTERNAL_TECHNICAL_AUTHORITY_REQUIRED** |
| CS-15 | STRICT_DTD_VALIDATION_ATTEMPT | Herhangi bir geçerli senaryoda strict DTD PASS iddiası aranır | herhangi | `UYAP_SEND` | — | — | — | — | N/A | N/A | N/A | `officialDtdValidated` DAİMA `false` | 0 | OFF | **D1_BLOCKED** |

### 2.1 Eksen kapsama tablosu (zorunlu 12)

| Zorunlu eksen | Karşılayan senaryo |
| --- | --- |
| VALID AUTHORITY / ORDINARY EXPENSE | CS-01 |
| VALID AUTHORITY / BLOCKING EXPENSE | CS-02 |
| MISSING POA | CS-03 |
| STALE OR REVOKED POA | CS-04 |
| CLOSED CASE | CS-05 |
| ARCHIVED CASE | CS-06 |
| UYAP DISABLED | CS-07 |
| UYAP TEMPORARILY UNAVAILABLE | CS-08 |
| REPLAY / IDEMPOTENCY | CS-09 |
| CONCURRENT STALE AUTHORITY | CS-10 |
| CROSS-TENANT EXECUTION ID | CS-11 |
| UNRESOLVED LEGAL SEMANTIC | CS-12 |

Ek 3 senaryo (CS-13/14/15) zorunlu değil ama programın kendi residual'larını
(W-05 çakışması, `5045`, D1) doğrudan temsil ettiği için corpus'a dahil edildi;
**atlanmadı, log edildi.**

## 3. Readiness dağılımı

```text
READY:                              7   (CS-02..CS-08)
OWNER_RATIFICATION_REQUIRED:        5   (CS-01, CS-09, CS-10, CS-11 — mahiyet/takip
                                          bağımlı; CS-01/09/10/11 hepsi M-01/M-02 +
                                          T-01 zincirine bağımlı)
MODEL_RESIDUAL:                     2   (CS-12, CS-13)
EXTERNAL_TECHNICAL_AUTHORITY_REQUIRED: 1  (CS-14)
D1_BLOCKED:                         1   (CS-15)
```

`READY` senaryolar (CS-02…CS-08) hukuki kod eşlemesi **gerektirmez** — hepsi HARD
gate red yollarıdır ve resmî kodlu alanlara hiç ulaşmaz (`UyapOperation` HİÇ
CREATE edilmez). Bu yüzden owner ratifikasyonu beklemeden dahi CPE regresyon
kapsamında yürütülebilirler — **ama bu belge Canary yürütmesini yetkilendirmez.**

`OWNER_RATIFICATION_REQUIRED` senaryolar (CS-01/09/10/11), `UYAP-OFFICIAL-LEGAL-
SEMANTIC-MAPPING-OWNER-RATIFICATION-R01`'de sunulan **T-01 ve M-01/M-02** satırlarının
owner onayına bağımlıdır. Bu belge o onayı VERMEZ, yalnız hangi senaryoların hangi
satırlara bağımlı olduğunu sabitler.

## 4. Corpus tamlığı — silinen kapsam yok

Bu corpus programın **önceden var olan** yüzeylerinden (CPE gate zinciri, evidence
zinciri, authority freshness TX, resmî kod matrisleri) türetildi; test sonuçlarına
göre daraltılmadı. Kapsam dışı bırakılan hiçbir alan yoktur — `PLEDGE`/`MORTGAGE`/
bağımsız `EVICTION`/`PUBLIC_RECEIVABLE` gibi rule-matrix-dışı `ProceedingType`
değerleri CS-12 ile temsil edilir, susturulmaz.

## 5. R-06 kapanışı

```text
R-06 (önceki hüküm): UYAP Canary R02 senaryo korpusu repository'de kanonik
                      olarak TANIMLI DEĞİL

R-06 (bu belgeyle):  CLOSED — 15 senaryo, 12 zorunlu eksen + 3 residual-temsilci,
                      her biri gate/matris kanıtına iz sürülerek bağlı
```

## 6. Statü

```text
CANARY SCENARIO CORPUS:          DEFINED (bu belge)
CANARY R02:                      NOT ELIGIBLE — 5 senaryo owner ratifikasyonu,
                                  2 senaryo model residual, 1 dış authority,
                                  1 D1 bekliyor
RUNTIME CANARY:                  NOT AUTHORIZED — bu belgeyle DEĞİŞMEDİ
IMPLEMENTATION GATE:              hâlâ OWNER-RATIFIED EXACT ROWS + bu corpus'un
                                  ikisinin birlikte var olmasını gerektirir
```
