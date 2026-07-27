'use strict';
/**
 * Whether a change can affect what the system DOES — decided from the diff.
 *
 * NOT_APPLICABLE is the one delivery verdict that requires no probe, so it is
 * the one an author under time pressure will reach for. Every other way of
 * deciding it is an assertion:
 *
 *   declaredIntent    a sentence the author wrote about their own change
 *   task name         the same, shorter
 *   task profile      what KIND of task it is, not what it touched
 *   "it's docs-only"  true of the intent, not necessarily of the diff
 *
 * So this reads the validated diff and nothing else. The author does not get a
 * say, which is the point: an unverifiable claim that a change has no runtime
 * effect is exactly the shape of "merged means delivered".
 *
 * Docs-only is NOT automatically non-runtime. A CI manifest is a text file that
 * decides which tests execute; an authority record is a document that decides
 * what may run; a governance JSON is prose that the control plane reads. Each
 * changes behaviour without changing a line of application code.
 */

const path = require('path');

/**
 * Prefixes whose contents run, or decide what runs.
 *
 * Ordered roughly by how obvious they are, which is the reverse of how often
 * they are missed: the last four are the ones a reasonable person calls
 * "documentation".
 */
const RUNTIME_PREFIXES = [
  'project/apps/',
  'project/packages/',
  'project/prisma/',
  'project/scripts/',
  '.github/workflows/',
];

/**
 * Trees whose CONTENTS are read as configuration, whatever the file extension.
 *
 * Checked before the inert-extension exemption, and that order is the whole
 * point. A `.txt` in ci-manifests decides which specs CI executes; a `.md`
 * under coordination-v2 carries the authority marker the orchestrator greps
 * for. Both look like documentation to an extension test and neither is.
 *
 * Found by writing the exemption first and watching it classify a CI manifest
 * as inert.
 */
const CONTROL_PLANE_PREFIXES = [
  // Decides which specs CI executes. A line added here changes what is verified
  // on every future PR.
  'project/apps/api/ci-manifests/',
  // Read by the orchestrator at admission and dispatch: eligibility, standing
  // grants, kill switch, program manifest, authority records.
  'project/docs/governance/coordination-v2/',
  // Grant and execution-authority records the runner reads at the target tip.
  'project/docs/governance/coordination-execution-grants/',
  // The V1 control plane's own configuration.
  'project/docs/governance/governance-writer-coordination-',
];

/** Exact files that are executable configuration wherever they sit. */
const RUNTIME_EXACT = [
  'project/package.json',
  'project/pnpm-lock.yaml',
  'project/turbo.json',
  'project/tsconfig.json',
  'package.json',
  'AGENTS.md',
];

/** Extensions that are executable or executed-from, anywhere in the tree. */
const RUNTIME_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.cjs', '.mjs', '.sql', '.prisma', '.sh', '.ps1', '.yml', '.yaml'];

/**
 * Paths that are genuinely inert. An allowlist rather than "everything else",
 * because the default for an unrecognised path must be RUNTIME — a classifier
 * whose unknown case is "harmless" will eventually be handed something that
 * is not.
 */
const INERT_EXTENSIONS = ['.md', '.txt', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.pdf', '.csv'];

class RuntimeImpactError extends Error {
  constructor(code, detail) {
    super(code + (detail ? ': ' + detail : ''));
    this.name = 'RuntimeImpactError';
    this.code = code;
    this.detail = detail || null;
  }
}

function normalize(p) {
  return String(p).split('\\').join('/').replace(/^\.\//, '');
}

/**
 * Classify one path.
 *
 * @returns {{path: string, runtime: boolean, reason: string}}
 */
function classifyPath(raw) {
  const p = normalize(raw);
  const ext = path.extname(p).toLowerCase();

  if (RUNTIME_EXACT.indexOf(p) !== -1) return { path: p, runtime: true, reason: 'EXECUTABLE_CONFIGURATION' };

  // Control plane FIRST, so no extension can exempt it.
  for (const prefix of CONTROL_PLANE_PREFIXES) {
    if (p.indexOf(prefix) === 0) return { path: p, runtime: true, reason: 'CONTROL_PLANE:' + prefix };
  }

  for (const prefix of RUNTIME_PREFIXES) {
    if (p.indexOf(prefix) === 0) {
      // A markdown file beside the code it documents is still documentation.
      // This exemption is safe only because the control-plane trees were
      // already taken above.
      if (INERT_EXTENSIONS.indexOf(ext) !== -1) {
        return { path: p, runtime: false, reason: 'INERT_FILE_IN_RUNTIME_TREE' };
      }
      return { path: p, runtime: true, reason: 'RUNTIME_SURFACE:' + prefix };
    }
  }
  if (RUNTIME_EXTENSIONS.indexOf(ext) !== -1) return { path: p, runtime: true, reason: 'EXECUTABLE_EXTENSION:' + ext };
  if (INERT_EXTENSIONS.indexOf(ext) !== -1) return { path: p, runtime: false, reason: 'INERT_EXTENSION:' + ext };

  // Unknown. Fail towards runtime: a classifier whose unknown case is
  // "harmless" is a classifier that will one day be handed something that is
  // not, and the cost of being wrong in that direction is a probe that ran
  // unnecessarily.
  return { path: p, runtime: true, reason: 'UNCLASSIFIED_PATH' };
}

/**
 * Classify a whole diff.
 *
 * @param {Array<string|{path: string}>} changes  the VALIDATED diff, not a plan
 * @returns {{runtimeImpact: boolean, reasons: string[], classifiedPaths: object[]}}
 */
function classify(changes) {
  if (!Array.isArray(changes)) throw new RuntimeImpactError('RUNTIME_IMPACT_DIFF_INVALID', 'expected an array of changes');
  const classifiedPaths = changes.map((c) => classifyPath(typeof c === 'string' ? c : (c && c.path)));
  const runtime = classifiedPaths.filter((c) => c.runtime);
  return {
    // An empty diff is not proof of anything. A task that changed nothing did
    // not deliver anything either, and calling that NOT_APPLICABLE would let a
    // no-op close a chain.
    runtimeImpact: changes.length === 0 ? true : runtime.length > 0,
    reasons: changes.length === 0
      ? ['EMPTY_DIFF_IS_NOT_PROOF']
      : Array.from(new Set(runtime.map((c) => c.reason))),
    classifiedPaths,
  };
}

/**
 * May this task declare NOT_APPLICABLE?
 *
 * Throws rather than returning false: a caller that treated the answer as
 * advisory would be the whole problem again.
 */
function assertNotApplicableAllowed(changes) {
  const verdict = classify(changes);
  if (verdict.runtimeImpact) {
    throw new RuntimeImpactError(
      'DELIVERY_NOT_APPLICABLE_FOR_RUNTIME_DIFF',
      verdict.classifiedPaths.filter((c) => c.runtime).map((c) => c.path).slice(0, 8).join(', '),
    );
  }
  return verdict;
}

module.exports = {
  RUNTIME_PREFIXES,
  CONTROL_PLANE_PREFIXES,
  RUNTIME_EXACT,
  RUNTIME_EXTENSIONS,
  INERT_EXTENSIONS,
  RuntimeImpactError,
  classifyPath,
  classify,
  assertNotApplicableAllowed,
};
