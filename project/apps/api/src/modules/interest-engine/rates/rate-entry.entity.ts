/**
 * Task 4.1 - RateEntry Entity
 * 
 * Rate tablosu için entity tanımı
 * sourceId, versionHash, effectiveDate, annualRate
 */

import { z } from 'zod';
import { InterestTypeCode } from '../types/domain.types';

// ═══════════════════════════════════════════════════════════════════════════
// RATE SOURCE TYPE
// ═══════════════════════════════════════════════════════════════════════════

export enum RateSourceType {
  TCMB = 'TCMB',
  RESMI_GAZETE = 'RESMI_GAZETE',
  CONTRACT = 'CONTRACT',
  MANUAL = 'MANUAL',
}

// ═══════════════════════════════════════════════════════════════════════════
// RATE ENTRY SCHEMA
// ═══════════════════════════════════════════════════════════════════════════

const isoDateRegex = /^\d{4}-\d{2}-\d{2}$/;

export const RateEntrySchema = z.object({
  id: z.string().min(1),
  interestType: z.nativeEnum(InterestTypeCode),
  validFrom: z.string().regex(isoDateRegex),
  validTo: z.string().regex(isoDateRegex).nullable(),
  annualRate: z.number().min(0).max(1),
  source: z.nativeEnum(RateSourceType),
  sourceReference: z.string().optional(),
  publishedDate: z.string().regex(isoDateRegex).optional(),
  versionHash: z.string().min(1),
  createdAt: z.string(),
  createdBy: z.string().optional(),
});

export type RateEntry = z.infer<typeof RateEntrySchema>;

export function validateRateEntry(data: unknown): RateEntry {
  return RateEntrySchema.parse(data);
}
