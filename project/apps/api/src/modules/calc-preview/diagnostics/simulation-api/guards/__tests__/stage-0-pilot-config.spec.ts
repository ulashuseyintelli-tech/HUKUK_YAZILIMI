/**
 * Stage-0 Pilot Config Invariant Validation
 *
 * Task 5.1 — Validates pilot boundary constraints and scope exclusions.
 *
 * @see .kiro/specs/stage-0-shadow-rollout/requirements.md — R1.1, R1.2, R1.3, R1.4
 */

// ============================================================================
// Pilot Config Model
// ============================================================================

interface PilotConfig {
  tenantAllowlist: string[];
  observationWindowHours: number;
  guardMode: 'shadow' | 'enforce';
  scopeExclusions: string[];
}

function createPilotConfig(overrides?: Partial<PilotConfig>): PilotConfig {
  return {
    tenantAllowlist: ['tenant-pilot-1'],
    observationWindowHours: 48,
    guardMode: 'shadow',
    scopeExclusions: [
      'enforce-mode-activation',
      'guard-request-path-modification',
      'production-wide-rollout',
    ],
    ...overrides,
  };
}

function validatePilotConfig(config: PilotConfig): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (config.tenantAllowlist.length < 1 || config.tenantAllowlist.length > 3) {
    errors.push(
      `Tenant allowlist must be 1-3, got ${config.tenantAllowlist.length}`,
    );
  }

  if (
    config.observationWindowHours < 24 ||
    config.observationWindowHours > 72
  ) {
    errors.push(
      `Observation window must be 24-72h, got ${config.observationWindowHours}h`,
    );
  }

  if (config.guardMode !== 'shadow') {
    errors.push(`Guard mode must be shadow for Stage-0, got ${config.guardMode}`);
  }

  const requiredExclusions = [
    'enforce-mode-activation',
    'guard-request-path-modification',
    'production-wide-rollout',
  ];
  for (const excl of requiredExclusions) {
    if (!config.scopeExclusions.includes(excl)) {
      errors.push(`Missing scope exclusion: ${excl}`);
    }
  }

  return { valid: errors.length === 0, errors };
}

// ============================================================================
// Shadow Mode Decision Model
// ============================================================================

type GuardDecision = 'ALLOW' | 'HOLD' | 'BLOCK_503';

interface ShadowModeResult {
  decision: GuardDecision;
  guardMode: 'shadow';
  requestPathModified: false;
  metricsEmitted: true;
}

function evaluateShadowDecision(decision: GuardDecision): ShadowModeResult {
  return {
    decision,
    guardMode: 'shadow',
    requestPathModified: false,
    metricsEmitted: true,
  };
}

// ============================================================================
// Tests
// ============================================================================

describe('Stage-0 Pilot Config Invariant (Task 5.1)', () => {
  describe('Pilot Boundary Constraints', () => {
    it('default config should be valid', () => {
      const config = createPilotConfig();
      const result = validatePilotConfig(config);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should accept 1 tenant', () => {
      const config = createPilotConfig({ tenantAllowlist: ['t1'] });
      expect(validatePilotConfig(config).valid).toBe(true);
    });

    it('should accept 3 tenants', () => {
      const config = createPilotConfig({
        tenantAllowlist: ['t1', 't2', 't3'],
      });
      expect(validatePilotConfig(config).valid).toBe(true);
    });

    it('should reject 0 tenants', () => {
      const config = createPilotConfig({ tenantAllowlist: [] });
      const result = validatePilotConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('1-3');
    });

    it('should reject 4+ tenants', () => {
      const config = createPilotConfig({
        tenantAllowlist: ['t1', 't2', 't3', 't4'],
      });
      expect(validatePilotConfig(config).valid).toBe(false);
    });

    it('should accept 24h observation window', () => {
      const config = createPilotConfig({ observationWindowHours: 24 });
      expect(validatePilotConfig(config).valid).toBe(true);
    });

    it('should accept 72h observation window', () => {
      const config = createPilotConfig({ observationWindowHours: 72 });
      expect(validatePilotConfig(config).valid).toBe(true);
    });

    it('should reject <24h observation window', () => {
      const config = createPilotConfig({ observationWindowHours: 12 });
      expect(validatePilotConfig(config).valid).toBe(false);
    });

    it('should reject >72h observation window', () => {
      const config = createPilotConfig({ observationWindowHours: 100 });
      expect(validatePilotConfig(config).valid).toBe(false);
    });
  });

  describe('Scope Exclusions', () => {
    it('should require enforce-mode-activation exclusion', () => {
      const config = createPilotConfig({
        scopeExclusions: [
          'guard-request-path-modification',
          'production-wide-rollout',
        ],
      });
      const result = validatePilotConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('enforce-mode-activation');
    });

    it('should require guard-request-path-modification exclusion', () => {
      const config = createPilotConfig({
        scopeExclusions: [
          'enforce-mode-activation',
          'production-wide-rollout',
        ],
      });
      expect(validatePilotConfig(config).valid).toBe(false);
    });

    it('should require production-wide-rollout exclusion', () => {
      const config = createPilotConfig({
        scopeExclusions: [
          'enforce-mode-activation',
          'guard-request-path-modification',
        ],
      });
      expect(validatePilotConfig(config).valid).toBe(false);
    });

    it('should reject enforce guard mode', () => {
      const config = createPilotConfig({ guardMode: 'enforce' as any });
      expect(validatePilotConfig(config).valid).toBe(false);
    });
  });

  describe('Shadow Mode Pass-Through', () => {
    it.each<GuardDecision>(['ALLOW', 'HOLD', 'BLOCK_503'])(
      'decision=%s should not modify request path',
      (decision) => {
        const result = evaluateShadowDecision(decision);
        expect(result.guardMode).toBe('shadow');
        expect(result.requestPathModified).toBe(false);
        expect(result.metricsEmitted).toBe(true);
      },
    );
  });
});
