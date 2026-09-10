/*
 * OFFICE A-07 — KAPANIS/RESTART KARAR YOLU + HUKUM TESTLERI (canliya HICBIR SEY yapilmaz)
 *
 * Test edilen kod URETIM KODUNUN KENDISIDIR (kopya DEGIL):
 *   docs/governance/office-delivery-r01/scripts/ow-service.js   decideCloseAction · closeFlagAndRecover · restartApiAndVerify
 *   docs/governance/office-delivery-r01/a07-owner-pack/a07-verdict.js   finalize
 * Canli G/C `io` parametresiyle SIMULE edilmis bir dunyaya baglanir: saat, bayrak dosyasi,
 * baslatici zinciri (host -> butunluk kapanisi -> pwsh -> node). PowerShell/HTTP/DB cagrilmaz.
 *
 * Senaryolar 2026-09-10 olayindan turetildi: butunluk kapanisi 50 698 ms surdu (task->node ~61 s);
 * 60 s butce "BASARISIZ" dedi ve KOR ikinci stop DEVAM EDEN baslatmayi oldurdu.
 */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const GOV = path.resolve(__dirname, '../../../docs/governance/office-delivery-r01');
const SVC = require(path.join(GOV, 'scripts/ow-service.js'));
const V = require(path.join(GOV, 'a07-owner-pack/a07-verdict.js'));

const BASE = 'http://sim.invalid/api';

/**
 * Simule dunya. `boot` = { integrityMs, nodeMs }: Start sonrasi host hemen belirir, butunluk
 * kapanisi integrityMs surer (pwsh o anda baslar = EnvFile o anda okunur), node nodeMs sonra
 * cevap verir. integrityMs = Infinity -> baslatma hic bitmez.
 */
function world({ flagOn = false, mtime, boot = { integrityMs: 400, nodeMs: 2000 }, init, onStart, flagVerdict = 'ACIK', setFlagThrows = false } = {}) {
  const w = {
    t: 10_000_000, flagOn, mtime: mtime ?? 9_000_000,
    host: 0, pwsh: 0, node: 0, launcherStart: null, answering: false, pid: null,
    bootAt: null, bootPid: null, nextPid: 500,
    calls: { stop: 0, start: 0, setFlag: 0 },
  };
  const tick = () => {
    if (w.bootAt === null) return;
    const e = w.t - w.bootAt;
    w.host = 1;
    if (e >= boot.integrityMs && w.pwsh === 0) { w.pwsh = 1; w.launcherStart = w.bootAt + boot.integrityMs; }
    if (e >= boot.integrityMs + boot.nodeMs && !w.answering) { w.node = 1; w.pid = w.bootPid; w.answering = true; }
  };
  const io = {
    now: () => w.t,
    sleep: async (ms) => { w.t += ms; tick(); },
    log: () => {},
    readFlag: () => ({ enabled: w.flagOn }),
    setFlag: (v) => {
      if (setFlagThrows) { const e = new Error('EPERM: operation not permitted'); e.code = 'EPERM'; throw e; }
      w.calls.setFlag += 1; w.flagOn = v; w.mtime = w.t;
    },
    flagMtimeMs: () => w.mtime,
    chain: () => ({ host: w.host, pwsh: w.pwsh, node: w.node }),
    progress: () => `host=${w.host} pwsh=${w.pwsh} node=${w.node}`,
    launcherStartMs: () => w.launcherStart,
    apiPid: () => w.pid,
    answering: async () => w.answering,
    probeFlag: async () => ({ verdict: flagVerdict, status: flagVerdict === 'ACIK' ? 404 : 403 }),
    stopTask: async () => {
      w.calls.stop += 1;
      Object.assign(w, { host: 0, pwsh: 0, node: 0, pid: null, answering: false, launcherStart: null, bootAt: null });
    },
    startTask: async () => {
      w.calls.start += 1;
      if (onStart) { onStart(w); return; }
      w.bootAt = w.t; w.bootPid = w.nextPid++; w.host = 1;
    },
  };
  if (init) init(w);
  return { w, io };
}

// ── decideCloseAction: saf karar tablosu ────────────────────────────────────────────────
test('karar tablosu: cevap VAR + baslatici yazimdan SONRA -> DONE', () => {
  const d = SVC.decideCloseAction({ flagFileMtimeMs: 100, chain: { host: 1, pwsh: 1, node: 1 }, launcherStartMs: 200, answering: true });
  assert.equal(d.action, 'DONE_LOADED_CURRENT');
});
test('karar tablosu: cevap VAR + baslatici yazimdan ONCE -> RESTART (eski dosya okunmus olabilir)', () => {
  const d = SVC.decideCloseAction({ flagFileMtimeMs: 200, chain: { host: 1, pwsh: 1, node: 1 }, launcherStartMs: 100, answering: true });
  assert.equal(d.action, 'RESTART');
});
test('karar tablosu: cevap VAR + baslatici OLCULEMEDI -> RESTART (kanitlanamaz)', () => {
  const d = SVC.decideCloseAction({ flagFileMtimeMs: 200, chain: { host: 1, pwsh: 1, node: 1 }, launcherStartMs: null, answering: true });
  assert.equal(d.action, 'RESTART');
});
test('karar tablosu: cevap YOK + host butunluk kapanisinda (pwsh yok) -> WAIT, DURDURMA', () => {
  const d = SVC.decideCloseAction({ flagFileMtimeMs: 200, chain: { host: 1, pwsh: 0, node: 0 }, launcherStartMs: null, answering: false });
  assert.equal(d.action, 'WAIT');
});
test('karar tablosu: cevap YOK + pwsh yazimdan SONRA basladi -> WAIT', () => {
  const d = SVC.decideCloseAction({ flagFileMtimeMs: 200, chain: { host: 1, pwsh: 1, node: 0 }, launcherStartMs: 300, answering: false });
  assert.equal(d.action, 'WAIT');
});
test('karar tablosu: cevap YOK + pwsh yazimdan ONCE basladi -> RESTART (baslatma ESKI dosyayla)', () => {
  const d = SVC.decideCloseAction({ flagFileMtimeMs: 200, chain: { host: 1, pwsh: 1, node: 0 }, launcherStartMs: 100, answering: false });
  assert.equal(d.action, 'RESTART');
});
test('karar tablosu: cevap YOK + zincir BOS -> START', () => {
  const d = SVC.decideCloseAction({ flagFileMtimeMs: 200, chain: { host: 0, pwsh: 0, node: 0 }, launcherStartMs: null, answering: false });
  assert.equal(d.action, 'START');
});

// ── closeFlagAndRecover: gercek karar yolu, simule dunyada ─────────────────────────────
test('OLAY TEKRARI — geciken baslatma (butunluk kapanisi 50 698 ms): kapanis DURDURMAZ, bekler, toparlanir', async () => {
  const { w, io } = world({
    flagOn: true, boot: { integrityMs: 50_698, nodeMs: 10_000 },
    init: (s) => { s.bootAt = s.t - 5_000; s.bootPid = 777; s.host = 1; }, // baslatma 5 s once verildi
  });
  const l = await SVC.closeFlagAndRecover(BASE, { io, budgetMs: 300_000 });
  assert.equal(w.calls.stop, 0, 'suren baslatma DURDURULMAMALI');
  assert.equal(l.restartAttempts, 0);
  assert.equal(l.flagWasOn, true);
  assert.equal(l.flagFileOff, true);
  assert.equal(l.recovered, true);
  assert.equal(l.startsObserved, 1, 'yeni baslatici bir kez GOZLENMELI');
  assert.deepEqual(l.decisions, ['WAIT', 'DONE_LOADED_CURRENT']);
  assert.ok(w.launcherStart > w.mtime, 'baslatici bayrak KAPALI yazildiktan SONRA basladi');
  assert.equal(l.error, null);
});

test('ESKI baslatici (acik dosyayi okumus, calisiyor): TEK restart, sonra guncel dosyayla toparlanir', async () => {
  const { w, io } = world({
    flagOn: true,
    init: (s) => Object.assign(s, { host: 1, pwsh: 1, node: 1, answering: true, pid: 300, launcherStart: s.t - 60_000 }),
  });
  const l = await SVC.closeFlagAndRecover(BASE, { io, budgetMs: 300_000 });
  assert.equal(l.restartAttempts, 1);
  assert.equal(w.calls.stop, 1);
  assert.equal(w.calls.start, 1);
  assert.equal(l.startsIssued, 1);
  assert.equal(l.startsObserved, 1);
  assert.equal(l.recovered, true);
  assert.deepEqual(l.decisions, ['RESTART', 'WAIT', 'DONE_LOADED_CURRENT']);
});

test('SURE ASIMI — baslatma hic bitmiyor: butce dolar, kapanis baslatmayi DURDURMAZ, hatayi acikca yazar', async () => {
  const { w, io } = world({
    flagOn: true, boot: { integrityMs: Infinity, nodeMs: 0 },
    init: (s) => { s.bootAt = s.t; s.bootPid = 888; s.host = 1; },
  });
  const l = await SVC.closeFlagAndRecover(BASE, { io, budgetMs: 120_000 });
  assert.equal(w.calls.stop, 0, 'butce dolsa bile suren baslatma DURDURULMAMALI');
  assert.equal(l.restartAttempts, 0);
  assert.equal(l.recovered, false);
  assert.match(l.error, /DURDURMADI/);
  assert.ok(l.waits > 100);
  assert.equal(l.flagFileOff, true, 'bayrak KAPALI yazimi her durumda korunur');
});

test('ZINCIR BOS (API olu): TEK start verilir, durdurma yok, toparlanir', async () => {
  const { w, io } = world({ flagOn: false });
  const l = await SVC.closeFlagAndRecover(BASE, { io, budgetMs: 300_000 });
  assert.equal(w.calls.stop, 0);
  assert.equal(l.restartAttempts, 0);
  assert.equal(l.startsIssued, 1);
  assert.equal(l.startsObserved, 1);
  assert.equal(l.recovered, true);
  assert.equal(l.decisions[0], 'START');
});

test('RESTART LIMITI — baslatici hep eski gorunuyor: sonsuz dongu YOK, limit asilinca durur', async () => {
  const { w, io } = world({
    flagOn: true,
    init: (s) => Object.assign(s, { host: 1, pwsh: 1, node: 1, answering: true, pid: 300, launcherStart: s.t - 60_000 }),
    onStart: (s) => Object.assign(s, { host: 1, pwsh: 1, node: 1, answering: true, pid: 301, launcherStart: s.t - 99_000 }),
  });
  const l = await SVC.closeFlagAndRecover(BASE, { io, budgetMs: 300_000, maxRestarts: 1 });
  assert.equal(l.restartAttempts, 1);
  assert.equal(w.calls.stop, 1);
  assert.equal(l.recovered, false);
  assert.match(l.error, /restart limiti/);
});

test('BAYRAK DOSYASI YAZILAMIYOR (EPERM): firlatmaz, hatayi deftere yazar, restart denemez', async () => {
  const { w, io } = world({ flagOn: true, setFlagThrows: true });
  const l = await SVC.closeFlagAndRecover(BASE, { io, budgetMs: 60_000 });
  assert.equal(w.calls.stop, 0);
  assert.equal(l.recovered, false);
  assert.match(l.error, /EPERM/);
});

// ── restartApiAndVerify (ACMA yolu): girisim ≠ baslatma ≠ toparlanma ──────────────────
test('ACMA SURE ASIMI: tek stop + tek start; ikinci stop YOK; defter girisim=1, gozlenen=HAYIR, toparlandi=HAYIR', async () => {
  const { w, io } = world({
    boot: { integrityMs: Infinity, nodeMs: 0 },
    init: (s) => Object.assign(s, { host: 1, pwsh: 1, node: 1, answering: true, pid: 300, launcherStart: s.t - 60_000 }),
  });
  await assert.rejects(
    SVC.restartApiAndVerify(BASE, { expectFlag: 'ACIK', token: 'sim', label: 'BAYRAK-AC', io, readyBudgetMs: 60_000 }),
    (e) => {
      assert.match(e.message, /IKINCI KEZ DURDURMAZ/);
      assert.equal(e.ledger.restartAttempts, 1);
      assert.equal(e.ledger.startIssued, 1);
      assert.equal(e.ledger.startObserved, false);
      assert.equal(e.ledger.recovered, false);
      return true;
    },
  );
  assert.equal(w.calls.stop, 1, 'ACMA yolu ikinci kez DURDURMAMALI');
  assert.equal(w.calls.start, 1);
});

test('ACMA BASARI: defter girisim=1, gozlenen=EVET, toparlandi=EVET, uc=ACIK', async () => {
  const { w, io } = world({
    init: (s) => Object.assign(s, { host: 1, pwsh: 1, node: 1, answering: true, pid: 300, launcherStart: s.t - 60_000 }),
  });
  const r = await SVC.restartApiAndVerify(BASE, { expectFlag: 'ACIK', token: 'sim', label: 'BAYRAK-AC', io });
  assert.equal(r.ledger.restartAttempts, 1);
  assert.equal(r.ledger.startObserved, true);
  assert.equal(r.ledger.recovered, true);
  assert.equal(r.flagVerdict, 'ACIK');
  assert.notEqual(r.newPid, r.oldPid);
  assert.equal(w.calls.stop, 1);
});

test('ACMA: baslatma basarili ama uc bayrak beklenmiyor -> toparlandi=HAYIR (baslatma ≠ toparlanma)', async () => {
  const { io } = world({
    flagVerdict: 'KAPALI',
    init: (s) => Object.assign(s, { host: 1, pwsh: 1, node: 1, answering: true, pid: 300, launcherStart: s.t - 60_000 }),
  });
  await assert.rejects(
    SVC.restartApiAndVerify(BASE, { expectFlag: 'ACIK', token: 'sim', label: 'BAYRAK-AC', io }),
    (e) => { assert.equal(e.ledger.startObserved, true); assert.equal(e.ledger.recovered, false); return true; },
  );
});

// ── a07-verdict.finalize: kusur A ──────────────────────────────────────────────────────
function okRows(ids) { return ids.map((id) => ({ id, ok: true, observed: 'ok' })); }

test('HUKUM: akis A07-04 te dustu -> kosulmayanlar NOT_EXECUTED, hukum PASS DEGIL', () => {
  const rows = [...okRows(['A07-01', 'A07-02', 'A07-03']), { id: 'A07-04', ok: false, observed: 'zaman asimi' }];
  const v = V.finalize(rows, { failure: 'restart zaman asimi' });
  assert.equal(v.verdict, 'PASS DEGIL');
  for (const id of ['A07-E1', 'A07-E4', 'A07-R2', 'CL-FLAG-ENDPOINT', 'CL-SVC-DB']) assert.ok(v.notExecuted.includes(id), id);
  assert.equal(v.unmeasured, V.MANDATORY.length - 4);
  assert.equal(v.fail, 1);
});

test('HUKUM: failure=null olsa bile eksik zorunlu olcut PASS URETMEZ (eski kusurun ozu)', () => {
  const v = V.finalize(okRows(['A07-01', 'A07-02', 'A07-03']), { failure: null });
  assert.equal(v.verdict, 'PASS DEGIL');
  assert.ok(v.unmeasured > 0);
});

test('HUKUM: tum zorunlu olcutler gecti -> PASS', () => {
  const v = V.finalize(okRows(V.MANDATORY.map(([id]) => id)), { failure: null });
  assert.equal(v.verdict, 'PASS');
  assert.equal(v.unmeasured, 0);
  assert.equal(v.fail, 0);
});

test('HUKUM: tek bir zorunlu olcut OLCULEMEDI (or. uc 403) -> PASS DEGIL, 401 yerine konamaz', () => {
  const rows = okRows(V.MANDATORY.map(([id]) => id).filter((id) => id !== 'CL-FLAG-ENDPOINT'));
  rows.push({ id: 'CL-FLAG-ENDPOINT', ok: false, unmeasured: true, observed: 'token yok' });
  const v = V.finalize(rows, { failure: null });
  assert.equal(v.verdict, 'PASS DEGIL');
});
