/**
 * Phase 5.2 - Result Normalizer
 * 
 * CalcPreviewResponse'u karşılaştırma için normalize eder
 */

import { CalcPreviewResponse } from '../../../types';

// ============================================================================
// FLAKY FIELDS - Karşılaştırmadan çıkarılacak alanlar
// ============================================================================

const FLAKY_FIELDS = [
  'timestamp',
  'requestHash',
  'cacheKey',
  'cacheExpiry',
];

// ============================================================================
// NORMALIZER
// ============================================================================

export interface NormalizeOptions {
  /** Flaky alanları kaldır */
  removeFlaky: boolean;
  
  /** Parasal değerleri yuvarla */
  roundMoney: boolean;
  
  /** Tarih formatını normalize et */
  normalizeDates: boolean;
  
  /** Array'leri sırala */
  sortArrays: boolean;
}

const DEFAULT_OPTIONS: NormalizeOptions = {
  removeFlaky: true,
  roundMoney: true,
  normalizeDates: true,
  sortArrays: true,
};

/**
 * CalcPreviewResponse'u karşılaştırma için normalize et
 */
export function normalizeResult(
  result: CalcPreviewResponse,
  options: Partial<NormalizeOptions> = {},
): Record<string, unknown> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  
  // Deep clone
  let normalized = JSON.parse(JSON.stringify(result)) as Record<string, unknown>;
  
  // Flaky alanları kaldır
  if (opts.removeFlaky) {
    normalized = removeFlakyFields(normalized);
  }
  
  // Parasal değerleri yuvarla
  if (opts.roundMoney) {
    normalized = roundMoneyFields(normalized);
  }
  
  // Tarihleri normalize et
  if (opts.normalizeDates) {
    normalized = normalizeDateFields(normalized);
  }
  
  // Array'leri sırala
  if (opts.sortArrays) {
    normalized = sortArrayFields(normalized);
  }
  
  return normalized;
}

/**
 * Flaky alanları kaldır
 */
function removeFlakyFields(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  
  for (const [key, value] of Object.entries(obj)) {
    if (FLAKY_FIELDS.includes(key)) {
      continue;
    }
    
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      result[key] = removeFlakyFields(value as Record<string, unknown>);
    } else if (Array.isArray(value)) {
      result[key] = value.map(item => 
        item && typeof item === 'object' 
          ? removeFlakyFields(item as Record<string, unknown>)
          : item
      );
    } else {
      result[key] = value;
    }
  }
  
  return result;
}

/**
 * Parasal alanları 2 ondalık basamağa yuvarla
 */
function roundMoneyFields(obj: Record<string, unknown>): Record<string, unknown> {
  const MONEY_FIELDS = [
    'estimatedInterest',
    'estimatedFees',
    'estimatedAttorneyFee',
    'principalAmount',
    'interest',
    'fees',
    'total',
    'preEnforcementInterest',
    'postEnforcementInterest',
  ];
  
  const result: Record<string, unknown> = {};
  
  for (const [key, value] of Object.entries(obj)) {
    if (MONEY_FIELDS.includes(key) && typeof value === 'number') {
      result[key] = Math.round(value * 100) / 100;
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      result[key] = roundMoneyFields(value as Record<string, unknown>);
    } else if (Array.isArray(value)) {
      result[key] = value.map(item =>
        item && typeof item === 'object'
          ? roundMoneyFields(item as Record<string, unknown>)
          : item
      );
    } else {
      result[key] = value;
    }
  }
  
  return result;
}

/**
 * Tarih alanlarını ISO date-only formatına normalize et
 */
function normalizeDateFields(obj: Record<string, unknown>): Record<string, unknown> {
  const DATE_FIELDS = ['startDate', 'endDate', 'asOfDate'];
  
  const result: Record<string, unknown> = {};
  
  for (const [key, value] of Object.entries(obj)) {
    if (DATE_FIELDS.includes(key) && typeof value === 'string') {
      // ISO date-only format: YYYY-MM-DD
      result[key] = value.split('T')[0];
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      result[key] = normalizeDateFields(value as Record<string, unknown>);
    } else if (Array.isArray(value)) {
      result[key] = value.map(item =>
        item && typeof item === 'object'
          ? normalizeDateFields(item as Record<string, unknown>)
          : item
      );
    } else {
      result[key] = value;
    }
  }
  
  return result;
}

/**
 * Array alanlarını sırala (ordering bağımsız karşılaştırma için)
 */
function sortArrayFields(obj: Record<string, unknown>): Record<string, unknown> {
  const SORTABLE_ARRAYS = ['warnings', 'errors', 'passedGates', 'softWarnings'];
  
  const result: Record<string, unknown> = {};
  
  for (const [key, value] of Object.entries(obj)) {
    if (SORTABLE_ARRAYS.includes(key) && Array.isArray(value)) {
      // Sort by 'code' or 'gateCode' if exists, otherwise stringify
      result[key] = [...value].sort((a, b) => {
        const aKey = (a as Record<string, unknown>)?.code || 
                     (a as Record<string, unknown>)?.gateCode || 
                     JSON.stringify(a);
        const bKey = (b as Record<string, unknown>)?.code || 
                     (b as Record<string, unknown>)?.gateCode || 
                     JSON.stringify(b);
        return String(aKey).localeCompare(String(bKey));
      });
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      result[key] = sortArrayFields(value as Record<string, unknown>);
    } else if (Array.isArray(value)) {
      result[key] = value.map(item =>
        item && typeof item === 'object'
          ? sortArrayFields(item as Record<string, unknown>)
          : item
      );
    } else {
      result[key] = value;
    }
  }
  
  return result;
}
