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
 *   orch-service status              what is happening, and why it is not
 *   orch-service stop  --reason ...  admit nothing, merge nothing. Now.
 *   orch-service start --reason ...  release the stop
 *   orch-service pause --reason ...  finish the current task, take no more
 *   orch-service resume --reason ...
 *   orch-service queue               every entry and its state
 *   orch-service audit [--limit N]   who did what, when
 *   orch-service recover [--apply]   what a restart would reclaim
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

function main(argv) {
  const args = parseArgs(argv);
  const root = repoRoot(args.flags.repo);
  const queue = queueMod.createQueue(args.flags['queue-dir'] || queueMod.defaultQueueDir(root));
  const service = serviceMod.createService({ repoCwd: root, queue });
  const reason = typeof args.flags.reason === 'string' ? args.flags.reason : null;

  switch (args.command) {
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

    case 'resume':
      service.resume(reason);
      process.stdout.write('resumed\n');
      return 0;

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
