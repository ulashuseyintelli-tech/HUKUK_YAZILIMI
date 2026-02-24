/**
 * T-B2: Window Validity Kuralları — Reason Codes + Unit Tests
 *
 * DoD:
 * - 72h / 168h ayrımı: yüksek/düşük hacim sınıflaması deterministic
 * - Missing data / scrape gap → window invalid
 * - Her invalid nedeni closed-set reason code ile raporlanır
 * - Extend limitleri: maksimum uzatma aşınca "baseline invalid"
 *
 * @see .kiro/specs/stage-1-runtime-baseline/baseline-plan.md — §3
 */

import {
  classifyTenantVolume,
  getRequiredWindowHours,
  validateWindow,
  MIN_DATA_POINTS,
  HIGH_VOLUME_THRESHOLD,
  LOW_VOLUME_THRESHOLD,
  SCRAPE_INTERVAL_MINUTES,
  type TenantVolumeClass,
  type WindowInvalidReason,
} from '../baseline-math';

describe('T-B2: Window Validity Rules', () => {
  // ========================================================================
  // Tenant Volume Classification (72h vs 168h)
  // ========================================================================

  describe('Tenant volume classification', () => {
    it('≥ 500 promotes/day → HIGH', () => {
      expect(classifyTenantVolume(500)).toBe('HIGH');
      expect(classifyTenantVolume(1000)).toBe('HIGH');
    });

    it('≤ 50 promotes/day → LOW', () => {
      expect(classifyTenantVolume(50)).toBe('LOW');
      expect(classifyTenantVolume(10)).toBe('LOW');
      expect(classifyTenantVolume(0)).toBe('LOW');
    });

    it('51–499 promotes/day → MEDIUM', () => {
      expect(classifyTenantVolume(51)).toBe('MEDIUM');
      expect(classifyTenantVolume(250)).toBe('MEDIUM');
      expect(classifyTenantVolume(499)).toBe('MEDIUM');
    });

    it('boundary: exactly 500 → HIGH', () => {
      expect(classifyTenantVolume(HIGH_VOLUME_THRESHOLD)).toBe('HIGH');
    });

    it('boundary: exactly 50 → LOW', () => {
      expect(classifyTenantVolume(LOW_VOLUME_THRESHOLD)).toBe('LOW');
    });

    it('classification is deterministic', () => {
      const v1 = classifyTenantVolume(300);
      const v2 = classifyTenantVolume(300);
      expect(v1).toBe(v2);
    });
  });

  // ========================================================================
  // Required Window Hours
  // ========================================================================

  describe('Required window hours', () => {
    it('HIGH volume → 72h', () => {
      expect(getRequiredWindowHours('HIGH')).toBe(72);
    });

    it('MEDIUM volume → 72h', () => {
      expect(getRequiredWindowHours('MEDIUM')).toBe(72);
    });

    it('LOW volume → 168h', () => {
      expect(getRequiredWindowHours('LOW')).toBe(168);
    });
  });

  // ========================================================================
  // Valid Window
  // ========================================================================

  describe('Valid window', () => {
    it('should pass with sufficient data and duration (HIGH)', () => {
      const result = validateWindow(864, 72, 'HIGH', false, false, false);
      expect(result.valid).toBe(true);
      expect(result.reason).toBeNull();
    });

    it('should pass with sufficient data and duration (LOW)', () => {
      const result = validateWindow(2016, 168, 'LOW', false, false, false);
      expect(result.valid).toBe(true);
      expect(result.reason).toBeNull();
    });

    it('should pass with exactly minimum data points', () => {
      const result = validateWindow(MIN_DATA_POINTS, 72, 'HIGH', false, false, false);
      expect(result.valid).toBe(true);
    });

    it('should pass with exactly minimum hours', () => {
      const result = validateWindow(200, 72, 'HIGH', false, false, false);
      expect(result.valid).toBe(true);
    });
  });

  // ========================================================================
  // Invalid Window — Closed-Set Reason Codes
  // ========================================================================

  describe('Invalid window — reason codes', () => {
    it('INFRA_INCIDENT: infra incident invalidates window', () => {
      const result = validateWindow(864, 72, 'HIGH', true, false, false);
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('INFRA_INCIDENT');
    });

    it('CONFIG_CHANGE: guard config change invalidates window', () => {
      const result = validateWindow(864, 72, 'HIGH', false, true, false);
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('CONFIG_CHANGE');
    });

    it('KILL_SWITCH_ACTIVATION: kill-switch invalidates window', () => {
      const result = validateWindow(864, 72, 'HIGH', false, false, true);
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('KILL_SWITCH_ACTIVATION');
    });

    it('SCRAPE_GAP: gap > 15 minutes invalidates window', () => {
      const result = validateWindow(864, 72, 'HIGH', false, false, false, 16);
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('SCRAPE_GAP');
    });

    it('SCRAPE_GAP boundary: exactly 15 minutes is valid', () => {
      const result = validateWindow(864, 72, 'HIGH', false, false, false, 15);
      expect(result.valid).toBe(true);
    });

    it('INSUFFICIENT_DATA: below minimum data points', () => {
      const result = validateWindow(MIN_DATA_POINTS - 1, 72, 'HIGH', false, false, false);
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('INSUFFICIENT_DATA');
    });

    it('INSUFFICIENT_DATA: below minimum hours (HIGH)', () => {
      const result = validateWindow(200, 71, 'HIGH', false, false, false);
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('INSUFFICIENT_DATA');
    });

    it('INSUFFICIENT_DATA: below minimum hours (LOW)', () => {
      const result = validateWindow(2016, 167, 'LOW', false, false, false);
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('INSUFFICIENT_DATA');
    });
  });

  // ========================================================================
  // Reason Code Priority (infra > config > kill-switch > scrape > data)
  // ========================================================================

  describe('Reason code priority', () => {
    it('INFRA_INCIDENT takes priority over CONFIG_CHANGE', () => {
      const result = validateWindow(864, 72, 'HIGH', true, true, false);
      expect(result.reason).toBe('INFRA_INCIDENT');
    });

    it('CONFIG_CHANGE takes priority over KILL_SWITCH', () => {
      const result = validateWindow(864, 72, 'HIGH', false, true, true);
      expect(result.reason).toBe('CONFIG_CHANGE');
    });

    it('KILL_SWITCH takes priority over SCRAPE_GAP', () => {
      const result = validateWindow(864, 72, 'HIGH', false, false, true, 20);
      expect(result.reason).toBe('KILL_SWITCH_ACTIVATION');
    });

    it('SCRAPE_GAP takes priority over INSUFFICIENT_DATA', () => {
      const result = validateWindow(50, 72, 'HIGH', false, false, false, 20);
      expect(result.reason).toBe('SCRAPE_GAP');
    });
  });

  // ========================================================================
  // Reason Code Closed-Set Exhaustiveness
  // ========================================================================

  describe('Reason code closed-set', () => {
    const allReasons: WindowInvalidReason[] = [
      'INFRA_INCIDENT',
      'CONFIG_CHANGE',
      'KILL_SWITCH_ACTIVATION',
      'INSUFFICIENT_DATA',
      'SCRAPE_GAP',
    ];

    it('every invalid reason should be in the closed set', () => {
      // Generate all possible invalid scenarios
      const scenarios: Array<{ result: ReturnType<typeof validateWindow>; scenario: string }> = [
        { result: validateWindow(864, 72, 'HIGH', true, false, false), scenario: 'infra' },
        { result: validateWindow(864, 72, 'HIGH', false, true, false), scenario: 'config' },
        { result: validateWindow(864, 72, 'HIGH', false, false, true), scenario: 'killswitch' },
        { result: validateWindow(50, 72, 'HIGH', false, false, false), scenario: 'data' },
        { result: validateWindow(864, 72, 'HIGH', false, false, false, 20), scenario: 'scrape' },
      ];

      for (const { result, scenario } of scenarios) {
        expect(result.valid).toBe(false);
        expect(allReasons).toContain(result.reason);
      }
    });

    it('valid window should have null reason', () => {
      const result = validateWindow(864, 72, 'HIGH', false, false, false);
      expect(result.valid).toBe(true);
      expect(result.reason).toBeNull();
    });
  });

  // ========================================================================
  // Data Point Calculation Sanity
  // ========================================================================

  describe('Data point calculation sanity', () => {
    it('72h at 5min interval = 864 data points', () => {
      const expected = (72 * 60) / SCRAPE_INTERVAL_MINUTES;
      expect(expected).toBe(864);
    });

    it('168h at 5min interval = 2016 data points', () => {
      const expected = (168 * 60) / SCRAPE_INTERVAL_MINUTES;
      expect(expected).toBe(2016);
    });

    it('minimum data points constant is 100', () => {
      expect(MIN_DATA_POINTS).toBe(100);
    });
  });

  // ========================================================================
  // Result Metadata
  // ========================================================================

  describe('Result metadata', () => {
    it('should include data points in result', () => {
      const result = validateWindow(500, 72, 'HIGH', false, false, false);
      expect(result.dataPoints).toBe(500);
    });

    it('should include required minimum hours', () => {
      const result = validateWindow(500, 72, 'LOW', false, false, false);
      expect(result.requiredMinimumHours).toBe(168);
    });

    it('should include actual hours', () => {
      const result = validateWindow(500, 96, 'HIGH', false, false, false);
      expect(result.actualHours).toBe(96);
    });
  });
});
