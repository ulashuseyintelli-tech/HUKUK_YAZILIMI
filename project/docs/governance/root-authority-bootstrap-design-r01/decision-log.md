# Root Authority Bootstrap R01 — Design Decision Log

```text
Document role : Design decision record only
Authority     : NONE
Canonical Decision Log remains ../decision-log.md
```

| ID | Decision | Rationale |
|---|---|---|
| `RAB-D01` | Use a two-stage protocol | Prevents the classifier that authorizes authority creation from creating the authority itself |
| `RAB-D02` | Keep Stage 1 and Stage 2 in different tasks, branches, grants and PRs | Makes stage boundary and owner consent observable |
| `RAB-D03` | Select owner-pinned exact Stage 1 base | Prevents silent execution against a different writer/contract version |
| `RAB-D04` | Discover the unique Stage 1 squash commit, then pin it and a fresh exact Stage 2 base in Grant 2 | The squash SHA cannot be known before Stage 1 merge; Grant 2 closes that gap |
| `RAB-D05` | Reject moving-main tolerance after either grant | Base drift changes the reviewed execution context and requires a fresh grant |
| `RAB-D06` | Reuse the existing exact authority marker and object locator | Avoids a competing URI or registry model |
| `RAB-D07` | Store SA in canonical Decision Log and EG in the execution-grants directory | Preserves existing role-separated storage conventions |
| `RAB-D08` | Use exactly two Stage 2 paths and no audit companion | Minimizes the protected materialization surface; audit files cannot be authority |
| `RAB-D09` | Derive consumption from the atomic Stage 2 merge and canonical resolution | Eliminates a third post-merge write and its failure window |
| `RAB-D10` | Keep inactive Stage 1 binding on main after delay/revocation | It has no authority pair and is safer than rewriting canonical history |
| `RAB-D11` | Require two separate owner grants | Stage 2 facts do not exist when Stage 1 is authorized |
| `RAB-D12` | Require exact content validation beyond marker presence | Marker identity alone cannot prove program/task/owner/scope semantics |
| `RAB-D13` | Treat any base/branch/path/predecessor/content ambiguity as invalidation | Fail-closed behavior must not select a nearest alternative |
| `RAB-D14` | Keep target implementation, closeout ledger mutation and dogfood outside this design | Design closure cannot imply implementation or runtime evidence |

## Supersession

No canonical rule is superseded. This design consumes the owner-ratified predecessor findings and
proposes a future one-time implementation. A later owner decision may ratify, amend or reject these
design decisions; until then Stage 1 and Stage 2 remain unauthorized.

## Related artifacts

- [Root cause](./root-cause-and-circularity.md)
- [Two-stage protocol](./two-stage-bootstrap-design.md)
- [State machine](./bootstrap-state-machine.md)
- [Security invariants](./security-invariants.md)
- [Failure recovery](./failure-recovery.md)
- [Implementation allowlists](./implementation-allowlists.md)
- [Validation plan](./validation-plan.md)
- [Stage 1 owner template](./stage1-owner-grant-template.md)
- [Stage 2 owner template](./stage2-owner-grant-template.md)
- [Machine-readable design](./bootstrap-design.json)
