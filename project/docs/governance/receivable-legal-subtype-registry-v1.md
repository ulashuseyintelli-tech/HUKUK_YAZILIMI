# Receivable Legal Subtype Registry V1 — Ratification Record

## 1. Kimlik ve statü

```text
TASK                     RCV-CLAIM-FORM-P02-S08-D02-SR01
REGISTRY ID              RCV-CLAIM-LEGAL-SUBTYPE-REGISTRY
REGISTRY VERSION         1
REGISTRY STATUS          RATIFIED
RUNTIME STATUS           DORMANT
ENTRY COUNT              7
SERIALIZATION            RCV-LEGAL-SUBTYPE-REGISTRY-CANONICAL-JSON-V1
CHECKSUM                  SHA-256
REGISTRY CHECKSUM        320f671ed2262314a560703bc8f15f9cd8b5e0743d8dfa4e5ce49b1e62c26e64
```

Bu belge owner'ın `RCV-CLAIM-FORM-P02-S08-D02-SR01` yürütme emri uyarınca
versioned Legal Subtype Registry sözleşmesini ratify eder. Registry, Receivable / Claim Formation
bounded context'indedir. Runtime provider, resolver, production call-site veya aktivasyon üretmez.

## 2. Canonical source chain

Registry şu canonical zinciri tüketir; bu kararları yeniden açmaz:

1. `SYSTEM-CONSTITUTION.md` v1.4 ClaimItem formation invariants;
2. `RECEIVABLE-GOVERNANCE.md` §23.19 Legal Basis authority, §23.31 component-category binding ve
   §23.32 initial Legal Basis release-input semantics;
3. `RCV-CLAIM-FORM-P02-S08-D01B` — Legal Basis authority contract;
4. `RCV-CLAIM-FORM-P02-S08-D02-R01` — exact-version readiness/deferred execution contract;
5. `RCV-CLAIM-FORM-P02-S08-D02-R01A` — non-circular release identity;
6. `RCV-CLAIM-FORM-P02-S08-D02-CR01` — `allowedComponentCategories[]` membership-and-echo;
7. `RCV-CLAIM-FORM-P02-S08-D02-F01-R03` — six Legal Basis release-input semantics;
8. implementation PR #1575 — Legal Basis eligibility parity and fail-closed evidence.

Repository truth'te canonical component category union'ı:

```text
PRINCIPAL | COST | ANCILLARY | ACCRUED_INTEREST
```

Bu registry yalnız `COST`, `ANCILLARY` ve `ACCRUED_INTEREST` kullanır. `PRINCIPAL` için yeni bir
subtype veya alias üretmez.

## 3. Ratified subtype set

| subtypeCode | v | canonical category | exact Legal Basis binding | dar hukuki anlam |
|---|---:|---|---|---|
| `COMMERCIAL_COLLECTION_COST` | 1 | `COST` | `TTK_1530` | Yalnız kapsama giren ticari mal/hizmet tedarikindeki kanunen izin verilen tahsil gideri |
| `COMMERCIAL_DEFAULT_INTEREST` | 1 | `ACCRUED_INTEREST` | exactly one of `KANUN_3095_2`, `TTK_1530` | Exact ticari nitelik, temerrüt başlangıcı ve oran/policy kanıtlı işlemiş ticari temerrüt faizi |
| `CONTRACTUAL_DEFAULT_INTEREST` | 1 | `ACCRUED_INTEREST` | `TBK_120` | Exact sözleşme faiz hükmü ve kanuni sınırlar altında işlemiş sözleşmesel temerrüt faizi |
| `DEFAULT_INTEREST` | 1 | `ACCRUED_INTEREST` | `TBK_117` | Yalnız temerrüt oluşum şartı; ayrıca exact rate authority zorunlu; genel fallback değildir |
| `DELAY_DAMAGE` | 1 | `ANCILLARY` | `TBK_118` | Temerrüt nedeniyle ayrıca kanıtlanan zarar ve genişletilmiş sorumluluk; otomatik faiz/penalty değildir |
| `STATUTORY_DEFAULT_INTEREST` | 1 | `ACCRUED_INTEREST` | `KANUN_3095_2` | Temerrüt şartları ve exact kanuni oran kanıtlandıktan sonra işlemiş kanuni temerrüt faizi |
| `STATUTORY_INTEREST` | 1 | `ACCRUED_INTEREST` | `KANUN_3095_1` | Temerrüt şartı çıkarmadan exact kanuni oranla işlemiş faiz |

Subtype sırası Unicode code-point lexicographic canonical sıradır; hukuki öncelik değildir.

## 4. Normative formation contract

Her subtype için machine-readable registry aşağıdaki alanları zorunlu ve unknown-field kapalı
şemayla taşır:

- immutable `subtypeCode + subtypeVersion`;
- exact canonical component category;
- exact Legal Basis allowlist/binding mode;
- required source/evidence sınıfları;
- aynı debtor/liability relationship zorunluluğu;
- interest, amount, currency ve calculation semantics;
- allowed/forbidden formation paths;
- admission/finalization/snapshot requirements;
- dormant/fail-closed lifecycle ve explicit supersession zinciri.

`DEFAULT_INTEREST`, `STATUTORY_INTEREST`, `PRINCIPAL` veya `OTHER` hiçbir durumda generic
fallback değildir. Current/latest/default çözümleme, direct ClaimItem write, future interest'i
fixed ClaimItem'a çevirme ve historical reclassification yasaktır.

Her yeni ClaimItem oluşumunda aşağıdaki exact tuple doğrulanır ve immutable snapshot'a taşınır:

```text
registryId
+ registryVersion
+ registryChecksum
+ subtypeCode
+ subtypeVersion
+ exact Legal Basis code/version/checksum/release identity
+ exact Document source version/fingerprint
+ exact liability-context hash
+ exact amount/currency/minor-unit/effective-date inputs
```

Eksik, revoked, superseded, checksum-mismatched, category-incompatible, source/evidence-incomplete
veya liability-incompatible bağlam fail-closed'dur; ClaimItem ve snapshot write üretemez.

## 5. Serialization ve checksum

Canonical payload `receivable-legal-subtype-registry-v1.json` dosyasının semantic JSON değeridir.

- string encoding: UTF-8;
- Unicode normalization: NFC;
- object keys: Unicode code-point lexicographic order;
- arrays: contract-defined order, implicit sort yok;
- numbers: yalnız safe integer;
- whitespace, indentation ve CRLF/LF: checksum authority dışında;
- environment, absolute path ve execution timestamp: payload dışında;
- checksum: lowercase hexadecimal SHA-256;
- checksum manifest: canonical payload dışında; checksum self-reference yok.

Authority chain:

```text
registry identity/version
→ complete canonical registry payload
→ registry checksum
→ exact subtype-version consumer binding
```

## 6. Conflict ve ambiguity dispositions

| Konu | Disposition |
|---|---|
| `DEFAULT_INTEREST` anlamı | `TBK_117` formation-condition ile daraltıldı; rate authority ayrıca exact policy/source ister; catch-all yasak |
| `COMMERCIAL_DEFAULT_INTEREST` iki hukuki kaynak | Exactly-one-of allowlist; listedeki sıra fallback değildir; consumer exact tek Legal Basis version seçer |
| Interest üzerinde yeniden faiz | Bütün v1 entry'lerde `componentAccruesFurtherInterest=false`; açık ayrı hukuki authority olmadan faize faiz yok |
| Liability türleri | Mevcut `TAM/KISMI/SINIRLI` seti korunur; exact aynı debtor/liability relation ve context hash zorunlu; cross-liability use yasak |
| Future interest | ClaimItem subtype authority değildir; yalnız exact InterestPolicy/calculation rule ile yürür |
| Legacy records | Otomatik subtype atama, upgrade, backfill veya reclassification yok |
| Tenant overlay | Global registry anlamını gevşetemez veya yeni legal subtype authority üretemez |

## 7. Validation evidence contract

`project/scripts/governance/validate-receivable-legal-subtype-registry.cjs`:

- exact seven-code inventory, versions, ordering, category/basis allowlists ve lifecycle'ı;
- required alanları, unknown-field rejection ve forbidden placeholder denetimini;
- source/evidence, liability, amount/currency, formation/finalization/snapshot şartlarını;
- checksum manifest bütünlüğünü ve checksum self-reference yasağını;
- formatting/key-order/line-ending bağımsızlığını;
- semantic mutation checksum hassasiyetini;
- duplicate, missing, unratified code/category/basis, empty evidence, invalid version ve fallback
  senaryolarının fail-closed sonucunu

deterministik olarak doğrular. Existing CI'nin Claim Formation dormancy suite'i bu validator'ın
self-test modunu çalıştırır; production module/provider wiring eklenmez.

## 8. Authority boundary ve readiness

```text
SR01                               RATIFIED / CANONICAL UPON APPROVED MERGE
REGISTRY ARTIFACT                  AVAILABLE / CHECKSUM-PINNED
REGISTRY RUNTIME                   DORMANT
PRODUCTION PROVIDER / RESOLVER     NONE
SIGNED LEGAL BASIS RELEASE         NOT CREATED
PUBLIC KEYS / KEY CEREMONY         PENDING / SEPARATE OWNER GATE
CHECKSUM-BOUND LEGAL APPROVALS      PENDING / SEPARATE OWNER GATE
SCHEMA / MIGRATION                 NONE
HISTORICAL DATA MUTATION           NONE
I04                                BLOCKED / NOT AUTHORIZED
NEXT ELIGIBLE TASK                 RCV-CLAIM-FORM-P02-S08-D02-PB01
NEXT TASK AUTHORITY                OWNER GO REQUIRED
```

`D02-PB01 — Exact Legal Basis Projection Binding Contract`, Legal Basis release payload'ının
registry identity/version/checksum ve exact `allowedSubtypeCodes[]` bağını belirleyecek sonraki
bounded contract'tır. Shared Document V4 exact-version consumer adapter işi paralel dış bağımlılık
olarak açık kalır. D02-F01; PB01, key ceremony/trust-root onboarding, complete payload checksum ve
checksum-bound reviewer/final-ratifier approvals tamamlanmadan başlayamaz.
