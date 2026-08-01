# OFFICE-SC-F01 — Authorization and sensitive-projection decision matrix

<!-- GOV-COORD-AUTHORITY kind=AUTHORIZATION_DECISION_MATRIX recordId=OFFICE-SC-F01-AUTHORIZATION-BREADTH-AND-SENSITIVE-PROJECTION-R01-ADM01 -->

## Status and binding

```text
PROGRAM       : REPOSITORY-WIDE-CAPABILITY-BINDING-ACTIVATION-AND-OPERABILITY-RECONCILIATION-R01
WAVE          : WAVE 1 — CRITICAL PATH
TASK          : OFFICE-SC-F01-AUTHORIZATION-BREADTH-AND-SENSITIVE-PROJECTION-R01
MODE          : GO-COMPLETE — STAGE 2 ONLY
BASE          : 9e55f0bf2b65fa3914087e6f5f21ad2c72eedd3e
SEMANTIC_REF  : OFFICE-SC-F01-AUTHORIZATION-BREADTH-AND-SENSITIVE-PROJECTION-R01-SA01
FIELD_MATRIX  : office-sensitive-field-classification-matrix.md (fresh derived count: 109 unique fields)
SCHEMA        : NONE
MIGRATION     : NONE
RUNTIME       : NOT ACTIVATED
```

This document materializes the owner-ratified F01 decision surface. It is a
governance artifact, not a product-code change. The historical `75` metric is
not used as a target or prerequisite; the field matrix is authoritative only
for the fresh production paths it actually derives.

## Canonical actor and approval mapping

| Decision | Binding rule | Negative boundary |
|---|---|---|
| OD-01 — authenticated entry | The entrypoint requires the existing JWT authentication guard and must resolve a tenant-bound subject before any projection is returned. | Missing/invalid subject or tenant context fails closed; authentication alone does not grant unrestricted field visibility. |
| OD-02 — final approver mapping | The canonical allowlist is `UserRole.ADMIN`, canonical `lawyerRank.PARTNER`, canonical `lawyerRank.MANAGER`, or a canonical Lawyer who is not staff/personnel and has `canApproveOfficeActions=true`. No `SUPER_ADMIN` enum/role is introduced. | A staff/personnel record is never a final approver, even if `canApproveOfficeActions=true`. Action-specific narrower policies override this general allowlist. |
| OD-03 — self approval | Requester and final approver must be distinct for actions covered by the self-approval rule. | `approverUserId === requesterUserId` is denied before approval mutation. |
| OD-04 — tenant/office boundary | The subject, target record and approval identity must remain in the canonical tenant and applicable Office scope. | Cross-tenant or cross-office access is denied by default; rank, ADMIN status or delegation does not itself create a cross-office override. |
| OD-05 — sensitive-field semantics | Every fresh path is classified by real meaning using S0, S1, S2, S3 or HARD-DENY. The companion matrix contains the complete derived inventory and per-row projection rules. | No field is invented or removed to reach a historical count. Unknown nested content is `UNCLASSIFIED / DENY`; `leave` and `terminationReason` are absent because no production path exists. |
| OD-06 — own-record boundary | A subject reading a record about itself does not receive full visibility. | S2, S3 and HARD-DENY fields remain subject to their exact field/action policy. |
| OD-07 — server-side projection | Authorization and projection are enforced at the server-side response boundary; client/UI filtering is not an authority. | Missing policy, ambiguous field meaning or unhandled nested data fails closed. |
| OD-08 — secondary consumers | API, bulk, export, report, event, audit, log and notification projections inherit the source field class and prohibition. | A secondary consumer may not widen visibility or carry raw HARD-DENY, S3 or prohibited S2 values. |

## Exact F01 entrypoint matrix

| Action / entrypoint | Authentication | Tenant boundary (verified) | Office/action authorization (current code) | Current projection evidence | Owner policy outcome | Status after Stage 2 |
|---|---|---|---|---|---|---|
| `GET /lawyers/:id` | `JwtAuthGuard` at `LawyerController` | `LawyerService.findOne` queries `id + tenantId` | No same-office or field-level authorization guard is present on this read | Prisma full scalar Lawyer row → `withDisplayName` → `toPublicLawyer`; only `uyapToken` and `eSignatureSerial` are removed | Apply OD-01–OD-08 and the fresh matrix; S0 is action-explicit, S1 is same-office/action-authorized, S2/S3 fail closed by exact policy, HARD-DENY never projects | **POLICY MATERIALIZED / RUNTIME NOT REMEDIATED** |
| `GET /office` | `JwtAuthGuard` at `OfficeController` | `OfficeService.getOrCreate` is tenant-scoped; Office, bank accounts and active Lawyers are loaded for that tenant | No same-office or field-level authorization guard is present on this read | Office secrets are value-masked (`smtpPass`, `smsApiKey`, `smsApiSecret`); nested Lawyers pass through credential suppression; bank-account and other sensitive fields remain in the broad object | Apply OD-01–OD-08 and the fresh matrix; bank-account fields are S3, personnel fields are S2, credentials are HARD-DENY even when masked | **POLICY MATERIALIZED / RUNTIME NOT REMEDIATED** |

## Projection contract

- `S0` is public only when the action explicitly requires a public-office or
  expressly approved professional projection; an authenticated Office user is
  not thereby a public consumer.
- `S1` defaults to authenticated, same-tenant, same-office and
  action-authorized server-side projection.
- `S2` defaults to server-side omission or masking and requires exact
  field-level permission. Own-record access is not full visibility.
- `S3` defaults to fail-closed omission and requires exact financial
  permission plus action authorization. Raw values do not enter logs,
  analytics, events or notifications.
- Secrets, passwords, tokens, credentials and cryptographic material are
  `HARD-DENY`, outside the S0–S3 projection model.
- Derived, copied, aliased, aggregate and foreign-key/reference paths inherit
  the highest relevant source or target class. Null, masked or hashed values
  do not lower the class.

## Explicit non-authorizations

This Stage 2 materialization does not authorize Office product implementation,
JWT or projection remediation, schema or migration work, production
activation, dormant endpoint activation, cross-tenant enablement, a new legal
or authorization policy, a new role/enum, or any successor task. After the
Stage 2 governance PR is merged and verified, the executor stops; the program
lock remains active.

## Evidence anchors

- `project/apps/api/src/modules/lawyer/lawyer.controller.ts` — JWT guard and
  `GET /lawyers/:id` entrypoint.
- `project/apps/api/src/modules/lawyer/lawyer.service.ts` — tenant-bound full
  row read and public response path.
- `project/apps/api/src/modules/lawyer/lawyer-public-projection.ts` — the two
  serializer-suppressed credentials.
- `project/apps/api/src/modules/office/office.controller.ts` — JWT guard and
  `GET /office` entrypoint.
- `project/apps/api/src/modules/office/office.service.ts` — tenant-scoped
  Office aggregate read and secret masking.
- `project/apps/api/prisma/schema.prisma` — fresh Office, OfficeBankAccount and
  Lawyer scalar inventory.
- `project/docs/governance/office-sc-f01-authorization/office-sensitive-field-classification-matrix.md`
  — 109-path derivation and row-level classification.
