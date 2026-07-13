# ADR014-REP-01A Run-Specific Authorization Package Contract

```text
Status                  : PHASED PRE-RUN / RUNTIME-BINDING CONTRACT
Default execution       : NONE
Representative evidence : NOT PRODUCED
PR-11 readiness         : FALSE
Runtime cutover          : NOT AUTHORIZED
```

## Purpose

`adr014-run-specific-authorization-package.ts` separates facts that must exist before the
default-disabled REP-01B runner may be considered from facts that can exist only during or after
one separately authorized local run. It does not create an environment or manifest, grant access,
authorize itself, execute the runner, read data, emit telemetry, produce evidence, accept evidence
or promote runtime authority.

The contract is pure, immutable and deterministic. Version 1 remains unchanged for existing
callers. Version 2 adds the explicit `PRE_RUN_AUTHORIZED → RUNTIME_BINDING_REQUIRED →
CAPTURE_COMPLETE` sequence. None of these states means `EVIDENCE_ACCEPTED`, `REP02_AUTHORIZED`,
`PR11_READY` or runtime cutover authority.

## Version 2 phase boundary

### PRE_RUN_AUTHORIZED

The pre-run package contains only owner decisions and controls that must exist before execution:

- exact owner-controlled local environment reference;
- operator assignment and an owner-controlled independent-reviewer assignment policy;
- separate run-specific read-only access approval and single-run execution authorization;
- read-only / `REPEATABLE READ, READ ONLY` and no-egress proofs;
- owner-controlled local, create-once output path;
- owner-controlled indefinite retention (`automaticDeletion=false`, disposition only by owner,
  supersession does not replace earlier evidence);
- real-local-data/full-eligible-population/no-sampling manifest preparation method;
- current-local-database/full-population baseline method; and
- exactly one approved-for-run technical, privacy, financial, legal and operations sign-off.

Missing or conflicting pre-run fields return `BLOCKED`. A valid package returns
`PRE_RUN_AUTHORIZED` and records `runtimeBindingStatus=RUNTIME_BINDING_REQUIRED`. It contains no
session, approved manifest instance, actual timestamps or observed counts.

### RUNTIME_BINDING_REQUIRED / CAPTURE_COMPLETE

The runtime binding accepts only facts that become knowable during or immediately after the
separately authorized local run:

- generated session reference;
- exact approved manifest reference and approval record;
- actual independent-reviewer actor/assignment reference;
- actual access and execution UTC windows;
- actual baseline window, warm-up count, eligible population count and request count.

Missing runtime fields return `RUNTIME_BINDING_REQUIRED`. They do not revoke a valid pre-run
package, but they prevent `CAPTURE_COMPLETE` and evidence acceptance. Complete, correctly bound
facts produce a deterministic `adr014-capture-package:v2:*` reference and `CAPTURE_COMPLETE`.
Even then `representativeEvidenceAccepted=false`, `rep02Authorized=false`, `pr11Ready=false` and
`runtimeCutoverAuthorized=false` remain explicit.

The environment, access authorization, execution authorization, session and manifest references
must share one binding. The actual execution window must be contained in the actual access window,
and the actual reviewer must differ from the operator.

## Version 1 backward compatibility

The original version 1 one-shot package remains available without semantic or serialization
changes. It binds the following to the same canonical SHA and binding reference:

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

References are opaque. Neither version contains credentials, raw person/client/case/tenant
identity, monetary payload, raw exception, stack or free-text metadata.

## Shared separation rules

```text
ACCESS APPROVAL                    != EXECUTION AUTHORIZATION
APPROVED MANIFEST                  != EXECUTION AUTHORIZATION
PACKAGE_COMPLETE                   != REPRESENTATIVE EVIDENCE
PRE_RUN_AUTHORIZED                 != REPRESENTATIVE EXECUTION
RUNTIME_BINDING_REQUIRED           != PRE-RUN FAILURE
CAPTURE_COMPLETE                   != EVIDENCE ACCEPTED
REPRESENTATIVE EVIDENCE            != PR-11 READINESS
RUN-SPECIFIC AUTHORIZATION RECORDS != RUNTIME AUTHORITY
```

## Version 1 result boundary

A successful version 1 validation records:

```text
status                         = PACKAGE_COMPLETE
executionStarted               = false
representativeEvidenceProduced = false
representativeEvidenceAccepted = false
pr11Ready                      = false
runtimeCutoverAuthorized       = false
authority                      = RUN_SPECIFIC_AUTHORIZATION_REFERENCES_ONLY
```

`packageReference`, `preRunPackageReference` and `capturePackageReference` are deterministic
SHA-256 references over their normalized package bodies. They are not official snapshots,
LegalEvidence acceptance records or execution authority by themselves. Referenced owner records
remain the authority for the exact access and execution decisions.

## Operational use

This source has no CLI, `main()`, Nest bootstrap, production call-site, database, filesystem,
network, scheduler, telemetry, audit writer or persistence. Supplying real run values and owner
approval records remains a separate owner action. The v2 pre-run contract removes the temporal
deadlock without fabricating runtime facts. A pre-run package alone does not start REP-02; runtime
binding and all later evidence-validation/acceptance gates remain separate.

Even after `CAPTURE_COMPLETE`, the REP-01B runner output remains `CAPTURED_NOT_ACCEPTED`;
validation, domain sign-offs, evidence acceptance and any future PR-11 decision remain separate
gates.
