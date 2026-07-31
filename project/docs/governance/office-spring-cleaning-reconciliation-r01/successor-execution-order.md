# OFFICE Successor Execution Order

| Order | Task | Residual class | Priority | Dependencies | Owner decision | Migration | Production access | Expected proof | Status |
|---:|---|---|---:|---|---|---|---|---|---|
| 1 | `OFFICE-SC-F01-AUTHORIZATION-BREADTH-AND-SENSITIVE-PROJECTION-R01` | security | P0 | canonical projection policy | YES | possible; not assumed | NO | positive/negative role+tenant+field tests | NOT STARTED |
| 2 | `OFFICE-SC-F06-OPEN-OD-DECISION-PACK-R01` | governance | P1 | none beyond current dossier | YES | NO in decision task | NO | nine canonical owner dispositions | NOT STARTED |
| 3 | `OFFICE-CAP-09A-CONSUMER-01-R01` | implementation | P1 | applicable OD/security boundaries; fresh grant | YES | not expected; verify | NO | producer→AuditService→read-back + negative boundary | NOT STARTED |
| 4 | `OFFICE-SC-F03-DEDICATED-OFFICE-E2E-R01` | test | P1 | F01 and CAP09A consumer state known | YES | NO | NO | dedicated manifest-bound representative journeys | NOT STARTED |
| 5 | `OFFICE-SC-F04-EXECUTION-OFFICE-TEST-SUITE-R01` | test | P1 | exact execution-office behavior inventory | YES | NO | NO | focused service/controller/negative-boundary suite in required CI | NOT STARTED |
| 6 | `OFFICE-SC-F05-PRODUCTION-CONFIG-AND-DEPLOYED-EVIDENCE-R01` | environment certification | P1 | prior test/security gates | YES | NO unless separately granted | YES | deployed SHA/config, mail path, restart and real read-back evidence | NOT STARTED |
| 7 | `OFFICE-SC-F07-CAP02-PHYSICAL-ORPHAN-DISPOSITION-R01` | workstation hygiene | P2 | safe cleanup method and owner-WIP proof | YES | NO | NO | registration/branch/PR/WIP/reparse proof + policy-compliant disposition | NOT STARTED |

## Ordering rationale

Security/field visibility is first because later tests should encode the corrected
boundary rather than normalize current breadth. Owner decisions follow before their
dependent lifecycle implementations. CAP09A consumer precedes broad E2E so the audit
journey can be included. Production evidence remains after local correctness. Physical
orphan hygiene is last because it does not affect canonical repository behavior.

The resolved W2 parser task is not re-opened. No row is execution authority.
