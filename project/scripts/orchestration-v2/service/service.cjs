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
const reconcileMod = require('../orchestrator/reconcile.cjs');
const stateMod = require('../orchestrator/state.cjs');
const admissionMod = require('../orchestrator/admission.cjs');
const requestMod = require('./request.cjs');
const adapterMod = require('./executor-adapter.cjs');
const finalizeMod = require('./finalize.cjs');

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
  // The task store, alongside the queue. Two stores answer different questions
  // and must not be allowed to disagree silently before an executor starts.
  //
  // Opened LAZILY and tolerantly: defaultStateDir shells out to git, so a
  // service pointed at a scratch directory would otherwise fail at
  // construction — which would make merely CONSTRUCTING a service require a
  // repository, and a status read is not that.
  // Is this the SHARED queue — the one under the git common directory that
  // every worktree of this repository sees?
  //
  // That is what makes committed artefacts necessary: another worktree has to
  // be able to read a task's papers. A caller that supplied its own queue
  // directory has exactly one consumer, so there is nothing to be portable
  // across and demanding a commit would only stop probe worlds from being
  // built. Real work always uses the shared queue, so real work is always in
  // the committed regime.
  let sharedQueueMemo;
  function isSharedQueue() {
    if (sharedQueueMemo !== undefined) return sharedQueueMemo;
    try {
      const norm = (x) => String(x).split(path.sep).join('/').replace(/\/+$/, '').toLowerCase();
      sharedQueueMemo = cfg.repoCwd ? norm(queue.dir) === norm(queueMod.defaultQueueDir(cfg.repoCwd)) : false;
    } catch (e) {
      sharedQueueMemo = false;
    }
    return sharedQueueMemo;
  }

  let taskStoreMemo;
  function getTaskStore() {
    if (taskStoreMemo !== undefined) return taskStoreMemo;
    if (cfg.store) {
      taskStoreMemo = cfg.store;
      return taskStoreMemo;
    }
    try {
      taskStoreMemo = cfg.repoCwd ? stateMod.createStore(stateMod.defaultStateDir(cfg.repoCwd)) : null;
    } catch (e) {
      taskStoreMemo = null;
    }
    return taskStoreMemo;
  }

  const dispatchGuard =
    cfg.dispatchGuard ||
    (cfg.repoCwd && cfg.allowUnguardedDispatch !== true
      ? {
          // Loaded with the entry's PINNED artefact digest, so an artefact
          // edited between admission and dispatch fails here rather than
          // running. This is also where a worker in a different worktree
          // discovers the artefacts were never committed at all.
          // The SAME regime the entry was admitted under.
          //
          // The digest is deliberately NOT verified here. It would fire before
          // the guard's own checks and mask them: "the paper trail changed" is
          // true but useless next to "the plan hash changed" or "the grant was
          // substituted". The digest is checked in the adapter, immediately
          // before the executor, where it is the last thing between an edited
          // artefact and a run — and by then the specific reasons have already
          // had their say.
          resolveGrant: (e) =>
            requestMod.load({
              repoCwd: cfg.repoCwd,
              requestPath: e.requestPath,
              requireCommitted: e.artefactsCommitted === true,
            }).standingGrant,
          resolveSpec: (e) =>
            requestMod.load({
              repoCwd: cfg.repoCwd,
              requestPath: e.requestPath,
              requireCommitted: e.artefactsCommitted === true,
            }).spec,
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
        // The regime the REQUEST declares, and only on the shared queue —
        // where the papers actually have to travel to another worktree.
        const shared = isSharedQueue();
        const peek = requestMod.parse(fs.readFileSync(path.join(repoCwd, opts.requestPath), 'utf8'), opts.requestPath);
        const strict = shared && peek.requireCommittedArtefacts === true;
        resolved = requestMod.load({
          repoCwd,
          requestPath: opts.requestPath,
          requireCommitted: strict,
          requireCanonicalRoot: strict,
          artefactRef: cfg.artefactRef,
        });
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
          // Where a one-shot grant's ledger lives, and where its revocation
          // file would be. Beside the queue, in the git common dir, so every
          // worktree and every session reads the same copy — a consumption
          // record only one process can see authorizes the second merge it
          // exists to prevent.
          oneShotLedgerDir: queue.dir,
          repoCwd,
          artefactSha256: resolved.artefacts && resolved.artefacts.digest,
          artefactsCommitted: Boolean(resolved.artefacts && resolved.artefacts.readFromRef),
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
        // Post-merge delivery verification, at the sha the merge produced.
        // Injected rather than required inline so a caller with no delivery
        // contract pays nothing, and so tests can exercise the failure path
        // without a real merge.
        verifyDelivery: o.verifyDelivery === undefined
          ? (a) => require('../delivery/post-merge.cjs').verifyAtMergeSha(a)
          : o.verifyDelivery,
          // Same repo-backed default as finalizeEntry, and for the same reason:
          // the CLI supplies no options, so an undefined here means the merge
          // gate never asks whether the grant was withdrawn.
          isRevoked: o.isRevoked || service.grantRevoked,
        }),
      );
    },

    /**
     * Finish an entry that is sitting in MERGE_READY — or stranded past it.
     *
     * The command that did not exist. runOnce could take a task to MERGE_READY
     * and, since #1694, straight on to CLOSED in the same call; but if that call
     * died anywhere in between, the entry stayed in MERGE_READY with a real open
     * PR and nothing could advance it. The queue's recovery table rewinds
     * MERGE_READY to MERGE_READY — correct, and inert, because there was no
     * consumer.
     *
     * Reads the durable handoff, re-resolves authority from disk and finishes.
     * Safe to run twice: an already-merged PR returns its existing sha and an
     * entry past the step it is asked to take is skipped rather than repeated.
     */
    async finalizeEntry(entryId, opts) {
      const o = opts || {};
      return finalizeMod.finalizeEntry({
        queue,
        entryId,
        repoCwd,
        buildContext: o.buildContext || require('../runtime/run-task.cjs').buildContext,
        completeAfterOwnerMerge:
          o.completeAfterOwnerMerge || require('../orchestrator/orchestrator.cjs').completeAfterOwnerMerge,
        isKillSwitchEngaged: () => service.killSwitchEngaged(),
        // A repo-backed default, not an undefined the caller may forget to fill.
        //
        // This was `o.isRevoked` alone, and every public caller left it
        // undefined: the CLI passes no options, so `finalize --entry` and the
        // run-until-idle drain both merged with the revocation check switched
        // off. `revocationPath` is a REQUIRED field of every standing grant, and
        // creating the file it names did nothing — the same defect #1685 fixed
        // for task grants, alive again one layer up, and found by the delivery
        // probe rather than by review.
        //
        // A grant that cannot be withdrawn is worse than no grant at all, so the
        // default reads the file and only an explicit override replaces it.
        isRevoked: o.isRevoked || service.grantRevoked,
        // Optional, and deliberately not defaulted to a live adapter: supplying
        // one turns on the already-merged divert, which costs a GitHub read per
        // blocked entry. The CLI supplies the real one; callers that inject a
        // fake supply that.
        gh: o.gh || null,
        audit,
        clock,
      });
    },

    /**
     * Re-pin an entry's artefact digest after an authorized artefact correction.
     *
     * Not part of resume: resuming decides that work may run again, and this
     * decides only what the work is pinned to. Keeping them apart means a
     * re-pin can never be the thing that quietly restarts a task.
     */
    repinArtefacts(entryId, opts) {
      const o = opts || {};
      return require('./artefact-repin.cjs').repinArtefacts({
        queue,
        entryId,
        repoCwd,
        repinAuthority: o.repinAuthority,
        resolve: o.resolve,
        audit,
        nowMs: clock(),
      });
    },

    /**
     * Reconcile a BLOCKED entry whose pull request is already merged.
     *
     * Separate verb from finalizeEntry on purpose. Finalizing asks the remote
     * to do something; this asks it what already happened and writes that down.
     * Conflating them is what produced the deadlock — the retry path kept
     * offering to merge a change that was already in main.
     */
    async reconcileMerged(entryId, opts) {
      const o = opts || {};
      return require('./merged-reconcile.cjs').reconcileMergedEntry({
        queue,
        entryId,
        repoCwd,
        gh: o.gh,
        reconciliationAuthority: o.reconciliationAuthority,
        verifyDelivery: o.verifyDelivery,
        isReachable: o.isReachable,
        audit,
        nowMs: clock(),
      });
    },

    /**
     * Is this standing grant revoked, according to the repository right now?
     *
     * Read at the moment it is asked, never cached: a revocation written while
     * a task sat in the queue is the case the field exists for.
     */
    grantRevoked(standingGrant) {
      const p = standingGrant && standingGrant.revocationPath;
      if (typeof p !== 'string' || !p) return false;
      return exists(path.join(repoCwd, p));
    },

    /** Entries a finalize pass would act on, without acting on them. */
    finalizable() {
      return finalizeMod.finalizable(queue);
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
      // Entries diverted to reconciliation during THIS pass. Not durable state:
      // the durable answer is the reconciliation record itself, and until an
      // operator writes one the entry legitimately still needs attention.
      const needsReconciliation = new Set();
      for (let i = 0; i < max; i++) {
        if (service.killSwitchEngaged()) return { stopped: 'KILL_SWITCH_ENGAGED', ran };
        if (service.paused()) return { stopped: 'PAUSED', ran };

        // A stranded MERGE_READY entry holds the single slot, so admission
        // reports SLOT_OCCUPIED and the drain stops — forever, with an open PR
        // nobody finishes. Finishing it IS draining the queue, so it happens
        // here, before admission is consulted.
        //
        // Only entries carrying a durable handoff are touched. One without is
        // pre-WP02 and needs an operator; silently skipping it is right, and
        // status() reports it so the skip is not silent.
        const pending = finalizeMod
          .finalizable(queue)
          .filter((f) => f.hasHandoff && !needsReconciliation.has(f.entryId));
        if (pending.length) {
          const fin = await service.finalizeEntry(pending[0].entryId, o);
          // An entry whose PR is already merged has nothing a drain may do with
          // it: reconciliation is an authorized operator act, not something a
          // background loop performs on a foreign entry. It is recorded, set
          // aside for this pass so the next iteration does not re-read GitHub
          // for the same answer, and the drain moves on to work it CAN do —
          // which is the whole point, because this entry was stopping all of it.
          if (fin.disposition === 'NEEDS_RECONCILIATION') {
            needsReconciliation.add(pending[0].entryId);
            ran.push({ acted: 'NEEDS_RECONCILIATION', entryId: pending[0].entryId, outcome: fin });
            continue;
          }
          // MERGE_NOT_AUTHORIZED is not a stop reason and not an action. The
          // entry is parked for a human by design, so the drain has nothing it
          // MAY do with it — and reporting "MERGE_NOT_AUTHORIZED" as why the
          // drain ended would name the entry's policy rather than the operator's
          // actual situation, which is that the single slot is held. Fall
          // through to admission and let it say so.
          //
          // No spin: admission answers SLOT_OCCUPIED for exactly this entry and
          // returns.
          if (fin.disposition !== 'MERGE_NOT_AUTHORIZED') {
            ran.push({ acted: 'FINALIZED', entryId: pending[0].entryId, outcome: fin });
            if (fin.disposition === 'BLOCKED') {
              return { stopped: fin.blockerCode || fin.disposition, ran };
            }
            continue;
          }
        }

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

      // Before anything else: finish any half-applied cross-store write, then
      // require the two stores to agree. A crash between the queue write and
      // the task write leaves an instruction on disk, and starting an executor
      // on top of it is how one task acquires two attempts.
      const taskStore = getTaskStore();
      if (taskStore) {
        const recovered = reconcileMod.recoverIntents({ queue, store: taskStore, dir: queue.dir });
        if (recovered.length) audit('RECONCILE_INTENTS_COMPLETED', { count: recovered.length, applied: recovered });

        const siblings = queue.list().filter((e) => e.taskId === head.taskId);
        const eff = reconcileMod.effectiveState({
          entry: head,
          task: taskStore.current(head.taskId),
          siblings,
        });
        if (!eff.runnable) {
          audit('RECONCILE_REFUSED', { entryId: head.entryId, verdict: eff.verdict, reason: eff.reason });
          // Not a queue mutation: the entry is already where it should be, and
          // rewriting it would be this code inventing an opinion about a
          // disagreement it was asked to REPORT.
          return { acted: 'IDLE', reason: eff.verdict, entryId: head.entryId, reclaimed: reclaimed.length };
        }
      }

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
