/**
 * Task 11.3 - PreviewRecord Entity
 * 
 * is_preview=true, non_authoritative=true, disclaimer
 * Separate from CalculationRecord - NOT authoritative
 */

import { z } from 'zod';
import { SegmentSchema } from '../types/domain.types';
import { PREVIEW_DISCLAIMER } from '../reporter/legal-text-templates';

// ═══════════════════════════════════════════════════════════════════════════
// PREVIEW RECORD SCHEMA
// ═══════════════════════════════════════════════════════════════════════════

export const PreviewRecordSchema = z.object({
  id: z.string().cuid(),
  tenantId: z.string().min(1),
  caseId: z.string().min(1),
  
  // Preview flags (always true)
  isPreview: z.literal(true),
  nonAuthoritative: z.literal(true),
  
  // Disclaimer
  disclaimer: z.string(),
  
  // Input/Output
  inputHash: z.string().length(64),
  request: z.record(z.unknown()),
  totalInterest: z.number(),
  segments: z.array(SegmentSchema),
  
  // Gap info (preview can have gaps)
  hasRateGaps: z.boolean(),
  gapDetails: z.array(z.object({
    from: z.string(),
    to: z.string(),
    days: z.number().int(),
  })).optional(),
  
  // Metadata
  createdAt: z.string().datetime(),
  createdBy: z.string().optional(),
  expiresAt: z.string().datetime(),
});

export type PreviewRecord = z.infer<typeof PreviewRecordSchema>;

// ═══════════════════════════════════════════════════════════════════════════
// PREVIEW RECORD CREATE INPUT
// ═══════════════════════════════════════════════════════════════════════════

export const PreviewRecordCreateSchema = PreviewRecordSchema.omit({
  id: true,
  tenantId: true,
  createdBy: true,
  isPreview: true,
  nonAuthoritative: true,
  disclaimer: true,
  expiresAt: true,
  createdAt: true,
});

export type PreviewRecordCreate = z.infer<typeof PreviewRecordCreateSchema>;

// ═══════════════════════════════════════════════════════════════════════════
// RETENTION POLICY
// ═══════════════════════════════════════════════════════════════════════════

export const PREVIEW_RECORD_RETENTION = {
  activeDays: 30,           // 30 gün sonra silinir
  archiveDays: 0,           // Arşivlenmez
  totalDays: 30,
  summaryRetained: false,   // Özet de saklanmaz
};

/**
 * Calculate preview expiry date
 */
export function calculatePreviewExpiry(createdAt: Date = new Date()): Date {
  const expiry = new Date(createdAt);
  expiry.setDate(expiry.getDate() + PREVIEW_RECORD_RETENTION.activeDays);
  return expiry;
}

/**
 * Create preview record with defaults
 */
export function createPreviewRecord(
  input: PreviewRecordCreate & { tenantId: string; createdBy?: string },
  createdAt: Date = new Date(),
): Omit<PreviewRecord, 'id'> {
  return {
    ...input,
    isPreview: true,
    nonAuthoritative: true,
    disclaimer: PREVIEW_DISCLAIMER,
    createdAt: createdAt.toISOString(),
    expiresAt: calculatePreviewExpiry(createdAt).toISOString(),
  };
}
