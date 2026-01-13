/**
 * Task 11.2 - CalculationTrace Entity
 * 
 * segments, allocations, ratesUsed
 * Detailed trace for debugging and audit
 */

import { z } from 'zod';
import { SegmentSchema, AllocationStepSchema } from '../types/domain.types';

// ═══════════════════════════════════════════════════════════════════════════
// RATE ENTRY SNAPSHOT SCHEMA
// ═══════════════════════════════════════════════════════════════════════════

export const RateEntrySnapshotSchema = z.object({
  id: z.string(),
  interestType: z.string(),
  validFrom: z.string(),
  validTo: z.string().nullable(),
  annualRate: z.number(),
  source: z.string(),
  sourceReference: z.string().optional(),
});

export type RateEntrySnapshot = z.infer<typeof RateEntrySnapshotSchema>;

// ═══════════════════════════════════════════════════════════════════════════
// CALCULATION TRACE SCHEMA
// ═══════════════════════════════════════════════════════════════════════════

export const CalculationTraceSchema = z.object({
  id: z.string().cuid(),
  recordId: z.string().cuid(),
  
  // Full details
  segments: z.array(SegmentSchema),
  allocations: z.array(AllocationStepSchema).optional(),
  ratesUsed: z.array(RateEntrySnapshotSchema),
  
  // Timeline for debugging
  timeline: z.array(z.string()).optional(),
  
  // Retention
  retentionExpiresAt: z.string().datetime(),
  createdAt: z.string().datetime(),
});

export type CalculationTrace = z.infer<typeof CalculationTraceSchema>;

// ═══════════════════════════════════════════════════════════════════════════
// CALCULATION TRACE CREATE INPUT
// ═══════════════════════════════════════════════════════════════════════════

export const CalculationTraceCreateSchema = CalculationTraceSchema.omit({
  id: true,
  retentionExpiresAt: true,
  createdAt: true,
});

export type CalculationTraceCreate = z.infer<typeof CalculationTraceCreateSchema>;

// ═══════════════════════════════════════════════════════════════════════════
// RETENTION POLICY
// ═══════════════════════════════════════════════════════════════════════════

export const CALCULATION_TRACE_RETENTION = {
  activeDays: 30,           // 30 gün aktif erişim
  archiveDays: 730,         // 2 yıl arşiv
  totalDays: 760,           // Toplam saklama
  summaryRetained: true,    // Özet saklanır
};

/**
 * Calculate trace retention expiry date
 */
export function calculateTraceRetentionExpiry(createdAt: Date = new Date()): Date {
  const expiry = new Date(createdAt);
  expiry.setDate(expiry.getDate() + CALCULATION_TRACE_RETENTION.activeDays);
  return expiry;
}
