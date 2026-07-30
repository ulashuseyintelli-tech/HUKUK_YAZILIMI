'use strict';

/**
 * GOV-DETERMINISTIC-PR-CLOSEOUT-AUTOMATION-R01 — task-bound PR closeout.
 *
 * Bu modul owner authority URETMEZ. Owner tarafindan belirli bir task/PR'a
 * acikca baglanmis merge authority zaten varsa, mekanik kapanisi deterministik
 * ve fail-closed olarak yurutur.
 *
 * Neden ayri bir giris noktasi:
 *   orchestrator/completeAfterOwnerMerge ayni state machine'i tasir ama
 *   GOV-COORD-V2 task lifecycle'ina baglidir (queue entry, lease epoch, holder
 *   token, task spec digest) ve performMerge yolu standing grant ister
 *   (runtime/run-task.cjs:213). Owner standing grant'i bu task icin yasakladi.
 *   Elde yalniz bir PR ve task-bound owner authority varken cagrilabilecek bir
 *   yuzey yoktu; bu modul o bosluğu kapatir. Gate mantigi yeniden yazilmaz —
 *   CI degerlendirmesi mergeready.cjs'ten alinir.
 *
 * Bu modul:
 *   - authority resolver DEGILDIR; serbest metin owner mesajini yorumlamaz
 *   - semantic karar vermez
 *   - standing/unattended/scheduled auto-merge acmaz
 *   - authority'yi baska task veya PR'a tasimaz
 *   - belirsizlikte fail-closed davranir
 *
 * Tum I/O bir adapter uzerinden gecer; core saf ve test edilebilirdir.
 *
 * Cagrildigi yerler:
 * - closeout/cli.cjs -> `pnpm orch:closeout`
 * - apps/api/src/common/__tests__/pr-closeout.spec.ts -> davranis testleri
 */

const { evaluateCi } = require('../orchestrator/mergeready.cjs');
const mergeAuthorityLedger = require('./merge-authority-ledger.cjs');

/** Owner 3.2: yalniz task-bound authority tipleri. */
const AUTHORITY_TYPES = Object.freeze([
  'EX_ANTE_GO_COMPLETE',
  'IN_TASK_GO_COMPLETE',
  'EXPLICIT_PR_MERGE_AUTHORITY',
]);

/** Owner 3.3: tek yonlu state machine. */
const STAGES = Object.freeze([
  'PREFLIGHT',
  'AUTHORITY_VALIDATED',
  'PR_IDENTITY_VALIDATED',
  'SCOPE_VALIDATED',
  'CI_TERMINAL',
  'MERGE_GATE_VALIDATED',
  'MERGED',
  'MAIN_SYNCED',
  'LEDGER_CONSUMED',
  // Worktree ONCE: bir worktree branch'i checkout tutarken `git branch -D`
  // calismaz. Gercek akis R01 pilotunda duzeltilmisti ama bu sabit eski sirada
  // kalmisti; required invariant testi tutarsizligi yakaladi.
  'WORKTREE_CLEANED',
  'BRANCH_CLEANED',
  'CANONICAL_VERIFIED',
  'CLOSED',
]);

/** Owner 3.10: hata kodlari. */
const BLOCKER = Object.freeze({
  MERGE_AUTHORITY_MISSING: 'MERGE_AUTHORITY_MISSING',
  MERGE_AUTHORITY_INVALID: 'MERGE_AUTHORITY_INVALID',
  MERGE_AUTHORITY_TASK_MISMATCH: 'MERGE_AUTHORITY_TASK_MISMATCH',
  MERGE_AUTHORITY_PR_MISMATCH: 'MERGE_AUTHORITY_PR_MISMATCH',
  MERGE_AUTHORITY_REUSE_FORBIDDEN: 'MERGE_AUTHORITY_REUSE_FORBIDDEN',
  PR_NOT_OPEN: 'PR_NOT_OPEN',
  PR_HEAD_MISMATCH: 'PR_HEAD_MISMATCH',
  REMOTE_HEAD_MISMATCH: 'REMOTE_HEAD_MISMATCH',
  LOCAL_HEAD_MISMATCH: 'LOCAL_HEAD_MISMATCH',
  CHANGED_PATH_SCOPE_FORBIDDEN: 'CHANGED_PATH_SCOPE_FORBIDDEN',
  COMPETING_WRITER_FOUND: 'COMPETING_WRITER_FOUND',
  OWNER_WIP_COLLISION: 'OWNER_WIP_COLLISION',
  CI_NOT_TERMINAL: 'CI_NOT_TERMINAL',
  CI_FAILED: 'CI_FAILED',
  CI_STALLED: 'CI_STALLED',
  PR_NOT_MERGEABLE: 'PR_NOT_MERGEABLE',
  PR_NOT_CLEAN: 'PR_NOT_CLEAN',
  MERGE_FAILED: 'MERGE_FAILED',
  MERGE_STATE_UNVERIFIED: 'MERGE_STATE_UNVERIFIED',
  MAIN_SYNC_FAILED: 'MAIN_SYNC_FAILED',
  BRANCH_CLEANUP_FAILED: 'BRANCH_CLEANUP_FAILED',
  WORKTREE_CLEANUP_FAILED: 'WORKTREE_CLEANUP_FAILED',
  CANONICAL_VERIFICATION_FAILED: 'CANONICAL_VERIFICATION_FAILED',
  MERGE_AUTHORITY_LEDGER_REQUIRED: 'MERGE_AUTHORITY_LEDGER_REQUIRED',
  UNEXPECTED_GITHUB_RESPONSE: 'UNEXPECTED_GITHUB_RESPONSE',
  TARGET_BRANCH_UNEXPECTED: 'TARGET_BRANCH_UNEXPECTED',
  REPOSITORY_IDENTITY_MISMATCH: 'REPOSITORY_IDENTITY_MISMATCH',
  AUTHORITY_RESOLUTION_FAILED: 'AUTHORITY_RESOLUTION_FAILED',
  AUTHORITY_REFS_NOT_DISTINCT: 'AUTHORITY_REFS_NOT_DISTINCT',
  AUTHORIZED_HEAD_MISMATCH: 'AUTHORIZED_HEAD_MISMATCH',
  AUTHORIZED_BASE_MISMATCH: 'AUTHORIZED_BASE_MISMATCH',
  AUTHORIZED_SCOPE_MISMATCH: 'AUTHORIZED_SCOPE_MISMATCH',
  REQUIRED_CHECKS_BINDING_MISMATCH: 'REQUIRED_CHECKS_BINDING_MISMATCH',
  CHECKED_SHA_MISMATCH: 'CHECKED_SHA_MISMATCH',
  CONFLICTING_MERGE_AUTHORITY_LEDGERS: 'CONFLICTING_MERGE_AUTHORITY_LEDGERS',
  MERGE_AUTHORITY_LEDGER_MALFORMED: 'MERGE_AUTHORITY_LEDGER_MALFORMED',
  MERGE_AUTHORITY_LEDGER_DIGEST_MISMATCH: 'MERGE_AUTHORITY_LEDGER_DIGEST_MISMATCH',
  MERGE_AUTHORITY_LEDGER_REVOKED: 'MERGE_AUTHORITY_LEDGER_REVOKED',
  MERGE_AUTHORITY_LEDGER_EXPIRED: 'MERGE_AUTHORITY_LEDGER_EXPIRED',
  MERGE_AUTHORITY_LEDGER_INVALIDATED: 'MERGE_AUTHORITY_LEDGER_INVALIDATED',
  MERGE_AUTHORITY_LEDGER_CONSUMED: 'MERGE_AUTHORITY_LEDGER_CONSUMED',
  MERGE_SUCCEEDED_LEDGER_CONSUMPTION_FAILED: 'MERGE_SUCCEEDED_LEDGER_CONSUMPTION_FAILED',
});

const SHA40 = /^[0-9a-f]{40}$/;
/** Owner 3.11: option injection ve path traversal savunmasi. */
const BRANCH_SAFE = /^[A-Za-z0-9][A-Za-z0-9._\/-]*$/;
const TASK_ID_SAFE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const AUTHORITY_REF_SAFE = /^[A-Za-z0-9][A-Za-z0-9 ._#:\/@-]{0,200}$/;
const SECRET_PATTERN = /(gh[pousr]_[A-Za-z0-9]{16,}|ghs_[A-Za-z0-9]{16,}|[A-Za-z0-9_-]*(?:token|secret|password|apikey)[A-Za-z0-9_-]*\s*[=:]\s*\S+)/gi;

class CloseoutError extends Error {
  constructor(code, detail) {
    super(code + (detail ? ': ' + detail : ''));
    this.name = 'CloseoutError';
    this.code = code;
    this.detail = detail || null;
  }
}

/** Owner 3.11: secret asla output'a yazilmaz. */
function redact(value) {
  return String(value == null ? '' : value).replace(SECRET_PATTERN, '[REDACTED]');
}

function blocked(stage, code, detail, extra) {
  return Object.assign(
    {
      status: 'BLOCKED',
      stage,
      blockerCode: code,
      detail: detail ? redact(detail) : null,
    },
    extra || {},
  );
}

/**
 * Owner 3.2: input dogrulamasi. Serbest metin owner mesaji YORUMLANMAZ; yalniz
 * izin verilen enum ve dogrulanabilir reference kabul edilir.
 */
function validateInput(input) {
  const i = input || {};
  if (!i.authorityRef || !i.authorityType) {
    return { ok: false, code: BLOCKER.MERGE_AUTHORITY_MISSING, detail: 'authorityRef and authorityType are required' };
  }
  if (AUTHORITY_TYPES.indexOf(i.authorityType) === -1) {
    return { ok: false, code: BLOCKER.MERGE_AUTHORITY_INVALID, detail: 'unknown authorityType ' + i.authorityType };
  }
  if (!AUTHORITY_REF_SAFE.test(String(i.authorityRef))) {
    return { ok: false, code: BLOCKER.MERGE_AUTHORITY_INVALID, detail: 'authorityRef has an unsafe shape' };
  }
  if (!i.taskId || !TASK_ID_SAFE.test(String(i.taskId))) {
    return { ok: false, code: BLOCKER.MERGE_AUTHORITY_INVALID, detail: 'taskId missing or unsafe' };
  }
  if (!Number.isInteger(i.pr) || i.pr < 1) {
    return { ok: false, code: BLOCKER.MERGE_AUTHORITY_INVALID, detail: 'pr must be a positive integer' };
  }
  if (!SHA40.test(String(i.expectedHead || ''))) {
    return { ok: false, code: BLOCKER.MERGE_AUTHORITY_INVALID, detail: 'expectedHead must be a full 40-hex sha' };
  }
  if (i.branch != null && !BRANCH_SAFE.test(String(i.branch))) {
    return { ok: false, code: BLOCKER.MERGE_AUTHORITY_INVALID, detail: 'branch name has an unsafe shape' };
  }
  if (i.worktree != null && /\.\.[\/\\]/.test(String(i.worktree))) {
    return { ok: false, code: BLOCKER.MERGE_AUTHORITY_INVALID, detail: 'worktree path traversal rejected' };
  }
  if (!Array.isArray(i.allowedPaths) || i.allowedPaths.length === 0) {
    return { ok: false, code: BLOCKER.MERGE_AUTHORITY_INVALID, detail: 'allowedPaths (scope) is required' };
  }
  return { ok: true };
}

/**
 * Owner 3.2: ayni authority reference baska PR/task'ta kullanilamaz. Ledger
 * adapter tarafindan saglanir; yoksa reuse kontrolu yapilamaz ve fail-closed
 * davranilir DEGIL — ledger opsiyoneldir, ancak varsa baglayicidir.
 */
function checkAuthorityBinding(input, ledgerEntry) {
  // Live merge authority ledger OLMADAN calismaz: tuketim kaydi tutulamazsa
  // reuse korumasi da yoktur. Dry-run ledger'siz calisabilir — hicbir mutation
  // yapmadigi icin tuketilecek bir sey de yoktur.
  if (!ledgerEntry) {
    if (input && input.dryRun === true) return { ok: true, liveReady: false };
    return {
      ok: false,
      code: BLOCKER.MERGE_AUTHORITY_LEDGER_REQUIRED,
      detail: 'live closeout requires an authority ledger entry for ' + (input && input.authorityRef),
    };
  }
  if (ledgerEntry.__ledgerError) {
    return {
      ok: false,
      code: ledgerEntry.__ledgerError.code || BLOCKER.MERGE_AUTHORITY_LEDGER_MALFORMED,
      detail: ledgerEntry.__ledgerError.detail || 'ledger could not be validated',
    };
  }
  if (ledgerEntry.ledgerSchemaVersion === mergeAuthorityLedger.SCHEMA_VERSION) {
    return mergeAuthorityLedger.validateLiveLedgerBinding(input, ledgerEntry);
  }
  // Ledger kaydinin baglayici alanlari eksikse binding dogrulanamaz.
  for (const field of ['taskId', 'pr']) {
    if (ledgerEntry[field] == null) {
      return {
        ok: false,
        code: BLOCKER.MERGE_AUTHORITY_LEDGER_REQUIRED,
        detail: 'ledger entry is missing required binding field: ' + field,
      };
    }
  }
  // Tuketilmis bir reference once REUSE ekseninde degerlendirilir. Aksi halde
  // binding kontrolu (PR_MISMATCH) once tetikleniyor ve operatore yanlis sinyal
  // gidiyordu: "yanlis PR" diyordu, oysa gercek sebep reference'in zaten
  // tuketilmis olmasi ve baska bir PR'a tasinmaya calisilmasidir. R02 pilotu
  // bunu ortaya cikardi.
  if (ledgerEntry.consumed === true) {
    const consumedTask = ledgerEntry.consumedTaskId || ledgerEntry.taskId || null;
    const consumedPr = ledgerEntry.consumedPr != null ? ledgerEntry.consumedPr : ledgerEntry.pr;
    const sameTask = !consumedTask || consumedTask === input.taskId;
    const samePr = consumedPr == null || consumedPr === input.pr;
    if (!sameTask || !samePr) {
      return {
        ok: false,
        code: BLOCKER.MERGE_AUTHORITY_REUSE_FORBIDDEN,
        detail: 'reference consumed by task ' + consumedTask + ' PR #' + consumedPr,
      };
    }
    // Ayni task + ayni PR: recovery kosusu mesrudur (owner 3.8).
    return { ok: true, liveReady: true, legacy: true };
  }
  if (ledgerEntry.taskId && ledgerEntry.taskId !== input.taskId) {
    return { ok: false, code: BLOCKER.MERGE_AUTHORITY_TASK_MISMATCH, detail: 'ref bound to task ' + ledgerEntry.taskId };
  }
  if (ledgerEntry.pr != null && ledgerEntry.pr !== input.pr) {
    return { ok: false, code: BLOCKER.MERGE_AUTHORITY_PR_MISMATCH, detail: 'ref bound to PR #' + ledgerEntry.pr };
  }
  // expectedHead EN SON degerlendirilir: yanlis task/PR ya da tuketilmis bir
  // reference icin operatore o spesifik kod gitmeli, "ledger eksik" degil.
  if (input && input.dryRun !== true && ledgerEntry.expectedHead == null) {
    return {
      ok: false,
      code: BLOCKER.MERGE_AUTHORITY_LEDGER_REQUIRED,
      detail: 'ledger entry is missing required binding field: expectedHead',
    };
  }
  if (ledgerEntry.expectedHead != null && input && ledgerEntry.expectedHead !== input.expectedHead) {
    return {
      ok: false,
      code: BLOCKER.MERGE_AUTHORITY_PR_MISMATCH,
      detail: 'ledger expectedHead ' + ledgerEntry.expectedHead + ' does not match',
    };
  }
  return { ok: true, liveReady: true, legacy: true };
}

/** Owner 3.4/7: changed path'ler yetkili exact scope icinde mi. */
function checkScope(changedPaths, allowedPaths) {
  const outside = (changedPaths || []).filter((p) => allowedPaths.indexOf(p) === -1);
  return { ok: outside.length === 0, outside };
}

/**
 * Owner 3.5: CI degerlendirmesi. mergeready.evaluateCi yeniden kullanilir —
 * required set runtime'da hesaplanir, pending ile failed ayrilir.
 */
function classifyCi(observed, sources) {
  const r = evaluateCi({ observed: observed || [], sources: sources || {} });
  if (r.pass) return { terminal: true, pass: true, evaluation: r };
  if (r.failed.length > 0) {
    return { terminal: true, pass: false, code: BLOCKER.CI_FAILED, detail: r.failed.join(', '), evaluation: r };
  }
  return { terminal: false, pass: false, code: BLOCKER.CI_NOT_TERMINAL, detail: (r.pending.concat(r.missing)).join(', '), evaluation: r };
}

/** Owner 3.4/14-15: merge state gate'i. */
function checkMergeState(pr) {
  if (pr.state !== 'OPEN') return { ok: false, code: BLOCKER.PR_NOT_OPEN, detail: pr.state };
  if (pr.mergeable !== 'MERGEABLE') return { ok: false, code: BLOCKER.PR_NOT_MERGEABLE, detail: String(pr.mergeable) };
  if (pr.mergeStateStatus !== 'CLEAN') return { ok: false, code: BLOCKER.PR_NOT_CLEAN, detail: String(pr.mergeStateStatus) };
  return { ok: true };
}

/**
 * GitHub yanitinin sekil dogrulamasi. Eksik veya beklenmedik bir yanit sessizce
 * "gate PASS" gibi degerlendirilmemelidir: `pr.state` undefined ise
 * `state !== 'OPEN'` dogru olur ve dogru sebebi gizler.
 */
function validatePrShape(pr) {
  if (!pr || typeof pr !== 'object') return 'pr payload is not an object';
  if (typeof pr.state !== 'string' || pr.state.length === 0) return 'pr.state missing';
  if (pr.state === 'OPEN') {
    if (typeof pr.headRefOid !== 'string' || !SHA40.test(pr.headRefOid)) return 'pr.headRefOid is not a sha';
    if (typeof pr.mergeable !== 'string') return 'pr.mergeable missing';
    if (typeof pr.mergeStateStatus !== 'string') return 'pr.mergeStateStatus missing';
  }
  if (pr.state === 'MERGED' && pr.mergeCommitOid != null && !SHA40.test(String(pr.mergeCommitOid))) {
    return 'pr.mergeCommitOid is not a sha';
  }
  return null;
}

function baseResult(input) {
  return {
    taskId: input.taskId,
    pr: input.pr,
    authorityRef: redact(input.authorityRef),
    authorityType: input.authorityType,
    status: 'BLOCKED',
    stage: 'PREFLIGHT',
    expectedHead: input.expectedHead,
    observedHead: null,
    mergeSha: null,
    changedPaths: [],
    ci: [],
    mainSha: null,
    aheadBehind: null,
    branchCleanup: null,
    worktreeCleanup: null,
    canonicalVerification: null,
    blockerCode: null,
    authorityConsumed: null,
    dryRun: input.dryRun === true,
    structuralEligibility: null,
    liveAuthorityReadiness: null,
    ledgerSchemaVersion: null,
    ledgerFinalStatus: null,
    mergePerformedBy: 'NONE',
    manualFallback: 'NOT_USED',
  };
}

/**
 * Deterministik kapanis. Adapter tum I/O'yu saglar; bu fonksiyon karar verir.
 *
 * Owner 3.8 idempotency: PR zaten MERGED ise yeni merge cagrilmaz, yalniz
 * post-merge recovery zinciri kosulur.
 */
async function closeoutPr(input, adapter) {
  const out = baseResult(input || {});

  const v = validateInput(input);
  if (!v.ok) return Object.assign(out, blocked('PREFLIGHT', v.code, v.detail));

  // --- repository identity (owner 3.4/1)
  const repo = await adapter.repositoryIdentity();
  if (input.repository && repo !== input.repository) {
    return Object.assign(out, blocked('PREFLIGHT', BLOCKER.REPOSITORY_IDENTITY_MISMATCH, repo));
  }

  // --- authority (owner 3.2)
  const ledgerEntry = await adapter.authorityLedgerEntry(input.authorityRef);
  const bind = checkAuthorityBinding(input, ledgerEntry);
  if (!bind.ok) return Object.assign(out, blocked('PREFLIGHT', bind.code, bind.detail));
  out.liveAuthorityReadiness = bind.liveReady === false ? 'MISSING' : 'READY';
  out.ledgerSchemaVersion = ledgerEntry && ledgerEntry.ledgerSchemaVersion || null;
  if (out.ledgerSchemaVersion === mergeAuthorityLedger.SCHEMA_VERSION) {
    if (typeof adapter.validateCanonicalAuthorities !== 'function') {
      return Object.assign(out, blocked('PREFLIGHT', BLOCKER.AUTHORITY_RESOLUTION_FAILED, 'adapter cannot re-resolve canonical authority'));
    }
    const resolved = await adapter.validateCanonicalAuthorities(ledgerEntry);
    if (!resolved || !resolved.ok) {
      return Object.assign(out, blocked('PREFLIGHT', (resolved && resolved.code) || BLOCKER.AUTHORITY_RESOLUTION_FAILED, resolved && resolved.detail));
    }
    try {
      mergeAuthorityLedger.validateAuthorityRecords({
        programId: input.programId,
        taskId: input.taskId,
        semanticAuthorityRef: ledgerEntry.semanticAuthorityRef,
        executionGrantRef: ledgerEntry.executionGrantRef,
        issuedBy: ledgerEntry.issuedBy,
      }, resolved.semantic, resolved.execution);
    } catch (error) {
      return Object.assign(out, blocked('PREFLIGHT', error.code || BLOCKER.AUTHORITY_RESOLUTION_FAILED, error.detail || error.message));
    }
  }
  out.stage = 'AUTHORITY_VALIDATED';

  const pr = await adapter.getPr(input.pr);
  const shape = validatePrShape(pr);
  if (shape) return Object.assign(out, blocked('AUTHORITY_VALIDATED', BLOCKER.UNEXPECTED_GITHUB_RESPONSE, shape));
  out.observedHead = pr.headRefOid || null;

  // --- idempotency: zaten merge edilmis (owner 3.8/B,C)
  if (pr.state === 'MERGED') {
    if (input.expectedMergeSha && pr.mergeCommitOid && pr.mergeCommitOid !== input.expectedMergeSha) {
      return Object.assign(out, blocked('MERGED', BLOCKER.MERGE_STATE_UNVERIFIED, 'merged with a different sha'));
    }
    out.mergeSha = pr.mergeCommitOid || null;
    out.stage = 'MERGED';
    return recoverAfterMerge(out, input, adapter);
  }

  // --- PR identity (owner 3.4/2-6)
  const ms = checkMergeState(pr);
  if (pr.state !== 'OPEN') return Object.assign(out, blocked('PR_IDENTITY_VALIDATED', BLOCKER.PR_NOT_OPEN, pr.state));
  if (input.targetBranch && pr.baseRefName !== input.targetBranch) {
    return Object.assign(out, blocked('PR_IDENTITY_VALIDATED', BLOCKER.TARGET_BRANCH_UNEXPECTED, pr.baseRefName));
  }
  if (out.ledgerSchemaVersion === mergeAuthorityLedger.SCHEMA_VERSION) {
    if (pr.number !== input.pr) {
      return Object.assign(out, blocked('PR_IDENTITY_VALIDATED', BLOCKER.MERGE_AUTHORITY_PR_MISMATCH, String(pr.number)));
    }
    if (pr.baseRefOid !== ledgerEntry.authorizedBaseSha) {
      return Object.assign(out, blocked('PR_IDENTITY_VALIDATED', BLOCKER.AUTHORIZED_BASE_MISMATCH, String(pr.baseRefOid)));
    }
    const currentBase = await adapter.currentBaseHead(input.targetBranch || pr.baseRefName);
    if (currentBase !== ledgerEntry.authorizedBaseSha) {
      return Object.assign(out, blocked('PR_IDENTITY_VALIDATED', BLOCKER.AUTHORIZED_BASE_MISMATCH, String(currentBase)));
    }
    if (pr.headRefName !== ledgerEntry.taskBranch) {
      return Object.assign(out, blocked('PR_IDENTITY_VALIDATED', BLOCKER.MERGE_AUTHORITY_PR_MISMATCH, String(pr.headRefName)));
    }
  }
  if (pr.headRefOid !== input.expectedHead) {
    return Object.assign(out, blocked('PR_IDENTITY_VALIDATED', BLOCKER.PR_HEAD_MISMATCH, pr.headRefOid));
  }
  const remoteHead = await adapter.remoteBranchHead(input.branch || pr.headRefName);
  if (remoteHead && remoteHead !== input.expectedHead) {
    return Object.assign(out, blocked('PR_IDENTITY_VALIDATED', BLOCKER.REMOTE_HEAD_MISMATCH, remoteHead));
  }
  if (input.worktree) {
    const localHead = await adapter.localHead(input.worktree);
    if (localHead && localHead !== input.expectedHead) {
      return Object.assign(out, blocked('PR_IDENTITY_VALIDATED', BLOCKER.LOCAL_HEAD_MISMATCH, localHead));
    }
  }
  out.stage = 'PR_IDENTITY_VALIDATED';

  // --- scope (owner 3.4/7)
  if (out.ledgerSchemaVersion === mergeAuthorityLedger.SCHEMA_VERSION) {
    const observedScope = await adapter.changedScope(ledgerEntry.authorizedBaseSha, ledgerEntry.authorizedHeadSha);
    if (!mergeAuthorityLedger.sameScope(observedScope, ledgerEntry.allowlist)) {
      return Object.assign(out, blocked('SCOPE_VALIDATED', BLOCKER.AUTHORIZED_SCOPE_MISMATCH, 'git name-status differs from ledger'));
    }
    out.changedPaths = observedScope.map((entry) => entry.path);
  } else {
    out.changedPaths = await adapter.changedPaths(input.pr);
  }
  const sc = checkScope(out.changedPaths, input.allowedPaths);
  if (!sc.ok) {
    return Object.assign(out, blocked('SCOPE_VALIDATED', BLOCKER.CHANGED_PATH_SCOPE_FORBIDDEN, sc.outside.join(', ')));
  }
  out.stage = 'SCOPE_VALIDATED';

  // --- competing writer / owner WIP (owner 3.4/9-10)
  const collisions = await adapter.competingWriters(input.pr, out.changedPaths);
  if (collisions && collisions.length) {
    return Object.assign(out, blocked('SCOPE_VALIDATED', BLOCKER.COMPETING_WRITER_FOUND, collisions.join(', ')));
  }
  if (await adapter.ownerWipCollision()) {
    return Object.assign(out, blocked('SCOPE_VALIDATED', BLOCKER.OWNER_WIP_COLLISION, 'canonical root has owner WIP'));
  }

  // --- CI (owner 3.4/11-13, 3.5)
  const checks = await adapter.getChecks(input.pr);
  out.ci = checks.map((c) => ({ name: c.name, status: c.status, conclusion: c.conclusion }));
  let platformRequired;
  try {
    platformRequired = out.ledgerSchemaVersion === mergeAuthorityLedger.SCHEMA_VERSION
      && typeof adapter.discoverPlatformRequiredChecks === 'function'
      ? await adapter.discoverPlatformRequiredChecks(input.targetBranch || 'main')
      : await adapter.platformRequiredChecks();
  } catch (error) {
    return Object.assign(out, blocked('CI_TERMINAL', BLOCKER.REQUIRED_CHECKS_BINDING_MISMATCH, error && error.message));
  }
  if (out.ledgerSchemaVersion === mergeAuthorityLedger.SCHEMA_VERSION) {
    const ledgerRequired = ledgerEntry.requiredChecks.map((entry) => entry.name);
    const currentRequired = [...new Set([
      ...(platformRequired || []),
      ...(input.governanceRequiredChecks || []),
      ...(input.requiredChecks || []),
    ])];
    if (!sameStringSetForCloseout(ledgerRequired, currentRequired)
      || ledgerEntry.requiredChecks.some((entry) => entry.checkedSha !== input.expectedHead || entry.conclusion !== 'SUCCESS')) {
      return Object.assign(out, blocked('CI_TERMINAL', BLOCKER.REQUIRED_CHECKS_BINDING_MISMATCH, 'required-check set or checked SHA differs'));
    }
  }
  const ci = classifyCi(checks, {
    taskSpecRequired: input.requiredChecks || [],
    platformRequired,
    governanceRequired: input.governanceRequiredChecks || [],
  });
  if (!ci.pass) return Object.assign(out, blocked('CI_TERMINAL', ci.code, ci.detail));
  out.stage = 'CI_TERMINAL';

  // --- merge gate (owner 3.4/14-15)
  if (!ms.ok) return Object.assign(out, blocked('MERGE_GATE_VALIDATED', ms.code, ms.detail));
  out.stage = 'MERGE_GATE_VALIDATED';

  if (out.dryRun) {
    return Object.assign(out, {
      status: 'DRY_RUN_ELIGIBLE',
      structuralEligibility: 'DRY_RUN_STRUCTURALLY_ELIGIBLE',
      liveAuthorityReadiness: out.liveAuthorityReadiness === 'READY' ? 'LIVE_AUTHORITY_READY' : 'LIVE_AUTHORITY_MISSING',
      blockerCode: null,
    });
  }

  // --- merge (owner 3.6): TOCTOU icin identity ve head son anda tekrar dogrulanir
  const fresh = await adapter.getPr(input.pr);
  const freshShape = validatePrShape(fresh);
  if (freshShape) {
    return Object.assign(out, blocked('MERGE_GATE_VALIDATED', BLOCKER.UNEXPECTED_GITHUB_RESPONSE, freshShape));
  }
  if (fresh.state !== 'OPEN') return Object.assign(out, blocked('MERGE_GATE_VALIDATED', BLOCKER.PR_NOT_OPEN, fresh.state));
  if (fresh.headRefOid !== input.expectedHead) {
    return Object.assign(out, blocked('MERGE_GATE_VALIDATED', BLOCKER.PR_HEAD_MISMATCH, fresh.headRefOid));
  }
  const finalChecks = await adapter.getChecks(input.pr);
  const finalCi = classifyCi(finalChecks, {
    taskSpecRequired: input.requiredChecks || [],
    platformRequired,
    governanceRequired: input.governanceRequiredChecks || [],
  });
  if (!finalCi.pass) {
    return Object.assign(out, blocked('MERGE_GATE_VALIDATED', finalCi.code, finalCi.detail));
  }
  out.ci = finalChecks.map((check) => ({
    name: check.name,
    status: check.status,
    conclusion: check.conclusion,
  }));
  let merged;
  try {
    merged = await adapter.squashMerge(input.pr);
    out.mergePerformedBy = 'LIVE_RUNNER';
  } catch (e) {
    return Object.assign(out, blocked('MERGE_GATE_VALIDATED', BLOCKER.MERGE_FAILED, e && e.message));
  }
  const after = await adapter.getPr(input.pr);
  const afterShape = validatePrShape(after);
  if (afterShape) {
    return Object.assign(out, blocked('MERGED', BLOCKER.UNEXPECTED_GITHUB_RESPONSE, afterShape));
  }
  if (after.state !== 'MERGED' || !after.mergeCommitOid) {
    return Object.assign(out, blocked('MERGED', BLOCKER.MERGE_STATE_UNVERIFIED, String(after.state)));
  }
  out.mergeSha = after.mergeCommitOid;
  out.stage = 'MERGED';
  return recoverAfterMerge(out, input, adapter);
}

/**
 * Merge sonrasi zincir. Owner 3.3: merge gerceklestikten sonra cleanup
 * basarisiz olursa merge GERI ALINMAZ; MERGED_CLEANUP_BLOCKED raporlanir.
 */
async function recoverAfterMerge(out, input, adapter) {
  try {
    const sync = await adapter.syncMain();
    out.mainSha = sync.mainSha;
    out.aheadBehind = sync.aheadBehind;
    if (sync.aheadBehind !== '0/0') {
      return Object.assign(out, { status: 'MERGED_CLEANUP_BLOCKED', stage: 'MAIN_SYNCED', blockerCode: BLOCKER.MAIN_SYNC_FAILED });
    }
    if (out.mergeSha && !(await adapter.isAncestor(out.mergeSha))) {
      return Object.assign(out, { status: 'MERGED_CLEANUP_BLOCKED', stage: 'MAIN_SYNCED', blockerCode: BLOCKER.MERGE_STATE_UNVERIFIED });
    }
    out.stage = 'MAIN_SYNCED';

    // Consumption immediately follows verified merge/main ancestry and happens
    // before cleanup. A v2 ledger must become CONSUMED exactly once; a failed
    // atomic write is a terminal post-merge residual, never a silent CLOSE.
    if (typeof adapter.consumeAuthority === 'function') {
      try {
        out.authorityConsumed = await adapter.consumeAuthority(input.authorityRef, {
          taskId: input.taskId,
          pr: input.pr,
          expectedHead: input.expectedHead,
          mergeSha: out.mergeSha,
        });
      } catch (error) {
        return Object.assign(out, {
          status: 'MERGED_CLEANUP_BLOCKED',
          blockerCode: BLOCKER.MERGE_SUCCEEDED_LEDGER_CONSUMPTION_FAILED,
          detail: redact((error && (error.code || error.message)) || 'ledger consumption failed'),
        });
      }
      if (out.authorityConsumed === 'CONSUMED') out.ledgerFinalStatus = 'CONSUMED';
      if (out.ledgerSchemaVersion === mergeAuthorityLedger.SCHEMA_VERSION && out.authorityConsumed !== 'CONSUMED') {
        return Object.assign(out, {
          status: 'MERGED_CLEANUP_BLOCKED',
          blockerCode: BLOCKER.MERGE_SUCCEEDED_LEDGER_CONSUMPTION_FAILED,
          detail: String(out.authorityConsumed),
        });
      }
      if (out.authorityConsumed === 'CONSUMED') out.stage = 'LEDGER_CONSUMED';
    }

    // Worktree ONCE kaldirilir: worktree bir branch'i checkout tutarken
    // `git branch -D` calismaz. Pilot bunu ortaya cikardi — branch cleanup once
    // kosuyor, sessizce basarisiz oluyor ve yine de DELETED raporluyordu.
    out.worktreeCleanup = input.worktree ? await adapter.cleanupWorktree(input.worktree) : 'NOT_APPLICABLE';
    if (out.worktreeCleanup === 'ORPHANED_WORKTREE_DIR') {
      return Object.assign(out, { status: 'MERGED_CLEANUP_BLOCKED', stage: 'WORKTREE_CLEANED', blockerCode: BLOCKER.WORKTREE_CLEANUP_FAILED });
    }
    out.stage = 'WORKTREE_CLEANED';

    out.branchCleanup = await adapter.cleanupBranch(input.branch);
    if (out.branchCleanup !== 'DELETED' && out.branchCleanup !== 'NOT_APPLICABLE') {
      return Object.assign(out, { status: 'MERGED_CLEANUP_BLOCKED', stage: 'BRANCH_CLEANED', blockerCode: BLOCKER.BRANCH_CLEANUP_FAILED });
    }
    out.stage = 'BRANCH_CLEANED';

    out.canonicalVerification = await adapter.verifyCanonical();
    if (out.canonicalVerification !== 'OK') {
      return Object.assign(out, { status: 'MERGED_CLEANUP_BLOCKED', stage: 'CANONICAL_VERIFIED', blockerCode: BLOCKER.CANONICAL_VERIFICATION_FAILED });
    }
    out.stage = 'CLOSED';
    return Object.assign(out, { status: 'CLOSED', blockerCode: null });
  } catch (e) {
    return Object.assign(out, {
      status: 'MERGED_CLEANUP_BLOCKED',
      blockerCode: (e && e.code) || BLOCKER.WORKTREE_CLEANUP_FAILED,
      detail: redact(e && e.message),
    });
  }
}

function sameStringSetForCloseout(left, right) {
  const a = [...new Set((left || []).map(String))].sort();
  const b = [...new Set((right || []).map(String))].sort();
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Owner 3.9: kisa insan-okunur ozet. */
function formatReport(r) {
  const lines = [
    'TASK        ' + r.taskId,
    'PR          #' + r.pr,
    'AUTHORITY   ' + r.authorityType + ' (' + r.authorityRef + ')',
    'STRUCTURAL  ' + (r.structuralEligibility || '-'),
    'LIVE AUTH   ' + (r.liveAuthorityReadiness || '-'),
    'LEDGER      schema ' + (r.ledgerSchemaVersion || '-'),
    'STATUS      ' + r.status,
    'STAGE       ' + r.stage,
    'HEAD        expected ' + r.expectedHead + ' / observed ' + (r.observedHead || '-'),
    'MERGE SHA   ' + (r.mergeSha || '-'),
    'MAIN        ' + (r.mainSha || '-') + '  ahead/behind ' + (r.aheadBehind || '-'),
    'BRANCH      ' + (r.branchCleanup || '-'),
    'WORKTREE    ' + (r.worktreeCleanup || '-'),
    'CANONICAL   ' + (r.canonicalVerification || '-'),
  ];
  if (r.blockerCode) lines.push('BLOCKER     ' + r.blockerCode + (r.detail ? ' — ' + r.detail : ''));
  return lines.join('\n');
}

module.exports = {
  AUTHORITY_TYPES,
  BLOCKER,
  CloseoutError,
  STAGES,
  checkAuthorityBinding,
  checkMergeState,
  checkScope,
  classifyCi,
  closeoutPr,
  formatReport,
  recoverAfterMerge,
  redact,
  validateInput,
  validatePrShape,
};
