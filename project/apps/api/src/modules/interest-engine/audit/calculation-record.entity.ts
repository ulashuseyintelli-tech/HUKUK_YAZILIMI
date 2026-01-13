/**
 * Task 11.1 - CalculationRecord Entity
 * 
 * inputHash, outputSummary, versions, warnings, calculatedAt, calculatedBy
 * Audit trail for all calculations
 */

import { z } from 'zod';
import { CalculationMode } from '../types/common.types';

// ═══════════════════════════════════════════════════════════════════════════
// CALCULATION RECORD SCHEMA
// ═══════════════════════════════════════════════════════════════════════════

export const CalculationRecordSchema = z.object({
  id: z.string().cuid(),
  tenantId: z.string().min(1),
  caseId: z.string().min(1),
  
  // Input
  inputHash: z.string().length(64), // SHA-256
  request: z.record(z.unknown()), // Full request JSON
  
  // Output Summary
  totalInterest: z.number(),
  totalDue: z.number(),
  segmentCount: z.number().int().nonnegative(),
  warningCount: z.number().int().nonnegative(),
  
  // Versions
  rateTableVersion: z.string(),
  engineVersion: z.string(),
  ruleVersion: z.string().optional(),
  
  // Metadata
  mode: z.nativeEnum(CalculationMode),
  calculatedAt: z.string().datetime(),
  calculatedBy: z.string().optional(),
  
  // Retention
  retentionExpiresAt: z.string().datetime(),
  isArchived: z.boolean().default(false),
});

export type CalculationRecord = z.infer<typeof CalculationRecordSchema>;

// ═══════════════════════════════════════════════════════════════════════════
// CALCULATION RECORD CREATE INPUT
// ═══════════════════════════════════════════════════════════════════════════

export const CalculationRecordCreateSchema = CalculationRecordSchema.omit({
  id: true,
  tenantId: true,
  calculatedBy: true,
  retentionExpiresAt: true,
  isArchived: true,
});

export type CalculationRecordCreate = z.infer<typeof CalculationRecordCreateSchema>;

// ═══════════════════════════════════════════════════════════════════════════
// RETENTION POLICY
// ═══════════════════════════════════════════════════════════════════════════

export const CALCULATION_RECORD_RETENTION = {
  activeDays: 90,           // 90 gün aktif erişim
  archiveDays: 3650,        // 10 yıl arşiv
  totalDays: 3740,          // Toplam saklama
};

/**
 * Calculate retention expiry date
 */
export function calculateRecordRetentionExpiry(calculatedAt: Date = new Date()): Date {
  const expiry = new Date(calculatedAt);
  expiry.setDate(expiry.getDate() + CALCULATION_RECORD_RETENTION.activeDays);
  return expiry;
}

/**
 * Calculate archive expiry date
 */
export function calculateArchiveExpiry(archivedAt: Date = new Date()): Date {
  const expiry = new Date(archivedAt);
  expiry.setDate(expiry.getDate() + CALCULATION_RECORD_RETENTION.archiveDays);
  return expiry;
}
