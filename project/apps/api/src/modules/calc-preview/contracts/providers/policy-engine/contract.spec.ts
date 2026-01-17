/**
 * Phase 5.6 - Policy Engine Contract Tests
 * 
 * Schema + Semantic validation tests.
 * 
 * @see contracts/README.md
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  PolicyReasonSchema,
  PolicySoftCheckResultSchema,
  validatePolicyReason as validateReasonSchema,
  validatePolicySoftCheckResult as validateSoftCheckSchema,
  POLICY_ENGINE_SCHEMA_VERSION,
} from './schema';
import {
  validatePolicyReason as validateReasonSemantic,
  validatePolicySoftCheckResult as validateSoftCheckSemantic,
  KNOWN_REASON_CODES,
  KNOWN_REASON_CODE_PREFIXES,
} from './semantic';

// ============================================================================
// FIXTURE LOADER
// ============================================================================

interface Fixture {
  description: string;
  softCheckResult?: unknown;
  expectedResult: {
    schemaValid: boolean;
    semanticValid: boolean;
    expectedViolations?: string[];
  };
}

function loadFixture(name: string): Fixture {
  const fixturePath = path.join(__dirname, 'fixtures', `${name}.json`);
  const content = fs.readFileSync(fixturePath, 'utf-8');
  return JSON.parse(content);
}

function loadAllFixtures(): { name: string; fixture: Fixture }[] {
  const fixturesDir = path.join(__dirname, 'fixtures');
  const files = fs.readdirSync(fixturesDir).filter(f => f.endsWith('.json'));
  
  return files.map(file => ({
    name: file.replace('.json', ''),
    fixture: loadFixture(file.replace('.json', '')),
  }));
}

// ============================================================================
// SCHEMA TESTS
// ============================================================================

describe('Policy Engine Contract - Schema Validation', () => {
  describe('ok-* fixtures should pass schema validation', () => {
    const fixtures = loadAllFixtures().filter(f => f.name.startsWith('ok-'));
    
    test.each(fixtures)('$name: schema valid', ({ fixture }) => {
      if (fixture.softCheckResult) {
        const result = validateSoftCheckSchema(fixture.softCheckResult);
        expect(result.success).toBe(true);
      }
    });
  });
  
  describe('bad-* fixtures schema validation', () => {
    const fixtures = loadAllFixtures().filter(f => f.name.startsWith('bad-'));
    
    test.each(fixtures)('$name: schema validation matches expected', ({ fixture }) => {
      if (fixture.softCheckResult) {
        const result = validateSoftCheckSchema(fixture.softCheckResult);
        expect(result.success).toBe(fixture.expectedResult.schemaValid);
      }
    });
  });
  
  describe('PolicyReason schema edge cases', () => {
    test('rejects empty code', () => {
      const invalid = {
        code: '',
        message: 'Test',
        severity: 'ERROR',
      };
      
      const result = PolicyReasonSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });
    
    test('rejects invalid severity', () => {
      const invalid = {
        code: 'TEST',
        message: 'Test',
        severity: 'INVALID',
      };
      
      const result = PolicyReasonSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });
    
    test('accepts valid reason', () => {
      const valid = {
        code: 'GATE_CASE_CLOSED',
        message: 'Case is closed',
        severity: 'ERROR',
        gateCode: 'CASE_CLOSED',
      };
      
      const result = PolicyReasonSchema.safeParse(valid);
      expect(result.success).toBe(true);
    });
  });
  
  describe('PolicySoftCheckResult schema edge cases', () => {
    test('rejects invalid outcome', () => {
      const invalid = {
        outcome: 'INVALID',
        reasons: [],
        gatesChecked: [],
        policyVersion: '1.0',
        checkedAt: '2026-01-16T10:00:00Z',
      };
      
      const result = PolicySoftCheckResultSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });
    
    test('rejects empty policy version', () => {
      const invalid = {
        outcome: 'PASS',
        reasons: [],
        gatesChecked: [],
        policyVersion: '',
        checkedAt: '2026-01-16T10:00:00Z',
      };
      
      const result = PolicySoftCheckResultSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });
  });
});

// ============================================================================
// SEMANTIC TESTS
// ============================================================================

describe('Policy Engine Contract - Semantic Validation', () => {
  describe('ok-* fixtures should pass semantic validation', () => {
    const fixtures = loadAllFixtures().filter(f => f.name.startsWith('ok-'));
    
    test.each(fixtures)('$name: semantic valid', ({ fixture }) => {
      if (fixture.softCheckResult) {
        const schemaResult = validateSoftCheckSchema(fixture.softCheckResult);
        if (schemaResult.success) {
          const semanticResult = validateSoftCheckSemantic(schemaResult.data);
          expect(semanticResult.valid).toBe(true);
        }
      }
    });
  });
  
  describe('bad-* fixtures should fail semantic validation', () => {
    const fixtures = loadAllFixtures().filter(f => f.name.startsWith('bad-'));
    
    test.each(fixtures)('$name: semantic invalid with expected violations', ({ fixture }) => {
      if (fixture.softCheckResult) {
        const schemaResult = validateSoftCheckSchema(fixture.softCheckResult);
        
        if (!schemaResult.success) {
          expect(fixture.expectedResult.schemaValid).toBe(false);
          return;
        }
        
        const semanticResult = validateSoftCheckSemantic(schemaResult.data);
        expect(semanticResult.valid).toBe(fixture.expectedResult.semanticValid);
        
        if (fixture.expectedResult.expectedViolations) {
          const violationRules = semanticResult.violations.map(v => v.rule);
          for (const expected of fixture.expectedResult.expectedViolations) {
            expect(violationRules).toContain(expected);
          }
        }
      }
    });
  });
  
  describe('Semantic rule: BLOCK_WITHOUT_REASONS', () => {
    test('detects BLOCK without reasons', () => {
      const result = {
        outcome: 'BLOCK' as const,
        reasons: [],
        gatesChecked: ['GATE_TEST'],
        policyVersion: '1.0',
        checkedAt: '2026-01-16T10:00:00Z',
      };
      
      const semanticResult = validateSoftCheckSemantic(result);
      expect(semanticResult.valid).toBe(false);
      expect(semanticResult.violations.some(v => v.rule === 'BLOCK_WITHOUT_REASONS')).toBe(true);
    });
    
    test('allows BLOCK with reasons', () => {
      const result = {
        outcome: 'BLOCK' as const,
        reasons: [{
          code: 'GATE_CASE_CLOSED',
          message: 'Case closed',
          severity: 'ERROR' as const,
        }],
        gatesChecked: ['GATE_CASE_CLOSED'],
        policyVersion: '1.0',
        checkedAt: '2026-01-16T10:00:00Z',
      };
      
      const semanticResult = validateSoftCheckSemantic(result);
      expect(semanticResult.violations.filter(v => v.rule === 'BLOCK_WITHOUT_REASONS')).toHaveLength(0);
    });
  });
  
  describe('Semantic rule: PASS_WITH_ERRORS', () => {
    test('detects PASS with ERROR reasons', () => {
      const result = {
        outcome: 'PASS' as const,
        reasons: [{
          code: 'GATE_TEST',
          message: 'Error',
          severity: 'ERROR' as const,
        }],
        gatesChecked: ['GATE_TEST'],
        policyVersion: '1.0',
        checkedAt: '2026-01-16T10:00:00Z',
      };
      
      const semanticResult = validateSoftCheckSemantic(result);
      expect(semanticResult.valid).toBe(false);
      expect(semanticResult.violations.some(v => v.rule === 'PASS_WITH_ERRORS')).toBe(true);
    });
    
    test('allows PASS with WARNING reasons', () => {
      const result = {
        outcome: 'PASS' as const,
        reasons: [{
          code: 'WARNING_TEST',
          message: 'Warning',
          severity: 'WARNING' as const,
        }],
        gatesChecked: ['GATE_TEST'],
        policyVersion: '1.0',
        checkedAt: '2026-01-16T10:00:00Z',
      };
      
      const semanticResult = validateSoftCheckSemantic(result);
      expect(semanticResult.violations.filter(v => v.rule === 'PASS_WITH_ERRORS')).toHaveLength(0);
    });
  });
  
  describe('Semantic rule: UNKNOWN_REASON_CODE', () => {
    test('warns on unknown code namespace', () => {
      const reason = {
        code: 'RANDOM_CODE_123',
        message: 'Test',
        severity: 'WARNING' as const,
      };
      
      const semanticResult = validateReasonSemantic(reason);
      expect(semanticResult.violations.some(v => v.rule === 'UNKNOWN_REASON_CODE')).toBe(true);
    });
    
    test('accepts known code', () => {
      const reason = {
        code: 'GATE_CASE_CLOSED',
        message: 'Test',
        severity: 'ERROR' as const,
      };
      
      const semanticResult = validateReasonSemantic(reason);
      expect(semanticResult.violations.filter(v => v.rule === 'UNKNOWN_REASON_CODE')).toHaveLength(0);
    });
    
    test('accepts code with known prefix', () => {
      const reason = {
        code: 'GATE_NEW_CUSTOM_GATE',
        message: 'Test',
        severity: 'ERROR' as const,
      };
      
      const semanticResult = validateReasonSemantic(reason);
      expect(semanticResult.violations.filter(v => v.rule === 'UNKNOWN_REASON_CODE')).toHaveLength(0);
    });
  });
});

// ============================================================================
// CONTRACT VERSION TEST
// ============================================================================

describe('Policy Engine Contract - Version', () => {
  test('schema version is v1', () => {
    expect(POLICY_ENGINE_SCHEMA_VERSION).toBe('v1');
  });
  
  test('known codes are documented', () => {
    expect(KNOWN_REASON_CODES.size).toBeGreaterThan(0);
    expect(KNOWN_REASON_CODE_PREFIXES.length).toBeGreaterThan(0);
  });
});
