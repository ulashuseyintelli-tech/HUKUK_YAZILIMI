'use strict';
/**
 * Delivery evidence — an observation, pinned to the commit it was made at.
 *
 * The reason every record carries `verifiedAtSha` is that "it works" has no
 * meaning without one. A green run against last week's tree, or against a tree
 * with uncommitted edits in it, is not evidence that the merged code works; it
 * is evidence that SOMETHING worked once. Both of those are how a system ends
 * up believing it has a capability it does not have.
 *
 * So the record answers three questions, and refuses to be written unless it
 * can answer all three:
 *
 *   what was checked        capabilityId + probeId + probeDefinitionSha256
 *   what was found          targetState vs observedState -> verdict
 *   where it was found      verifiedAtSha + dirtyTree + sourceBranch
 *
 * `expectedMergeSha` is null until WP03, where post-merge verification fills it
 * and DONE requires the two SHAs to agree. Its presence here is not decoration:
 * the field exists from the first record so that legacy evidence is recognisably
 * legacy rather than silently missing a check that came later.
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const manifestMod = require('./manifest.cjs');

class EvidenceError extends Error {
  constructor(code, detail) {
    super(code + (detail ? ': ' + detail : ''));
    this.name = 'EvidenceError';
    this.code = code;
    this.detail = detail || null;
  }
}

/**
 * Where the verifier is standing: which commit, which branch, and — the one
 * people forget — whether the tree is clean.
 *
 * A dirty tree invalidates evidence outright. The whole claim is "the code at
 * this SHA does this"; uncommitted changes mean the thing observed is not the
 * thing at that SHA. Reported rather than thrown, so a developer running the
 * verifier mid-edit sees a STALE verdict explaining itself instead of a crash.
 */
function repoState(repoCwd) {
  const git = (args) => {
    try {
      return execFileSync('git', args, { cwd: repoCwd, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 }).trim();
    } catch (e) {
      return null;
    }
  };
  const sha = git(['rev-parse', 'HEAD']);
  const branch = git(['rev-parse', '--abbrev-ref', 'HEAD']);
  const status = git(['status', '--porcelain']);
  return {
    verifiedAtSha: sha,
    sourceBranch: branch,
    // Untracked files count. A probe file that exists only in the working tree
    // is exactly the kind of thing that makes a local run pass and CI fail.
    dirtyTree: status === null ? true : status.length > 0,
    dirtyPaths: status ? status.split('\n').slice(0, 20) : [],
  };
}

/**
 * The verdict, from the two states and nothing else.
 *
 * Written as one function because the comparison is the product. Every place
 * that re-derives "is this ok?" from its own reading of the states is a place
 * the definition can drift, and the definition drifting is how UNWIRED came to
 * be reported as OFF in the first place.
 */
function verdictFor(targetState, observedState, evidenceIsCurrent) {
  if (targetState === 'NOT_APPLICABLE' && observedState === 'NOT_APPLICABLE') return 'NOT_APPLICABLE';
  if (observedState === 'NOT_RUN') return 'FAIL';
  if (evidenceIsCurrent === false) return 'STALE';
  if (observedState === 'STALE') return 'STALE';
  return targetState === observedState ? 'PASS' : 'FAIL';
}

/**
 * Build one evidence record.
 *
 * Every required field is checked here rather than at the point of use, because
 * a half-populated evidence record is worse than none: it looks like a check
 * that ran.
 */
function build(o) {
  const cap = o.capability;
  const probe = o.probe;
  const result = o.result;
  const state = o.repoState;

  if (!cap || !probe || !result || !state) {
    throw new EvidenceError('EVIDENCE_INPUT_INCOMPLETE', 'capability, probe, result and repoState are all required');
  }
  if (manifestMod.OBSERVED_STATES.indexOf(result.observedState) === -1) {
    throw new EvidenceError('OBSERVED_STATE_UNKNOWN', String(result.observedState));
  }
  if (!state.verifiedAtSha || !/^[0-9a-f]{40}$/.test(state.verifiedAtSha)) {
    throw new EvidenceError('EVIDENCE_SHA_MISSING', String(state.verifiedAtSha));
  }

  // A dirty tree does not merely annotate the record, it decides the verdict:
  // whatever the probe saw, it did not see the code at that SHA.
  const current = state.dirtyTree !== true;
  const verdict = verdictFor(cap.targetState, result.observedState, current);

  const record = {
    schemaVersion: 1,
    capabilityId: cap.capabilityId,
    deliveryClass: cap.deliveryClass,
    probeId: probe.probeId,
    probeClass: probe.probeClass,
    // The digest of the FULL canonical contract — capability identity, target
    // state, probe identity, probe definition digest and public entrypoint —
    // not just the policy flags.
    //
    // It used to hash `cap.contract` alone, which meant three of the four
    // shipped capabilities produced the SAME digest: their flag blocks were
    // identical, so the value a grant would have pinned did not identify which
    // claim it was pinning. Changing the target state from OPERABLE to
    // WIRED_DISABLED left the digest untouched.
    deliveryContractSha256: manifestMod.contractDigest(cap, probe),
    probeDefinitionSha256: manifestMod.digest(probe.definition),
    targetState: cap.targetState,
    observedState: result.observedState,
    verdict,
    verifiedAtSha: state.verifiedAtSha,
    // Filled by post-merge verification in WP03. Null means "this evidence was
    // not taken at a merge commit", which is a fact, not an omission.
    expectedMergeSha: o.expectedMergeSha || null,
    sourceBranch: state.sourceBranch || null,
    dirtyTree: state.dirtyTree === true,
    startedAt: o.startedAt,
    finishedAt: o.finishedAt,
    durationMs: o.finishedAt && o.startedAt ? Date.parse(o.finishedAt) - Date.parse(o.startedAt) : null,
    // What was actually executed, canonicalized. Null only when the probe ran
    // nothing at all — an infrastructure error before the first command — and
    // that null is a fact worth keeping distinguishable from "it ran".
    commandDigest: o.commandDigest || null,
    commandCount: Number.isInteger(o.commandCount) ? o.commandCount : null,
    failureCode: result.failureCode || null,
    detail: result.detail ? String(result.detail).slice(0, 600) : null,
    steps: (result.steps || []).map((s) => ({ name: s.name, verdict: s.verdict, detail: s.detail })),
  };

  // The digest covers the record minus itself. Anything that would change what
  // the record CLAIMS changes the digest, which is what makes "the probe was
  // not weakened between the red run and the green run" checkable rather than
  // assertable.
  record.evidenceDigest = manifestMod.digest(record);
  return record;
}

/**
 * A panel-level record: the whole run, its capability records, and one overall
 * verdict.
 *
 * OVERALL is FAIL if any capability is anything other than PASS or a legitimate
 * NOT_APPLICABLE. Deliberately unforgiving — a summary that averages away one
 * red line is a summary that hides the only line worth reading.
 */
function summarize(records, meta) {
  const counts = { PASS: 0, FAIL: 0, STALE: 0, LEGACY_UNVERIFIED: 0, NOT_APPLICABLE: 0 };
  for (const r of records) counts[r.verdict] = (counts[r.verdict] || 0) + 1;
  const overall = records.every((r) => r.verdict === 'PASS' || r.verdict === 'NOT_APPLICABLE') ? 'PASS' : 'FAIL';
  const panel = {
    schemaVersion: 1,
    at: meta.at,
    mode: meta.mode,
    verifiedAtSha: meta.verifiedAtSha,
    sourceBranch: meta.sourceBranch,
    dirtyTree: meta.dirtyTree === true,
    expectedMergeSha: meta.expectedMergeSha || null,
    selected: meta.selected,
    counts,
    overall,
    capabilities: records,
  };
  panel.evidenceDigest = manifestMod.digest(panel);
  return panel;
}

/**
 * Persist a panel.
 *
 * The filename carries the SHA and the mode, because the question asked of an
 * evidence directory is always "what did this commit do?" and a directory of
 * timestamps cannot answer it.
 */
function write(dir, panel) {
  const name =
    'delivery-evidence-' + (panel.verifiedAtSha || 'unknown').slice(0, 12) + '-' + panel.mode + '.json';
  fs.mkdirSync(dir, { recursive: true });
  const p = path.join(dir, name);
  fs.writeFileSync(p, JSON.stringify(panel, null, 2) + '\n', 'utf8');
  return p;
}

/**
 * Is a stored panel still evidence for the tree we are standing in?
 *
 * Three ways to fail, and they are reported apart because they mean different
 * things: taken elsewhere, taken with edits pending, or taken by a probe that
 * has since changed.
 */
function isCurrent(panel, state, expectedProbeDigests) {
  if (!panel) return { current: false, reason: 'EVIDENCE_NOT_RUN' };
  if (panel.verifiedAtSha !== state.verifiedAtSha) return { current: false, reason: 'DELIVERY_SHA_MISMATCH' };
  if (panel.dirtyTree === true || state.dirtyTree === true) return { current: false, reason: 'DELIVERY_EVIDENCE_DIRTY_TREE' };
  if (expectedProbeDigests) {
    for (const rec of panel.capabilities || []) {
      const expected = expectedProbeDigests[rec.capabilityId];
      if (expected && expected !== rec.probeDefinitionSha256) {
        return { current: false, reason: 'DELIVERY_PROBE_DEFINITION_CHANGED', capabilityId: rec.capabilityId };
      }
    }
  }
  return { current: true, reason: null };
}

module.exports = {
  EvidenceError,
  repoState,
  verdictFor,
  build,
  summarize,
  write,
  isCurrent,
  sha256: (t) => crypto.createHash('sha256').update(t, 'utf8').digest('hex'),
};
