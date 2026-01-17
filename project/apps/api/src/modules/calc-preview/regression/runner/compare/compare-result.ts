/**
 * Phase 5.2 - Result Comparator
 * 
 * CalcPreviewResponse'ları karşılaştırır
 */

import { CalcPreviewResponse } from '../../../types';
import { ComparisonDiff, RoundingTolerance, GoldenScenario, AssertionFailure } from '../regression.types';
import { normalizeResult } from '../normalizers/normalize-result';
import { classifyDiff, DEFAULT_TOLERANCES, getMaxSeverity } from './diff-classifier';

// ============================================================================
// COMPARATOR
// ============================================================================

export interface ResultComparisonOutput {
  diffs: ComparisonDiff[];
  assertionFailures: AssertionFailure[];
  passed: boolean;
}

/**
 * İki CalcPreviewResponse'u karşılaştır
 */
export function compareResults(
  expected: CalcPreviewResponse,
  actual: CalcPreviewResponse,
  scenario: GoldenScenario,
): ResultComparisonOutput {
  const tolerances: RoundingTolerance = {
    ...DEFAULT_TOLERANCES,
    moneyAbsolute: scenario.expect.tolerances.moneyAbs,
    moneyRelative: scenario.expect.tolerances.moneyRel,
  };
  
  // Normalize
  const normalizedExpected = normalizeResult(expected);
  const normalizedActual = normalizeResult(actual);
  
  // Deep diff
  const diffs = deepDiff(normalizedExpected, normalizedActual, '', tolerances);
  
  // Assertion checks
  const assertionFailures = checkAssertions(actual, scenario);
  
  // Passed if no CRITICAL/MAJOR diffs and no assertion failures
  const maxSeverity = getMaxSeverity(diffs);
  const passed = 
    (maxSeverity === 'NOISE' || maxSeverity === 'MINOR') && 
    assertionFailures.length === 0;
  
  return {
    diffs,
    assertionFailures,
    passed,
  };
}

/**
 * Deep diff iki obje arasında
 */
function deepDiff(
  expected: Record<string, unknown>,
  actual: Record<string, unknown>,
  basePath: string,
  tolerances: RoundingTolerance,
): ComparisonDiff[] {
  const diffs: ComparisonDiff[] = [];
  
  // Expected'daki tüm alanları kontrol et
  for (const key of Object.keys(expected)) {
    const path = basePath ? `${basePath}.${key}` : key;
    const expectedValue = expected[key];
    const actualValue = actual[key];
    
    if (expectedValue && typeof expectedValue === 'object' && !Array.isArray(expectedValue)) {
      // Nested object
      if (actualValue && typeof actualValue === 'object' && !Array.isArray(actualValue)) {
        diffs.push(...deepDiff(
          expectedValue as Record<string, unknown>,
          actualValue as Record<string, unknown>,
          path,
          tolerances,
        ));
      } else {
        const diff = classifyDiff(path, expectedValue, actualValue, tolerances);
        if (diff) diffs.push(diff);
      }
    } else {
      const diff = classifyDiff(path, expectedValue, actualValue, tolerances);
      if (diff) diffs.push(diff);
    }
  }
  
  // Actual'da olup expected'da olmayan alanları kontrol et
  for (const key of Object.keys(actual)) {
    const path = basePath ? `${basePath}.${key}` : key;
    if (!(key in expected)) {
      const diff = classifyDiff(path, undefined, actual[key], tolerances);
      if (diff) diffs.push(diff);
    }
  }
  
  return diffs;
}

/**
 * Scenario assertion'larını kontrol et
 */
function checkAssertions(
  actual: CalcPreviewResponse,
  scenario: GoldenScenario,
): AssertionFailure[] {
  const failures: AssertionFailure[] = [];
  
  // Status check
  const actualStatus = actual.result?.status || (actual.success ? 'OK' : 'UNAVAILABLE');
  if (scenario.expect.status !== actualStatus) {
    // Map CalcPreviewResponse status to trace status
    const mappedStatus = actual.status === 'FULL' ? 'OK' : 
                         actual.status === 'PARTIAL' ? 'DEGRADED' : 'UNAVAILABLE';
    if (scenario.expect.status !== mappedStatus) {
      failures.push({
        type: 'must',
        path: 'status',
        expected: scenario.expect.status,
        actual: mappedStatus,
        message: `Expected status ${scenario.expect.status}, got ${mappedStatus}`,
      });
    }
  }
  
  // Must assertions
  for (const [path, expectedValues] of Object.entries(scenario.expect.must)) {
    const actualValue = getNestedValue(actual, path);
    
    if (Array.isArray(expectedValues)) {
      // Value must be one of the expected values
      if (!expectedValues.includes(actualValue)) {
        failures.push({
          type: 'must',
          path,
          expected: expectedValues,
          actual: actualValue,
          message: `${path} must be one of ${JSON.stringify(expectedValues)}, got ${JSON.stringify(actualValue)}`,
        });
      }
    } else if (expectedValues === 'number') {
      // Value must be a number
      if (typeof actualValue !== 'number') {
        failures.push({
          type: 'must',
          path,
          expected: 'number',
          actual: typeof actualValue,
          message: `${path} must be a number, got ${typeof actualValue}`,
        });
      }
    } else if (expectedValues === 'string') {
      // Value must be a string
      if (typeof actualValue !== 'string') {
        failures.push({
          type: 'must',
          path,
          expected: 'string',
          actual: typeof actualValue,
          message: `${path} must be a string, got ${typeof actualValue}`,
        });
      }
    } else {
      // Exact match
      if (actualValue !== expectedValues) {
        failures.push({
          type: 'must',
          path,
          expected: expectedValues,
          actual: actualValue,
          message: `${path} must be ${JSON.stringify(expectedValues)}, got ${JSON.stringify(actualValue)}`,
        });
      }
    }
  }
  
  // Forbid assertions
  for (const [path, forbiddenValues] of Object.entries(scenario.expect.forbid)) {
    const actualValue = getNestedValue(actual, path);
    
    if (Array.isArray(forbiddenValues) && forbiddenValues.includes(actualValue)) {
      failures.push({
        type: 'forbid',
        path,
        expected: `not ${JSON.stringify(forbiddenValues)}`,
        actual: actualValue,
        message: `${path} must not be ${JSON.stringify(actualValue)}`,
      });
    }
  }
  
  return failures;
}

/**
 * Nested path'ten değer al
 */
function getNestedValue(obj: unknown, path: string): unknown {
  const parts = path.split('.');
  let current: unknown = obj;
  
  for (const part of parts) {
    if (current === null || current === undefined) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }
  
  return current;
}
