# RBR-R01-T06 — P1 disposition matrix and pre-activation acceptance

## Evidence contract

The matrix below is a record-level reconciliation of the accepted
`RBR-R01-T05` result against fresh canonical code. All 33 backend records are
`CODE_PRESENT_UNBOUND`; no row authorizes binding. Shared evidence references
are deliberately explicit so that a later activation task must re-check the
actual graph rather than treating this document as runtime proof.

Shared references:

* `E-CROSS`: `project/docs/audit/runtime-binding-reconciliation-r01/unbound-and-dormant-register.md:62`; `project/apps/api/src/modules/calc-preview/break-glass/controllers/cross-tenant-access.controller.ts`; `project/apps/api/src/modules/calc-preview/break-glass/break-glass.module.ts:62`; reachable graph check in `project/apps/api/src/app.module.ts` and `project/apps/api/src/modules/calc-preview/calc-preview.module.ts`.
* `E-BREAK`: `project/docs/audit/runtime-binding-reconciliation-r01/unbound-and-dormant-register.md:61`; `project/apps/api/src/modules/calc-preview/break-glass/controllers/break-glass.controller.ts`; `project/apps/api/src/modules/calc-preview/break-glass/break-glass.module.ts:62`; reachable graph check in `project/apps/api/src/app.module.ts` and `project/apps/api/src/modules/calc-preview/calc-preview.module.ts`.
* `E-MANIFEST`: `project/docs/audit/runtime-binding-reconciliation-r01/unbound-and-dormant-register.md:82`; `project/apps/api/src/modules/calc-preview/diagnostics/object-store/manifest-retry/manifest-admin.controller.ts`; no production module controller registration found by the T05 graph scan.
* `E-PLAYBOOK`: `project/docs/audit/runtime-binding-reconciliation-r01/unbound-and-dormant-register.md:90`; `project/apps/api/src/modules/calc-preview/diagnostics/playbook/playbook.controller.ts`; `project/apps/api/src/modules/calc-preview/diagnostics/playbook/playbook.module.ts`; no `PlaybookModule` import in the reachable `DiagnosticsModule` graph.
* `E-UI`: `project/apps/web/src/app/(dashboard)/clients/[clientId]/accounting/page.tsx:1`; navigation consumers at `project/apps/web/src/app/(dashboard)/clients/[clientId]/page.tsx:32` and `project/apps/web/src/app/(dashboard)/settings/clients/page.tsx:559`.

## 33 backend records

| # | capabilityId | implementation / route | binding, guard and consumer evidence | current classification | T06 disposition |
|---:|---|---|---|---|---|
| 1 | `HTTP-054B0508E07D` | `CrossTenantAccessController.getLegalHold` — `GET /api/api/v1/internal-ops/cross-tenant/:tenantId/legal-holds/:holdId` | `E-CROSS`; `BreakGlassKillSwitchGuard`, `NetworkAllowlistGuard`, `TenantContextGuard`, `InternalOpsGuard`, `BreakGlassGrantGuard`; no reachable consumer | `CODE_PRESENT_UNBOUND` | `KEEP_DORMANT / DO_NOT_BIND` |
| 2 | `HTTP-2F45FFAB19CE` | `CrossTenantAccessController.blockPut` — `PUT /api/api/v1/internal-ops/cross-tenant/:tenantId/*` | `E-CROSS`; same cross-tenant guard chain; no reachable consumer | `CODE_PRESENT_UNBOUND` | `KEEP_DORMANT / DO_NOT_BIND` |
| 3 | `HTTP-3F3BCA2293F5` | `CrossTenantAccessController.getSnapshot` — `GET /api/api/v1/internal-ops/cross-tenant/:tenantId/snapshots/:snapshotId` | `E-CROSS`; same cross-tenant guard chain; no reachable consumer | `CODE_PRESENT_UNBOUND` | `KEEP_DORMANT / DO_NOT_BIND` |
| 4 | `HTTP-694C905C4131` | `CrossTenantAccessController.blockPatch` — `PATCH /api/api/v1/internal-ops/cross-tenant/:tenantId/*` | `E-CROSS`; same cross-tenant guard chain; no reachable consumer | `CODE_PRESENT_UNBOUND` | `KEEP_DORMANT / DO_NOT_BIND` |
| 5 | `HTTP-8A5F22B0F914` | `CrossTenantAccessController.listSnapshots` — `GET /api/api/v1/internal-ops/cross-tenant/:tenantId/snapshots` | `E-CROSS`; same cross-tenant guard chain; no reachable consumer | `CODE_PRESENT_UNBOUND` | `KEEP_DORMANT / DO_NOT_BIND` |
| 6 | `HTTP-C0593CE2185B` | `CrossTenantAccessController.blockPost` — `POST /api/api/v1/internal-ops/cross-tenant/:tenantId/*` | `E-CROSS`; same cross-tenant guard chain; no reachable consumer | `CODE_PRESENT_UNBOUND` | `KEEP_DORMANT / DO_NOT_BIND` |
| 7 | `HTTP-CB8DA0AB111B` | `CrossTenantAccessController.blockDelete` — `DELETE /api/api/v1/internal-ops/cross-tenant/:tenantId/*` | `E-CROSS`; same cross-tenant guard chain; no reachable consumer | `CODE_PRESENT_UNBOUND` | `KEEP_DORMANT / DO_NOT_BIND` |
| 8 | `HTTP-F4A23B0C8754` | `CrossTenantAccessController.listLegalHolds` — `GET /api/api/v1/internal-ops/cross-tenant/:tenantId/legal-holds` | `E-CROSS`; same cross-tenant guard chain; no reachable consumer | `CODE_PRESENT_UNBOUND` | `KEEP_DORMANT / DO_NOT_BIND` |
| 9 | `HTTP-0B28437D962E` | `BreakGlassController.revokeGrant` — `POST /api/api/v1/internal-ops/break-glass/revoke` | `E-BREAK`; base break-glass guards plus `BreakGlassApproverGuard`; no reachable consumer | `CODE_PRESENT_UNBOUND` | `KEEP_DORMANT / HARDEN_BEFORE_BIND` |
| 10 | `HTTP-122183895FD0` | `BreakGlassController.renewGrant` — `POST /api/api/v1/internal-ops/break-glass/renew` | `E-BREAK`; base break-glass guards; renew-approver policy is not yet canonical; no reachable consumer | `CODE_PRESENT_UNBOUND` | `KEEP_DORMANT / HARDEN_BEFORE_BIND` |
| 11 | `HTTP-1287CD839964` | `BreakGlassController.denyRequest` — `POST /api/api/v1/internal-ops/break-glass/deny` | `E-BREAK`; base guards plus `BreakGlassApproverGuard`; no reachable consumer | `CODE_PRESENT_UNBOUND` | `KEEP_DORMANT / HARDEN_BEFORE_BIND` |
| 12 | `HTTP-B0B542D6B1E4` | `BreakGlassController.getRequestStatus` — `GET /api/api/v1/internal-ops/break-glass/status/:requestId` | `E-BREAK`; base break-glass guards; no reachable consumer | `CODE_PRESENT_UNBOUND` | `KEEP_DORMANT / HARDEN_BEFORE_BIND` |
| 13 | `HTTP-E8DDE1EC0E7B` | `BreakGlassController.approveRequest` — `POST /api/api/v1/internal-ops/break-glass/approve` | `E-BREAK`; base guards plus `BreakGlassApproverGuard`; no reachable consumer | `CODE_PRESENT_UNBOUND` | `KEEP_DORMANT / HARDEN_BEFORE_BIND` |
| 14 | `HTTP-FEB481815B69` | `BreakGlassController.createRequest` — `POST /api/api/v1/internal-ops/break-glass/request` | `E-BREAK`; base break-glass guards; no reachable consumer | `CODE_PRESENT_UNBOUND` | `KEEP_DORMANT / HARDEN_BEFORE_BIND` |
| 15 | `HTTP-061BBAAB776C` | `ManifestAdminController.queryDlqWithCursor` — `GET /api/admin/manifest/retry/dlq` | `E-MANIFEST`; `ManifestAdminAuthGuard`, `ManifestAdminRateLimitGuard`; no production controller registration | `CODE_PRESENT_UNBOUND` | `KEEP_DORMANT / HARDEN_BEFORE_BIND` |
| 16 | `HTTP-0750799664CC` | `ManifestAdminController.queryDlq` — `GET /api/admin/manifest/dlq` | `E-MANIFEST`; same admin guards; no production controller registration | `CODE_PRESENT_UNBOUND` | `KEEP_DORMANT / HARDEN_BEFORE_BIND` |
| 17 | `HTTP-3F5457860C4F` | `ManifestAdminController.retryManifest` — `POST /api/admin/manifest/bundles/:bundleId/retry` | `E-MANIFEST`; same admin guards; retry idempotency and operational consumer remain prerequisites | `CODE_PRESENT_UNBOUND` | `KEEP_DORMANT / HARDEN_BEFORE_BIND` |
| 18 | `HTTP-512B39B42D1E` | `ManifestAdminController.resolveDlqEntry` — `POST /api/admin/manifest/dlq/:dlqId/resolve` | `E-MANIFEST`; same admin guards; no production controller registration | `CODE_PRESENT_UNBOUND` | `KEEP_DORMANT / HARDEN_BEFORE_BIND` |
| 19 | `HTTP-A8EA32B0039F` | `ManifestAdminController.redriveDlqEntry` — `POST /api/admin/manifest/dlq/:dlqId/redrive` | `E-MANIFEST`; same admin guards; retry idempotency and operational consumer remain prerequisites | `CODE_PRESENT_UNBOUND` | `KEEP_DORMANT / HARDEN_BEFORE_BIND` |
| 20 | `HTTP-BCE31FB68E56` | `ManifestAdminController.getRetryQueueStats` — `GET /api/admin/manifest/retry-queue` | `E-MANIFEST`; same admin guards; no production controller registration | `CODE_PRESENT_UNBOUND` | `KEEP_DORMANT / HARDEN_BEFORE_BIND` |
| 21 | `HTTP-D17C40F4DDEF` | `ManifestAdminController.queryJobsWithCursor` — `GET /api/admin/manifest/retry/jobs` | `E-MANIFEST`; same admin guards; no production controller registration | `CODE_PRESENT_UNBOUND` | `KEEP_DORMANT / HARDEN_BEFORE_BIND` |
| 22 | `HTTP-0A09A41C13F4` | `PlaybookController.getAudit` — `GET /api/calc/diagnostics/playbooks/:id/audit` | `E-PLAYBOOK`; no controller guard; optional request headers are not canonical actor proof; no reachable consumer | `CODE_PRESENT_UNBOUND` | `PRE-ACTIVATION HARDENING REQUIRED` |
| 23 | `HTTP-0AFC7C5E803D` | `PlaybookController.listPlaybooks` — `GET /api/calc/diagnostics/playbooks` | `E-PLAYBOOK`; no controller guard; optional `x-tenant-id`/`x-user-id`; no reachable consumer | `CODE_PRESENT_UNBOUND` | `PRE-ACTIVATION HARDENING REQUIRED` |
| 24 | `HTTP-1476C5EBE31C` | `PlaybookController.disablePlaybook` — `POST /api/calc/diagnostics/playbooks/:id/disable` | `E-PLAYBOOK`; no action-level authorization; header actor risk; no reachable consumer | `CODE_PRESENT_UNBOUND` | `PRE-ACTIVATION HARDENING REQUIRED` |
| 25 | `HTTP-374140E88658` | `PlaybookController.pausePlaybook` — `POST /api/calc/diagnostics/playbooks/:id/pause` | `E-PLAYBOOK`; no action-level authorization; header actor risk; no reachable consumer | `CODE_PRESENT_UNBOUND` | `PRE-ACTIVATION HARDENING REQUIRED` |
| 26 | `HTTP-7D5397E6B29D` | `PlaybookController.changeMode` — `POST /api/calc/diagnostics/playbooks/:id/mode` | `E-PLAYBOOK`; no action-level authorization; header actor risk; no reachable consumer | `CODE_PRESENT_UNBOUND` | `PRE-ACTIVATION HARDENING REQUIRED` |
| 27 | `HTTP-7F725AE79F00` | `PlaybookController.getPlaybook` — `GET /api/calc/diagnostics/playbooks/:id` | `E-PLAYBOOK`; no controller guard; header actor risk; no reachable consumer | `CODE_PRESENT_UNBOUND` | `PRE-ACTIVATION HARDENING REQUIRED` |
| 28 | `HTTP-8B0F2D8ED677` | `PlaybookController.enablePlaybook` — `POST /api/calc/diagnostics/playbooks/:id/enable` | `E-PLAYBOOK`; no action-level authorization; header actor risk; no reachable consumer | `CODE_PRESENT_UNBOUND` | `PRE-ACTIVATION HARDENING REQUIRED` |
| 29 | `HTTP-8DF1B58D01DA` | `PlaybookController.runPlaybook` — `POST /api/calc/diagnostics/playbooks/:id/run` | `E-PLAYBOOK`; no action-level authorization; header actor risk; no reachable consumer | `CODE_PRESENT_UNBOUND` | `PRE-ACTIVATION HARDENING REQUIRED` |
| 30 | `HTTP-A91DFB0F1A75` | `PlaybookController.exportAudit` — `GET /api/calc/diagnostics/playbooks/:id/audit/export` | `E-PLAYBOOK`; no controller guard; audit attribution not enforced; no reachable consumer | `CODE_PRESENT_UNBOUND` | `PRE-ACTIVATION HARDENING REQUIRED` |
| 31 | `HTTP-AA8995F0FE23` | `PlaybookController.getHealth` — `GET /api/calc/diagnostics/playbooks/_health` | `E-PLAYBOOK`; no controller guard; health route is not an activation authority; no reachable consumer | `CODE_PRESENT_UNBOUND` | `PRE-ACTIVATION HARDENING REQUIRED` |
| 32 | `HTTP-B4EC7B1A7044` | `PlaybookController.resumePlaybook` — `POST /api/calc/diagnostics/playbooks/:id/resume` | `E-PLAYBOOK`; no action-level authorization; header actor risk; no reachable consumer | `CODE_PRESENT_UNBOUND` | `PRE-ACTIVATION HARDENING REQUIRED` |
| 33 | `HTTP-DC99913A6A4C` | `PlaybookController.evaluatePlaybook` — `POST /api/calc/diagnostics/playbooks/:id/evaluate` | `E-PLAYBOOK`; no action-level authorization; header actor risk; no reachable consumer | `CODE_PRESENT_UNBOUND` | `PRE-ACTIVATION HARDENING REQUIRED` |

## Twelve exact Playbook acceptance records

Every record must pass all common controls **and** its action-specific check.
Any missing authentication, tenant context, verified actor, action decision,
audit attribution or negative test is a fail-closed result. Until all twelve
are PASS, `PlaybookModule` remains outside the production graph.

Common controls for every row: controller-level authentication; canonical
tenant context; actor derived from verified auth context (no
`x-tenant-id`/`x-user-id` spoofing); action-level authorization; audit
attribution `(tenant, actor, action, target, outcome)`; and negative tests for
unauthenticated, missing-tenant, cross-tenant and denied-actor requests.

| Criterion | capabilityId | Action-specific acceptance |
|---|---|---|
| `PB-HARDEN-01` | `HTTP-0AFC7C5E803D` | `listPlaybooks` returns only the canonical tenant's records and records the verified actor; header-only tenant/actor is rejected. |
| `PB-HARDEN-02` | `HTTP-7F725AE79F00` | `getPlaybook` denies a target outside the verified tenant and emits an attributed deny audit. |
| `PB-HARDEN-03` | `HTTP-8B0F2D8ED677` | `enablePlaybook` requires the action-specific permission and records the before/after outcome; denied actors cannot mutate state. |
| `PB-HARDEN-04` | `HTTP-1476C5EBE31C` | `disablePlaybook` requires the action-specific permission and fails closed when the actor or tenant context is absent. |
| `PB-HARDEN-05` | `HTTP-374140E88658` | `pausePlaybook` enforces tenant ownership and action authorization before the state transition and attributes both success and denial. |
| `PB-HARDEN-06` | `HTTP-B4EC7B1A7044` | `resumePlaybook` enforces tenant ownership and action authorization before the state transition and attributes both success and denial. |
| `PB-HARDEN-07` | `HTTP-7D5397E6B29D` | `changeMode` authorizes the requested mode transition, rejects an untrusted actor header and records the requested and resulting modes. |
| `PB-HARDEN-08` | `HTTP-8DF1B58D01DA` | `runPlaybook` authorizes execution for the verified tenant/actor and rejects cross-tenant or unauthenticated execution. |
| `PB-HARDEN-09` | `HTTP-DC99913A6A4C` | `evaluatePlaybook` authorizes evaluation for the verified tenant/actor and records the evaluation outcome or fail-closed denial. |
| `PB-HARDEN-10` | `HTTP-0A09A41C13F4` | `getAudit` restricts audit reads to the verified tenant and preserves actor attribution for the read decision. |
| `PB-HARDEN-11` | `HTTP-A91DFB0F1A75` | `exportAudit` applies the same tenant/action authorization as `getAudit`, rejects spoofed headers and emits an export audit record. |
| `PB-HARDEN-12` | `HTTP-AA8995F0FE23` | `_health` is authenticated and tenant-bound; it cannot be used as an anonymous activation or reachability proof and denies missing context. |

## Accounting and terminal accounting

* Backend: `8 + 6 + 7 + 12 = 33` exact P1 records.
* UI: `UI-D8B811E689DF` remains `REACHABLE_PRODUCTION_UNVERIFIED` with `E-UI`;
  no code remediation and no evidence-phase reopening.
* Confirmed live defect: `0`.
* Production status: `NOT DETERMINED`.
* No row is an endpoint registration or production-activation authorization.
