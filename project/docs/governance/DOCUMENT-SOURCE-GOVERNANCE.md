# SHARED DOCUMENT SOURCE AUTHORITY CONTRACT

```text
Canonical Path        : project/docs/governance/DOCUMENT-SOURCE-GOVERNANCE.md
Document Status       : RATIFIED / CANONICAL UPON APPROVED MERGE TO MAIN
Document Class        : BOUNDED SHARED AUTHORITY CONTRACT
Constitutional Basis  : SYSTEM-CONSTITUTION SYS-GOV-019 / SYS-EVID-004 / SYS-EVID-006
Owner                 : SHARED EVIDENCE / DOCUMENT PLATFORM
Primary Domain Status : NOT A NEW PRIMARY DOMAIN
Program/Register ID   : NONE CREATED
Implementation        : NOT STARTED / NOT AUTHORIZED
Schema/Migration      : NOT AUTHORIZED
```

## 1. Rol ve canonical yerleşim

Bu belge, owner-ratified `RCV-CLAIM-FORM-P02-S08-D01A-OWNER-DECISION`
kararının minimum canonical evidentiary/document-source authority contract'ıdır.
`SYSTEM-CONSTITUTION` içindeki beş primary legal-operation domain'e yeni bir primary
domain eklemez; yeni program, roadmap veya Master Register identity üretmez.

`SYS-GOV-019` uyarınca Document Storage ile Audit/LegalEvidence shared/supporting
context olabilir. Bu belge o shared context'in yalnız document source identity,
version, integrity, extraction evidence ve lifecycle sınırını tanımlar. OFFICE,
CLIENT, DEBTOR, RECEIVABLE veya COLLECTION Domain Law'larını yeniden sahiplenmez.
`CLIENT-GOVERNANCE-CHARTER` XDC-E'deki “yeni DOCUMENT/PORTAL Domain Law oluşturulmaz”
sınırı korunur; bu belge Domain Law değil, owner-ratified bounded authority contract'tır.

## 2. Authority matrisi

| Fact / capability | Canonical owner | Consumer / sınır |
|---|---|---|
| Logical document identity | Shared Evidence / Document Platform | Case ve client views yalnız referans/projection tüketir |
| Document source identity | Shared Evidence / Document Platform | Receivable exact-version source reference tüketir |
| Document version ve lifecycle | Shared Evidence / Document Platform | Başka domain direct mutation yapamaz |
| Storage object | Shared Evidence / Document Platform | Storage key/path source identity değildir |
| Binary/content integrity | Document Platform canonical writer veya trusted storage adapter | Client-supplied hash authoritative değildir |
| Document classification version | Shared Evidence / Document Platform | Claim component classification üretmez |
| Source fingerprint | Shared Evidence / Document Platform | Receivable drift/fingerprint validation tüketir |
| OCR/extraction evidence | Shared Evidence / Document Platform | `O1 — DERIVED / NON-AUTHORITATIVE` |
| Reviewed document evidence | Shared Evidence / Document Platform | Canonical legal source olması ayrı owner/legal contract ister |
| Revocation, tombstone ve retention/legal-hold linkage | Shared Evidence / Document Platform | Retention period, destruction trigger ve legal-hold policy bu contract ile seçilmez |
| ClaimItem formation/admission | RECEIVABLE | Document lifecycle veya OCR owner'ı değildir |
| Actor, permission ve approval | OFFICE | Legal source/basis/classification/snapshot değildir |
| Case identity ve case access boundary | DEBTOR / CASE | Document version authority değildir |
| Receipt/Collection lifecycle | COLLECTION | Bu contract kapsamında değişmez |

## 3. Canonical aggregate yönü

```text
CaseDocument
  = stable logical document identity / aggregate root

CaseDocumentVersion
  = immutable semantic and content version

StorageObject
  = physical binary location and integrity object

DocumentExtractionEvidence
  = derived OCR/extraction evidence

ReviewedDocumentEvidence
  = optional immutable human-reviewed evidence
```

Mevcut `CaseDocument` modeli `LEGACY / INCOMPLETE PROJECTION`dır; canonical
versioned aggregate implementation evidence'ı değildir. Bu contract model, schema,
migration, writer veya resolver implementasyonu üretmez.

## 4. V4 — Immutable Version Entity + Versioned Fingerprint

Owner-ratified version modeli `V4` olarak sabittir:

- `updatedAt` source version değildir.
- Mevcut version mutate veya hard-delete edilmez.
- Binary replacement yeni document version üretir.
- Accepted document-classification change yeni version üretir.
- Legally meaningful metadata correction yeni version üretir.
- Filename-only change yeni semantic version üretmez.
- Storage-path relocation yeni semantic version üretmez.
- Revocation append-only lifecycle event'tir.
- Delete request tombstone/retention sürecidir.
- Case reassignment varsayılan olarak yasaktır.
- Same-binary re-upload, explicit revision command yoksa yeni logical document'tır.
- Hash equality legal identity equality değildir.

Retention/KVKK süresi, destruction trigger, anonymization yöntemi ve legal-hold
authority bu modelle seçilmez; bunlar ayrı owner/legal gate'leridir.

## 5. Storage ve content-hash attestation

Storage object authority Shared Evidence / Document Platform'dadır. Content-hash
attestation yalnız Document Platform canonical writer veya trusted storage adapter
tarafından üretilebilir.

- Client-supplied hash authoritative değildir.
- Binary hash exact bytes üzerinden server-side hesaplanır veya trusted provider
  attestation'ından bağımsız doğrulanır.
- Başlangıç algorithm direction `SHA-256`dır; algorithm ve version persist edilir.
- Storage path/key legal source identity değildir.
- Object relocation source fingerprint'i değiştirmez.
- Binary byte değişikliği yeni document version gerektirir.
- Verified binary hash taşımayan source version `ACTIVE` canonical Claim Formation
  source olamaz.

## 6. Versioned source fingerprint

Canonical fingerprint aşağıdaki versioned katmanlardan oluşur:

1. `binaryContentHash`
2. `documentEnvelopeHash`
3. `classificationHash`
4. `fingerprintAlgorithm` / `fingerprintVersion`

```text
SHA-256(
  versioned canonical serialization of:
  binaryContentHash
  + documentEnvelopeHash
  + classificationHash
  + fingerprintAlgorithm
  + fingerprintVersion
)
```

Serialization deterministic, locale-independent, stable-key-order ve
Unicode-normalized olmalı; null/absent ayrımını versioned biçimde korumalıdır.
Date ve money exact olmalı; floating-point normalization yasaktır. Raw OCR output
canonical source fingerprint'e varsayılan olarak dahil edilmez.

## 7. OCR / extraction evidence contract

```text
OCR RAW RESULT AUTHORITY : SHARED EVIDENCE / DOCUMENT PLATFORM
OCR CANONICAL STATUS     : O1 — DERIVED / NON-AUTHORITATIVE
```

- Raw OCR original legal source değildir.
- Raw OCR tek başına ClaimItem formation authority üretemez.
- OCR refresh veya provider/model/configuration değişikliği yeni extraction evidence
  üretir; document source version üretmez.
- Provider, model, version ve extraction configuration provenance olarak saklanır.
- Human-reviewed extraction ayrı immutable reviewed-evidence version olabilir.
- Reviewed evidence canonical legal source sayılmaz; ayrı explicit owner/legal
  contract gerekir.
- RECEIVABLE OCR extraction veya review lifecycle sahibi değildir.

## 8. Classification boundary

```text
DOCUMENT CLASSIFICATION != CLAIM COMPONENT CLASSIFICATION
```

Shared Evidence / Document Platform document type, evidence classification ve
document-classification version sahibidir. RECEIVABLE ClaimItem category/subtype,
formation admission ve legal-basis consumption sahibidir.

Document type'tan sessiz ClaimItem category fallback yasaktır. Unknown/generic
document otomatik `PRINCIPAL` veya `OTHER` üretemez. Deterministic classification
mümkün değilse `LEGAL_REVIEW_REQUIRED` üretilir. Document classification yalnız
candidate/evidence input'tur.

## 9. Canonical writer ve lifecycle sınırı

Aşağıdaki işlemlerin tek logical writer'ı Shared Evidence / Document Platform
canonical writer'ıdır:

- create logical document
- upload first version
- append document version
- update current-version pointer
- accept document classification
- append classification correction
- revoke veya tombstone
- append OCR/extraction evidence
- append reviewed evidence
- compute/attest source fingerprint

Canonical writer dışındaki direct ORM/Prisma write yasaktır. Current repository'de
writer bulunmaması halinde status:

```text
CONTRACT DEFINED
IMPLEMENTATION NOT STARTED
```

Web upload/delete client çağrıları canonical writer implementation evidence'ı değildir.

## 10. Receivable read-only consumer contract

RECEIVABLE yalnız side-effect-free, deterministic, tenant/case-scoped ve exact-version
capable source resolver tüketir:

```text
resolveCanonicalCaseDocumentSource({
  tenantId,
  caseId,
  caseDocumentId,
  requestedVersion,
  expectedFingerprint?
})
```

Başarılı sonuç en az şunları taşır:

```text
sourceType = CASE_DOCUMENT
documentId
versionId
version
binaryContentHash
documentEnvelopeHash
classificationHash
canonicalSourceFingerprint
fingerprintAlgorithm
fingerprintVersion
documentType
documentClassificationVersion
lifecycleStatus
availabilityStatus
opaque evidenceRefs
resolvedAt
```

Raw binary veya OCR text resolver response için zorunlu değildir. Fail-closed error
union:

```text
SOURCE_VERSION_NOT_FOUND
SOURCE_TENANT_MISMATCH
SOURCE_CASE_MISMATCH
SOURCE_REVOKED
FORMATION_SOURCE_UNAVAILABLE
SOURCE_FINGERPRINT_MISMATCH
SOURCE_CLASSIFICATION_UNRESOLVED
STALE_FORMATION_INTENT
LEGACY_SOURCE_VERSION_UNRESOLVED
```

## 11. Legacy disposition

Existing `CaseDocument` rows otomatik canonical source version değildir:

- fake version 1 üretilmez,
- `updatedAt` version yapılmaz,
- storage path identity yapılmaz,
- OCR canonical source yapılmaz,
- source fingerprint tahmin edilmez.

Canonical legacy disposition:

```text
LEGACY_SOURCE_VERSION_UNRESOLVED
```

Legacy bootstrap; storage/live-data access, privacy/retention review, hash computation,
migration ve operational execution için ayrı açık owner authority gerektirir.

## 12. Status ve non-authorizations

```text
OWNER DECISION                         OPTION D — RATIFIED
DOCUMENT AUTHORITY CONTRACT            DEFINED
DOCUMENT WRITER / RESOLVER             NOT IMPLEMENTED
DOCUMENT SCHEMA / MIGRATION            NOT AUTHORIZED
STORAGE / LIVE DB / LEGACY HASHING     NOT AUTHORIZED
OCR IMPLEMENTATION                     NOT AUTHORIZED
RECEIVABLE SOURCE CONSUMER IMPLEMENTATION NOT AUTHORIZED
LEGAL-BASIS VERSION AUTHORITY          OPEN
CLAIM FORMATION RUNTIME                UNCHANGED / PARTIAL THROUGH S08-I01 ONLY
```

Bu contract source writer, resolver, schema/migration, storage access, data access,
legacy bootstrap/backfill, OCR persistence, ClaimItem formation intent/snapshot,
client cutover veya production deployment authority'si üretmez.
