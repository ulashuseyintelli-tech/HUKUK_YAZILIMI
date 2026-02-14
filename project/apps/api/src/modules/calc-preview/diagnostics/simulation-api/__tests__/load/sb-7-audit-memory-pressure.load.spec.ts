/**
 * SB-7: Audit Set Memory Pressure Testi
 *
 * Synthetic Load Validation — Task 10.1
 *
 * 10K unique event → Set.size = 10K → 10K duplicate → Set.size = 10K (değişmemiş).
 * Heap assertion yapılmaz — sadece log/telemetry. Correctness testi, perf değil.
 *
 * @see .kiro/specs/synthetic-load-validation/requirements.md Req 7
 * @see .kiro/specs/synthetic-load-validation/design.md SB-7
 */

import { SimulationAuditAdapter } from '../../simulation-audit.adapter';
import { SimulationAuditEvent } from '../../simulation-audit.types';
import { ScenarioFactory } from './helpers/scenario-factory';
import type { ScenarioResult } from './load-test-report.types';

const EVENT_COUNT = 10_000;
const SEED = Number(process.env.SYN_LOAD_SEED) || 1337;

function createUniqueEvent(factory: ScenarioFactory, index: number): SimulationAuditEvent {
  return {
    eventId: `${factory.getPrefix()}_evt_${index}`,
    eventType: 'PROMOTE_ACCEPTED',
    timestamp: new Date('2026-02-14T10:00:00Z').toISOString(),
    actorId: factory.createActorId(),
    incidentId: `${factory.getPrefix()}_inc_${index}`,
    runId: `${factory.getPrefix()}_run_${index}`,
    requestId: `${factory.getPrefix()}_req_${index}`,
    detail: `Memory pressure test event ${index}`,
  };
}

describe('SB-7: Audit Set Memory Pressure', () => {
  let auditAdapter: SimulationAuditAdapter;
  let factory: ScenarioFactory;
  let mockAuditService: { logAccessAttempt: jest.Mock };

  beforeAll(() => {
    factory = new ScenarioFactory(SEED);
    mockAuditService = {
      logAccessAttempt: jest.fn(),
    };
    auditAdapter = new SimulationAuditAdapter(mockAuditService as any, { incAuditWriteFailed: jest.fn() } as any);
  });

  it(`should accept ${EVENT_COUNT} unique events without exception`, () => {
    // Req 7.1: Tüm event'ler başarıyla kaydedilmeli
    expect(() => {
      for (let i = 0; i < EVENT_COUNT; i++) {
        auditAdapter.logSimulationEvent(createUniqueEvent(factory, i));
      }
    }).not.toThrow();
  });

  it(`should suppress duplicates — Set size stays at ${EVENT_COUNT}`, () => {
    // Heap telemetry (LOG ONLY — assertion yapılmaz)
    const heapBefore = process.memoryUsage().heapUsed;
    console.log(`[SB-7] Heap before duplicates: ${(heapBefore / 1024 / 1024).toFixed(1)} MB`);

    // Req 7.2: Duplicate'ler baskılanmalı
    for (let i = 0; i < EVENT_COUNT; i++) {
      auditAdapter.logSimulationEvent(createUniqueEvent(factory, i));
    }

    const heapAfter = process.memoryUsage().heapUsed;
    console.log(`[SB-7] Heap after duplicates: ${(heapAfter / 1024 / 1024).toFixed(1)} MB`);
    console.log(`[SB-7] Heap delta: ${((heapAfter - heapBefore) / 1024 / 1024).toFixed(1)} MB`);

    // Correctness assertion: logAccessAttempt should have been called exactly EVENT_COUNT times
    // (duplicates are suppressed before reaching the underlying service)
    expect(mockAuditService.logAccessAttempt).toHaveBeenCalledTimes(EVENT_COUNT);
  });
});

/**
 * SB-7 scenario runner — for LoadTestRunner integration
 */
export async function runSB7(
  auditAdapter: SimulationAuditAdapter,
  factory: ScenarioFactory,
): Promise<ScenarioResult> {
  const start = Date.now();
  const errors: string[] = [];

  try {
    // Phase 1: 10K unique events
    const heapStart = process.memoryUsage().heapUsed;

    for (let i = 0; i < EVENT_COUNT; i++) {
      try {
        auditAdapter.logSimulationEvent(createUniqueEvent(factory, i));
      } catch (err) {
        errors.push(`Event ${i} threw: ${(err as Error).message}`);
      }
    }

    console.log(`[SB-7] Heap after ${EVENT_COUNT} insert: ${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(1)} MB`);

    // Phase 2: 10K duplicate events
    for (let i = 0; i < EVENT_COUNT; i++) {
      try {
        auditAdapter.logSimulationEvent(createUniqueEvent(factory, i));
      } catch (err) {
        errors.push(`Duplicate ${i} threw: ${(err as Error).message}`);
      }
    }

    const heapEnd = process.memoryUsage().heapUsed;
    const heapDeltaMB = (heapEnd - heapStart) / 1024 / 1024;
    console.log(`[SB-7] Heap after ${EVENT_COUNT} duplicate: ${(heapEnd / 1024 / 1024).toFixed(1)} MB`);
    console.log(`[SB-7] Heap delta: ${heapDeltaMB.toFixed(1)} MB`);

    return {
      scenarioId: 'SB-7',
      name: 'Audit Set Memory Pressure',
      result: errors.length === 0 ? 'PASS' : 'FAIL',
      durationMs: Date.now() - start,
      details: {
        eventCount: EVENT_COUNT,
        heapDeltaMB: Number(heapDeltaMB.toFixed(1)),
        errorCount: errors.length,
      },
      errors,
    };
  } catch (err) {
    return {
      scenarioId: 'SB-7',
      name: 'Audit Set Memory Pressure',
      result: 'FAIL',
      durationMs: Date.now() - start,
      details: {},
      errors: [(err as Error).message],
    };
  }
}
