# ADR014-REP-02 Local Representative Evidence Execution

```text
Status                 : OWNER-AUTHORIZED LOCAL EXECUTION MECHANISM
Source                 : LOCAL POSTGRESQL ONLY
Transaction            : REPEATABLE READ / READ ONLY
Write-back             : FORBIDDEN
External egress        : FORBIDDEN
Evidence acceptance    : SEPARATE OWNER DECISION
PR-11 / runtime cutover: NOT AUTHORIZED
```

## Purpose and authority boundary

`adr014-rep-02-local-execution.ts` is the exact local call-site for one separately authorized
ADR-014 representative-evidence run. It materializes the canonical v2 pre-run owner-decision
instance against the verified execution SHA, generates only runtime facts, validates the canonical
REP-01B execution plan and PE-06D dry-validation contract, and then opens one local PostgreSQL
interactive transaction.

The first statement inside the transaction is:

```sql
SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY
```

The call-site then verifies PostgreSQL's `transaction_isolation` and
`transaction_read_only` settings before reading any case. It does not bootstrap Nest, start an API,
connect to an external service, emit telemetry, alter schema, run a migration or write to the source
database.

`CAPTURE_COMPLETE` means only that the run-time reference package is structurally complete.
The evidence artifact remains `authority=NONE`, `official=false`,
`representativeEvidenceAccepted=false`, `pr11Authorized=false` and
`runtimeCutoverAuthorized=false`.

## Input boundary

The call-site reads these process-local inputs:

```text
DATABASE_URL             local PostgreSQL URL; host must be localhost/127.0.0.1/::1
ADR014_CANONICAL_SHA     verified 40-character canonical execution SHA
ADR014_REVIEWER_NAME     exact owner-assigned reviewer; hashed before artifact construction
ADR014_OUTPUT_ROOT       exact owner-controlled local root
ADR014_OUTPUT_FILE       new .json filename under that root
ADR014_MANIFEST_APPROVAL must equal APPROVED
ADR014_STOP_FILE         optional absolute stop-token path
```

Credentials, reviewer name, source tenant/case identifiers, monetary values, raw exception text,
stacks and arbitrary metadata are never serialized. The output is opened with exclusive create
semantics and cannot overwrite an existing artifact.

## Selection and calculation

The approved selection is the complete `Case` population in the authorized local database, ordered
by stable tenant/case source keys inside the read-only snapshot. Source keys remain process-local and
are converted to opaque SHA-256 observation references.

For each case, the call-site executes the existing production calculation components without a
runtime consumer switch:

```text
CaseBalanceService
→ CaseService legacy calculation summary
→ BalanceDisplayShadowDiffService
→ CaseBalance display / fee projection / trace / non-official snapshot evidence
```

No financial formula or discrepancy policy is reimplemented. Existing zero-cent comparison rows,
blockers, readiness and fee statuses are aggregated without storing amounts.

## Fail-closed behavior

The run stops before the next case on any of these conditions:

- non-zero financial discrepancy;
- required financial evidence is `NOT_COMPARABLE`;
- canonical blocker/hard stop;
- stop token;
- empty population;
- source/transaction failure or timeout.

Such a run writes a local `FAILED` or `ABORTED` artifact with bounded failure codes and incomplete
coverage. It does not create a capture-package reference or evidence acceptance.

Only full-population completion with zero-cent exact financial comparison and no required-evidence
gap can bind the v2 runtime package as `CAPTURE_COMPLETE`.

## Output contract

The write-once artifact contains only:

- canonical, session, manifest, reviewer, execution-plan and package references;
- actual UTC access/execution windows;
- eligible population and processed request counts;
- p50/p95/p99 latency, error/timeout/abort counts;
- exact/non-zero/not-comparable aggregate counts;
- bounded currency, fee, trace, snapshot, safety and blocker coverage;
- read-only/no-egress proof;
- artifact digest and, only when complete, capture-package reference.

Independent technical/privacy/financial/legal/operations review and explicit owner evidence
acceptance remain required. Neither this mechanism nor its artifact authorizes CAN-CUT-02, PR-11,
consumer switch or runtime cutover.
