'use strict';
/**
 * Two-process race fixture worker for the lease CAS gate.
 *
 * Contract §6 requires that concurrent claims resolve to exactly one holder.
 * A sequential unit test cannot prove that, so the T2 gate runs this worker
 * twice as genuinely separate OS processes against one repository.
 *
 * The --barrier argument is a wall-clock epoch (ms). Each worker resolves the
 * current lease state, then busy-waits until the barrier before attempting its
 * compare-and-swap, so both processes hold the same pre-image and the CAS
 * itself decides the winner.
 *
 * Emits a single line of JSON on stdout. Never mutates anything but the lease
 * ref of the task it was given.
 */

const lease = require('./lease.cjs');

function arg(name, fallback) {
  const i = process.argv.indexOf('--' + name);
  return i === -1 ? fallback : process.argv[i + 1];
}

const mode = arg('mode', 'claim');
const cwd = arg('cwd', process.cwd());
const taskId = arg('task', 'RACE-TASK');
const holder = arg('holder', 'CLAUDE_LOCAL');
const holderToken = arg('token', 'a'.repeat(32));
const attempt = arg('attempt', 'b'.repeat(32));
const barrier = Number(arg('barrier', '0'));
const epoch = Number(arg('epoch', '0'));

function waitForBarrier() {
  if (!barrier) return;
  while (Date.now() < barrier) {
    // Intentional spin: setTimeout granularity is too coarse to align two
    // separate processes on a sub-millisecond boundary.
  }
}

function emit(obj) {
  process.stdout.write(JSON.stringify(obj) + '\n');
}

try {
  if (mode === 'claim') {
    const res = lease.claim({
      cwd,
      taskId,
      holder,
      holderToken,
      taskAttemptId: attempt,
      ttlMs: 60000,
      onBeforeCas: waitForBarrier,
    });
    emit({
      outcome: 'WON',
      pid: process.pid,
      holder,
      epoch: res.epoch,
      idempotent: res.idempotent,
      leaseId: res.record.leaseId,
    });
  } else if (mode === 'renew') {
    waitForBarrier();
    const res = lease.renew({ cwd, taskId, holderToken, leaseEpoch: epoch, ttlMs: 60000 });
    emit({ outcome: 'RENEWED', pid: process.pid, epoch: res.record.leaseEpoch });
  } else {
    throw new Error('unknown mode ' + mode);
  }
  process.exit(0);
} catch (err) {
  emit({
    outcome: 'LOST',
    pid: process.pid,
    holder,
    code: err && err.code ? err.code : 'UNKNOWN',
    detail: err && err.detail ? err.detail : String(err && err.message),
  });
  process.exit(3);
}
