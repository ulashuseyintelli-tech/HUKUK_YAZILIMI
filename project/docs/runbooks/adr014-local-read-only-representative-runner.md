# ADR014-REP-01B Local Read-Only Representative Evidence Runner

```text
Status              : EXECUTION-MECHANISM-ONLY
Default mode        : DISABLED
Production call-site: NONE
Runtime authority   : NONE
Evidence acceptance : NONE
```

## Purpose

`adr014-local-read-only-representative-runner.ts` is the exact local execution boundary for a
future, separately authorized ADR-014 representative run. It composes the canonical PE-06A
preparation gate and PE-06D dry-validation orchestrator without activating telemetry, selecting a
dataset, granting access, accepting evidence, or changing calculation/readiness behavior.

The runner may be instantiated in `OWNER_AUTHORIZED_LOCAL` mode only after REP-01A records the
specific environment, session, approved manifest, access authorization, execution authorization,
output location, retention and sign-off assignments. The module has no CLI, `main()`, Nest wiring,
scheduler, import-time execution or production consumer call-site.

## Fixed boundaries

```text
Source locality     : LOCAL_ONLY
Source access       : READ_ONLY
Transaction command : SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY
Network             : NO_EGRESS
Output              : owner-controlled local root, JSON, create-once
Default              : DISABLED
```

The evidence reader receives only a guarded query port. The port accepts one `SELECT`/`WITH`
statement, rejects comments, multiple statements and write-capable SQL, and runs inside the
database-enforced read-only transaction. The reader does not receive `$executeRawUnsafe`.

The runner imports no HTTP, HTTPS, TCP, TLS, fetch, Axios, queue or external-service client. The
caller remains responsible for selecting a credential-free local source reference and proving the
local/no-egress environment in REP-01A.

## Required request binding

The request contains the PE-06A preparation contract plus an absolute `.json` output path. The
preparation contract must carry one shared binding across:

```text
canonicalSha
environmentReference
sessionReference
manifestReference
accessAuthorizationReference
executionAuthorizationReference
```

Missing, invalid, mismatched or stale values block before source access. `PREPARED` from PE-06A is
only a prerequisite validation result; it is not execution or evidence authority.

## Output safety

Before reading, the runner resolves the configured owner-controlled root and the output parent with
`realpath`. A parent outside the root, including a symlink escape, is rejected. The output directory
must already exist. The runner creates a new JSON file with exclusive `wx` semantics and does not
overwrite or append to an existing artifact.

The artifact is deterministic for the same request and normalized observations. It contains only
opaque references and bounded results. It explicitly records:

```text
status                         = CAPTURED_NOT_ACCEPTED
authority                      = NONE
official                       = false
representativeEvidenceAccepted = false
runtimeCutoverAuthorized       = false
```

Raw tenant/case/person identifiers, names, monetary values, exception text, stacks and arbitrary
metadata are outside the artifact contract. Observation references must be opaque and unique.

## Stop / abort

The caller supplies an optional stop signal. The runner checks it:

1. before path or source access;
2. immediately after the read-only transaction starts;
3. after the bounded evidence read;
4. before artifact construction and write.

An abort returns typed `ABORTED / ABORT_REQUESTED`. No artifact is written when abort is observed.
Database rollback remains the source adapter's transaction responsibility.

## Dry validation

`dryValidate()` delegates to the canonical PE-06D orchestrator in `TEST_ONLY` mode. Synthetic or
golden fixtures verify session lifecycle, phase timing and seven observation fact families without
database, real data or output activation. This is dry-validation evidence only.

## Explicit non-authority

REP-01B does not approve an environment, manifest, access, execution, representative evidence,
CAN-CUT-02, PR-11, consumer switch, pilot or runtime cutover. REP-01A remains open until the owner
freezes every run-specific reference and approval. A captured artifact requires independent
validation and sign-off before it can become accepted representative evidence.
