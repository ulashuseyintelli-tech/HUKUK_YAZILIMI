/**
 * @deprecated Bu dosya deprecated. Lütfen şunları kullanın:
 * - InterestTypeCode → '../types/domain.types'
 * - RateSourceType → '../rates/rate-entry.entity'
 * - Diğer tipler → '../types/calculation.types' veya '../types/domain.types'
 */

import { Decimal } from '@prisma/client/runtime/library';
import { InterestTypeCode as DomainInterestTypeCode } from './types/domain.types';
import { RateSourceType as EntityRateSourceType } from './rates/rate-entry.entity';

// ============================================================================
// DEPRECATED - Eski enum'lar, yeni dosyalardan import edin
// ============================================================================

/** @deprecated Use InterestTypeCode from '../types/domain.types' */
export { InterestTypeCode } from './types/domain.types';

/** @deprecated Use RateSourceType from '../rates/rate-entry.entity' */
export { RateSourceType } from './rates/rate-entry.entity';

export type Currency = 'TRY' | 'USD' | 'EUR' | 'GBP' | 'CHF';

// ============================================================================
// RATE SCHEDULE INTERFACES
// ============================================================================

export interface RateEntry {
  id: string;
  interestType: DomainInterestTypeCode;
  validFrom: string; // ISO date
  validTo?: string | null; // ISO date, null = current
  annualRate: number; // Decimal, e.g., 0.3975 for 39.75%
  source: EntityRateSourceType;
  sourceReference?: string; // e.g., "TCMB 20.12.2025"
  versionHash: string;
  createdAt: string;
  createdBy?: string;
}

export interface RateQueryResult {
  rates: RateEntry[];
  hasGaps: boolean;
  gaps?: { from: string; to: string }[];
}

// ============================================================================
// CALCULATION INTERFACES
// ============================================================================

export interface PrincipalItem {
  id: string;
  amount: number;
  currency: Currency;
  startDate: string; // Interest start date
  interestType: DomainInterestTypeCode;
  dayCountBasis?: 365 | 360; // Default: 365
  compounding?: boolean; // Default: false (simple interest)
  description?: string;
  // For çek cases
  ibrazTarihi?: string;
  vadeTarihi?: string;
  // For fixed rate (COMMERCIAL_FIXED, CONTRACTUAL)
  fixedRate?: number; // e.g., 0.48 for %48
}

export interface Payment {
  id: string;
  date: string;
  amount: number;
  currency: Currency;
  source?: string; // e.g., "Banka havalesi", "Haciz"
}

export interface CalculationOptions {
  includeKarsilisizCekTazminati?: boolean; // Default: true for çek
}

export interface InterestCalculationRequest {
  caseId: string;
  principalItems: PrincipalItem[];
  payments?: Payment[];
  asOfDate: string; // ISO date
  options?: CalculationOptions;
  /** Takip tarihi - takip öncesi/sonrası ayrımı için */
  enforcementDate?: string;
}

export interface InterestSegment {
  principalItemId: string;
  periodStart: string;
  periodEnd: string;
  days: number;
  rate: number;
  rateId: string;
  rateSource: string;
  principal: number;
  segmentInterest: number;
  /** Segment türü: takip öncesi mi sonrası mı */
  phase?: 'PRE_ENFORCEMENT' | 'POST_ENFORCEMENT';
}

export interface InterestCalculationResult {
  caseId: string;
  calculatedAt: string;
  asOfDate: string;
  segments: InterestSegment[];
  totalInterest: number;
  totalDue: number;
  paymentAllocations?: PaymentAllocationResult[];
  policyWarnings: PolicyWarning[];
  auditLogId: string;
  legalText: string;
  /** Takip öncesi faiz (vade/ibraz → takip tarihi) */
  preEnforcementInterest?: number;
  /** Takip sonrası faiz (takip tarihi → hesap tarihi) */
  postEnforcementInterest?: number;
  /** Takip tarihi (caseDate) */
  enforcementDate?: string;
}

// ============================================================================
// PAYMENT ALLOCATION INTERFACES (TBK 100)
// ============================================================================

export interface AllocationCategory {
  category: 'INTEREST' | 'COSTS' | 'ANCILLARY' | 'PRINCIPAL';
  label: string;
  amountBefore: number;
  amountAllocated: number;
  amountAfter: number;
}

export interface PaymentAllocationResult {
  paymentId: string;
  paymentDate: string;
  paymentAmount: number;
  allocations: AllocationCategory[];
  remainingPayment: number;
  newPrincipal: number;
}

export interface DebtState {
  principal: number;
  accruedInterest: number;
  costs: number; // Harç, tebligat, etc.
  ancillaries: number; // Komisyon, tazminat, etc.
}

// ============================================================================
// POLICY GATE INTERFACES
// ============================================================================

export interface PolicyWarning {
  code: string;
  severity: 'ERROR' | 'WARNING' | 'INFO';
  message: string;
  suggestion?: string;
  field?: string;
}

export interface PolicyValidationResult {
  valid: boolean;
  warnings: PolicyWarning[];
  canProceed: boolean; // true if only warnings, false if errors
}

// ============================================================================
// AUDIT LOG INTERFACES
// ============================================================================

export interface InterestAuditLog {
  id: string;
  caseId: string;
  tenantId: string;
  calculatedAt: string;
  asOfDate: string;
  request: InterestCalculationRequest;
  result: InterestCalculationResult;
  segments: InterestSegment[];
  rateVersionHashes: string[];
  createdBy?: string;
}

// ============================================================================
// ERROR CODES
// ============================================================================

export const InterestEngineErrorCodes = {
  RATE_GAP: 'RATE_GAP',
  INTEREST_TYPE_MISMATCH: 'INTEREST_TYPE_MISMATCH',
  NEGATIVE_DAYS: 'NEGATIVE_DAYS',
  ZERO_DAYS: 'ZERO_DAYS',
  LONG_SEGMENT: 'LONG_SEGMENT',
  INTEREST_ANOMALY: 'INTEREST_ANOMALY',
  IBRAZ_BEFORE_VADE: 'IBRAZ_BEFORE_VADE',
  CONTRACTUAL_NO_EVIDENCE: 'CONTRACTUAL_NO_EVIDENCE',
} as const;
