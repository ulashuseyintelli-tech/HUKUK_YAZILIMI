/**
 * EscalationStateRepository — CAS Retry / 409 Contract Tests
 *
 * Sprint 3 - Checkpoint A validation
 *
 * Test matrix:
 *   1. updateWithRetry: 2 CAS conflicts + 3rd success → no exception
 *   2. updateWithRetry: 3 CAS conflicts → EscalationStateConflictException (409)
 *   3. Final failure increments escalation_state_conflict_total metric
 *   4. Retry does NOT increment metric (only final failure does)
 *   5. saveStateWithCas: version mismatch → CasConflictError
 *   6. getState / initState basic operations
 */

import { EscalationStateRepository } from '../escalation-state.repository';
import { EscalationStateConflictException } from '../../simulation-api/simulation-error.types';
import { SimulationMetricsService } from '../../simulation-api/simulation-metrics.service';
import { EscalationState } from '../escalation-hysteresis.types';

// ============================================================================
// Mock PrismaService
// ============================================================================

function createMockPrisma() {
  return {
    escalationStateRecord: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    $executeRaw: jest.fn(),
  };
}

function createMockMetrics(): jest.Mocked<SimulationMetricsService> {
  return {
    incPromoteSuccess: jest.fn(),
    incPromoteFailure: jest.fn(),
    incDriftDetected: jest.fn(),
    incEscalationChurn: jest.fn(),
    incEscalationStateConflict: jest.fn(),
  } as any;
}

function buildStateRow(overrides: Partial<Record<string, any>> = {}) {
  return {
    incidentId: 'inc-1',
    currentLevel: 'NONE',
    lastTransitionAt: new Date('2026-02-10T00:00:00Z'),
    holdDownUntil: null,
    stableWindowCounter: 0,
    stableWindowStartedAt: null,
    version: 1,
    createdAt: new Date('2026-02-10T00:00:00Z'),
    updatedAt: new Date('2026-02-10T00:00:00Z'),
    ...overrides,
  };
}

describe('EscalationStateRepository', () => {
  let repo: EscalationStateRepository;
  let mockPrisma: ReturnType<typeof createMockPrisma>;
  let mockMetrics: jest.Mocked<SimulationMetricsService>;

  beforeEach(() => {
    mockPrisma = createMockPrisma();
    mockMetrics = createMockMetrics();
    repo = new EscalationStateRepository(mockPrisma as any, mockMetrics);
  });

  // ==========================================================================
  // Basic operations
  // ==========================================================================

  describe('getState', () => {
    it('should return mapped state when row exists', async () => {
      mockPrisma.escalationStateRecord.findUnique.mockResolvedValue(buildStateRow());

      const state = await repo.getState('inc-1');
      expect(state).not.toBeNull();
      expect(state!.incidentId).toBe('inc-1');
      expect(state!.currentLevel).toBe('NONE');
      expect(state!.version).toBe(1);
    });

    it('should return null when no row', async () => {
      mockPrisma.escalationStateRecord.findUnique.mockResolvedValue(null);

      const state = await repo.getState('inc-x');
      expect(state).toBeNull();
    });
  });

  describe('initState', () => {
    it('should create NONE-level state with version 1', async () => {
      const row = buildStateRow();
      mockPrisma.escalationStateRecord.create.mockResolvedValue(row);

      const state = await repo.initState('inc-1');
      expect(state.currentLevel).toBe('NONE');
      expect(state.version).toBe(1);
      expect(mockPrisma.escalationStateRecord.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          incidentId: 'inc-1',
          currentLevel: 'NONE',
          version: 1,
        }),
      });
    });
  });

  // ==========================================================================
  // saveStateWithCas — version mismatch
  // ==========================================================================

  describe('saveStateWithCas', () => {
    it('should succeed when version matches (result > 0)', async () => {
      mockPrisma.$executeRaw.mockResolvedValue(1); // 1 row updated
      mockPrisma.escalationStateRecord.findUnique.mockResolvedValue(
        buildStateRow({ version: 2, currentLevel: 'L1' }),
      );

      const result = await repo.saveStateWithCas('inc-1', { currentLevel: 'L1' }, 1);
      expect(result.currentLevel).toBe('L1');
      expect(result.version).toBe(2);
    });

    it('should throw CasConflictError when version mismatch (result === 0)', async () => {
      mockPrisma.$executeRaw.mockResolvedValue(0); // 0 rows updated

      await expect(repo.saveStateWithCas('inc-1', { currentLevel: 'L1' }, 1))
        .rejects.toThrow('CAS conflict');
    });
  });

  // ==========================================================================
  // updateWithRetry — CAS retry contract
  // ==========================================================================

  describe('updateWithRetry — 2 conflicts + 3rd success', () => {
    it('should succeed on 3rd attempt without throwing', async () => {
      const stateV1 = buildStateRow({ version: 1 });
      const stateV2 = buildStateRow({ version: 2 });
      const stateV3 = buildStateRow({ version: 3, currentLevel: 'L1' });

      // getState calls: attempt 0 → v1, attempt 1 → v2, attempt 2 → v3 (after success re-read)
      mockPrisma.escalationStateRecord.findUnique
        .mockResolvedValueOnce(stateV1)  // attempt 0: read
        .mockResolvedValueOnce(stateV2)  // attempt 1: read
        .mockResolvedValueOnce(stateV3)  // attempt 2: read
        .mockResolvedValueOnce(stateV3); // re-read after successful CAS

      // $executeRaw: attempt 0 → conflict, attempt 1 → conflict, attempt 2 → success
      mockPrisma.$executeRaw
        .mockResolvedValueOnce(0)  // CAS fail
        .mockResolvedValueOnce(0)  // CAS fail
        .mockResolvedValueOnce(1); // CAS success

      const mutate = (current: EscalationState) => ({ currentLevel: 'L1' as const });

      const result = await repo.updateWithRetry('inc-1', mutate);

      expect(result.currentLevel).toBe('L1');
      expect(mockMetrics.incEscalationStateConflict).not.toHaveBeenCalled();
    });
  });

  describe('updateWithRetry — 3 conflicts → 409', () => {
    it('should throw EscalationStateConflictException after 3 failed attempts', async () => {
      const stateV1 = buildStateRow({ version: 1 });
      const stateV2 = buildStateRow({ version: 2 });
      const stateV3 = buildStateRow({ version: 3 });

      // getState: 3 reads (attempt 0, 1, 2)
      mockPrisma.escalationStateRecord.findUnique
        .mockResolvedValueOnce(stateV1)
        .mockResolvedValueOnce(stateV2)
        .mockResolvedValueOnce(stateV3);

      // All 3 CAS attempts fail
      mockPrisma.$executeRaw
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0);

      const mutate = (current: EscalationState) => ({ currentLevel: 'L1' as const });

      await expect(repo.updateWithRetry('inc-1', mutate))
        .rejects.toThrow(EscalationStateConflictException);
    });
  });

  // ==========================================================================
  // Metric contract
  // ==========================================================================

  describe('metric: escalation_state_conflict_total', () => {
    it('should increment metric ONLY on final failure (not during retries)', async () => {
      const stateV1 = buildStateRow({ version: 1 });
      const stateV2 = buildStateRow({ version: 2 });
      const stateV3 = buildStateRow({ version: 3 });

      mockPrisma.escalationStateRecord.findUnique
        .mockResolvedValueOnce(stateV1)
        .mockResolvedValueOnce(stateV2)
        .mockResolvedValueOnce(stateV3);

      mockPrisma.$executeRaw
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0);

      const mutate = (current: EscalationState) => ({ currentLevel: 'L1' as const });

      try {
        await repo.updateWithRetry('inc-1', mutate);
      } catch {
        // expected
      }

      // Metric incremented exactly once (final failure only)
      expect(mockMetrics.incEscalationStateConflict).toHaveBeenCalledTimes(1);
    });

    it('should NOT increment metric when retry succeeds', async () => {
      const stateV1 = buildStateRow({ version: 1 });
      const stateV2 = buildStateRow({ version: 2, currentLevel: 'L1' });

      mockPrisma.escalationStateRecord.findUnique
        .mockResolvedValueOnce(stateV1)  // attempt 0
        .mockResolvedValueOnce(stateV2)  // attempt 1
        .mockResolvedValueOnce(stateV2); // re-read after success

      mockPrisma.$executeRaw
        .mockResolvedValueOnce(0)  // CAS fail
        .mockResolvedValueOnce(1); // CAS success

      const mutate = (current: EscalationState) => ({ currentLevel: 'L1' as const });

      await repo.updateWithRetry('inc-1', mutate);

      expect(mockMetrics.incEscalationStateConflict).not.toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // initState on first encounter
  // ==========================================================================

  describe('updateWithRetry — first encounter (no existing state)', () => {
    it('should initState then retry when getState returns null', async () => {
      const freshRow = buildStateRow({ version: 1 });

      // First getState → null (no state), then initState creates, then getState → row
      mockPrisma.escalationStateRecord.findUnique
        .mockResolvedValueOnce(null)       // attempt 0: no state
        .mockResolvedValueOnce(freshRow)   // attempt 1: after init
        .mockResolvedValueOnce(freshRow);  // re-read after CAS

      mockPrisma.escalationStateRecord.create.mockResolvedValue(freshRow);
      mockPrisma.$executeRaw.mockResolvedValueOnce(1); // CAS success

      const mutate = (current: EscalationState) => ({ currentLevel: 'L1' as const });

      const result = await repo.updateWithRetry('inc-1', mutate);
      expect(result).toBeDefined();
      expect(mockPrisma.escalationStateRecord.create).toHaveBeenCalledTimes(1);
    });
  });
});
