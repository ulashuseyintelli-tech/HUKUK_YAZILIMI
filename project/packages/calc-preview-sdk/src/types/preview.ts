/**
 * Preview Types
 * 
 * Request/Response types for CalcPreview API.
 * Matches backend contract exactly.
 */

import type {
  InterestTypeCode,
  CurrencyCode,
  PreviewStatus,
  ExplanationSeverity,
  RecommendedAction,
} from './enums';

// ============================================================================
// REQUEST
// ============================================================================

/**
 * Preview request.
 * SDK adds idempotencyKey and signal.
 */
export interface PreviewRequest {
  readonly principalAmount: number;
  readonly currency?: CurrencyCode;
  readonly interestType: InterestTypeCode;
  readonly startDate: string;
  readonly endDate: string;
  readonly fixedRate?: number;
  readonly caseType?: string;
  readonly debtorCount?: number;
  readonly skipInterest?: boolean;
  readonly skipFee?: boolean;
  readonly skipPolicy?: boolean;
  
  /** Consumer-provided idempotency key (optional) */
  readonly idempotencyKey?: string;
  
  /** AbortSignal for cancellation (optional) */
  readonly signal?: AbortSignal;
}

// ============================================================================
// RESPONSE
// ============================================================================

/**
 * Preview response.
 * Includes _meta with traceId.
 */
export interface PreviewResponse {
  readonly success: boolean;
  readonly status: PreviewStatus;
  readonly interest?: InterestPreviewData;
  readonly fee?: FeePreviewData;
  readonly policy?: PolicyPreviewData;
  readonly versions: VersionInfo;
  readonly errors: readonly ResponseError[];
  readonly warnings: readonly ResponseWarning[];
  readonly uxGuidance: UxGuidance;
  readonly cached: boolean;
  readonly timestamp: string;
  readonly explanationsDegraded?: boolean;
  readonly _meta: ResponseMeta;
}

/**
 * Response metadata.
 * Contains traceId for audit.
 */
export interface ResponseMeta {
  readonly traceId: string;
  readonly requestHash: string;
  readonly serverVersion: string;
  readonly replay?: boolean;
  
  // Region-aware (Phase 6C)
  readonly regionId?: string;
  readonly tenantScope?: string;
}

// ============================================================================
// INTEREST DATA
// ============================================================================

export interface InterestPreviewData {
  readonly estimatedInterest: number;
  readonly currentRate: number;
  readonly days: number;
  readonly interestType: InterestTypeCode;
  readonly preEnforcementInterest?: number;
  readonly postEnforcementInterest?: number;
  readonly segments?: readonly InterestSegment[];
  readonly segmentsMeta?: SegmentsMeta;
  readonly coverage?: CoverageInfo;
}

export interface InterestSegment {
  readonly startDate: string;
  readonly endDate: string;
  readonly days: number;
  readonly annualRatePct: number;
  readonly principal: number;
  readonly interest: number;
  readonly phase?: 'PRE_ENFORCEMENT' | 'POST_ENFORCEMENT';
  readonly rateSource?: string;
}

export interface SegmentsMeta {
  readonly total: number;
  readonly returned: number;
  readonly truncated: boolean;
}

export interface CoverageInfo {
  readonly percent: number;
  readonly totalDays: number;
  readonly coveredDays: number;
  readonly hasGaps: boolean;
  readonly hasOverlaps: boolean;
}

// ============================================================================
// FEE DATA
// ============================================================================

export interface FeePreviewData {
  readonly estimatedFees: number;
  readonly estimatedAttorneyFee: number;
  readonly tariffYear: number;
  readonly breakdown: FeeBreakdown;
}

export interface FeeBreakdown {
  readonly basvurmaHarci: number;
  readonly vekaletHarci: number;
  readonly pesinHarc: number;
  readonly dosyaGideri: number;
  readonly tebligatGideri: number;
  readonly vekaletPulu: number;
}

// ============================================================================
// POLICY DATA
// ============================================================================

export interface PolicyPreviewData {
  readonly passedGates: readonly string[];
  readonly softWarnings: readonly PolicySoftWarning[];
  readonly policyVersion: string;
  readonly explanations: readonly PolicyExplanation[];
}

export interface PolicySoftWarning {
  readonly gateCode: string;
  readonly message: string;
  readonly severity: 'info' | 'warning';
  readonly suggestion?: string;
}

export interface PolicyExplanation {
  readonly reasonCode: string;
  readonly message: string;
  readonly severity: ExplanationSeverity;
  readonly suggestedAction: string;
  readonly sourceRule?: string;
}

// ============================================================================
// VERSION INFO
// ============================================================================

export interface VersionInfo {
  readonly engineVersion: string;
  readonly ruleVersion: string;
  readonly rateTableVersion?: string;
  readonly tariffVersion?: string;
  readonly tariffYear?: number;
  readonly policyVersion?: string;
}

// ============================================================================
// ERRORS & WARNINGS
// ============================================================================

export interface ResponseError {
  readonly domain: 'interest' | 'fee' | 'validation' | 'policy';
  readonly code: string;
  readonly message: string;
}

export interface ResponseWarning {
  readonly domain: 'interest' | 'fee' | 'coordinator' | 'policy';
  readonly code: string;
  readonly message: string;
  readonly severity: 'warning' | 'info';
}

// ============================================================================
// UX GUIDANCE
// ============================================================================

export interface UxGuidance {
  readonly blocking: boolean;
  readonly recommendedAction: RecommendedAction;
  readonly retryAfterMs?: number;
  readonly userMessage?: string;
}
