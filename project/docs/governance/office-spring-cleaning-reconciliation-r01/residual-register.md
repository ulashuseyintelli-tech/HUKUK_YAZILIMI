# OFFICE Spring-Cleaning Residual Register

| ID | Class | Priority | Evidence gap | Successor | Status |
|---|---|---:|---|---|---|
| OFFICE-SC-R01-AUTH-01 | security / authorization breadth | P0 | broad `GET /lawyers/:id` and `GET /office` projections lack canonical field/capability policy | F01 | OWNER GO REQUIRED |
| OFFICE-SC-R01-OD-01 | governance / owner decisions | P1 | nine ODs remain open in three capability groups | F06 | OWNER DECISION REQUIRED |
| OFFICE-SC-R01-CAP09A-01 | implementation / audit consumer | P1 | foundation present, designated OFFICE consumer absent | CAP09A-CONSUMER | OWNER GO REQUIRED |
| OFFICE-SC-R01-E2E-01 | test / end-to-end | P1 | dedicated OFFICE E2E suite absent | F03 | OWNER GO REQUIRED |
| OFFICE-SC-R01-EXECOFFICE-01 | test / operability | P1 | dedicated `execution-office` suite absent | F04 | OWNER GO REQUIRED |
| OFFICE-SC-R01-PROD-01 | deployed-environment evidence | P1 | config/deploy/live traffic not assessed | F05 | PRODUCTION ACCESS + OWNER GO REQUIRED |
| OFFICE-SC-R01-ORPHAN-01 | workstation hygiene | P2 | unregistered CAP02 directory cannot be policy-compliantly deleted in this task | F07 | PRESERVED |

## Physical orphan evidence

```text
PATH                 C:\Development\HUKUK_YAZILIMI\HY_office_cap02_runtime_health
GIT REGISTRATION     ABSENT
.git METADATA        ABSENT
ROOT REPARSE POINT   NO
NON-NODE REPARSE     0
CANONICAL-EQUAL
  UNTRACKED FILES    2/2 byte-equal to canonical owner-WIP
TRACKED DIFFERENCES  4 historical control-plane files
UNIQUE WIP ZERO      NOT PROVEN TO REQUIRED CERTAINTY
PHYSICAL CLEANUP     NOT PERFORMED
```

Repository policy prohibits recursive physical deletion of an unregistered worktree
directory. The directory is non-blocking for the governance reconciliation but remains
an explicit cleanup residual.

## Closure semantics

These residuals prevent an OFFICE-wide or production-ready verdict. They do not prevent
closure of this bounded reconciliation after its own PR, required CI and closeout gates
pass.
