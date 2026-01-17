/**
 * Phase 5.6 - Tariff Provider Semantic Contract (v1)
 * 
 * Domain invariants:
 * 1. Fee components: negatif yok
 * 2. Toplam = bileşenlerin toplamı (toleransla)
 * 3. Currency: allowed set
 * 4. Version: boş olamaz
 * 5. Attorney fee: dahilse breakdown'da görünmeli
 * 
 * @see contracts/README.md
 */

import { FeeItem, FeeCalculationResult, FeePreviewResponse } from './schema';

// ============================================================================
// SEMANTIC VALIDATION RESULT
// ============================================================================

export interface SemanticViolation {
  rule: string;
  message: string;
  severity: 'ERROR' | 'WARNING';
  context?: Record<string, unknown>;
}

export interface SemanticValidationResult {
  valid: boolean;
  violations: SemanticViolation[];
}

// ============================================================================
// FEE ITEM SEMANTIC RULES
// ============================================================================

/**
 * Rule 1: Amount non-negative
 */
export function validateAmountNonNegative(item: FeeItem): SemanticViolation | null {
  if (item.amount < 0) {
    return {
      rule: 'NEGATIVE_AMOUNT',
      message: `Fee amount (${item.amount}) cannot be negative`,
      severity: 'ERROR',
      context: { label: item.label, amount: item.amount },
    };
  }
  return null;
}

/**
 * Rule 2: Amount is finite
 */
export function validateAmountFinite(item: FeeItem): SemanticViolation | null {
  if (!Number.isFinite(item.amount)) {
    return {
      rule: 'INVALID_AMOUNT',
      message: `Fee amount is not a finite number`,
      severity: 'ERROR',
      context: { label: item.label, amount: item.amount },
    };
  }
  return null;
}

/**
 * Validate single fee item
 */
export function validateFeeItem(item: FeeItem): SemanticValidationResult {
  const violations: SemanticViolation[] = [];
  
  const negativeViolation = validateAmountNonNegative(item);
  if (negativeViolation) violations.push(negativeViolation);
  
  const finiteViolation = validateAmountFinite(item);
  if (finiteViolation) violations.push(finiteViolation);
  
  return {
    valid: violations.filter(v => v.severity === 'ERROR').length === 0,
    violations,
  };
}

// ============================================================================
// FEE CALCULATION RESULT SEMANTIC RULES
// ============================================================================

/**
 * Rule 3: Total equals sum of items (with tolerance)
 */
export function validateTotalConsistency(result: FeeCalculationResult): SemanticViolation | null {
  const sum = result.items.reduce((acc, item) => acc + item.amount, 0);
  const tolerance = 0.01; // 1 kuruş tolerance
  
  if (Math.abs(result.totalAmount - sum) > tolerance) {
    return {
      rule: 'TOTAL_MISMATCH',
      message: `Total (${result.totalAmount}) doesn't match sum of items (${sum})`,
      severity: 'ERROR',
      context: { 
        reportedTotal: result.totalAmount, 
        calculatedSum: sum,
        difference: Math.abs(result.totalAmount - sum),
      },
    };
  }
  return null;
}

/**
 * Rule 4: Tariff year is reasonable
 */
export function validateTariffYear(result: FeeCalculationResult): SemanticViolation | null {
  const currentYear = new Date().getFullYear();
  
  if (result.tariffYear > currentYear + 1) {
    return {
      rule: 'FUTURE_TARIFF',
      message: `Tariff year (${result.tariffYear}) is too far in the future`,
      severity: 'WARNING',
      context: { tariffYear: result.tariffYear, currentYear },
    };
  }
  
  if (result.tariffYear < 2000) {
    return {
      rule: 'ANCIENT_TARIFF',
      message: `Tariff year (${result.tariffYear}) is too old`,
      severity: 'ERROR',
      context: { tariffYear: result.tariffYear },
    };
  }
  
  return null;
}

/**
 * Rule 5: All items have consistent currency
 */
export function validateCurrencyConsistency(result: FeeCalculationResult): SemanticViolation[] {
  const violations: SemanticViolation[] = [];
  const currencies = new Set(result.items.map(i => i.currency));
  
  if (currencies.size > 1) {
    violations.push({
      rule: 'MIXED_CURRENCIES',
      message: `Multiple currencies in fee items: ${Array.from(currencies).join(', ')}`,
      severity: 'WARNING',
      context: { currencies: Array.from(currencies) },
    });
  }
  
  return violations;
}

/**
 * Validate fee calculation result
 */
export function validateFeeCalculationResult(result: FeeCalculationResult): SemanticValidationResult {
  const violations: SemanticViolation[] = [];
  
  // Validate each item
  for (const item of result.items) {
    const itemResult = validateFeeItem(item);
    violations.push(...itemResult.violations);
  }
  
  // Validate total
  const totalViolation = validateTotalConsistency(result);
  if (totalViolation) violations.push(totalViolation);
  
  // Validate tariff year
  const yearViolation = validateTariffYear(result);
  if (yearViolation) violations.push(yearViolation);
  
  // Validate currency consistency
  violations.push(...validateCurrencyConsistency(result));
  
  return {
    valid: violations.filter(v => v.severity === 'ERROR').length === 0,
    violations,
  };
}

// ============================================================================
// FEE PREVIEW RESPONSE SEMANTIC RULES
// ============================================================================

/**
 * Rule 6: Attorney fee consistency
 */
export function validateAttorneyFeeConsistency(response: FeePreviewResponse): SemanticViolation | null {
  if (response.estimatedAttorneyFee > 0 && response.breakdown) {
    const hasAttorneyInBreakdown = response.breakdown.some(
      item => item.label.toLowerCase().includes('vekalet') || 
              item.label.toLowerCase().includes('attorney') ||
              item.tariffCode?.includes('ATTORNEY')
    );
    
    if (!hasAttorneyInBreakdown) {
      return {
        rule: 'ATTORNEY_FEE_NOT_IN_BREAKDOWN',
        message: 'Attorney fee is non-zero but not visible in breakdown',
        severity: 'WARNING',
        context: { 
          estimatedAttorneyFee: response.estimatedAttorneyFee,
          breakdownLabels: response.breakdown.map(i => i.label),
        },
      };
    }
  }
  
  return null;
}

/**
 * Rule 7: Fees vs Attorney fee ratio
 */
export function validateFeeRatio(response: FeePreviewResponse): SemanticViolation | null {
  if (response.estimatedFees > 0 && response.estimatedAttorneyFee > 0) {
    const ratio = response.estimatedAttorneyFee / response.estimatedFees;
    
    // Attorney fee shouldn't be more than 5x the other fees (unusual)
    if (ratio > 5) {
      return {
        rule: 'HIGH_ATTORNEY_FEE_RATIO',
        message: `Attorney fee ratio (${ratio.toFixed(2)}x) is unusually high`,
        severity: 'WARNING',
        context: { 
          estimatedFees: response.estimatedFees,
          estimatedAttorneyFee: response.estimatedAttorneyFee,
          ratio,
        },
      };
    }
  }
  
  return null;
}

/**
 * Rule 8: Version not empty
 */
export function validateVersionNotEmpty(response: FeePreviewResponse): SemanticViolation | null {
  if (!response.tariffVersion || response.tariffVersion.trim() === '') {
    return {
      rule: 'EMPTY_VERSION',
      message: 'Tariff version is empty',
      severity: 'ERROR',
      context: { tariffVersion: response.tariffVersion },
    };
  }
  return null;
}

/**
 * Validate fee preview response
 */
export function validateFeePreviewResponse(response: FeePreviewResponse): SemanticValidationResult {
  const violations: SemanticViolation[] = [];
  
  // Validate breakdown items if present
  if (response.breakdown) {
    for (const item of response.breakdown) {
      const itemResult = validateFeeItem(item);
      violations.push(...itemResult.violations);
    }
  }
  
  // Validate attorney fee consistency
  const attorneyViolation = validateAttorneyFeeConsistency(response);
  if (attorneyViolation) violations.push(attorneyViolation);
  
  // Validate fee ratio
  const ratioViolation = validateFeeRatio(response);
  if (ratioViolation) violations.push(ratioViolation);
  
  // Validate version
  const versionViolation = validateVersionNotEmpty(response);
  if (versionViolation) violations.push(versionViolation);
  
  return {
    valid: violations.filter(v => v.severity === 'ERROR').length === 0,
    violations,
  };
}
