/**
 * OFFICE-P2-CAP02-NEUTRAL-TELEMETRY-PERFORMANCE-HARNESS-R02 — SAF ÇEKİRDEK.
 *
 * R01 ölçümü `FAIL / INVESTIGATION REQUIRED` hükmüyle kapandı: OBSERVE modunda
 * p95 overhead +101.15 ms (eşik 50) ve max +154.67 ms (eşik 150). R01'de tüm kuyruk
 * SERIAL fazda toplanmıştı; sıra OFF→OBSERVE olduğu için **order bias** ve
 * **cold-path** olasılığı ölçümle ayrıştırılamadı.
 *
 * R02 TEK BİR SORUYU sınar: aşım cold-path/order bias kaynaklı mı, yoksa warmed
 * steady-state maliyeti mi? R01 sonucunu ÜZERİNE YAZMAZ, silmez; bağımsız bir
 * reconciliation üretir. Eşikler R01 ile AYNIDIR — sonuca uydurmak için
 * revize EDİLEMEZ (owner §14).
 *
 * MİMARİ İLKE — Prisma/NestJS/HTTP/saat/rastgelelik YOK. Girdi ham örneklem;
 * çıktı segment istatistiği ve hüküm.
 *
 * SEGMENT SÖZLEŞMESİ (kodda sabit, raporda aynen yazılır):
 *   FIRST_10        : 1..10                    (cold)
 *   REQUESTS_11_20  : 11..20                   (cold kuyruğu)
 *   MIDDLE_10       : ortadaki 10 (merkezlenmiş)
 *   LAST_10         : son 10
 *   STEADY_STATE    : ilk `STEADY_STATE_EXCLUDE_FIRST` HARİÇ tümü
 * Ana fitness hükmü STEADY_STATE setinden üretilir; cold veriler AYRICA raporlanır.
 */

import {
  compareModes,
  summarize,
  DEFAULT_PERF_THRESHOLDS,
  type LatencySummary,
  type OverheadComparison,
  type PerfThresholds,
} from './office-cap02-telemetry-perf.core';

/** Warmed steady-state tanımı: ilk 20 ölçülen request hariç tutulur. */
export const STEADY_STATE_EXCLUDE_FIRST = 20;

/** Ölçülen request üst sınırı (owner §6). Kod tarafında zorlanır. */
export const R02_MEASURED_BUDGET = 400;

export const R02_SEGMENT_KEYS = [
  'FIRST_10',
  'REQUESTS_11_20',
  'MIDDLE_10',
  'LAST_10',
  'STEADY_STATE',
] as const;
export type R02SegmentKey = (typeof R02_SEGMENT_KEYS)[number];

export type R02SegmentSummaries = Record<R02SegmentKey, LatencySummary>;

/**
 * Örneklemi YÜRÜTME SIRASINA göre segmentlere böler ve her segmenti özetler.
 * Örneklem kısa ise segment boş kalabilir; boş segment `n:0` özetiyle döner
 * (uydurma değer ÜRETİLMEZ).
 */
export function segmentSamples(orderedMs: readonly number[]): R02SegmentSummaries {
  const n = orderedMs.length;
  const slice = (from: number, to: number) => orderedMs.slice(Math.max(from, 0), Math.min(to, n));
  const midStart = Math.max(Math.floor((n - 10) / 2), 0);
  return {
    FIRST_10: summarize(slice(0, 10)),
    REQUESTS_11_20: summarize(slice(10, 20)),
    MIDDLE_10: summarize(slice(midStart, midStart + 10)),
    LAST_10: summarize(slice(n - 10, n)),
    STEADY_STATE: summarize(slice(STEADY_STATE_EXCLUDE_FIRST, n)),
  };
}

/** Bir bloktaki tek modun ölçüm sonucu. */
export interface R02ModeRun {
  block: 1 | 2;
  mode: 'OFF' | 'OBSERVE';
  /** Yürütme sırasında BAŞARILI request gecikmeleri (ms). */
  orderedSuccessMs: readonly number[];
  failureCount: number;
  runtimeErrorCount: number;
  telemetryEventDelta: number;
  /** Ölçülen (warm-up hariç) request sayısı. */
  measuredRequestCount: number;
}

export interface R02BlockResult {
  block: 1 | 2;
  /** Bloğun FİİLİ yürütme sırası; hard-code EDİLMEZ, ölçümden gelir. */
  order: string;
  off: { segments: R02SegmentSummaries; all: LatencySummary };
  observe: { segments: R02SegmentSummaries; all: LatencySummary };
  /** STEADY_STATE setleri üzerinden overhead — ana fitness girdisi. */
  steadyOverhead: OverheadComparison;
  /** Cold segment (FIRST_10) üzerinden overhead — yalnız tanı amaçlı. */
  coldOverhead: OverheadComparison;
}

export function buildBlockResult(offRun: R02ModeRun, observeRun: R02ModeRun): R02BlockResult {
  if (offRun.block !== observeRun.block) throw new Error('R02_BLOCK_MISMATCH');
  if (offRun.mode !== 'OFF' || observeRun.mode !== 'OBSERVE') throw new Error('R02_MODE_MISMATCH');
  const offSeg = segmentSamples(offRun.orderedSuccessMs);
  const obsSeg = segmentSamples(observeRun.orderedSuccessMs);
  return {
    block: offRun.block,
    // Sıra, iki run'ın hangisinin once yurutuldugu bilgisinden turer; cagiran verir.
    order: offRun.block === 1 ? 'OFF->OBSERVE' : 'OBSERVE->OFF',
    off: { segments: offSeg, all: summarize(offRun.orderedSuccessMs) },
    observe: { segments: obsSeg, all: summarize(observeRun.orderedSuccessMs) },
    steadyOverhead: compareModes(offSeg.STEADY_STATE, obsSeg.STEADY_STATE),
    coldOverhead: compareModes(offSeg.FIRST_10, obsSeg.FIRST_10),
  };
}

// ---------------------------------------------------------------------------
// BÜTÇE VE BLOK EŞİTLİĞİ
// ---------------------------------------------------------------------------

export type R02GuardFailure =
  | 'BUDGET_EXCEEDED'
  | 'BLOCK_ORDER_MISMATCH'
  | 'UNEQUAL_BLOCK_CONDITIONS'
  | 'MISSING_BLOCK';

/**
 * Ölçüm setlerinin karşılaştırılabilir OLDUĞUNU doğrular. Eşit olmayan koşullar
 * hükmü geçersiz kılar (owner §23: unequal sets → INCONCLUSIVE).
 */
export function assertR02Guards(runs: readonly R02ModeRun[]): {
  ok: boolean;
  failures: R02GuardFailure[];
  totalMeasured: number;
} {
  const failures: R02GuardFailure[] = [];
  const total = runs.reduce((a, r) => a + r.measuredRequestCount, 0);
  if (total > R02_MEASURED_BUDGET) failures.push('BUDGET_EXCEEDED');

  const b1 = runs.filter((r) => r.block === 1);
  const b2 = runs.filter((r) => r.block === 2);
  if (b1.length !== 2 || b2.length !== 2) failures.push('MISSING_BLOCK');

  // Her blokta TAM OLARAK bir OFF + bir OBSERVE olmalı.
  // NOT: sıralamaya güvenilmez — 'OBSERVE' lexicographic olarak 'OFF'tan ÖNCE
  // gelir ('B' < 'F'), bu yüzden sayım yapılır.
  for (const b of [b1, b2]) {
    if (b.length === 2) {
      const offCount = b.filter((r) => r.mode === 'OFF').length;
      const observeCount = b.filter((r) => r.mode === 'OBSERVE').length;
      if (offCount !== 1 || observeCount !== 1) failures.push('BLOCK_ORDER_MISMATCH');
    }
  }

  // Tüm run'lar AYNI ölçülen request sayısına sahip olmalı (mode eşitliği).
  const counts = Array.from(new Set(runs.map((r) => r.measuredRequestCount)));
  if (counts.length > 1) failures.push('UNEQUAL_BLOCK_CONDITIONS');

  return { ok: failures.length === 0, failures: Array.from(new Set(failures)), totalMeasured: total };
}

// ---------------------------------------------------------------------------
// RECONCILIATION
// ---------------------------------------------------------------------------

export type R02Disposition =
  | 'COLD_PATH_CONFIRMED'
  | 'STEADY_STATE_OVERHEAD_CONFIRMED'
  | 'MIXED'
  | 'INCONCLUSIVE';

export type R02Fitness = 'PASS_FOR_BOUNDED_CANARY' | 'FAIL';

export interface R02ReconciliationInput {
  blocks: readonly R02BlockResult[];
  runs: readonly R02ModeRun[];
  /** Olay bütünlüğü iki blokta da PASS mi. */
  eventIntegrityOk: boolean;
  authorizationDelta: number;
  responseContractDelta: number;
  thresholds?: PerfThresholds;
}

export interface R02ReconciliationResult {
  disposition: R02Disposition;
  fitness: R02Fitness;
  reasons: string[];
  /** Blok başına steady-state eşik sonucu — şeffaflık için ham taşınır. */
  perBlockSteadyPass: { block: 1 | 2; pass: boolean; failed: string[] }[];
  /** Cold örüntüsü iki blokta da tekrarlandı mı (cold >> steady). */
  coldPatternRepeated: boolean;
  totalMeasured: number;
}

/** Bir bloğun steady-state overhead'i eşikleri geçiyor mu. */
function steadyThresholdCheck(
  b: R02BlockResult,
  t: PerfThresholds,
): { pass: boolean; failed: string[] } {
  const failed: string[] = [];
  const o = b.steadyOverhead;
  if (o.absoluteDeltaMs.p95 > t.p95AbsoluteOverheadMs) {
    failed.push(`p95_absolute ${o.absoluteDeltaMs.p95.toFixed(2)}ms > ${t.p95AbsoluteOverheadMs}ms`);
  }
  const rel = o.relativeDeltaPct.p95;
  if (rel !== null && rel > t.p95RelativeOverheadPct) {
    failed.push(`p95_relative ${rel.toFixed(1)}% > ${t.p95RelativeOverheadPct}%`);
  }
  if (o.maxOverheadMs > t.maxSingleRequestOverheadMs) {
    failed.push(`max_single ${o.maxOverheadMs.toFixed(2)}ms > ${t.maxSingleRequestOverheadMs}ms`);
  }
  return { pass: failed.length === 0, failed };
}

/**
 * R02 hükmü. Cold-path YALNIZ şu üç koşul birlikte sağlanırsa doğrulanır
 * (owner §11/§23): (1) cold segment belirgin yüksek, (2) steady-state İKİ blokta
 * da eşik altında, (3) sıra tersine çevrilince sonuç değişmiyor.
 */
export function reconcileR02(input: R02ReconciliationInput): R02ReconciliationResult {
  const t = input.thresholds ?? DEFAULT_PERF_THRESHOLDS;
  const reasons: string[] = [];
  const guards = assertR02Guards(input.runs);

  const perBlockSteadyPass = input.blocks.map((b) => ({
    block: b.block,
    ...steadyThresholdCheck(b, t),
  }));

  // Cold örüntüsü: her blokta OBSERVE cold p95, OBSERVE steady p95'in belirgin
  // üstünde olmalı (>= 2x). Bu bir POLITIKA degil, olcum oruntusu testidir.
  const coldPatternRepeated =
    input.blocks.length === 2 &&
    input.blocks.every((b) => {
      const cold = b.observe.segments.FIRST_10.p95;
      const steady = b.observe.segments.STEADY_STATE.p95;
      return steady > 0 && cold >= steady * 2;
    });

  // Sert bloklayıcılar — hüküm üretilemez.
  if (!guards.ok) reasons.push(`olcum guard ihlali: ${guards.failures.join(', ')}`);
  if (!input.eventIntegrityOk) reasons.push('olay butunlugu PASS degil');
  if (input.authorizationDelta !== 0) reasons.push(`authorization delta: ${input.authorizationDelta}`);
  if (input.responseContractDelta !== 0) reasons.push(`response delta: ${input.responseContractDelta}`);
  const anyFailure = input.runs.some((r) => r.failureCount > 0);
  const anyRuntimeError = input.runs.some((r) => r.runtimeErrorCount > 0);
  if (anyFailure) reasons.push('basarisiz request var');
  if (anyRuntimeError) reasons.push('runtime hata var');
  // Beyan tutarliligi: OFF'ta olay 0, OBSERVE'ta olay > 0 olmali.
  for (const r of input.runs) {
    if (r.mode === 'OFF' && r.telemetryEventDelta !== 0) {
      reasons.push(`blok ${r.block} OFF modunda telemetry delta ${r.telemetryEventDelta} (0 olmaliydi)`);
    }
    if (r.mode === 'OBSERVE' && r.telemetryEventDelta <= 0) {
      reasons.push(`blok ${r.block} OBSERVE modunda telemetry delta ${r.telemetryEventDelta} (>0 olmaliydi)`);
    }
  }

  if (reasons.length > 0) {
    return {
      disposition: 'INCONCLUSIVE',
      fitness: 'FAIL',
      reasons,
      perBlockSteadyPass,
      coldPatternRepeated,
      totalMeasured: guards.totalMeasured,
    };
  }

  const passCount = perBlockSteadyPass.filter((b) => b.pass).length;

  if (passCount === 2) {
    // Steady-state iki blokta da esik altinda. Cold oruntusu tekrarlandiysa
    // R01 asimi cold-path/order bias olarak uzlastirilir.
    if (coldPatternRepeated) {
      return {
        disposition: 'COLD_PATH_CONFIRMED',
        fitness: 'PASS_FOR_BOUNDED_CANARY',
        reasons: ['steady-state iki blokta esik altinda; cold segment oruntusu iki blokta tekrarlandi'],
        perBlockSteadyPass,
        coldPatternRepeated,
        totalMeasured: guards.totalMeasured,
      };
    }
    // Steady-state temiz ama cold oruntusu YOK: R01 asimi bu kosuda hic
    // yeniden uretilemedi → cold-path DOGRULANMADI, yalnizca steady-state temiz.
    return {
      disposition: 'MIXED',
      fitness: 'PASS_FOR_BOUNDED_CANARY',
      reasons: [
        'steady-state iki blokta esik altinda ANCAK cold segment oruntusu tekrarlanmadi;',
        'R01 asiminin nedeni bu olcumle DOGRULANMADI (cold-path iddiasi kanitlanmadi).',
      ],
      perBlockSteadyPass,
      coldPatternRepeated,
      totalMeasured: guards.totalMeasured,
    };
  }

  if (passCount === 0) {
    return {
      disposition: 'STEADY_STATE_OVERHEAD_CONFIRMED',
      fitness: 'FAIL',
      reasons: [
        'steady-state esik asimi IKI blokta da tekrarlandi',
        ...perBlockSteadyPass.flatMap((b) => b.failed.map((f) => `blok ${b.block}: ${f}`)),
      ],
      perBlockSteadyPass,
      coldPatternRepeated,
      totalMeasured: guards.totalMeasured,
    };
  }

  // Bir blok PASS, diger blok FAIL → order effect cozulemedi.
  return {
    disposition: 'MIXED',
    fitness: 'FAIL',
    reasons: [
      'bloklar arasi celiski: bir blok esik altinda, diger blok asiyor (order effect cozulemedi)',
      ...perBlockSteadyPass.flatMap((b) => b.failed.map((f) => `blok ${b.block}: ${f}`)),
    ],
    perBlockSteadyPass,
    coldPatternRepeated,
    totalMeasured: guards.totalMeasured,
  };
}

// ---------------------------------------------------------------------------
// R01 + R02 BİRLEŞİK HÜKÜM
// ---------------------------------------------------------------------------

export interface CombinedDisposition {
  r01: 'FAIL';
  r02Disposition: R02Disposition;
  r02Fitness: R02Fitness;
  combined: string;
  productionScaleFitness: 'NOT_ASSESSED';
}

/**
 * R01 kaydı ASLA silinmez. Birleşik metin R01'i "yanlış" ilan ETMEZ; yalnız
 * counterbalanced R02'nin onu uzlaştırıp uzlaştırmadığını söyler.
 */
export function buildCombinedDisposition(r: R02ReconciliationResult): CombinedDisposition {
  let combined: string;
  switch (r.disposition) {
    case 'COLD_PATH_CONFIRMED':
      combined =
        'R01 failure reconciled by counterbalanced R02 (cold-path/order bias); ' +
        'production-scale fitness not assessed';
      break;
    case 'STEADY_STATE_OVERHEAD_CONFIRMED':
      combined = 'performance defect confirmed by counterbalanced R02; R01 FAIL stands';
      break;
    case 'MIXED':
      combined =
        r.fitness === 'PASS_FOR_BOUNDED_CANARY'
          ? 'R02 steady-state within thresholds but R01 exceedance NOT reproduced; ' +
            'cause remains unexplained; R01 FAIL record stands'
          : 'R02 blocks disagree; order effect unresolved; R01 FAIL stands';
      break;
    default:
      combined = 'R02 inconclusive; R01 FAIL stands unreconciled';
  }
  return {
    r01: 'FAIL',
    r02Disposition: r.disposition,
    r02Fitness: r.fitness,
    combined,
    productionScaleFitness: 'NOT_ASSESSED',
  };
}

// ---------------------------------------------------------------------------
// BLOK FARKINDALIKLI PROBE TAG
// ---------------------------------------------------------------------------

/**
 * Blok + faz + mod farkındalıklı probe etiketi. Warm-up ve measured setler AYRI
 * ön-ek taşır; bloklar da birbirine karışmaz.
 */
export function buildR02ProbeTag(
  block: 1 | 2,
  phase: 'warmup' | 'measured',
  mode: 'OFF' | 'OBSERVE',
  actorKey: string,
  index: number,
): string {
  const prefix = phase === 'warmup' ? 'warmup-r02' : 'measure-r02';
  return `${prefix}-b${block}-${mode.toLowerCase()}-${actorKey.toLowerCase()}-${index}`;
}

export function isR02MeasuredTag(tag: string): boolean {
  return tag.startsWith('measure-r02-');
}
