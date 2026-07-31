# OFFICE Runtime and Activation Reconciliation

| Capability | Repository wiring | Controlled-local evidence | Production evidence | Disposition |
|---|---|---|---|---|
| password recovery | controllers, service, UI and CI-bound tests present | CERTIFIED in bounded local security/tenant slice | not verified | `LOCAL_CERTIFIED / PRODUCTION_UNCERTIFIED` |
| password-recovery flag | `OFFICE_PASSWORD_RECOVERY_ENABLED` required; code default false | tests exercise explicit states | deployed value not verified | `DEFAULT_OFF / ENVIRONMENT_UNCERTIFIED` |
| ReportingLine/CAP02 | migration, population tools, shadow consumer and tests present | bounded controlled-local evidence retained | not verified | `CONTROLLED_LOCAL_VERIFIED` |
| CAP09A | schema and shared AuditService input fields present | foundation tests/CI present | designated OFFICE consumer not certified | `FOUNDATION_PRESENT / CONSUMER_UNBOUND` |
| `GET /lawyers/:id` | JWT + tenant propagation; credential fields removed | focused containment tests | capability/field-level production policy not verified | `AUTHORIZATION_RESIDUAL` |
| `GET /office` | JWT + tenant propagation; secrets masked | focused settings tests | broad projection policy not verified | `AUTHORIZATION_RESIDUAL` |
| execution-office | module, controller/service and maintenance scripts present | no dedicated suite/certification | not verified | `OPERABILITY_UNCERTIFIED` |

## Password recovery precision

The implementation is real and locally tested: tenant-scoped hash-only tokens,
single-use consumption, session invalidation, rate limiting, audit taxonomy,
compensation behavior and fragment transport are covered by the baseline/hardening
chain. The code returns disabled behavior unless the flag is explicitly `true`.

No production environment was accessed in this task. Owner testimony or earlier local
activation evidence is not converted into deployed-environment certification.

## Activation boundary

This document does not authorize setting a flag, sending a real email, changing SMTP,
deploying an image, opening an endpoint or enabling production traffic.
