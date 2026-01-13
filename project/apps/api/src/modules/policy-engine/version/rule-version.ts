/**
 * Rule Version Tracking
 * 
 * Build-time'da tüm compiled rule dosyalarından hash üretir.
 * Her karar ve execution kaydında bu version kullanılır.
 * 
 * @see design.md - Section 9: Rule Version Traceability
 */

import { createHash } from 'crypto';
import { RULE_VERSION as STATE_FLOW_VERSION, COMPILED_AT as STATE_FLOW_COMPILED_AT } from '../state-machine/compiled/state-flows.compiled';
import { RULE_VERSION as GATES_VERSION, COMPILED_AT as GATES_COMPILED_AT } from '../gate-checker/compiled/gates.compiled';
import { RULE_VERSION as RULES_VERSION, COMPILED_AT as RULES_COMPILED_AT } from '../rule-engine/compiled/rules.compiled';

/**
 * Tüm compiled rule dosyalarının birleşik version'ı
 */
export interface CompositeRuleVersion {
  /** Birleşik hash */
  hash: string;
  /** Semantic version */
  version: string;
  /** Compile tarihi */
  compiledAt: string;
  /** Alt version'lar */
  components: {
    stateFlows: string;
    gates: string;
    rules: string;
  };
}

/**
 * Birleşik rule version hesapla
 */
export function computeCompositeRuleVersion(): CompositeRuleVersion {
  // Tüm version'ları birleştir
  const combined = [
    STATE_FLOW_VERSION,
    GATES_VERSION,
    RULES_VERSION,
  ].join('|');

  // SHA256 hash oluştur
  const hash = createHash('sha256')
    .update(combined)
    .digest('hex')
    .substring(0, 12); // İlk 12 karakter yeterli

  // En son compile tarihini bul
  const compileDates = [
    STATE_FLOW_COMPILED_AT,
    GATES_COMPILED_AT,
    RULES_COMPILED_AT,
  ].map(d => new Date(d).getTime());
  
  const latestCompile = new Date(Math.max(...compileDates)).toISOString();

  return {
    hash,
    version: `cpe-${hash}`,
    compiledAt: latestCompile,
    components: {
      stateFlows: STATE_FLOW_VERSION,
      gates: GATES_VERSION,
      rules: RULES_VERSION,
    },
  };
}

// Singleton - module load'da hesapla
let _cachedVersion: CompositeRuleVersion | null = null;

/**
 * Mevcut rule version'ı döndür (cached)
 */
export function getRuleVersion(): CompositeRuleVersion {
  if (!_cachedVersion) {
    _cachedVersion = computeCompositeRuleVersion();
  }
  return _cachedVersion;
}

/**
 * Rule version string'i döndür (logging için)
 */
export function getRuleVersionString(): string {
  return getRuleVersion().version;
}

/**
 * Rule version hash'i döndür (DB kaydı için)
 */
export function getRuleVersionHash(): string {
  return getRuleVersion().hash;
}

/**
 * Version bilgisini JSON olarak döndür (API response için)
 */
export function getRuleVersionInfo(): Record<string, unknown> {
  const v = getRuleVersion();
  return {
    version: v.version,
    hash: v.hash,
    compiledAt: v.compiledAt,
    components: v.components,
  };
}
