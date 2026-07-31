# OFFICE Capability Delivery Matrix

## Aggregate

| Primary status | Count |
|---|---:|
| CLOSED | 9 |
| CLOSED_WITH_NON_BLOCKING_RESIDUAL | 1 |
| OPEN_IMPLEMENTATION | 10 |
| OPEN_GOVERNANCE | 3 |
| PRODUCTION_EVIDENCE_REQUIRED | 1 |
| **TOTAL** | **24** |

The three `OPEN_GOVERNANCE` groups require owner decisions and collectively depend on
the nine open ODs. OD count is a separate decision inventory and is not added to the
24-capability total.

## Matrix

| ID | Capability group | Primary status | Current evidence / exact gap |
|---|---|---|---|
| OFF-CAP-01 | Domain Law and Phase 0 baseline | CLOSED | OFFICE Domain Law and Phase 0 governance are canonical |
| OFF-CAP-02 | Person/User identity baseline | CLOSED | canonical identity model and migrations present |
| OFF-CAP-03 | Tenant-scoped authentication/session baseline | CLOSED | tenant-aware auth and token-version coverage are CI-bound |
| OFF-CAP-04 | Lawyer credential response containment | CLOSED | credential projection + focused test in `pure/office-auth-user` |
| OFF-CAP-05 | Office secret masking/encryption boundary | CLOSED | public masking, write fail-closed and focused tests present |
| OFF-CAP-06 | Password recovery baseline | CLOSED | PR #1481, local controlled evidence; production is separate CAP-24 |
| OFF-CAP-07 | Password recovery hardening | CLOSED | PR #1494 and recorded applied migration |
| OFF-CAP-08 | ReportingLine foundation/population/shadow chain | CLOSED | schema, population tools, shadow consumer and CI coverage present |
| OFF-CAP-09 | CAP02 controlled-local runtime hygiene | CLOSED | predecessor technical closeout retained; no production claim |
| OFF-CAP-10 | CAP02 physical worktree hygiene | CLOSED_WITH_NON_BLOCKING_RESIDUAL | technical task closed; unregistered physical directory preserved |
| OFF-CAP-11 | Authorization breadth and sensitive projection | OPEN_IMPLEMENTATION | `GET /lawyers/:id` and `GET /office` use JWT+tenant but no capability/field-level decision |
| OFF-CAP-12 | CAP09A designated OFFICE consumer | OPEN_IMPLEMENTATION | foundation/API present; exact consumer task not delivered |
| OFF-CAP-13 | Dedicated OFFICE E2E suite | OPEN_IMPLEMENTATION | no dedicated suite found |
| OFF-CAP-14 | Dedicated `execution-office` suite | OPEN_IMPLEMENTATION | scripts/module exist; dedicated manifest-bound suite absent |
| OFF-CAP-15 | Multi-tenant membership realization | OPEN_IMPLEMENTATION | depends on OFF/OD-02 and OFF/OD-07 |
| OFF-CAP-16 | Employment/external-counsel lifecycle | OPEN_IMPLEMENTATION | depends on OFF/OD-03 and OFF/OD-04 |
| OFF-CAP-17 | Historical founder attribute enforcement | OPEN_IMPLEMENTATION | depends on OFF/OD-06 |
| OFF-CAP-18 | Multi-level approval separation | OPEN_IMPLEMENTATION | depends on OFF/OD-12 |
| OFF-CAP-19 | Delegation authority boundary | OPEN_IMPLEMENTATION | depends on OFF/OD-13 |
| OFF-CAP-20 | Offboarding revoke/reassignment orchestration | OPEN_IMPLEMENTATION | depends on OFF/OD-16 |
| OFF-CAP-21 | Identity/org cardinality decision group | OPEN_GOVERNANCE | OFF/OD-02, 03, 04, 07 |
| OFF-CAP-22 | Authority/delegation/offboarding decision group | OPEN_GOVERNANCE | OFF/OD-06, 12, 13, 16 |
| OFF-CAP-23 | Workload-purpose decision group | OPEN_GOVERNANCE | OFF/OD-19 |
| OFF-CAP-24 | Production config/deployment evidence | PRODUCTION_EVIDENCE_REQUIRED | repository and controlled-local evidence do not certify deployment |

## Consequence

`CLOSED` means the bounded capability evidence chain identified above is sufficient for
the scope stated. It does not mean the complete OFFICE module is production-certified.
The final OFFICE program verdict therefore remains `PARTIAL`.
