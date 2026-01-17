/**
 * Phase 5.6 - Rate Provider Contract Tests
 * 
 * Schema + Semantic validation tests.
 * 
 * @see contracts/README.md
 */

import * as fs from 'fs';
import * as path from 'path';
import { 
  RateEntrySchema, 
  RatesForPeriodResponseSchema,
  CoverageInfoSchema,
  validateRateEntry as validateRateEntrySchema,
  validateRatesForPeriod,
  validateCoverageInfo,
} from './schema';
import {
  validateRateEntry as validateRateEntrySemantic,
  validateRateCollection,
  SemanticValidationResult,
} from './semantic';

// ============================================================================
// FIXTURE LOADER
// ============================================================================

interface Fixture {
  description: string;
  rates: unknown[];
  coverage?: unknown;
  query?: { startDate: string; endDate: string };
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

describe('Rate Provider Contract - Schema Validation', () => {
  describe('ok-* fixtures should pass schema validation', () => {
    const fixtures = loadAllFixtures().filter(f => f.name.startsWith('ok-'));
    
    test.each(fixtures)('$name: schema valid', ({ fixture }) => {
      // Validate rates
      const ratesResult = validateRatesForPeriod(fixture.rates);
      expect(ratesResult.success).toBe(true);
      
      // Validate coverage if present
      if (fixture.coverage) {
        const coverageResult = validateCoverageInfo(fixture.coverage);
        expect(coverageResult.success).toBe(true);
      }
    });
  });
  
  describe('bad-* fixtures schema validation', () => {
    const fixtures = loadAllFixtures().filter(f => f.name.startsWith('bad-'));
    
    test.each(fixtures)('$name: schema validation matches expected', ({ fixture }) => {
      const ratesResult = validateRatesForPeriod(fixture.rates);
      expect(ratesResult.success).toBe(fixture.expectedResult.schemaValid);
    });
  });
  
  describe('RateEntry schema edge cases', () => {
    test('rejects negative rate', () => {
      const invalidRate = {
        id: 'test',
        interestType: 'LEGAL_3095',
        annualRate: -5,
        validFrom: '2024-01-01',
        validTo: '2024-12-31',
        sourceId: 'test',
        sourceName: 'Test',
        publishedAt: '2024-01-01T00:00:00Z',
        currency: 'TRY',
      };
      
      const result = RateEntrySchema.safeParse(invalidRate);
      expect(result.success).toBe(false);
    });
    
    test('rejects invalid date format', () => {
      const invalidRate = {
        id: 'test',
        interestType: 'LEGAL_3095',
        annualRate: 24,
        validFrom: '01-01-2024', // Wrong format
        validTo: '2024-12-31',
        sourceId: 'test',
        sourceName: 'Test',
        publishedAt: '2024-01-01T00:00:00Z',
        currency: 'TRY',
      };
      
      const result = RateEntrySchema.safeParse(invalidRate);
      expect(result.success).toBe(false);
    });
    
    test('rejects invalid currency length', () => {
      const invalidRate = {
        id: 'test',
        interestType: 'LEGAL_3095',
        annualRate: 24,
        validFrom: '2024-01-01',
        validTo: '2024-12-31',
        sourceId: 'test',
        sourceName: 'Test',
        publishedAt: '2024-01-01T00:00:00Z',
        currency: 'TRYY', // 4 chars
      };
      
      const result = RateEntrySchema.safeParse(invalidRate);
      expect(result.success).toBe(false);
    });
    
    test('accepts null validTo (open-ended)', () => {
      const validRate = {
        id: 'test',
        interestType: 'LEGAL_3095',
        annualRate: 24,
        validFrom: '2024-01-01',
        validTo: null,
        sourceId: 'test',
        sourceName: 'Test',
        publishedAt: '2024-01-01T00:00:00Z',
        currency: 'TRY',
      };
      
      const result = RateEntrySchema.safeParse(validRate);
      expect(result.success).toBe(true);
    });
  });
});

// ============================================================================
// SEMANTIC TESTS
// ============================================================================

describe('Rate Provider Contract - Semantic Validation', () => {
  describe('ok-* fixtures should pass semantic validation', () => {
    const fixtures = loadAllFixtures().filter(f => f.name.startsWith('ok-'));
    
    test.each(fixtures)('$name: semantic valid', ({ fixture }) => {
      // First validate schema
      const ratesResult = validateRatesForPeriod(fixture.rates);
      expect(ratesResult.success).toBe(true);
      
      if (!ratesResult.success) return;
      
      // Then validate semantics
      const coverageResult = fixture.coverage 
        ? validateCoverageInfo(fixture.coverage)
        : null;
      
      const coverage = coverageResult?.success ? coverageResult.data : null;
      
      const semanticResult = validateRateCollection(
        ratesResult.data,
        coverage,
        fixture.query?.startDate,
        fixture.query?.endDate,
      );
      
      expect(semanticResult.valid).toBe(true);
      expect(semanticResult.violations.filter(v => v.severity === 'ERROR')).toHaveLength(0);
    });
  });
  
  describe('bad-* fixtures should fail semantic validation', () => {
    const fixtures = loadAllFixtures().filter(f => f.name.startsWith('bad-'));
    
    test.each(fixtures)('$name: semantic invalid with expected violations', ({ fixture }) => {
      // First validate schema (might pass)
      const ratesResult = validateRatesForPeriod(fixture.rates);
      
      if (!ratesResult.success) {
        // Schema failed, semantic test not applicable
        expect(fixture.expectedResult.schemaValid).toBe(false);
        return;
      }
      
      // Validate coverage
      const coverageResult = fixture.coverage 
        ? validateCoverageInfo(fixture.coverage)
        : null;
      
      const coverage = coverageResult?.success ? coverageResult.data : null;
      
      // Validate semantics
      const semanticResult = validateRateCollection(
        ratesResult.data,
        coverage,
        fixture.query?.startDate,
        fixture.query?.endDate,
      );
      
      expect(semanticResult.valid).toBe(fixture.expectedResult.semanticValid);
      
      // Check expected violations
      if (fixture.expectedResult.expectedViolations) {
        const violationRules = semanticResult.violations.map(v => v.rule);
        for (const expected of fixture.expectedResult.expectedViolations) {
          expect(violationRules).toContain(expected);
        }
      }
    });
  });
  
  describe('Semantic rule: DATE_ORDER', () => {
    test('detects validFrom >= validTo', () => {
      const rate = {
        id: 'test',
        interestType: 'LEGAL_3095',
        annualRate: 24,
        validFrom: '2024-12-31',
        validTo: '2024-01-01', // Before validFrom!
        sourceId: 'test',
        sourceName: 'Test',
        publishedAt: '2024-01-01T00:00:00Z',
        currency: 'TRY',
      };
      
      const result = validateRateEntrySemantic(rate);
      expect(result.valid).toBe(false);
      expect(result.violations.some(v => v.rule === 'DATE_ORDER')).toBe(true);
    });
  });
  
  describe('Semantic rule: OVERLAP_DETECTED', () => {
    test('detects overlapping periods', () => {
      const rates = [
        {
          id: 'rate_001',
          interestType: 'LEGAL_3095',
          annualRate: 24,
          validFrom: '2024-01-01',
          validTo: '2024-06-30',
          sourceId: 'test',
          sourceName: 'Test',
          publishedAt: '2024-01-01T00:00:00Z',
          currency: 'TRY',
        },
        {
          id: 'rate_002',
          interestType: 'LEGAL_3095',
          annualRate: 24,
          validFrom: '2024-03-01', // Overlaps with rate_001
          validTo: '2024-12-31',
          sourceId: 'test',
          sourceName: 'Test',
          publishedAt: '2024-03-01T00:00:00Z',
          currency: 'TRY',
        },
      ];
      
      const result = validateRateCollection(rates, null);
      expect(result.valid).toBe(false);
      expect(result.violations.some(v => v.rule === 'OVERLAP_DETECTED')).toBe(true);
    });
    
    test('allows adjacent periods (no overlap)', () => {
      const rates = [
        {
          id: 'rate_001',
          interestType: 'LEGAL_3095',
          annualRate: 24,
          validFrom: '2024-01-01',
          validTo: '2024-06-30',
          sourceId: 'test',
          sourceName: 'Test',
          publishedAt: '2024-01-01T00:00:00Z',
          currency: 'TRY',
        },
        {
          id: 'rate_002',
          interestType: 'LEGAL_3095',
          annualRate: 24,
          validFrom: '2024-06-30', // Starts exactly when rate_001 ends
          validTo: '2024-12-31',
          sourceId: 'test',
          sourceName: 'Test',
          publishedAt: '2024-06-30T00:00:00Z',
          currency: 'TRY',
        },
      ];
      
      const result = validateRateCollection(rates, null);
      expect(result.violations.filter(v => v.rule === 'OVERLAP_DETECTED')).toHaveLength(0);
    });
  });
  
  describe('Semantic rule: INVALID_CURRENCY', () => {
    test('rejects unknown currency', () => {
      const rate = {
        id: 'test',
        interestType: 'LEGAL_3095',
        annualRate: 24,
        validFrom: '2024-01-01',
        validTo: '2024-12-31',
        sourceId: 'test',
        sourceName: 'Test',
        publishedAt: '2024-01-01T00:00:00Z',
        currency: 'XYZ', // Unknown
      };
      
      const result = validateRateEntrySemantic(rate);
      expect(result.valid).toBe(false);
      expect(result.violations.some(v => v.rule === 'INVALID_CURRENCY')).toBe(true);
    });
  });
});

// ============================================================================
// CONTRACT VERSION TEST
// ============================================================================

describe('Rate Provider Contract - Version', () => {
  test('schema version is v1', () => {
    const { RATE_PROVIDER_SCHEMA_VERSION } = require('./schema');
    expect(RATE_PROVIDER_SCHEMA_VERSION).toBe('v1');
  });
});
