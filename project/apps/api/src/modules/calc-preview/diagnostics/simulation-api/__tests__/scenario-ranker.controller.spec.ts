/**
 * ScenarioRankerController — Smoke Tests
 *
 * Sprint 3 - Task 4.2 (minimum DoD: 1 happy path + 1 validation fail)
 *
 * Tests:
 *   1. Happy path: valid body → 200 + RankedResult shape
 *   2. Validation fail: missing scenarios → 400
 *   3. Feature flag disabled → 503
 *   4. Empty scenarios → 200 + empty result
 */

import { ScenarioRankerController } from '../scenario-ranker.controller';
import { ScenarioRankerService } from '../scenario-ranker.service';
import { SimulationFeatureFlagService } from '../simulation-feature-flag.service';
import { SimulationDisabledException } from '../simulation-error.types';
import { BadRequestException } from '@nestjs/common';

// ============================================================================
// Mocks
// ============================================================================

function createMockRankerService(): jest.Mocked<ScenarioRankerService> {
  return {
    rank: jest.fn(),
  } as any;
}

function createMockFeatureFlag(enabled = true): jest.Mocked<SimulationFeatureFlagService> {
  return {
    isSimulationEnabled: jest.fn().mockReturnValue(enabled),
  } as any;
}

describe('ScenarioRankerController', () => {
  let controller: ScenarioRankerController;
  let mockRanker: jest.Mocked<ScenarioRankerService>;
  let mockFeatureFlag: jest.Mocked<SimulationFeatureFlagService>;

  beforeEach(() => {
    mockRanker = createMockRankerService();
    mockFeatureFlag = createMockFeatureFlag(true);
    controller = new ScenarioRankerController(mockRanker, mockFeatureFlag);
  });

  // ==========================================================================
  // 1. Happy path — 200 + RankedResult
  // ==========================================================================

  describe('happy path', () => {
    it('should return 200 with ranked scenarios', async () => {
      const rankedResult = {
        scenarios: [
          { scenarioId: 'A', riskScore: 0.2, costScore: 0.5, frontIndex: 0, rankInFront: 0 },
          { scenarioId: 'B', riskScore: 0.4, costScore: 0.3, frontIndex: 0, rankInFront: 1 },
        ],
        fronts: [[
          { scenarioId: 'A', riskScore: 0.2, costScore: 0.5, frontIndex: 0, rankInFront: 0 },
          { scenarioId: 'B', riskScore: 0.4, costScore: 0.3, frontIndex: 0, rankInFront: 1 },
        ]],
        tradeoffs: [{
          scenarioA: 'A',
          scenarioB: 'B',
          text: 'A, B\'ye göre %50 düşük risk taşır ve %67 yüksek maliyetlidir',
        }],
      };

      mockRanker.rank.mockReturnValue(rankedResult);

      const body = {
        scenarios: [
          { scenarioId: 'A', riskScore: 0.2, costScore: 0.5 },
          { scenarioId: 'B', riskScore: 0.4, costScore: 0.3 },
        ],
        seed: 42,
      };

      const result = await controller.rank('inc-1', body);

      expect(result.scenarios).toHaveLength(2);
      expect(result.fronts).toHaveLength(1);
      expect(result.tradeoffs).toHaveLength(1);
      expect(mockRanker.rank).toHaveBeenCalledWith(body.scenarios, 42);
    });

    it('should use seed=0 as default when not provided', async () => {
      mockRanker.rank.mockReturnValue({ scenarios: [], fronts: [], tradeoffs: [] });

      await controller.rank('inc-1', {
        scenarios: [],
      });

      expect(mockRanker.rank).toHaveBeenCalledWith([], 0);
    });
  });

  // ==========================================================================
  // 2. Validation fail — 400
  // ==========================================================================

  describe('validation fail', () => {
    it('should throw BadRequestException when scenarios is not an array', async () => {
      const body = { scenarios: 'not-an-array' } as any;

      await expect(controller.rank('inc-1', body))
        .rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when scenario missing scenarioId', async () => {
      const body = {
        scenarios: [{ riskScore: 0.5, costScore: 0.3 }],
      } as any;

      await expect(controller.rank('inc-1', body))
        .rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when riskScore is not a number', async () => {
      const body = {
        scenarios: [{ scenarioId: 'A', riskScore: 'bad', costScore: 0.3 }],
      } as any;

      await expect(controller.rank('inc-1', body))
        .rejects.toThrow(BadRequestException);
    });
  });

  // ==========================================================================
  // 3. Feature flag disabled → 503
  // ==========================================================================

  describe('feature flag disabled', () => {
    it('should throw SimulationDisabledException when feature is off', async () => {
      mockFeatureFlag.isSimulationEnabled.mockReturnValue(false);

      const body = { scenarios: [] };

      await expect(controller.rank('inc-1', body))
        .rejects.toThrow(SimulationDisabledException);

      expect(mockRanker.rank).not.toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // 4. Empty scenarios → 200 + empty result
  // ==========================================================================

  describe('empty scenarios', () => {
    it('should return empty result for empty array', async () => {
      mockRanker.rank.mockReturnValue({ scenarios: [], fronts: [], tradeoffs: [] });

      const result = await controller.rank('inc-1', { scenarios: [] });

      expect(result.scenarios).toHaveLength(0);
      expect(result.fronts).toHaveLength(0);
      expect(result.tradeoffs).toHaveLength(0);
    });
  });
});
