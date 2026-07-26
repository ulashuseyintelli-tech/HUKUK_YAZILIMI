'use strict';
/**
 * GOV-COORD-V2 safety kernel — atomic lease CAS + monotonic fencing.
 *
 * Contract: project/docs/governance/coordination-v2/governance-orchestration-contract-v2.md §6
 * Schema  : project/docs/governance/coordination-v2/schemas/lease.schema.json
 *
 * Authoritative store is a dedicated ref namespace under the shared Git
 * common directory. Every mutation is a compare-and-swap:
 *
 *     git update-ref <ref> <newObject> <expectedOldObject>
 *
 * Invariants enforced here (all fail-closed):
 *   - leaseEpoch is monotonic and NEVER reset; a new claim is previous + 1.
 *   - The ref is NEVER deleted; release advances it to a RELEASED tombstone.
 *   - No mutation is accepted without matching leaseEpoch AND holderToken.
 *   - A lost CAS is CLAIM_CONFLICT / FENCING_FAILURE, never a silent retry.
 *
 * This module performs no executor, PR, CI or merge work.
 */

const { execFileSync } = require('child_process');

const REF_PREFIX = 'refs/governance-coordination/leases/';
const ZERO_OID = '0'.repeat(40);
const HOLDERS = ['CLAUDE_LOCAL', 'CODEX_LOCAL'];
const TASK_ID_RE = /^[A-Z0-9][A-Z0-9._-]{2,63}$/;
const TOKEN_RE = /^[0-9a-f]{32}$/;

class LeaseError extends Error {
  constructor(code, detail) {
    super(code + (detail ? ': ' + detail : ''));
    this.name = 'LeaseError';
    this.code = code;
    this.detail = detail || null;
  }
}

function fail(code, detail) {
  throw new LeaseError(code, detail);
}

function git(args, opts) {
  const options = opts || {};
  return execFileSync('git', args, {
    cwd: options.cwd || process.cwd(),
    input: options.input,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });
}

function gitTry(args, opts) {
  try {
    return { ok: true, stdout: git(args, opts) };
  } catch (err) {
    return {
      ok: false,
      status: typeof err.status === 'number' ? err.status : null,
      stderr: String((err.stderr || '') + (err.stdout || '')),
    };
  }
}

/**
 * Contract §6 entry gate: isolated worktrees must share one Git common
 * directory, otherwise this lease model coordinates nothing.
 */
function resolveCommonDir(cwd) {
  const out = gitTry(['rev-parse', '--path-format=absolute', '--git-common-dir'], { cwd });
  if (!out.ok) fail('COMMON_DIR_UNRESOLVED', out.stderr.trim());
  const dir = out.stdout.trim();
  if (!dir) fail('COMMON_DIR_UNRESOLVED', 'empty');
  return dir.replace(/\\/g, '/');
}

function assertSharedCommonDir(cwd, expectedCommonDir) {
  const actual = resolveCommonDir(cwd);
  const expected = String(expectedCommonDir).replace(/\\/g, '/');
  if (actual !== expected) {
    fail('COMMON_DIR_MISMATCH', actual + ' != ' + expected);
  }
  return actual;
}

function refFor(taskId) {
  if (!TASK_ID_RE.test(String(taskId))) fail('TASK_ID_INVALID', String(taskId));
  return REF_PREFIX + taskId;
}

function canonicalJson(value) {
  // Deterministic key ordering so identical logical records hash identically.
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonicalJson).join(',') + ']';
  const keys = Object.keys(value).filter((k) => value[k] !== undefined).sort();
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + canonicalJson(value[k])).join(',') + '}';
}

function sha256Hex(text) {
  return require('crypto').createHash('sha256').update(text, 'utf8').digest('hex');
}

function writeBlob(text, cwd) {
  const out = gitTry(['hash-object', '-w', '--stdin'], { cwd, input: text });
  if (!out.ok) fail('BLOB_WRITE_FAILED', out.stderr.trim());
  return out.stdout.trim();
}

function readRef(taskId, cwd) {
  const ref = refFor(taskId);
  const rev = gitTry(['rev-parse', '--verify', '--quiet', ref], { cwd });
  if (!rev.ok || !rev.stdout.trim()) return { oid: null, record: null, ref };
  const oid = rev.stdout.trim();
  const blob = gitTry(['cat-file', 'blob', oid], { cwd });
  if (!blob.ok) fail('LEASE_UNREADABLE', oid);
  let record;
  try {
    record = JSON.parse(blob.stdout);
  } catch (e) {
    fail('LEASE_MALFORMED', oid);
  }
  if (record.schemaVersion !== 1) fail('LEASE_SCHEMA_INVALID', String(record.schemaVersion));
  return { oid, record, ref };
}

/** Compare-and-swap the ref. expectedOid null means "ref must not exist". */
function casRef(ref, newOid, expectedOid, cwd) {
  const old = expectedOid === null ? ZERO_OID : expectedOid;
  const out = gitTry(['update-ref', ref, newOid, old], { cwd });
  return out.ok;
}

function validateIdentity(opts) {
  if (!HOLDERS.includes(opts.holder)) fail('HOLDER_INVALID', String(opts.holder));
  if (!TOKEN_RE.test(String(opts.holderToken))) fail('HOLDER_TOKEN_INVALID', String(opts.holderToken));
  if (!TOKEN_RE.test(String(opts.taskAttemptId))) fail('ATTEMPT_ID_INVALID', String(opts.taskAttemptId));
}

function isExpired(record, nowMs) {
  return Date.parse(record.expiresAt) <= nowMs;
}

/**
 * Acquire the lease. Fail-closed on any live conflict.
 *
 * Returns { record, oid, epoch, idempotent }.
 * Throws CLAIM_CONFLICT when a live lease is held by someone else, and
 * FENCING_FAILURE when the CAS is lost to a concurrent writer.
 */
function claim(opts) {
  const cwd = opts.cwd || process.cwd();
  const nowMs = opts.nowMs != null ? opts.nowMs : Date.now();
  const ttlMs = opts.ttlMs != null ? opts.ttlMs : 15 * 60 * 1000;
  if (!(ttlMs > 0)) fail('TTL_INVALID', String(ttlMs));
  validateIdentity(opts);
  if (opts.expectedCommonDir) assertSharedCommonDir(cwd, opts.expectedCommonDir);

  const current = readRef(opts.taskId, cwd);
  let epoch = 1;
  let previousStateHash = null;

  if (current.record) {
    const rec = current.record;
    previousStateHash = sha256Hex(canonicalJson(rec));
    const live = rec.state === 'HELD' && !isExpired(rec, nowMs);
    if (live) {
      const sameHolder = rec.holderToken === opts.holderToken && rec.holder === opts.holder;
      if (!sameHolder) {
        fail('CLAIM_CONFLICT', 'held by ' + rec.holder + ' epoch ' + rec.leaseEpoch);
      }
      // Same process re-claiming its own live lease: idempotent, no epoch bump.
      return { record: rec, oid: current.oid, epoch: rec.leaseEpoch, idempotent: true };
    }
    // Released or expired: epoch advances, never resets (contract §6).
    epoch = rec.leaseEpoch + 1;
  }

  const record = {
    schemaVersion: 1,
    leaseId: opts.leaseId || sha256Hex(opts.taskId + '|' + epoch + '|' + opts.holderToken).slice(0, 32),
    taskId: opts.taskId,
    taskAttemptId: opts.taskAttemptId,
    leaseEpoch: epoch,
    state: 'HELD',
    holder: opts.holder,
    holderToken: opts.holderToken,
    acquiredAt: new Date(nowMs).toISOString(),
    heartbeatAt: new Date(nowMs).toISOString(),
    expiresAt: new Date(nowMs + ttlMs).toISOString(),
    previousStateHash: previousStateHash,
  };

  const newOid = writeBlob(canonicalJson(record) + '\n', cwd);
  // Test seam: lets a race fixture hold two processes between the read and
  // the compare-and-swap so the CAS path itself is exercised, not just the
  // read-then-conflict path. Never used in production paths.
  if (typeof opts.onBeforeCas === 'function') opts.onBeforeCas();
  if (!casRef(current.ref, newOid, current.oid, cwd)) {
    fail('FENCING_FAILURE', 'lost CAS on claim for ' + opts.taskId);
  }
  return { record, oid: newOid, epoch, idempotent: false };
}

/**
 * Renew a held lease. Requires BOTH the current epoch and holderToken to
 * match — a stale epoch holder can never renew (contract §6).
 */
function renew(opts) {
  const cwd = opts.cwd || process.cwd();
  const nowMs = opts.nowMs != null ? opts.nowMs : Date.now();
  const ttlMs = opts.ttlMs != null ? opts.ttlMs : 15 * 60 * 1000;
  const current = readRef(opts.taskId, cwd);
  if (!current.record) fail('LEASE_ABSENT', opts.taskId);
  const rec = current.record;
  if (rec.state !== 'HELD') fail('FENCING_FAILURE', 'lease not HELD (' + rec.state + ')');
  if (rec.leaseEpoch !== opts.leaseEpoch) {
    fail('FENCING_FAILURE', 'stale epoch ' + opts.leaseEpoch + ' != ' + rec.leaseEpoch);
  }
  if (rec.holderToken !== opts.holderToken) {
    fail('FENCING_FAILURE', 'holderToken mismatch');
  }

  const record = Object.assign({}, rec, {
    heartbeatAt: new Date(nowMs).toISOString(),
    expiresAt: new Date(nowMs + ttlMs).toISOString(),
    previousStateHash: sha256Hex(canonicalJson(rec)),
  });
  const newOid = writeBlob(canonicalJson(record) + '\n', cwd);
  if (!casRef(current.ref, newOid, current.oid, cwd)) {
    fail('FENCING_FAILURE', 'lost CAS on renew for ' + opts.taskId);
  }
  return { record, oid: newOid };
}

const RELEASE_REASONS = [
  'CLOSED',
  'CANCELLED_CLEANUP_COMPLETE',
  'TERMINAL_BLOCKED_PUBLISHED',
  'OWNER_EXPLICIT_RELEASE',
];

/**
 * Release the lease by advancing it to a RELEASED tombstone. The ref is
 * never deleted and the epoch is preserved (contract §6, §3.2).
 */
function release(opts) {
  const cwd = opts.cwd || process.cwd();
  const nowMs = opts.nowMs != null ? opts.nowMs : Date.now();
  if (!RELEASE_REASONS.includes(opts.releaseReason)) {
    fail('RELEASE_REASON_INVALID', String(opts.releaseReason));
  }
  const current = readRef(opts.taskId, cwd);
  if (!current.record) fail('LEASE_ABSENT', opts.taskId);
  const rec = current.record;
  if (rec.state === 'RELEASED') {
    const same = rec.holderToken === opts.holderToken && rec.leaseEpoch === opts.leaseEpoch;
    if (same) return { record: rec, oid: current.oid, idempotent: true };
    fail('FENCING_FAILURE', 'already released at epoch ' + rec.leaseEpoch);
  }
  if (rec.leaseEpoch !== opts.leaseEpoch) {
    fail('FENCING_FAILURE', 'stale epoch ' + opts.leaseEpoch + ' != ' + rec.leaseEpoch);
  }
  if (rec.holderToken !== opts.holderToken) fail('FENCING_FAILURE', 'holderToken mismatch');

  const record = Object.assign({}, rec, {
    state: 'RELEASED',
    releasedAt: new Date(nowMs).toISOString(),
    releaseReason: opts.releaseReason,
    previousStateHash: sha256Hex(canonicalJson(rec)),
  });
  const newOid = writeBlob(canonicalJson(record) + '\n', cwd);
  if (!casRef(current.ref, newOid, current.oid, cwd)) {
    fail('FENCING_FAILURE', 'lost CAS on release for ' + opts.taskId);
  }
  return { record, oid: newOid, idempotent: false };
}

/**
 * Assert the caller still holds the lease. Called before EVERY mutation,
 * PR creation, result publication and merge-ready evaluation (contract §6).
 */
function assertHeld(opts) {
  const cwd = opts.cwd || process.cwd();
  const nowMs = opts.nowMs != null ? opts.nowMs : Date.now();
  const current = readRef(opts.taskId, cwd);
  if (!current.record) fail('LEASE_ABSENT', opts.taskId);
  const rec = current.record;
  if (rec.state !== 'HELD') fail('FENCING_FAILURE', 'lease ' + rec.state);
  if (rec.leaseEpoch !== opts.leaseEpoch) fail('FENCING_FAILURE', 'epoch drift');
  if (rec.holderToken !== opts.holderToken) fail('FENCING_FAILURE', 'holderToken mismatch');
  if (isExpired(rec, nowMs)) fail('FENCING_FAILURE', 'lease expired');
  return rec;
}

function read(taskId, cwd) {
  return readRef(taskId, cwd || process.cwd());
}

module.exports = {
  REF_PREFIX,
  ZERO_OID,
  HOLDERS,
  RELEASE_REASONS,
  LeaseError,
  resolveCommonDir,
  assertSharedCommonDir,
  refFor,
  canonicalJson,
  claim,
  renew,
  release,
  assertHeld,
  read,
};
