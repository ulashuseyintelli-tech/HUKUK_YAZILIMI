# ADR014-PE-06A Disabled Local Evidence Harness

**Status:** Preparation shell only

**Default:** `enabled = false`
**Authority:** None

## Purpose

This module represents the PE-03 environment/session references and PE-04 manifest binding
needed by a possible future, separately authorized local evidence runner. It is a pure,
deterministic validation shell. It does not execute a session or inspect the repository.

The shell is not a runner. Importing it performs no work. It has no CLI entry point, `main()`
function, Nest bootstrap, database connection, filesystem access, network access, scheduler,
audit writer activation, persistence or telemetry emission.

## Preparation request

The exact request contract is version `1` and contains only:

```text
contractVersion
enabled
canonicalSha
environmentReference
sessionReference
manifestReference
accessAuthorizationReference
executionAuthorizationReference
```

Every reference is a typed object with exactly `kind`, `opaqueReference` and
`bindingReference`. Reference values use a controlled opaque form:

```text
adr014-ref:v1:<reference-kind>:<32 lowercase hexadecimal characters>
adr014-binding:v1:<32 lowercase hexadecimal characters>
```

The five references must carry the same binding reference. Access authorization and
execution authorization are distinct kinds; neither substitutes for the other. Raw business
identifiers, monetary values, errors, stack traces, free-text reasons and arbitrary metadata
are outside the contract and fail closed.

## Canonical SHA constraint

`canonicalSha` must be exactly 40 lowercase hexadecimal characters. The shell does not read
Git, process state or an environment variable to discover current main. A caller must supply
the independently verified current canonical SHA as a trusted constraint. An invalid or
different value returns `BLOCKED`; the shell never updates or reconciles a SHA itself.

This is a preparation-only constraint. Supplying a matching SHA creates no repository,
execution, evidence or runtime authority.

## Result contract

The only result statuses are:

```text
BLOCKED
PREPARED
```

Results are frozen, deterministic and contain only a bounded blocker-code list. They do not
echo request references or payloads and carry no free-text reason.

Canonical blocker codes are:

```text
HARNESS_DISABLED
INVALID_REQUEST_SHAPE
UNSUPPORTED_CONTRACT_VERSION
INVALID_CANONICAL_SHA
CANONICAL_SHA_MISMATCH
MISSING_ENVIRONMENT_REFERENCE
MISSING_SESSION_REFERENCE
MISSING_MANIFEST_REFERENCE
MISSING_ACCESS_AUTHORIZATION
MISSING_EXECUTION_AUTHORIZATION
INVALID_OPAQUE_REFERENCE
REFERENCE_BINDING_MISMATCH
```

`PREPARED` means only that this bounded preparation request passed structural validation. It
does not mean `READY`, `AUTHORIZED`, `EXECUTABLE` or `EVIDENCE_ACCEPTED`. It grants no source
access, does not start an evidence session, does not replace owner authorization, and does not
produce representative readiness, baseline evidence, PR-11 eligibility or cutover readiness.

## Protected state after PE-06A

```text
Representative evidence: ABSENT / BLOCKING
PR-11: NOT AUTHORIZED
Runtime cutover: NOT AUTHORIZED
Financial authority: NO CHANGE
Runtime authority: NO CHANGE
```

PR #1159 remains a non-canonical, superseded implementation attempt held for owner review. It
is not rebased, merged, cherry-picked, copied or used as implementation authority by PE-06A.

PE-06B or any other successor requires separate explicit owner authorization.
