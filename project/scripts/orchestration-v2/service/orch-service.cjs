#!/usr/bin/env node
'use strict';
/**
 * GOV-COORD-V2 operator console.
 *
 * The commands an owner needs when something is wrong, in the order they will
 * want them. Every one of them is read-only or reversible except `stop`, and
 * `stop` is the one that must never fail — so it is the one command here that
 * needs neither the queue to be readable nor any task to be running.
 *
 *   orch-service enqueue --request   admit work into the queue
 *   orch-service run-once            take exactly one task and run it
 *   orch-service run-until-idle      drain the queue, serially
 *   orch-service finalize            finish a MERGE_READY entry (or list them)
 *   orch-service status              what is happening, and why it is not
 *   orch-service stop  --reason ...  admit nothing, merge nothing. Now.
 *   orch-service start --reason ...  release the stop
 *   orch-service pause --reason ...  finish the current task, take no more
 *   orch-service resume --reason ...
 *   orch-service queue               every entry and its state
 *   orch-service audit [--limit N]   who did what, when
 *   orch-service recover [--apply]   what a restart would reclaim
 *   orch-service reconcile [--apply] what the two stores say, and whether they agree
 *   orch-service resume --entry ID --reason ...   unblock BOTH stores, or neither
 *
 * `stop` and `start` are deliberately not symmetric with `pause`/`resume`.
 * Pausing is an operational choice; stopping is an incident. Starting again
 * after an incident is a decision someone owns, so it takes a reason and that
 * reason lands in the audit log.
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const queueMod = require('../orchestrator/queue.cjs');
const stateMod = require('../orchestrator/state.cjs');
const reconcileMod = require('../orchestrator/reconcile.cjs');
const requestMod = require('./request.cjs');
const serviceMod = require('./service.cjs');

function repoRoot(explicit) {
  if (explicit) return explicit;
  // The git top level of wherever this was invoked, not a hardcoded path: the
  // repository root is not assumed from a fixed Windows path anywhere in this
  // system, and this console is the one an operator runs from any directory.
  return execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
}

function parseArgs(argv) {
  const out = { command: argv[0] || 'status', flags: {} };
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i];
    if (a.indexOf('--') === 0) {
      const next = argv[i + 1];
      if (next !== undefined && next.indexOf('--') !== 0) {
        out.flags[a.slice(2)] = next;
        i++;
      } else {
        out.flags[a.slice(2)] = true;
      }
    }
  }
  return out;
}

function pad(s, n) {
  s = String(s === null || s === undefined ? '' : s);
  return s.length >= n ? s : s + ' '.repeat(n - s.length);
}

function renderStatus(st) {
  const lines = [
    'GOV-COORD-V2 service',
    '  at            : ' + st.at,
    '  kill switch   : ' + st.killSwitch,
    '  paused        : ' + (st.paused ? 'YES' : 'no'),
    '  admits work   : ' + (st.admission.admits ? 'YES (' + st.admission.detail + ')' : 'NO — ' + st.admission.reason),
    '  queue depth   : ' + st.queueDepth + ' outstanding of ' + st.totalEntries + ' total',
  ];
  if (st.active.length) {
    lines.push('  running       :');
    for (const a of st.active) {
      lines.push('    ' + pad(a.taskId, 34) + pad(a.state, 14) + (a.owner ? 'pid ' + a.owner.pid : 'no owner'));
    }
  } else {
    lines.push('  running       : (nothing)');
  }
  if (st.needsRecovery.length) {
    lines.push('  NEEDS RECOVERY:');
    for (const r of st.needsRecovery) {
      lines.push('    ' + pad(r.entryId.slice(0, 12), 14) + pad(r.state, 14) + r.verdict + (r.rewindTo ? ' -> ' + r.rewindTo : ''));
    }
  }
  if (st.blocked.length) {
    lines.push('  BLOCKED:');
    for (const b of st.blocked) lines.push('    ' + pad(b.taskId, 34) + b.blockerCode);
  }
  return lines.join('\n');
}

/**
 * Two commands are genuinely asynchronous (they run an executor). Rather than
 * making every command async — and every caller await a status read — the
 * promise is drained here and its exit code set on the process.
 */
function runAsync(promise) {
  promise.then(
    (code) => {
      process.exitCode = code;
    },
    (e) => {
      process.stderr.write((e && e.code ? e.code + ': ' : '') + (e && e.message) + '\n');
      process.exitCode = 1;
    },
  );
  return 0;
}

function main(argv) {
  const args = parseArgs(argv);
  const root = repoRoot(args.flags.repo);
  const queue = queueMod.createQueue(args.flags['queue-dir'] || queueMod.defaultQueueDir(root));
  const service = serviceMod.createService({ repoCwd: root, queue });
  const reason = typeof args.flags.reason === 'string' ? args.flags.reason : null;

  switch (args.command) {
    case 'enqueue': {
      if (typeof args.flags.request !== 'string') {
        process.stderr.write('enqueue requires --request <file>\n');
        return 2;
      }
      const r = service.enqueue({ requestPath: args.flags.request, operation: args.flags.operation || null });
      if (!r.admitted) {
        // Nothing was written to the queue. That is the point: a refused
        // request leaves no entry for anyone to wonder about later.
        process.stderr.write('REFUSED  ' + r.refusal + (r.detail ? '\n  ' + r.detail : '') + '\n');
        return 3;
      }
      process.stdout.write(
        [
          r.entry.deduplicated ? 'ALREADY QUEUED (same idempotency key)' : 'ADMITTED',
          '  entry   : ' + r.entry.entryId,
          '  program : ' + r.entry.programId,
          '  task    : ' + r.entry.taskId,
          '  state   : ' + r.entry.state,
          '',
        ].join('\n'),
      );
      return 0;
    }

    case 'run-once': {
      return runAsync(
        service.runOnce().then((r) => {
          const lines = ['acted   : ' + r.acted];
          if (r.reason) lines.push('  reason  : ' + r.reason);
          if (r.entryId) lines.push('  entry   : ' + r.entryId);
          if (r.outcome && r.outcome.queueState) lines.push('  state   : ' + r.outcome.queueState);
          if (r.outcome && r.outcome.pr) lines.push('  PR      : #' + r.outcome.pr.number);
          process.stdout.write(lines.join('\n') + '\n');
          // IDLE is a legitimate outcome (nothing to do), not a failure.
          return r.acted === 'RAN' || r.acted === 'IDLE' ? 0 : 1;
        }),
      );
    }

    case 'run-until-idle': {
      return runAsync(
        service.runUntilIdle({ maxTasks: args.flags.max ? Number(args.flags.max) : undefined }).then((r) => {
          const lines = ['stopped : ' + r.stopped, '  ran     : ' + r.ran.length + ' task(s)'];
          for (const one of r.ran) {
            lines.push(
              '    ' + pad(one.entryId || '-', 14) + pad(one.acted, 10) +
              (one.outcome && one.outcome.queueState ? one.outcome.queueState : one.reason || ''),
            );
          }
          process.stdout.write(lines.join('\n') + '\n');
          return 0;
        }),
      );
    }

    case 'reconcile': {
      const store = stateMod.createStore(stateMod.defaultStateDir(root));
      const pending = reconcileMod.pendingIntents(queue.dir);
      if (pending.length) {
        const lines = ['YARIM KALMIS CAPRAZ YAZIM: ' + pending.length];
        if (args.flags.apply) {
          for (const d of reconcileMod.recoverIntents({ queue, store, dir: queue.dir })) {
            lines.push('  tamamlandi ' + d.intentId.slice(0, 12) + '  queue=' + d.queue + ' task=' + d.task);
          }
        } else {
          lines.push('  (--apply ile tamamlanir)');
        }
        process.stdout.write(lines.join('\n') + '\n\n');
      }
      const all = queue.list();
      const rows = [pad('ENTRY', 14) + pad('QUEUE', 14) + pad('TASK', 16) + pad('VERDICT', 24) + 'REASON'];
      for (const e of all) {
        const v = reconcileMod.effectiveState({
          entry: e,
          task: store.current(e.taskId),
          siblings: all.filter((x) => x.taskId === e.taskId),
        });
        rows.push(
          pad(e.entryId.slice(0, 12), 14) + pad(v.queueState, 14) + pad(v.taskState || '-', 16) +
          pad(v.verdict, 24) + (v.reason || ''),
        );
      }
      process.stdout.write(rows.join('\n') + '\n');
      return 0;
    }

    case 'resume': {
      // Two resumes, one word, and a switch takes the FIRST matching case.
      //
      // `resume` already existed as the counterpart to `pause` — it deletes the
      // PAUSED marker. #1699 added a second `case 'resume'` for unblocking both
      // state stores, and a duplicate case in a switch is unreachable code for
      // whichever comes second: on main, `orch-service resume --reason "..."`
      // now answers "resume requires --entry", so releasing a pause is broken.
      //
      // Merged rather than renamed, because both meanings of the word are the
      // right one for their own situation and an operator should not have to
      // know which subsystem refused them. --entry selects the entry-scoped
      // two-store resume; without it, the pause marker is released.
      if (typeof args.flags.entry !== 'string') {
        service.resume(reason);
        process.stdout.write('resumed\n');
        return 0;
      }
      // Resuming a blocked entry turns a refusal back into permission, so it
      // names the entry exactly and states why.
      if (!reason) {
        process.stderr.write('resume --entry requires --reason "<why>"\n');
        return 2;
      }
      const store = stateMod.createStore(stateMod.defaultStateDir(root));
      const entry = queue.list().filter((e) => e.entryId.indexOf(args.flags.entry) === 0)[0];
      if (!entry) {
        process.stderr.write('no queue entry starting with ' + args.flags.entry + '\n');
        return 3;
      }
      let grant = null;
      try {
        const resolved = requestMod.load({ repoCwd: root, requestPath: entry.requestPath });
        grant = resolved.standingGrant;
      } catch (e) {
        process.stderr.write('cannot resolve the standing grant for this entry: ' + e.message + '\n');
        return 3;
      }
      try {
        const r = reconcileMod.resumeBoth({
          queue,
          store,
          dir: queue.dir,
          entry,
          standingGrant: grant,
          parentAuthorizationId: (grant.parentAuthorizationRef || {}).authorizationId,
          taskSpecSha256: entry.taskSpecSha256,
          killSwitchEngaged: service.killSwitchEngaged(),
          reason,
        });
        service.audit('RESUME_AUTHORIZED', { entryId: entry.entryId, taskId: entry.taskId, reason, intentId: r.intentId });
        process.stdout.write(['resumed BOTH stores', '  entry : ' + entry.entryId, '  intent: ' + r.intentId, ''].join('\n'));
        return 0;
      } catch (e) {
        process.stderr.write('REFUSED  ' + (e.code || e.message) + '\n');
        return 3;
      }
    }

    case 'finalize': {
      // The command an operator reaches for after a crash: an entry sits in
      // MERGE_READY with a real open PR and nothing advances it. With no
      // --entry it lists what a pass would act on, because a command whose
      // read-only form is the one you have to ask for is a command that will
      // eventually be run by accident.
      const pending = service.finalizable();
      if (typeof args.flags.entry !== 'string') {
        if (!pending.length) {
          process.stdout.write('nothing to finalize\n');
          return 0;
        }
        process.stdout.write(pad('ENTRY', 14) + pad('TASK', 34) + pad('STATE', 14) + pad('PR', 8) + 'HANDOFF\n');
        for (const f of pending) {
          process.stdout.write(
            pad(f.entryId.slice(0, 12), 14) + pad(f.taskId, 34) + pad(f.state, 14) +
            pad(f.prNumber ? '#' + f.prNumber : '—', 8) +
            (f.hasHandoff ? 'yes' : 'NO — pre-WP02 entry, needs an operator') + '\n',
          );
        }
        process.stdout.write('\n(pass --entry <id> to finalize one)\n');
        return 0;
      }
      return runAsync(
        service.finalizeEntry(args.flags.entry).then((r) => {
          const lines = [
            r.disposition,
            '  entry   : ' + r.entryId,
            '  state   : ' + r.queueState,
          ];
          if (r.mergeSha) lines.push('  merge   : ' + r.mergeSha);
          if (r.blockerCode) lines.push('  blocker : ' + r.blockerCode);
          if (r.detail) lines.push('  detail  : ' + r.detail);
          if (r.cleanup) lines.push('  cleanup : ' + r.cleanup.disposition + (r.cleanup.path ? ' ' + r.cleanup.path : ''));
          process.stdout.write(lines.join('\n') + '\n');
          // MERGE_NOT_AUTHORIZED is not a failure: it is the pilot's default,
          // where a human merges. Exit 0 so an operator script does not treat
          // "waiting for you" as "broken".
          return r.disposition === 'CLOSED' || r.disposition === 'MERGE_NOT_AUTHORIZED' || r.disposition === 'NOT_FINALIZABLE'
            ? 0
            : 1;
        }),
      );
    }

    case 'status':
      process.stdout.write(renderStatus(service.status()) + '\n');
      return 0;

    case 'stop':
      service.engageKillSwitch(reason);
      process.stdout.write(
        'KILL SWITCH ENGAGED\n  file   : ' + service.killSwitchPath + '\n  reason : ' + (reason || '(not stated)') +
        '\n\nNo new task is admitted and nothing merges while that file exists.\n' +
        'A task already running finishes its current step and stops there.\n',
      );
      return 0;

    case 'start':
      if (!reason) {
        process.stderr.write('start requires --reason: restarting after a stop is a decision someone owns\n');
        return 2;
      }
      service.releaseKillSwitch(reason);
      process.stdout.write('kill switch released\n  reason : ' + reason + '\n');
      return 0;

    case 'pause':
      service.pause(reason);
      process.stdout.write('paused — the current task finishes, no new task is admitted\n');
      return 0;

    // `resume` is handled above, where the pause release and the entry-scoped
    // two-store resume share one command. A second case here would be
    // unreachable, which is how the two got out of step in the first place.

    case 'queue': {
      const all = queue.list();
      if (!all.length) {
        process.stdout.write('(queue empty)\n');
        return 0;
      }
      process.stdout.write(pad('ENTRY', 14) + pad('PROGRAM', 12) + pad('TASK', 34) + pad('STATE', 14) + 'BLOCKER\n');
      for (const e of all) {
        process.stdout.write(
          pad(e.entryId.slice(0, 12), 14) + pad(e.programId, 12) + pad(e.taskId, 34) + pad(e.state, 14) +
          (e.blockerCode || '') + '\n',
        );
      }
      return 0;
    }

    case 'audit': {
      const trail = service.auditTrail(args.flags.limit ? Number(args.flags.limit) : 40);
      if (!trail.length) {
        process.stdout.write('(no audit records)\n');
        return 0;
      }
      for (const t of trail) {
        process.stdout.write(pad(t.at, 26) + pad(t.event, 22) + (t.detail ? JSON.stringify(t.detail) : '') + '\n');
      }
      return 0;
    }

    case 'recover': {
      const recovery = require('../orchestrator/recovery.cjs');
      if (args.flags.apply) {
        const applied = recovery.reclaim(queue, {}).filter((v) => v.applied);
        process.stdout.write(applied.length ? JSON.stringify(applied, null, 2) + '\n' : 'nothing to reclaim\n');
        return 0;
      }
      // Default is a dry run. Recovery mutates the queue, and a command whose
      // read-only form is the one you have to ask for is a command that will
      // eventually be run by accident.
      const verdicts = recovery.scan(queue, {}).filter((v) => v.verdict !== 'HEALTHY');
      process.stdout.write(
        (verdicts.length ? JSON.stringify(verdicts, null, 2) : 'nothing needs recovery') +
        '\n\n(dry run — pass --apply to act)\n',
      );
      return 0;
    }

    default:
      process.stderr.write('unknown command: ' + args.command + '\n');
      return 2;
  }
}

if (require.main === module) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (e) {
    process.stderr.write((e && e.code ? e.code + ': ' : '') + (e && e.message) + '\n');
    process.exitCode = 1;
  }
}

module.exports = { main, parseArgs, renderStatus };
