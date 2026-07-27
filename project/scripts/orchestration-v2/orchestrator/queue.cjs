'use strict';
/**
 * GOV-COORD-V2 durable task queue.
 *
 * The pilot could run one task, once, when a human typed the command. An
 * operational service has to accept work, remember it across a crash, run it in
 * a defined order, and refuse to run the same thing twice. That is all this is.
 *
 * Deliberately NOT a framework. Append-only JSONL under the git common dir,
 * exactly like state.cjs — same persistence shape, same audit properties, no new
 * dependency, no daemon-only storage that a restart cannot read back.
 *
 * Two invariants carry the design:
 *
 *   Serial. maxConcurrency is 1 and claiming is compare-and-swap, so two
 *   workers cannot both take the head of the queue. The standing grants also
 *   pin maxConcurrency at 1, so this is not a tunable.
 *
 *   Idempotent. An entry is identified by its idempotencyKey, not by insertion
 *   order. Re-enqueueing the same key returns the existing entry instead of
 *   creating a second one — which is what makes a retried enqueue, a duplicate
 *   webhook and a restart-replay all safe.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

/**
 * Lifecycle. Ordered from admission to closure; the terminal three sit apart.
 *
 * This is a superset of the orchestrator's own task states: the queue tracks
 * the stages AROUND a run (planning, review, repair, merge, sync, cleanup)
 * which runTask has no concept of, because runTask handles exactly one attempt
 * and stops at MERGE_READY.
 */
const QUEUE_STATES = [
  'QUEUED',
  'PLANNING',
  'REVIEWING',
  'AUTHORIZED',
  'PREFLIGHT',
  'EXECUTING',
  'VALIDATING',
  'PR_OPEN',
  'CI_WAITING',
  'CI_FAILED',
  'REPAIRING',
  'MERGE_READY',
  'MERGING',
  'MERGED',
  'SYNCING',
  'CLEANING',
  'CLOSED',
  'BLOCKED',
  'FAILED',
  'CANCELLED',
];

/** Nothing leaves these. BLOCKED is recoverable and deliberately absent. */
const QUEUE_TERMINAL = ['CLOSED', 'FAILED', 'CANCELLED'];

/**
 * Legal transitions.
 *
 * CI_FAILED returns to REPAIRING rather than ending the entry: a failing check
 * caused by the patch is repaired inside the same task, which is the directive's
 * explicit instruction and the reason a CI failure is not a stop condition.
 *
 * BLOCKED returns only to QUEUED, and only when a caller asks — the same shape
 * as the orchestrator's owner-authorized resume, for the same reason: silently
 * retrying a blocked entry is what the guard exists to prevent.
 */
const QUEUE_ALLOWED = {
  // The backward edges are RECOVERY edges, not shortcuts. A worker that dies
  // mid-stage leaves its entry stranded in an active state, and recovery.cjs
  // rewinds it to a point a fresh attempt can safely start from. They live in
  // this table rather than bypassing it, so the table stays the single answer
  // to what is legal.
  QUEUED: ['PLANNING', 'CANCELLED', 'BLOCKED'],
  PLANNING: ['REVIEWING', 'QUEUED', 'BLOCKED', 'FAILED', 'CANCELLED'],
  REVIEWING: ['AUTHORIZED', 'PLANNING', 'QUEUED', 'BLOCKED', 'FAILED', 'CANCELLED'],
  AUTHORIZED: ['PREFLIGHT', 'QUEUED', 'BLOCKED', 'FAILED', 'CANCELLED'],
  PREFLIGHT: ['EXECUTING', 'AUTHORIZED', 'BLOCKED', 'FAILED', 'CANCELLED'],
  EXECUTING: ['VALIDATING', 'AUTHORIZED', 'BLOCKED', 'FAILED', 'CANCELLED'],
  VALIDATING: ['PR_OPEN', 'REPAIRING', 'AUTHORIZED', 'BLOCKED', 'FAILED', 'CANCELLED'],
  PR_OPEN: ['CI_WAITING', 'BLOCKED', 'FAILED', 'CANCELLED'],
  CI_WAITING: ['MERGE_READY', 'CI_FAILED', 'BLOCKED', 'FAILED', 'CANCELLED'],
  CI_FAILED: ['REPAIRING', 'BLOCKED', 'FAILED', 'CANCELLED'],
  REPAIRING: ['EXECUTING', 'VALIDATING', 'AUTHORIZED', 'BLOCKED', 'FAILED', 'CANCELLED'],
  MERGE_READY: ['MERGING', 'BLOCKED', 'FAILED', 'CANCELLED'],
  MERGING: ['MERGED', 'BLOCKED', 'FAILED', 'CANCELLED'],
  MERGED: ['SYNCING', 'BLOCKED', 'FAILED'],
  SYNCING: ['CLEANING', 'BLOCKED', 'FAILED'],
  CLEANING: ['CLOSED', 'BLOCKED', 'FAILED'],
  CLOSED: [],
  BLOCKED: ['QUEUED', 'CANCELLED'],
  FAILED: [],
  CANCELLED: [],
};

/** States in which an entry occupies the single execution slot. */
const OCCUPIES_SLOT = [
  'PLANNING',
  'REVIEWING',
  'AUTHORIZED',
  'PREFLIGHT',
  'EXECUTING',
  'VALIDATING',
  'PR_OPEN',
  'CI_WAITING',
  'CI_FAILED',
  'REPAIRING',
  'MERGE_READY',
  'MERGING',
  'MERGED',
  'SYNCING',
  'CLEANING',
];

class QueueError extends Error {
  constructor(code, detail) {
    super(code + (detail ? ': ' + detail : ''));
    this.name = 'QueueError';
    this.code = code;
    this.detail = detail || null;
  }
}

function fail(code, detail) {
  throw new QueueError(code, detail);
}

/** Queue lives beside the state store, under the git common dir. */
function defaultQueueDir(repoCwd) {
  const out = execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], {
    cwd: repoCwd,
    encoding: 'utf8',
  }).trim();
  return path.join(out.split('\\').join('/'), 'governance-coordination', 'queue');
}

/**
 * The identity that makes enqueueing idempotent.
 *
 * Derived from what actually distinguishes one unit of work — program, task id,
 * plan hash and task class — rather than from a timestamp or a counter. Two
 * requests describing the same work produce the same key and therefore the same
 * entry, whether they arrive from a retry, a duplicate event or a replay after
 * restart.
 */
function idempotencyKeyFor(req) {
  const material = [
    String(req.programId || ''),
    String(req.taskId || ''),
    String(req.taskSpecSha256 || ''),
    String(req.taskClass || ''),
  ].join('\u0000');
  return crypto.createHash('sha256').update(material, 'utf8').digest('hex');
}

function createQueue(dir) {
  fs.mkdirSync(dir, { recursive: true });
  const logFile = path.join(dir, 'queue.jsonl');

  const readAll = () => {
    if (!fs.existsSync(logFile)) return [];
    return fs
      .readFileSync(logFile, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l));
  };

  /** Latest record per entry id — the log is append-only, the view is folded. */
  const fold = () => {
    const byId = new Map();
    for (const rec of readAll()) byId.set(rec.entryId, rec);
    return byId;
  };

  const append = (rec) => {
    fs.appendFileSync(logFile, JSON.stringify(rec) + '\n', 'utf8');
    return rec;
  };

  return {
    dir,
    logFile,

    /** Every entry, newest record per id, in insertion order. */
    list() {
      return [...fold().values()];
    },

    get(entryId) {
      return fold().get(entryId) || null;
    },

    byIdempotencyKey(key) {
      for (const rec of fold().values()) if (rec.idempotencyKey === key) return rec;
      return null;
    },

    /**
     * Admit work. Returns the existing entry unchanged when the same key is
     * already known — a duplicate enqueue is not an error, it is a no-op, and
     * treating it as one is what makes retries safe.
     */
    enqueue(req) {
      for (const f of ['programId', 'taskId', 'taskClass', 'parentAuthorizationId']) {
        if (!req || typeof req[f] !== 'string' || !req[f]) fail('QUEUE_REQUEST_INVALID', f);
      }
      const key = req.idempotencyKey || idempotencyKeyFor(req);
      const existing = this.byIdempotencyKey(key);
      if (existing) return Object.assign({}, existing, { deduplicated: true });

      const now = req.nowMs || Date.now();
      return append({
        schemaVersion: 1,
        entryId: crypto.randomBytes(12).toString('hex'),
        idempotencyKey: key,
        state: 'QUEUED',
        programId: req.programId,
        taskId: req.taskId,
        taskClass: req.taskClass,
        parentAuthorizationId: req.parentAuthorizationId,
        standingGrantId: req.standingGrantId || null,
        taskSpecSha256: req.taskSpecSha256 || null,
        priority: Number.isFinite(req.priority) ? req.priority : 100,
        dependsOn: Array.isArray(req.dependsOn) ? req.dependsOn.slice() : [],
        attempts: 0,
        executorLane: req.executorLane || null,
        worktreePath: null,
        branch: null,
        prNumber: null,
        prHeadSha: null,
        mergeSha: null,
        blockerCode: null,
        enqueuedAtMs: now,
        updatedAtMs: now,
        payload: req.payload || {},
      });
    },

    /**
     * The one entry that may run next, or null.
     *
     * Returns null while any entry occupies the slot — that is the serial
     * guarantee, enforced here rather than left to a caller's discipline. Ready
     * entries are ordered by priority then by arrival, and an entry whose
     * dependencies have not CLOSED is not ready.
     */
    head() {
      const all = [...fold().values()];
      if (all.some((e) => OCCUPIES_SLOT.includes(e.state))) return null;
      const closed = new Set(all.filter((e) => e.state === 'CLOSED').map((e) => e.taskId));
      const ready = all
        .filter((e) => e.state === 'QUEUED')
        .filter((e) => (e.dependsOn || []).every((d) => closed.has(d)));
      ready.sort((a, b) => a.priority - b.priority || a.enqueuedAtMs - b.enqueuedAtMs);
      return ready[0] || null;
    },

    /**
     * Move an entry, compare-and-swap on the observed state.
     *
     * The CAS is what stops two workers advancing the same entry: whoever
     * writes second observed a state that no longer holds and is refused,
     * rather than silently overwriting.
     */
    transition(opts) {
      const id = opts && opts.entryId;
      const to = opts && opts.to;
      if (QUEUE_STATES.indexOf(to) === -1) fail('QUEUE_STATE_UNKNOWN', String(to));
      const cur = this.get(id);
      if (!cur) fail('QUEUE_ENTRY_UNKNOWN', String(id));
      if (opts.expectedPreviousState !== cur.state) {
        fail('QUEUE_CAS_MISMATCH', 'expected ' + String(opts.expectedPreviousState) + ' but holds ' + cur.state);
      }
      if (QUEUE_TERMINAL.indexOf(cur.state) !== -1) fail('QUEUE_STATE_TERMINAL', cur.state);
      // A move to the same state is a metadata touch, not a lifecycle step —
      // how a worker stamps ownership or refreshes a heartbeat without
      // pretending to advance. It still goes through the CAS and still lands in
      // the append-only log, so the history shows who held what and when.
      if (to !== cur.state && (QUEUE_ALLOWED[cur.state] || []).indexOf(to) === -1) {
        fail('QUEUE_TRANSITION_FORBIDDEN', cur.state + ' -> ' + to);
      }
      // Resuming a blocked entry is an explicit act, exactly as it is for a
      // blocked task: a queue that quietly retries defeats its own guard.
      if (cur.state === 'BLOCKED' && to === 'QUEUED' && opts.resumeAuthorized !== true) {
        fail('QUEUE_RESUME_NOT_AUTHORIZED', cur.blockerCode || 'blocked');
      }

      const now = opts.nowMs || Date.now();
      const next = Object.assign({}, cur, opts.patch || {}, {
        state: to,
        updatedAtMs: now,
        attempts: to === 'EXECUTING' ? (cur.attempts || 0) + 1 : cur.attempts,
      });
      if (to !== 'BLOCKED') next.blockerCode = null;
      return append(next);
    },

    /** Depth of work still to do — what an operator asks first. */
    depth() {
      const all = [...fold().values()];
      return {
        queued: all.filter((e) => e.state === 'QUEUED').length,
        active: all.filter((e) => OCCUPIES_SLOT.includes(e.state)).length,
        blocked: all.filter((e) => e.state === 'BLOCKED').length,
        closed: all.filter((e) => e.state === 'CLOSED').length,
        failed: all.filter((e) => e.state === 'FAILED').length,
        cancelled: all.filter((e) => e.state === 'CANCELLED').length,
        total: all.length,
      };
    },

    /** The entry currently holding the slot, if any. */
    active() {
      return [...fold().values()].find((e) => OCCUPIES_SLOT.includes(e.state)) || null;
    },
  };
}

module.exports = {
  QUEUE_STATES,
  QUEUE_TERMINAL,
  QUEUE_ALLOWED,
  OCCUPIES_SLOT,
  QueueError,
  defaultQueueDir,
  idempotencyKeyFor,
  createQueue,
};
