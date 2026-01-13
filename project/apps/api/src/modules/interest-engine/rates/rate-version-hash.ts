/**
 * Task 4.4 - Rate Version Hash Determinism
 * 
 * Aynı rate seti → aynı hash (order-independent)
 * Property 11: Rate Version Hash Determinism
 */

import { createHash } from 'crypto';
import { RateEntry } from './rate-entry.entity';

/**
 * Generate deterministic version hash for a set of rates
 * Order-independent: same rates in any order produce same hash
 */
export function generateRateTableVersion(rates: RateEntry[]): string {
  if (rates.length === 0) {
    return 'empty-rate-table';
  }

  // Sort by (interestType, validFrom) for determinism
  const sortedRates = [...rates].sort((a, b) => {
    const typeCompare = a.interestType.localeCompare(b.interestType);
    if (typeCompare !== 0) return typeCompare;
    return a.validFrom.localeCompare(b.validFrom);
  });

  // Create canonical string representation
  const canonical = sortedRates.map(r => 
    `${r.interestType}|${r.validFrom}|${r.annualRate}|${r.source}`
  ).join('\n');

  return createHash('sha256').update(canonical).digest('hex').substring(0, 16);
}

/**
 * Generate version hash for a single rate entry
 */
export function generateRateEntryHash(entry: {
  interestType: string;
  validFrom: string;
  annualRate: number;
  source: string;
}): string {
  const data = `${entry.interestType}|${entry.validFrom}|${entry.annualRate}|${entry.source}`;
  return createHash('sha256').update(data).digest('hex').substring(0, 16);
}

/**
 * Verify two rate sets produce the same hash
 */
export function verifyRateTableMatch(
  rates1: RateEntry[],
  rates2: RateEntry[],
): boolean {
  return generateRateTableVersion(rates1) === generateRateTableVersion(rates2);
}
