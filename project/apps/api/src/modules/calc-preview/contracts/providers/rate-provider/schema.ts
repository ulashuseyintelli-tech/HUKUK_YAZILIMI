/**
 * Phase 5.6 - Rate Provider Contract Schema (v1)
 * 
 * JSON shape validation using Zod.
 * Bu schema DONMUŞ - breaking change için v2 oluştur.
 * 
 * @see contracts/README.md
 */

import { z } from 'zod';

// ============================================================================
// RATE ENTRY SCHEMA
// ============================================================================

export const RateEntrySchema = z.object({
  id: z.string().min(1),
  interestType: z.string().min(1),
  annualRate: z.number().min(0).max(100),
  validFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), // ISO date
  validTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  sourceId: z.string(),
  sourceName: z.string(),
  publishedAt: z.string(), // ISO datetime
  currency: z.string().length(3), // ISO 4217
});

export type RateEntry = z.infer<typeof RateEntrySchema>;

// ============================================================================
// RATE QUERY OPTIONS SCHEMA
// ============================================================================

export const RateQueryOptionsSchema = z.object({
  interestType: z.string().min(1),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  currency: z.string().length(3).optional(),
  tenantId: z.string().optional(),
});

export type RateQueryOptions = z.infer<typeof RateQueryOptionsSchema>;

// ============================================================================
// RATE AT DATE RESULT SCHEMA
// ============================================================================

export const RateAtDateResultSchema = z.object({
  rate: RateEntrySchema.nullable(),
  isInferred: z.boolean(),
  inferredFrom: z.string().optional(),
});

export type RateAtDateResult = z.infer<typeof RateAtDateResultSchema>;

// ============================================================================
// RATE TABLE VERSION SCHEMA
// ============================================================================

export const RateTableVersionSchema = z.object({
  hash: z.string().min(1),
  generatedAt: z.string(),
  rateCount: z.number().int().min(0),
  latestPublishedAt: z.string(),
});

export type RateTableVersion = z.infer<typeof RateTableVersionSchema>;

// ============================================================================
// RATES FOR PERIOD RESPONSE SCHEMA
// ============================================================================

export const RatesForPeriodResponseSchema = z.array(RateEntrySchema);

export type RatesForPeriodResponse = z.infer<typeof RatesForPeriodResponseSchema>;

// ============================================================================
// COVERAGE INFO SCHEMA (for preview responses)
// ============================================================================

export const CoverageInfoSchema = z.object({
  percent: z.number().min(0).max(100),
  totalDays: z.number().int().min(0),
  coveredDays: z.number().int().min(0),
  hasGaps: z.boolean(),
  hasOverlaps: z.boolean(),
  gaps: z.array(z.object({
    start: z.string(),
    end: z.string(),
    days: z.number().int().min(1),
  })).optional(),
  overlaps: z.array(z.object({
    start: z.string(),
    end: z.string(),
    rates: z.array(z.string()),
  })).optional(),
});

export type CoverageInfo = z.infer<typeof CoverageInfoSchema>;

// ============================================================================
// SCHEMA VERSION
// ============================================================================

export const RATE_PROVIDER_SCHEMA_VERSION = 'v1';

// ============================================================================
// VALIDATION HELPERS
// ============================================================================

export function validateRateEntry(data: unknown): { success: true; data: RateEntry } | { success: false; errors: z.ZodError } {
  const result = RateEntrySchema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, errors: result.error };
}

export function validateRatesForPeriod(data: unknown): { success: true; data: RatesForPeriodResponse } | { success: false; errors: z.ZodError } {
  const result = RatesForPeriodResponseSchema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, errors: result.error };
}

export function validateCoverageInfo(data: unknown): { success: true; data: CoverageInfo } | { success: false; errors: z.ZodError } {
  const result = CoverageInfoSchema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, errors: result.error };
}
