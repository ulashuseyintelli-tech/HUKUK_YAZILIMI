/**
 * OFFICE-P2-CAP02-NEUTRAL-TELEMETRY-PERFORMANCE-HARNESS-I01 — SAF ÇEKİRDEK.
 *
 * Nötr telemetry yolunun sentetik yük altındaki maliyetini, olay bütünlüğünü ve
 * request izolasyonunu DEĞERLENDİRME mantığı. Ölçümü çağıran yapar; bu modül
 * yalnız toplama/karşılaştırma/hüküm üretir.
 *
 * OWNER HÜKMÜ (2026-07-30): `ReportingLine` ORGANIZATIONAL FACT ONLY; authorization
 * ve enforcement girdisi DEĞİLDİR. Bu modül de hiçbir yetki kararı ÜRETMEZ —
 * yalnız gecikme istatistiği ve olay bütünlüğü hükmü verir.
 *
 * MİMARİ İLKE — Prisma/NestJS import ETMEZ, DB'ye erişmez, sistem saati okumaz,
 * `fs`/rastgelelik kullanmaz, HTTP yapmaz. Girdi ham örneklem; çıktı saf hüküm.
 *
 * ÖLÇÜM SÖZLEŞMESİ
 *  - Yüzdelik yöntemi: SIRALI (artan) örneklemde EN YAKIN SIRA (nearest-rank):
 *    index = ceil(p/100 * n) - 1, [0, n-1] aralığına kırpılır. Enterpolasyon YOK
 *    (küçük örneklemde uydurma ara değer üretmemek için bilinçli seçim).
 *  - BAŞARISIZ request'ler gecikme istatistiğine GİRMEZ (kısmi/kesilmiş süre
 *    dağılımı bozar) ama ayrı sayaçta RAPORLANIR. Bu ayrım testle sabitlenir.
 *  - Warm-up örneklemleri çağıran tarafından AYRI correlationId ön-ekiyle
 *    işaretlenir ve ölçülen sete DAHİL EDİLMEZ.
 */

/** Bir modun (OFF / OBSERVE) ham gecikme örneklemi ve sonuç sayaçları. */
export interface ModeSamples {
  label: 'OFF' | 'OBSERVE';
  /** Yalnız BAŞARILI request'lerin toplam controller süreleri (ms). */
  successLatenciesMs: readonly number[];
  /** Başarısız request sayısı (gecikme istatistiğine girmez). */
  failureCount: number;
  /** HTTP durum kodu dağılımı; şeffaflık için ham taşınır. */
  statusDistribution: Readonly<Record<string, number>>;
}

export interface LatencySummary {
  n: number;
  min: number;
  max: number;
  mean: number;
  p50: number;
  p95: number;
  p99: number;
}

const EMPTY_SUMMARY: LatencySummary = { n: 0, min: 0, max: 0, mean: 0, p50: 0, p95: 0, p99: 0 };

/** Nearest-rank yüzdelik. Boş örneklemde sıfırlanmış özet döner (uydurma değer YOK). */
export function percentile(sortedAsc: readonly number[], p: number): number {
  if (sortedAsc.length === 0) return 0;
  if (p <= 0) return sortedAsc[0];
  if (p >= 100) return sortedAsc[sortedAsc.length - 1];
  const idx = Math.ceil((p / 100) * sortedAsc.length) - 1;
  return sortedAsc[Math.min(Math.max(idx, 0), sortedAsc.length - 1)];
}

export function summarize(samplesMs: readonly number[]): LatencySummary {
  if (samplesMs.length === 0) return { ...EMPTY_SUMMARY };
  const sorted = [...samplesMs].sort((a, b) => a - b);
  const sum = sorted.reduce((acc, v) => acc + v, 0);
  return {
    n: sorted.length,
    min: sorted[0],
    max: sorted[sorted.length - 1],
    mean: sum / sorted.length,
    p50: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    p99: percentile(sorted, 99),
  };
}

export interface OverheadComparison {
  off: LatencySummary;
  observe: LatencySummary;
  /** OBSERVE − OFF, ms. Negatif olabilir (gürültü); maskelenmez. */
  absoluteDeltaMs: { p50: number; p95: number; p99: number };
  /** Bağıl fark %. OFF değeri 0 ise null (sıfıra bölme uydurulmaz). */
  relativeDeltaPct: { p50: number | null; p95: number | null; p99: number | null };
  /** En kötü tek-request farkı: OBSERVE max − OFF max. */
  maxOverheadMs: number;
}

function rel(observe: number, off: number): number | null {
  if (off === 0) return null;
  return ((observe - off) / off) * 100;
}

export function compareModes(off: LatencySummary, observe: LatencySummary): OverheadComparison {
  return {
    off,
    observe,
    absoluteDeltaMs: {
      p50: observe.p50 - off.p50,
      p95: observe.p95 - off.p95,
      p99: observe.p99 - off.p99,
    },
    relativeDeltaPct: {
      p50: rel(observe.p50, off.p50),
      p95: rel(observe.p95, off.p95),
      p99: rel(observe.p99, off.p99),
    },
    maxOverheadMs: observe.max - off.max,
  };
}

// ---------------------------------------------------------------------------
// OLAY BÜTÜNLÜĞÜ
// ---------------------------------------------------------------------------

/** Ölçüm sırasında gözlemlenen tek telemetri olayının denetlenebilir izdüşümü. */
export interface ObservedEvent {
  correlationId: string;
  tenantId: string;
  actorUserId: string;
  entityId: string;
  observedActionCode?: string;
  accessAffected?: unknown;
  decisionAffected?: unknown;
  /** Olay metadata'sının TÜM anahtarları — yasaklı alan taraması buradan yapılır. */
  metadataKeys: readonly string[];
  /** Serileştirilmiş metadata; yasaklı DEĞER taraması buradan yapılır. */
  metadataJson: string;
}

export interface EventIntegrityExpectation {
  /** Ölçülen (warm-up HARİÇ) request'lerin ürettiği beklenen correlationId kümesi. */
  expectedCorrelationIds: readonly string[];
  expectedTenantId: string;
  expectedActorUserIds: readonly string[];
  expectedEntityIds: readonly string[];
}

export type EventIntegrityFailureCode =
  | 'MISSING_EVENT'
  | 'DUPLICATE_EVENT'
  | 'UNEXPECTED_CORRELATION'
  | 'UNEXPECTED_TENANT'
  | 'UNEXPECTED_ACTOR'
  | 'UNEXPECTED_ENTITY'
  | 'WRONG_ACTION_CODE'
  | 'AFFECTED_FLAG_NOT_FALSE'
  | 'PROHIBITED_FIELD';

export interface EventIntegrityResult {
  expectedCount: number;
  actualCount: number;
  missing: string[];
  duplicate: string[];
  unexpectedCorrelation: string[];
  unexpectedTenantCount: number;
  unexpectedActorCount: number;
  unexpectedEntityCount: number;
  wrongActionCodeCount: number;
  affectedFlagViolationCount: number;
  prohibitedHits: string[];
  failures: EventIntegrityFailureCode[];
  ok: boolean;
}

/** Owner'ın yasakladığı politika alanları — hem anahtar hem değer düzeyinde aranır. */
export const PROHIBITED_EVENT_KEYS: readonly string[] = [
  'hierarchyVerdict',
  'hierarchyDecision',
  'severity',
];
export const PROHIBITED_EVENT_VALUES: readonly string[] = [
  'HIERARCHY_WOULD_ALLOW',
  'HIERARCHY_WOULD_REQUIRE_APPROVAL',
];

export function assessEventIntegrity(
  expectation: EventIntegrityExpectation,
  events: readonly ObservedEvent[],
): EventIntegrityResult {
  const expected = new Set(expectation.expectedCorrelationIds);
  const seen = new Map<string, number>();
  for (const e of events) seen.set(e.correlationId, (seen.get(e.correlationId) ?? 0) + 1);

  const missing = [...expected].filter((id) => !seen.has(id)).sort();
  const duplicate = [...seen.entries()].filter(([, c]) => c > 1).map(([id]) => id).sort();
  const unexpectedCorrelation = [...seen.keys()].filter((id) => !expected.has(id)).sort();

  let unexpectedTenantCount = 0;
  let unexpectedActorCount = 0;
  let unexpectedEntityCount = 0;
  let wrongActionCodeCount = 0;
  let affectedFlagViolationCount = 0;
  const prohibitedHits: string[] = [];

  for (const e of events) {
    if (e.tenantId !== expectation.expectedTenantId) unexpectedTenantCount++;
    if (!expectation.expectedActorUserIds.includes(e.actorUserId)) unexpectedActorCount++;
    if (!expectation.expectedEntityIds.includes(e.entityId)) unexpectedEntityCount++;
    if (e.observedActionCode !== 'CHANGE_STATUS') wrongActionCodeCount++;
    if (e.accessAffected !== false || e.decisionAffected !== false) affectedFlagViolationCount++;
    for (const k of PROHIBITED_EVENT_KEYS) {
      if (e.metadataKeys.includes(k)) prohibitedHits.push(`key:${k}`);
    }
    for (const v of PROHIBITED_EVENT_VALUES) {
      if (e.metadataJson.includes(v)) prohibitedHits.push(`value:${v}`);
    }
  }

  const failures: EventIntegrityFailureCode[] = [];
  if (missing.length > 0) failures.push('MISSING_EVENT');
  if (duplicate.length > 0) failures.push('DUPLICATE_EVENT');
  if (unexpectedCorrelation.length > 0) failures.push('UNEXPECTED_CORRELATION');
  if (unexpectedTenantCount > 0) failures.push('UNEXPECTED_TENANT');
  if (unexpectedActorCount > 0) failures.push('UNEXPECTED_ACTOR');
  if (unexpectedEntityCount > 0) failures.push('UNEXPECTED_ENTITY');
  if (wrongActionCodeCount > 0) failures.push('WRONG_ACTION_CODE');
  if (affectedFlagViolationCount > 0) failures.push('AFFECTED_FLAG_NOT_FALSE');
  if (prohibitedHits.length > 0) failures.push('PROHIBITED_FIELD');

  return {
    expectedCount: expected.size,
    actualCount: events.length,
    missing,
    duplicate,
    unexpectedCorrelation,
    unexpectedTenantCount,
    unexpectedActorCount,
    unexpectedEntityCount,
    wrongActionCodeCount,
    affectedFlagViolationCount,
    prohibitedHits: Array.from(new Set(prohibitedHits)).sort(),
    failures,
    ok: failures.length === 0,
  };
}

// ---------------------------------------------------------------------------
// PERFORMANS HÜKMÜ
// ---------------------------------------------------------------------------

/**
 * Owner §14 bounded canary fitness eşikleri. NİHAİ SLA DEĞİLDİR.
 */
export interface PerfThresholds {
  p95AbsoluteOverheadMs: number;
  p95RelativeOverheadPct: number;
  maxSingleRequestOverheadMs: number;
}

export const DEFAULT_PERF_THRESHOLDS: PerfThresholds = {
  p95AbsoluteOverheadMs: 50,
  p95RelativeOverheadPct: 50,
  maxSingleRequestOverheadMs: 150,
};

export type PerfFitness = 'PASS_FOR_BOUNDED_CANARY' | 'FAIL' | 'UNPROVEN';

export interface PerfFitnessInput {
  comparison: OverheadComparison;
  eventIntegrity: EventIntegrityResult;
  /** İki modun BAŞARISIZ request sayıları. */
  offFailureCount: number;
  observeFailureCount: number;
  /** Runtime hata sayısı (log taramasından; route-adı gürültüsü hariç). */
  runtimeErrorCount: number;
  /** Yetki/response sözleşmesi farkı — 0 olmak zorunda. */
  authorizationDelta: number;
  responseContractDelta: number;
  thresholds?: PerfThresholds;
}

export interface PerfFitnessResult {
  fitness: PerfFitness;
  reasons: string[];
  thresholdChecks: {
    p95AbsoluteOk: boolean;
    p95RelativeOk: boolean | null;
    maxSingleOk: boolean;
  };
}

/**
 * Hüküm. Ölçüm yoksa `UNPROVEN` (asla iyimser varsayım yapılmaz); eşik/bütünlük
 * ihlali varsa `FAIL`; hepsi geçerse `PASS_FOR_BOUNDED_CANARY`.
 * `PASS_FOR_BOUNDED_CANARY` production-wide SLA onayı DEĞİLDİR.
 */
export function evaluatePerformanceFitness(input: PerfFitnessInput): PerfFitnessResult {
  const t = input.thresholds ?? DEFAULT_PERF_THRESHOLDS;
  const reasons: string[] = [];

  // 1) Ölçüm var mı — yoksa hüküm UNPROVEN.
  if (input.comparison.off.n === 0 || input.comparison.observe.n === 0) {
    return {
      fitness: 'UNPROVEN',
      reasons: ['iki moddan en az biri icin olculmus ornek YOK'],
      thresholdChecks: { p95AbsoluteOk: false, p95RelativeOk: null, maxSingleOk: false },
    };
  }

  const p95AbsoluteOk = input.comparison.absoluteDeltaMs.p95 <= t.p95AbsoluteOverheadMs;
  const relP95 = input.comparison.relativeDeltaPct.p95;
  const p95RelativeOk = relP95 === null ? null : relP95 <= t.p95RelativeOverheadPct;
  const maxSingleOk = input.comparison.maxOverheadMs <= t.maxSingleRequestOverheadMs;

  if (!input.eventIntegrity.ok) reasons.push(`olay butunlugu ihlali: ${input.eventIntegrity.failures.join(', ')}`);
  if (input.offFailureCount > 0) reasons.push(`OFF modunda basarisiz request: ${input.offFailureCount}`);
  if (input.observeFailureCount > 0) reasons.push(`OBSERVE modunda basarisiz request: ${input.observeFailureCount}`);
  if (input.runtimeErrorCount > 0) reasons.push(`runtime hata: ${input.runtimeErrorCount}`);
  if (input.authorizationDelta !== 0) reasons.push(`authorization delta: ${input.authorizationDelta}`);
  if (input.responseContractDelta !== 0) reasons.push(`response contract delta: ${input.responseContractDelta}`);
  if (!p95AbsoluteOk) {
    reasons.push(`p95 absolute overhead ${input.comparison.absoluteDeltaMs.p95}ms > ${t.p95AbsoluteOverheadMs}ms`);
  }
  if (p95RelativeOk === false) {
    reasons.push(`p95 relative overhead ${relP95}% > ${t.p95RelativeOverheadPct}%`);
  }
  if (!maxSingleOk) {
    reasons.push(`max single-request overhead ${input.comparison.maxOverheadMs}ms > ${t.maxSingleRequestOverheadMs}ms`);
  }

  return {
    fitness: reasons.length === 0 ? 'PASS_FOR_BOUNDED_CANARY' : 'FAIL',
    reasons,
    thresholdChecks: { p95AbsoluteOk, p95RelativeOk, maxSingleOk },
  };
}

// ---------------------------------------------------------------------------
// CORRELATION ID SÖZLEŞMESİ
// ---------------------------------------------------------------------------

export const WARMUP_PREFIX = 'wu';
export const MEASURED_PREFIX = 'ms';

/**
 * Deterministik probe correlationId. Warm-up ve ölçülen set AYRI ön-ek taşır;
 * böylece warm-up olayları ölçülen sete karışmaz.
 *
 * NOT: bu, telemetri olayının KENDİ `correlationId` alanı DEĞİLDİR (o alan
 * `actionCode|targetType|targetRef`'ten türer ve bu modül onu değiştirmez).
 * Burada üretilen değer request `reason` alanına gömülür ve olayla, olayın
 * `entityId` + zaman sırası üzerinden eşleştirilir.
 */
export function buildProbeTag(
  phase: 'warmup' | 'measured',
  mode: 'OFF' | 'OBSERVE',
  actorKey: string,
  index: number,
): string {
  const prefix = phase === 'warmup' ? WARMUP_PREFIX : MEASURED_PREFIX;
  return `${prefix}-${mode.toLowerCase()}-${actorKey.toLowerCase()}-${index}`;
}

export function isMeasuredTag(tag: string): boolean {
  return tag.startsWith(`${MEASURED_PREFIX}-`);
}
