#!/usr/bin/env node
'use strict';
/**
 * pnpm verify:live — what is actually delivered, right now, at this commit.
 *
 *   verify:live                          every capability the sealed mode covers
 *   verify:live --mode pulse             only the fast, side-effect-free probes
 *   verify:live --capability <ID>        one capability
 *   verify:live --json                   the same panel, for a machine
 *   verify:live --evidence-dir <dir>     persist the panel
 *
 * Exit codes are the contract, not the text:
 *
 *   0  every selected capability matched its declared target
 *   1  at least one did not — FAIL, STALE, UNWIRED, NOT_RUN or a mismatch
 *   2  the verifier itself could not run: bad manifest, missing probe, bad
 *      arguments. Distinct from 1 on purpose. "The system is broken" and "the
 *      instrument is broken" demand different responses, and a verifier that
 *      collapses them will eventually report a green system because it failed
 *      to look.
 *
 * What this command must never do is mutate the repository it is run in. Every
 * probe builds its own disposable world; PROBE_CERTIFY, which does touch the
 * real chain, is excluded from every mode this CLI can select.
 */

const path = require('path');

const manifestMod = require('./manifest.cjs');
const commandMod = require('./command.cjs');
const evidenceMod = require('./evidence.cjs');
const renderMod = require('./render.cjs');
const probesMod = require('./probes.cjs');
const fixtures = require('./fixtures.cjs');

const EXIT_OK = 0;
const EXIT_NOT_DELIVERED = 1;
const EXIT_VERIFIER_ERROR = 2;

class VerifierError extends Error {
  constructor(code, detail) {
    super(code + (detail ? ': ' + detail : ''));
    this.name = 'VerifierError';
    this.code = code;
    this.detail = detail || null;
  }
}

function parseArgs(argv) {
  const out = { mode: 'sealed', json: false, all: false, capability: null, evidenceDir: null, repo: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const take = () => {
      const v = argv[++i];
      if (v === undefined || v.indexOf('--') === 0) throw new VerifierError('ARG_MISSING_VALUE', a);
      return v;
    };
    if (a === '--mode') out.mode = take();
    else if (a === '--capability') out.capability = take();
    else if (a === '--evidence-dir') out.evidenceDir = take();
    else if (a === '--repo') out.repo = take();
    // Post-merge verification passes the sha the merge actually produced. The
    // verdict then requires the evidence to have been taken AT that commit,
    // which is the difference between "this worked somewhere" and "this works
    // in what was merged".
    else if (a === '--expected-merge-sha') out.expectedMergeSha = take();
    else if (a === '--json') out.json = true;
    else if (a === '--all') out.all = true;
    else if (a === '--help' || a === '-h') out.help = true;
    else throw new VerifierError('ARG_UNKNOWN', a);
  }
  if (!manifestMod.MODES[out.mode]) {
    throw new VerifierError('MODE_UNKNOWN', out.mode + ' (known: ' + Object.keys(manifestMod.MODES).join(', ') + ')');
  }
  return out;
}

const USAGE = [
  'verify:live — delivery verification through real public entrypoints',
  '',
  '  --mode pulse|sealed        which probe classes to run (default: sealed)',
  '  --capability <ID>          verify one capability',
  '  --all                      every capability in the selected mode (default)',
  '  --json                     machine-readable panel',
  '  --evidence-dir <dir>       write the panel as an evidence record',
  '  --repo <dir>               repository whose SHA the evidence binds to',
  '',
  'Exit 0 delivered · 1 not delivered · 2 verifier error.',
  '',
].join('\n');

/**
 * Run the selected capabilities and build the panel.
 *
 * A capability with no probe, or a probe whose declared identity disagrees with
 * the manifest, is a VERIFIER error rather than a failed capability: the system
 * was never asked the question, so reporting FAIL would be a claim the run did
 * not earn.
 */
async function verify(opts) {
  const repoCwd = opts.repo || path.resolve(__dirname, '..', '..', '..', '..');

  manifestMod.validateManifest();

  let selected;
  if (opts.capability) {
    const cap = manifestMod.capability(opts.capability);
    const modeClasses = manifestMod.MODES[opts.mode];
    if (modeClasses.indexOf(cap.probeClass) === -1) {
      throw new VerifierError(
        'CAPABILITY_NOT_IN_MODE',
        cap.capabilityId + ' is ' + cap.probeClass + '; mode ' + opts.mode + ' runs ' + modeClasses.join(', '),
      );
    }
    selected = [cap];
  } else {
    selected = manifestMod.selectForMode(opts.mode);
  }
  if (!selected.length) throw new VerifierError('NO_CAPABILITY_SELECTED', opts.mode);

  const state = evidenceMod.repoState(repoCwd);
  const startedPanel = new Date().toISOString();
  const records = [];

  for (const cap of selected) {
    const probe = probesMod.PROBES[cap.probeId];
    // Fail-closed, and as a verifier error: a manifest entry whose probe does
    // not exist is the manifest lying about what is checked.
    manifestMod.validateProbeDefinition(cap, probe);

    const startedAt = new Date().toISOString();
    // One recorder per capability. It collects what the probe actually
    // executed, so the evidence record's commandDigest describes the run rather
    // than the manifest's description of it — including the case where a probe
    // returned early and ran only two of its seven commands.
    const recorder = commandMod.createRecorder(probe.probeId, opts.mode, { repoRoot: repoCwd });
    let result;
    try {
      result = await probe.run({ timeoutMs: cap.contract.timeoutMs, repoCwd, recorder });
    } catch (e) {
      // An exception from the harness is not a verdict about the system. It is
      // reported as a failed capability with an infrastructure code so the
      // panel cannot silently shrink.
      result = {
        observedState: 'NOT_RUN',
        failureCode: 'DELIVERY_PROBE_INFRASTRUCTURE_ERROR',
        detail: String((e && e.code ? e.code + ': ' : '') + ((e && e.message) || e)).slice(0, 400),
        steps: [],
      };
    }
    const finishedAt = new Date().toISOString();
    records.push(
      evidenceMod.build({
        capability: cap,
        probe,
        result,
        repoState: state,
        startedAt,
        finishedAt,
        commandDigest: recorder.digest(),
        commandCount: recorder.count,
        expectedMergeSha: opts.expectedMergeSha || null,
        postMergeRun: !!opts.expectedMergeSha,
      }),
    );
  }

  return evidenceMod.summarize(records, {
    at: startedPanel,
    mode: opts.mode,
    verifiedAtSha: state.verifiedAtSha,
    sourceBranch: state.sourceBranch,
    dirtyTree: state.dirtyTree,
    expectedMergeSha: opts.expectedMergeSha || null,
    selected: selected.map((c) => c.capabilityId),
  });
}

async function main(argv) {
  let opts;
  try {
    opts = parseArgs(argv);
  } catch (e) {
    process.stderr.write((e.code || 'ARG_ERROR') + ': ' + (e.detail || e.message) + '\n\n' + USAGE);
    return EXIT_VERIFIER_ERROR;
  }
  if (opts.help) {
    process.stdout.write(USAGE);
    return EXIT_OK;
  }

  let panel;
  try {
    panel = await verify(opts);
  } catch (e) {
    process.stderr.write('VERIFIER ERROR\n  ' + (e.code || e.name || 'ERROR') + ': ' + (e.detail || e.message) + '\n');
    return EXIT_VERIFIER_ERROR;
  } finally {
    // Deterministic cleanup regardless of outcome. A residual temp directory is
    // reported, never fatal: failing the verification over a leaked fixture
    // would report the wrong thing entirely.
    const residual = fixtures.cleanup();
    if (residual.length && !opts.json) {
      process.stderr.write('note: ' + residual.length + ' fixture directory(ies) could not be removed\n');
    }
  }

  if (opts.evidenceDir) {
    const written = evidenceMod.write(opts.evidenceDir, panel);
    if (!opts.json) process.stdout.write('evidence written: ' + written + '\n\n');
  }

  process.stdout.write((opts.json ? renderMod.json(panel) : renderMod.panel(panel)) + '\n');
  return panel.overall === 'PASS' ? EXIT_OK : EXIT_NOT_DELIVERED;
}

if (require.main === module) {
  main(process.argv.slice(2)).then(
    (code) => {
      process.exitCode = code;
    },
    (e) => {
      process.stderr.write('VERIFIER ERROR\n  ' + String((e && e.stack) || e) + '\n');
      process.exitCode = EXIT_VERIFIER_ERROR;
    },
  );
}

module.exports = {
  EXIT_OK,
  EXIT_NOT_DELIVERED,
  EXIT_VERIFIER_ERROR,
  VerifierError,
  USAGE,
  parseArgs,
  verify,
  main,
};
