# Receivable Nafaka Terminal-State Reconciliation R01 — Exact Execution Grant

<!-- GOV-COORD-AUTHORITY kind=EXECUTION_GRANT recordId=RECEIVABLE-NAFAKA-TERMINAL-STATE-RECONCILIATION-R01-EG01 -->

```text
recordType : EXECUTION_GRANT
recordId : RECEIVABLE-NAFAKA-TERMINAL-STATE-RECONCILIATION-R01-EG01
programId : RECEIVABLE-NAFAKA-TERMINAL-COMPLETION-R01
taskId : RECEIVABLE-NAFAKA-TERMINAL-STATE-RECONCILIATION-R01
ownerName : Av. Ulaş Hüseyin Telli
executor : CODEX_LOCAL
mode : GO-DOCS / GO-COMPLETE
scope : NAFAKA TERMINAL STATE RECONCILIATION ONLY
knownGoodFloor : 0c799a7d90a5782d921a546a1cd4ed09d6a609b0
capturedBaseSha : a56ca61e2d589df1f2433c9094144baff46a0629
baseFence : GITHUB MAIN LOCK / ENFORCING AT CAPTURE
reusable : NO
grantExpiry : TERMINAL CLOSEOUT
SECOND USE: FAIL-CLOSED
```

## Semantic authority binding

```text
semanticAuthorityRef.kind : SEMANTIC_AUTHORITY
semanticAuthorityRef.path : project/docs/governance/decision-log.md
semanticAuthorityRef.recordId : RECEIVABLE-NAFAKA-TERMINAL-STATE-RECONCILIATION-R01-SA01
```

## Exact owner evidence

```text
FULL OWNER AUTHORITY — CONTROL-PLANE BINDING + RESUME GO-COMPLETE

OWNER:
Av. Ulaş Hüseyin Telli

CURRENT PROGRAM:
RECEIVABLE-NAFAKA-TERMINAL-COMPLETION-R01

PROGRAM LOCK:
NAFAKA FIRST

BLOCKED TASK:
RECEIVABLE-NAFAKA-TERMINAL-STATE-RECONCILIATION-R01

KNOWN-GOOD FLOOR:
0c799a7d90a5782d921a546a1cd4ed09d6a609b0

PHASE A TASK:
RECEIVABLE-NAFAKA-TERMINAL-STATE-RECONCILIATION-R01-
CONTROL-PLANE-BINDING-R01

PHASE B TASK:
RECEIVABLE-NAFAKA-TERMINAL-STATE-RECONCILIATION-R01

AUTHORITY:
SINGLE-EXECUTOR
FENCE-FIRST
TWO-PHASE SEQUENTIAL
GO-COMPLETE
```

Owner evidence SHA-256: `1566f6e81ef697952b1eaee672136b87ddf82007e6efe7cf9c9b6725f5ab151c`.

## Exact authorized scope

```text
project/docs/governance/RCV-PHASE-1-AUTHORIZATION.md
project/docs/governance/decision-log.md
project/docs/governance/canonicalization-register.md
project/docs/governance/product-backlog.md
project/docs/governance/coordination-execution-grants/RECEIVABLE-NAFAKA-TERMINAL-STATE-RECONCILIATION-R01-EG01.md
```

## Immutable boundaries

- Production signature, private key, KMS, secret veya signing activation yoktur.
- Code, schema, migration, database, resolver, runtime ve feature flag değişmez.
- UYAP hold korunur; canary, transport ve cutover yoktur.
- `CLOSED / CANONICAL / UYAP-CONSUMABLE`, production-ready/active anlamına gelmez.

## Pre-closeout state

```text
TASK STATUS: AUTHORITY MATERIALIZED / RECONCILIATION PENDING MERGE
EXECUTION GRANT: ACTIVE AFTER APPROVED MERGE / SINGLE-USE
PRODUCTION SIGNATURES: 0/3 / PENDING_NOT_EXECUTED
RUNTIME: DORMANT / DEFAULT OFF
UYAP: HOLD
SECOND USE: FAIL-CLOSED
```

Terminal receipt, reconciliation merge'inden sonra exact EG-only closeout ile append edilir.

## TERMINAL RECEIPT

```text
STATUS: CONSUMED / CLOSED
SECOND USE: FAIL-CLOSED
TERMINAL RECEIPT
TASK RESULT: CLOSED / CANONICAL / PASS
NAFAKA: CLOSED / CANONICAL / UYAP-CONSUMABLE
PRODUCTION SIGNATURES: 0/3 / PENDING_NOT_EXECUTED
RUNTIME: DORMANT / DEFAULT OFF
UYAP: HOLD
reconciliationMergeSha : 6db9f8c0d60903beb6f846c32bcb9ce95c823659
effectiveMainSha : 6db9f8c0d60903beb6f846c32bcb9ce95c823659
```
