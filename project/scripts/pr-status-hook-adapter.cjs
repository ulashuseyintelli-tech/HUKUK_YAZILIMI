#!/usr/bin/env node
'use strict';

/**
 * REPOSITORY-WIDE-MERGE-FLOW-REMEDIATION-R01 — PR-A remediation
 *
 * The open-PR guard's full orchestration: GitHub queries, durable
 * attempts/snapshot state, disposition message parsing, the task-disposition
 * gate binding, and the block/allow decision loop.
 *
 * It carries NO classification rule of its own. Every disposition decision —
 * what a claim requires, whether an observed state is admissible for it —
 * comes from the taxonomy module installed beside this file in the same
 * bundle (`require('./taxonomy.cjs')`), never re-implemented here. This is
 * the boundary PR-A exists to draw: previously this orchestration and the
 * classification rules lived in one 530-line file, so the enforced rules and
 * the documented rules could drift silently.
 *
 * Bundle-local loading only: this file is always required from
 * `~/.claude/hooks/pr-status-bundles/<sourceCommit>/pr-status-hook-adapter.cjs`,
 * and it loads `./pr-status-taxonomy.cjs` relative to itself — the sibling
 * the installer placed in the same immutable, hash-verified directory, under
 * its own repository filename (the installer does not rename bundle
 * contents). It never resolves a repository working-tree path.
 *
 * Entry point: `run(payload)` — payload is the hook's stdin JSON, already
 * parsed by the caller (the launcher). Returns `{ decision: 'allow' | 'block',
 * reason?: string }`. The launcher writes this to stdout/exit code; this
 * module performs no process.exit of its own so it stays testable in-process.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const taxonomy = require(path.join(__dirname, 'pr-status-taxonomy.cjs'));

const MAX_ATTEMPTS = 4;
// UNCHANGED from the pre-PR-A hook: an activation must not stop reading a
// session's already-in-flight attempts/snapshot state, so the path and shape
// below are a compatibility contract, not an implementation detail.
const STATE_DIR = path.join(os.homedir(), '.claude', 'hooks', 'state');
const STATE_TTL_MS = 24 * 60 * 60 * 1000;

// `cwd` defaults to process.cwd() — correct for the real hook, which is a
// fresh process per stop event with cwd already set to the actual session
// directory by the harness. `run()` still threads payload.cwd through
// explicitly everywhere below so a caller that DOES supply one (tests, or
// any future invocation shape) gets consistent behaviour across every git/gh
// call, not just the disposition-gate binding.
function sh(cmd, args, cwd) {
  return execFileSync(cmd, args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
    timeout: 15000,
    maxBuffer: 8 * 1024 * 1024,
  });
}

function sweepStaleState() {
  try {
    for (const f of fs.readdirSync(STATE_DIR)) {
      const p = path.join(STATE_DIR, f);
      try {
        if (Date.now() - fs.statSync(p).mtimeMs > STATE_TTL_MS) fs.unlinkSync(p);
      } catch { /* ignore */ }
    }
  } catch { /* dir may not exist yet */ }
}

// --- disposition grammar ----------------------------------------------------
// One line per PR. The PR number and the token must be on the SAME line.
//   PR #1662: OTHER_SESSION — orchestrator/office-... — dokunma
//   PR #1663: MERGED — 168daec7 — main sync 0/0, worktree removed
function findDisposition(message, number) {
  const lines = String(message || '').split(/\r?\n/);
  const numRe = new RegExp(`#${number}(?![0-9])`);
  for (const line of lines) {
    if (!numRe.test(line)) continue;
    for (const t of taxonomy.TOKEN_NAMES) {
      if (new RegExp(`\\b${t}\\b`).test(line)) {
        return { token: t, line: line.trim() };
      }
    }
  }
  return null;
}

let ghPrImpl = (number) => {
  try {
    return JSON.parse(sh('gh', [
      'pr', 'view', String(number),
      '--json', 'number,state,mergedAt,mergeCommit,headRefOid,statusCheckRollup,mergeable',
    ]));
  } catch { return null; }
};
function ghPr(number) { return ghPrImpl(number); }

/**
 * Translate `gh pr view --json ...` into the taxonomy's observation shape.
 * Translation only — no rule lives here. `extra` carries fields `gh` cannot
 * supply (declared dependency, incident, review-state) that the caller (the
 * final assistant message, cross-checked elsewhere) provides.
 */
function toObservation(pr, extra) {
  const e = extra || {};
  return {
    state: pr && pr.state,
    merged: Boolean(pr && pr.mergedAt),
    statusCheckRollup: (pr && pr.statusCheckRollup) || [],
    mergeable: pr && pr.mergeable,
    lockedBranch: e.lockedBranch === true,
    dependencyOpen: e.dependencyOpen === true,
    dependencyRef: e.dependencyRef,
    incident: e.incident,
    changesRequested: e.changesRequested === true,
    ownerDecisionPending: e.ownerDecisionPending === true,
  };
}

/**
 * Verify one claimed disposition against live GitHub state. Delegates the
 * actual admissibility rule to `taxonomy.verifyClaim`; this function only
 * resolves `gh` state, extracts a same-file token-specific evidence
 * requirement that the taxonomy cannot check itself (a PR number, a
 * superseding reference, a required field's presence in free text), and
 * reports the taxonomy's verdict.
 *
 * @returns {null|string} null when acceptable, otherwise the mismatch.
 */
function verify(number, disp) {
  if (!disp) return `#${number}: disposition YOK`;

  const pr = ghPr(number);
  if (!pr && disp.token !== 'OTHER_SESSION' && disp.token !== 'WAITING_DEPENDENCY'
    && disp.token !== 'CHANGES_REQUIRED' && disp.token !== 'BLOCKED_EXACT') {
    return `#${number}: ${disp.token} denmis ama GitHub durumu okunamadi`;
  }

  // Evidence the taxonomy's pure verifyClaim cannot see: it is handed an
  // observation, not the free-text claim line. These same-file checks stay
  // here because they are about how the CLAIM is written, not about what
  // GitHub reports.
  if (disp.token === 'MERGED' && !/\b[0-9a-f]{7,40}\b/.test(disp.line)) {
    return `#${number}: MERGED denmis ama merge SHA yok`;
  }
  if (disp.token === 'CLOSED_SUPERSEDED') {
    const rest = disp.line
      .replace(new RegExp(`#${number}`), '')
      .replace(/CLOSED_SUPERSEDED/g, '');
    if (!/#\d+|[A-Z][A-Z0-9-]{5,}/.test(rest)) {
      return `#${number}: CLOSED_SUPERSEDED denmis ama yerine gecen PR/task yazilmamis`;
    }
  }
  let dependencyRef;
  if (disp.token === 'WAITING_DEPENDENCY') {
    const tail = disp.line.replace(/.*WAITING_DEPENDENCY/, '').trim();
    const prMatch = tail.match(/#\d+/);
    const taskMatch = tail.match(/[A-Z]{2,}[A-Z0-9-]{4,}/);
    if (!prMatch && !taskMatch) {
      return `#${number}: WAITING_DEPENDENCY denmis ama beklenen PR numarasi veya task ID yazilmamis`;
    }
    // Extracted so the taxonomy's own verifyClaim (which requires a
    // dependencyRef in the observation, not in free text) sees the same
    // reference this same-file check just confirmed is present.
    dependencyRef = (prMatch || taskMatch)[0];
  }
  if (disp.token === 'CHANGES_REQUIRED') {
    const tail = disp.line.replace(/.*CHANGES_REQUIRED/, '').trim();
    if (tail.replace(/[^A-Za-zÇĞİÖŞÜçğıöşü0-9]/g, '').length < 25) {
      return `#${number}: CHANGES_REQUIRED denmis ama hangi degisiklikler istendigi yazilmamis`;
    }
  }
  if (disp.token === 'CI_FIX_REQUIRED') {
    const tail = disp.line.replace(/.*CI_FIX_REQUIRED/, '').trim();
    if (tail.replace(/[^A-Za-zÇĞİÖŞÜçğıöşü0-9]/g, '').length < 20) {
      return `#${number}: CI_FIX_REQUIRED denmis ama hangi check ve neden yazilmamis`;
    }
  }
  if (disp.token === 'BLOCKED_EXACT') {
    const tail = disp.line.replace(/.*BLOCKED_EXACT/, '').trim();
    if (tail.replace(/[^A-Za-zÇĞİÖŞÜçğıöşü0-9]/g, '').length < 30) {
      return `#${number}: BLOCKED_EXACT denmis ama blocker/next-action yeterince yazilmamis`;
    }
  }

  if (disp.token === 'OTHER_SESSION') return null; // ownership unprovable from GitHub alone

  const observed = toObservation(pr, { dependencyRef });
  const mismatch = taxonomy.verifyClaim(disp.token, observed);
  if (mismatch) return `DISPOSITION_MISMATCH #${number}: ${mismatch}`;
  return null;
}

function grammarHelp(prs) {
  const lines = taxonomy.TOKEN_NAMES.map((t) => `  PR #N: ${t} — ...`);
  return [
    'Her acik PR icin AYNI SATIRDA PR numarasi + su token\'lardan biri:',
    '',
    ...lines,
    '',
    'BLOCKED_EXACT DAR bir tokendir. Yalnizca: '
      + taxonomy.BLOCKED_EXACT_ADMISSIBLE_CAUSES.join(', ') + '.',
    '',
    'TUM tokenlar GitHub state ile CAPRAZ DOGRULANIR. Yazdigin metin tek basina',
    'gerceklik kaynagi degildir.',
    '',
    'Acik PR\'lar:',
    ...prs.map((p) => `  #${p.number}  ${p.headRefName}  —  ${p.title}`),
  ].join('\n');
}

// --- task disposition gate --------------------------------------------------
// Closed candidate list — the gate can only ever load repository-owned code,
// resolved relative to the git root of the CWD the hook fires in. Unchanged
// from the pre-PR-A hook: this piece already delegated correctly.
const GUARD_CANDIDATES = Object.freeze([
  ['project', 'scripts', 'governance', 'task-disposition-guard.cjs'],
  ['scripts', 'governance', 'task-disposition-guard.cjs'],
]);

function gitRoot(cwd) {
  try {
    const root = sh('git', ['-C', cwd, 'rev-parse', '--show-toplevel']).trim();
    return root || null;
  } catch { return null; }
}

function resolveDispositionGuard(root) {
  for (const parts of GUARD_CANDIDATES) {
    const candidate = path.resolve(root, ...parts);
    const rel = path.relative(root, candidate);
    if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) continue;
    try {
      if (fs.statSync(candidate).isFile()) return candidate;
    } catch { /* try next candidate */ }
  }
  return null;
}

function dispositionGate(payload, notices) {
  const cwd = (typeof payload.cwd === 'string' && payload.cwd) ? payload.cwd : process.cwd();
  const root = gitRoot(cwd);
  if (!root) return null;

  const guardPath = resolveDispositionGuard(root);
  if (!guardPath) {
    notices.push(
      'TASK_DISPOSITION_GATE: INACTIVE — task-disposition-guard.cjs bu depoda yok '
      + `(aranan: ${GUARD_CANDIDATES.map((c) => c.join('/')).join(' , ')} @ ${root}). `
      + 'Final disposition DOGRULANMADI.',
    );
    return null;
  }

  let guard;
  try {
    guard = require(guardPath);
    if (typeof guard.validateFinalMessage !== 'function' || typeof guard.formatReport !== 'function') {
      throw new Error('beklenen API yok (validateFinalMessage / formatReport)');
    }
  } catch (e) {
    return `TASK_DISPOSITION_GATE: GUARD YUKLENEMEDI — kapi olu, kapanis kabul edilmiyor.\n`
      + `  path : ${guardPath}\n  hata : ${(e && e.message) || e}\n\n`
      + 'Once guard onarilir, sonra tur kapatilir.';
  }

  let result;
  try {
    result = guard.validateFinalMessage(payload.last_assistant_message || '');
  } catch (e) {
    return `TASK_DISPOSITION_GATE: GUARD CALISIRKEN HATA VERDI — kapanis kabul edilmiyor.\n`
      + `  path : ${guardPath}\n  hata : ${(e && e.message) || e}`;
  }

  if (result && result.valid) return null;
  return `${guard.formatReport(result)}\n\n`
    + 'Task revision, task termination degildir. Implementation design, test design,\n'
    + 'validation yaklasimi veya conflict icermeyen base revision superseded oldugunda;\n'
    + 'task identity, semantic outcome ve primary ownership degismemisse WIP korunur,\n'
    + 'mevcut diff yeniden degerlendirilir ve yurutme ayni task altinda yeni revision\n'
    + 'ile devam eder. Gercek owner karari gerekiyorsa BLOCKED_OWNER_DECISION ile ve\n'
    + 'tam alanlariyla raporla.';
}

/**
 * @param {object} payload hook stdin, already JSON-parsed
 * @returns {{decision: 'allow'|'block', reason?: string}}
 */
function run(payload) {
  const notices = [];
  const cwd = (payload && typeof payload.cwd === 'string' && payload.cwd) ? payload.cwd : process.cwd();

  const gateBlock = dispositionGate(payload || {}, notices);
  if (gateBlock) return { decision: 'block', reason: gateBlock };

  try { sh('git', ['rev-parse', '--git-dir'], cwd); } catch {
    return notices.length ? { decision: 'allow', notice: notices.join('\n') } : { decision: 'allow' };
  }

  let repo;
  try {
    repo = JSON.parse(sh('gh', ['repo', 'view', '--json', 'nameWithOwner'], cwd)).nameWithOwner;
  } catch {
    return notices.length ? { decision: 'allow', notice: notices.join('\n') } : { decision: 'allow' };
  }

  let open;
  try {
    open = JSON.parse(sh('gh', [
      'pr', 'list', '--state', 'open', '--limit', '30',
      '--json', 'number,headRefName,title,headRefOid',
    ], cwd));
  } catch {
    return notices.length ? { decision: 'allow', notice: notices.join('\n') } : { decision: 'allow' };
  }

  sweepStaleState();

  const sessionId = (payload && payload.session_id) || 'unknown-session';
  const key = `${sessionId}__${repo.replace(/[^\w.-]/g, '_')}.json`;
  const statePath = path.join(STATE_DIR, key);

  const finish = (decision, reason) => {
    const full = notices.length && reason ? `${notices.join('\n')}\n\n${reason}`
      : notices.length ? notices.join('\n') : reason;
    return full === undefined ? { decision } : { decision, reason: full };
  };

  if (!open.length) {
    try { fs.unlinkSync(statePath); } catch { /* ignore */ }
    return finish('allow');
  }

  let state = null;
  try { state = JSON.parse(fs.readFileSync(statePath, 'utf8')); } catch { /* none, or unreadable/corrupt — treated as none */ }

  const snapshot = open.map((p) => ({ number: p.number, headRefOid: p.headRefOid }));
  const snapKey = (s) => s.map((x) => `${x.number}@${x.headRefOid}`).sort().join(',');

  const writeState = (attempts) => {
    try {
      fs.mkdirSync(STATE_DIR, { recursive: true });
      fs.writeFileSync(statePath, JSON.stringify({
        repo, sessionId, observedAt: new Date().toISOString(), attempts, snapshot,
      }, null, 2));
    } catch { /* ignore */ }
  };

  if (!state || !Array.isArray(state.snapshot)) {
    writeState(1);
    return finish('block', `Bu depoda ACIK pull request var — turu bitirmeden once her birinin akibetini yaz.\n\n${grammarHelp(open)}`);
  }

  if (snapKey(state.snapshot) !== snapKey(snapshot)) {
    writeState(1);
    return finish('block',
      'ACIK PR KUMESI DEGISTI (yeni PR acildi veya head SHA ilerledi).\n'
      + 'Onceki disposition\'lar artik gecerli degil; guncel liste icin yeniden yaz.\n\n'
      + grammarHelp(open));
  }

  const msg = (payload && payload.last_assistant_message) || '';
  const problems = [];
  for (const pr of open) {
    const p = verify(pr.number, findDisposition(msg, pr.number));
    if (p) problems.push('  ' + p);
  }

  if (!problems.length) {
    try { fs.unlinkSync(statePath); } catch { /* ignore */ }
    return finish('allow');
  }

  const attempts = (Number(state.attempts) || 1) + 1;
  if (attempts > MAX_ATTEMPTS) {
    try { fs.unlinkSync(statePath); } catch { /* ignore */ }
    return finish('block',
      `OPEN-PR-GUARD: ${MAX_ATTEMPTS} denemede disposition dogrulanamadi — kapi ACILIYOR.\n`
      + 'Bu bir gecis DEGIL, bir kayittir. Cozulmeyenler:\n\n'
      + problems.join('\n')
      + '\n\nKullaniciya bunu acikca soyle: guard dogrulayamadi ve sinir asildigi icin birakti.');
  }

  writeState(attempts);
  return finish('block',
    `DISPOSITION DOGRULANAMADI (deneme ${attempts}/${MAX_ATTEMPTS}):\n\n`
    + problems.join('\n')
    + '\n\n'
    + grammarHelp(open));
}

module.exports = {
  run,
  findDisposition,
  toObservation,
  verify,
  MAX_ATTEMPTS,
  STATE_DIR,
  GUARD_CANDIDATES,
  resolveDispositionGuard,
  __setGhPr: (fn) => { ghPrImpl = fn; },
};
