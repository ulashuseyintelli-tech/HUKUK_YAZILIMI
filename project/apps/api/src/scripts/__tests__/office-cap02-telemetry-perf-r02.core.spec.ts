import {
  assertR02Guards,
  buildBlockResult,
  buildCombinedDisposition,
  buildR02ProbeTag,
  isR02MeasuredTag,
  reconcileR02,
  segmentSamples,
  R02_MEASURED_BUDGET,
  R02_SEGMENT_KEYS,
  STEADY_STATE_EXCLUDE_FIRST,
  type R02ModeRun,
} from '../office-cap02-telemetry-perf-r02.core';

/**
 * OFFICE-P2-CAP02-NEUTRAL-TELEMETRY-PERFORMANCE-HARNESS-R02 doğrulama matrisi.
 * Owner §25 test listesinin tamamı + reconciliation semantiği.
 */

/** n elemanlı örneklem: ilk `coldN` tanesi `coldMs`, kalanı `steadyMs`. */
const seq = (n: number, coldN: number, coldMs: number, steadyMs: number): number[] =>
  Array.from({ length: n }, (_, i) => (i < coldN ? coldMs : steadyMs));

const run = (o: Partial<R02ModeRun> & Pick<R02ModeRun, 'block' | 'mode' | 'orderedSuccessMs'>): R02ModeRun => ({
  failureCount: 0,
  runtimeErrorCount: 0,
  telemetryEventDelta: o.mode === 'OBSERVE' ? o.orderedSuccessMs.length : 0,
  measuredRequestCount: o.orderedSuccessMs.length,
  ...o,
});

describe('segment sozlesmesi', () => {
  it('segment anahtarlari sabit', () => {
    expect([...R02_SEGMENT_KEYS]).toEqual([
      'FIRST_10',
      'REQUESTS_11_20',
      'MIDDLE_10',
      'LAST_10',
      'STEADY_STATE',
    ]);
    expect(STEADY_STATE_EXCLUDE_FIRST).toBe(20);
  });

  it('100 elemanli ornekemde segmentler dogru pencerelenir', () => {
    const s = Array.from({ length: 100 }, (_, i) => i + 1); // 1..100
    const seg = segmentSamples(s);
    expect(seg.FIRST_10).toMatchObject({ n: 10, min: 1, max: 10 });
    expect(seg.REQUESTS_11_20).toMatchObject({ n: 10, min: 11, max: 20 });
    expect(seg.MIDDLE_10).toMatchObject({ n: 10, min: 46, max: 55 });
    expect(seg.LAST_10).toMatchObject({ n: 10, min: 91, max: 100 });
    // STEADY_STATE ilk 20'yi HARIC tutar.
    expect(seg.STEADY_STATE).toMatchObject({ n: 80, min: 21, max: 100 });
  });

  it('steady-state disarida birakma EXACT: 21. elemandan baslar', () => {
    const s = Array.from({ length: 30 }, (_, i) => i + 1);
    expect(segmentSamples(s).STEADY_STATE.min).toBe(21);
    expect(segmentSamples(s).STEADY_STATE.n).toBe(10);
  });

  it('kisa ornekem: bos segment n=0 doner, uydurma deger YOK', () => {
    const seg = segmentSamples([5, 6, 7]);
    expect(seg.FIRST_10.n).toBe(3);
    expect(seg.REQUESTS_11_20.n).toBe(0);
    expect(seg.STEADY_STATE.n).toBe(0);
    expect(seg.STEADY_STATE.p95).toBe(0);
  });

  it('bos ornekem: tum segmentler n=0', () => {
    const seg = segmentSamples([]);
    for (const k of R02_SEGMENT_KEYS) expect(seg[k].n).toBe(0);
  });
});

describe('blok kurulumu', () => {
  it('OFF->OBSERVE blogu (block 1) kurulur', () => {
    const b = buildBlockResult(
      run({ block: 1, mode: 'OFF', orderedSuccessMs: seq(100, 0, 20, 20) }),
      run({ block: 1, mode: 'OBSERVE', orderedSuccessMs: seq(100, 10, 200, 25) }),
    );
    expect(b.block).toBe(1);
    expect(b.order).toBe('OFF->OBSERVE');
    expect(b.observe.segments.FIRST_10.p95).toBe(200);
    expect(b.observe.segments.STEADY_STATE.p95).toBe(25);
    expect(b.steadyOverhead.absoluteDeltaMs.p95).toBe(5);
    expect(b.coldOverhead.absoluteDeltaMs.p95).toBe(180);
  });

  it('OBSERVE->OFF blogu (block 2) sirasini raporlar', () => {
    const b = buildBlockResult(
      run({ block: 2, mode: 'OFF', orderedSuccessMs: seq(100, 0, 20, 20) }),
      run({ block: 2, mode: 'OBSERVE', orderedSuccessMs: seq(100, 10, 200, 25) }),
    );
    expect(b.order).toBe('OBSERVE->OFF');
  });

  it('blok uyusmazligi -> throw', () => {
    expect(() =>
      buildBlockResult(
        run({ block: 1, mode: 'OFF', orderedSuccessMs: [10] }),
        run({ block: 2, mode: 'OBSERVE', orderedSuccessMs: [10] }),
      ),
    ).toThrow('R02_BLOCK_MISMATCH');
  });

  it('mode uyusmazligi -> throw', () => {
    expect(() =>
      buildBlockResult(
        run({ block: 1, mode: 'OBSERVE', orderedSuccessMs: [10] }),
        run({ block: 1, mode: 'OBSERVE', orderedSuccessMs: [10] }),
      ),
    ).toThrow('R02_MODE_MISMATCH');
  });
});

describe('bütçe ve blok esitligi guard\'lari', () => {
  const fourRuns = (count: number): R02ModeRun[] => [
    run({ block: 1, mode: 'OFF', orderedSuccessMs: seq(count, 0, 20, 20) }),
    run({ block: 1, mode: 'OBSERVE', orderedSuccessMs: seq(count, 0, 25, 25) }),
    run({ block: 2, mode: 'OBSERVE', orderedSuccessMs: seq(count, 0, 25, 25) }),
    run({ block: 2, mode: 'OFF', orderedSuccessMs: seq(count, 0, 20, 20) }),
  ];

  it('400 request tam sinirda GECER', () => {
    const g = assertR02Guards(fourRuns(100));
    expect(g.totalMeasured).toBe(400);
    expect(g.ok).toBe(true);
  });

  it('400 ustu -> BUDGET_EXCEEDED', () => {
    const g = assertR02Guards(fourRuns(101));
    expect(g.totalMeasured).toBe(404);
    expect(g.failures).toContain('BUDGET_EXCEEDED');
    expect(R02_MEASURED_BUDGET).toBe(400);
  });

  it('eksik blok -> MISSING_BLOCK', () => {
    const g = assertR02Guards(fourRuns(100).slice(0, 2));
    expect(g.failures).toContain('MISSING_BLOCK');
  });

  it('blokta iki ayni mode -> BLOCK_ORDER_MISMATCH', () => {
    const runs = fourRuns(100);
    runs[1] = run({ block: 1, mode: 'OFF', orderedSuccessMs: seq(100, 0, 20, 20) });
    const g = assertR02Guards(runs);
    expect(g.failures).toContain('BLOCK_ORDER_MISMATCH');
  });

  it('esit olmayan request sayisi -> UNEQUAL_BLOCK_CONDITIONS', () => {
    const runs = fourRuns(100);
    runs[3] = run({ block: 2, mode: 'OFF', orderedSuccessMs: seq(50, 0, 20, 20) });
    const g = assertR02Guards(runs);
    expect(g.failures).toContain('UNEQUAL_BLOCK_CONDITIONS');
  });
});

describe('reconciliation', () => {
  /** Cold yuksek + steady temiz, iki blokta ayni. */
  const coldPathScenario = () => {
    const runs = [
      run({ block: 1, mode: 'OFF', orderedSuccessMs: seq(100, 0, 20, 20) }),
      run({ block: 1, mode: 'OBSERVE', orderedSuccessMs: seq(100, 10, 200, 25) }),
      run({ block: 2, mode: 'OBSERVE', orderedSuccessMs: seq(100, 10, 210, 26) }),
      run({ block: 2, mode: 'OFF', orderedSuccessMs: seq(100, 0, 20, 20) }),
    ];
    const blocks = [
      buildBlockResult(runs[0], runs[1]),
      buildBlockResult(runs[3], runs[2]),
    ];
    return { runs, blocks };
  };

  const base = (o: Partial<Parameters<typeof reconcileR02>[0]> = {}) => {
    const { runs, blocks } = coldPathScenario();
    return reconcileR02({
      blocks,
      runs,
      eventIntegrityOk: true,
      authorizationDelta: 0,
      responseContractDelta: 0,
      ...o,
    });
  };

  it('cold yuksek + steady temiz + iki blokta tekrar -> COLD_PATH_CONFIRMED / PASS', () => {
    const r = base();
    expect(r.disposition).toBe('COLD_PATH_CONFIRMED');
    expect(r.fitness).toBe('PASS_FOR_BOUNDED_CANARY');
    expect(r.coldPatternRepeated).toBe(true);
    expect(r.perBlockSteadyPass.every((b) => b.pass)).toBe(true);
    expect(r.totalMeasured).toBe(400);
  });

  it('steady esik asimi IKI blokta -> STEADY_STATE_OVERHEAD_CONFIRMED / FAIL', () => {
    const runs = [
      run({ block: 1, mode: 'OFF', orderedSuccessMs: seq(100, 0, 20, 20) }),
      run({ block: 1, mode: 'OBSERVE', orderedSuccessMs: seq(100, 0, 200, 200) }),
      run({ block: 2, mode: 'OBSERVE', orderedSuccessMs: seq(100, 0, 200, 200) }),
      run({ block: 2, mode: 'OFF', orderedSuccessMs: seq(100, 0, 20, 20) }),
    ];
    const r = reconcileR02({
      blocks: [buildBlockResult(runs[0], runs[1]), buildBlockResult(runs[3], runs[2])],
      runs,
      eventIntegrityOk: true,
      authorizationDelta: 0,
      responseContractDelta: 0,
    });
    expect(r.disposition).toBe('STEADY_STATE_OVERHEAD_CONFIRMED');
    expect(r.fitness).toBe('FAIL');
    expect(r.reasons.join(' ')).toContain('p95_absolute');
  });

  it('bir blok PASS bir blok FAIL -> MIXED / FAIL', () => {
    const runs = [
      run({ block: 1, mode: 'OFF', orderedSuccessMs: seq(100, 0, 20, 20) }),
      run({ block: 1, mode: 'OBSERVE', orderedSuccessMs: seq(100, 0, 25, 25) }),
      run({ block: 2, mode: 'OBSERVE', orderedSuccessMs: seq(100, 0, 300, 300) }),
      run({ block: 2, mode: 'OFF', orderedSuccessMs: seq(100, 0, 20, 20) }),
    ];
    const r = reconcileR02({
      blocks: [buildBlockResult(runs[0], runs[1]), buildBlockResult(runs[3], runs[2])],
      runs,
      eventIntegrityOk: true,
      authorizationDelta: 0,
      responseContractDelta: 0,
    });
    expect(r.disposition).toBe('MIXED');
    expect(r.fitness).toBe('FAIL');
    expect(r.reasons.join(' ')).toContain('order effect');
  });

  it('steady temiz ama cold oruntusu YOK -> MIXED / PASS + cold iddiasi KANITLANMADI', () => {
    const runs = [
      run({ block: 1, mode: 'OFF', orderedSuccessMs: seq(100, 0, 20, 20) }),
      run({ block: 1, mode: 'OBSERVE', orderedSuccessMs: seq(100, 0, 25, 25) }),
      run({ block: 2, mode: 'OBSERVE', orderedSuccessMs: seq(100, 0, 25, 25) }),
      run({ block: 2, mode: 'OFF', orderedSuccessMs: seq(100, 0, 20, 20) }),
    ];
    const r = reconcileR02({
      blocks: [buildBlockResult(runs[0], runs[1]), buildBlockResult(runs[3], runs[2])],
      runs,
      eventIntegrityOk: true,
      authorizationDelta: 0,
      responseContractDelta: 0,
    });
    expect(r.disposition).toBe('MIXED');
    expect(r.fitness).toBe('PASS_FOR_BOUNDED_CANARY');
    expect(r.coldPatternRepeated).toBe(false);
    expect(r.reasons.join(' ')).toContain('DOGRULANMADI');
  });

  it('olay butunlugu FAIL -> INCONCLUSIVE / FAIL', () => {
    const r = base({ eventIntegrityOk: false });
    expect(r.disposition).toBe('INCONCLUSIVE');
    expect(r.fitness).toBe('FAIL');
  });

  it('authorization/response delta sifir degil -> INCONCLUSIVE', () => {
    expect(base({ authorizationDelta: 1 }).disposition).toBe('INCONCLUSIVE');
    expect(base({ responseContractDelta: 2 }).disposition).toBe('INCONCLUSIVE');
  });

  it('OFF modunda telemetry delta > 0 -> INCONCLUSIVE (beyan tutarsizligi)', () => {
    const { runs, blocks } = coldPathScenario();
    const bad = runs.map((r) => (r.mode === 'OFF' ? { ...r, telemetryEventDelta: 3 } : r));
    const res = reconcileR02({
      blocks,
      runs: bad,
      eventIntegrityOk: true,
      authorizationDelta: 0,
      responseContractDelta: 0,
    });
    expect(res.disposition).toBe('INCONCLUSIVE');
    expect(res.reasons.join(' ')).toContain('OFF modunda telemetry delta 3');
  });

  it('OBSERVE modunda telemetry delta 0 -> INCONCLUSIVE', () => {
    const { runs, blocks } = coldPathScenario();
    const bad = runs.map((r) => (r.mode === 'OBSERVE' ? { ...r, telemetryEventDelta: 0 } : r));
    const res = reconcileR02({
      blocks,
      runs: bad,
      eventIntegrityOk: true,
      authorizationDelta: 0,
      responseContractDelta: 0,
    });
    expect(res.disposition).toBe('INCONCLUSIVE');
  });

  it('basarisiz request veya runtime hata -> INCONCLUSIVE', () => {
    const { runs, blocks } = coldPathScenario();
    const withFail = runs.map((r, i) => (i === 1 ? { ...r, failureCount: 2 } : r));
    expect(
      reconcileR02({ blocks, runs: withFail, eventIntegrityOk: true, authorizationDelta: 0, responseContractDelta: 0 })
        .disposition,
    ).toBe('INCONCLUSIVE');
    const withErr = runs.map((r, i) => (i === 2 ? { ...r, runtimeErrorCount: 1 } : r));
    expect(
      reconcileR02({ blocks, runs: withErr, eventIntegrityOk: true, authorizationDelta: 0, responseContractDelta: 0 })
        .disposition,
    ).toBe('INCONCLUSIVE');
  });

  it('esikler R01 ile AYNI kalir; sonuca uydurmak icin revize EDILEMEZ', () => {
    // Ayni veri, gevsetilmis esikle PASS olurdu; varsayilan esikle FAIL kalir.
    const runs = [
      run({ block: 1, mode: 'OFF', orderedSuccessMs: seq(100, 0, 20, 20) }),
      run({ block: 1, mode: 'OBSERVE', orderedSuccessMs: seq(100, 0, 200, 200) }),
      run({ block: 2, mode: 'OBSERVE', orderedSuccessMs: seq(100, 0, 200, 200) }),
      run({ block: 2, mode: 'OFF', orderedSuccessMs: seq(100, 0, 20, 20) }),
    ];
    const blocks = [buildBlockResult(runs[0], runs[1]), buildBlockResult(runs[3], runs[2])];
    const strict = reconcileR02({ blocks, runs, eventIntegrityOk: true, authorizationDelta: 0, responseContractDelta: 0 });
    expect(strict.fitness).toBe('FAIL');
  });
});

describe('R01 + R02 birlesik hukum', () => {
  it('R01 kaydi HER durumda korunur', () => {
    for (const d of ['COLD_PATH_CONFIRMED', 'STEADY_STATE_OVERHEAD_CONFIRMED', 'MIXED', 'INCONCLUSIVE'] as const) {
      const c = buildCombinedDisposition({
        disposition: d,
        fitness: d === 'COLD_PATH_CONFIRMED' ? 'PASS_FOR_BOUNDED_CANARY' : 'FAIL',
        reasons: [],
        perBlockSteadyPass: [],
        coldPatternRepeated: d === 'COLD_PATH_CONFIRMED',
        totalMeasured: 400,
      });
      expect(c.r01).toBe('FAIL');
      expect(c.productionScaleFitness).toBe('NOT_ASSESSED');
    }
  });

  it('cold-path onaylandiysa "reconciled" der, R01 yanlis DEMEZ', () => {
    const c = buildCombinedDisposition({
      disposition: 'COLD_PATH_CONFIRMED',
      fitness: 'PASS_FOR_BOUNDED_CANARY',
      reasons: [],
      perBlockSteadyPass: [],
      coldPatternRepeated: true,
      totalMeasured: 400,
    });
    expect(c.combined).toContain('reconciled');
    expect(c.combined.toLowerCase()).not.toContain('r01 was wrong');
  });

  it('steady-state onaylandiysa "defect confirmed" + R01 FAIL stands', () => {
    const c = buildCombinedDisposition({
      disposition: 'STEADY_STATE_OVERHEAD_CONFIRMED',
      fitness: 'FAIL',
      reasons: [],
      perBlockSteadyPass: [],
      coldPatternRepeated: false,
      totalMeasured: 400,
    });
    expect(c.combined).toContain('defect confirmed');
    expect(c.combined).toContain('R01 FAIL stands');
  });
});

describe('blok farkindalikli probe tag', () => {
  it('warm-up ve measured setler AYRI on-ek tasir', () => {
    expect(buildR02ProbeTag(1, 'warmup', 'OFF', 'A', 3)).toBe('warmup-r02-b1-off-a-3');
    expect(buildR02ProbeTag(2, 'measured', 'OBSERVE', 'D', 77)).toBe('measure-r02-b2-observe-d-77');
  });

  it('isR02MeasuredTag yalniz measured seti kabul eder', () => {
    expect(isR02MeasuredTag(buildR02ProbeTag(1, 'measured', 'OFF', 'A', 1))).toBe(true);
    expect(isR02MeasuredTag(buildR02ProbeTag(1, 'warmup', 'OFF', 'A', 1))).toBe(false);
  });

  it('bloklar ve modlar arasi tag cakismasi YOK', () => {
    const tags = new Set<string>();
    for (const block of [1, 2] as const) {
      for (const mode of ['OFF', 'OBSERVE'] as const) {
        for (const a of ['A', 'B', 'C', 'D']) {
          for (let i = 1; i <= 5; i++) tags.add(buildR02ProbeTag(block, 'measured', mode, a, i));
        }
      }
    }
    expect(tags.size).toBe(2 * 2 * 4 * 5);
  });
});

describe('modul yuzeyi', () => {
  it('export seti sabit', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('../office-cap02-telemetry-perf-r02.core');
    expect(Object.keys(mod).sort()).toEqual([
      'R02_MEASURED_BUDGET',
      'R02_SEGMENT_KEYS',
      'STEADY_STATE_EXCLUDE_FIRST',
      'assertR02Guards',
      'buildBlockResult',
      'buildCombinedDisposition',
      'buildR02ProbeTag',
      'isR02MeasuredTag',
      'reconcileR02',
      'segmentSamples',
    ]);
  });
});
