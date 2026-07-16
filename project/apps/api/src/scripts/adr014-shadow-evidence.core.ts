/**
 * ADR-014 / CCB-001 / CAN-CUT-02 — Local Baseline + Shadow Evidence Runner: SAF ÇEKİRDEK.
 *
 * Bu dosya, onaylanmış `ADR-014 LOCAL BASELINE + SHADOW EVIDENCE RUNNER` GO-ANALYZE tasarımının
 * saf (DB'siz, I/O'suz, NestJS'siz, deterministik) mantık katmanıdır. Legacy↔canonical shadow
 * karşılaştırma çıktısını (mevcut `BalanceDisplayShadowDiffService.compare()` raporundan çıkarılan
 * alanlar) parity/latency/blocker kanıtına dönüştürür; kimlik verisi taşımaz (opak Case Id).
 *
 * MİMARİ İLKE — bu dosya:
 *  - Prisma/NestJS import ETMEZ; DB'ye erişemez → mutation riski yapısal olarak yoktur.
 *  - Sistem saati (Date.now/new Date) veya `fs` KULLANMAZ; tüm zaman damgaları dışarıdan geçilir
 *    (deterministik testlenebilirlik + tekrar-çalıştırılabilirlik).
 *  - Hesaplama/karşılaştırma OTORİTESİ ÜRETMEZ: karşılaştırmayı yeniden yapmaz, yalnız
 *    `compare()`'in ürettiği alanları sınıflandırıp toplar (REC-AUTH-000: ikinci otorite yok).
 *
 * KANONİK 0-CENT KURALI (adr-014-zero-cent-discrepancy-monitoring-contract, ADR014-PE-01, §4):
 * finansal tolerans 0 cent'tir. Sıfırdan farklı HERHANGİ bir minor-unit delta = FINANCIAL_DISCREPANCY.
 * Shadow servisinin `MINOR_DELTA_PERCENT = 1` yüzde-eşiği bir KABUL TOLERANSI DEĞİLDİR ve burada
 * kullanılmaz (PE01-G01 hizalaması).
 */

// ---------------------------------------------------------------------------
// Enums / verdicts
// ---------------------------------------------------------------------------

/** Bir case için shadow koşum sonucu (contract §5.1 `outcome` etiketiyle uyumlu). */
export type RunOutcome =
  | 'SUCCESS'
  | 'LEGACY_UNAVAILABLE'
  | 'CANONICAL_UNAVAILABLE'
  | 'BOTH_UNAVAILABLE'
  | 'ERROR'
  | 'TIMEOUT';

/** Tek bir finansal alan için parity kararı. */
export type ParityVerdict = 'EXACT' | 'FINANCIAL_DISCREPANCY' | 'MISSING' | 'NOT_COMPARABLE';

/** Bir case'in bütünsel kararı. */
export type CaseVerdict = 'EXACT' | 'DISCREPANCY' | 'FAIL_CLOSED' | 'UNAVAILABLE';

export const RUNNER_VERSION = 'adr014-local-shadow-evidence-runner-v1.0' as const;

// ---------------------------------------------------------------------------
// Para birimi — minor unit dönüşümü
// ---------------------------------------------------------------------------

/**
 * Bir para değerini (major unit / TL) minor unit'e (kuruş) çevirir. `compare()` raporundaki
 * `delta`/tutar alanları 2 ondalıklı major unit'tir; 0-cent kuralı minor unit üzerinden uygulanır.
 * `toFixed()` KULLANILMAZ (repo eslint `no-restricted-syntax`); tamsayı yuvarlama ile yapılır.
 */
export function toMinorUnits(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const scaled = value * 100;
  return scaled >= 0
    ? Math.round(scaled + Number.EPSILON)
    : -Math.round(-scaled + Number.EPSILON);
}

// ---------------------------------------------------------------------------
// Alan-düzeyi parity
// ---------------------------------------------------------------------------

/** `compare()` raporundan çıkarılan tek bir diff satırı (total veya bucket). */
export interface FieldDiffInput {
  /** Diff kodu, örn. `OUTSTANDING_DELTA`, `PRINCIPAL_BUCKET_DELTA`. */
  code: string;
  /** Bounded alan adı (metric label cardinality), örn. `OUTSTANDING`, `PRINCIPAL`. */
  field: string;
  /** Bucket diff ise bucket adı; total diff'te tanımsız. */
  bucket?: string;
  legacyAmount: number | null;
  canonicalAmount: number | null;
  /** major unit delta (canonical − legacy); rapor tarafından hesaplanmış olabilir. */
  delta: number | null;
  /** ShadowAmountDiffStatus: MATCH | MINOR_DELTA | MAJOR_DELTA | LEGACY_ONLY | CANONICAL_ONLY | NOT_COMPARABLE */
  status: string;
}

export interface FieldParityResult {
  code: string;
  field: string;
  bucket?: string;
  /** kuruş cinsinden delta; karşılaştırılamıyorsa null. */
  minorUnitDelta: number | null;
  isZeroDelta: boolean;
  status: string;
  verdict: ParityVerdict;
}

/**
 * Tek bir finansal alanı KANONİK 0-CENT kuralıyla sınıflandırır. Yüzde-tabanlı `MINOR_DELTA`
 * gevşemesi UYGULANMAZ: her sıfırdan-farklı kuruş = FINANCIAL_DISCREPANCY.
 */
export function classifyFieldParity(input: FieldDiffInput): FieldParityResult {
  const base = { code: input.code, field: input.field, bucket: input.bucket, status: input.status };

  // Bir taraf yok → zorunlu finansal kanıt eksik → fail-closed (contract §4).
  if (input.status === 'LEGACY_ONLY' || input.status === 'CANONICAL_ONLY') {
    return { ...base, minorUnitDelta: null, isZeroDelta: false, verdict: 'MISSING' };
  }
  if (input.status === 'NOT_COMPARABLE') {
    return { ...base, minorUnitDelta: null, isZeroDelta: false, verdict: 'NOT_COMPARABLE' };
  }

  // Her iki taraf mevcut: delta'yı kuruşa çevir. Rapor delta vermişse onu, vermemişse
  // canonical − legacy'yi kullan.
  const deltaSource =
    input.delta != null
      ? input.delta
      : input.legacyAmount != null && input.canonicalAmount != null
        ? input.canonicalAmount - input.legacyAmount
        : null;

  if (deltaSource == null) {
    // Status karşılaştırılabilir diyor ama sayısal temel yok → güvenli tarafta fail-closed.
    return { ...base, minorUnitDelta: null, isZeroDelta: false, verdict: 'NOT_COMPARABLE' };
  }

  const minorUnitDelta = toMinorUnits(deltaSource);
  const isZeroDelta = minorUnitDelta === 0;
  return {
    ...base,
    minorUnitDelta,
    isZeroDelta,
    verdict: isZeroDelta ? 'EXACT' : 'FINANCIAL_DISCREPANCY',
  };
}

// ---------------------------------------------------------------------------
// Case-düzeyi kanıt
// ---------------------------------------------------------------------------

/** Bir case'in shadow koşumundan çıkarılan ham girdi (runner tarafından doldurulur). */
export interface CaseShadowInput {
  tenantId: string;
  caseId: string;
  asOfDate: string;
  /** Owner tarafından sağlanan temsililik etiketleri (runner ÜRETMEZ). */
  scenarioClass: string;
  currencyGroup: string;
  caseSizeBucket: string;
  outcome: RunOutcome;
  legacyAvailable: boolean;
  canonicalAvailable: boolean;
  currency: string | null;
  totalsDiffs: FieldDiffInput[];
  bucketDiffs: FieldDiffInput[];
  /** cutoverReadiness.blockers */
  readinessBlockers: string[];
  /** comparability.blockers[].code */
  comparabilityBlockerCodes: string[];
  /** diagnostics[].code */
  diagnosticsCodes: string[];
  safeForPrimaryDisplay: boolean;
  /** compare() çağrısının ölçülen wall-clock süresi (ms, monotonik). */
  orchestrationDurationMs: number;
}

/** Bir case için opak-Id'li, kimliksiz kanıt kaydı. */
export interface CaseEvidence {
  opaqueId: string;
  outcome: RunOutcome;
  caseVerdict: CaseVerdict;
  zeroCentClean: boolean;
  currency: string | null;
  scenarioClass: string;
  currencyGroup: string;
  caseSizeBucket: string;
  legacyAvailable: boolean;
  canonicalAvailable: boolean;
  safeForPrimaryDisplay: boolean;
  orchestrationDurationMs: number;
  fieldResults: FieldParityResult[];
  blockerCodes: string[];
  diagnosticsCodes: string[];
}

function dedupe(values: string[]): string[] {
  return [...new Set(values)].sort();
}

/**
 * Bir case'in ham girdisini → sınıflandırılmış, opak-Id'li kanıt kaydına çevirir.
 * caseVerdict önceliği: UNAVAILABLE > DISCREPANCY > FAIL_CLOSED > EXACT.
 */
export function buildCaseEvidence(input: CaseShadowInput, opaqueId: string): CaseEvidence {
  const fieldResults = [...input.totalsDiffs, ...input.bucketDiffs].map(classifyFieldParity);
  const anyDiscrepancy = fieldResults.some((r) => r.verdict === 'FINANCIAL_DISCREPANCY');
  const anyUnknown = fieldResults.some((r) => r.verdict === 'MISSING' || r.verdict === 'NOT_COMPARABLE');
  const blockerCodes = dedupe([...input.readinessBlockers, ...input.comparabilityBlockerCodes]);

  let caseVerdict: CaseVerdict;
  if (input.outcome !== 'SUCCESS') {
    caseVerdict = 'UNAVAILABLE';
  } else if (anyDiscrepancy) {
    caseVerdict = 'DISCREPANCY';
  } else if (anyUnknown || blockerCodes.length > 0) {
    caseVerdict = 'FAIL_CLOSED';
  } else {
    caseVerdict = 'EXACT';
  }

  return {
    opaqueId,
    outcome: input.outcome,
    caseVerdict,
    zeroCentClean: input.outcome === 'SUCCESS' && !anyDiscrepancy,
    currency: input.currency,
    scenarioClass: input.scenarioClass,
    currencyGroup: input.currencyGroup,
    caseSizeBucket: input.caseSizeBucket,
    legacyAvailable: input.legacyAvailable,
    canonicalAvailable: input.canonicalAvailable,
    safeForPrimaryDisplay: input.safeForPrimaryDisplay,
    orchestrationDurationMs: input.orchestrationDurationMs,
    fieldResults,
    blockerCodes,
    diagnosticsCodes: dedupe(input.diagnosticsCodes),
  };
}

/** Deterministik opak Case Id: `CASE-0001` (1-tabanlı, 4 hane sıfır dolgulu). */
export function buildOpaqueId(index: number): string {
  const n = index + 1;
  let s = String(n);
  while (s.length < 4) s = `0${s}`;
  return `CASE-${s}`;
}

// ---------------------------------------------------------------------------
// Latency istatistikleri
// ---------------------------------------------------------------------------

export interface LatencyStats {
  count: number;
  minMs: number | null;
  maxMs: number | null;
  meanMs: number | null;
  p50Ms: number | null;
  p95Ms: number | null;
  p99Ms: number | null;
}

/**
 * Nearest-rank yöntemiyle latency yüzdelikleri. `toFixed()` kullanılmaz; mean tam sayı ms'e
 * yuvarlanır, yüzdelikler gerçek örnek değerleridir.
 */
export function latencyStats(valuesMs: number[]): LatencyStats {
  const vals = valuesMs.filter((v) => Number.isFinite(v)).slice().sort((a, b) => a - b);
  const count = vals.length;
  if (count === 0) {
    return { count: 0, minMs: null, maxMs: null, meanMs: null, p50Ms: null, p95Ms: null, p99Ms: null };
  }
  const sum = vals.reduce((a, b) => a + b, 0);
  const meanMs = Math.round(sum / count);
  const pct = (p: number): number => {
    const rank = Math.ceil((p / 100) * count);
    const idx = Math.min(Math.max(rank - 1, 0), count - 1);
    return vals[idx];
  };
  return {
    count,
    minMs: vals[0],
    maxMs: vals[count - 1],
    meanMs,
    p50Ms: pct(50),
    p95Ms: pct(95),
    p99Ms: pct(99),
  };
}

// ---------------------------------------------------------------------------
// Toplama (aggregate)
// ---------------------------------------------------------------------------

export interface FieldParityAggregate {
  exact: number;
  financialDiscrepancy: number;
  missing: number;
  notComparable: number;
}

export interface EvidenceAggregate {
  totalCases: number;
  outcomeDistribution: Record<string, number>;
  caseVerdictDistribution: Record<string, number>;
  perFieldParity: Record<string, FieldParityAggregate>;
  blockerDistribution: Record<string, number>;
  coverage: {
    scenarioClass: Record<string, number>;
    currencyGroup: Record<string, number>;
    caseSizeBucket: Record<string, number>;
  };
  zeroCent: {
    cleanCases: number;
    discrepancyCases: number;
    failClosedCases: number;
    /** SUCCESS koşumları arasında hiç finansal discrepancy yoksa true. */
    overallClean: boolean;
  };
  latencyMs: { orchestration: LatencyStats };
  safeForPrimaryDisplayCount: number;
}

function inc(map: Record<string, number>, key: string): void {
  map[key] = (map[key] ?? 0) + 1;
}

/** Case kanıtları listesini toplu istatistiklere indirger — deterministik. */
export function aggregateEvidence(cases: CaseEvidence[]): EvidenceAggregate {
  const outcomeDistribution: Record<string, number> = {};
  const caseVerdictDistribution: Record<string, number> = {};
  const perFieldParity: Record<string, FieldParityAggregate> = {};
  const blockerDistribution: Record<string, number> = {};
  const scenarioClass: Record<string, number> = {};
  const currencyGroup: Record<string, number> = {};
  const caseSizeBucket: Record<string, number> = {};

  let cleanCases = 0;
  let discrepancyCases = 0;
  let failClosedCases = 0;
  let safeForPrimaryDisplayCount = 0;
  const orchestrationDurations: number[] = [];

  for (const c of cases) {
    inc(outcomeDistribution, c.outcome);
    inc(caseVerdictDistribution, c.caseVerdict);
    inc(scenarioClass, c.scenarioClass);
    inc(currencyGroup, c.currencyGroup);
    inc(caseSizeBucket, c.caseSizeBucket);

    if (c.caseVerdict === 'DISCREPANCY') discrepancyCases += 1;
    if (c.caseVerdict === 'FAIL_CLOSED') failClosedCases += 1;
    if (c.zeroCentClean) cleanCases += 1;
    if (c.safeForPrimaryDisplay) safeForPrimaryDisplayCount += 1;
    if (c.outcome === 'SUCCESS') orchestrationDurations.push(c.orchestrationDurationMs);

    for (const code of c.blockerCodes) inc(blockerDistribution, code);

    for (const r of c.fieldResults) {
      const agg =
        perFieldParity[r.field] ??
        (perFieldParity[r.field] = { exact: 0, financialDiscrepancy: 0, missing: 0, notComparable: 0 });
      if (r.verdict === 'EXACT') agg.exact += 1;
      else if (r.verdict === 'FINANCIAL_DISCREPANCY') agg.financialDiscrepancy += 1;
      else if (r.verdict === 'MISSING') agg.missing += 1;
      else agg.notComparable += 1;
    }
  }

  return {
    totalCases: cases.length,
    outcomeDistribution,
    caseVerdictDistribution,
    perFieldParity,
    blockerDistribution,
    coverage: { scenarioClass, currencyGroup, caseSizeBucket },
    zeroCent: {
      cleanCases,
      discrepancyCases,
      failClosedCases,
      overallClean: discrepancyCases === 0,
    },
    latencyMs: { orchestration: latencyStats(orchestrationDurations) },
    safeForPrimaryDisplayCount,
  };
}

// ---------------------------------------------------------------------------
// Evidence paketleri (summary / detail / correlation / manifest)
// ---------------------------------------------------------------------------

export interface DatabaseIdentity {
  host: string;
  port: string;
  databaseName: string;
  environment: string;
  readOnlyMode: boolean;
  isolationLevel: string;
}

/** Her kanıt paketine gömülü yetki durumu — kanıtın PR-11 onayı OLMADIĞINI kalıcı işaretler. */
export interface AuthorizationState {
  pr11: 'NOT AUTHORIZED';
  runtimeCutover: 'NOT AUTHORIZED';
  consumerSwitch: 'NONE';
  featureFlag: 'UNCHANGED';
  mode: 'SHADOW_ONLY';
}

export const AUTHORIZATION_STATE: AuthorizationState = {
  pr11: 'NOT AUTHORIZED',
  runtimeCutover: 'NOT AUTHORIZED',
  consumerSwitch: 'NONE',
  featureFlag: 'UNCHANGED',
  mode: 'SHADOW_ONLY',
};

export interface EvidenceRunMeta {
  runnerVersion: string;
  canonicalSha: string;
  policyReference: string;
  contractReference: string;
  engineSourceVersion: string;
  datasetVersion: string;
  database: DatabaseIdentity;
  readOnlyVerified: boolean;
  runStartedAt: string;
  runEndedAt: string;
}

export interface EvidenceManifest extends EvidenceRunMeta {
  caseCount: number;
  tenantCount: number;
  authorization: AuthorizationState;
}

/**
 * KİMLİKSİZ (PII-safe) özet — contract §5.2 operasyonel-log uyumu: yalnız sayısal, kod, opak
 * dağılım. Ham tenantId/caseId İÇERMEZ.
 */
export interface EvidenceSummary {
  runnerVersion: string;
  canonicalSha: string;
  generatedAt: string;
  datasetVersion: string;
  aggregate: EvidenceAggregate;
  authorization: AuthorizationState;
}

/** Erişim-kısıtlı detay katmanı: opak-Id + kuruş delta (sayısal finansal kanıt). Ham kimlik YOK. */
export interface EvidenceDetailRow {
  opaqueId: string;
  outcome: RunOutcome;
  caseVerdict: CaseVerdict;
  zeroCentClean: boolean;
  currency: string | null;
  scenarioClass: string;
  currencyGroup: string;
  caseSizeBucket: string;
  orchestrationDurationMs: number;
  safeForPrimaryDisplay: boolean;
  fields: Array<{
    code: string;
    field: string;
    bucket?: string;
    minorUnitDelta: number | null;
    verdict: ParityVerdict;
  }>;
  blockerCodes: string[];
  diagnosticsCodes: string[];
}

/** En kısıtlı katman: opak-Id → gerçek (tenantId, caseId). Yalnız yerel korelasyon için. */
export interface CorrelationEntry {
  opaqueId: string;
  tenantId: string;
  caseId: string;
  asOfDate: string;
}

export function buildManifest(meta: EvidenceRunMeta, cases: CaseEvidence[], tenantCount: number): EvidenceManifest {
  return {
    ...meta,
    caseCount: cases.length,
    tenantCount,
    authorization: AUTHORIZATION_STATE,
  };
}

export function buildSummary(meta: EvidenceRunMeta, aggregate: EvidenceAggregate): EvidenceSummary {
  return {
    runnerVersion: meta.runnerVersion,
    canonicalSha: meta.canonicalSha,
    generatedAt: meta.runEndedAt,
    datasetVersion: meta.datasetVersion,
    aggregate,
    authorization: AUTHORIZATION_STATE,
  };
}

export function buildDetail(cases: CaseEvidence[]): EvidenceDetailRow[] {
  return cases.map((c) => ({
    opaqueId: c.opaqueId,
    outcome: c.outcome,
    caseVerdict: c.caseVerdict,
    zeroCentClean: c.zeroCentClean,
    currency: c.currency,
    scenarioClass: c.scenarioClass,
    currencyGroup: c.currencyGroup,
    caseSizeBucket: c.caseSizeBucket,
    orchestrationDurationMs: c.orchestrationDurationMs,
    safeForPrimaryDisplay: c.safeForPrimaryDisplay,
    fields: c.fieldResults.map((r) => ({
      code: r.code,
      field: r.field,
      bucket: r.bucket,
      minorUnitDelta: r.minorUnitDelta,
      verdict: r.verdict,
    })),
    blockerCodes: c.blockerCodes,
    diagnosticsCodes: c.diagnosticsCodes,
  }));
}

export function buildCorrelationMap(inputs: CaseShadowInput[], opaqueIds: string[]): CorrelationEntry[] {
  return inputs.map((input, i) => ({
    opaqueId: opaqueIds[i],
    tenantId: input.tenantId,
    caseId: input.caseId,
    asOfDate: input.asOfDate,
  }));
}
