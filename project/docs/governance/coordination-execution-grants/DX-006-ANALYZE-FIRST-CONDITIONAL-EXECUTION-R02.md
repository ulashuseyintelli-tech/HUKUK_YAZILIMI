# DX-006 Analyze-First Conditional Execution R02 — Exact Execution Grant

<!-- GOV-COORD-AUTHORITY kind=EXECUTION_GRANT recordId=DX-006-ANALYZE-FIRST-CONDITIONAL-EXECUTION-R02-GRANT --> **DX-006-ANALYZE-FIRST-CONDITIONAL-EXECUTION-R02-GRANT — TASK-SPECIFIC EXECUTION AUTHORITY**

```text
Task ID    : DX-006-ANALYZE-FIRST-CONDITIONAL-EXECUTION-R02
Executor   : CODEX_LOCAL
Base SHA   : 344259a80ce790c9c09455b978ff124ced54bf63
Branch     : codex/dx-006-analyze-first-conditional-execution-r02
Mode       : GO-COMPLETE / CONTROL-PLANE POLICY AMENDMENT
Classifier : ANALYZE_FIRST_CONDITIONAL_EXECUTION_R02
Reusable   : NO
```

## Frozen exact change set

| Status | Path |
|---|---|
| M | `AGENTS.md` |
| M | `CLAUDE.md` |
| M | `.claude/CLAUDE.md` |
| M | `project/PROJECT_MEMORY_PACK/03_OPERATING_MODEL.md` |
| M | `project/docs/governance/coordination-v2/governance-orchestration-contract-v2.md` |
| A | `project/docs/governance/coordination-execution-grants/DX-006-ANALYZE-FIRST-CONDITIONAL-EXECUTION-R02.md` |
| M | `project/docs/governance/decision-log.md` |
| M | `project/docs/governance/governance-writer-coordination-contract.md` |
| M | `project/docs/governance/process-rules.md` |
| M | `project/scripts/governance-coordination.cjs` |
| M | `project/scripts/governance-coordination.test.cjs` |

V2 orchestration contract'ı active normative duplicate scan'inde eski
`MERGE_READY → owner manuel merge` modelini yeniden ürettiği için R02 conditional
scope kuralıyla frozen set'e eklenmiştir. Başka conditional path yoktur.

## Granted chain

Bu grant yalnız yukarıdaki exact task, base, branch ve change set için şu zinciri
yetkilendirir:

```text
ANALYZE → IF IMPLEMENT → IMPLEMENT → VERIFY → COMMIT → PUSH → PR → CI
→ IF GO-COMPLETE → SQUASH-MERGE → MAIN SYNC → CLEANUP
→ FINAL VERIFICATION → CLOSE
```

Merge, yalnız local validation + required CI PASS, exact scope PASS, PR
`CLEAN / MERGEABLE`, semantic/merge conflict `NONE`, active writer collision
`NONE` ve stop condition `NONE` olduğunda yapılabilir. Bu ex-ante
owner-authorized conditional merge'dir; CI sonrasında ikinci owner mesajı
gerekmez.

## Frozen owner-WIP exception

Owner amendment yalnız
`C:\Development\HUKUK_YAZILIMI\HUKUK_rcv_col_tpa_04c_closure_final` worktree'sindeki
`project/docs/governance/decision-log.md` append-only WIP'i için uygulanır.
Initial diff SHA-256:
`d4348de1f3afa0e117f572a38a26ca91589001be0b2ad7a6f478b84b3af03bd5`.
Disposable compatibility check `+2/-0`, unique DX marker, preserved RCV-COL row
ve textual conflict `NONE` sonucu vermiştir. Commit öncesi aynı SHA-256 yeniden
doğrulanmalıdır. Owner WIP'in hiçbir byte'ı bu branch'e taşınamaz ve owner
worktree/branch üzerinde hiçbir mutation yapılamaz.

## Explicit denials

Bu grant başka task için reusable authority üretmez. Standing/unattended GitHub
auto-merge; scheduler; lease; failover; production; schema/migration; live DB;
owner WIP mutation; request/execution/result mode veya başka control-plane
mutation authority üretmez. Base, branch veya complete path/status seti
değişirse `CONTROL_PLANE_SCOPE_FORBIDDEN` uygulanır.
