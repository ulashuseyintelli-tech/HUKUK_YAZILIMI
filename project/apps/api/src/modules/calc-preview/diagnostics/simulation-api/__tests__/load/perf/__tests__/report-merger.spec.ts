/**
 * ReportMerger contract tests — Task 20.4
 *
 * Test 1: single run merge (M0 + M1 + M2)
 * Test 2: duplicate latest wins
 * Test 3: multi-run skip
 *
 * MatrixReport fixture objeleriyle çalışır — dosya IO yok.
 */

import { ReportMerger } from '../report-merger';
import { MatrixReport, MatrixId } from '../perf-report.types';
import { SweepStep } from '../helpers/adaptive-sweep';

// ============================================================================
// Fixture helper — minimal MatrixReport üretici
// ============================================================================

const EMPTY_STATS = { p50: 0, p95: 0, p99: 0, max: 0, count: 0, mean: 0 };
const EMPTY_EL = { p50Ms: 0, p95Ms: 0, p99Ms: 0, maxMs: 0 };
const EMPTY_CPU = { userPercent: 0, systemPercent: 0, totalPercent: 0 };
const EMPTY_MEM = { rssKB: 0, heapUsedMB: 0, heapTotalMB: 0, externalMB: 0 };
const EMPTY_POOL = {
  activeConnections: 0,
  poolLimit: 10,
  utilizationPercent: 0,
  isQueueing: false,
  dbWaitP99Ms: 0,
};
const EMPTY_SPLIT_SNAPSHOT = {
  request_duration_ms: EMPTY_STATS,
  phase7_snapshot_fetch_ms: EMPTY_STATS,
  phase7_drift_calc_ms: EMPTY_STATS,
  phase7_audit_write_ms: EMPTY_STATS,
  phase7_metrics_emit_ms: EMPTY_STATS,
};

function makeSweepStep(rps: number): SweepStep {
  return {
    rps,
    latency: { ...EMPTY_STATS, p99: 50 + rps * 0.5 },
    eventLoop: { ...EMPTY_EL, p99Ms: 10 },
    cpu: { ...EMPTY_CPU },
    memory: { ...EMPTY_MEM },
    dbPool: { ...EMPTY_POOL },
    splitTimers: { ...EMPTY_SPLIT_SNAPSHOT },
    errorRate: 0,
    isBreakpoint: false,
  };
}

function makeReport(
  matrixId: MatrixId,
  runId: string,
  completedAt: string,
  opts?: {
    withSweep?: boolean;
    sustainableRPS?: number;
    breakpointRPS?: number;
  },
): MatrixReport {
  const steps = opts?.withSweep
    ? [makeSweepStep(10), makeSweepStep(15), makeSweepStep(22.5)]
    : [];

  return {
    metadata: {
      schemaVersion: '1.0.0',
      runId,
      gitSha: 'abc123',
      environmentSnapshotHash: 'env-hash-001',
    },
    matrixId,
    startedAt: '2026-02-15T10:00:00Z',
    completedAt,
    environment: {
      nodeVersion: '20.11.0',
      cpuModel: 'Test CPU',
      cpuCores: 4,
      totalMemoryMB: 16384,
      osVersion: 'test-os',
      nodeOptions: '',
      maxOldSpaceSize: null,
      dbPoolSize: 10,
      postgresVersion: '15.0',
      perfSeed: 42,
      capturedAt: '2026-02-15T10:00:00Z',
    },
    warmup: null,
    sweep: opts?.withSweep
      ? {
          steps,
          sustainableRPS: opts.sustainableRPS ?? 15,
          breakpointRPS: opts.breakpointRPS ?? 22.5,
          capacityEnvelope: steps.map((s) => ({
            rps: s.rps,
            p50Ms: s.latency.p50,
            p95Ms: s.latency.p95,
            p99Ms: s.latency.p99,
          })),
        }
      : null,
    splitTimers: opts?.withSweep ? { ...EMPTY_SPLIT_SNAPSHOT } : null,
    heapSnapshots: [],
    heapTrend: null,
    blockRateBuckets: [],
    snapshotPressure: null,
    microBenchmark: null,
    seed: 42,
    warnings: [],
  };
}

// ============================================================================
// Tests
// ============================================================================

describe('ReportMerger — Task 20.4 contract tests', () => {
  const merger = new ReportMerger();

  it('Test 1: single run merge — M0 + M1 + M2', () => {
    const m0 = makeReport('M0', 'run-001', '2026-02-15T11:00:00Z', {
      withSweep: true,
      sustainableRPS: 15,
      breakpointRPS: 22.5,
    });
    const m1 = makeReport('M1', 'run-001', '2026-02-15T12:00:00Z', {
      withSweep: true,
      sustainableRPS: 15,
      breakpointRPS: 22.5,
    });
    const m2 = makeReport('M2', 'run-001', '2026-02-15T13:00:00Z');

    const { report } = merger.merge([m0, m1, m2]);

    // matrices canonical order
    expect(report.matrices).toHaveLength(3);
    expect(report.matrices[0].matrixId).toBe('M0');
    expect(report.matrices[1].matrixId).toBe('M1');
    expect(report.matrices[2].matrixId).toBe('M2');

    // overheadDelta computed (M0+M1 present)
    expect(report.overheadDelta).not.toBeNull();
    expect(report.overheadDelta!.perRPSDeltas.length).toBeGreaterThan(0);

    // capacityEnvelope (M0+M1 present)
    expect(report.capacityEnvelope).not.toBeNull();
    expect(report.capacityEnvelope!.phase7Off.length).toBe(3);
    expect(report.capacityEnvelope!.phase7On.length).toBe(3);

    // no duplicates
    expect(report.duplicates).toHaveLength(0);

    // index
    expect(report.index).toHaveLength(3);
    expect(report.index[0].matrixId).toBe('M0');
    expect(report.index[1].matrixId).toBe('M1');
    expect(report.index[2].matrixId).toBe('M2');
    expect(report.index[0].sustainableRPS).toBe(15);
    expect(report.index[2].sustainableRPS).toBeNull(); // M2 has no sweep

    // metadata
    expect(report.metadata.schemaVersion).toBe('2.0.0');
    expect(report.metadata.compositeRunKey).toBe('run-001');
  });

  it('Test 2: duplicate latest wins — two M0 reports, latest kept', () => {
    const m0Old = makeReport('M0', 'run-001', '2026-02-15T10:00:00Z', {
      withSweep: true,
    });
    const m0New = makeReport('M0', 'run-001', '2026-02-15T14:00:00Z', {
      withSweep: true,
    });
    const m1 = makeReport('M1', 'run-001', '2026-02-15T12:00:00Z', {
      withSweep: true,
    });

    const { report } = merger.merge([m0Old, m0New, m1]);

    // Only 2 matrices (M0 latest + M1)
    expect(report.matrices).toHaveLength(2);
    expect(report.matrices[0].matrixId).toBe('M0');
    expect(report.matrices[0].completedAt).toBe('2026-02-15T14:00:00Z');

    // 1 duplicate
    expect(report.duplicates).toHaveLength(1);
    const dup = report.duplicates[0];
    expect(dup.matrixId).toBe('M0');
    expect(dup.reason).toBe('latest-wins');
    expect(dup.keptRunId).toBe('run-001');
    expect(dup.keptCompletedAt).toBe('2026-02-15T14:00:00Z');
    expect(dup.droppedRunId).toBe('run-001');
    expect(dup.droppedCompletedAt).toBe('2026-02-15T10:00:00Z');

    // overheadDelta still computed
    expect(report.overheadDelta).not.toBeNull();

    // duplicate warning in warnings
    const dupWarning = report.warnings.find((w) =>
      w.includes('[merger-duplicate]'),
    );
    expect(dupWarning).toBeDefined();
    expect(dupWarning).toContain('matrixId=M0');

    // Log duplicate record for review
    console.log(
      'duplicates[0]:',
      JSON.stringify(dup, null, 2),
    );
  });

  it('Test 3: multi-run skip — largest group selected', () => {
    // Small group: 2 reports with runKey "run-small"
    const smallA = makeReport('M0', 'run-small', '2026-02-15T10:00:00Z');
    const smallB = makeReport('M1', 'run-small', '2026-02-15T11:00:00Z');

    // Large group: 5 reports with runKey "run-large"
    const largeM0 = makeReport('M0', 'run-large', '2026-02-15T10:00:00Z', {
      withSweep: true,
    });
    const largeM1 = makeReport('M1', 'run-large', '2026-02-15T11:00:00Z', {
      withSweep: true,
    });
    const largeM2 = makeReport('M2', 'run-large', '2026-02-15T12:00:00Z');
    const largeM3 = makeReport('M3', 'run-large', '2026-02-15T13:00:00Z');
    const largeM4 = makeReport('M4', 'run-large', '2026-02-15T14:00:00Z');

    const { report } = merger.merge([
      smallA,
      smallB,
      largeM0,
      largeM1,
      largeM2,
      largeM3,
      largeM4,
    ]);

    // Selected = large group
    expect(report.metadata.compositeRunKey).toBe('run-large');
    expect(report.matrices).toHaveLength(5);

    // Multi-run skip warning
    const skipWarning = report.warnings.find((w) =>
      w.includes('[merger-multirun-skip]'),
    );
    expect(skipWarning).toBeDefined();
    expect(skipWarning).toContain('runKey=run-small');
    expect(skipWarning).toContain('count=2');
    expect(skipWarning).toContain('selected=run-large');
  });

  it('Test 4: M4 warnings JSON → diagnostics extraction', () => {
    const m4 = makeReport('M4', 'run-001', '2026-02-15T14:00:00Z');

    // M4 diagnostics JSON'ını warnings'e göm (M4 spec'in yaptığı gibi)
    const m4DiagData = {
      m4Diagnostics: {
        baselineHeapUsedMB: 50.0,
        baselineExternalMB: 2.0,
        baselineRssMB: 120.0,
        intervalDeltas: [
          {
            intervalIndex: 0,
            simulatedMinute: 0,
            heapUsedDeltaMB: 0,
            heapTotalDeltaMB: 0,
            externalDeltaMB: 0,
            rssDeltaMB: 0,
            retainedObjectCount: 0,
            retainedBufferBytes: 0,
          },
          {
            intervalIndex: 1,
            simulatedMinute: 15,
            heapUsedDeltaMB: 2.0,
            heapTotalDeltaMB: 3.0,
            externalDeltaMB: 1.0,
            rssDeltaMB: 4.0,
            retainedObjectCount: 1,
            retainedBufferBytes: 524288,
          },
        ],
        slopeMBPerInterval: 1.5,
        slopeMBPerRequest: 0.0075,
        totalHeapUsedDeltaMB: 8.0,
        totalExternalDeltaMB: 2.0,
        retainedObjectCount: 4,
        retainedBufferBytes: 2097152,
        gcAvailable: false,
      },
    };
    m4.warnings.push(JSON.stringify(m4DiagData));
    m4.warnings.push('some-other-warning');

    const { report } = merger.merge([m4]);

    // diagnostics.m4 dolu
    expect(report.diagnostics.m4).not.toBeNull();
    expect(report.diagnostics.m4!.baselineHeapUsedMB).toBe(50.0);
    expect(report.diagnostics.m4!.slopeMBPerInterval).toBe(1.5);
    expect(report.diagnostics.m4!.intervalDeltas).toHaveLength(2);
    expect(report.diagnostics.m4!.retainedObjectCount).toBe(4);
    expect(report.diagnostics.m4!.gcAvailable).toBe(false);

    // normalizationsApplied dolu
    expect(report.normalizationsApplied).toContain(
      'm4-warnings-json-moved-to-diagnostics',
    );

    // M4 warnings artık JSON'u içermiyor
    const m4InComposite = report.matrices.find((m) => m.matrixId === 'M4')!;
    const hasJsonWarning = m4InComposite.warnings.some((w) =>
      w.includes('m4Diagnostics'),
    );
    expect(hasJsonWarning).toBe(false);

    // Diğer warning korunmuş
    expect(m4InComposite.warnings).toContain('some-other-warning');
  });
});
