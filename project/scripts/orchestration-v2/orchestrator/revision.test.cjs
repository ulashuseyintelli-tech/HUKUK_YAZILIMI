'use strict';

/**
 * GOV-TASK-REVISION-STATE-ENFORCEMENT-R01 — owner test matrisi (15 vaka).
 *
 * Matris owner task tanimindan birebir alinmistir; her vaka bir baslik olarak
 * durur ki bir tanesi dususe kimin dustugu belli olsun.
 *
 * CI: .github/workflows/gov-coord-v2-tests.yml
 *     (`scripts/orchestration-v2/*​/*.test.cjs` glob'u)
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');

const revision = require('./revision.cjs');
const state = require('./state.cjs');

const OK_BASE = {
  revisionId: 2,
  revisionOf: 1,
  supersededRevision: 1,
  revisionState: 'REVISION_PROPOSED',
  wipDisposition: 'PRESERVE',
  revisionReason: 'tasarim degisti',
  nextRequiredAction: 'mevcut diff yeni tasarima gore yeniden degerlendirilecek',
  driftReconciliation: 'NOT_REQUIRED',
};

const propose = (o) => Object.assign({}, OK_BASE, o || {});
const codes = (r) => r.violations.map((v) => v.code);

// --- 1 ----------------------------------------------------------------------
test('01 · implementation design revision kabul edilir', () => {
  const r = revision.validateRevision(propose({ supersededLayer: 'IMPLEMENTATION_DESIGN' }));
  assert.equal(r.valid, true, revision.formatViolations(r));
  assert.equal(r.classification, 'TASK_REVISION');
});

// --- 2 ----------------------------------------------------------------------
test('02 · test design revision kabul edilir', () => {
  const r = revision.validateRevision(propose({ supersededLayer: 'TEST_DESIGN' }));
  assert.equal(r.valid, true, revision.formatViolations(r));
  assert.equal(r.classification, 'TASK_REVISION');
});

// --- 3 ----------------------------------------------------------------------
test('03 · allowlist daralmasi revision olabilir', () => {
  const r = revision.validateRevision(propose({ supersededLayer: 'ALLOWLIST_NARROWED' }));
  assert.equal(r.valid, true, revision.formatViolations(r));
  assert.equal(r.classification, 'TASK_REVISION');
});

// --- 4 ----------------------------------------------------------------------
test('04 · allowlist genislemesi owner authority olmadan REDDEDILIR', () => {
  const r = revision.validateRevision(propose({ supersededLayer: 'ALLOWLIST_WIDENED' }));
  assert.equal(r.valid, false);
  assert.ok(codes(r).includes(revision.VIOLATION.ALLOWLIST_WIDENING_FORBIDDEN), codes(r).join(','));
  assert.equal(r.classification, 'NEW_AUTHORITY_REQUIRED');

  const withOwner = revision.validateRevision(
    propose({ supersededLayer: 'ALLOWLIST_WIDENED' }),
    null,
    { ownerAuthorityRef: 'OWNER-X-R01' },
  );
  assert.equal(withOwner.valid, true, revision.formatViolations(withOwner));
});

// --- 5 ----------------------------------------------------------------------
test('05 · conflict icermeyen base drift revision olur (reconciliation PASS)', () => {
  const r = revision.validateRevision(
    propose({ supersededLayer: 'BASE_REVISION', driftReconciliation: 'PASS' }),
  );
  assert.equal(r.valid, true, revision.formatViolations(r));
  assert.equal(r.classification, 'TASK_REVISION');
});

// --- 6 ----------------------------------------------------------------------
test('06 · conflictli base drift reconciliation PASS olmadan ACTIVE olamaz', () => {
  const r = revision.validateRevision(
    propose({
      supersededLayer: 'BASE_REVISION',
      revisionState: 'REVISION_ACTIVE',
      driftReconciliation: 'FAIL',
    }),
    { revisionId: 1, revisionState: 'REVISION_VALIDATED' },
  );
  assert.equal(r.valid, false);
  assert.ok(codes(r).includes(revision.VIOLATION.DRIFT_RECONCILIATION_REQUIRED), codes(r).join(','));
});

// --- 7 ----------------------------------------------------------------------
test('07 · ayni executor devam eder — handoff uretilmez', () => {
  const r = revision.validateRevision(propose({ supersededLayer: 'IMPLEMENTATION_DESIGN' }));
  assert.equal(r.valid, true);
  assert.notEqual(r.classification, 'EXECUTOR_HANDOFF');
});

// --- 8 ----------------------------------------------------------------------
test('08 · bounded capability executor degisikligi handoff SAYILMAZ', () => {
  // Bounded executor degisikligi supersededLayer uretmez; revision-eligible bir
  // katman altinda ilerler ve handoff talebi ile birlikte REDDEDILIR.
  const r = revision.validateRevision(
    propose({ supersededLayer: 'IMPLEMENTATION_DESIGN', handoffRequested: true }),
    null,
    { handoffGrantRef: 'GRANT-X' },
  );
  assert.equal(r.valid, false);
  assert.ok(codes(r).includes(revision.VIOLATION.HANDOFF_NOT_A_DISPOSITION), codes(r).join(','));
});

// --- 9 ----------------------------------------------------------------------
test('09 · primary executor handoff explicit grant ISTER', () => {
  const without = revision.validateRevision(propose({ supersededLayer: 'PRIMARY_OWNERSHIP' }));
  assert.equal(without.valid, false);
  assert.ok(codes(without).includes(revision.VIOLATION.HANDOFF_GRANT_REQUIRED));
  assert.equal(without.classification, 'EXECUTOR_HANDOFF');

  const withGrant = revision.validateRevision(
    propose({ supersededLayer: 'PRIMARY_OWNERSHIP' }),
    null,
    { handoffGrantRef: 'OWNER-HANDOFF-R01' },
  );
  assert.equal(withGrant.valid, true, revision.formatViolations(withGrant));
});

// --- 10 ---------------------------------------------------------------------
test('10 · semantic outcome degisikligi revision olarak REDDEDILIR', () => {
  const r = revision.validateRevision(propose({ supersededLayer: 'SEMANTIC_OUTCOME' }));
  assert.equal(r.valid, false);
  assert.ok(codes(r).includes(revision.VIOLATION.SEMANTIC_OUTCOME_CHANGE_FORBIDDEN));
  assert.equal(r.classification, 'NEW_TASK_OR_OWNER_DECISION');
});

// --- 11 ---------------------------------------------------------------------
test('11 · WIP disposition PRESERVE veya REEVALUATE olmalidir', () => {
  for (const wip of revision.WIP_DISPOSITIONS) {
    const ok = revision.validateRevision(
      propose({ supersededLayer: 'TEST_DESIGN', wipDisposition: wip }),
    );
    assert.equal(ok.valid, true, wip + ': ' + revision.formatViolations(ok));
  }
  for (const bad of ['DISCARD', 'RESET', '', null, undefined]) {
    const r = revision.validateRevision(
      propose({ supersededLayer: 'TEST_DESIGN', wipDisposition: bad }),
    );
    assert.equal(r.valid, false, String(bad));
    assert.ok(codes(r).includes(revision.VIOLATION.WIP_DISPOSITION_INVALID));
  }
});

// --- 12 ---------------------------------------------------------------------
test('12 · superseded revision overwrite EDILEMEZ', () => {
  const selfSupersede = revision.validateRevision(
    propose({ supersededLayer: 'TEST_DESIGN', supersededRevision: 2 }),
  );
  assert.equal(selfSupersede.valid, false);
  assert.ok(codes(selfSupersede).includes(revision.VIOLATION.SUPERSEDED_REVISION_OVERWRITE));

  const overwrite = revision.validateRevision(
    propose({ supersededLayer: 'TEST_DESIGN', overwritesRevision: 1 }),
  );
  assert.equal(overwrite.valid, false);
  assert.ok(codes(overwrite).includes(revision.VIOLATION.SUPERSEDED_REVISION_OVERWRITE));

  const backwards = revision.validateRevision(
    propose({ supersededLayer: 'TEST_DESIGN', revisionId: 2 }),
    { revisionId: 5, revisionState: 'CURRENT_REVISION' },
  );
  assert.equal(backwards.valid, false);
  assert.ok(codes(backwards).includes(revision.VIOLATION.REVISION_ID_NOT_MONOTONIC));
});

// --- 13 ---------------------------------------------------------------------
test('13 · gecersiz terminal disposition — revision-eligible degisiklik task\'i terminal ETMEZ', () => {
  const blocked = revision.assertTerminationAllowed({ supersededLayer: 'IMPLEMENTATION_DESIGN' });
  assert.equal(blocked.allowed, false);
  assert.equal(
    blocked.violations[0].code,
    revision.VIOLATION.TERMINATION_FORBIDDEN_REVISION_ELIGIBLE,
  );

  // Gercek termination sebepleri engellenmez.
  assert.equal(revision.assertTerminationAllowed({ supersededLayer: 'SEMANTIC_OUTCOME' }).allowed, true);
  assert.equal(revision.assertTerminationAllowed({ supersededLayer: 'PRIMARY_OWNERSHIP' }).allowed, true);
  assert.equal(
    revision.assertTerminationAllowed({ supersededLayer: 'TEST_DESIGN', taskIdentityChanged: true })
      .allowed,
    true,
  );
  assert.equal(revision.assertTerminationAllowed(null).allowed, true);
});

// --- 14 ---------------------------------------------------------------------
test('14 · direct-owner task exit gate ile uyumlu: handoff bir disposition DEGILDIR', () => {
  const req = revision.buildHandoffRequest({
    taskId: 'T1',
    fromExecutor: 'A',
    toExecutor: 'B',
    reason: 'platform siniri',
    exception: 2,
  });
  assert.equal(req.event, 'HANDOFF_REQUEST');
  assert.equal(req.ownerDecisionRequired, true);
  assert.equal(req.allowed, false);
  assert.equal(req.wipDisposition, 'PRESERVE');
  // Bir state adi DEGILDIR.
  assert.equal(state.STATES.indexOf('HANDOFF_REQUIRED'), -1);
  assert.equal(state.STATES.indexOf('SUPERSEDED'), -1);
  assert.equal(state.STATES.length, 14);

  const granted = revision.buildHandoffRequest({ taskId: 'T1', grantRef: 'OWNER-H-R01' });
  assert.equal(granted.allowed, true);
});

// --- 15 ---------------------------------------------------------------------
test('15 · backward compatibility: alan tasimayan mevcut kayitlar gecerlidir', () => {
  const legacy = revision.readRevisionView(null);
  assert.equal(legacy.revisionId, 1);
  assert.equal(legacy.supersededRevision, null);
  assert.equal(legacy.revisionState, 'CURRENT_REVISION');
  assert.equal(legacy.wipDisposition, 'PRESERVE');
  assert.equal(legacy.legacy, true);

  assert.equal(revision.readRevisionView({ payload: {} }).revisionId, 1);
  assert.equal(revision.readRevisionView({ taskRevision: { revisionId: 7 } }).revisionId, 7);
});

// --- state.cjs entegrasyonu -------------------------------------------------

function store(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'revstate-'));
  t.after(() => {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });
  return state.createStore(dir);
}

test('state.transition revision olmadan aynen calisir (regresyon)', (t) => {
  const s = store(t);
  const rec = s.transition({ taskId: 'T', to: 'DECLARED', expectedPreviousState: null });
  assert.equal(rec.state, 'DECLARED');
  assert.equal(rec.payload.taskRevision, undefined);
});

test('state.transition gecerli revision\'i kayda islar', (t) => {
  const s = store(t);
  s.transition({ taskId: 'T', to: 'DECLARED', expectedPreviousState: null });
  const rec = s.transition({
    taskId: 'T',
    to: 'AUTHORIZED',
    expectedPreviousState: 'DECLARED',
    writerIdentity: 'OWNER',
    revision: propose({ supersededLayer: 'IMPLEMENTATION_DESIGN' }),
  });
  assert.equal(rec.payload.taskRevision.revisionId, 2);
  assert.equal(revision.readRevisionView(rec.payload).supersededLayer, 'IMPLEMENTATION_DESIGN');
});

test('state.transition gecersiz revision\'i fail-closed reddeder', (t) => {
  const s = store(t);
  s.transition({ taskId: 'T', to: 'DECLARED', expectedPreviousState: null });
  assert.throws(
    () =>
      s.transition({
        taskId: 'T',
        to: 'AUTHORIZED',
        expectedPreviousState: 'DECLARED',
        writerIdentity: 'OWNER',
        revision: propose({ supersededLayer: 'TEST_DESIGN', wipDisposition: 'DISCARD' }),
      }),
    (e) => e.code === 'REVISION_INVALID',
  );
});

test('state.transition revision-eligible degisiklikte CANCELLED\'i reddeder', (t) => {
  const s = store(t);
  s.transition({ taskId: 'T', to: 'DECLARED', expectedPreviousState: null });
  assert.throws(
    () =>
      s.transition({
        taskId: 'T',
        to: 'CANCELLED',
        expectedPreviousState: 'DECLARED',
        writerIdentity: 'OWNER',
        revision: propose({ supersededLayer: 'IMPLEMENTATION_DESIGN' }),
      }),
    (e) => e.code === revision.VIOLATION.TERMINATION_FORBIDDEN_REVISION_ELIGIBLE,
  );

  // Gercek bir owner iptali engellenmez.
  const ok = s.transition({
    taskId: 'T',
    to: 'CANCELLED',
    expectedPreviousState: 'DECLARED',
    writerIdentity: 'OWNER',
  });
  assert.equal(ok.state, 'CANCELLED');
});

test('supersededLayer haritasi process-rules tablosuyla ayni sinifları uretir', () => {
  assert.deepEqual(Object.keys(revision.SUPERSEDED_LAYERS).sort(), [
    'ALLOWLIST_NARROWED',
    'ALLOWLIST_WIDENED',
    'BASE_REVISION',
    'CONTRACT_VERSION',
    'FORBIDDEN_SURFACE_ADDED',
    'IMPLEMENTATION_DESIGN',
    'PRIMARY_OWNERSHIP',
    'SEMANTIC_OUTCOME',
    'TEST_DESIGN',
    'VALIDATION_APPROACH',
  ]);
  for (const k of Object.keys(revision.SUPERSEDED_LAYERS)) {
    assert.ok(revision.CLASSIFICATIONS.includes(revision.SUPERSEDED_LAYERS[k]), k);
  }
});

test('revision ic event modeli dis lifecycle state\'lerini cogaltmaz', () => {
  for (const s of revision.REVISION_STATES) {
    assert.equal(state.STATES.indexOf(s), -1, s + ' dis state olmamali');
  }
  assert.equal(revision.REVISION_STATES.length, 4);
  assert.deepEqual(revision.REVISION_ALLOWED.REVISION_VALIDATED, ['REVISION_ACTIVE']);
});

test('askida revision birakilamaz: nextRequiredAction ve reason zorunlu', () => {
  const noAction = revision.validateRevision(
    propose({ supersededLayer: 'TEST_DESIGN', nextRequiredAction: '   ' }),
  );
  assert.equal(noAction.valid, false);
  assert.ok(codes(noAction).includes(revision.VIOLATION.NEXT_ACTION_REQUIRED));

  const noReason = revision.validateRevision(
    propose({ supersededLayer: 'TEST_DESIGN', revisionReason: '' }),
  );
  assert.equal(noReason.valid, false);
  assert.ok(codes(noReason).includes(revision.VIOLATION.REVISION_REASON_REQUIRED));
});

test('bilinmeyen supersededLayer ve revision state fail-closed', () => {
  const layer = revision.validateRevision(propose({ supersededLayer: 'WHATEVER' }));
  assert.equal(layer.valid, false);
  assert.ok(codes(layer).includes(revision.VIOLATION.SUPERSEDED_LAYER_UNKNOWN));

  const st = revision.validateRevision(
    propose({ supersededLayer: 'TEST_DESIGN', revisionState: 'REVISION_WHATEVER' }),
  );
  assert.equal(st.valid, false);
  assert.ok(codes(st).includes(revision.VIOLATION.REVISION_STATE_UNKNOWN));
});

test('revision ic gecisi atlanamaz: CURRENT -> ACTIVE reddedilir', () => {
  const r = revision.validateRevision(
    propose({ supersededLayer: 'TEST_DESIGN', revisionState: 'REVISION_ACTIVE' }),
    { revisionId: 1, revisionState: 'CURRENT_REVISION' },
  );
  assert.equal(r.valid, false);
  assert.ok(codes(r).includes(revision.VIOLATION.REVISION_TRANSITION_FORBIDDEN));
});
