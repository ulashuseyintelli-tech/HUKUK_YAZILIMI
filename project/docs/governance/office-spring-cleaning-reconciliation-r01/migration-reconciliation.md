# OFFICE Migration Reconciliation

## Canonical transformation chain

| # | Migration | Attribution | Recorded state |
|---:|---|---|---|
| 1 | `20260626000000_office_legal_identity_fields` | OFFICE identity foundation | CANONICAL / APPLIED |
| 2 | `20260716205716_candidate_i1_reporting_line_foundation` | ReportingLine foundation | CANONICAL / APPLIED |
| 3 | `20260718120000_office_reporting_line_disposition` | ReportingLine disposition | CANONICAL / APPLIED |
| 4 | `20260718140000_office_reporting_line_date_range` | ReportingLine temporal integrity | CANONICAL / APPLIED |
| 5 | `20260720184418_office_auth_p01_token_version` | session revocation foundation | CANONICAL / APPLIED |
| 6 | `20260720225814_office_auth_p02_password_reset_token` | password-recovery baseline | CANONICAL / APPLIED |
| 7 | `20260721010000_office_auth_p02_hardening_r01_composite_fk` | password-recovery hardening | CANONICAL / APPLIED |
| 8 | `20260722213239_office_phase2_cap09a_foundation_audit_attribution` | CAP09A foundation | CANONICAL / APPLIED |
| 9 | `20260728130000_office_p2_cap02_reportingline_user_fk_hardening_i01` | CAP02 user binding hardening | CANONICAL / APPLIED / HISTORICAL TRAIN IRREGULARITY RETAINED |

```text
CANONICAL    9
APPLIED      9
PENDING      0
GHOST        0
FAILED       0
```

## Evidence precision

`APPLIED` is the canonical local-development migration-register state, including the
recorded `_prisma_migrations` reconciliation. It is not a fresh production database
query and must not be used as a production deployment claim.

The CAP02 migration appeared in a historical train outside its original authorization
boundary. That governance irregularity remains visible in
`pending-migration-coordination-register.md`; the later CAP02 technical reconciliation
does not erase it. It is not a pending schema defect at this snapshot.

The repository contains other migration folders whose names contain `office`, `staff`
or related terms. They predate or sit outside this bounded OFFICE transformation chain
and are not silently counted as these nine. No migration SQL, schema or data was changed
by this reconciliation.
