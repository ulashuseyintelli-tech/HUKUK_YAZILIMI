/**
 * Task 1.3 - CalculationRequest ve CalculationResult Kontratları
 * 
 * Kurallar:
 * - Input hash üretimi deterministik (sıralama, normalize)
 * - Tüm parametreler açık
 */

import { z } from 'zod';
import { createHash } from 'crypto';
import {
  Currency,
  CalculationMode,
  RoundingMode,
  RoundingScope,
  SameDayPaymentRule,
  DayCountBasis,
} from './common.types';
import {
  ClaimBucketSchema,
  PaymentSchema,
  SegmentSchema,
  AllocationStepSchema,
  ClaimBucket,
  Payment,
  Segment,
  AllocationStep,
  AncillaryType,
} from './domain.types';
import { CaseType } from '../strategy/case-type-strategy.interface';

// ═══════════════════════════════════════════════════════════════════════════
// GAP POLICY
// ═══════════════════════════════════════════════════════════════════════════

export enum GapPolicy {
  BLOCK = 'BLOCK',
  WARN_AND_BLOCK_FOR_HIGH_RISK = 'WARN_AND_BLOCK_FOR_HIGH_RISK',
  WARN_ONLY_FOR_PREVIEW = 'WARN_ONLY_FOR_PREVIEW',
}

// ═══════════════════════════════════════════════════════════════════════════
// CLAIM PRIORITY RULE
// ═══════════════════════════════════════════════════════════════════════════

export enum ClaimPriorityRule {
  OLDEST_DUE_FIRST = 'OLDEST_DUE_FIRST',
  HIGHEST_RATE_FIRST = 'HIGHEST_RATE_FIRST',
  CUSTOM = 'CUSTOM',
}

// ═══════════════════════════════════════════════════════════════════════════
// FX RATE SOURCE
// ═══════════════════════════════════════════════════════════════════════════

export enum FxRateSource {
  TCMB_SATIS = 'TCMB_SATIS',
  TCMB_ALIS = 'TCMB_ALIS',
  TCMB_EFEKTIF_SATIS = 'TCMB_EFEKTIF_SATIS',
}

export enum ConversionDateRule {
  PAYMENT_DATE = 'PAYMENT_DATE',
  CALCULATION_DATE = 'CALCULATION_DATE',
  ENFORCEMENT_DATE = 'ENFORCEMENT_DATE',
}


// ═══════════════════════════════════════════════════════════════════════════
// CALCULATION OPTIONS SCHEMA
// ═══════════════════════════════════════════════════════════════════════════

const isoDateRegex = /^\d{4}-\d{2}-\d{2}$/;

export const CalculationOptionsSchema = z.object({
  // Day Count
  dayCountBasis: z.union([z.literal(365), z.literal(360)]).default(365),
  sameDayPaymentRule: z.nativeEnum(SameDayPaymentRule).default(SameDayPaymentRule.START_OF_DAY),
  
  // Rounding
  roundingMode: z.nativeEnum(RoundingMode).default(RoundingMode.HALF_UP),
  roundingScope: z.nativeEnum(RoundingScope).default(RoundingScope.PER_SEGMENT),
  
  // Policy
  gapPolicy: z.nativeEnum(GapPolicy).default(GapPolicy.BLOCK),
  
  // Allocation
  claimPriorityRule: z.nativeEnum(ClaimPriorityRule).default(ClaimPriorityRule.OLDEST_DUE_FIRST),
  ancillaryPriority: z.array(z.nativeEnum(AncillaryType)).optional(),
  
  // FX
  fxRateSource: z.nativeEnum(FxRateSource).optional(),
  conversionDateRule: z.nativeEnum(ConversionDateRule).optional(),
  interestCurrency: z.enum(['SAME_AS_PRINCIPAL', 'TRY']).optional(),
  
  // Special
  includeKarsilisizCekTazminati: z.boolean().optional(),
});

export type CalculationOptions = z.infer<typeof CalculationOptionsSchema>;

// ═══════════════════════════════════════════════════════════════════════════
// CALCULATION REQUEST SCHEMA
// ═══════════════════════════════════════════════════════════════════════════

export const CalculationRequestSchema = z.object({
  caseId: z.string().min(1),
  claimBuckets: z.array(ClaimBucketSchema).min(1),
  payments: z.array(PaymentSchema).optional(),
  asOfDate: z.string().regex(isoDateRegex),
  enforcementDate: z.string().regex(isoDateRegex).optional(),
  mode: z.nativeEnum(CalculationMode),
  options: CalculationOptionsSchema,
  // Strategy selection fields
  caseType: z.nativeEnum(CaseType).optional(),
  isCommercial: z.boolean().optional(),
});

export type CalculationRequest = z.infer<typeof CalculationRequestSchema>;

// ═══════════════════════════════════════════════════════════════════════════
// INTERPRETATION PROFILE (D-A PR-3)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Faiz yorum profili. Şu an TEK profil (multi-profil registry = Sprint 3 işi).
 * computeBalance() imzasında ZORUNLU; calculate() bunu türetir — request/API'den GELMEZ
 * (Hard Rule #13: frontend hukuki yorum seçmez). Profil inputHash + audit'e pinlenir.
 * SEAM: registry/strategy getter geldiğinde değer bu sabitten değil strateji katmanından türetilecek.
 */
export const DEFAULT_INTERPRETATION_PROFILE_ID = 'DEFAULT_TBK100_V1';

// ═══════════════════════════════════════════════════════════════════════════
// POLICY WARNING
// ═══════════════════════════════════════════════════════════════════════════

export const PolicyWarningSchema = z.object({
  code: z.string(),
  severity: z.enum(['ERROR', 'WARNING', 'INFO']),
  message: z.string(),
  suggestion: z.string().optional(),
  field: z.string().optional(),
  evidence: z.record(z.unknown()).optional(),
});

export type PolicyWarning = z.infer<typeof PolicyWarningSchema>;

// ═══════════════════════════════════════════════════════════════════════════
// VERSION PINNING
// ═══════════════════════════════════════════════════════════════════════════

export const VersionPinningSchema = z.object({
  rateTableVersion: z.string(),
  engineVersion: z.string(),
  ruleVersion: z.string(),
  autoPinned: z.boolean().default(false),
  pinnedAt: z.string(),
});

export type VersionPinning = z.infer<typeof VersionPinningSchema>;


// ═══════════════════════════════════════════════════════════════════════════
// CALCULATION RESULT SCHEMA
// ═══════════════════════════════════════════════════════════════════════════

export const CalculationResultSchema = z.object({
  caseId: z.string(),
  calculatedAt: z.string(),
  asOfDate: z.string(),
  
  // Totals
  totalInterest: z.number(),
  totalDue: z.number(),
  preEnforcementInterest: z.number().optional(),
  postEnforcementInterest: z.number().optional(),
  
  // Details
  segments: z.array(SegmentSchema),
  allocations: z.array(AllocationStepSchema).optional(),
  
  // Warnings
  policyWarnings: z.array(PolicyWarningSchema),
  
  // Legal
  legalText: z.string(),
  interestType: z.string(),
  
  // Audit
  auditLogId: z.string(),
  inputHash: z.string(),
  
  // Versions
  rateTableVersion: z.string(),
  engineVersion: z.string(),
  ruleVersion: z.string(),
  versionPinning: VersionPinningSchema.optional(),
  
  // Options Used
  dayCountRule: z.string(),
  sameDayPaymentRule: z.nativeEnum(SameDayPaymentRule).optional(),
  roundingMode: z.nativeEnum(RoundingMode),
  roundingScope: z.nativeEnum(RoundingScope),
  gapPolicy: z.nativeEnum(GapPolicy),
  claimPriorityRule: z.nativeEnum(ClaimPriorityRule).optional(),
  
  // FX
  fxRate: z.number().optional(),
  fxDate: z.string().optional(),
  fxSource: z.nativeEnum(FxRateSource).optional(),
  
  // Strategy
  strategyUsed: z.string().optional(),

  // Interpretation profile (D-A PR-3) — echo of the profile used for this calculation
  interpretationProfileId: z.string().optional(),
});

export type CalculationResult = z.infer<typeof CalculationResultSchema>;

// ═══════════════════════════════════════════════════════════════════════════
// INPUT HASH GENERATION (Deterministik)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Deterministik input hash üretimi
 * Aynı input → Aynı hash (sıralama ve normalize)
 */
export function generateInputHash(request: CalculationRequest, interpretationProfileId: string): string {
  // Normalize: sırala ve sadece hesaplamayı etkileyen alanları al
  const normalized = {
    caseId: request.caseId,
    claimBuckets: [...request.claimBuckets]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map(c => ({
        id: c.id,
        amount: c.amount,
        currency: c.currency,
        startDate: c.startDate,
        interestType: c.interestType,
        dayCountBasis: c.dayCountBasis,
        fixedRate: c.fixedRate,
      })),
    payments: request.payments
      ? [...request.payments]
          .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))
          .map(p => ({
            id: p.id,
            date: p.date,
            amount: p.amount,
            currency: p.currency,
          }))
      : undefined,
    asOfDate: request.asOfDate,
    enforcementDate: request.enforcementDate,
    mode: request.mode,
    interpretationProfileId,
    options: {
      dayCountBasis: request.options.dayCountBasis,
      sameDayPaymentRule: request.options.sameDayPaymentRule,
      roundingMode: request.options.roundingMode,
      roundingScope: request.options.roundingScope,
      gapPolicy: request.options.gapPolicy,
      claimPriorityRule: request.options.claimPriorityRule,
    },
  };

  const json = JSON.stringify(normalized);
  return createHash('sha256').update(json).digest('hex');
}

// ═══════════════════════════════════════════════════════════════════════════
// VALIDATION HELPERS
// ═══════════════════════════════════════════════════════════════════════════

export function validateCalculationRequest(data: unknown): CalculationRequest {
  return CalculationRequestSchema.parse(data);
}

export function validateCalculationResult(data: unknown): CalculationResult {
  return CalculationResultSchema.parse(data);
}
