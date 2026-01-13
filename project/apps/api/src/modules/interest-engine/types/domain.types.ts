/**
 * Task 1.2 - Domain Entities (Skeleton)
 * 
 * Kurallar:
 * - Davranış yok, sadece şekil
 * - Constructor validation var
 * - Hesaplama yok
 * - Sadece "taşıyıcı"
 */

import { z } from 'zod';

// ═══════════════════════════════════════════════════════════════════════════
// INTEREST TYPE CODE
// ═══════════════════════════════════════════════════════════════════════════

// TEK KAYNAK: Enum burada tanımlı, tüm modüller buradan import etmeli
export enum InterestTypeCode {
  LEGAL_3095 = 'LEGAL_3095',
  COMMERCIAL_AVANS_3095_2_2 = 'COMMERCIAL_AVANS_3095_2_2',
  COMMERCIAL_FIXED = 'COMMERCIAL_FIXED',
  TTK_1530 = 'TTK_1530',
  CONTRACTUAL = 'CONTRACTUAL',
  MEVDUAT_TL_BANKALARCA = 'MEVDUAT_TL_BANKALARCA',
  MEVDUAT_USD_BANKALARCA = 'MEVDUAT_USD_BANKALARCA',
  MEVDUAT_EUR_BANKALARCA = 'MEVDUAT_EUR_BANKALARCA',
  MEVDUAT_TL_KAMU = 'MEVDUAT_TL_KAMU',
  MEVDUAT_USD_KAMU = 'MEVDUAT_USD_KAMU',
  MEVDUAT_EUR_KAMU = 'MEVDUAT_EUR_KAMU',
}

// ═══════════════════════════════════════════════════════════════════════════
// ANCILLARY TYPE (Fer'i Alacak)
// ═══════════════════════════════════════════════════════════════════════════

export enum AncillaryType {
  VEKALET_UCRETI = 'VEKALET_UCRETI',
  HARC = 'HARC',
  TEBLIGAT_MASRAFI = 'TEBLIGAT_MASRAFI',
  CEK_TAZMINATI = 'CEK_TAZMINATI',
  KOMISYON = 'KOMISYON',
  DIGER = 'DIGER',
}

// TBK 100 Allocation Order
export const TBK100_ALLOCATION_ORDER: (AncillaryType | 'INTEREST' | 'PRINCIPAL')[] = [
  'INTEREST',
  AncillaryType.HARC,
  AncillaryType.TEBLIGAT_MASRAFI,
  AncillaryType.VEKALET_UCRETI,
  AncillaryType.CEK_TAZMINATI,
  AncillaryType.KOMISYON,
  AncillaryType.DIGER,
  'PRINCIPAL',
];


// ═══════════════════════════════════════════════════════════════════════════
// ZOD SCHEMAS
// ═══════════════════════════════════════════════════════════════════════════

const isoDateRegex = /^\d{4}-\d{2}-\d{2}$/;

export const ClaimBucketSchema = z.object({
  id: z.string().min(1),
  amount: z.number().positive(),
  currency: z.enum(['TRY', 'USD', 'EUR', 'GBP', 'CHF']),
  startDate: z.string().regex(isoDateRegex, 'ISO date required (YYYY-MM-DD)'),
  interestType: z.nativeEnum(InterestTypeCode),
  dayCountBasis: z.union([z.literal(365), z.literal(360)]).default(365),
  priority: z.number().int().optional(),
  ibrazTarihi: z.string().regex(isoDateRegex).optional(),
  vadeTarihi: z.string().regex(isoDateRegex).optional(),
  fixedRate: z.number().min(0).max(1).optional(),
  metadata: z.record(z.unknown()).optional(),
  // Strategy selection hint
  claimType: z.string().optional(), // e.g., 'CEK', 'BONO', 'POLICE', 'KIRA', etc.
});

export const SegmentSchema = z.object({
  claimBucketId: z.string().min(1),
  periodStart: z.string().regex(isoDateRegex),
  periodEnd: z.string().regex(isoDateRegex),
  days: z.number().int().nonnegative(),
  rate: z.number().min(0).max(1),
  rateId: z.string().min(1),
  rateSource: z.string(),
  principal: z.number().nonnegative(),
  segmentInterest: z.number().nonnegative(),
  phase: z.enum(['PRE_ENFORCEMENT', 'POST_ENFORCEMENT']).optional(),
  dayCountRule: z.string().optional(),
});

export const PaymentSchema = z.object({
  id: z.string().min(1),
  date: z.string().regex(isoDateRegex),
  amount: z.number().positive(),
  currency: z.enum(['TRY', 'USD', 'EUR', 'GBP', 'CHF']),
  source: z.string().optional(),
});

export const AllocationCategorySchema = z.object({
  category: z.union([
    z.nativeEnum(AncillaryType),
    z.literal('INTEREST'),
    z.literal('PRINCIPAL'),
  ]),
  label: z.string(),
  amountBefore: z.number().nonnegative(),
  amountAllocated: z.number().nonnegative(),
  amountAfter: z.number().nonnegative(),
});

export const AllocationStepSchema = z.object({
  paymentId: z.string().min(1),
  paymentDate: z.string().regex(isoDateRegex),
  paymentAmount: z.number().positive(),
  allocations: z.array(AllocationCategorySchema),
  remainingPayment: z.number().nonnegative(),
  newPrincipal: z.number().nonnegative(),
  claimBucketId: z.string(),
});

// ═══════════════════════════════════════════════════════════════════════════
// TYPE EXPORTS (Inferred from Zod)
// ═══════════════════════════════════════════════════════════════════════════

export type ClaimBucket = z.infer<typeof ClaimBucketSchema>;
export type Segment = z.infer<typeof SegmentSchema>;
export type Payment = z.infer<typeof PaymentSchema>;
export type AllocationCategory = z.infer<typeof AllocationCategorySchema>;
export type AllocationStep = z.infer<typeof AllocationStepSchema>;

// ═══════════════════════════════════════════════════════════════════════════
// VALIDATION HELPERS
// ═══════════════════════════════════════════════════════════════════════════

export function validateClaimBucket(data: unknown): ClaimBucket {
  return ClaimBucketSchema.parse(data);
}

export function validateSegment(data: unknown): Segment {
  return SegmentSchema.parse(data);
}

export function validatePayment(data: unknown): Payment {
  return PaymentSchema.parse(data);
}

export function validateAllocationStep(data: unknown): AllocationStep {
  return AllocationStepSchema.parse(data);
}
