/**
 * SDK Enums and Constants
 * 
 * Single source of truth for known values.
 * Matches backend contract exactly.
 */

// ============================================================================
// POLICY
// ============================================================================

export type PolicyOutcome = 'PASS' | 'WARN' | 'BLOCK';

export const POLICY_OUTCOMES = ['PASS', 'WARN', 'BLOCK'] as const;

// ============================================================================
// EXPLANATION
// ============================================================================

export type ExplanationSeverity = 'INFO' | 'WARNING' | 'ERROR';

export const EXPLANATION_SEVERITIES = ['INFO', 'WARNING', 'ERROR'] as const;

// ============================================================================
// TRACE
// ============================================================================

export type TraceResultStatus = 'OK' | 'DEGRADED' | 'UNAVAILABLE';

export const TRACE_RESULT_STATUSES = ['OK', 'DEGRADED', 'UNAVAILABLE'] as const;

// ============================================================================
// PREVIEW
// ============================================================================

export type PreviewStatus = 'FULL' | 'PARTIAL' | 'UNAVAILABLE';

export const PREVIEW_STATUSES = ['FULL', 'PARTIAL', 'UNAVAILABLE'] as const;

// ============================================================================
// INTEREST TYPE
// ============================================================================

export type InterestTypeCode = 
  | 'LEGAL'
  | 'DEFAULT'
  | 'COMMERCIAL'
  | 'FIXED'
  | 'TCMB_AVANS'
  | 'TCMB_REESKONT'
  | 'TCMB_GECIKME';

export const INTEREST_TYPE_CODES = [
  'LEGAL',
  'DEFAULT',
  'COMMERCIAL',
  'FIXED',
  'TCMB_AVANS',
  'TCMB_REESKONT',
  'TCMB_GECIKME',
] as const;

// ============================================================================
// CURRENCY
// ============================================================================

export type CurrencyCode = 'TRY' | 'USD' | 'EUR' | 'GBP';

export const CURRENCY_CODES = ['TRY', 'USD', 'EUR', 'GBP'] as const;

// ============================================================================
// UX GUIDANCE
// ============================================================================

export type RecommendedAction = 
  | 'PROCEED'
  | 'RETRY'
  | 'CHECK_INPUT'
  | 'CONTACT_SUPPORT'
  | 'WAIT';

export const RECOMMENDED_ACTIONS = [
  'PROCEED',
  'RETRY',
  'CHECK_INPUT',
  'CONTACT_SUPPORT',
  'WAIT',
] as const;
