/**
 * RUNTIME-OPERABILITY-CERTIFICATION-R01 / W3-F07-CRON-OVERLAP-AND-JOB-IDENTITY-R01.
 *
 * DB-free birim testi: canonical overlap-guard primitive'inin (`runWithOverlapGuard`)
 * kendisini, gercek Nest/Prisma/DB bagimlligi olmadan, izole olarak dogrular.
 * Runtime-matrix'teki jenerik senaryolar (A: normal run, B: ayni job iki kez
 * tetikleme, E: parallel execution denemesi) mekanizma seviyesinde burada
 * kanitlanir — 33 farkli is-mantigini ayri ayri DB'ye karsi kosturmak yerine,
 * TEK paylasilan mekanizmanin dogru calistigini kanitlamak yeterlidir (hepsi
 * ayni `runWithOverlapGuard` cagrisindan gecer, bkz. static guard [26]).
 */
import {
  runWithOverlapGuard,
  isJobCurrentlyRunning,
  resetOverlapGuardStateForTests,
} from './scheduler-overlap-guard';

function deferred<T = void>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe('W3-F07 — scheduler-overlap-guard (runWithOverlapGuard) DB-free birim testi', () => {
  afterEach(() => {
    resetOverlapGuardStateForTests();
  });

  it('[A] normal run: fn calisir, RAN doner', async () => {
    const fn = jest.fn().mockResolvedValue(undefined);
    const result = await runWithOverlapGuard('test.jobA', fn);
    expect(result).toBe('RAN');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('[B] duplicate start: AYNI jobId ile eszamanli 2. cagri SKIPPED_ALREADY_RUNNING doner, fn IKINCI KEZ INVOKE EDILMEZ', async () => {
    const gate = deferred();
    const calls: number[] = [];
    const slowFn = jest.fn(async () => {
      calls.push(1);
      await gate.promise;
    });

    const firstCall = runWithOverlapGuard('test.jobB', slowFn);
    // ilk cagri fn'i cagirip gate'te bekliyorken (henuz cozulmedi) ikinci cagriyi baslat.
    await Promise.resolve(); // fn'in en azindan bir mikrotask ilerlemesine izin ver
    expect(isJobCurrentlyRunning('test.jobB')).toBe(true);

    const secondResult = await runWithOverlapGuard('test.jobB', slowFn);
    expect(secondResult).toBe('SKIPPED_ALREADY_RUNNING');
    expect(slowFn).toHaveBeenCalledTimes(1); // ikinci cagri fn'i HIC invoke ETMEDI

    gate.resolve();
    const firstResult = await firstCall;
    expect(firstResult).toBe('RAN');
    expect(isJobCurrentlyRunning('test.jobB')).toBe(false); // finally temizledi
  });

  it('[C] parallel execution (farkli jobId): birbirini SKIP ETMEZ, ikisi de RAN doner', async () => {
    const fnX = jest.fn().mockResolvedValue(undefined);
    const fnY = jest.fn().mockResolvedValue(undefined);
    const [rx, ry] = await Promise.all([
      runWithOverlapGuard('test.jobX', fnX),
      runWithOverlapGuard('test.jobY', fnY),
    ]);
    expect(rx).toBe('RAN');
    expect(ry).toBe('RAN');
    expect(fnX).toHaveBeenCalledTimes(1);
    expect(fnY).toHaveBeenCalledTimes(1);
  });

  it('[D] fn hata firlatirsa: guard cagrisinin kendisi REDDEDER (rethrow), running-set yine de temizlenir', async () => {
    const boom = new Error('boom');
    const throwingFn = jest.fn().mockRejectedValue(boom);

    await expect(runWithOverlapGuard('test.jobD', throwingFn)).rejects.toThrow('boom');
    expect(isJobCurrentlyRunning('test.jobD')).toBe(false); // finally temizledi, hata sonrasi da

    // Temizlik gercekten calisti mi? Bir sonraki cagri RAN donmeli (SKIPPED degil).
    const nextFn = jest.fn().mockResolvedValue(undefined);
    const result = await runWithOverlapGuard('test.jobD', nextFn);
    expect(result).toBe('RAN');
  });

  it('[E] SIRALI (ust-uste binmeyen) ayni-jobId cagrilari: ikisi de RAN doner', async () => {
    const fn = jest.fn().mockResolvedValue(undefined);
    const r1 = await runWithOverlapGuard('test.jobE', fn);
    const r2 = await runWithOverlapGuard('test.jobE', fn);
    expect(r1).toBe('RAN');
    expect(r2).toBe('RAN');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('[F] isJobCurrentlyRunning: calisirken true, oncesinde/sonrasinda false', async () => {
    expect(isJobCurrentlyRunning('test.jobF')).toBe(false);
    const gate = deferred();
    const promise = runWithOverlapGuard('test.jobF', async () => {
      await gate.promise;
    });
    await Promise.resolve();
    expect(isJobCurrentlyRunning('test.jobF')).toBe(true);
    gate.resolve();
    await promise;
    expect(isJobCurrentlyRunning('test.jobF')).toBe(false);
  });

  // ── F02: opt-in WAIT modu (varsayilan SKIP yukaridaki [A]-[G] ile DEGISMEDI) ──
  it('[H] WAIT: mesgulken gelen cagri ATLANMAZ, oncul bitince calisir ve RAN_AFTER_WAIT doner; fn ikisinde de tam 1 kez', async () => {
    const gate = deferred();
    const first = jest.fn(async () => { await gate.promise; });
    const second = jest.fn(async () => undefined);
    const p1 = runWithOverlapGuard('test.jobH', first, { onBusy: 'WAIT' });
    await Promise.resolve();
    const p2 = runWithOverlapGuard('test.jobH', second, { onBusy: 'WAIT' });
    await Promise.resolve();
    expect(second).not.toHaveBeenCalled(); // oncul bitmeden CALISMADI (paralellik yok)
    expect(isJobCurrentlyRunning('test.jobH')).toBe(true);
    gate.resolve();
    expect(await p1).toBe('RAN');
    expect(await p2).toBe('RAN_AFTER_WAIT');
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
    expect(isJobCurrentlyRunning('test.jobH')).toBe(false); // kuyruk temiz
  });

  it('[I] WAIT bekleyen kuyruktayken gelen SKIP cagrisi ATLANIR (araya sizip paralel calisamaz)', async () => {
    const gate = deferred();
    const first = jest.fn(async () => { await gate.promise; });
    const waiter = jest.fn(async () => undefined);
    const sneaker = jest.fn(async () => undefined);
    const p1 = runWithOverlapGuard('test.jobI', first, { onBusy: 'WAIT' });
    await Promise.resolve();
    const p2 = runWithOverlapGuard('test.jobI', waiter, { onBusy: 'WAIT' });
    const p3 = runWithOverlapGuard('test.jobI', sneaker); // varsayilan SKIP
    expect(await p3).toBe('SKIPPED_ALREADY_RUNNING');
    gate.resolve();
    await p1; await p2;
    expect(sneaker).not.toHaveBeenCalled();
    expect(waiter).toHaveBeenCalledTimes(1);
  });

  it('[J] oncul fn HATA firlatirsa bekleyen yine calisir; hata yalniz oncul caller tarafina gider; state temiz', async () => {
    const gate = deferred();
    const first = jest.fn(async () => { await gate.promise; throw new Error('oncul patladi'); });
    const second = jest.fn(async () => undefined);
    const p1 = runWithOverlapGuard('test.jobJ', first, { onBusy: 'WAIT' });
    await Promise.resolve();
    const p2 = runWithOverlapGuard('test.jobJ', second, { onBusy: 'WAIT' });
    gate.resolve();
    await expect(p1).rejects.toThrow('oncul patladi');
    expect(await p2).toBe('RAN_AFTER_WAIT');
    expect(second).toHaveBeenCalledTimes(1);
    expect(isJobCurrentlyRunning('test.jobJ')).toBe(false);
  });

  it('[K] WAIT: ucuncu cagri FIFO — sira korunur, hepsi tam 1 kez, hicbiri paralel degil', async () => {
    const order: string[] = [];
    let active = 0;
    let maxActive = 0;
    const mk = (n: string) => jest.fn(async () => { active += 1; maxActive = Math.max(maxActive, active); order.push(n); await Promise.resolve(); active -= 1; });
    const [a, b, c] = ['a', 'b', 'c'].map(mk);
    const results = await Promise.all([
      runWithOverlapGuard('test.jobK', a, { onBusy: 'WAIT' }),
      runWithOverlapGuard('test.jobK', b, { onBusy: 'WAIT' }),
      runWithOverlapGuard('test.jobK', c, { onBusy: 'WAIT' }),
    ]);
    expect(results).toEqual(['RAN', 'RAN_AFTER_WAIT', 'RAN_AFTER_WAIT']);
    expect(order).toEqual(['a', 'b', 'c']);
    expect(maxActive).toBe(1);
  });

  it('[G] resetOverlapGuardStateForTests: paylasilan state\'i gercekten temizler (test izolasyonu)', async () => {
    const gate = deferred();
    const stuckPromise = runWithOverlapGuard('test.jobG', async () => {
      await gate.promise;
    });
    await Promise.resolve();
    expect(isJobCurrentlyRunning('test.jobG')).toBe(true);

    resetOverlapGuardStateForTests();
    expect(isJobCurrentlyRunning('test.jobG')).toBe(false);

    // Reset sonrasi AYNI jobId ile yeni bir cagri RAN donmeli (guard'in stale state'e takilmadigi kaniti).
    const freshResult = await runWithOverlapGuard('test.jobG', jest.fn().mockResolvedValue(undefined));
    expect(freshResult).toBe('RAN');

    gate.resolve();
    await stuckPromise; // sarkan promise'i temizle (jest process leak onlemi)
  });
});
