/**
 * Phase 5.6 - Policy Engine Semantic Contract (v1)
 * 
 * Domain invariants:
 * 1. outcome enum: PASS/WARN/BLOCK
 * 2. BLOCK ise reasons.length > 0 zorunlu
 * 3. reasons code whitelist (veya prefix-based namespace)
 * 4. severity mapping stabil
 * 5. policyVersion boş olamaz
 * 
 * Phase 6A: Explanation invariants
 * 6. BLOCK ise explanations.length > 0 zorunlu
 * 7. PASS ise explanations.length === 0
 * 8. Explanations severity order: ERROR > WARNING > INFO
 * 
 * @see contracts/README.md
 */

import { PolicySoftCheckResult, PolicyReason, PolicyPreviewResponse, PolicyExplanation } from './schema';

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
// KNOWN REASON CODES (whitelist)
// ============================================================================

/**
 * Known reason code prefixes
 * New codes should follow these namespaces
 */
export const KNOWN_REASON_CODE_PREFIXES = [
  'GATE_',           // Gate-related
  'POLICY_',         // Policy-related
  'VALIDATION_',     // Validation-related
  'LIMIT_',          // Limit-related
  'MISSING_',        // Missing data
  'INVALID_',        // Invalid data
  'EXPIRED_',        // Expiration-related
  'BLOCKED_',        // Block-related
  'WARNING_',        // Warning-related
  'INFO_',           // Info-related
];

/**
 * Known specific reason codes
 */
export const KNOWN_REASON_CODES = new Set([
  // Gate codes
  'GATE_CASE_CLOSED',
  'GATE_CASE_ARCHIVED',
  'GATE_UNPAID_EXPENSE',
  'GATE_NO_POWER_OF_ATTORNEY',
  'GATE_UYAP_DISABLED',
  
  // Policy codes
  'POLICY_HIGH_AMOUNT',
  'POLICY_MULTI_DEBTOR',
  'POLICY_FOREIGN_CURRENCY',
  
  // Validation codes
  'VALIDATION_MISSING_FIELD',
  'VALIDATION_INVALID_DATE',
  'VALIDATION_INVALID_AMOUNT',
  
  // Limit codes
  'LIMIT_EXCEEDED',
  'LIMIT_DAILY_EXCEEDED',
  
  // Info codes
  'INFO_FIRST_CALCULATION',
  'INFO_RATE_CHANGE',
]);

// ============================================================================
// POLICY REASON SEMANTIC RULES
// ============================================================================

/**
 * Rule 1: Reason code follows namespace convention
 */
export function validateReasonCodeNamespace(reason: PolicyReason): SemanticViolation | null {
  const code = reason.code;
  
  // Check if it's a known code
  if (KNOWN_REASON_CODES.has(code)) {
    return null;
  }
  
  // Check if it follows a known prefix
  const hasKnownPrefix = KNOWN_REASON_CODE_PREFIXES.some(prefix => code.startsWith(prefix));
  
  if (!hasKnownPrefix) {
    return {
      rule: 'UNKNOWN_REASON_CODE',
      message: `Reason code '${code}' doesn't follow known namespace convention`,
      severity: 'WARNING',
      context: { 
        code, 
        knownPrefixes: KNOWN_REASON_CODE_PREFIXES,
      },
    };
  }
  
  return null;
}

/**
 * Rule 2: Severity is appropriate for the code
 */
export function validateSeverityMapping(reason: PolicyReason): SemanticViolation | null {
  const code = reason.code;
  const severity = reason.severity;
  
  // GATE_ codes should be ERROR or CRITICAL
  if (code.startsWith('GATE_') && !['ERROR', 'CRITICAL'].includes(severity)) {
    return {
      rule: 'SEVERITY_MISMATCH',
      message: `Gate code '${code}' should have ERROR or CRITICAL severity, got '${severity}'`,
      severity: 'WARNING',
      context: { code, severity },
    };
  }
  
  // INFO_ codes should be INFO
  if (code.startsWith('INFO_') && severity !== 'INFO') {
    return {
      rule: 'SEVERITY_MISMATCH',
      message: `Info code '${code}' should have INFO severity, got '${severity}'`,
      severity: 'WARNING',
      context: { code, severity },
    };
  }
  
  return null;
}

/**
 * Validate single reason
 */
export function validatePolicyReason(reason: PolicyReason): SemanticValidationResult {
  const violations: SemanticViolation[] = [];
  
  const namespaceViolation = validateReasonCodeNamespace(reason);
  if (namespaceViolation) violations.push(namespaceViolation);
  
  const severityViolation = validateSeverityMapping(reason);
  if (severityViolation) violations.push(severityViolation);
  
  return {
    valid: violations.filter(v => v.severity === 'ERROR').length === 0,
    violations,
  };
}

// ============================================================================
// SOFT CHECK RESULT SEMANTIC RULES
// ============================================================================

/**
 * Rule 3: BLOCK requires reasons
 */
export function validateBlockHasReasons(result: PolicySoftCheckResult): SemanticViolation | null {
  if (result.outcome === 'BLOCK' && result.reasons.length === 0) {
    return {
      rule: 'BLOCK_WITHOUT_REASONS',
      message: 'Outcome is BLOCK but no reasons provided',
      severity: 'ERROR',
      context: { outcome: result.outcome, reasonsCount: result.reasons.length },
    };
  }
  return null;
}

/**
 * Rule 4: PASS should not have ERROR/CRITICAL reasons
 */
export function validatePassNoErrors(result: PolicySoftCheckResult): SemanticViolation | null {
  if (result.outcome === 'PASS') {
    const errorReasons = result.reasons.filter(r => 
      r.severity === 'ERROR' || r.severity === 'CRITICAL'
    );
    
    if (errorReasons.length > 0) {
      return {
        rule: 'PASS_WITH_ERRORS',
        message: 'Outcome is PASS but has ERROR/CRITICAL reasons',
        severity: 'ERROR',
        context: { 
          outcome: result.outcome, 
          errorReasons: errorReasons.map(r => r.code),
        },
      };
    }
  }
  return null;
}

/**
 * Rule 5: Policy version not empty
 */
export function validatePolicyVersionNotEmpty(result: PolicySoftCheckResult): SemanticViolation | null {
  if (!result.policyVersion || result.policyVersion.trim() === '') {
    return {
      rule: 'EMPTY_POLICY_VERSION',
      message: 'Policy version is empty',
      severity: 'ERROR',
      context: { policyVersion: result.policyVersion },
    };
  }
  return null;
}

/**
 * Rule 6: Gates checked should be non-empty for BLOCK
 */
export function validateGatesChecked(result: PolicySoftCheckResult): SemanticViolation | null {
  if (result.outcome === 'BLOCK' && result.gatesChecked.length === 0) {
    return {
      rule: 'BLOCK_NO_GATES_CHECKED',
      message: 'Outcome is BLOCK but no gates were checked',
      severity: 'WARNING',
      context: { outcome: result.outcome, gatesChecked: result.gatesChecked },
    };
  }
  return null;
}

/**
 * Validate soft check result
 */
export function validatePolicySoftCheckResult(result: PolicySoftCheckResult): SemanticValidationResult {
  const violations: SemanticViolation[] = [];
  
  // Validate each reason
  for (const reason of result.reasons) {
    const reasonResult = validatePolicyReason(reason);
    violations.push(...reasonResult.violations);
  }
  
  // Validate result-level rules
  const blockReasonsViolation = validateBlockHasReasons(result);
  if (blockReasonsViolation) violations.push(blockReasonsViolation);
  
  const passErrorsViolation = validatePassNoErrors(result);
  if (passErrorsViolation) violations.push(passErrorsViolation);
  
  const versionViolation = validatePolicyVersionNotEmpty(result);
  if (versionViolation) violations.push(versionViolation);
  
  const gatesViolation = validateGatesChecked(result);
  if (gatesViolation) violations.push(gatesViolation);
  
  return {
    valid: violations.filter(v => v.severity === 'ERROR').length === 0,
    violations,
  };
}

/**
 * Validate policy preview response
 */
export function validatePolicyPreviewResponse(response: PolicyPreviewResponse): SemanticValidationResult {
  return validatePolicySoftCheckResult(response.softCheck);
}

// ============================================================================
// EXPLANATION SEMANTIC RULES (Phase 6A)
// ============================================================================

/**
 * Rule 6: BLOCK requires explanations (Core Invariant)
 * BLOCK → explanations.length > 0
 */
export function validateBlockHasExplanations(
  outcome: 'PASS' | 'WARN' | 'BLOCK',
  explanations: PolicyExplanation[],
): SemanticViolation | null {
  if (outcome === 'BLOCK' && explanations.length === 0) {
    return {
      rule: 'BLOCK_WITHOUT_EXPLANATIONS',
      message: 'Outcome is BLOCK but no explanations provided - invariant violation',
      severity: 'ERROR',
      context: { outcome, explanationsCount: explanations.length },
    };
  }
  return null;
}

/**
 * Rule 7: PASS should have empty explanations
 */
export function validatePassEmptyExplanations(
  outcome: 'PASS' | 'WARN' | 'BLOCK',
  explanations: PolicyExplanation[],
): SemanticViolation | null {
  if (outcome === 'PASS' && explanations.length > 0) {
    return {
      rule: 'PASS_WITH_EXPLANATIONS',
      message: 'Outcome is PASS but has explanations - should be empty',
      severity: 'WARNING',
      context: { 
        outcome, 
        explanationsCount: explanations.length,
        codes: explanations.map(e => e.reasonCode),
      },
    };
  }
  return null;
}

/**
 * Rule 8: Explanations should be ordered by severity
 * ERROR first, then WARNING, then INFO
 */
export function validateExplanationsSeverityOrder(
  explanations: PolicyExplanation[],
): SemanticViolation | null {
  if (explanations.length < 2) return null;
  
  const severityOrder: Record<string, number> = { ERROR: 0, WARNING: 1, INFO: 2 };
  
  for (let i = 1; i < explanations.length; i++) {
    const prevSeverity = severityOrder[explanations[i - 1].severity];
    const currSeverity = severityOrder[explanations[i].severity];
    
    if (currSeverity < prevSeverity) {
      return {
        rule: 'EXPLANATIONS_WRONG_ORDER',
        message: 'Explanations are not ordered by severity (ERROR > WARNING > INFO)',
        severity: 'WARNING',
        context: {
          index: i,
          prevSeverity: explanations[i - 1].severity,
          currSeverity: explanations[i].severity,
        },
      };
    }
  }
  
  return null;
}

/**
 * Validate explanations for a policy result
 */
export function validatePolicyExplanations(
  outcome: 'PASS' | 'WARN' | 'BLOCK',
  explanations: PolicyExplanation[],
): SemanticValidationResult {
  const violations: SemanticViolation[] = [];
  
  const blockViolation = validateBlockHasExplanations(outcome, explanations);
  if (blockViolation) violations.push(blockViolation);
  
  const passViolation = validatePassEmptyExplanations(outcome, explanations);
  if (passViolation) violations.push(passViolation);
  
  const orderViolation = validateExplanationsSeverityOrder(explanations);
  if (orderViolation) violations.push(orderViolation);
  
  return {
    valid: violations.filter(v => v.severity === 'ERROR').length === 0,
    violations,
  };
}
