/**
 * Phase 5.2 - Trace Normalizer
 * 
 * TraceBundle'ı karşılaştırma için normalize eder
 */

import { TraceBundle } from '../../../trace';

// ============================================================================
// FLAKY FIELDS - Karşılaştırmadan çıkarılacak alanlar
// ============================================================================

const FLAKY_TRACE_FIELDS = [
  'traceId',
  'requestId',
  'startedAt',
  'finishedAt',
  'durationMs',
  'callId',
  'timestamp',
  'at',
];

// ============================================================================
// NORMALIZER
// ============================================================================

export interface TraceNormalizeOptions {
  /** Flaky alanları kaldır */
  removeFlaky: boolean;
  
  /** Timing bilgilerini kaldır */
  removeTiming: boolean;
  
  /** Version bilgilerini kaldır */
  removeVersions: boolean;
}

const DEFAULT_OPTIONS: TraceNormalizeOptions = {
  removeFlaky: true,
  removeTiming: true,
  removeVersions: false,
};

/**
 * TraceBundle'ı karşılaştırma için normalize et
 */
export function normalizeTrace(
  trace: TraceBundle,
  options: Partial<TraceNormalizeOptions> = {},
): Record<string, unknown> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  
  // Deep clone
  let normalized = JSON.parse(JSON.stringify(trace)) as Record<string, unknown>;
  
  // Flaky alanları kaldır
  if (opts.removeFlaky) {
    normalized = removeFlakyFields(normalized);
  }
  
  // Timing bilgilerini kaldır
  if (opts.removeTiming) {
    normalized = removeTimingFields(normalized);
  }
  
  // Version bilgilerini kaldır
  if (opts.removeVersions) {
    normalized = removeVersionFields(normalized);
  }
  
  return normalized;
}

/**
 * Flaky alanları recursive olarak kaldır
 */
function removeFlakyFields(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  
  for (const [key, value] of Object.entries(obj)) {
    if (FLAKY_TRACE_FIELDS.includes(key)) {
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
 * Timing alanlarını kaldır
 */
function removeTimingFields(obj: Record<string, unknown>): Record<string, unknown> {
  const TIMING_FIELDS = ['durationMs', 'startedAt', 'finishedAt', 'at'];
  
  const result: Record<string, unknown> = {};
  
  for (const [key, value] of Object.entries(obj)) {
    if (TIMING_FIELDS.includes(key)) {
      continue;
    }
    
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      result[key] = removeTimingFields(value as Record<string, unknown>);
    } else if (Array.isArray(value)) {
      result[key] = value.map(item =>
        item && typeof item === 'object'
          ? removeTimingFields(item as Record<string, unknown>)
          : item
      );
    } else {
      result[key] = value;
    }
  }
  
  return result;
}

/**
 * Version alanlarını kaldır
 */
function removeVersionFields(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  
  for (const [key, value] of Object.entries(obj)) {
    if (key === 'version' || key === 'versions') {
      continue;
    }
    
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      result[key] = removeVersionFields(value as Record<string, unknown>);
    } else if (Array.isArray(value)) {
      result[key] = value.map(item =>
        item && typeof item === 'object'
          ? removeVersionFields(item as Record<string, unknown>)
          : item
      );
    } else {
      result[key] = value;
    }
  }
  
  return result;
}

/**
 * PII kontrolü - trace'de PII olmamalı
 */
export function checkNoPII(trace: TraceBundle): { valid: boolean; violations: string[] } {
  const violations: string[] = [];
  
  // Input summary'de PII olmamalı
  const input = trace.input?.normalizedSummary;
  if (input) {
    // TCKN pattern (11 digit)
    const tcknPattern = /\b\d{11}\b/;
    // Email pattern
    const emailPattern = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
    // Phone pattern (Turkish)
    const phonePattern = /\b(0?5\d{9}|0?\d{10})\b/;
    
    const inputStr = JSON.stringify(input);
    
    if (tcknPattern.test(inputStr)) {
      violations.push('TCKN found in input summary');
    }
    if (emailPattern.test(inputStr)) {
      violations.push('Email found in input summary');
    }
    if (phonePattern.test(inputStr)) {
      violations.push('Phone number found in input summary');
    }
  }
  
  return {
    valid: violations.length === 0,
    violations,
  };
}
