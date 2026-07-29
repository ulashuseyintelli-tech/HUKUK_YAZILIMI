import * as fs from 'fs';
import * as path from 'path';

import {
  assessEventIntegrity,
  buildProbeTag,
  compareModes,
  evaluatePerformanceFitness,
  isMeasuredTag,
  percentile,
  summarize,
  DEFAULT_PERF_THRESHOLDS,
  MEASURED_PREFIX,
  PROHIBITED_EVENT_KEYS,
  PROHIBITED_EVENT_VALUES,
  WARMUP_PREFIX,
  type EventIntegrityExpectation,
  type ObservedEvent,
} from '../office-cap02-telemetry-perf.core';

/**
 * OFFICE-P2-CAP02-NEUTRAL-TELEMETRY-PERFORMANCE-HARNESS-I01 doğrulama matrisi.
 * Owner §8 test listesinin tamamı + eşik/hüküm semantiği + yapısal izolasyon.
 */

const TENANT = 'cmrgs24hq0001uanatffks93h';
const ACTORS = ['cactora0000000000000000001', 'cactorb0000000000000000002'];
const CASES = ['ccasea00000000000000000001', 'ccaseb00000000000000000002'];

const ev = (o: Partial<ObservedEvent> = {}): ObservedEvent => ({
  correlationId: 'ms-observe-a-1',
  tenantId: TENANT,
  actorUserId: ACTORS[0],
  entityId: CASES[0],
  observedActionCode: 'CHANGE_STATUS',
  accessAffected: false,
  decisionAffected: false,
  metadataKeys: ['tenantId', 'actorUserId', 'comparison', 'accessAffected', 'decisionAffected'],
  metadataJson: '{"comparison":"SAME_CLASS"}',
  ...o,
});

const expectation = (ids: string[]): EventIntegrityExpectation => ({
  expectedCorrelationIds: ids,
  expectedTenantId: TENANT,
  expectedActorUserIds: ACTORS,
  expectedEntityIds: CASES,
});

describe('yuzdelik hesabi — nearest-rank, enterpolasyon YOK', () => {
  const sorted = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

  it('p50/p95/p99 nearest-rank ile hesaplanir', () => {
    expect(percentile(sorted, 50)).toBe(5); // ceil(0.50*10)-1 = 4 -> 5
    expect(percentile(sorted, 95)).toBe(10); // ceil(0.95*10)-1 = 9 -> 10
    expect(percentile(sorted, 99)).toBe(10);
  });

  it('sinir degerleri: p<=0 min, p>=100 max', () => {
    expect(percentile(sorted, 0)).toBe(1);
    expect(percentile(sorted, 100)).toBe(10);
  });

  it('bos ornekem: 0 doner, uydurma deger URETILMEZ', () => {
    expect(percentile([], 95)).toBe(0);
    expect(summarize([])).toEqual({ n: 0, min: 0, max: 0, mean: 0, p50: 0, p95: 0, p99: 0 });
  });

  it('summarize siralamayi kendisi yapar (girdi sirasi onemsiz)', () => {
    const a = summarize([10, 1, 5, 3]);
    const b = summarize([1, 3, 5, 10]);
    expect(a).toEqual(b);
    expect(a).toMatchObject({ n: 4, min: 1, max: 10, mean: 4.75 });
  });

  it('tek elemanli ornekem: tum yuzdelikler ayni', () => {
    expect(summarize([7])).toMatchObject({ n: 1, min: 7, max: 7, mean: 7, p50: 7, p95: 7, p99: 7 });
  });

  it('metrik toplama dogrulugu: mean aritmetik ortalamadir', () => {
    expect(summarize([2, 4, 6, 8]).mean).toBe(5);
  });
});

describe('mod karsilastirmasi', () => {
  it('absolute/relative/max overhead dogru hesaplanir', () => {
    const off = summarize([10, 20, 30, 40]);
    const observe = summarize([15, 25, 35, 60]);
    const c = compareModes(off, observe);
    expect(c.absoluteDeltaMs.p50).toBe(observe.p50 - off.p50);
    expect(c.relativeDeltaPct.p50).toBeCloseTo(((observe.p50 - off.p50) / off.p50) * 100, 6);
    expect(c.maxOverheadMs).toBe(60 - 40);
  });

  it('negatif delta MASKELENMEZ (olcum gurultusu gorunur kalir)', () => {
    const c = compareModes(summarize([50, 50]), summarize([40, 40]));
    expect(c.absoluteDeltaMs.p95).toBe(-10);
  });

  it('OFF degeri 0 ise bagil fark null (sifira bolme uydurulmaz)', () => {
    const c = compareModes(summarize([0, 0]), summarize([5, 5]));
    expect(c.relativeDeltaPct.p95).toBeNull();
  });
});

describe('olay butunlugu — OFF modu', () => {
  it('OFF modunda olay 0 beklenir: beklenen liste bos + olay bos -> ok', () => {
    const r = assessEventIntegrity(expectation([]), []);
    expect(r.ok).toBe(true);
    expect(r.expectedCount).toBe(0);
    expect(r.actualCount).toBe(0);
  });

  it('OFF modunda olay uretilirse UNEXPECTED_CORRELATION', () => {
    const r = assessEventIntegrity(expectation([]), [ev()]);
    expect(r.ok).toBe(false);
    expect(r.failures).toContain('UNEXPECTED_CORRELATION');
    expect(r.actualCount).toBe(1);
  });
});

describe('olay butunlugu — OBSERVE modu', () => {
  it('olay sayisi = request sayisi -> ok', () => {
    const ids = ['ms-observe-a-1', 'ms-observe-a-2', 'ms-observe-b-1'];
    const events = ids.map((id, i) => ev({ correlationId: id, actorUserId: ACTORS[i % 2], entityId: CASES[i % 2] }));
    const r = assessEventIntegrity(expectation(ids), events);
    expect(r.ok).toBe(true);
    expect(r.expectedCount).toBe(3);
    expect(r.actualCount).toBe(3);
    expect(r.missing).toEqual([]);
    expect(r.duplicate).toEqual([]);
  });

  it('eksik olay -> MISSING_EVENT + eksik id listesi', () => {
    const ids = ['ms-observe-a-1', 'ms-observe-a-2'];
    const r = assessEventIntegrity(expectation(ids), [ev({ correlationId: ids[0] })]);
    expect(r.failures).toContain('MISSING_EVENT');
    expect(r.missing).toEqual(['ms-observe-a-2']);
  });

  it('duplicate correlationId tespiti -> DUPLICATE_EVENT', () => {
    const ids = ['ms-observe-a-1'];
    const r = assessEventIntegrity(expectation(ids), [ev({ correlationId: ids[0] }), ev({ correlationId: ids[0] })]);
    expect(r.failures).toContain('DUPLICATE_EVENT');
    expect(r.duplicate).toEqual(['ms-observe-a-1']);
    expect(r.actualCount).toBe(2);
  });
});

describe('olay butunlugu — kapsam ihlalleri', () => {
  it('yanlis tenant -> UNEXPECTED_TENANT', () => {
    const r = assessEventIntegrity(expectation(['ms-observe-a-1']), [ev({ tenantId: 'cbaskatenant00000000000001' })]);
    expect(r.failures).toContain('UNEXPECTED_TENANT');
    expect(r.unexpectedTenantCount).toBe(1);
  });

  it('yanlis actor -> UNEXPECTED_ACTOR', () => {
    const r = assessEventIntegrity(expectation(['ms-observe-a-1']), [ev({ actorUserId: 'cbaskaactor000000000000001' })]);
    expect(r.failures).toContain('UNEXPECTED_ACTOR');
    expect(r.unexpectedActorCount).toBe(1);
  });

  it('yanlis Case entityId -> UNEXPECTED_ENTITY', () => {
    const r = assessEventIntegrity(expectation(['ms-observe-a-1']), [ev({ entityId: 'cbaskacase0000000000000001' })]);
    expect(r.failures).toContain('UNEXPECTED_ENTITY');
  });

  it('actionCode CHANGE_STATUS degil -> WRONG_ACTION_CODE', () => {
    const r = assessEventIntegrity(expectation(['ms-observe-a-1']), [ev({ observedActionCode: 'POST_DISPOSITION' })]);
    expect(r.failures).toContain('WRONG_ACTION_CODE');
  });

  it('accessAffected/decisionAffected false DEGILSE -> AFFECTED_FLAG_NOT_FALSE', () => {
    const r1 = assessEventIntegrity(expectation(['ms-observe-a-1']), [ev({ accessAffected: true })]);
    expect(r1.failures).toContain('AFFECTED_FLAG_NOT_FALSE');
    const r2 = assessEventIntegrity(expectation(['ms-observe-a-1']), [ev({ decisionAffected: undefined })]);
    expect(r2.failures).toContain('AFFECTED_FLAG_NOT_FALSE');
  });
});

describe('yasakli politika alanlari reddedilir', () => {
  it('yasakli ANAHTAR -> PROHIBITED_FIELD', () => {
    for (const k of PROHIBITED_EVENT_KEYS) {
      const r = assessEventIntegrity(expectation(['ms-observe-a-1']), [
        ev({ metadataKeys: ['tenantId', k] }),
      ]);
      expect(r.failures).toContain('PROHIBITED_FIELD');
      expect(r.prohibitedHits).toContain(`key:${k}`);
    }
  });

  it('yasakli DEGER -> PROHIBITED_FIELD', () => {
    for (const v of PROHIBITED_EVENT_VALUES) {
      const r = assessEventIntegrity(expectation(['ms-observe-a-1']), [
        ev({ metadataJson: `{"x":"${v}"}` }),
      ]);
      expect(r.failures).toContain('PROHIBITED_FIELD');
      expect(r.prohibitedHits).toContain(`value:${v}`);
    }
  });

  it('temiz olayda yasakli isabet YOK', () => {
    const r = assessEventIntegrity(expectation(['ms-observe-a-1']), [ev()]);
    expect(r.prohibitedHits).toEqual([]);
  });
});

describe('basarisizlik semantigi — dahil/haric EXACT', () => {
  it('basarisiz request gecikme istatistigine GIRMEZ, ayri sayilir', () => {
    // Cagiran yalnizca BASARILI gecikmeleri verir; failureCount ayri tasinir.
    const off = summarize([10, 10, 10]);
    const observe = summarize([12, 12, 12]);
    const r = evaluatePerformanceFitness({
      comparison: compareModes(off, observe),
      eventIntegrity: assessEventIntegrity(expectation([]), []),
      offFailureCount: 0,
      observeFailureCount: 2, // basarisiz varsa hukum FAIL olur
      runtimeErrorCount: 0,
      authorizationDelta: 0,
      responseContractDelta: 0,
    });
    expect(r.fitness).toBe('FAIL');
    expect(r.reasons.join(' ')).toContain('OBSERVE modunda basarisiz request: 2');
    // Ornek sayilari basarisizliklardan ETKILENMEZ (yalnizca basarili olanlar sayildi).
    expect(off.n).toBe(3);
    expect(observe.n).toBe(3);
  });
});

describe('performans hukmu', () => {
  const cleanIntegrity = () => assessEventIntegrity(expectation([]), []);
  const base = (off: number[], obs: number[]) => ({
    comparison: compareModes(summarize(off), summarize(obs)),
    eventIntegrity: cleanIntegrity(),
    offFailureCount: 0,
    observeFailureCount: 0,
    runtimeErrorCount: 0,
    authorizationDelta: 0,
    responseContractDelta: 0,
  });

  it('esik ici + temiz -> PASS_FOR_BOUNDED_CANARY', () => {
    const r = evaluatePerformanceFitness(base([40, 45, 50], [50, 55, 60]));
    expect(r.fitness).toBe('PASS_FOR_BOUNDED_CANARY');
    expect(r.reasons).toEqual([]);
    expect(r.thresholdChecks.p95AbsoluteOk).toBe(true);
  });

  it('olcum yoksa -> UNPROVEN (iyimser varsayim YOK)', () => {
    const r = evaluatePerformanceFitness(base([], []));
    expect(r.fitness).toBe('UNPROVEN');
    expect(r.thresholdChecks.p95RelativeOk).toBeNull();
  });

  it('p95 absolute esik asimi -> FAIL', () => {
    const r = evaluatePerformanceFitness(base([10, 10, 10], [10, 10, 200]));
    expect(r.fitness).toBe('FAIL');
    expect(r.thresholdChecks.p95AbsoluteOk).toBe(false);
  });

  it('p95 bagil esik asimi -> FAIL', () => {
    // +45ms absolute (esik ici) ama %450 bagil (esik disi)
    const r = evaluatePerformanceFitness(base([10, 10, 10], [55, 55, 55]));
    expect(r.fitness).toBe('FAIL');
    expect(r.thresholdChecks.p95AbsoluteOk).toBe(true);
    expect(r.thresholdChecks.p95RelativeOk).toBe(false);
  });

  it('tek-request max overhead esik asimi -> FAIL', () => {
    const r = evaluatePerformanceFitness(base([100, 100, 100], [100, 100, 300]));
    expect(r.fitness).toBe('FAIL');
    expect(r.thresholdChecks.maxSingleOk).toBe(false);
  });

  it('olay butunlugu ihlali -> FAIL (gecikme esikleri gecse bile)', () => {
    const bad = assessEventIntegrity(expectation(['ms-observe-a-1']), []);
    const r = evaluatePerformanceFitness({ ...base([10], [11]), eventIntegrity: bad });
    expect(r.fitness).toBe('FAIL');
    expect(r.reasons.join(' ')).toContain('MISSING_EVENT');
  });

  it('authorization/response delta sifir degilse -> FAIL', () => {
    const r = evaluatePerformanceFitness({ ...base([10], [11]), authorizationDelta: 1, responseContractDelta: 2 });
    expect(r.fitness).toBe('FAIL');
    expect(r.reasons.join(' ')).toContain('authorization delta: 1');
    expect(r.reasons.join(' ')).toContain('response contract delta: 2');
  });

  it('runtime hata varsa -> FAIL', () => {
    const r = evaluatePerformanceFitness({ ...base([10], [11]), runtimeErrorCount: 3 });
    expect(r.fitness).toBe('FAIL');
  });

  it('varsayilan esikler owner §14 degerleri', () => {
    expect(DEFAULT_PERF_THRESHOLDS).toEqual({
      p95AbsoluteOverheadMs: 50,
      p95RelativeOverheadPct: 50,
      maxSingleRequestOverheadMs: 150,
    });
  });
});

describe('probe tag sozlesmesi — warm-up ayristirmasi', () => {
  it('warm-up ve olculen set AYRI on-ek tasir', () => {
    expect(buildProbeTag('warmup', 'OBSERVE', 'A', 1)).toBe(`${WARMUP_PREFIX}-observe-a-1`);
    expect(buildProbeTag('measured', 'OFF', 'D', 25)).toBe(`${MEASURED_PREFIX}-off-d-25`);
  });

  it('isMeasuredTag yalniz olculen seti kabul eder', () => {
    expect(isMeasuredTag(buildProbeTag('measured', 'OBSERVE', 'B', 3))).toBe(true);
    expect(isMeasuredTag(buildProbeTag('warmup', 'OBSERVE', 'B', 3))).toBe(false);
  });

  it('tag deterministik ve cakismasiz', () => {
    const tags = new Set<string>();
    for (const mode of ['OFF', 'OBSERVE'] as const) {
      for (const actor of ['A', 'B', 'C', 'D']) {
        for (let i = 1; i <= 3; i++) tags.add(buildProbeTag('measured', mode, actor, i));
      }
    }
    expect(tags.size).toBe(2 * 4 * 3);
  });
});

describe('modul yuzeyi ve secret siniri', () => {
  it('export seti sabit; secret tasiyan hicbir yuzey yok', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('../office-cap02-telemetry-perf.core');
    expect(Object.keys(mod).sort()).toEqual([
      'DEFAULT_PERF_THRESHOLDS',
      'MEASURED_PREFIX',
      'PROHIBITED_EVENT_KEYS',
      'PROHIBITED_EVENT_VALUES',
      'WARMUP_PREFIX',
      'assessEventIntegrity',
      'buildProbeTag',
      'compareModes',
      'evaluatePerformanceFitness',
      'isMeasuredTag',
      'percentile',
      'summarize',
    ]);
  });

  it('cekirdek kaynagi Prisma/Nest/HTTP/saat/rastgelelik ICERMEZ', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '..', 'office-cap02-telemetry-perf.core.ts'),
      'utf8',
    );
    for (const banned of ['@prisma/client', '@nestjs', 'PrismaClient', 'fetch(', 'Math.random', 'Date.now', 'require(\'fs\')']) {
      expect(src).not.toContain(banned);
    }
  });
});

describe('telemetry failure isolation — YAPISAL kanit', () => {
  const servicePath = path.join(
    __dirname,
    '..',
    '..',
    'modules',
    'office-approval',
    'office-approval-shadow.service.ts',
  );

  it('recordReportingLineShadow donussuzdur ve try/catch ile sarilidir', () => {
    const src = fs.readFileSync(servicePath, 'utf8');
    const start = src.indexOf('private async recordReportingLineShadow');
    expect(start).toBeGreaterThan(-1);
    const body = src.slice(start);
    // Donus tipi Promise<void>: cagirana hicbir deger tasimaz.
    expect(body).toContain('Promise<void>');
    // Aktivasyon negatifse ILK prisma cagrisindan ONCE doner (dormant = 0 sorgu).
    const earlyReturn = body.indexOf('if (!activation.active) return;');
    const firstPrisma = body.indexOf('this.prisma.');
    expect(earlyReturn).toBeGreaterThan(-1);
    expect(firstPrisma).toBeGreaterThan(earlyReturn);
    // Olcum hatasi request'e SIZMAZ: govde try/catch ile sarili ve catch bos-yutar.
    const tryIdx = body.indexOf('try {');
    expect(tryIdx).toBeGreaterThan(earlyReturn);
    expect(tryIdx).toBeLessThan(firstPrisma);
    expect(body).toMatch(/}\s*catch\s*\{/);
  });

  it('telemetri cagrisi controller akisinda donus degeri KULLANILMAZ', () => {
    const src = fs.readFileSync(servicePath, 'utf8');
    // evaluate() icinde: `await this.recordReportingLineShadow(input);` — atama YOK.
    expect(src).toContain('await this.recordReportingLineShadow(input);');
    expect(src).not.toMatch(/=\s*await this\.recordReportingLineShadow/);
  });
});
