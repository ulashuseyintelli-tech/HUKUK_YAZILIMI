# Runtime Operability Certification R01 — Closure Methodology

Audit base: `cf82ea70d37a16287674e82d0bee99d540277b88`

## Snapshot boundary

```text
This successor methodology does not mutate or retroactively rewrite
PR #1795 sealed audit artifacts.

It re-evaluates closure certification using the current canonical
repository snapshot and the corrected methodology.
```

## Independent axes

Runtime status and historical closure certification are independent. A merge, source-file
presence, static registration, or passing test does not independently certify operational closure.

```text
MERGED
CODE_PRESENT
RUNTIME_BOUND
ACTIVE
REACHABLE
CONSUMED
OPERABLE
INDEPENDENTLY_VERIFIED
CLOSURE_CERTIFIED
```

Operational confirmation requires:

```text
RUNTIME BINDING
→ ACTIVATION
→ REACHABILITY
→ REAL CONSUMER
→ EXPECTED SIDE EFFECT
→ INDEPENDENT VERIFICATION
```

## HistoricalClosureClaim

A contextual parser emits `sourceRef`, `normalizedTitle`, `claimType`, `matchedText`,
`parserRule`, and `confidence`. `LOW` confidence and false-positive candidates never enter
the closure-certification denominator. Behavioural fail-closed language, default-closed state,
feature/CLI/package names containing closeout, and technical closure concepts are excluded.

## ClosureCapabilityMapping

| Evidence level | Certification use | Meaning |
|---|---|---|
| EXACT_CAPABILITY_REF | Sufficient | Exact capability identifier in the claim |
| EXACT_PACKAGE_SCRIPT_KEY | Sufficient | Exact changed package script key only |
| DIRECT_IMPLEMENTATION_FILE | Sufficient for association only | Direct implementation/registration file changed |
| BROAD_FILE_TOUCH | Insufficient | Shared module/manifest/barrel/package touch |
| UNMAPPED | Insufficient | No defensible capability-specific relation |

`DIRECT_IMPLEMENTATION_FILE` associates the claim with a capability but never proves runtime
operation. Package-file touch is contained to the exact changed script key.

## Closure certification statuses

- `CLOSED_OPERATIONAL_CONFIRMED`
- `CLOSED_STATICALLY_BOUND_UNVERIFIED`
- `CLOSED_BINDING_DEFECT`
- `CLOSED_ACTIVATION_DEFECT`
- `CLOSED_REACHABILITY_DEFECT`
- `CLOSED_OPERABILITY_DEFECT`
- `CLOSED_EVIDENCE_INSUFFICIENT`
- `CLOSED_SUPERSEDED`
- `NOT_HISTORICALLY_CLOSED`

A capability without a reliable closure claim is `NOT_HISTORICALLY_CLOSED`. A reliable claim
with broad/unmapped evidence is `CLOSED_EVIDENCE_INSUFFICIENT`. Runtime defect statuses are
assigned only after sufficient claim-to-capability mapping. `CLOSED_OPERATIONAL_CONFIRMED`
requires `VERIFIED_OPERATIONAL` runtime status.

## Legacy metric

`incorrectlyClosed = 0` is retained only for backward
compatibility and is labelled **LEGACY / NOT SUFFICIENT FOR CLOSURE CERTIFICATION**. It is not synonymous with
`provenClosureDefectCount` or `closureUncertifiedCount`.

