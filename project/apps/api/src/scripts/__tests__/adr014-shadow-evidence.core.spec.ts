/**
 * ADR-014 shadow evidence SAF ÇEKİRDEK — birim testleri. DB'siz, deterministik.
 * En kritik davranış: KANONİK 0-CENT KURALI — sıfırdan farklı her kuruş = FINANCIAL_DISCREPANCY;
 * shadow servisinin `<%1` MINOR_DELTA gevşemesi burada BİR KABUL TOLERANSI DEĞİLDİR (PE01-G01).
 */
import {
  toMinorUnits,
  classifyFieldParity,
  buildCaseEvidence,
  buildOpaqueId,
  latencyStats,
  aggregateEvidence,
  buildSummary,
  buildDetail,
  buildCorrelationMap,
  buildManifest,
  AUTHORIZATION_STATE,
  RUNNER_VERSION,
  type CaseShadowInput,
  type FieldDiffInput,
  type EvidenceRunMeta,
} from '../adr014-shadow-evidence.core';

function diff(partial: Partial<FieldDiffInput>): FieldDiffInput {
  return {
    code: 'OUTSTANDING_DELTA',
    field: 'OUTSTANDING',
    legacyAmount: 100,
    canonicalAmount: 100,
    delta: 0,
    status: 'MATCH',
    ...partial,
  };
}

function caseInput(partial: Partial<CaseShadowInput>): CaseShadowInput {
  return {
    tenantId: 't-1',
    caseId: 'c-1',
    asOfDate: '2026-07-12',
    scenarioClass: 'SINGLE_CURRENCY',
    currencyGroup: 'TRY',
    caseSizeBucket: 'SMALL',
    outcome: 'SUCCESS',
    legacyAvailable: true,
    canonicalAvailable: true,
    currency: 'TRY',
    totalsDiffs: [],
    bucketDiffs: [],
    readinessBlockers: [],
    comparabilityBlockerCodes: [],
    diagnosticsCodes: [],
    safeForPrimaryDisplay: false,
    orchestrationDurationMs: 10,
    ...partial,
  };
}

describe('toMinorUnits', () => {
  it('major unit → kuruş (pozitif/negatif/yuvarlama)', () => {
    expect(toMinorUnits(100)).toBe(10000);
    expect(toMinorUnits(0.01)).toBe(1);
    expect(toMinorUnits(-12.34)).toBe(-1234);
    expect(toMinorUnits(0.005)).toBe(1); // 0.5 kuruş → 1 (round half up)
    expect(toMinorUnits(0)).toBe(0);
  });
  it('non-finite değeri 0 sayar', () => {
    expect(toMinorUnits(Number.NaN)).toBe(0);
    expect(toMinorUnits(Number.POSITIVE_INFINITY)).toBe(0);
  });
});

describe('classifyFieldParity — KANONİK 0-CENT', () => {
  it('MATCH (delta 0) → EXACT', () => {
    const r = classifyFieldParity(diff({ status: 'MATCH', delta: 0 }));
    expect(r.verdict).toBe('EXACT');
    expect(r.isZeroDelta).toBe(true);
    expect(r.minorUnitDelta).toBe(0);
  });

  it('MINOR_DELTA (%1 altı ama sıfırdan farklı kuruş) → FINANCIAL_DISCREPANCY (tolere EDİLMEZ)', () => {
    // legacy 10000.00, canonical 10000.01 → 1 kuruş fark, yüzdesi %0.00001 ama YİNE discrepancy
    const r = classifyFieldParity(
      diff({ status: 'MINOR_DELTA', legacyAmount: 10000.0, canonicalAmount: 10000.01, delta: 0.01 }),
    );
    expect(r.verdict).toBe('FINANCIAL_DISCREPANCY');
    expect(r.minorUnitDelta).toBe(1);
    expect(r.isZeroDelta).toBe(false);
  });

  it('MAJOR_DELTA → FINANCIAL_DISCREPANCY', () => {
    const r = classifyFieldParity(diff({ status: 'MAJOR_DELTA', delta: 25.5 }));
    expect(r.verdict).toBe('FINANCIAL_DISCREPANCY');
    expect(r.minorUnitDelta).toBe(2550);
  });

  it('kuruş-altı fark (0.004 → 0 kuruş) → EXACT', () => {
    const r = classifyFieldParity(diff({ status: 'MINOR_DELTA', delta: 0.004 }));
    expect(r.verdict).toBe('EXACT');
    expect(r.minorUnitDelta).toBe(0);
  });

  it('LEGACY_ONLY → MISSING (fail-closed, sayısal delta yok)', () => {
    const r = classifyFieldParity(diff({ status: 'LEGACY_ONLY', canonicalAmount: null, delta: null }));
    expect(r.verdict).toBe('MISSING');
    expect(r.minorUnitDelta).toBeNull();
  });

  it('CANONICAL_ONLY → MISSING', () => {
    const r = classifyFieldParity(diff({ status: 'CANONICAL_ONLY', legacyAmount: null, delta: null }));
    expect(r.verdict).toBe('MISSING');
  });

  it('NOT_COMPARABLE → NOT_COMPARABLE', () => {
    const r = classifyFieldParity(diff({ status: 'NOT_COMPARABLE', delta: null }));
    expect(r.verdict).toBe('NOT_COMPARABLE');
    expect(r.minorUnitDelta).toBeNull();
  });

  it('delta null ama iki taraf da mevcut → canonical−legacy üzerinden hesaplar', () => {
    const r = classifyFieldParity(diff({ status: 'MAJOR_DELTA', legacyAmount: 100, canonicalAmount: 150, delta: null }));
    expect(r.verdict).toBe('FINANCIAL_DISCREPANCY');
    expect(r.minorUnitDelta).toBe(5000);
  });
});

describe('buildCaseEvidence — verdict önceliği', () => {
  it('herhangi bir finansal discrepancy → DISCREPANCY', () => {
    const e = buildCaseEvidence(
      caseInput({ totalsDiffs: [diff({ status: 'MINOR_DELTA', delta: 0.01 })] }),
      'CASE-0001',
    );
    expect(e.caseVerdict).toBe('DISCREPANCY');
    expect(e.zeroCentClean).toBe(false);
  });

  it('discrepancy yok ama blocker/unknown var → FAIL_CLOSED', () => {
    const e = buildCaseEvidence(caseInput({ readinessBlockers: ['NO_BUCKETS'] }), 'CASE-0002');
    expect(e.caseVerdict).toBe('FAIL_CLOSED');
    expect(e.zeroCentClean).toBe(true); // 0-cent açısından temiz (finansal discrepancy yok) ama readiness fail-closed
    expect(e.blockerCodes).toContain('NO_BUCKETS');
  });

  it('tüm alanlar exact + blocker yok → EXACT', () => {
    const e = buildCaseEvidence(caseInput({ totalsDiffs: [diff({ status: 'MATCH', delta: 0 })] }), 'CASE-0003');
    expect(e.caseVerdict).toBe('EXACT');
    expect(e.zeroCentClean).toBe(true);
  });

  it('outcome SUCCESS değil → UNAVAILABLE (koşum başarısız)', () => {
    const e = buildCaseEvidence(caseInput({ outcome: 'TIMEOUT', legacyAvailable: false, canonicalAvailable: false }), 'CASE-0004');
    expect(e.caseVerdict).toBe('UNAVAILABLE');
    expect(e.zeroCentClean).toBe(false);
  });

  it('DISCREPANCY, FAIL_CLOSED sinyaliyle birlikte olsa bile önceliklidir', () => {
    const e = buildCaseEvidence(
      caseInput({ totalsDiffs: [diff({ status: 'MAJOR_DELTA', delta: 5 })], readinessBlockers: ['NO_BUCKETS'] }),
      'CASE-0005',
    );
    expect(e.caseVerdict).toBe('DISCREPANCY');
  });
});

describe('buildOpaqueId', () => {
  it('1-tabanlı 4-hane sıfır dolgulu', () => {
    expect(buildOpaqueId(0)).toBe('CASE-0001');
    expect(buildOpaqueId(41)).toBe('CASE-0042');
    expect(buildOpaqueId(9999)).toBe('CASE-10000');
  });
});

describe('latencyStats — nearest-rank', () => {
  it('boş → tüm alanlar null', () => {
    const s = latencyStats([]);
    expect(s.count).toBe(0);
    expect(s.p95Ms).toBeNull();
    expect(s.meanMs).toBeNull();
  });
  it('tek değer', () => {
    const s = latencyStats([42]);
    expect(s.minMs).toBe(42);
    expect(s.maxMs).toBe(42);
    expect(s.p99Ms).toBe(42);
    expect(s.meanMs).toBe(42);
  });
  it('yüzdelikler + mean (toFixed kullanılmaz, tam sayı ms)', () => {
    const s = latencyStats([10, 20, 30, 40, 50, 60, 70, 80, 90, 100]);
    expect(s.minMs).toBe(10);
    expect(s.maxMs).toBe(100);
    expect(s.p50Ms).toBe(50); // ceil(0.5*10)=5 → index 4 → 50
    expect(s.p95Ms).toBe(100); // ceil(0.95*10)=10 → index 9 → 100
    expect(s.meanMs).toBe(55);
  });
  it('non-finite değerleri filtreler', () => {
    const s = latencyStats([10, Number.NaN, 30]);
    expect(s.count).toBe(2);
    expect(s.maxMs).toBe(30);
  });
});

describe('aggregateEvidence', () => {
  const cases = [
    buildCaseEvidence(caseInput({ totalsDiffs: [diff({ status: 'MATCH', delta: 0 })] }), buildOpaqueId(0)),
    buildCaseEvidence(caseInput({ scenarioClass: 'MULTI_CURRENCY', totalsDiffs: [diff({ status: 'MAJOR_DELTA', delta: 5 })] }), buildOpaqueId(1)),
    buildCaseEvidence(caseInput({ readinessBlockers: ['NO_BUCKETS'] }), buildOpaqueId(2)),
    buildCaseEvidence(caseInput({ outcome: 'ERROR', legacyAvailable: false, canonicalAvailable: false, readinessBlockers: ['RUNNER_ERROR'] }), buildOpaqueId(3)),
  ];
  const agg = aggregateEvidence(cases);

  it('outcome + verdict dağılımı', () => {
    expect(agg.totalCases).toBe(4);
    expect(agg.outcomeDistribution.SUCCESS).toBe(3);
    expect(agg.outcomeDistribution.ERROR).toBe(1);
    expect(agg.caseVerdictDistribution.EXACT).toBe(1);
    expect(agg.caseVerdictDistribution.DISCREPANCY).toBe(1);
    expect(agg.caseVerdictDistribution.FAIL_CLOSED).toBe(1);
    expect(agg.caseVerdictDistribution.UNAVAILABLE).toBe(1);
  });
  it('0-cent tally + overallClean', () => {
    expect(agg.zeroCent.discrepancyCases).toBe(1);
    expect(agg.zeroCent.failClosedCases).toBe(1);
    expect(agg.zeroCent.overallClean).toBe(false);
  });
  it('coverage + blocker dağılımı', () => {
    expect(agg.coverage.scenarioClass.SINGLE_CURRENCY).toBe(3);
    expect(agg.coverage.scenarioClass.MULTI_CURRENCY).toBe(1);
    expect(agg.blockerDistribution.NO_BUCKETS).toBe(1);
    expect(agg.blockerDistribution.RUNNER_ERROR).toBe(1);
  });
  it('latency yalnız SUCCESS koşumlarından', () => {
    expect(agg.latencyMs.orchestration.count).toBe(3);
  });
});

describe('evidence paketleri — PII güvenliği', () => {
  const meta: EvidenceRunMeta = {
    runnerVersion: RUNNER_VERSION,
    canonicalSha: 'deadbeef',
    policyReference: 'policy §10',
    contractReference: 'contract PE-01',
    engineSourceVersion: 'engine-v1',
    datasetVersion: 'ds-1',
    database: { host: 'localhost', port: '5432', databaseName: 'hukuk_local', environment: 'local', readOnlyMode: true, isolationLevel: 'repeatable read' },
    readOnlyVerified: true,
    runStartedAt: '2026-07-12T10:00:00.000Z',
    runEndedAt: '2026-07-12T10:05:00.000Z',
  };
  const inputs = [
    caseInput({ tenantId: 'tenant-SECRET', caseId: 'case-SECRET', totalsDiffs: [diff({ status: 'MAJOR_DELTA', delta: 5 })] }),
  ];
  const evidences = inputs.map((inp, i) => buildCaseEvidence(inp, buildOpaqueId(i)));
  const agg = aggregateEvidence(evidences);

  it('summary ham tenantId/caseId İÇERMEZ (yalnız opak + sayısal)', () => {
    const summary = buildSummary(meta, agg);
    const serialized = JSON.stringify(summary);
    expect(serialized).not.toContain('tenant-SECRET');
    expect(serialized).not.toContain('case-SECRET');
    expect(summary.authorization.pr11).toBe('NOT AUTHORIZED');
  });

  it('detail opak-Id + kuruş delta taşır, ham kimlik taşımaz', () => {
    const detail = buildDetail(evidences);
    const serialized = JSON.stringify(detail);
    expect(serialized).not.toContain('tenant-SECRET');
    expect(serialized).not.toContain('case-SECRET');
    expect(detail[0].opaqueId).toBe('CASE-0001');
    expect(detail[0].fields[0].minorUnitDelta).toBe(500);
  });

  it('correlation map opak→gerçek eşlemeyi AYRI katmanda tutar', () => {
    const corr = buildCorrelationMap(inputs, evidences.map((e) => e.opaqueId));
    expect(corr[0].opaqueId).toBe('CASE-0001');
    expect(corr[0].tenantId).toBe('tenant-SECRET');
    expect(corr[0].caseId).toBe('case-SECRET');
  });

  it('manifest yetki durumunu (PR-11 NOT AUTHORIZED) gömer', () => {
    const manifest = buildManifest(meta, evidences, 1);
    expect(manifest.authorization).toEqual(AUTHORIZATION_STATE);
    expect(manifest.caseCount).toBe(1);
    expect(manifest.tenantCount).toBe(1);
    expect(manifest.readOnlyVerified).toBe(true);
  });
});
