/**
 * Task 2.4 - Strategy Layer Tests
 *
 * Strategy selection ve registry testleri
 * Requirements: 2.1-2.8
 */

import {
  CaseType,
  CaseMetadata,
} from '../strategy/case-type-strategy.interface';
import {
  CaseTypeStrategyRegistry,
  KambiyoSenediStrategy,
  IlamsizGenelStrategy,
  IlamliStrategy,
  TTK1530Strategy,
  KiraAlacagiStrategy,
} from '../strategy/case-type-strategy.registry';
import { StrategySelectorService } from '../strategy/strategy-selector.service';
import { InterestTypeCode } from '../types/domain.types';

describe('Task 2.1: CaseTypeStrategy Interface', () => {
  describe('KambiyoSenediStrategy', () => {
    const strategy = new KambiyoSenediStrategy();

    it('should have correct name and caseType', () => {
      expect(strategy.name).toBe('KambiyoSenediStrategy');
      expect(strategy.caseType).toBe(CaseType.KAMBIYO_SENEDI);
    });

    it('should return correct claim config', () => {
      const config = strategy.getClaimConfig();
      expect(config.defaultInterestStartRule).toBe('DUE_DATE');
      expect(config.defaultInterestType).toBe(InterestTypeCode.LEGAL_3095);
      expect(config.allowedAncillaryTypes).toContain('KOMISYON');
    });

    it('should return correct rate config', () => {
      const config = strategy.getRateConfig();
      expect(config.allowedRateTypes).toContain(InterestTypeCode.LEGAL_3095);
      expect(config.allowedRateTypes).toContain(InterestTypeCode.COMMERCIAL_AVANS_3095_2_2);
      expect(config.maxContractRateMultiplier).toBe(3);
    });

    it('should return correct policy config', () => {
      const config = strategy.getPolicyConfig();
      expect(config.defaultRoundingScope).toBe('TOTAL_ONLY');
      expect(config.gapPolicy).toBe('BLOCK');
    });

    it('should be applicable for KAMBIYO_SENEDI case type', () => {
      expect(strategy.isApplicable({ caseType: CaseType.KAMBIYO_SENEDI })).toBe(true);
    });

    it('should be applicable for CEK claim type', () => {
      expect(strategy.isApplicable({ claimType: 'CEK' })).toBe(true);
      expect(strategy.isApplicable({ claimType: 'BONO' })).toBe(true);
    });

    it('should not be applicable for other case types', () => {
      expect(strategy.isApplicable({ caseType: CaseType.ILAMLI })).toBe(false);
    });
  });

  describe('TTK1530Strategy', () => {
    const strategy = new TTK1530Strategy();

    it('should have correct name and caseType', () => {
      expect(strategy.name).toBe('TTK1530Strategy');
      expect(strategy.caseType).toBe(CaseType.TTK_1530);
    });

    it('should use DUE_DATE_OR_30D rule', () => {
      const config = strategy.getClaimConfig();
      expect(config.defaultInterestStartRule).toBe('DUE_DATE_OR_30D');
    });

    it('should default to COMMERCIAL_AVANS rate', () => {
      const config = strategy.getRateConfig();
      expect(config.defaultRateType).toBe(InterestTypeCode.COMMERCIAL_AVANS_3095_2_2);
    });

    it('should use HIGHEST_RATE_FIRST priority', () => {
      const config = strategy.getPolicyConfig();
      expect(config.defaultClaimPriorityRule).toBe('HIGHEST_RATE_FIRST');
    });

    it('should be applicable for commercial transactions', () => {
      expect(strategy.isApplicable({ isCommercial: true })).toBe(true);
    });
  });

  describe('IlamsizGenelStrategy', () => {
    const strategy = new IlamsizGenelStrategy();

    it('should use DEMAND_DATE rule', () => {
      const config = strategy.getClaimConfig();
      expect(config.defaultInterestStartRule).toBe('DEMAND_DATE');
    });

    it('should have WARN gap policy', () => {
      const config = strategy.getPolicyConfig();
      expect(config.gapPolicy).toBe('WARN');
    });
  });

  describe('KiraAlacagiStrategy', () => {
    const strategy = new KiraAlacagiStrategy();

    it('should have lower max contract rate multiplier', () => {
      const config = strategy.getRateConfig();
      expect(config.maxContractRateMultiplier).toBe(1.5);
    });

    it('should only allow TRY currency', () => {
      const config = strategy.getRateConfig();
      expect(config.allowedCurrencies).toEqual(['TRY']);
    });
  });
});

describe('Task 2.2: CaseTypeStrategy Registry', () => {
  let registry: CaseTypeStrategyRegistry;

  beforeEach(() => {
    registry = new CaseTypeStrategyRegistry();
  });

  it('should register all default strategies', () => {
    expect(registry.has(CaseType.KAMBIYO_SENEDI)).toBe(true);
    expect(registry.has(CaseType.ILAMSIZ_GENEL)).toBe(true);
    expect(registry.has(CaseType.ILAMLI)).toBe(true);
    expect(registry.has(CaseType.TTK_1530)).toBe(true);
    expect(registry.has(CaseType.KIRA_ALACAGI)).toBe(true);
  });

  it('should return correct strategy for case type', () => {
    const strategy = registry.get(CaseType.KAMBIYO_SENEDI);
    expect(strategy).toBeDefined();
    expect(strategy!.caseType).toBe(CaseType.KAMBIYO_SENEDI);
  });

  it('should return undefined for unknown case type', () => {
    const strategy = registry.get('UNKNOWN' as CaseType);
    expect(strategy).toBeUndefined();
  });

  it('should list all strategies', () => {
    const strategies = registry.getAll();
    expect(strategies.length).toBeGreaterThanOrEqual(5);
  });

  it('should allow registering custom strategy', () => {
    const customStrategy = new KambiyoSenediStrategy();
    registry.register(customStrategy);
    expect(registry.get(CaseType.KAMBIYO_SENEDI)).toBe(customStrategy);
  });
});

describe('Task 2.3: Strategy Selector Service', () => {
  let selector: StrategySelectorService;
  let registry: CaseTypeStrategyRegistry;

  beforeEach(() => {
    registry = new CaseTypeStrategyRegistry();
    selector = new StrategySelectorService(registry);
  });

  describe('selectStrategy', () => {
    it('should select strategy by explicit caseType', () => {
      const metadata: CaseMetadata = { caseType: CaseType.KAMBIYO_SENEDI };
      const strategy = selector.selectStrategy(metadata);
      expect(strategy.caseType).toBe(CaseType.KAMBIYO_SENEDI);
    });

    it('should infer strategy from claimType', () => {
      const metadata: CaseMetadata = { claimType: 'CEK' };
      const strategy = selector.selectStrategy(metadata);
      expect(strategy.caseType).toBe(CaseType.KAMBIYO_SENEDI);
    });

    it('should infer TTK1530 for commercial transactions', () => {
      const metadata: CaseMetadata = { isCommercial: true };
      const strategy = selector.selectStrategy(metadata);
      expect(strategy.caseType).toBe(CaseType.TTK_1530);
    });

    it('should default to ILAMSIZ_GENEL when no match', () => {
      const metadata: CaseMetadata = {};
      const strategy = selector.selectStrategy(metadata);
      expect(strategy.caseType).toBe(CaseType.ILAMSIZ_GENEL);
    });

    it('should throw for unknown explicit caseType', () => {
      const metadata: CaseMetadata = { caseType: 'UNKNOWN' as CaseType };
      expect(() => selector.selectStrategy(metadata)).toThrow();
    });
  });

  describe('getStrategy', () => {
    it('should return strategy for valid case type', () => {
      const strategy = selector.getStrategy(CaseType.ILAMLI);
      expect(strategy.caseType).toBe(CaseType.ILAMLI);
    });

    it('should throw for invalid case type', () => {
      expect(() => selector.getStrategy('INVALID' as CaseType)).toThrow();
    });
  });

  describe('listStrategies', () => {
    it('should list all registered strategies', () => {
      const list = selector.listStrategies();
      expect(list.length).toBeGreaterThanOrEqual(5);
      expect(list[0]).toHaveProperty('caseType');
      expect(list[0]).toHaveProperty('name');
      expect(list[0]).toHaveProperty('description');
    });
  });

  describe('validateMetadata', () => {
    it('should validate correct metadata', () => {
      const result = selector.validateMetadata({
        caseType: CaseType.KAMBIYO_SENEDI,
        currency: 'TRY',
      });
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject invalid currency', () => {
      const result = selector.validateMetadata({ currency: 'XYZ' });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Invalid currency: XYZ');
    });
  });
});

describe('Task 4.2: Rate Provider Service', () => {
  // Rate Provider tests are in sprint-1.spec.ts
  // This is a placeholder for additional tests if needed
  it('should be tested in sprint-1.spec.ts', () => {
    expect(true).toBe(true);
  });
});
