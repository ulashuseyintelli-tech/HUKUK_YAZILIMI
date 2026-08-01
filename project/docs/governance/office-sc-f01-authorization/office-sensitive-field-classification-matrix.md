# OFFICE-SC-F01 — Sensitive-field classification matrix

<!-- GOV-COORD-AUTHORITY kind=FIELD_CLASSIFICATION_MATRIX recordId=OFFICE-SC-F01-AUTHORIZATION-BREADTH-AND-SENSITIVE-PROJECTION-R01-FCM01 -->

## Status and scope

```text
PROGRAM     : REPOSITORY-WIDE-CAPABILITY-BINDING-ACTIVATION-AND-OPERABILITY-RECONCILIATION-R01
WAVE        : WAVE 1 — CRITICAL PATH
TASK        : OFFICE-SC-F01-AUTHORIZATION-BREADTH-AND-SENSITIVE-PROJECTION-R01
MODE        : GO-COMPLETE — STAGE 2 ONLY
BASE        : 9e55f0bf2b65fa3914087e6f5f21ad2c72eedd3e
SCOPE       : GET /lawyers/:id and GET /office sensitive-field projections
COUNT       : 109 unique canonical field paths; 107 response-emitted keys + 2 serializer-suppressed credentials
SCHEMA      : NONE
MIGRATION   : NONE
RUNTIME     : NOT ACTIVATED
```

The historical `75` audit number is not a target. The canonical count is the fresh
derived count below. Lawyer fields are listed once and annotated for both `L1` and
`OL` surfaces; endpoint reuse is not double-counted. No field was added or removed
to fit that historical number.

Authoritative production path:

```text
GET /lawyers/:id
  LawyerController.findOne
  → LawyerService.findOne(tenantId, id)
  → Prisma Lawyer findFirst (full scalar row)
  → withDisplayName
  → toPublicLawyer (uyapToken/eSignatureSerial removed)

GET /office
  OfficeController.getOffice
  → OfficeService.getPublicOffice
  → getOrCreate (Office + bankAccounts + active lawyers)
  → withPublicLawyers (uyapToken/eSignatureSerial removed from nested lawyers)
  → redactOfficeSecrets (smtpPass/smsApiKey/smsApiSecret value masked)
```

No `leave` or `terminationReason` path exists in this production surface and neither
is included here.

## Surface keys and projection vocabulary

| Key | Authoritative response path |
|---|---|
| `L1` | `GET /lawyers/:id` → `response.<field>` |
| `O` | `GET /office` → `response.<field>` |
| `B` | `GET /office` → `response.bankAccounts[].<field>` |
| `OL` | `GET /office` → `response.lawyers[].<field>` |

| Code | Default projection / authority / prohibition |
|---|---|
| `D0 / A0 / X0` | S0: action-explicit public-office projection only; authenticated office access does not make it public. Public, cross-office and unscoped bulk/export/report/event/audit/log/notification projections are prohibited. |
| `D1 / A1 / X1` | S1: server-side projection for authenticated, same-tenant/same-office and action-authorized access. Public and cross-office projection, unrestricted bulk/export and unscoped secondary surfaces are prohibited. |
| `D2 / A2 / X2` | S2: server-side omit/mask by default; exact field permission and purpose-bound action required. Own-record access is not full visibility. Ordinary staff, unscoped bulk/export/event/log/notification exposure is prohibited. |
| `D3 / A3 / X3` | S3: fail-closed omission; exact financial permission and action authorization required; OD-03 self-approval prohibition applies. Raw values in logs, analytics, events, notifications and broadly scoped export/report are prohibited. |
| `DH / AH / XH` | Secret/password/token/credential/cryptographic material: outside S0–S3 and hard-denied. No projection, export, event, audit, log or notification may carry the raw value. |

The classification follows owner OD-05 rules: semantic meaning controls; highest source
class is inherited by derived/copied/aliased/aggregate fields; references to sensitive
records inherit the target class; null/masked/hashed state does not lower class; unknown
nested content remains fail-closed.

## Fresh derived inventory

### Office scalar fields (`O`)

| # | Field/path | Surface | Semantic meaning | Class | Rationale | Default | Permitted authority | Prohibited surfaces |
|---:|---|---|---|---|---|---|---|---|
| 1 | `office.id` | O | Office record identifier | S1 | Internal operational identifier | D1 | A1 | X1 |
| 2 | `office.tenantId` | O | Tenant binding identifier | S1 | Internal boundary identifier | D1 | A1 | X1 |
| 3 | `office.name` | O | Public office name | S0 | Public office identity | D0 | A0 | X0 |
| 4 | `office.address` | O | Public office address | S0 | Public office contact/location | D0 | A0 | X0 |
| 5 | `office.city` | O | Public office city | S0 | Public office location | D0 | A0 | X0 |
| 6 | `office.district` | O | Public office district | S0 | Public office location | D0 | A0 | X0 |
| 7 | `office.postalCode` | O | Public office postal code | S0 | Public office address component | D0 | A0 | X0 |
| 8 | `office.phone` | O | Public office phone | S0 | Public office contact | D0 | A0 | X0 |
| 9 | `office.fax` | O | Public office fax | S0 | Public office contact | D0 | A0 | X0 |
| 10 | `office.email` | O | Public office email | S0 | Public office contact | D0 | A0 | X0 |
| 11 | `office.website` | O | Public office website | S0 | Public office contact | D0 | A0 | X0 |
| 12 | `office.barAssociation` | O | Office bar association | S0 | Public professional affiliation | D0 | A0 | X0 |
| 13 | `office.vergiNo` | O | Office tax identifier | S1 | Internal legal/operational identity | D1 | A1 | X1 |
| 14 | `office.vergiDairesi` | O | Office tax authority | S1 | Internal legal/operational identity | D1 | A1 | X1 |
| 15 | `office.mersisNo` | O | Office MERSIS identifier | S1 | Internal legal/operational identity | D1 | A1 | X1 |
| 16 | `office.kepAddress` | O | Office KEP address | S1 | Internal official communication address | D1 | A1 | X1 |
| 17 | `office.defaultExecutionOfficeId` | O | Default execution-office reference | S1 | Internal operational reference | D1 | A1 | X1 |
| 18 | `office.smtpHost` | O | SMTP host | S1 | Internal mail operation setting | D1 | A1 | X1 |
| 19 | `office.smtpPort` | O | SMTP port | S1 | Internal mail operation setting | D1 | A1 | X1 |
| 20 | `office.smtpUser` | O | SMTP account identifier | S1 | Internal mail operation identifier | D1 | A1 | X1 |
| 21 | `office.smtpPass` | O | SMTP credential secret | HARD-DENY | Password/credential material | DH | AH | XH |
| 22 | `office.smtpSecure` | O | SMTP transport security flag | S1 | Internal operation setting | D1 | A1 | X1 |
| 23 | `office.smtpFromName` | O | SMTP sender display name | S1 | Internal mail operation setting | D1 | A1 | X1 |
| 24 | `office.smtpFromEmail` | O | SMTP sender address | S1 | Internal mail operation setting | D1 | A1 | X1 |
| 25 | `office.smsProvider` | O | SMS provider name | S1 | Internal notification setting | D1 | A1 | X1 |
| 26 | `office.smsApiKey` | O | SMS API credential | HARD-DENY | Credential material | DH | AH | XH |
| 27 | `office.smsApiSecret` | O | SMS API secret | HARD-DENY | Credential material | DH | AH | XH |
| 28 | `office.smsSender` | O | SMS sender identity | S1 | Internal notification setting | D1 | A1 | X1 |
| 29 | `office.autoGreetingEnabled` | O | Greeting automation enabled flag | S1 | Internal workflow setting | D1 | A1 | X1 |
| 30 | `office.autoGreetingTime` | O | Greeting automation schedule | S1 | Internal scheduling metadata | D1 | A1 | X1 |
| 31 | `office.lastGreetingRunAt` | O | Last greeting run timestamp | S1 | Internal operational timestamp | D1 | A1 | X1 |
| 32 | `office.inactivityThresholdDays` | O | Inactivity threshold | S1 | Internal workflow policy setting | D1 | A1 | X1 |
| 33 | `office.inactivityWarningDays` | O | Inactivity warning threshold | S1 | Internal workflow policy setting | D1 | A1 | X1 |
| 34 | `office.escalationManagerLawyerIds` | O | Manager Lawyer references | S2 | Reference to personnel-sensitive records | D2 | A2 | X2 |
| 35 | `office.escalationFounderLawyerIds` | O | Founder Lawyer references | S2 | Reference to personnel-sensitive records | D2 | A2 | X2 |
| 36 | `office.opReminderDays` | O | Operational reminder interval | S1 | Internal scheduling metadata | D1 | A1 | X1 |
| 37 | `office.opFounderDays` | O | Founder escalation interval | S1 | Internal scheduling metadata | D1 | A1 | X1 |
| 38 | `office.opRepeatMonths` | O | Operational repeat interval | S1 | Internal scheduling metadata | D1 | A1 | X1 |
| 39 | `office.opEmailEnabled` | O | Email notification enabled flag | S1 | Internal notification setting | D1 | A1 | X1 |
| 40 | `office.opSmsEnabled` | O | SMS notification enabled flag | S1 | Internal notification setting | D1 | A1 | X1 |
| 41 | `office.opStaffTypes` | O | Staff-type routing list | S1 | Internal operational routing metadata | D1 | A1 | X1 |
| 42 | `office.escalationTeamLeadLawyerIds` | O | Team-lead Lawyer references | S2 | Reference to personnel-sensitive records | D2 | A2 | X2 |
| 43 | `office.caseTaskOwnerDays` | O | Case-task owner SLA | S1 | Internal workflow policy setting | D1 | A1 | X1 |
| 44 | `office.caseTaskTeamLeadDays` | O | Case-task team-lead SLA | S1 | Internal workflow policy setting | D1 | A1 | X1 |
| 45 | `office.caseTaskManagerDays` | O | Case-task manager SLA | S1 | Internal workflow policy setting | D1 | A1 | X1 |
| 46 | `office.poaExpiryNotificationEnabled` | O | POA expiry notification flag | S1 | Internal workflow setting | D1 | A1 | X1 |
| 47 | `office.poaExpiryThresholdDays` | O | POA expiry warning window | S1 | Internal scheduling metadata | D1 | A1 | X1 |
| 48 | `office.poaExpiryRecipientLawyerIds` | O | POA recipient Lawyer references | S2 | Reference to personnel-sensitive records | D2 | A2 | X2 |
| 49 | `office.createdAt` | O | Office creation timestamp | S1 | Internal operational timestamp | D1 | A1 | X1 |
| 50 | `office.updatedAt` | O | Office update timestamp | S1 | Internal operational timestamp | D1 | A1 | X1 |

### Office bank-account fields (`B`)

| # | Field/path | Surface | Semantic meaning | Class | Rationale | Default | Permitted authority | Prohibited surfaces |
|---:|---|---|---|---|---|---|---|---|
| 51 | `office.bankAccounts[].id` | B | Bank-account record identifier | S3 | Financial-record identifier | D3 | A3 | X3 |
| 52 | `office.bankAccounts[].officeId` | B | Owning Office reference | S1 | Office-bound operational reference | D1 | A1 | X1 |
| 53 | `office.bankAccounts[].bankName` | B | Bank name | S3 | Bank-account data | D3 | A3 | X3 |
| 54 | `office.bankAccounts[].branchName` | B | Bank branch | S3 | Bank-account data | D3 | A3 | X3 |
| 55 | `office.bankAccounts[].iban` | B | IBAN | S3 | Owner exact example: IBAN | D3 | A3 | X3 |
| 56 | `office.bankAccounts[].accountName` | B | Account holder name | S3 | Bank-account data | D3 | A3 | X3 |
| 57 | `office.bankAccounts[].isDefault` | B | Default-account flag | S3 | Financial-record metadata | D3 | A3 | X3 |
| 58 | `office.bankAccounts[].createdAt` | B | Bank-account creation timestamp | S3 | Financial-record metadata | D3 | A3 | X3 |
| 59 | `office.bankAccounts[].updatedAt` | B | Bank-account update timestamp | S3 | Financial-record metadata | D3 | A3 | X3 |

### Lawyer fields (`L1` and `OL`)

The `L1` path is `response.<field>` and the `OL` path is
`response.lawyers[].<field>`. The two credential fields are fetched by the source
read but removed by `toPublicLawyer`; they remain in this review inventory as
`HARD-DENY` paths.

| # | Field/path | Surface | Semantic meaning | Class | Rationale | Default | Permitted authority | Prohibited surfaces |
|---:|---|---|---|---|---|---|---|---|
| 60 | `lawyer.id` | L1, OL | Lawyer record identifier | S1 | Internal operational identifier | D1 | A1 | X1 |
| 61 | `lawyer.tenantId` | L1, OL | Tenant binding identifier | S1 | Internal boundary identifier | D1 | A1 | X1 |
| 62 | `lawyer.officeId` | L1, OL | Office membership reference | S1 | Internal organizational reference | D1 | A1 | X1 |
| 63 | `lawyer.name` | L1, OL | Lawyer given name | S1 | Internal personnel identity; publication not proven | D1 | A1 | X1 |
| 64 | `lawyer.surname` | L1, OL | Lawyer family name | S1 | Internal personnel identity; publication not proven | D1 | A1 | X1 |
| 65 | `lawyer.tckn` | L1, OL | Turkish national identity number | S2 | Owner exact example: TCKN | D2 | A2 | X2 |
| 66 | `lawyer.gender` | L1, OL | Gender | S2 | Identity/personal data | D2 | A2 | X2 |
| 67 | `lawyer.title` | L1, OL | Internal title/profile label | S1 | Internal job title; publication not proven | D1 | A1 | X1 |
| 68 | `lawyer.barNumber` | L1, OL | Bar registration number | S0 | Public professional record semantics | D0 | A0 | X0 |
| 69 | `lawyer.barCity` | L1, OL | Bar registration city | S0 | Public professional record semantics | D0 | A0 | X0 |
| 70 | `lawyer.tbbNo` | L1, OL | TBB professional identifier | S0 | Public professional record semantics | D0 | A0 | X0 |
| 71 | `lawyer.lawyerType` | L1, OL | Professional lawyer type | S1 | Internal professional classification | D1 | A1 | X1 |
| 72 | `lawyer.vergiDairesi` | L1, OL | Lawyer tax authority | S2 | Person-linked identity/tax data | D2 | A2 | X2 |
| 73 | `lawyer.vergiNo` | L1, OL | Lawyer tax identifier | S2 | Person-linked identity/tax data | D2 | A2 | X2 |
| 74 | `lawyer.email` | L1, OL | Person-linked email | S2 | Owner exact example: personal email | D2 | A2 | X2 |
| 75 | `lawyer.phone` | L1, OL | Person-linked office phone | S2 | Person-linked contact data | D2 | A2 | X2 |
| 76 | `lawyer.mobilePhone` | L1, OL | Person-linked mobile phone | S2 | Owner exact example: personal phone | D2 | A2 | X2 |
| 77 | `lawyer.whatsappPhone` | L1, OL | Person-linked WhatsApp phone | S2 | Person-linked contact data | D2 | A2 | X2 |
| 78 | `lawyer.fax` | L1, OL | Person-linked fax | S2 | Person-linked contact data | D2 | A2 | X2 |
| 79 | `lawyer.address` | L1, OL | Person-linked address | S2 | Owner exact example: personal address | D2 | A2 | X2 |
| 80 | `lawyer.city` | L1, OL | Person-linked city | S2 | Person-linked address data | D2 | A2 | X2 |
| 81 | `lawyer.district` | L1, OL | Person-linked district | S2 | Person-linked address data | D2 | A2 | X2 |
| 82 | `lawyer.bankName` | L1, OL | Lawyer bank name | S3 | Bank-account data | D3 | A3 | X3 |
| 83 | `lawyer.branchName` | L1, OL | Lawyer bank branch | S3 | Bank-account data | D3 | A3 | X3 |
| 84 | `lawyer.iban` | L1, OL | Lawyer IBAN | S3 | Owner exact example: IBAN | D3 | A3 | X3 |
| 85 | `lawyer.isInHouseCounsel` | L1, OL | In-house counsel status | S1 | Employment/workflow status | D1 | A1 | X1 |
| 86 | `lawyer.isEmployee` | L1, OL | Employee status | S1 | Employment/workflow status | D1 | A1 | X1 |
| 87 | `lawyer.lawyerRank` | L1, OL | Internal lawyer rank | S1 | Internal role/rank | D1 | A1 | X1 |
| 88 | `lawyer.canApproveOfficeActions` | L1, OL | Office approval capability flag | S1 | Internal authorization metadata | D1 | A1 | X1 |
| 89 | `lawyer.defaultPermissions` | L1, OL | Default permission JSON | S1 | Internal authorization configuration; unknown nested keys fail closed | D1 | A1 | X1 |
| 90 | `lawyer.permissionsLocked` | L1, OL | Permission-lock flag | S1 | Internal authorization metadata | D1 | A1 | X1 |
| 91 | `lawyer.permissionsLockedBy` | L1, OL | Locking Lawyer reference | S2 | Reference to personnel-sensitive record | D2 | A2 | X2 |
| 92 | `lawyer.permissionsLockedAt` | L1, OL | Permission-lock timestamp | S1 | Internal operational timestamp | D1 | A1 | X1 |
| 93 | `lawyer.canModifyOtherPermissions` | L1, OL | Permission-management capability | S1 | Internal authorization metadata | D1 | A1 | X1 |
| 94 | `lawyer.role` | L1, OL | Legacy internal Lawyer role | S1 | Internal role metadata | D1 | A1 | X1 |
| 95 | `lawyer.canSign` | L1, OL | Signature capability flag | S1 | Internal authorization metadata | D1 | A1 | X1 |
| 96 | `lawyer.canAppearInUyap` | L1, OL | UYAP appearance capability | S1 | Internal operational capability | D1 | A1 | X1 |
| 97 | `lawyer.canBeResponsible` | L1, OL | Case-responsibility capability | S1 | Internal assignment capability | D1 | A1 | X1 |
| 98 | `lawyer.isDefaultForNewCases` | L1, OL | Default assignment flag | S1 | Internal assignment metadata | D1 | A1 | X1 |
| 99 | `lawyer.uyapUsername` | L1, OL | UYAP account username | S1 | Internal external-system identifier; not a secret | D1 | A1 | X1 |
| 100 | `lawyer.uyapToken` | L1, OL | UYAP token | HARD-DENY | Token/credential material; serializer removes it | DH | AH | XH |
| 101 | `lawyer.eSignatureSerial` | L1, OL | Electronic-signature credential serial | HARD-DENY | Credential/cryptographic material; serializer removes it | DH | AH | XH |
| 102 | `lawyer.isActive` | L1, OL | Active/inactive status | S1 | Employment/workflow status | D1 | A1 | X1 |
| 103 | `lawyer.sortOrder` | L1, OL | Internal list ordering | S1 | Non-sensitive operational metadata | D1 | A1 | X1 |
| 104 | `lawyer.barName` | L1, OL | Legacy bar name | S0 | Public professional record semantics | D0 | A0 | X0 |
| 105 | `lawyer.identityNo` | L1, OL | Deprecated identity number | S2 | Identity data; inherits TCKN semantics | D2 | A2 | X2 |
| 106 | `lawyer.createdAt` | L1, OL | Lawyer creation timestamp | S2 | Personnel-linked audit metadata | D2 | A2 | X2 |
| 107 | `lawyer.updatedAt` | L1, OL | Lawyer update timestamp | S2 | Personnel-linked audit metadata | D2 | A2 | X2 |
| 108 | `lawyer.userId` | L1, OL | Linked application-user reference | S1 | Internal account binding; publication not proven | D1 | A1 | X1 |

### Derived field

| # | Field/path | Surface | Semantic meaning | Class | Rationale | Default | Permitted authority | Prohibited surfaces |
|---|---|---|---|---|---|---|---|---|
| 109 | `lawyer.displayName` | L1 | `withDisplayName` output from name/surname/title/role | S1 | Derived internal profile; inherits highest source class | D1 | A1 | X1 |

## Count reconciliation

```text
Office scalar paths                         50
OfficeBankAccount scalar paths               9
Lawyer scalar paths                         49
Derived displayName                          1
----------------------------------------------
Fresh reviewed inventory (unique fields)   109

Lawyer credential paths suppressed           2
Response-emitted keys (including masked     107
office secrets and derived displayName)
```

`GET /office` does not add `displayName`; its nested lawyers use `withPublicLawyers`
only. `GET /lawyers/:id` adds `displayName` and removes the two credential keys.

## Non-projection and boundary rules

- This matrix is policy materialization only. It does not implement masking, field
  selection, authorization, schema, migration or production activation.
- `GET /lawyers/:id` and `GET /office` remain tenant-bound entrypoints. Object access,
  office membership, field visibility and final approval are distinct gates.
- API, bulk, export, report, event, audit, log and notification consumers inherit the
  class and prohibition of the source path; no consumer may widen a class.
- `defaultPermissions` is known as the existing permission-object contract. Unknown
  nested keys or newly introduced fields are `UNCLASSIFIED / DENY` until separately
  proven; they do not silently become S1.
- No production activation or Office implementation is authorized by this document.

## Evidence anchors

- `project/apps/api/src/modules/lawyer/lawyer.controller.ts` — `GET /lawyers/:id`.
- `project/apps/api/src/modules/lawyer/lawyer.service.ts` — full-row `findOne`, then
  `withDisplayName` and `toPublicLawyer`.
- `project/apps/api/src/modules/lawyer/lawyer-public-projection.ts` — exactly two
  serializer-suppressed credential fields.
- `project/apps/api/src/modules/office/office.controller.ts` — `GET /office`.
- `project/apps/api/src/modules/office/office.service.ts` — Office, bank-account and
  active-lawyer include plus secret masking.
- `project/apps/api/prisma/schema.prisma` — Office, OfficeBankAccount and Lawyer
  scalar fields and their relations.
- `project/docs/governance/OFFICE-GOVERNANCE.md §20` — existing minimization baseline.
