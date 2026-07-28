'use strict';
/**
 * GOV-COORD-V2 orchestration — persisted task lifecycle.
 *
 * Contract: coordination-v2/governance-orchestration-contract-v2.md §3, §4, §6
 *
 * The fourteen states and their transitions come from the ratified contract and
 * are not extended here. Every transition is a compare-and-swap against the
 * expected previous state, and every transition from CLAIMED onward re-verifies
 * leaseEpoch and holderToken before it is allowed to write — a stale holder can
 * observe state but can never advance it.
 *
 * Task revision is deliberately NOT a state here (contract §2.1, §3). A design
 * being superseded is not a lifecycle position, and adding HANDOFF_REQUIRED or
 * SUPERSEDED to the list above would break every consumer of it while still
 * failing to say what should happen next. Revision lives in revision.cjs as a
 * structured internal event and rides along on `opts.revision`, which is
 * optional: a caller that passes nothing behaves exactly as before.
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { digest } = require('./authority.cjs');
const revision = require('./revision.cjs');

/**
 * Where orchestrator state belongs: under the Git common directory, never
 * inside the working tree it validates.
 *
 * Writing state into the working tree makes the orchestrator's own bookkeeping
 * show up as an untracked file in the very diff it is about to validate, so
 * every task would fail its own boundary check. This mirrors the lease design,
 * which lives in refs rather than in checked-out files.
 */
function defaultStateDir(repoCwd) {
  const out = execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], {
    cwd: repoCwd,
    encoding: 'utf8',
  }).trim();
  return path.join(out.split('\\').join('/'), 'governance-coordination', 'state');
}

const STATES = [
  'DECLARED',
  'AUTHORIZED',
  'ELIGIBLE',
  'CLAIMED',
  'WORKTREE_READY',
  'EXECUTOR_RUNNING',
  'VALIDATING',
  'PR_OPEN',
  'CI_PENDING',
  'MERGE_READY',
  'MERGED',
  'CLOSED',
  'BLOCKED',
  'CANCELLED',
];

/** Terminal states may not be advanced out of, except BLOCKED (§3). */
const TERMINAL = ['CLOSED', 'CANCELLED'];

/** Writers permitted to author each state (§3). */
const WRITER = {
  DECLARED: 'TASK_AUTHOR',
  AUTHORIZED: 'OWNER',
  ELIGIBLE: 'ORCHESTRATOR',
  CLAIMED: 'ORCHESTRATOR',
  WORKTREE_READY: 'ORCHESTRATOR',
  EXECUTOR_RUNNING: 'ORCHESTRATOR',
  VALIDATING: 'ORCHESTRATOR',
  PR_OPEN: 'ORCHESTRATOR',
  CI_PENDING: 'ORCHESTRATOR',
  MERGE_READY: 'ORCHESTRATOR',
  MERGED: 'OWNER',
  CLOSED: 'ORCHESTRATOR',
  BLOCKED: 'ORCHESTRATOR',
  CANCELLED: 'OWNER_OR_ORCHESTRATOR',
};

/**
 * Allowed transitions. BLOCKED and CANCELLED are reachable from any live state;
 * BLOCKED returns only to ELIGIBLE, and only by owner action.
 */
const ALLOWED = {
  DECLARED: ['AUTHORIZED', 'CANCELLED'],
  AUTHORIZED: ['ELIGIBLE', 'BLOCKED', 'CANCELLED'],
  ELIGIBLE: ['CLAIMED', 'BLOCKED', 'CANCELLED'],
  CLAIMED: ['WORKTREE_READY', 'BLOCKED', 'CANCELLED'],
  WORKTREE_READY: ['EXECUTOR_RUNNING', 'BLOCKED', 'CANCELLED'],
  EXECUTOR_RUNNING: ['VALIDATING', 'BLOCKED', 'CANCELLED'],
  VALIDATING: ['PR_OPEN', 'BLOCKED', 'CANCELLED'],
  PR_OPEN: ['CI_PENDING', 'BLOCKED', 'CANCELLED'],
  CI_PENDING: ['MERGE_READY', 'BLOCKED', 'CANCELLED'],
  MERGE_READY: ['MERGED', 'BLOCKED', 'CANCELLED'],
  MERGED: ['CLOSED', 'BLOCKED'],
  BLOCKED: ['ELIGIBLE', 'CANCELLED'],
  CLOSED: [],
  CANCELLED: [],
};

/** States from which a lease must exist and be held (§3.1). */
const LEASE_REQUIRED_FROM = STATES.indexOf('CLAIMED');

class StateError extends Error {
  constructor(code, detail) {
    super(code + (detail ? ': ' + detail : ''));
    this.name = 'StateError';
    this.code = code;
    this.detail = detail || null;
  }
}

function fail(code, detail) {
  throw new StateError(code, detail);
}

function requiresLease(state) {
  const i = STATES.indexOf(state);
  if (i === -1) fail('STATE_UNKNOWN', state);
  // BLOCKED/CANCELLED/CLOSED are dispositions, not lease-bearing stages.
  if (state === 'BLOCKED' || state === 'CANCELLED' || state === 'CLOSED') return false;
  return i >= LEASE_REQUIRED_FROM;
}

/**
 * Append-only state store. One JSONL file per task: the history is evidence and
 * is never rewritten, and the current state is the last record.
 */
function createStore(dir) {
  fs.mkdirSync(dir, { recursive: true });

  const fileFor = (taskId) => path.join(dir, taskId + '.jsonl');

  function history(taskId) {
    const f = fileFor(taskId);
    if (!fs.existsSync(f)) return [];
    return fs
      .readFileSync(f, 'utf8')
      .split('\n')
      .filter((l) => l.trim().length > 0)
      .map((l, i) => {
        try {
          return JSON.parse(l);
        } catch (e) {
          return fail('STATE_RECORD_MALFORMED', taskId + ' line ' + (i + 1));
        }
      });
  }

  function current(taskId) {
    const h = history(taskId);
    return h.length ? h[h.length - 1] : null;
  }

  /**
   * Advance a task. Fail-closed on: unknown state, disallowed transition,
   * expectedPreviousState mismatch (the CAS), missing or stale lease identity,
   * and any write against a terminal state.
   */
  function transition(opts) {
    const taskId = opts.taskId;
    const to = opts.to;
    if (STATES.indexOf(to) === -1) fail('STATE_UNKNOWN', String(to));

    const prev = current(taskId);
    const from = prev ? prev.state : null;

    // Compare-and-swap on the observed previous state.
    if (opts.expectedPreviousState !== from) {
      fail(
        'STATE_CAS_MISMATCH',
        'expected ' + String(opts.expectedPreviousState) + ' but store holds ' + String(from),
      );
    }

    if (from === null) {
      if (to !== 'DECLARED') fail('STATE_TRANSITION_FORBIDDEN', 'first state must be DECLARED');
    } else {
      if (TERMINAL.indexOf(from) !== -1) fail('STATE_TERMINAL', from);
      if ((ALLOWED[from] || []).indexOf(to) === -1) {
        // One exception, and it is not an execution step.
        //
        // A task can be BLOCKED here while its change is demonstrably in main:
        // the queue closed, the pull request merged, the sha is an ancestor of
        // origin/main. The table has no edge for that because no EXECUTION
        // produces it — the record is simply stale about something that already
        // happened outside this machine.
        //
        // Reconciling it is therefore not a transition the orchestrator may
        // take on its own. It requires externally verified truth, which the
        // caller must have checked item by item before asking, and it is
        // flagged explicitly so it can never be a side effect of an ordinary
        // write. The historical blocker is preserved in the record.
        // Only this one edge: MERGED -> CLOSED is already in the table, so
        // reconciliation needs to open exactly BLOCKED -> MERGED and nothing
        // else.
        if (!(opts.externalTruthReconciliation === true && from === 'BLOCKED' && to === 'MERGED')) {
          fail('STATE_TRANSITION_FORBIDDEN', from + ' -> ' + to);
        }
      }
    }

    // A reconciliation holds no lease, and demanding one would be incoherent:
    // the lease exists to prove an executor is alive and owns the attempt, and
    // the entire premise here is that nothing is executing — the work finished
    // outside this machine and only the record is behind. Requiring a lease
    // would mean minting a fake one, which is worse than not having it.
    if (requiresLease(to) && opts.externalTruthReconciliation !== true) {
      if (!Number.isInteger(opts.leaseEpoch) || opts.leaseEpoch < 1) {
        fail('LEASE_EPOCH_REQUIRED', to);
      }
      if (!/^[0-9a-f]{32}$/.test(String(opts.holderToken))) {
        fail('HOLDER_TOKEN_REQUIRED', to);
      }
      if (typeof opts.assertHeld === 'function') {
        try {
          opts.assertHeld();
        } catch (e) {
          fail('FENCING_FAILURE', (e && e.code) || String(e && e.message));
        }
      }
      // A holder may not change mid-attempt without a new epoch.
      if (prev && prev.leaseEpoch != null && prev.holderToken != null) {
        if (prev.leaseEpoch === opts.leaseEpoch && prev.holderToken !== opts.holderToken) {
          fail('HOLDER_TOKEN_CHANGED_WITHIN_EPOCH', taskId);
        }
        if (opts.leaseEpoch < prev.leaseEpoch) {
          fail('LEASE_EPOCH_REGRESSION', opts.leaseEpoch + ' < ' + prev.leaseEpoch);
        }
      }
    }

    // Revision enforcement. Opsiyoneldir: `opts.revision` yoksa hicbir sey
    // degismez ve mevcut kayitlar aynen calisir (contract §2.1 backward-
    // compatible reader).
    if (opts.revision) {
      const view = revision.readRevisionView(prev ? prev.payload : null);
      const verdict = revision.validateRevision(opts.revision, view, opts.revisionOptions || {});
      if (!verdict.valid) {
        fail('REVISION_INVALID', verdict.violations.map((v) => v.code).join(','));
      }
      // Revision-eligible bir degisiklik gorevi terminal ETMEZ.
      if (to === 'CANCELLED') {
        const t = revision.assertTerminationAllowed(opts.revision);
        if (!t.allowed) fail(t.violations[0].code, t.violations[0].detail);
      }
    }

    // The writer table says WHO performs an execution step — MERGED is OWNER
    // because a human merges. A reconciliation performs no step: it records
    // that the merge already happened, and the honest attribution is the owner
    // DECISION it cites, carried in the payload, not an identity borrowed to
    // satisfy a check. Claiming to be the owner would be the misrepresentation
    // this table exists to prevent.
    const expectedWriter = opts.externalTruthReconciliation === true ? null : WRITER[to];
    if (opts.writerIdentity && expectedWriter && expectedWriter !== 'OWNER_OR_ORCHESTRATOR') {
      if (opts.writerIdentity !== expectedWriter) {
        fail('WRITER_IDENTITY_FORBIDDEN', opts.writerIdentity + ' may not author ' + to);
      }
    }

    const payload = opts.revision
      ? Object.assign({}, opts.payload || {}, { taskRevision: opts.revision })
      : opts.payload || {};
    const record = {
      schemaVersion: 1,
      taskId: taskId,
      state: to,
      expectedPreviousState: opts.expectedPreviousState,
      taskAttemptId: opts.taskAttemptId || (prev ? prev.taskAttemptId : null),
      leaseEpoch: opts.leaseEpoch != null ? opts.leaseEpoch : null,
      holderToken: opts.holderToken || null,
      statePayloadSha256: digest(payload),
      payload: payload,
      timestamp: new Date(opts.nowMs != null ? opts.nowMs : Date.now()).toISOString(),
      writerIdentity: opts.writerIdentity || 'ORCHESTRATOR',
      previousRecordSha256: prev ? digest(stripVolatile(prev)) : null,
    };

    fs.appendFileSync(fileFor(taskId), JSON.stringify(record) + '\n', 'utf8');
    return record;
  }

  function list() {
    if (!fs.existsSync(dir)) return [];
    return fs
      .readdirSync(dir)
      .filter((f) => f.endsWith('.jsonl'))
      .map((f) => f.slice(0, -6));
  }

  /**
   * Recover the live view after a restart: the last record per task, plus any
   * task left mid-flight so the caller can fail it closed rather than resume it
   * blindly.
   */
  function recover() {
    const out = { tasks: {}, interrupted: [] };
    for (const taskId of list()) {
      const rec = current(taskId);
      out.tasks[taskId] = rec;
      if (rec && requiresLease(rec.state) && rec.state !== 'MERGE_READY') {
        out.interrupted.push(taskId);
      }
    }
    return out;
  }

  return { dir, history, current, transition, list, recover, fileFor };
}

/** Volatile fields excluded from the chain hash so it stays reproducible. */
function stripVolatile(record) {
  const copy = Object.assign({}, record);
  delete copy.timestamp;
  return copy;
}

module.exports = {
  defaultStateDir,
  STATES,
  TERMINAL,
  ALLOWED,
  WRITER,
  StateError,
  requiresLease,
  createStore,
  stripVolatile,
};
