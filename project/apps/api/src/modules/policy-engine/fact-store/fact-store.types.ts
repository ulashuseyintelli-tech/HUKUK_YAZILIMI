import { Scope } from '../types';

/**
 * Fact değer tipleri
 */
export type FactValue = string | number | boolean | Date | null | Record<string, unknown>;

/**
 * Fact Map - key -> value mapping
 */
export type FactMap = Map<string, FactValue>;

/**
 * Fact key format: {scope}.{contextId?}.{key}
 * 
 * Examples:
 * - case.has_power_of_attorney
 * - case.is_archived
 * - debtor.abc123.notification_delivered
 * - debtor.abc123.days_since_notification (computed)
 * - asset.xyz789.type
 * - asset.xyz789.has_prior_liens
 * - expense.opening.paid
 */
export interface FactKey {
  scope: Scope;
  contextId?: string;
  key: string;
}

/**
 * Fact key'i parse et
 */
export function parseFactKey(factKey: string): FactKey {
  const parts = factKey.split('.');
  
  if (parts.length < 2) {
    throw new Error(`Invalid fact key format: ${factKey}`);
  }
  
  const scope = parts[0].toUpperCase() as Scope;
  
  // case.key veya case.contextId.key formatı
  if (parts.length === 2) {
    return { scope, key: parts[1] };
  }
  
  // scope.contextId.key formatı
  return {
    scope,
    contextId: parts[1],
    key: parts.slice(2).join('.'),
  };
}

/**
 * Fact key oluştur
 */
export function buildFactKey(scope: Scope, key: string, contextId?: string): string {
  const scopeLower = scope.toLowerCase();
  if (contextId) {
    return `${scopeLower}.${contextId}.${key}`;
  }
  return `${scopeLower}.${key}`;
}

/**
 * Fact write metadata
 */
export interface FactWriteMetadata {
  /** İşlem ID */
  executionId?: string;
  /** Kaynak servis */
  source?: string;
  /** ActionCode */
  actionCode?: string;
  /** Kullanıcı ID */
  userId?: string;
}

/**
 * Cache entry
 */
export interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}
