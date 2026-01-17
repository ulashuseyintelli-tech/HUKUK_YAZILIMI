/**
 * Phase 5.2 - Diff Classifier
 * 
 * Farkları severity ve category'ye göre sınıflandırır
 */

import { DiffSeverity, DiffCategory, ComparisonDiff, RoundingTolerance } from '../regression.types';

// ============================================================================
// DEFAULT TOLERANCES
// ============================================================================

export const DEFAULT_TOLERANCES: RoundingTolerance = {
  moneyAbsolute: 0.01,      // 1 kuruş
  moneyRelative: 0.000001,  // 0.0001%
  percentAbsolute: 0.01,    // 0.01%
};

// ============================================================================
// POLICY FIELDS - Otomatik CRITICAL
// ============================================================================

const POLICY_FIELDS = [
  'policy.softCheck.outcome',
  'policy.softWarnings',
  'result.status',
  'uxGuidance.blocking',
  'uxGuidance.recommendedAction',
];

// ============================================================================
// MONEY FIELDS
// ============================================================================

const MONEY_FIELDS = [
  'estimatedInterest',
  'estimatedFees',
  'estimatedAttorneyFee',
  'interest',
  'fees',
  'total',
  'principalAmount',
  'preEnforcementInterest',
  'postEnforcementInterest',
];

// ============================================================================
// CLASSIFIER
// ============================================================================

/**
 * İki değer arasındaki farkı sınıflandır
 */
export function classifyDiff(
  path: string,
  expected: unknown,
  actual: unknown,
  tolerances: RoundingTolerance = DEFAULT_TOLERANCES,
): ComparisonDiff | null {
  // Aynı değer - fark yok
  if (deepEqual(expected, actual)) {
    return null;
  }
  
  // Policy alanları - otomatik CRITICAL
  if (isPolicyField(path)) {
    return {
      path,
      expected,
      actual,
      severity: 'CRITICAL',
      category: 'POLICY',
      message: `Policy field changed: ${path}`,
    };
  }
  
  // Parasal alanlar - tolerans kontrolü
  if (isMoneyField(path) && typeof expected === 'number' && typeof actual === 'number') {
    return classifyMoneyDiff(path, expected, actual, tolerances);
  }
  
  // Yüzde alanları
  if (isPercentField(path) && typeof expected === 'number' && typeof actual === 'number') {
    return classifyPercentDiff(path, expected, actual, tolerances);
  }
  
  // Array ordering farkı
  if (Array.isArray(expected) && Array.isArray(actual)) {
    return classifyArrayDiff(path, expected, actual);
  }
  
  // String format farkı
  if (typeof expected === 'string' && typeof actual === 'string') {
    return classifyStringDiff(path, expected, actual);
  }
  
  // Missing field
  if (expected !== undefined && actual === undefined) {
    return {
      path,
      expected,
      actual,
      severity: 'MINOR',
      category: 'MISSING',
      message: `Field missing: ${path}`,
    };
  }
  
  // Extra field
  if (expected === undefined && actual !== undefined) {
    return {
      path,
      expected,
      actual,
      severity: 'NOISE',
      category: 'FORMAT',
      message: `Extra field: ${path}`,
    };
  }
  
  // Type mismatch
  if (typeof expected !== typeof actual) {
    return {
      path,
      expected,
      actual,
      severity: 'MAJOR',
      category: 'VALUE',
      message: `Type mismatch: expected ${typeof expected}, got ${typeof actual}`,
    };
  }
  
  // Default: VALUE diff
  return {
    path,
    expected,
    actual,
    severity: 'MAJOR',
    category: 'VALUE',
    message: `Value changed: ${path}`,
  };
}

/**
 * Parasal fark sınıflandırması
 */
function classifyMoneyDiff(
  path: string,
  expected: number,
  actual: number,
  tolerances: RoundingTolerance,
): ComparisonDiff | null {
  const absDiff = Math.abs(expected - actual);
  const relDiff = expected !== 0 ? absDiff / Math.abs(expected) : absDiff;
  
  // Tolerans içinde - NOISE
  if (absDiff <= tolerances.moneyAbsolute) {
    return {
      path,
      expected,
      actual,
      severity: 'NOISE',
      category: 'ROUNDING',
      message: `Rounding difference: ${absDiff.toFixed(4)} (within tolerance)`,
    };
  }
  
  // < 0.1% - MINOR
  if (relDiff < 0.001) {
    return {
      path,
      expected,
      actual,
      severity: 'MINOR',
      category: 'VALUE',
      message: `Small difference: ${(relDiff * 100).toFixed(4)}%`,
    };
  }
  
  // 0.1% - 1% - MAJOR
  if (relDiff < 0.01) {
    return {
      path,
      expected,
      actual,
      severity: 'MAJOR',
      category: 'VALUE',
      message: `Significant difference: ${(relDiff * 100).toFixed(2)}%`,
    };
  }
  
  // > 1% - CRITICAL
  return {
    path,
    expected,
      actual,
    severity: 'CRITICAL',
    category: 'VALUE',
    message: `Large difference: ${(relDiff * 100).toFixed(2)}%`,
  };
}

/**
 * Yüzde fark sınıflandırması
 */
function classifyPercentDiff(
  path: string,
  expected: number,
  actual: number,
  tolerances: RoundingTolerance,
): ComparisonDiff | null {
  const absDiff = Math.abs(expected - actual);
  
  if (absDiff <= tolerances.percentAbsolute) {
    return {
      path,
      expected,
      actual,
      severity: 'NOISE',
      category: 'ROUNDING',
      message: `Percent rounding: ${absDiff.toFixed(4)}`,
    };
  }
  
  return {
    path,
    expected,
    actual,
    severity: 'MINOR',
    category: 'VALUE',
    message: `Percent difference: ${absDiff.toFixed(2)}`,
  };
}

/**
 * Array fark sınıflandırması
 */
function classifyArrayDiff(
  path: string,
  expected: unknown[],
  actual: unknown[],
): ComparisonDiff | null {
  // Aynı içerik, farklı sıra
  const expectedSorted = [...expected].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  const actualSorted = [...actual].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  
  if (deepEqual(expectedSorted, actualSorted)) {
    return {
      path,
      expected,
      actual,
      severity: 'NOISE',
      category: 'ORDERING',
      message: 'Array ordering difference',
    };
  }
  
  // Farklı içerik
  return {
    path,
    expected,
    actual,
    severity: 'MINOR',
    category: 'VALUE',
    message: `Array content difference: expected ${expected.length} items, got ${actual.length}`,
  };
}

/**
 * String fark sınıflandırması
 */
function classifyStringDiff(
  path: string,
  expected: string,
  actual: string,
): ComparisonDiff | null {
  // Case/trim farkı
  if (expected.toLowerCase().trim() === actual.toLowerCase().trim()) {
    return {
      path,
      expected,
      actual,
      severity: 'NOISE',
      category: 'FORMAT',
      message: 'Case/whitespace difference',
    };
  }
  
  return {
    path,
    expected,
    actual,
    severity: 'MINOR',
    category: 'VALUE',
    message: 'String value difference',
  };
}

// ============================================================================
// HELPERS
// ============================================================================

function isPolicyField(path: string): boolean {
  return POLICY_FIELDS.some(f => path.startsWith(f) || path.includes(f));
}

function isMoneyField(path: string): boolean {
  const fieldName = path.split('.').pop() || '';
  return MONEY_FIELDS.includes(fieldName);
}

function isPercentField(path: string): boolean {
  const fieldName = path.split('.').pop() || '';
  return fieldName.includes('Rate') || fieldName.includes('Percent') || fieldName.includes('percent');
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null) return a === b;
  
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((item, i) => deepEqual(item, b[i]));
  }
  
  if (typeof a === 'object' && typeof b === 'object') {
    const aKeys = Object.keys(a as object);
    const bKeys = Object.keys(b as object);
    if (aKeys.length !== bKeys.length) return false;
    return aKeys.every(key => 
      deepEqual((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key])
    );
  }
  
  return false;
}

/**
 * En yüksek severity'yi bul
 */
export function getMaxSeverity(diffs: ComparisonDiff[]): DiffSeverity {
  const severityOrder: DiffSeverity[] = ['NOISE', 'MINOR', 'MAJOR', 'CRITICAL'];
  
  let maxIndex = 0;
  for (const diff of diffs) {
    const index = severityOrder.indexOf(diff.severity);
    if (index > maxIndex) {
      maxIndex = index;
    }
  }
  
  return severityOrder[maxIndex];
}
