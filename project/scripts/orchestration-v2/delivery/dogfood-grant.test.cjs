'use strict';
/**
 * The DELIVERY_TRUTH standing grant, and the generator that produces it.
 *
 * These exist because of a specific mistake worth not repeating: the grant
 * shipped in #1744 with requiredIndependentReview false, admission refused R02
 * with INDEPENDENT_REVIEW_NOT_REQUIRED, and the cause was that an earlier fix
 * had been applied to the GENERATED json while the generator that rewrites it
 * still said false. The next regeneration silently undid the fix.
 *
 * So these tests exercise the GENERATOR, not just the committed file. A test
 * that only parsed the json would have passed on the day the defect was
 * introduced — the file was correct right up until it was regenerated.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const GENERATOR = path.join(__dirname, 'make-dogfood-authority.cjs');
const SCRIPTS_REL = 'project/scripts/orchestration-v2';
const GRANT_REL = 'project/docs/governance/coordination-v2/activation/STANDING-GRANT-DELIVERY-TRUTH-DOGFOOD-R01.json';
const REQUEST_REL = 'project/docs/governance/coordination-v2/requests/GOV-COORD-DTV-DOGFOOD-CERTIFICATION-R02.request.json';
const PLANS_REL = 'project/docs/governance/coordination-v2/task-plans/DOGFOOD-R02';
const SEMANTIC_REL = PLANS_REL + '/semantic-authority.md';
const PLAN_REL = PLANS_REL + '/plan.v2.json';

/**
 * The owner ratification sentence the eligibility authority quotes. A torn read
 * of semantic-authority.md is precisely a read in which this cannot be found.
 */
const NEEDLE = 'OWNER-DECISION-GOV-COORD-DELIVERY-TRUTH-R01 dogfood certification is authorized to run';

const readGrant = () => JSON.parse(fs.readFileSync(path.join(REPO_ROOT, GRANT_REL), 'utf8'));

const dirs = [];
function tmpdir() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'gov-dogfood-'));
  dirs.push(d);
  return d;
}

/** Every file under a root, as sorted forward-slash relative paths. */
function walkFiles(root) {
  const out = [];
  const stack = [''];
  while (stack.length) {
    const rel = stack.pop();
    for (const e of fs.readdirSync(rel ? path.join(root, rel) : root, { withFileTypes: true })) {
      const child = rel ? rel + '/' + e.name : e.name;
      if (e.isDirectory()) stack.push(child);
      else out.push(child);
    }
  }
  return out.sort();
}

function generateInto(root) {
  const run = spawnSync(process.execPath, [GENERATOR, '--out-root', root], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    timeout: 120000,
  });
  assert.equal(run.status, 0, run.stderr);
  return root;
}

/** How long the torn-read watcher runs. Long enough for several regenerations. */
const WATCH_MS = 2500;

/**
 * The watcher, as a child process rather than an interval in this one: a
 * synchronous read loop is the only thing that can actually land inside a
 * two-syscall window, and it cannot share an event loop with the runs it is
 * watching.
 */
const READER_SRC = [
  "'use strict';",
  "const fs = require('fs');",
  'const [target, needle, ms] = process.argv.slice(2);',
  'const end = Date.now() + Number(ms);',
  'let reads = 0, torn = 0, first = null;',
  'while (Date.now() < end) {',
  '  let s;',
  '  try {',
  "    s = fs.readFileSync(target, 'utf8');",
  '  } catch (e) {',
  "    torn++; if (!first) first = 'unreadable:' + e.code; continue;",
  '  }',
  '  reads++;',
  "  if (s.length === 0) { torn++; if (!first) first = 'empty'; continue; }",
  "  if (s.indexOf(needle) === -1) { torn++; if (!first) first = 'partial:len=' + s.length; }",
  '}',
  'process.stdout.write(JSON.stringify({ reads, torn, first }));',
  '',
].join('\n');
test.after(() => {
  for (const d of dirs) {
    try {
      fs.rmSync(d, { recursive: true, force: true });
    } catch (e) {
      /* a temp dir that will not delete is not a test failure */
    }
  }
});

test('DG01  the committed DELIVERY_TRUTH grant requires independent review', () => {
  const g = readGrant();
  assert.equal(g.requiredIndependentReview, true, 'admission refuses this grant without it');
  // The narrowness that makes a task-bounded auto-merge grant safe at all.
  assert.equal(g.maxConcurrency, 1);
  assert.equal(g.mergePolicy.method, 'SQUASH');
  assert.equal(g.mergePolicy.repositoryWideAutoMerge, false);
  assert.deepEqual(g.allowedExecutorLanes, ['CODEX_LOCAL']);
  assert.deepEqual(g.allowedPathRoots, ['project/scripts/orchestration-v2/delivery/']);
  assert.equal(g.ciPolicy.requireTerminalSuccess, true);
  assert.ok(g.revocationPath && g.killSwitchPath);
});

test('DG02  the GENERATOR emits it too, and regenerating is a no-op', () => {
  // The one that would have caught #1744. Run the real generator and compare
  // its output to what is committed — correcting the output while leaving the
  // generator wrong is a fix with a timer on it.
  //
  // It generates into a temporary root, because generating over the repository
  // made this test a WRITER of files other suites read. The generator truncates
  // task-plans/DOGFOOD-R02/semantic-authority.md, which is the owner-decision
  // evidence the DELIVERY_TRUTH override in program-eligibility-authority.json
  // cites; a parallel test verifying that record could read it mid-write and
  // fail with ELIGIBILITY_EXCERPT_NOT_FOUND. Writing the originals back at the
  // end never fixed that — the exposure is during the run, not after it.
  //
  // Nothing weakens: the generator is still the real one, and its output is
  // still compared byte-for-byte against the committed file.
  const out = tmpdir();
  const generate = () => {
    const run = spawnSync(process.execPath, [GENERATOR, '--out-root', out], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      timeout: 120000,
    });
    assert.equal(run.status, 0, run.stderr);
    return fs.readFileSync(path.join(out, GRANT_REL), 'utf8');
  };

  const generated = generate();
  assert.equal(JSON.parse(generated).requiredIndependentReview, true, 'the generator source still says false');
  assert.equal(
    generated,
    fs.readFileSync(path.join(REPO_ROOT, GRANT_REL), 'utf8'),
    'committed standing grant is not what the generator produces',
  );
  assert.equal(generate(), generated, 'regeneration is not idempotent');
});

test('DG02b the generator does not write into the repository it is verified against', () => {
  // The property the redirect buys, asserted rather than assumed. A future edit
  // that reintroduces a repository write would put the flake back, and this is
  // the test that would say so instead of a once-in-a-suite failure elsewhere.
  const watched = [
    GRANT_REL,
    REQUEST_REL,
    'project/docs/governance/coordination-v2/task-plans/DOGFOOD-R02/semantic-authority.md',
    'project/docs/governance/coordination-v2/task-plans/DOGFOOD-R02/plan.v2.json',
  ];
  const stamp = () =>
    watched.map((rel) => {
      const s = fs.statSync(path.join(REPO_ROOT, rel));
      return rel + ':' + s.size + ':' + s.mtimeMs;
    });

  const before = stamp();
  const run = spawnSync(process.execPath, [GENERATOR, '--out-root', tmpdir()], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    timeout: 120000,
  });
  assert.equal(run.status, 0, run.stderr);
  assert.deepEqual(stamp(), before, 'the generator touched the shared working tree');
});

// ───────────────────────────────────────── THE LIVE OPERATOR PATH (atomicity)
//
// Moving the TEST off the working tree fixed the test. It did not fix the
// documented operator command, which still has to write into the repository —
// that is its job. What follows is about that path: an operator regenerating the
// chain must never make the owner's evidence briefly unreadable for whatever
// else is running in the same tree.

test('DG02c a reader watching the generated evidence never sees it torn', async () => {
  // The property the atomic write buys, MEASURED rather than asserted in prose.
  // Against the truncating writer this same loop observed the file empty on
  // roughly seven reads in ten while the generator ran, and every one of those
  // is an ELIGIBILITY_EXCERPT_NOT_FOUND for whoever is verifying the eligibility
  // authority at that moment.
  const out = generateInto(tmpdir());
  const target = path.join(out, SEMANTIC_REL);
  assert.ok(fs.readFileSync(target, 'utf8').indexOf(NEEDLE) !== -1, 'the needle is not in the generated evidence');

  const readerPath = path.join(out, 'reader.cjs');
  fs.writeFileSync(readerPath, READER_SRC, 'utf8');
  const reader = spawn(process.execPath, [readerPath, target, NEEDLE, String(WATCH_MS)], { cwd: out });
  let stdout = '';
  reader.stdout.on('data', (d) => { stdout += String(d); });

  let watching = true;
  const finished = new Promise((resolve) => reader.on('exit', resolve)).then(() => { watching = false; });

  let runs = 0;
  while (watching) {
    spawnSync(process.execPath, [GENERATOR, '--out-root', out], { cwd: REPO_ROOT, timeout: 120000 });
    runs++;
    // spawnSync blocks the loop; yield so the reader's exit can land.
    await new Promise((r) => setImmediate(r));
  }
  await finished;

  const v = JSON.parse(stdout);
  assert.ok(runs >= 3, 'the generator only ran ' + runs + ' times — no real pressure was applied');
  assert.ok(v.reads > 100, 'the reader only managed ' + v.reads + ' reads');
  assert.equal(v.torn, 0, v.torn + ' torn reads out of ' + v.reads + ', first: ' + v.first);
});

test('DG02d a failed write leaves no residue and does not half-produce the chain', () => {
  const out = generateInto(tmpdir());
  const snapshot = walkFiles(out).map((rel) => [rel, fs.readFileSync(path.join(out, rel))]);

  // Force a failure at the RENAME step — after the temp file exists, which is
  // the only moment cleanup has anything to do. Renaming a file onto a directory
  // fails on Windows and on POSIX alike, so the trigger needs no seam in the
  // generator. semantic-authority.md is written third, so the run gets far
  // enough to have produced real output before it dies.
  fs.rmSync(path.join(out, SEMANTIC_REL));
  fs.mkdirSync(path.join(out, SEMANTIC_REL));

  const run = spawnSync(process.execPath, [GENERATOR, '--out-root', out], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    timeout: 120000,
  });
  assert.notEqual(run.status, 0, 'the generator reported success after a write it could not complete');

  // Nothing left behind. A stray .tmp inside a governance directory is exactly
  // the untracked file boundary.cjs refuses, discovered far from its cause.
  assert.deepEqual(walkFiles(out).filter((f) => f.endsWith('.tmp')), [], 'temp files survived a failed run');

  // Every other artefact is byte-identical: the ones written before the failure
  // were replaced with the same bytes, the ones after were never reached. A
  // partially regenerated authority chain is the thing that must not happen.
  for (const [rel, bytes] of snapshot) {
    if (rel === SEMANTIC_REL) continue;
    assert.equal(Buffer.compare(fs.readFileSync(path.join(out, rel)), bytes), 0, rel + ' changed during a failed run');
  }
});

test('DG02e the default operator command still works: --out-root is purely additive', () => {
  // Backward compatibility has to be proven on the NO-FLAG path, and proving it
  // by running the documented command here would write into the tracked tree —
  // the exact hazard this change removes. So the script is exercised at its own
  // default inside a copy of the scripts tree: __dirname resolves four levels
  // up to the copy's root, and the generator takes the branch an operator takes.
  const fake = tmpdir();
  fs.cpSync(path.join(REPO_ROOT, SCRIPTS_REL), path.join(fake, SCRIPTS_REL), { recursive: true });

  const run = spawnSync(process.execPath, [path.join(fake, SCRIPTS_REL, 'delivery/make-dogfood-authority.cjs')], {
    cwd: fake,
    encoding: 'utf8',
    timeout: 120000,
  });
  assert.equal(run.status, 0, run.stderr);

  // Same chain from both entry points. Only the time-invariant artefacts are
  // compared across runs: grant.v2.json carries a generated expiry, so equality
  // there would be a clock assertion rather than a compatibility one.
  const flagged = generateInto(tmpdir());
  for (const rel of [GRANT_REL, REQUEST_REL, SEMANTIC_REL, PLAN_REL]) {
    assert.equal(
      fs.readFileSync(path.join(fake, rel), 'utf8'),
      fs.readFileSync(path.join(flagged, rel), 'utf8'),
      rel + ' differs between the default path and --out-root',
    );
  }
  // And DG02's claim, restated on the branch an operator actually takes.
  assert.equal(
    fs.readFileSync(path.join(fake, GRANT_REL), 'utf8'),
    fs.readFileSync(path.join(REPO_ROOT, GRANT_REL), 'utf8'),
    'the default path does not produce the committed standing grant',
  );
});

test('DG03  a grant that does not require independent review is refused', () => {
  const authority = require('../orchestrator/authority.cjs');
  const g = readGrant();
  const spec = JSON.parse(
    fs.readFileSync(path.join(REPO_ROOT, 'project/docs/governance/coordination-v2/task-plans/DOGFOOD-R02/plan.v2.json'), 'utf8'),
  );
  const weakened = Object.assign({}, g, { requiredIndependentReview: false });
  assert.throws(
    () =>
      authority.validateAgainstStandingGrant({
        standingGrant: weakened,
        spec,
        taskClass: 'BOUNDED_CODE_FIX',
        executorLane: 'CODEX_LOCAL',
        revoked: false,
        killSwitchEngaged: false,
        nowMs: Date.now(),
      }),
    (e) => e.code === 'INDEPENDENT_REVIEW_NOT_REQUIRED',
    'the exact refusal that stopped R02',
  );
});

test('DG04  the committed R02 request is admissible against the corrected grant', () => {
  // End to end through the real resolver and the real admission gate, against
  // the files as committed. This is the condition PR 5 exists to restore.
  const requestMod = require('../service/request.cjs');
  const admissionMod = require('../orchestrator/admission.cjs');

  const resolved = requestMod.load({
    repoCwd: REPO_ROOT,
    requestPath: REQUEST_REL,
    // The committed-artefact regime is exercised by the artefact lifecycle
    // suite; here the subject is the grant, and requiring origin/main would
    // make this test fail on a branch for an unrelated reason.
    verifyArtefacts: false,
  });
  assert.equal(resolved.request.requireCommittedArtefacts, true, 'the request must still ask for committed artefacts');

  const verdict = admissionMod.evaluate({
    manifest: resolved.manifest,
    standingGrant: resolved.standingGrant,
    spec: resolved.spec,
    programId: resolved.request.programId,
    taskClass: resolved.request.taskClass,
    executorLane: resolved.request.executorLane,
    revoked: false,
    killSwitchEngaged: false,
    nowMs: Date.now(),
  });
  assert.equal(verdict.admissible, true, verdict.refusal + ' ' + (verdict.detail || ''));
  assert.equal(verdict.program, 'DELIVERY_TRUTH');
});
