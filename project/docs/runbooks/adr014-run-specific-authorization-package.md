# ADR014-REP-01A Run-Specific Authorization Package Contract

```text
Status                  : PREPARATION CONTRACT
Default execution       : NONE
Representative evidence : NOT PRODUCED
PR-11 readiness         : FALSE
Runtime cutover          : NOT AUTHORIZED
```

## Purpose

`adr014-run-specific-authorization-package.ts` validates and seals the references required before
the default-disabled REP-01B runner may be considered for one separately authorized local run. It
does not create an environment or manifest, grant access, authorize itself, execute the runner,
read data, emit telemetry, produce evidence, accept evidence or promote runtime authority.

The contract is pure, immutable and deterministic. A complete result is
`PACKAGE_COMPLETE`, not `READY`, `EVIDENCE_ACCEPTED` or `PR11_READY`.

## Mandatory package content

One package binds the following to the same canonical SHA and binding reference:

- local environment and unique session references;
- an independently approved PE-04 manifest reference;
- separate access and execution authorization references and windows;
- distinct operator and independent technical reviewer assignments;
- `READ_ONLY / REPEATABLE_READ_READ_ONLY / write-back FORBIDDEN` proof;
- `NO_EGRESS` proof, including external service, external AI and cloud/remote prohibitions;
- owner-controlled local, create-once output-path reference;
- retention owner, positive duration and disposition-rule reference;
- baseline window, warm-up, population and request counts, p95/p99 and baseline-relative
  error/timeout comparison basis;
- exactly one approved-for-run technical, privacy, financial, legal and operations sign-off.

References are opaque. The package contains no credential, raw person/client/case/tenant identity,
monetary payload, raw exception, stack or free-text metadata.

## Separation rules

```text
ACCESS APPROVAL                    != EXECUTION AUTHORIZATION
APPROVED MANIFEST                  != EXECUTION AUTHORIZATION
PACKAGE_COMPLETE                   != REPRESENTATIVE EVIDENCE
REPRESENTATIVE EVIDENCE            != PR-11 READINESS
RUN-SPECIFIC AUTHORIZATION RECORDS != RUNTIME AUTHORITY
```

The execution window must be contained within the access window. The operator cannot be the
independent reviewer. A missing, stale, malformed, duplicated or mismatched reference blocks the
package deterministically.

## Result boundary

A successful validation records:

```text
status                         = PACKAGE_COMPLETE
executionStarted               = false
representativeEvidenceProduced = false
representativeEvidenceAccepted = false
pr11Ready                      = false
runtimeCutoverAuthorized       = false
authority                      = RUN_SPECIFIC_AUTHORIZATION_REFERENCES_ONLY
```

`packageReference` is a deterministic SHA-256 reference over the normalized package. It is not an
official snapshot, LegalEvidence acceptance record or execution authority by itself. The referenced
owner records remain the authority for the exact access and execution decisions.

## Operational use

This source has no CLI, `main()`, Nest bootstrap, production call-site, database, filesystem,
network, scheduler, telemetry, audit writer or persistence. Supplying real run values and owner
approval records is a separate owner action. Until those values exist, REP-01A remains blocked and
REP-02 is ineligible.

Even after a complete run-specific package exists, the REP-01B runner output remains
`CAPTURED_NOT_ACCEPTED`; validation, domain sign-offs, evidence acceptance and any future PR-11
decision remain separate gates.
