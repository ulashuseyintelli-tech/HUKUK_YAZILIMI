'use strict';

/**
 * Task-specific live closeout merge-authority ledger.
 *
 * Canonical authority remains in the referenced SA/EG records. This module
 * resolves those records at a Git commit, derives one exact merge candidate,
 * and writes a non-secret, single-use ledger with an atomic replace.
 *
 * Cagrildigi yerler:
 * - closeout/cli.cjs -> explicit `--materialize-ledger` operation
 * - closeout/gh-adapter.cjs -> live read, canonical re-resolution and consume
 * - merge-authority-ledger.test.cjs -> security and lifecycle contract
 */

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const SCHEMA_VERSION = 2;
const SHA40 = /^[0-9a-f]{40}$/;
const RECORD_ID = /^[A-Z0-9][A-Z0-9._-]*$/;
const REPO_PATH = /^(?![A-Za-z]:)(?![\\/])(?!.*(?:^|[\\/])\.\.(?:[\\/]|$))[A-Za-z0-9._/\-]+$/;
const ACTIVE_STATUSES = new Set(['ISSUED', 'VALIDATED']);
const TERMINAL_STATUSES = new Set(['CONSUMED', 'REVOKED', 'EXPIRED', 'INVALIDATED']);
const ALL_STATUSES = new Set([...ACTIVE_STATUSES, ...TERMINAL_STATUSES]);

/**
 * Canonical workspace module enum — tek kaynak:
 * `project/docs/governance/CANONICAL-FIVE-MODULE-WORKSPACE-MAP.md`.
 * `REPOSITORY_WIDE_RUNTIME_CONTROL_PLANE` bu listede DEGILDIR ve gecersizdir;
 * repository-wide control-plane gorevleri `SHARED_CONTROL_PLANE` kullanir.
 */
const CANONICAL_WORKSPACE_MODULES = Object.freeze(new Set([
  'OFFICE', 'CLIENT', 'DEBTOR', 'RECEIVABLE', 'COLLECTION',
  'CROSS_MODULE', 'SHARED_CONTROL_PLANE', 'UNKNOWN',
]));

const CODE = Object.freeze({
  INPUT_INVALID: 'LEDGER_INPUT_INVALID',
  AUTHORITY_REFS_NOT_DISTINCT: 'AUTHORITY_REFS_NOT_DISTINCT',
  AUTHORITY_RESOLUTION_FAILED: 'AUTHORITY_RESOLUTION_FAILED',
  AUTHORITY_RECORD_INVALID: 'AUTHORITY_RECORD_INVALID',
  AUTHORITY_PROGRAM_MISMATCH: 'AUTHORITY_PROGRAM_MISMATCH',
  AUTHORITY_TASK_MISMATCH: 'AUTHORITY_TASK_MISMATCH',
  AUTHORITY_OWNER_MISMATCH: 'AUTHORITY_OWNER_MISMATCH',
  AUTHORITY_MODE_INVALID: 'AUTHORITY_MODE_INVALID',
  AUTHORITY_WORKSPACE_MODULE_INVALID: 'AUTHORITY_WORKSPACE_MODULE_INVALID',
  PR_NOT_OPEN: 'LEDGER_PR_NOT_OPEN',
  PR_IDENTITY_MISMATCH: 'LEDGER_PR_IDENTITY_MISMATCH',
  AUTHORIZED_HEAD_MISMATCH: 'AUTHORIZED_HEAD_MISMATCH',
  AUTHORIZED_BASE_MISMATCH: 'AUTHORIZED_BASE_MISMATCH',
  AUTHORIZED_SCOPE_MISMATCH: 'AUTHORIZED_SCOPE_MISMATCH',
  REQUIRED_CHECKS_UNDISCOVERABLE: 'REQUIRED_CHECKS_UNDISCOVERABLE',
  REQUIRED_CHECK_PENDING: 'REQUIRED_CHECK_PENDING',
  REQUIRED_CHECK_FAILED: 'REQUIRED_CHECK_FAILED',
  CHECKED_SHA_MISMATCH: 'CHECKED_SHA_MISMATCH',
  WRONG_REPOSITORY: 'LEDGER_REPOSITORY_MISMATCH',
  WRONG_BRANCH: 'LEDGER_BRANCH_MISMATCH',
  WRONG_MERGE_METHOD: 'LEDGER_MERGE_METHOD_INVALID',
  COMPETING_WRITER: 'LEDGER_COMPETING_WRITER_FOUND',
  MANUAL_FALLBACK_NOT_GATED: 'MANUAL_FALLBACK_NOT_GATED',
  MISSING: 'MERGE_AUTHORITY_LEDGER_REQUIRED',
  MALFORMED: 'MERGE_AUTHORITY_LEDGER_MALFORMED',
  CONFLICT: 'CONFLICTING_MERGE_AUTHORITY_LEDGERS',
  DIGEST_MISMATCH: 'MERGE_AUTHORITY_LEDGER_DIGEST_MISMATCH',
  STATUS_INVALID: 'MERGE_AUTHORITY_LEDGER_STATUS_INVALID',
  REVOKED: 'MERGE_AUTHORITY_LEDGER_REVOKED',
  EXPIRED: 'MERGE_AUTHORITY_LEDGER_EXPIRED',
  INVALIDATED: 'MERGE_AUTHORITY_LEDGER_INVALIDATED',
  CONSUMED: 'MERGE_AUTHORITY_LEDGER_CONSUMED',
  REUSE_FORBIDDEN: 'MERGE_AUTHORITY_REUSE_FORBIDDEN',
  WRITE_CONFLICT: 'MERGE_AUTHORITY_LEDGER_WRITE_CONFLICT',
  CONSUMPTION_FAILED: 'MERGE_SUCCEEDED_LEDGER_CONSUMPTION_FAILED',
});

class LedgerError extends Error {
  constructor(code, detail) {
    super(code + (detail ? ': ' + detail : ''));
    this.name = 'LedgerError';
    this.code = code;
    this.detail = detail || null;
  }
}

function reject(code, detail) {
  throw new LedgerError(code, detail);
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    const out = {};
    for (const key of Object.keys(value).sort()) {
      if (value[key] !== undefined) out[key] = stableValue(value[key]);
    }
    return out;
  }
  return value;
}

function stableSerialize(value) {
  return JSON.stringify(stableValue(value));
}

function sha256(value) {
  return crypto.createHash('sha256').update(String(value), 'utf8').digest('hex');
}

function without(obj, keys) {
  const out = {};
  for (const [key, value] of Object.entries(obj || {})) {
    if (!keys.includes(key)) out[key] = value;
  }
  return out;
}

function entryDigest(entry) {
  return sha256(stableSerialize(without(entry, ['entryDigest', 'ledgerSchemaVersion', '__ledgerError'])));
}

function ledgerDigest(ledger) {
  return sha256(stableSerialize(without(ledger, ['ledgerDigest'])));
}

function finalizeLedger(ledger) {
  const next = {
    schemaVersion: SCHEMA_VERSION,
    entries: (ledger.entries || []).map((entry) => {
      const clean = without(entry, ['entryDigest', 'ledgerSchemaVersion', '__ledgerError']);
      return Object.assign(clean, { entryDigest: entryDigest(clean) });
    }),
  };
  next.ledgerDigest = ledgerDigest(next);
  return next;
}

function normalizeRef(ref, expectedKind, field) {
  if (!ref || typeof ref !== 'object') reject(CODE.INPUT_INVALID, field + ' is required');
  if (ref.kind !== expectedKind) reject(CODE.AUTHORITY_RECORD_INVALID, field + '.kind must be ' + expectedKind);
  if (!REPO_PATH.test(String(ref.path || ''))) reject(CODE.AUTHORITY_RECORD_INVALID, field + '.path is unsafe');
  if (!RECORD_ID.test(String(ref.recordId || ''))) reject(CODE.AUTHORITY_RECORD_INVALID, field + '.recordId is unsafe');
  if (!SHA40.test(String(ref.evidenceSha || ''))) reject(CODE.AUTHORITY_RECORD_INVALID, field + '.evidenceSha must be a sha');
  return {
    kind: ref.kind,
    path: ref.path.replace(/\\/g, '/'),
    recordId: ref.recordId,
    evidenceSha: ref.evidenceSha,
  };
}

function refsDistinct(sa, eg) {
  return sa.kind !== eg.kind && sa.path !== eg.path && sa.recordId !== eg.recordId;
}

function assertOutsideWorktree(targetPath, worktreePath, field) {
  if (!targetPath || !worktreePath) return;
  const target = path.resolve(targetPath);
  const worktree = path.resolve(worktreePath);
  const relative = path.relative(worktree, target);
  if (relative === '' || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative))) {
    reject(CODE.INPUT_INVALID, (field || 'persistent path') + ' must survive outside the isolated worktree');
  }
}

function normalizeScope(scope) {
  if (!Array.isArray(scope) || scope.length === 0) reject(CODE.AUTHORIZED_SCOPE_MISMATCH, 'scope is empty');
  const seen = new Set();
  const normalized = scope.map((item) => {
    if (!item || typeof item !== 'object') reject(CODE.AUTHORIZED_SCOPE_MISMATCH, 'scope entry is not an object');
    const status = String(item.status || '').trim();
    const file = String(item.path || '').replace(/\\/g, '/');
    const previousPath = item.previousPath == null ? undefined : String(item.previousPath).replace(/\\/g, '/');
    if (!/^(?:A|M|D|T|U|X|B|R\d{1,3}|C\d{1,3})$/.test(status)) {
      reject(CODE.AUTHORIZED_SCOPE_MISMATCH, 'unsupported git status ' + status);
    }
    if (!REPO_PATH.test(file) || (previousPath && !REPO_PATH.test(previousPath))) {
      reject(CODE.AUTHORIZED_SCOPE_MISMATCH, 'unsafe scope path');
    }
    const key = status + '\u0000' + (previousPath || '') + '\u0000' + file;
    if (seen.has(key)) reject(CODE.AUTHORIZED_SCOPE_MISMATCH, 'duplicate scope entry ' + file);
    seen.add(key);
    return previousPath ? { status, previousPath, path: file } : { status, path: file };
  });
  return normalized.sort((a, b) => stableSerialize(a).localeCompare(stableSerialize(b)));
}

function scopeDigest(scope) {
  return sha256(stableSerialize(normalizeScope(scope)));
}

function sameStringSet(left, right) {
  const a = [...new Set((left || []).map(String))].sort();
  const b = [...new Set((right || []).map(String))].sort();
  return stableSerialize(a) === stableSerialize(b);
}

function sameScope(left, right) {
  return stableSerialize(normalizeScope(left)) === stableSerialize(normalizeScope(right));
}

function parseAuthorityRecord(content, ref) {
  const blocks = [...String(content || '').matchAll(/```text\s*\r?\n([\s\S]*?)\r?\n```/g)]
    .map((match) => match[1]);
  const exact = blocks.filter((block) => new RegExp('^recordId\\s*:\\s*' + ref.recordId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*$', 'm').test(block));
  if (exact.length !== 1) reject(CODE.AUTHORITY_RECORD_INVALID, ref.recordId + ' structured record count is ' + exact.length);
  const record = {};
  for (const line of exact[0].split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z0-9_.]+)\s*:\s*(.*?)\s*$/);
    if (match) record[match[1]] = match[2];
  }
  return record;
}

function resolveCanonicalAuthority(ref, atRef, repoCwd) {
  try {
    // Reuse the canonical marker + evidence ancestry validator. Do not create
    // a second authority resolution rule in the closeout subsystem.
    const coordination = require('../../governance-coordination.cjs');
    coordination.validateAuthorityRecordAtRef(atRef, ref, repoCwd);
    return parseAuthorityRecord(coordination.gitShow(atRef, ref.path, repoCwd), ref);
  } catch (error) {
    if (error instanceof LedgerError) throw error;
    reject(CODE.AUTHORITY_RESOLUTION_FAILED, (error && error.message) || String(error));
  }
}

function validateAuthorityRecords(input, sa, eg) {
  const requiredSa = {
    recordType: 'SEMANTIC_AUTHORITY', recordId: input.semanticAuthorityRef.recordId,
    programId: input.programId, taskId: input.taskId,
    decision: 'RATIFIED', status: 'ACTIVE_AFTER_APPROVED_MERGE',
    exactTaskBinding: 'REQUIRED', exactPrBinding: 'REQUIRED',
    exactHeadBinding: 'REQUIRED', exactScopeBinding: 'REQUIRED',
    requiredChecksBinding: 'REQUIRED', singleUseConsumption: 'REQUIRED',
    staleReuse: 'PROHIBITED', manualFallback: 'EMERGENCY_ONLY',
    productionActivation: 'NOT_AUTHORIZED', standingAuthority: 'PROHIBITED',
  };
  const requiredEg = {
    recordType: 'EXECUTION_GRANT', recordId: input.executionGrantRef.recordId,
    programId: input.programId, taskId: input.taskId,
    executionMode: 'GO-COMPLETE',
    status: 'ACTIVE_AFTER_APPROVED_MERGE_SINGLE_TASK',
    productionActivation: 'NOT_AUTHORIZED', ciBypass: 'PROHIBITED',
    ledgerBypass: 'PROHIBITED', standingAuthority: 'PROHIBITED',
    reusableAuthority: 'PROHIBITED',
    'semanticAuthorityRef.kind': input.semanticAuthorityRef.kind,
    'semanticAuthorityRef.path': input.semanticAuthorityRef.path,
    'semanticAuthorityRef.recordId': input.semanticAuthorityRef.recordId,
  };
  for (const [field, expected] of Object.entries(requiredSa)) {
    if (sa[field] !== expected) {
      const code = field === 'programId' ? CODE.AUTHORITY_PROGRAM_MISMATCH
        : field === 'taskId' ? CODE.AUTHORITY_TASK_MISMATCH
          : field === 'manualFallback' ? CODE.MANUAL_FALLBACK_NOT_GATED
            : CODE.AUTHORITY_RECORD_INVALID;
      reject(code, 'SA.' + field + ' expected ' + expected + ', observed ' + sa[field]);
    }
  }
  for (const [field, expected] of Object.entries(requiredEg)) {
    if (eg[field] !== expected) {
      const code = field === 'programId' ? CODE.AUTHORITY_PROGRAM_MISMATCH
        : field === 'taskId' ? CODE.AUTHORITY_TASK_MISMATCH
          : field === 'executionMode' ? CODE.AUTHORITY_MODE_INVALID
            : CODE.AUTHORITY_RECORD_INVALID;
      reject(code, 'EG.' + field + ' expected ' + expected + ', observed ' + eg[field]);
    }
  }
  // CLOSEOUT-AUTHORITY-CONTRACT-IMPLEMENTATION-R01: workspaceModule artik sabit
  // 'SHARED_CONTROL_PLANE' degildir. Deger EG kaydindan gelir ve canonical enum'a karsi
  // dogrulanir (CANONICAL-FIVE-MODULE-WORKSPACE-MAP.md). Onceki hard-code, modul-kapsamli
  // her gorevin ledger materialize etmesini yapisal olarak imkansiz kiliyordu; ayrica
  // `REPOSITORY_WIDE_RUNTIME_CONTROL_PLANE` gibi non-canonical degerler icin uretilen
  // hata mesaji yanlis tarafi isaret ediyordu. Fail-closed korunur: eksik veya
  // enum-disi deger reddedilir.
  if (!CANONICAL_WORKSPACE_MODULES.has(eg.workspaceModule)) {
    reject(
      CODE.AUTHORITY_WORKSPACE_MODULE_INVALID,
      'EG.workspaceModule ' + JSON.stringify(eg.workspaceModule)
        + ' canonical degil; izinli: ' + [...CANONICAL_WORKSPACE_MODULES].join(', '),
    );
  }
  if (!sa.ownerName || sa.ownerName !== eg.ownerName || sa.ownerRole !== eg.ownerRole) {
    reject(CODE.AUTHORITY_OWNER_MISMATCH, 'SA/EG owner identity differs');
  }
  if (input.issuedBy && input.issuedBy !== sa.ownerName) {
    reject(CODE.AUTHORITY_OWNER_MISMATCH, 'issuedBy does not equal canonical owner');
  }
  return { ownerName: sa.ownerName, ownerRole: sa.ownerRole };
}

function validateRequiredChecks(requiredNames, checks, checkedSha, authorizedHeadSha) {
  if (!SHA40.test(String(checkedSha || '')) || checkedSha !== authorizedHeadSha) {
    reject(CODE.CHECKED_SHA_MISMATCH, 'checked SHA is not authorizedHeadSha');
  }
  const required = [...new Set((requiredNames || []).filter(Boolean))].sort();
  if (required.length === 0) reject(CODE.REQUIRED_CHECKS_UNDISCOVERABLE, 'required check set is empty');
  const bound = [];
  for (const name of required) {
    const observed = (checks || []).filter((check) => check.name === name);
    if (observed.length === 0 || observed.some((check) => check.status !== 'COMPLETED')) {
      reject(CODE.REQUIRED_CHECK_PENDING, name);
    }
    const latest = observed[observed.length - 1];
    if (latest.conclusion !== 'SUCCESS') reject(CODE.REQUIRED_CHECK_FAILED, name);
    bound.push({ name, checkedSha: authorizedHeadSha, conclusion: 'SUCCESS' });
  }
  return bound;
}

function assertLedgerShape(ledger) {
  if (!ledger || typeof ledger !== 'object' || ledger.schemaVersion !== SCHEMA_VERSION || !Array.isArray(ledger.entries)) {
    reject(CODE.MALFORMED, 'schemaVersion 2 and entries[] are required');
  }
  if (ledger.ledgerDigest !== ledgerDigest(ledger)) reject(CODE.DIGEST_MISMATCH, 'ledger digest differs');
  for (const entry of ledger.entries) {
    if (!entry || typeof entry !== 'object') reject(CODE.MALFORMED, 'entry is not an object');
    if (!ALL_STATUSES.has(entry.status)) reject(CODE.STATUS_INVALID, String(entry.status));
    if (entry.entryDigest !== entryDigest(entry)) reject(CODE.DIGEST_MISMATCH, 'entry digest differs');
  }
  const active = ledger.entries.filter((entry) => ACTIVE_STATUSES.has(entry.status));
  for (let i = 0; i < active.length; i += 1) {
    for (let j = i + 1; j < active.length; j += 1) {
      const sameRef = active[i].executionGrantRef && active[j].executionGrantRef
        && active[i].executionGrantRef.recordId === active[j].executionGrantRef.recordId;
      const sameCandidate = active[i].taskId === active[j].taskId && active[i].prNumber === active[j].prNumber;
      if (sameRef || sameCandidate) reject(CODE.CONFLICT, 'multiple active entries select the same authority or candidate');
    }
  }
  return ledger;
}

function readLedgerFile(ledgerPath) {
  if (!ledgerPath || !fs.existsSync(ledgerPath)) reject(CODE.MISSING, String(ledgerPath || ''));
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(ledgerPath, 'utf8'));
  } catch (error) {
    reject(CODE.MALFORMED, (error && error.message) || 'invalid JSON');
  }
  // Schema v1 remains readable for unrelated historical recovery runs. New
  // materialization and all rich binding guarantees require v2.
  if (parsed && parsed.schemaVersion === 1 && Array.isArray(parsed.entries)) return parsed;
  return assertLedgerShape(parsed);
}

function loadLedgerEntry(ledgerPath, authorityRef) {
  const ledger = readLedgerFile(ledgerPath);
  const matches = ledger.entries.filter((entry) => entry.authorityRef === authorityRef
    || (entry.executionGrantRef && entry.executionGrantRef.recordId === authorityRef));
  if (matches.length === 0) return null;
  if (matches.length > 1) reject(CODE.CONFLICT, 'authority reference resolves to multiple entries');
  return Object.assign({}, matches[0], { ledgerSchemaVersion: ledger.schemaVersion });
}

function atomicReplaceJson(targetPath, value, expectAbsent) {
  const parent = path.dirname(targetPath);
  fs.mkdirSync(parent, { recursive: true });
  const temp = targetPath + '.tmp-' + process.pid + '-' + crypto.randomBytes(6).toString('hex');
  try {
    if (expectAbsent && fs.existsSync(targetPath)) reject(CODE.CONFLICT, 'target ledger already exists');
    fs.writeFileSync(temp, JSON.stringify(value, null, 2) + '\n', { encoding: 'utf8', flag: 'wx', mode: 0o600 });
    const probe = JSON.parse(fs.readFileSync(temp, 'utf8'));
    assertLedgerShape(probe);
    fs.renameSync(temp, targetPath);
  } finally {
    if (fs.existsSync(temp)) fs.unlinkSync(temp);
  }
}

function withLedgerLock(ledgerPath, action) {
  const lockPath = ledgerPath + '.lock';
  fs.mkdirSync(path.dirname(ledgerPath), { recursive: true });
  let fd;
  try {
    fd = fs.openSync(lockPath, 'wx', 0o600);
  } catch (error) {
    reject(CODE.WRITE_CONFLICT, 'ledger lock already exists');
  }
  try {
    return action();
  } finally {
    if (fd != null) fs.closeSync(fd);
    if (fs.existsSync(lockPath)) fs.unlinkSync(lockPath);
  }
}

async function materializeMergeAuthority(input, adapter) {
  const i = Object.assign({}, input || {});
  for (const field of ['programId', 'taskId', 'repository', 'baseBranch', 'taskBranch', 'ledgerPath']) {
    if (!i[field] || typeof i[field] !== 'string') reject(CODE.INPUT_INVALID, field + ' is required');
  }
  if (!Number.isInteger(i.prNumber) || i.prNumber < 1) reject(CODE.INPUT_INVALID, 'prNumber must be positive');
  if (!SHA40.test(String(i.expectedHead || '')) || !SHA40.test(String(i.expectedBase || ''))) {
    reject(CODE.INPUT_INVALID, 'expectedHead and expectedBase must be full shas');
  }
  if (i.mergeMethod !== 'SQUASH') reject(CODE.WRONG_MERGE_METHOD, String(i.mergeMethod));
  assertOutsideWorktree(i.ledgerPath, i.worktreePath, 'ledgerPath');
  i.semanticAuthorityRef = normalizeRef(i.semanticAuthorityRef, 'SEMANTIC_AUTHORITY', 'semanticAuthorityRef');
  i.executionGrantRef = normalizeRef(i.executionGrantRef, 'EXECUTION_GRANT', 'executionGrantRef');
  if (!refsDistinct(i.semanticAuthorityRef, i.executionGrantRef)) {
    reject(CODE.AUTHORITY_REFS_NOT_DISTINCT, 'kind, path and recordId must all differ');
  }

  let sa;
  let eg;
  try {
    [sa, eg] = await Promise.all([
      adapter.resolveAuthority(i.semanticAuthorityRef, i.expectedBase),
      adapter.resolveAuthority(i.executionGrantRef, i.expectedBase),
    ]);
  } catch (error) {
    if (error instanceof LedgerError) throw error;
    reject(CODE.AUTHORITY_RESOLUTION_FAILED, (error && error.message) || String(error));
  }
  if (!sa || !eg) reject(CODE.AUTHORITY_RESOLUTION_FAILED, 'SA01 or EG01 did not resolve');
  const owner = validateAuthorityRecords(i, sa, eg);

  const repository = await adapter.repositoryIdentity();
  if (repository !== i.repository) reject(CODE.WRONG_REPOSITORY, String(repository));
  const pr = await adapter.getPr(i.prNumber);
  if (!pr || pr.state !== 'OPEN') reject(CODE.PR_NOT_OPEN, pr ? String(pr.state) : 'missing PR');
  if (pr.number != null && pr.number !== i.prNumber) reject(CODE.PR_IDENTITY_MISMATCH, 'PR number differs');
  if (pr.headRefOid !== i.expectedHead) reject(CODE.AUTHORIZED_HEAD_MISMATCH, String(pr.headRefOid));
  if (pr.baseRefName !== i.baseBranch || pr.headRefName !== i.taskBranch) reject(CODE.WRONG_BRANCH, 'PR branch binding differs');
  if (pr.baseRefOid !== i.expectedBase) reject(CODE.AUTHORIZED_BASE_MISMATCH, String(pr.baseRefOid));
  if (typeof adapter.currentBaseHead === 'function') {
    const currentBase = await adapter.currentBaseHead(i.baseBranch);
    if (currentBase !== i.expectedBase) reject(CODE.AUTHORIZED_BASE_MISMATCH, String(currentBase));
  }

  const scope = normalizeScope(await adapter.changedScope(i.expectedBase, i.expectedHead));
  const scopePaths = scope.map((entry) => entry.path);
  if (i.allowedPaths && !sameStringSet(i.allowedPaths, scopePaths)) {
    reject(CODE.AUTHORIZED_SCOPE_MISMATCH, 'requested allowlist is not the exact Git diff');
  }
  let platformRequired;
  try {
    platformRequired = typeof adapter.discoverPlatformRequiredChecks === 'function'
      ? await adapter.discoverPlatformRequiredChecks(i.baseBranch)
      : await adapter.platformRequiredChecks(i.baseBranch);
  } catch (error) {
    reject(CODE.REQUIRED_CHECKS_UNDISCOVERABLE, (error && error.message) || String(error));
  }
  const requiredNames = [...new Set([
    ...((platformRequired) || []),
    ...(i.requiredChecks || []),
  ].filter(Boolean))].sort();
  const checkRecords = validateRequiredChecks(requiredNames, await adapter.getChecks(i.prNumber), pr.headRefOid, i.expectedHead);

  const collisionPaths = [...new Set([...scopePaths, i.semanticAuthorityRef.path, i.executionGrantRef.path])];
  const collisions = await adapter.competingWriters(i.prNumber, collisionPaths);
  if (collisions && collisions.length) reject(CODE.COMPETING_WRITER, collisions.join(', '));

  const now = i.now || new Date().toISOString();
  const entry = {
    schemaVersion: SCHEMA_VERSION,
    programId: i.programId,
    taskId: i.taskId,
    authorityRef: i.executionGrantRef.recordId,
    semanticAuthorityRef: i.semanticAuthorityRef,
    executionGrantRef: i.executionGrantRef,
    repository: i.repository,
    baseBranch: i.baseBranch,
    taskBranch: i.taskBranch,
    prNumber: i.prNumber,
    authorizedBaseSha: i.expectedBase,
    authorizedHeadSha: i.expectedHead,
    allowlist: scope,
    allowlistDigest: scopeDigest(scope),
    requiredChecks: checkRecords,
    mergeMethod: 'SQUASH',
    issuedAt: now,
    issuedBy: owner.ownerName,
    ownerRole: owner.ownerRole,
    status: 'VALIDATED',
    lifecycle: [
      { status: 'ISSUED', at: now, actor: owner.ownerName },
      { status: 'VALIDATED', at: now, actor: 'orch:closeout/materializer' },
    ],
    evidenceRefs: [
      i.semanticAuthorityRef.kind + '|' + i.semanticAuthorityRef.path + '|' + i.semanticAuthorityRef.recordId,
      i.executionGrantRef.kind + '|' + i.executionGrantRef.path + '|' + i.executionGrantRef.recordId,
      'PR:#' + i.prNumber + '@' + i.expectedHead,
    ],
  };
  const output = finalizeLedger({ entries: [entry] });
  withLedgerLock(i.ledgerPath, () => atomicReplaceJson(i.ledgerPath, output, true));
  return {
    status: 'LEDGER_MATERIALIZED',
    ledgerPath: path.resolve(i.ledgerPath),
    ledgerDigest: output.ledgerDigest,
    entry: output.entries[0],
  };
}

function validateLiveLedgerBinding(input, entry) {
  if (!entry) return { ok: false, code: CODE.MISSING, detail: 'no ledger entry' };
  if (entry.__ledgerError) return { ok: false, code: entry.__ledgerError.code, detail: entry.__ledgerError.detail };
  if (entry.ledgerSchemaVersion !== SCHEMA_VERSION) return { ok: true, legacy: true, liveReady: true };
  const fail = (code, detail) => ({ ok: false, code, detail });
  if (entry.status === 'CONSUMED') return fail(CODE.CONSUMED, 'ledger is already consumed');
  if (entry.status === 'REVOKED') return fail(CODE.REVOKED, 'ledger is revoked');
  if (entry.status === 'EXPIRED') return fail(CODE.EXPIRED, 'ledger is expired');
  if (entry.status === 'INVALIDATED') return fail(CODE.INVALIDATED, 'ledger is invalidated');
  if (entry.status !== 'VALIDATED') return fail(CODE.STATUS_INVALID, String(entry.status));
  if (entry.expiresAt && Date.parse(entry.expiresAt) <= Date.now()) return fail(CODE.EXPIRED, entry.expiresAt);
  if (entry.programId !== input.programId) return fail(CODE.AUTHORITY_PROGRAM_MISMATCH, entry.programId);
  if (entry.taskId !== input.taskId) return fail(CODE.AUTHORITY_TASK_MISMATCH, entry.taskId);
  if (entry.prNumber !== input.pr) return fail(CODE.PR_IDENTITY_MISMATCH, String(entry.prNumber));
  if (entry.authorizedHeadSha !== input.expectedHead) return fail(CODE.AUTHORIZED_HEAD_MISMATCH, entry.authorizedHeadSha);
  if (input.targetBranch && entry.baseBranch !== input.targetBranch) return fail(CODE.WRONG_BRANCH, entry.baseBranch);
  if (input.branch && entry.taskBranch !== input.branch) return fail(CODE.WRONG_BRANCH, entry.taskBranch);
  if (input.repository && entry.repository !== input.repository) return fail(CODE.WRONG_REPOSITORY, entry.repository);
  if (entry.mergeMethod !== 'SQUASH') return fail(CODE.WRONG_MERGE_METHOD, entry.mergeMethod);
  if (!refsDistinct(entry.semanticAuthorityRef, entry.executionGrantRef)) {
    return fail(CODE.AUTHORITY_REFS_NOT_DISTINCT, 'ledger refs are not distinct');
  }
  if (input.semanticAuthorityRef && stableSerialize(entry.semanticAuthorityRef) !== stableSerialize(input.semanticAuthorityRef)) {
    return fail(CODE.AUTHORITY_RECORD_INVALID, 'semantic authority ref differs');
  }
  if (input.executionGrantRef && stableSerialize(entry.executionGrantRef) !== stableSerialize(input.executionGrantRef)) {
    return fail(CODE.AUTHORITY_RECORD_INVALID, 'execution grant ref differs');
  }
  const paths = entry.allowlist.map((item) => item.path);
  if (!sameStringSet(paths, input.allowedPaths || [])) return fail(CODE.AUTHORIZED_SCOPE_MISMATCH, 'CLI allowlist differs');
  if (scopeDigest(entry.allowlist) !== entry.allowlistDigest) return fail(CODE.DIGEST_MISMATCH, 'allowlist digest differs');
  const checkNames = entry.requiredChecks.map((item) => item.name);
  if (!sameStringSet(checkNames, input.requiredChecks || [])) return fail(CODE.REQUIRED_CHECKS_UNDISCOVERABLE, 'CLI required checks differ');
  if (entry.requiredChecks.some((item) => item.checkedSha !== entry.authorizedHeadSha || item.conclusion !== 'SUCCESS')) {
    return fail(CODE.CHECKED_SHA_MISMATCH, 'bound check does not belong to authorized head');
  }
  return { ok: true, liveReady: true, legacy: false };
}

function consumeLedgerFile(ledgerPath, authorityRef, meta) {
  try {
    return withLedgerLock(ledgerPath, () => {
      const ledger = readLedgerFile(ledgerPath);
      if (ledger.schemaVersion !== SCHEMA_VERSION) reject(CODE.CONSUMPTION_FAILED, 'schema v1 cannot satisfy v2 dogfood consumption');
      const matches = ledger.entries.filter((entry) => entry.authorityRef === authorityRef
        || (entry.executionGrantRef && entry.executionGrantRef.recordId === authorityRef));
      if (matches.length !== 1) reject(matches.length > 1 ? CODE.CONFLICT : CODE.MISSING, 'consumption entry count ' + matches.length);
      const entry = matches[0];
      if (entry.status === 'CONSUMED') reject(CODE.REUSE_FORBIDDEN, 'ledger was already consumed');
      if (entry.status !== 'VALIDATED') reject(CODE.STATUS_INVALID, entry.status);
      if (!meta || entry.taskId !== meta.taskId || entry.prNumber !== meta.pr) reject(CODE.REUSE_FORBIDDEN, 'consumption candidate differs');
      if (meta.expectedHead && entry.authorizedHeadSha !== meta.expectedHead) reject(CODE.AUTHORIZED_HEAD_MISMATCH, entry.authorizedHeadSha);
      if (!SHA40.test(String(meta.mergeSha || ''))) reject(CODE.CONSUMPTION_FAILED, 'merge SHA is missing');
      const at = meta.consumedAt || new Date().toISOString();
      entry.status = 'CONSUMED';
      entry.consumedAt = at;
      entry.consumedByMergeSha = meta.mergeSha;
      entry.lifecycle = [...(entry.lifecycle || []), { status: 'CONSUMED', at, actor: 'orch:closeout/live-runner', mergeSha: meta.mergeSha }];
      const finalized = finalizeLedger(ledger);
      atomicReplaceJson(ledgerPath, finalized, false);
      return 'CONSUMED';
    });
  } catch (error) {
    if (error instanceof LedgerError) throw error;
    reject(CODE.CONSUMPTION_FAILED, (error && error.message) || String(error));
  }
}

module.exports = {
  ACTIVE_STATUSES,
  CANONICAL_WORKSPACE_MODULES,
  ALL_STATUSES,
  CODE,
  LedgerError,
  SCHEMA_VERSION,
  atomicReplaceJson,
  assertOutsideWorktree,
  consumeLedgerFile,
  entryDigest,
  finalizeLedger,
  ledgerDigest,
  loadLedgerEntry,
  materializeMergeAuthority,
  normalizeScope,
  parseAuthorityRecord,
  readLedgerFile,
  refsDistinct,
  resolveCanonicalAuthority,
  sameScope,
  scopeDigest,
  stableSerialize,
  validateAuthorityRecords,
  validateLiveLedgerBinding,
  validateRequiredChecks,
};
