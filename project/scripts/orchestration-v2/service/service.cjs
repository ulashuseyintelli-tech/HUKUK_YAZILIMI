'use strict';
/**
 * GOV-COORD-V2 service lifecycle.
 *
 * WP03 made work durable, WP04 made a crash recoverable, WP05 made a merge
 * possible. None of that is a service. A service is something you can START,
 * ask the STATUS of, and — the part that matters most — STOP without knowing
 * anything about what it is currently doing.
 *
 * The kill switch is the reason this module exists at all. Everything else here
 * is bookkeeping around it.
 *
 *   A kill switch that requires the running process to cooperate is not a kill
 *   switch. This one is a FILE. Anyone who can write to the repository can
 *   engage it, with no client, no port, no token and no running orchestrator to
 *   ask permission from. It is checked before each admission and again inside
 *   the merge gate, so the worst case is that the in-flight task finishes its
 *   current step — it never starts another and it never merges.
 *
 * Deliberately not a daemon. No port, no socket, no pidfile protocol beyond the
 * one the queue already keeps. `status()` reads the same append-only log the
 * orchestrator writes, so the answer is the same whether a supervisor is running
 * or the machine was rebooted an hour ago. A status command that only works
 * while the thing it reports on is alive is useless exactly when it is needed.
 */

const fs = require('fs');
const path = require('path');

const queueMod = require('../orchestrator/queue.cjs');
const recoveryMod = require('../orchestrator/recovery.cjs');
const dispatchMod = require('../orchestrator/dispatch.cjs');
const admissionMod = require('../orchestrator/admission.cjs');
const requestMod = require('./request.cjs');
const adapterMod = require('./executor-adapter.cjs');

/**
 * Control files, relative to the repository root.
 *
 * Under the activation directory rather than somewhere neutral because that
 * directory is the one the standing grants already name, and a control surface
 * split across two locations is a control surface someone will look in the
 * wrong half of.
 */
const CONTROL_DIR = 'project/docs/governance/coordination-v2/activation';
const KILL_SWITCH = CONTROL_DIR + '/KILL-SWITCH';
const PAUSE_MARKER = CONTROL_DIR + '/PAUSED';

/** Reasons the service will not admit new work. Ordered by precedence. */
const ADMISSION_BLOCKERS = ['KILL_SWITCH_ENGAGED', 'PAUSED', 'SLOT_OCCUPIED', 'QUEUE_EMPTY'];

/**
 * A service with no dispatch guard cannot verify authority at the moment work
 * leaves the queue — only that it was verified when it entered. Since the queue
 * is durable, that gap can be arbitrarily long, so the default is to REFUSE.
 *
 * Passing allowUnguardedDispatch is deliberately verbose and greppable: the
 * places that do it are testing slot and audit mechanics, not authority, and
 * anything else passing it is a bug worth finding by name.
 */
const DISPATCH_GUARD_ABSENT = 'DISPATCH_GUARD_ABSENT';

class ServiceError extends Error {
  constructor(code, detail) {
    super(code + (detail ? ': ' + detail : ''));
    this.name = 'ServiceError';
    this.code = code;
    this.detail = detail || null;
  }
}

/**
 * @param {object} cfg
 * @param {string} cfg.repoCwd
 * @param {object} cfg.queue          a queue from queue.cjs
 * @param {string} [cfg.auditPath]    JSONL audit log; defaults beside the queue
 * @param {function} [cfg.clock]
 */
function createService(cfg) {
  const repoCwd = cfg.repoCwd;
  const queue = cfg.queue;
  const clock = cfg.clock || (() => Date.now());
  const auditPath = cfg.auditPath || path.join(queue.dir, 'audit.jsonl');
  const killSwitchPath = cfg.killSwitchPath || path.join(repoCwd, KILL_SWITCH);
  const pausePath = cfg.pausePath || path.join(repoCwd, PAUSE_MARKER);
  const exists = cfg.exists || ((p) => fs.existsSync(p));
  // A repo-backed guard by default. Every entry carries the path to its own
  // request, so the grant, plan and manifest can all be re-read per entry at
  // the moment it is dispatched — which is what the guard is for. A service
  // configured with an explicit guard (tests, or a caller with its own
  // resolution) keeps that one.
  const dispatchGuard =
    cfg.dispatchGuard ||
    (cfg.repoCwd && cfg.allowUnguardedDispatch !== true
      ? {
          resolveGrant: (e) => requestMod.load({ repoCwd: cfg.repoCwd, requestPath: e.requestPath }).standingGrant,
          resolveSpec: (e) => requestMod.load({ repoCwd: cfg.repoCwd, requestPath: e.requestPath }).spec,
          resolveManifest: () => JSON.parse(
            fs.readFileSync(path.join(cfg.repoCwd, 'project/docs/governance/coordination-v2/programs.manifest.json'), 'utf8'),
          ),
          resolveSpecHash: (spec) => require('../orchestrator/authority.cjs').digest(spec),
          isRevoked: cfg.isRevoked,
        }
      : null);
  const allowUnguarded = cfg.allowUnguardedDispatch === true;

  /**
   * Append one audit record.
   *
   * Append-only and never rewritten, for the same reason the queue is: an audit
   * log you can edit answers a different question from the one it is asked.
   */
  function audit(event, detail) {
    const rec = {
      at: new Date(clock()).toISOString(),
      atMs: clock(),
      event,
      detail: detail || null,
      pid: process.pid,
    };
    fs.mkdirSync(path.dirname(auditPath), { recursive: true });
    fs.appendFileSync(auditPath, JSON.stringify(rec) + '\n', 'utf8');
    return rec;
  }

  const service = {
    auditPath,
    killSwitchPath,
    pausePath,

    killSwitchEngaged() {
      return exists(killSwitchPath);
    },

    paused() {
      return exists(pausePath);
    },

    /**
     * Why the service will or will not take a new task right now.
     *
     * Returns a REASON, not a boolean. "It is not running anything" and "it is
     * refusing to run anything" look identical from the outside and are the two
     * situations an operator most needs to tell apart.
     */
    admission() {
      if (service.killSwitchEngaged()) {
        return { admits: false, reason: 'KILL_SWITCH_ENGAGED', detail: killSwitchPath };
      }
      if (service.paused()) {
        return { admits: false, reason: 'PAUSED', detail: pausePath };
      }
      // queue.active() answers with the ONE occupying entry or null — the
      // queue is serial by construction, so there is no list to fold over.
      const active = queue.active();
      if (active) {
        return { admits: false, reason: 'SLOT_OCCUPIED', detail: active.entryId + ' in ' + active.state };
      }
      const head = queue.head();
      if (!head) return { admits: false, reason: 'QUEUE_EMPTY', detail: null };
      return { admits: true, reason: null, detail: head.entryId };
    },

    /**
     * The whole operational picture in one object, read from the log rather than
     * from memory — so it answers correctly after a reboot, from another shell,
     * or while nothing at all is running.
     */
    status() {
      const entries = queue.list();
      const byState = {};
      for (const e of entries) byState[e.state] = (byState[e.state] || 0) + 1;
      const active = queue.active();
      const verdicts = recoveryMod.scan(queue, { nowMs: clock() });

      return {
        at: new Date(clock()).toISOString(),
        killSwitch: service.killSwitchEngaged() ? 'ENGAGED' : 'CLEAR',
        paused: service.paused(),
        admission: service.admission(),
        queueDepth: entries.filter((e) => queueMod.QUEUE_TERMINAL.indexOf(e.state) === -1).length,
        totalEntries: entries.length,
        byState,
        // Reported as a list even though it can only ever hold one: the shape
        // an operator reads should not change when the slot happens to be free.
        active: active
          ? [{
              entryId: active.entryId,
              programId: active.programId,
              taskId: active.taskId,
              state: active.state,
              owner: active.owner || null,
            }]
          : [],
        // OWNER_STALE is in this list on purpose. Recovery will not touch it —
        // the process is alive — so the only way it ever gets resolved is by an
        // operator seeing it here.
        needsRecovery: verdicts
          .filter(
            (v) =>
              v.verdict === 'RECLAIMABLE' ||
              v.verdict === 'NEEDS_EVIDENCE' ||
              v.verdict === 'OWNER_STALE',
          )
          .map((v) => ({ entryId: v.entryId, state: v.state, verdict: v.verdict, rewindTo: v.rewindTo })),
        blocked: entries
          .filter((e) => e.state === 'BLOCKED')
          .map((e) => ({ entryId: e.entryId, taskId: e.taskId, blockerCode: e.blockerCode || null })),
      };
    },

    /**
     * Engage the kill switch.
     *
     * Writing the file IS the mechanism, so this is a convenience rather than
     * the interface — `echo > KILL-SWITCH` and a `git push` of that file work
     * identically, which is the property that makes it trustworthy.
     */
    engageKillSwitch(reason) {
      fs.mkdirSync(path.dirname(killSwitchPath), { recursive: true });
      fs.writeFileSync(
        killSwitchPath,
        [
          'GOV-COORD-V2 KILL SWITCH — ENGAGED',
          '',
          'at     : ' + new Date(clock()).toISOString(),
          'reason : ' + (reason || '(not stated)'),
          '',
          'While this file exists the orchestrator admits no new task and merges',
          'nothing. Delete it to resume. Nothing else is required.',
          '',
        ].join('\n'),
        'utf8',
      );
      return audit('KILL_SWITCH_ENGAGED', { reason: reason || null, path: killSwitchPath });
    },

    /**
     * Release it. Deliberately NOT symmetric with engaging: releasing takes a
     * stated reason, because "who turned it back on and why" is the question an
     * incident review asks and the file itself cannot answer once deleted.
     */
    releaseKillSwitch(reason) {
      if (!reason) throw new ServiceError('KILL_SWITCH_RELEASE_REASON_REQUIRED', 'state why');
      if (exists(killSwitchPath)) fs.unlinkSync(killSwitchPath);
      return audit('KILL_SWITCH_RELEASED', { reason });
    },

    pause(reason) {
      fs.mkdirSync(path.dirname(pausePath), { recursive: true });
      fs.writeFileSync(pausePath, 'PAUSED ' + new Date(clock()).toISOString() + '\n' + (reason || '') + '\n', 'utf8');
      return audit('PAUSED', { reason: reason || null });
    },

    resume(reason) {
      if (exists(pausePath)) fs.unlinkSync(pausePath);
      return audit('RESUMED', { reason: reason || null });
    },

    /**
     * Admit a request into the queue — the producer.
     *
     * Everything is judged BEFORE anything is written. A refused request leaves
     * no queue entry and only a rejection audit record, so "nothing ran" and
     * "something ran and failed" stay distinguishable in the log.
     *
     * @returns {{admitted: boolean, entry, refusal, detail}}
     */
    enqueue(opts) {
      if (service.killSwitchEngaged()) {
        audit('ENQUEUE_REFUSED', { requestPath: opts.requestPath, refusal: 'KILL_SWITCH_ENGAGED' });
        return { admitted: false, entry: null, refusal: 'KILL_SWITCH_ENGAGED', detail: killSwitchPath };
      }

      let resolved;
      try {
        resolved = requestMod.load({ repoCwd, requestPath: opts.requestPath });
      } catch (e) {
        audit('ENQUEUE_REFUSED', { requestPath: opts.requestPath, refusal: e.code || 'REQUEST_INVALID', detail: e.detail || null });
        return { admitted: false, entry: null, refusal: e.code || 'REQUEST_INVALID', detail: e.detail || String(e.message) };
      }

      const req = resolved.request;
      try {
        const entry = admissionMod.admit({
          queue,
          manifest: resolved.manifest,
          standingGrant: resolved.standingGrant,
          spec: resolved.spec,
          programId: req.programId,
          taskClass: req.taskClass,
          executorLane: req.executorLane,
          taskSpecSha256: resolved.taskSpecSha256,
          priority: req.priority,
          dependsOn: req.dependsOn,
          requestPath: opts.requestPath,
          operation: opts.operation || req.operation || null,
          revoked: opts.isRevoked ? opts.isRevoked(resolved.standingGrant) === true : false,
          killSwitchEngaged: false,
          nowMs: clock(),
        });
        audit(entry.deduplicated ? 'ENQUEUE_DEDUPLICATED' : 'ENQUEUE_ADMITTED', {
          entryId: entry.entryId, taskId: entry.taskId, programId: entry.programId, requestPath: opts.requestPath,
        });
        return { admitted: true, entry, refusal: null, detail: null };
      } catch (e) {
        audit('ENQUEUE_REFUSED', { requestPath: opts.requestPath, taskId: req.taskId, refusal: e.code || 'ADMISSION_REFUSED', detail: e.detail || null });
        return { admitted: false, entry: null, refusal: e.code || 'ADMISSION_REFUSED', detail: e.detail || null };
      }
    },

    /**
     * Take exactly one task from the queue and run it — the consumer.
     *
     * `step()` is the general form and takes any runner; runOnce binds it to
     * the REAL executor adapter, which is what makes this the production path
     * rather than another thing tests can drive.
     */
    async runOnce(opts) {
      const o = opts || {};
      return service.step((entry) =>
        adapterMod.runEntry({
          queue,
          entry,
          repoCwd,
          buildContext: o.buildContext || require('../runtime/run-task.cjs').buildContext,
          runTask: o.runTask || require('../orchestrator/orchestrator.cjs').runTask,
          completeAfterOwnerMerge:
            o.completeAfterOwnerMerge || require('../orchestrator/orchestrator.cjs').completeAfterOwnerMerge,
          prompt: o.prompt,
          audit,
          clock,
          isKillSwitchEngaged: () => service.killSwitchEngaged(),
          isRevoked: o.isRevoked,
        }),
      );
    },

    /**
     * Drain the queue, one task at a time, until nothing is left to do.
     *
     * Serial by construction — it awaits each task before looking again — and
     * it re-reads the kill switch and the pause marker on EVERY iteration, so
     * an operator stopping the service mid-drain is obeyed at the next task
     * rather than after the batch.
     *
     * Bounded by maxTasks so a queue that keeps re-blocking cannot spin
     * forever, and it stops the moment admission reports anything other than a
     * task to run — no polling, no busy loop.
     */
    async runUntilIdle(opts) {
      const o = opts || {};
      const max = Number.isFinite(o.maxTasks) ? o.maxTasks : 50;
      const ran = [];
      for (let i = 0; i < max; i++) {
        if (service.killSwitchEngaged()) return { stopped: 'KILL_SWITCH_ENGAGED', ran };
        if (service.paused()) return { stopped: 'PAUSED', ran };
        const adm = service.admission();
        if (!adm.admits) return { stopped: adm.reason, ran };
        const r = await service.runOnce(o);
        ran.push(r);
        // A step that neither ran nor blocked would loop forever on the same
        // head; treat it as a stop rather than spin.
        if (r.acted === 'IDLE' || r.acted === 'HALTED') return { stopped: r.reason, ran };
      }
      return { stopped: 'MAX_TASKS_REACHED', ran };
    },

    /**
     * One supervisor step.
     *
     * Recovery runs FIRST, before admission. A stranded entry from a previous
     * process holds the single slot, so admitting new work before reclaiming it
     * would either block forever or — worse, if the slot check were laxer — run
     * two tasks at once.
     *
     * Returns what it did rather than doing it silently, so a caller can loop
     * on it, test it, or run exactly one step by hand.
     */
    async step(runTask) {
      if (service.killSwitchEngaged()) {
        return { acted: 'HALTED', reason: 'KILL_SWITCH_ENGAGED', entryId: null };
      }
      const reclaimed = recoveryMod
        .reclaim(queue, { nowMs: clock() })
        .filter((v) => v.applied);
      if (reclaimed.length) audit('RECOVERY_APPLIED', { count: reclaimed.length, entries: reclaimed });

      const adm = service.admission();
      if (!adm.admits) return { acted: 'IDLE', reason: adm.reason, entryId: null, reclaimed: reclaimed.length };

      const head = queue.head();

      // The gate runs a second time here, and not because the first run was
      // wrong. Admission proved this task was allowed to ENTER the queue; the
      // queue is durable, so between then and now a grant can be revoked, a
      // program made ineligible, or a grant file edited under the same id.
      // Trusting the admission verdict at dispatch is the same mistake WP05
      // removed from the merge gate.
      if (dispatchGuard) {
        const verdict = dispatchMod.revalidate(
          Object.assign({}, dispatchGuard, {
            entry: head,
            killSwitchEngaged: service.killSwitchEngaged(),
            nowMs: clock(),
          }),
        );
        if (!verdict.dispatchable) {
          audit('DISPATCH_REFUSED', { entryId: head.entryId, refusal: verdict.refusal, detail: verdict.detail });
          queue.transition({
            entryId: head.entryId,
            to: 'BLOCKED',
            expectedPreviousState: head.state,
            nowMs: clock(),
            patch: { blockerCode: verdict.refusal, owner: null },
          });
          return { acted: 'BLOCKED', reason: verdict.refusal, entryId: head.entryId, reclaimed: reclaimed.length };
        }
      } else if (!allowUnguarded) {
        audit('DISPATCH_REFUSED', { entryId: head.entryId, refusal: DISPATCH_GUARD_ABSENT, detail: null });
        return { acted: 'IDLE', reason: DISPATCH_GUARD_ABSENT, entryId: null, reclaimed: reclaimed.length };
      }

      audit('TASK_ADMITTED', { entryId: head.entryId, taskId: head.taskId, programId: head.programId });
      recoveryMod.takeOwnership(queue, head.entryId, { pid: process.pid, nowMs: clock() });

      let outcome;
      try {
        outcome = await runTask(head);
        audit('TASK_FINISHED', { entryId: head.entryId, disposition: (outcome && outcome.disposition) || null });
      } catch (e) {
        // A throwing runner must not leave the slot held. BLOCKED rather than
        // FAILED: the entry is recoverable and the operator decides, which is
        // the same choice the orchestrator's own blocker path makes.
        audit('TASK_THREW', { entryId: head.entryId, code: e && e.code, message: String(e && e.message).slice(0, 300) });
        queue.transition({
          entryId: head.entryId,
          to: 'BLOCKED',
          expectedPreviousState: queue.get(head.entryId).state,
          nowMs: clock(),
          patch: { blockerCode: (e && e.code) || 'RUNNER_THREW', owner: null },
        });
        return { acted: 'BLOCKED', reason: (e && e.code) || 'RUNNER_THREW', entryId: head.entryId, reclaimed: reclaimed.length };
      }
      return { acted: 'RAN', reason: null, entryId: head.entryId, outcome, reclaimed: reclaimed.length };
    },

    audit,

    /** Read the audit trail back, newest last. */
    auditTrail(limit) {
      if (!fs.existsSync(auditPath)) return [];
      const lines = fs.readFileSync(auditPath, 'utf8').split('\n').filter(Boolean);
      const take = limit ? lines.slice(-limit) : lines;
      return take.map((l) => JSON.parse(l));
    },
  };

  return service;
}

module.exports = {
  CONTROL_DIR,
  KILL_SWITCH,
  PAUSE_MARKER,
  ADMISSION_BLOCKERS,
  DISPATCH_GUARD_ABSENT,
  ServiceError,
  createService,
};
