/**
 * Diagnostics Redaction Service
 * 
 * Phase 7A - Sprint 2 - Task 2.3
 * 
 * PII maskeleme servisi. Response seviyesinde uygulanır.
 * 
 * Kurallar (Sertleştirilmiş):
 * - Allowlist tabanlı: SAFE_FIELDS set'indeki alanlar redaction'a tabi DEĞİL
 * - Recursive fallback: Sadece "unknown fields" için, HER ZAMAN loglanır
 * - Fail-closed: Redaction hatası → 500 (PII sızıntısı önlenir)
 * - Snapshot testleri: CI'da zorunlu, fixture üzerinden PII leak test
 * 
 * @see .kiro/specs/self-serve-diagnostics/design.md - Recursive PII Redaction Kuralları
 */

import { Injectable, Logger } from '@nestjs/common';

// ============================================================================
// PII PATTERNS
// ============================================================================

/**
 * PII detection patterns
 * 
 * KVKK kapsamında maskelenmesi gereken veriler:
 * - TCKN (11 haneli)
 * - Telefon (+90...)
 * - Email (x@y.z)
 * - Borçlu adı (explicit field)
 * - Adres (explicit field)
 */
export const PII_PATTERNS = {
  TCKN: /\b\d{11}\b/g,
  PHONE: /\+?90?\s*\d{3}\s*\d{3}\s*\d{2}\s*\d{2}/g,
  EMAIL: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
} as const;

// ============================================================================
// SAFE FIELDS ALLOWLIST
// ============================================================================

/**
 * Allowlist: Bu alanlar redaction'a tabi DEĞİL (safe fields)
 * 
 * UI DTO'larında görünmesi beklenen alanlar.
 * Bu liste dışındaki string alanlar PII kontrolüne tabi.
 */
export const SAFE_FIELDS = new Set([
  // Meta
  'traceId', 'requestId', 'tenantId', 'clientId', 'endpoint', 'mode',
  'startedAt', 'finishedAt', 'durationMs', 'version', 'service', 'commit', 'build',
  
  // Input summary
  'fingerprint', 'principalAmount', 'currency', 'interestType', 'startDate', 'endDate',
  'caseType', 'debtorCount', 'skipInterest', 'skipFee', 'skipPolicy',
  
  // Cache
  'hits', 'misses', 'staleServed', 'hit', 'miss', 'stale', 'ttlSec', 'byNamespace',
  
  // Circuit breaker
  'state', 'openedAt', 'halfOpenTrials', 'halfOpenFailures', 'from', 'to', 'reason', 'at',
  'byDependency', 'events', 'dependency',
  
  // Rate limit
  'applied', 'burst', 'steadyPerSec', 'remainingTokens', 'retryAfterMs', 'bucket',
  
  // Dependencies
  'name', 'callId', 'outcome', 'domainValid', 'source', 'circuitState', 'evidence',
  'dependencies',
  
  // Policy
  'softCheck', 'code', 'severity', 'reasons', 'policy',
  
  // Warnings
  'warnings', 'message',
  
  // Result
  'status', 'totals', 'interest', 'fees', 'total', 'breakdownTruncated', 'result',
  
  // Shadow compare
  'enabled', 'category', 'diffSummary', 'shadowCompare',
  
  // Pagination & meta
  'pagination', 'query', 'cursor', 'nextCursor', 'hasMore', 'limit', 'total',
  'since', 'until', 'timestamp',
  
  // Diagnostics specific
  'hasWarnings', 'hasFallback', 'truncated', 'truncationReason', 'originalSizeBytes',
  'trace', 'traces', 'normalizedSummary', 'input', 'cache', 'circuitBreaker', 'rateLimit',
  'meta',
]);

// ============================================================================
// REDACTION SERVICE
// ============================================================================

@Injectable()
export class DiagnosticsRedactionService {
  private readonly logger = new Logger(DiagnosticsRedactionService.name);
  
  // Metrics
  private redactionStats = {
    totalRedactions: 0,
    unknownFieldsRedacted: 0,
    piiPatternsMatched: 0,
    errors: 0,
  };

  /**
   * Redact a trace bundle (or any object)
   * 
   * Fail-closed: Hata durumunda exception fırlatır (500)
   * 
   * @param obj - Object to redact
   * @returns Redacted object
   * @throws Error if redaction fails (fail-closed)
   */
  redact<T>(obj: T): T {
    try {
      return this.redactObject(obj, []) as T;
    } catch (error) {
      this.redactionStats.errors++;
      this.logger.error('[Redaction] FAIL-CLOSED: Redaction error', {
        error: (error as Error).message,
      });
      // Fail-closed: throw to prevent PII leak
      throw new Error('Redaction failed - response blocked for safety');
    }
  }

  /**
   * Recursive object redaction with path tracking
   */
  private redactObject(obj: unknown, path: string[]): unknown {
    // Null/undefined pass through
    if (obj === null || obj === undefined) {
      return obj;
    }
    
    // String: apply PII redaction
    if (typeof obj === 'string') {
      return this.redactString(obj, path);
    }
    
    // Number/boolean pass through
    if (typeof obj === 'number' || typeof obj === 'boolean') {
      return obj;
    }
    
    // Array: recurse
    if (Array.isArray(obj)) {
      return obj.map((item, i) => this.redactObject(item, [...path, `[${i}]`]));
    }
    
    // Object: recurse with field checking
    if (typeof obj === 'object') {
      const result: Record<string, unknown> = {};
      
      for (const [key, value] of Object.entries(obj)) {
        const fieldPath = [...path, key];
        
        // Safe field: skip PII check but still recurse for nested objects
        if (SAFE_FIELDS.has(key)) {
          result[key] = this.redactObject(value, fieldPath);
          continue;
        }
        
        // Unknown field: apply redaction and LOG
        if (typeof value === 'string') {
          this.redactionStats.unknownFieldsRedacted++;
          this.logger.warn('[Redaction] Unknown string field redacted', {
            path: fieldPath.join('.'),
          });
        }
        
        result[key] = this.redactObject(value, fieldPath);
      }
      
      return result;
    }
    
    // Unknown type: pass through
    return obj;
  }

  /**
   * String redaction with PII pattern matching
   */
  private redactString(str: string, path: string[]): string {
    let result = str;
    let redacted = false;
    
    // TCKN: 11 asterisks
    if (PII_PATTERNS.TCKN.test(result)) {
      result = result.replace(PII_PATTERNS.TCKN, '***********');
      redacted = true;
      this.redactionStats.piiPatternsMatched++;
    }
    
    // Reset regex lastIndex
    PII_PATTERNS.TCKN.lastIndex = 0;
    
    // Phone: +90*******XX
    if (PII_PATTERNS.PHONE.test(result)) {
      result = result.replace(PII_PATTERNS.PHONE, (match) => {
        const digits = match.replace(/\D/g, '');
        const lastTwo = digits.slice(-2);
        return `+90*******${lastTwo}`;
      });
      redacted = true;
      this.redactionStats.piiPatternsMatched++;
    }
    
    // Reset regex lastIndex
    PII_PATTERNS.PHONE.lastIndex = 0;
    
    // Email: a***@***.com
    if (PII_PATTERNS.EMAIL.test(result)) {
      result = result.replace(PII_PATTERNS.EMAIL, (match) => {
        const [local, domain] = match.split('@');
        const ext = domain.split('.').pop() || 'com';
        return `${local[0]}***@***.${ext}`;
      });
      redacted = true;
      this.redactionStats.piiPatternsMatched++;
    }
    
    // Reset regex lastIndex
    PII_PATTERNS.EMAIL.lastIndex = 0;
    
    if (redacted) {
      this.redactionStats.totalRedactions++;
      this.logger.debug('[Redaction] PII redacted', {
        path: path.join('.'),
      });
    }
    
    return result;
  }

  /**
   * Redact debtor name (explicit field)
   */
  redactDebtorName(name: string): string {
    if (!name || name.length === 0) return name;
    return `${name[0]}***`;
  }

  /**
   * Redact address (complete mask)
   */
  redactAddress(_address: string): string {
    return '[ADRES GİZLİ]';
  }

  /**
   * Get redaction statistics (for monitoring)
   */
  getStats(): typeof this.redactionStats {
    return { ...this.redactionStats };
  }

  /**
   * Reset statistics (for testing)
   */
  resetStats(): void {
    this.redactionStats = {
      totalRedactions: 0,
      unknownFieldsRedacted: 0,
      piiPatternsMatched: 0,
      errors: 0,
    };
  }
}
