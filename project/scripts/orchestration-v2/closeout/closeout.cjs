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
  'BRANCH_CLEANED',
  'WORKTREE_CLEANED',
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
  TARGET_BRANCH_UNEXPECTED: 'TARGET_BRANCH_UNEXPECTED',
  REPOSITORY_IDENTITY_MISMATCH: 'REPOSITORY_IDENTITY_MISMATCH',
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
  if (!ledgerEntry) return { ok: true };
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
    return { ok: true };
  }
  if (ledgerEntry.taskId && ledgerEntry.taskId !== input.taskId) {
    return { ok: false, code: BLOCKER.MERGE_AUTHORITY_TASK_MISMATCH, detail: 'ref bound to task ' + ledgerEntry.taskId };
  }
  if (ledgerEntry.pr != null && ledgerEntry.pr !== input.pr) {
    return { ok: false, code: BLOCKER.MERGE_AUTHORITY_PR_MISMATCH, detail: 'ref bound to PR #' + ledgerEntry.pr };
  }
  return { ok: true };
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
  const bind = checkAuthorityBinding(input, await adapter.authorityLedgerEntry(input.authorityRef));
  if (!bind.ok) return Object.assign(out, blocked('PREFLIGHT', bind.code, bind.detail));
  out.stage = 'AUTHORITY_VALIDATED';

  const pr = await adapter.getPr(input.pr);
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
  out.changedPaths = await adapter.changedPaths(input.pr);
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
  const ci = classifyCi(checks, {
    taskSpecRequired: input.requiredChecks || [],
    platformRequired: await adapter.platformRequiredChecks(),
    governanceRequired: input.governanceRequiredChecks || [],
  });
  if (!ci.pass) return Object.assign(out, blocked('CI_TERMINAL', ci.code, ci.detail));
  out.stage = 'CI_TERMINAL';

  // --- merge gate (owner 3.4/14-15)
  if (!ms.ok) return Object.assign(out, blocked('MERGE_GATE_VALIDATED', ms.code, ms.detail));
  out.stage = 'MERGE_GATE_VALIDATED';

  if (out.dryRun) {
    return Object.assign(out, { status: 'DRY_RUN_ELIGIBLE', blockerCode: null });
  }

  // --- merge (owner 3.6): TOCTOU icin identity ve head son anda tekrar dogrulanir
  const fresh = await adapter.getPr(input.pr);
  if (fresh.state !== 'OPEN') return Object.assign(out, blocked('MERGE_GATE_VALIDATED', BLOCKER.PR_NOT_OPEN, fresh.state));
  if (fresh.headRefOid !== input.expectedHead) {
    return Object.assign(out, blocked('MERGE_GATE_VALIDATED', BLOCKER.PR_HEAD_MISMATCH, fresh.headRefOid));
  }
  let merged;
  try {
    merged = await adapter.squashMerge(input.pr);
  } catch (e) {
    return Object.assign(out, blocked('MERGE_GATE_VALIDATED', BLOCKER.MERGE_FAILED, e && e.message));
  }
  const after = await adapter.getPr(input.pr);
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
    // Owner 3.2: ayni authority reference ikinci bir PR'da kullanilamaz. Kapanis
    // basarili oldugunda reference tuketilmis olarak kaydedilir; ledger yoksa
    // adapter no-op doner ve kapanis yine de gecerlidir.
    if (typeof adapter.consumeAuthority === 'function') {
      out.authorityConsumed = await adapter.consumeAuthority(input.authorityRef, {
        taskId: input.taskId,
        pr: input.pr,
        mergeSha: out.mergeSha,
      });
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

/** Owner 3.9: kisa insan-okunur ozet. */
function formatReport(r) {
  const lines = [
    'TASK        ' + r.taskId,
    'PR          #' + r.pr,
    'AUTHORITY   ' + r.authorityType + ' (' + r.authorityRef + ')',
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
};
