'use strict';
/**
 * The probes.
 *
 * Each one answers a single question — "can a caller actually do this?" — by
 * doing it, through the same door a caller uses, against a disposable world.
 *
 * Two rules shape every probe here:
 *
 *   1. It spawns the shipped entrypoint. It does not require() the module under
 *      test and call its exports. A test that imports verifyAuthorityAgainstRepo
 *      and invokes it proves the function is correct; it proves nothing about
 *      whether run-task still calls it, and that gap is the entire subject of
 *      this package.
 *
 *   2. It checks the NEGATIVE as well as the positive. A gate that accepts valid
 *      input tells you nothing — an unwired gate accepts valid input too, and
 *      accepts invalid input just as happily. The refusals are the evidence; the
 *      success is the control.
 *
 * An observed state is a finding, never a judgement. The three that matter:
 *
 *   OPERABLE/ENFORCED  the capability worked AND refused what it should refuse
 *   UNWIRED            the entrypoint exists and the behaviour is simply absent
 *   FAILED             the entrypoint was reached and did the wrong thing
 *
 * UNWIRED versus FAILED is not a nicety. UNWIRED says a work package was never
 * connected; FAILED says a connected thing broke. They lead to different work.
 */

const fs = require('fs');
const path = require('path');

const exec = require('./exec.cjs');
const fixtures = require('./fixtures.cjs');
const queueMod = require('../orchestrator/queue.cjs');

const RUN_TASK_CLI = path.join(__dirname, '..', 'runtime', 'run-task.cjs');
const ORCH_SERVICE_CLI = path.join(__dirname, '..', 'service', 'orch-service.cjs');

/** One recorded interaction with the system under test. */
function step(name, verdict, detail) {
  return { name, verdict, detail: detail === undefined ? null : String(detail).slice(0, 400) };
}

/** Did this run mention the given code anywhere a caller would see it? */
function mentions(res, needle) {
  return (res.stdout + '\n' + res.stderr).indexOf(needle) !== -1;
}

/**
 * The shortest legal queue route between two states, from the queue's own
 * table. Fixture plumbing only: it moves a disposable entry into the state a
 * probe needs to observe FROM, and never asserts anything.
 */
function routeBetween(from, to) {
  if (from === to) return [];
  const SKIP = ['BLOCKED', 'FAILED', 'CANCELLED'];
  const seen = new Set([from]);
  const work = [[from, []]];
  while (work.length) {
    const [at, sofar] = work.shift();
    for (const next of queueMod.QUEUE_ALLOWED[at] || []) {
      if (seen.has(next)) continue;
      const route = sofar.concat([next]);
      if (next === to) return route;
      if (SKIP.indexOf(next) !== -1) continue;
      seen.add(next);
      work.push([next, route]);
    }
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// A. GOV_COORD_V2_RUNNER_AUTHORITY — PROBE_DRY
// ─────────────────────────────────────────────────────────────────────────────

const runnerAuthorityProbe = {
  probeId: 'PROBE_RUNNER_AUTHORITY_DRY',
  probeClass: 'PROBE_DRY',
  /**
   * The definition digest binds the probe's IDENTITY into its evidence. If a
   * later work package quietly drops a negative case to make a red panel go
   * green, the digest changes and the two evidence records stop being
   * comparable — which is the only mechanical defence against a verifier being
   * weakened to agree with the thing it verifies.
   */
  definition: {
    entrypoint: 'runtime/run-task.cjs --dev-direct --dry-run',
    guardedBy: 'the same CLI refuses the direct path outright unless --dev-direct is named',
    positive: 'valid plan and grant resolve authority at origin/main and exit 0',
    negatives: [
      { case: 'direct path without --dev-direct', expect: 'ORCH_RUN_DIRECT_PATH_NOT_PERMITTED' },
      { case: 'fabricated semanticAuthorityRef.recordId', expect: 'AUTHORITY_RECORD_ID_ABSENT' },
      { case: 'execution grant record without the GOV-COORD-AUTHORITY marker', expect: 'AUTHORITY_RECORD_MARKER_MISSING' },
      { case: 'revocation marker present at the tip', expect: 'GRANT_REVOKED' },
    ],
    sideEffects: 'none: no executor, no worktree, no PR, no network',
  },

  async run(ctx) {
    const steps = [];
    const timeoutMs = ctx.timeoutMs;

    const invoke = async (world, extraArgv) =>
      exec.run({
        argv: [
          process.execPath,
          RUN_TASK_CLI,
          '--plan',
          world.planPath,
          '--grant',
          world.grantPath,
          '--repo',
          world.root,
        ].concat(extraArgv),
        cwd: world.root,
        timeoutMs,
      });

    // --dev-direct is required and deliberately loud. #1687 closed this path as
    // a production route precisely because it reaches an executor without
    // admission, the queue or dispatch revalidation; the authority preflight
    // still lives on it, and that is what this capability is about.
    const dryRun = (world) => invoke(world, ['--dev-direct', '--dry-run']);

    // ── the guard on the path itself ────────────────────────────────────────
    // Checked FIRST. If this refusal ever stops firing, the direct executor
    // path is production again and every gate the service adds is bypassable by
    // typing a different command — a bigger finding than anything below it.
    const guardWorld = fixtures.authorityWorld();
    const unguarded = await invoke(guardWorld, ['--dry-run']);
    if (unguarded.code === 0 || !mentions(unguarded, 'ORCH_RUN_DIRECT_PATH_NOT_PERMITTED')) {
      return {
        observedState: 'UNWIRED',
        failureCode: 'DELIVERY_PUBLIC_ENTRYPOINT_BYPASSED',
        detail:
          'run-task accepted the direct path without --dev-direct: the canonical service route ' +
          'is bypassable, so admission, the queue and dispatch revalidation are all optional',
        steps: [step('direct path without --dev-direct', 'ACCEPTED', 'exit ' + unguarded.code)],
      };
    }
    steps.push(step('direct path without --dev-direct', 'REFUSED', 'ORCH_RUN_DIRECT_PATH_NOT_PERMITTED'));

    // ── positive ────────────────────────────────────────────────────────────
    const good = fixtures.authorityWorld();
    const ok = await dryRun(good);
    if (ok.timedOut) {
      return {
        observedState: 'FAILED',
        failureCode: 'DELIVERY_PROBE_TIMEOUT',
        detail: 'the dry run did not finish within ' + timeoutMs + 'ms',
        steps: [step('positive dry run', 'TIMEOUT', ok.killMethod)],
      };
    }
    const resolvedLine = /authority refs\s*:\s*resolved at ([0-9a-f]{40})/.exec(ok.stdout);
    if (ok.code !== 0 || !resolvedLine) {
      return {
        observedState: 'FAILED',
        failureCode: 'DELIVERY_PROBE_FAILED',
        detail: 'valid authority was refused: exit ' + ok.code + ' ' + (ok.stderr || ok.stdout).slice(0, 200),
        steps: [step('positive dry run', 'FAIL', 'exit ' + ok.code)],
      };
    }
    steps.push(step('positive dry run', 'PASS', 'resolved at ' + resolvedLine[1]));

    // ── negatives ───────────────────────────────────────────────────────────
    // Each one bends exactly one fact and expects the check that owns it to
    // fire by name. Expecting a specific code rather than merely a non-zero
    // exit is deliberate: a run that fails for an unrelated reason would
    // otherwise be read as the gate working.
    const negatives = [
      { name: 'fabricated semantic recordId', over: { fabricateSemanticRecordId: true }, expect: 'AUTHORITY_RECORD_ID_ABSENT' },
      { name: 'missing execution-grant marker', over: { omitExecutionMarker: true }, expect: 'AUTHORITY_RECORD_MARKER_MISSING' },
      { name: 'revoked grant', over: { revoke: true }, expect: 'GRANT_REVOKED' },
    ];

    for (const neg of negatives) {
      const world = fixtures.authorityWorld(neg.over);
      const res = await dryRun(world);
      if (res.timedOut) {
        return {
          observedState: 'FAILED',
          failureCode: 'DELIVERY_PROBE_TIMEOUT',
          detail: neg.name + ' did not finish',
          steps: steps.concat([step(neg.name, 'TIMEOUT', res.killMethod)]),
        };
      }
      if (res.code === 0) {
        // The gate is not on the path. This is the exact shape the capability
        // exists to catch, and it is UNWIRED rather than FAILED: nothing
        // misbehaved, the check simply was not there.
        return {
          observedState: 'UNWIRED',
          failureCode: 'DELIVERY_PUBLIC_ENTRYPOINT_BYPASSED',
          detail: neg.name + ' was accepted — the authority gate is not on the dry-run path',
          steps: steps.concat([step(neg.name, 'ACCEPTED', 'exit 0')]),
        };
      }
      if (!mentions(res, neg.expect)) {
        return {
          observedState: 'FAILED',
          failureCode: 'DELIVERY_PROBE_FAILED',
          detail: neg.name + ' was refused, but not by ' + neg.expect + ': ' + (res.stderr || '').slice(0, 200),
          steps: steps.concat([step(neg.name, 'WRONG_CODE', res.stderr.slice(0, 200))]),
        };
      }
      steps.push(step(neg.name, 'REFUSED', neg.expect));
    }

    return { observedState: 'OPERABLE', failureCode: null, detail: 'authority resolved; three fabrications refused', steps };
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// B. GOV_COORD_V2_REQUEST_EXECUTOR_PATH — PROBE_SEALED
// ─────────────────────────────────────────────────────────────────────────────

const requestExecutorProbe = {
  probeId: 'PROBE_REQUEST_EXECUTOR_SEALED',
  probeClass: 'PROBE_SEALED',
  definition: {
    entrypoint: 'service/orch-service.cjs enqueue → run-once',
    positive: 'a request is admitted, lands in a real on-disk queue, and run-once carries it through dispatch into a real executor',
    evidence: 'the service audit log must show TASK_ADMITTED followed by EXECUTOR_STARTED',
    negatives: [{ case: 'boundary outside the standing grant roots', expect: 'BOUNDARY_EXCEEDS_STANDING_GRANT' }],
    sideEffects: 'disposable repository and queue only; the executor is a fake on a temporary PATH',
  },

  async run(ctx) {
    const steps = [];
    const timeoutMs = ctx.timeoutMs;
    const world = fixtures.serviceWorld();
    const { requestPath } = fixtures.officeRequest(world.root);

    const cli = (args, env) =>
      exec.run({
        argv: [process.execPath, ORCH_SERVICE_CLI].concat(args, ['--repo', world.root, '--queue-dir', world.queueDir]),
        cwd: world.root,
        timeoutMs,
        env: env || {},
      });

    // ── admission through the real CLI ──────────────────────────────────────
    const enq = await cli(['enqueue', '--request', requestPath]);
    if (enq.code !== 0 || enq.stdout.indexOf('ADMITTED') === -1) {
      return {
        observedState: enq.code === 2 ? 'UNWIRED' : 'FAILED',
        failureCode: 'DELIVERY_PROBE_FAILED',
        detail: 'enqueue refused a valid request: exit ' + enq.code + ' ' + (enq.stderr || enq.stdout).slice(0, 200),
        steps: [step('enqueue valid request', 'FAIL', 'exit ' + enq.code)],
      };
    }
    const entryId = (/entry\s*:\s*([0-9a-f]+)/.exec(enq.stdout) || [])[1] || null;
    steps.push(step('enqueue valid request', 'ADMITTED', entryId));

    // ── the queue really holds it ───────────────────────────────────────────
    const q = await cli(['queue']);
    if (q.code !== 0 || q.stdout.indexOf('QUEUED') === -1) {
      return {
        observedState: 'FAILED',
        failureCode: 'DELIVERY_PROBE_FAILED',
        detail: 'the entry did not appear in the queue the CLI reads',
        steps: steps.concat([step('queue listing', 'FAIL', q.stdout.slice(0, 200))]),
      };
    }
    steps.push(step('queue listing', 'PASS', 'entry present and QUEUED'));

    // ── the negative: a boundary the standing grant does not cover ──────────
    const outside = fixtures.officeRequest(world.root, {
      taskId: 'PROBE-OFFICE-OUTSIDE-01',
      allowedRoots: ['project/apps/api/src/modules/debtor/'],
    });
    const refused = await cli(['enqueue', '--request', outside.requestPath]);
    if (refused.code === 0) {
      return {
        observedState: 'UNWIRED',
        failureCode: 'DELIVERY_PUBLIC_ENTRYPOINT_BYPASSED',
        detail: 'a boundary outside the standing grant was admitted — admission is not on the enqueue path',
        steps: steps.concat([step('out-of-boundary request', 'ADMITTED', 'exit 0')]),
      };
    }
    if (!mentions(refused, 'BOUNDARY_EXCEEDS_STANDING_GRANT')) {
      return {
        observedState: 'FAILED',
        failureCode: 'DELIVERY_PROBE_FAILED',
        detail: 'refused, but not by the boundary gate: ' + (refused.stderr || '').slice(0, 200),
        steps: steps.concat([step('out-of-boundary request', 'WRONG_CODE', refused.stderr.slice(0, 200))]),
      };
    }
    steps.push(step('out-of-boundary request', 'REFUSED', 'BOUNDARY_EXCEEDS_STANDING_GRANT'));

    // ── dispatch and the executor ───────────────────────────────────────────
    // A fake executor on a temporary PATH, resolved by the REAL resolver. What
    // the executor then does is not this capability's claim — reaching it is.
    // The run is expected to end BLOCKED (there is no remote to open a PR
    // against, and sealed means there must not be one), so the evidence is the
    // audit trail, not the exit code.
    const bin = fixtures.fakeExecutorDir('claude');
    const ran = await cli(['run-once'], { PATH: fixtures.prependPath(bin.dir) });
    if (ran.timedOut) {
      return {
        observedState: 'FAILED',
        failureCode: 'DELIVERY_PROBE_TIMEOUT',
        detail: 'run-once did not finish within ' + timeoutMs + 'ms',
        steps: steps.concat([step('run-once', 'TIMEOUT', ran.killMethod)]),
      };
    }

    const auditPath = path.join(world.queueDir, 'audit.jsonl');
    const trail = fs.existsSync(auditPath)
      ? fs.readFileSync(auditPath, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))
      : [];
    const events = trail.map((t) => t.event);
    const admitted = events.indexOf('TASK_ADMITTED');
    const started = events.indexOf('EXECUTOR_STARTED');

    if (admitted === -1) {
      // Dispatch refused before the executor. That is a real answer, and which
      // refusal it was decides whether the chain is broken or merely guarded.
      const refusal = trail.filter((t) => t.event === 'DISPATCH_REFUSED')[0];
      return {
        observedState: 'UNWIRED',
        failureCode: 'DELIVERY_PROBE_FAILED',
        detail: refusal
          ? 'dispatch refused: ' + JSON.stringify(refusal.detail || refusal).slice(0, 200)
          : 'run-once never admitted the task: ' + (ran.stdout || ran.stderr).slice(0, 200),
        steps: steps.concat([step('run-once dispatch', 'FAIL', events.join(','))]),
      };
    }
    steps.push(step('run-once dispatch', 'PASS', 'TASK_ADMITTED'));

    if (started === -1 || started < admitted) {
      return {
        observedState: 'UNWIRED',
        failureCode: 'DELIVERY_PROBE_FAILED',
        detail: 'the chain stopped before an executor started; audit events: ' + events.join(','),
        steps: steps.concat([step('executor reached', 'FAIL', events.join(','))]),
      };
    }
    steps.push(step('executor reached', 'PASS', 'EXECUTOR_STARTED'));

    return {
      observedState: 'OPERABLE',
      failureCode: null,
      detail: 'request → admission → queue → dispatch → executor, through the shipped CLI',
      steps,
    };
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// C. MECHANICAL_GOVERNANCE_GATE — PROBE_SEALED
// ─────────────────────────────────────────────────────────────────────────────

const governanceGateProbe = {
  probeId: 'PROBE_GOVERNANCE_GATE_SEALED',
  probeClass: 'PROBE_SEALED',
  definition: {
    entrypoint: 'service/orch-service.cjs enqueue',
    positive: 'a bounded governance request writing one coordination-request file is admitted',
    negatives: [
      { case: 'target on the envelope-prohibited orchestration surface', expect: 'GOVERNANCE_TOUCHES_PROHIBITED_SURFACE' },
      { case: 'canonical governance target off the queue surface', expect: 'GOVERNANCE_TARGET_OFF_QUEUE_SURFACE' },
      { case: 'governance task class under a code grant', expect: 'GOVERNANCE_PROFILE_MISMATCH' },
      { case: 'code task class under the governance grant', expect: 'GOVERNANCE_GRANT_CANNOT_RUN_CODE' },
    ],
    sideEffects: 'disposable repository and queue only; nothing is executed',
  },

  async run(ctx) {
    const steps = [];
    const world = fixtures.serviceWorld();
    const cli = (args) =>
      exec.run({
        argv: [process.execPath, ORCH_SERVICE_CLI].concat(args, ['--repo', world.root, '--queue-dir', world.queueDir]),
        cwd: world.root,
        timeoutMs: ctx.timeoutMs,
      });

    // ── positive: the one shape the profile is allowed to write ─────────────
    const good = fixtures.governanceRequest(world.root, { taskId: 'PROBE-GOV-OK-01' });
    const ok = await cli(['enqueue', '--request', good.requestPath, '--operation', 'EXACT_APPEND_AT_DECLARED_ANCHOR']);
    if (ok.code !== 0 || ok.stdout.indexOf('ADMITTED') === -1) {
      return {
        observedState: 'FAILED',
        failureCode: 'DELIVERY_PROBE_FAILED',
        detail: 'a valid bounded governance request was refused: ' + (ok.stderr || ok.stdout).slice(0, 200),
        steps: [step('valid governance request', 'FAIL', 'exit ' + ok.code)],
      };
    }
    steps.push(step('valid governance request', 'ADMITTED', 'EXACT_APPEND_AT_DECLARED_ANCHOR'));

    // ── negatives ───────────────────────────────────────────────────────────
    const negatives = [
      {
        name: 'prohibited orchestration surface',
        expect: 'GOVERNANCE_TOUCHES_PROHIBITED_SURFACE',
        req: () =>
          fixtures.governanceRequest(world.root, {
            taskId: 'PROBE-GOV-PROHIBITED-01',
            allowedRoots: ['project/scripts/orchestration-v2/orchestrator/authority.cjs'],
          }),
        operation: 'EXACT_LITERAL_REPLACEMENT',
      },
      {
        name: 'canonical governance off the queue surface',
        expect: 'GOVERNANCE_TARGET_OFF_QUEUE_SURFACE',
        req: () =>
          fixtures.governanceRequest(world.root, {
            taskId: 'PROBE-GOV-OFFSURFACE-01',
            allowedRoots: ['project/docs/governance/decision-log.md'],
          }),
        operation: 'EXACT_APPEND_AT_DECLARED_ANCHOR',
      },
      {
        name: 'free-form operation',
        expect: 'GOVERNANCE_OPERATION_NOT_LEVEL2',
        req: () => fixtures.governanceRequest(world.root, { taskId: 'PROBE-GOV-FREEFORM-01' }),
        operation: 'REWRITE_HOWEVER_YOU_LIKE',
      },
      {
        name: 'governance class under a code grant',
        expect: 'GOVERNANCE_PROFILE_MISMATCH',
        req: () =>
          fixtures.governanceRequest(world.root, {
            taskId: 'PROBE-GOV-CODEGRANT-01',
            standingGrantPath: fixtures.OFFICE_GRANT,
          }),
        operation: 'EXACT_APPEND_AT_DECLARED_ANCHOR',
      },
      {
        name: 'code class under the governance grant',
        expect: 'GOVERNANCE_GRANT_CANNOT_RUN_CODE',
        req: () =>
          fixtures.governanceRequest(world.root, {
            taskId: 'PROBE-GOV-CODECLASS-01',
            taskClass: 'BOUNDED_CODE_FIX',
          }),
        operation: 'EXACT_APPEND_AT_DECLARED_ANCHOR',
      },
    ];

    for (const neg of negatives) {
      const r = neg.req();
      const res = await cli(['enqueue', '--request', r.requestPath, '--operation', neg.operation]);
      if (res.code === 0) {
        return {
          observedState: 'UNWIRED',
          failureCode: 'DELIVERY_PUBLIC_ENTRYPOINT_BYPASSED',
          detail: neg.name + ' was admitted — the governance profile is not on the admission path',
          steps: steps.concat([step(neg.name, 'ADMITTED', 'exit 0')]),
        };
      }
      if (!mentions(res, neg.expect)) {
        return {
          observedState: 'FAILED',
          failureCode: 'DELIVERY_PROBE_FAILED',
          detail: neg.name + ' refused, but not by ' + neg.expect + ': ' + (res.stderr || '').slice(0, 200),
          steps: steps.concat([step(neg.name, 'WRONG_CODE', res.stderr.slice(0, 160))]),
        };
      }
      steps.push(step(neg.name, 'REFUSED', neg.expect));
    }

    return {
      observedState: 'ENFORCED',
      failureCode: null,
      detail: 'the governance profile admitted one bounded write and refused five forbidden ones',
      steps,
    };
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// D. GOV_COORD_V2_POST_MERGE_DELIVERY_CLOSURE — PROBE_SEALED
// ─────────────────────────────────────────────────────────────────────────────

const postMergeClosureProbe = {
  probeId: 'PROBE_POST_MERGE_CLOSURE_SEALED',
  probeClass: 'PROBE_SEALED',
  definition: {
    entrypoint: 'service/orch-service.cjs finalize (expected to exist)',
    positive:
      'a durably persisted MERGE_READY entry can be carried through fresh revalidation, merge, ' +
      'merge-SHA-bound delivery verification and CLOSED, by a public operator command',
    observedToday: 'no such command exists; the queue declares five states past MERGE_READY that nothing public can reach',
    sideEffects: 'disposable repository and queue only',
  },

  async run(ctx) {
    const steps = [];
    const world = fixtures.serviceWorld();
    const { requestPath } = fixtures.officeRequest(world.root, { taskId: 'PROBE-CLOSURE-01' });

    const cli = (args) =>
      exec.run({
        argv: [process.execPath, ORCH_SERVICE_CLI].concat(args, ['--repo', world.root, '--queue-dir', world.queueDir]),
        cwd: world.root,
        timeoutMs: ctx.timeoutMs,
      });

    // Build the handoff through the real CLI, then walk it to MERGE_READY with
    // the real queue. Creating the state to be finalized is fixture work; the
    // claim under test is only whether a public command can finalize it.
    const enq = await cli(['enqueue', '--request', requestPath]);
    if (enq.code !== 0) {
      return {
        observedState: 'FAILED',
        failureCode: 'FINALIZATION_CONTEXT_MISSING',
        detail: 'could not build a MERGE_READY fixture: enqueue exited ' + enq.code,
        steps: [step('build handoff', 'FAIL', (enq.stderr || enq.stdout).slice(0, 200))],
      };
    }
    const queue = queueMod.createQueue(world.queueDir);
    const entry = queue.list()[0];
    const route = routeBetween(entry.state, 'MERGE_READY');
    if (!route) {
      return {
        observedState: 'FAILED',
        failureCode: 'FINALIZATION_CONTEXT_MISSING',
        detail: 'the queue table has no route from ' + entry.state + ' to MERGE_READY',
        steps: [step('build handoff', 'FAIL', entry.state)],
      };
    }
    for (const to of route) {
      queue.transition({
        entryId: entry.entryId,
        to,
        expectedPreviousState: queue.get(entry.entryId).state,
        nowMs: Date.now(),
        patch:
          to === 'PR_OPEN'
            ? { prNumber: 999999, prHeadSha: 'f'.repeat(40), branch: 'probe/closure' }
            : to === 'MERGE_READY'
              ? { attestationAt: new Date().toISOString() }
              : {},
      });
    }
    steps.push(step('build MERGE_READY handoff', 'PASS', entry.entryId.slice(0, 12) + ' in MERGE_READY'));

    // ── the actual question ─────────────────────────────────────────────────
    const fin = await cli(['finalize', '--entry', entry.entryId]);
    const unknownCommand = fin.code === 2 && mentions(fin, 'unknown command');
    if (unknownCommand) {
      return {
        observedState: 'UNWIRED',
        failureCode: 'DELIVERY_PROBE_MISSING',
        detail:
          'the operator console has no finalize command: a MERGE_READY entry cannot be carried to CLOSED ' +
          'by any public path, and completeAfterOwnerMerge has no caller on any executable path',
        steps: steps.concat([step('finalize --entry', 'NO_SUCH_COMMAND', 'exit 2')]),
      };
    }

    // If a finalize command DOES exist, the capability is judged on whether it
    // actually reaches CLOSED with delivery evidence — which is WP02/WP03's
    // subject. Until then this branch is unreachable, and it is written now so
    // that the probe does not need weakening later to notice the repair.
    const after = queueMod.createQueue(world.queueDir).get(entry.entryId);
    if (fin.code !== 0) {
      return {
        observedState: 'FAILED',
        failureCode: 'POST_MERGE_DELIVERY_FAILED',
        detail: 'finalize exists but exited ' + fin.code + ': ' + (fin.stderr || fin.stdout).slice(0, 200),
        steps: steps.concat([step('finalize --entry', 'FAIL', 'exit ' + fin.code)]),
      };
    }
    if (after.state !== 'CLOSED') {
      return {
        observedState: 'FAILED',
        failureCode: 'POST_MERGE_DELIVERY_FAILED',
        detail: 'finalize succeeded but the entry is ' + after.state + ', not CLOSED',
        steps: steps.concat([step('finalize --entry', 'INCOMPLETE', after.state)]),
      };
    }
    steps.push(step('finalize --entry', 'PASS', 'CLOSED'));
    return {
      observedState: 'ENFORCED',
      failureCode: null,
      detail: 'a MERGE_READY handoff was finalized to CLOSED through the operator console',
      steps,
    };
  },
};

const PROBES = {
  PROBE_RUNNER_AUTHORITY_DRY: runnerAuthorityProbe,
  PROBE_REQUEST_EXECUTOR_SEALED: requestExecutorProbe,
  PROBE_GOVERNANCE_GATE_SEALED: governanceGateProbe,
  PROBE_POST_MERGE_CLOSURE_SEALED: postMergeClosureProbe,
};

module.exports = {
  RUN_TASK_CLI,
  ORCH_SERVICE_CLI,
  PROBES,
  routeBetween,
  step,
  mentions,
};
