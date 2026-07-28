# activation-evidence

Operational evidence produced BY the orchestrator, ABOUT itself.

Everything else under `scripts/orchestration-v2/` is code that runs. This
directory is the one place where a canary run may leave a record of what it was
authorized to do and what it actually did — the artefact whose existence proves
the chain from enqueue to merge ran end to end, rather than a document asserting
that it did.

## Why it is separate

The orchestrator's own evidence had nowhere to live. Every standing grant that
authorizes a service-owned merge is bounded to a product module's code roots,
and the one grant that reaches a governance surface — `MECHANICAL_GOVERNANCE` —
denies `AUTO_MERGE` by design. So an evidence record that the service merges
itself could not be written anywhere without widening a standing grant, and
widening one is a self-authorization change every grant here forbids.

This directory exists so that authorization can be narrow instead: a one-shot,
task-scoped grant naming exactly one file in exactly one place.

## What may be written here

Nothing, by default. There is no standing grant over this directory, and its
existence is not a general write permission for `scripts/orchestration-v2/`.

A file appears here only when an owner authorizes a specific canary and a
one-shot grant is materialized naming that exact path. The grant is bound to a
single task id, a single plan hash, a single pull request and a single
successful merge, and it is marked CONSUMED the moment that merge lands — see
`orchestrator/one-shot-grant.cjs`.

## What a record contains

Only what is true before the merge:

    taskId, program, parentAuthorizationId, taskGrantId,
    standingGrantContext, executorLane, planHash, requestDigest,
    targetPath, requiredChecks, mergePolicy, purpose

Never the pull request number, head sha, merge sha, effective main sha, the
terminal timestamps, or the queue and task-store states. Those are facts about
events that have not happened when the executor writes, and an artefact that
predicts them is not evidence — it is a forecast that will be read as evidence
later. They are recorded by the queue, the task store and the audit log, from
the merge event itself.
