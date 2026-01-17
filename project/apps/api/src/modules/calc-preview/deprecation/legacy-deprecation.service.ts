/**
 * Phase 4.5 - Legacy Endpoint Deprecation Service
 * 
 * Kavgasız deprecation stratejisi:
 * 1. Trafik ölçümü (endpoint/tenant/client bazlı)
 * 2. Deprecation headers (RFC 8594)
 * 3. Shadow compare (legacy vs unified)
 * 4. Soft degrade → Hard degrade → 410 Gone
 * 
 * @see docs/single-source-of-truth-architecture.md - Phase 4.5
 */

import { Injectable, Logger } from '@nestjs/common';

// ============================================================================
// DEPRECATION TYPES
// ============================================================================

export interface DeprecatedEndpoint {
  path: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  successor: string;
  sunsetDate: string;  // RFC 1123 format
  deprecatedSince: string;
  status: 'ACTIVE' | 'WARNING' | 'SHADOW' | 'REDIRECT' | 'GONE';
}

export interface DeprecationTrafficRecord {
  endpoint: string;
  tenantId: string;
  clientId?: string;
  timestamp: number;
  userAgent?: string;
}

export interface DeprecationStats {
  endpoint: string;
  totalRequests: number;
  uniqueTenants: number;
  uniqueClients: number;
  lastRequest?: string;
  topTenants: { tenantId: string; count: number }[];
  topClients: { clientId: string; count: number }[];
}

export interface ShadowCompareResult {
  endpoint: string;
  requestHash: string;
  legacyResult: unknown;
  unifiedResult: unknown;
  match: boolean;
  diff?: ShadowDiff[];
  timestamp: string;
}

/**
 * Shadow diff with severity (gürültü vs gerçek regresyon)
 */
export interface ShadowDiff {
  path: string;
  legacyValue: unknown;
  unifiedValue: unknown;
  severity: 'NOISE' | 'MINOR' | 'MAJOR' | 'CRITICAL';
  category: 'ROUNDING' | 'ORDERING' | 'FORMAT' | 'VALUE' | 'MISSING' | 'POLICY';
}

// ============================================================================
// DEPRECATED ENDPOINTS REGISTRY
// ============================================================================

export const DEPRECATED_ENDPOINTS: DeprecatedEndpoint[] = [
  {
    path: '/interest-engine/preview',
    method: 'POST',
    successor: '/calc/preview/light',
    sunsetDate: 'Sun, 15 Mar 2026 00:00:00 GMT',
    deprecatedSince: '2026-01-15',
    status: 'WARNING',
  },
  {
    path: '/fee-engine/preview',
    method: 'POST',
    successor: '/calc/preview/light',
    sunsetDate: 'Sun, 15 Mar 2026 00:00:00 GMT',
    deprecatedSince: '2026-01-15',
    status: 'WARNING',
  },
];

// ============================================================================
// DEPRECATION SERVICE
// ============================================================================

@Injectable()
export class LegacyDeprecationService {
  private readonly logger = new Logger(LegacyDeprecationService.name);
  
  // Traffic tracking
  private trafficRecords: DeprecationTrafficRecord[] = [];
  private readonly MAX_RECORDS = 50000;
  
  // Shadow compare results
  private shadowResults: ShadowCompareResult[] = [];
  private readonly MAX_SHADOW_RESULTS = 1000;
  
  // Kill switch per endpoint
  private killSwitches = new Map<string, boolean>();

  constructor() {
    // Cleanup interval
    setInterval(() => this.cleanup(), 60 * 60 * 1000); // Every hour
  }

  // ============================================================================
  // TRAFFIC TRACKING
  // ============================================================================

  /**
   * Record a request to a deprecated endpoint
   */
  recordRequest(params: {
    endpoint: string;
    tenantId: string;
    clientId?: string;
    userAgent?: string;
  }): void {
    this.trafficRecords.push({
      endpoint: params.endpoint,
      tenantId: params.tenantId,
      clientId: params.clientId,
      userAgent: params.userAgent,
      timestamp: Date.now(),
    });
    
    // Cleanup if too many
    if (this.trafficRecords.length > this.MAX_RECORDS) {
      this.trafficRecords = this.trafficRecords.slice(-this.MAX_RECORDS / 2);
    }
    
    this.logger.warn(`[Deprecation] Legacy endpoint called: ${params.endpoint}`, {
      tenant: params.tenantId,
      client: params.clientId,
    });
  }

  /**
   * Get traffic stats for a deprecated endpoint
   */
  getTrafficStats(endpoint: string, windowMs: number = 7 * 24 * 60 * 60 * 1000): DeprecationStats {
    const cutoff = Date.now() - windowMs;
    const filtered = this.trafficRecords.filter(
      r => r.endpoint === endpoint && r.timestamp > cutoff
    );
    
    // Count by tenant
    const tenantCounts = new Map<string, number>();
    const clientCounts = new Map<string, number>();
    
    for (const record of filtered) {
      tenantCounts.set(record.tenantId, (tenantCounts.get(record.tenantId) || 0) + 1);
      if (record.clientId) {
        clientCounts.set(record.clientId, (clientCounts.get(record.clientId) || 0) + 1);
      }
    }
    
    // Sort by count
    const topTenants = Array.from(tenantCounts.entries())
      .map(([tenantId, count]) => ({ tenantId, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
    
    const topClients = Array.from(clientCounts.entries())
      .map(([clientId, count]) => ({ clientId, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
    
    const lastRecord = filtered.length > 0 
      ? filtered[filtered.length - 1] 
      : undefined;
    
    return {
      endpoint,
      totalRequests: filtered.length,
      uniqueTenants: tenantCounts.size,
      uniqueClients: clientCounts.size,
      lastRequest: lastRecord ? new Date(lastRecord.timestamp).toISOString() : undefined,
      topTenants,
      topClients,
    };
  }

  /**
   * Get all deprecated endpoints stats
   */
  getAllStats(): DeprecationStats[] {
    return DEPRECATED_ENDPOINTS.map(ep => this.getTrafficStats(ep.path));
  }

  // ============================================================================
  // DEPRECATION HEADERS
  // ============================================================================

  /**
   * Get deprecation headers for a response
   * RFC 8594: The "Deprecation" HTTP Header Field
   */
  getDeprecationHeaders(endpoint: string): Record<string, string> {
    const config = DEPRECATED_ENDPOINTS.find(e => e.path === endpoint);
    
    if (!config) {
      return {};
    }
    
    return {
      'Deprecation': 'true',
      'Deprecation-Date': config.deprecatedSince,
      'Sunset': config.sunsetDate,
      'Link': `<${config.successor}>; rel="successor-version"`,
      'X-Deprecated-Endpoint': endpoint,
      'X-Successor-Endpoint': config.successor,
    };
  }

  /**
   * Get endpoint configuration
   */
  getEndpointConfig(endpoint: string): DeprecatedEndpoint | undefined {
    return DEPRECATED_ENDPOINTS.find(e => e.path === endpoint);
  }

  // ============================================================================
  // SHADOW COMPARE
  // ============================================================================

  /**
   * Record shadow compare result
   * Normalized diff with severity classification
   */
  recordShadowCompare(params: {
    endpoint: string;
    requestHash: string;
    legacyResult: unknown;
    unifiedResult: unknown;
  }): ShadowCompareResult {
    const diffs = this.findDiffWithSeverity(params.legacyResult, params.unifiedResult);
    const match = diffs.length === 0 || diffs.every(d => d.severity === 'NOISE');
    
    const result: ShadowCompareResult = {
      endpoint: params.endpoint,
      requestHash: params.requestHash,
      legacyResult: params.legacyResult,
      unifiedResult: params.unifiedResult,
      match,
      diff: diffs.length > 0 ? diffs : undefined,
      timestamp: new Date().toISOString(),
    };
    
    this.shadowResults.push(result);
    
    // Cleanup if too many
    if (this.shadowResults.length > this.MAX_SHADOW_RESULTS) {
      this.shadowResults = this.shadowResults.slice(-this.MAX_SHADOW_RESULTS / 2);
    }
    
    // Log based on severity
    const criticalDiffs = diffs.filter(d => d.severity === 'CRITICAL');
    const majorDiffs = diffs.filter(d => d.severity === 'MAJOR');
    
    if (criticalDiffs.length > 0) {
      this.logger.error(`[Deprecation] Shadow compare CRITICAL MISMATCH: ${params.endpoint}`, {
        requestHash: params.requestHash,
        criticalDiffs,
      });
    } else if (majorDiffs.length > 0) {
      this.logger.warn(`[Deprecation] Shadow compare MAJOR MISMATCH: ${params.endpoint}`, {
        requestHash: params.requestHash,
        majorDiffs,
      });
    } else if (!match) {
      this.logger.debug(`[Deprecation] Shadow compare minor diff: ${params.endpoint}`, {
        requestHash: params.requestHash,
        diffCount: diffs.length,
      });
    }
    
    return result;
  }

  /**
   * Get shadow compare stats with severity breakdown
   */
  getShadowStats(endpoint?: string): {
    total: number;
    matches: number;
    mismatches: number;
    matchRate: number;
    bySeverity: Record<string, number>;
    byCategory: Record<string, number>;
    recentMismatches: ShadowCompareResult[];
  } {
    const filtered = endpoint 
      ? this.shadowResults.filter(r => r.endpoint === endpoint)
      : this.shadowResults;
    
    const matches = filtered.filter(r => r.match).length;
    const mismatches = filtered.filter(r => !r.match);
    
    // Aggregate by severity and category
    const bySeverity: Record<string, number> = {};
    const byCategory: Record<string, number> = {};
    
    for (const result of filtered) {
      if (result.diff) {
        for (const d of result.diff) {
          bySeverity[d.severity] = (bySeverity[d.severity] || 0) + 1;
          byCategory[d.category] = (byCategory[d.category] || 0) + 1;
        }
      }
    }
    
    return {
      total: filtered.length,
      matches,
      mismatches: mismatches.length,
      matchRate: filtered.length > 0 ? matches / filtered.length : 1,
      bySeverity,
      byCategory,
      recentMismatches: mismatches.slice(-10),
    };
  }

  // ============================================================================
  // KILL SWITCH
  // ============================================================================

  /**
   * Check if kill switch is active (revert to legacy)
   */
  isKillSwitchActive(endpoint: string): boolean {
    return this.killSwitches.get(endpoint) || false;
  }

  /**
   * Activate kill switch (emergency revert)
   */
  activateKillSwitch(endpoint: string, reason: string): void {
    this.killSwitches.set(endpoint, true);
    this.logger.error(`[Deprecation] KILL SWITCH ACTIVATED: ${endpoint}`, { reason });
  }

  /**
   * Deactivate kill switch
   */
  deactivateKillSwitch(endpoint: string): void {
    this.killSwitches.delete(endpoint);
    this.logger.log(`[Deprecation] Kill switch deactivated: ${endpoint}`);
  }

  /**
   * Get all kill switch statuses
   */
  getKillSwitchStatuses(): Record<string, boolean> {
    const result: Record<string, boolean> = {};
    for (const ep of DEPRECATED_ENDPOINTS) {
      result[ep.path] = this.killSwitches.get(ep.path) || false;
    }
    return result;
  }

  // ============================================================================
  // DEPRECATION STATUS
  // ============================================================================

  /**
   * Should this endpoint return 410 Gone?
   */
  shouldReturn410(endpoint: string): boolean {
    const config = DEPRECATED_ENDPOINTS.find(e => e.path === endpoint);
    if (!config) return false;
    
    // Check if past sunset date
    const sunsetDate = new Date(config.sunsetDate);
    if (Date.now() > sunsetDate.getTime() && config.status === 'GONE') {
      return true;
    }
    
    return false;
  }

  /**
   * Should this endpoint redirect to successor?
   */
  shouldRedirect(endpoint: string): boolean {
    const config = DEPRECATED_ENDPOINTS.find(e => e.path === endpoint);
    return config?.status === 'REDIRECT';
  }

  /**
   * Update endpoint status
   */
  updateEndpointStatus(endpoint: string, status: DeprecatedEndpoint['status']): void {
    const config = DEPRECATED_ENDPOINTS.find(e => e.path === endpoint);
    if (config) {
      config.status = status;
      this.logger.log(`[Deprecation] Endpoint status updated: ${endpoint} → ${status}`);
    }
  }

  // ============================================================================
  // HELPERS
  // ============================================================================

  private deepEqual(a: unknown, b: unknown): boolean {
    if (a === b) return true;
    if (typeof a !== typeof b) return false;
    if (a === null || b === null) return a === b;
    
    if (typeof a === 'object' && typeof b === 'object') {
      const aKeys = Object.keys(a as object);
      const bKeys = Object.keys(b as object);
      
      if (aKeys.length !== bKeys.length) return false;
      
      for (const key of aKeys) {
        if (!this.deepEqual((a as any)[key], (b as any)[key])) {
          return false;
        }
      }
      
      return true;
    }
    
    return false;
  }

  /**
   * Find diffs with severity classification
   * Separates noise (rounding, ordering) from real regressions
   */
  private findDiffWithSeverity(a: unknown, b: unknown, path: string = ''): ShadowDiff[] {
    const diffs: ShadowDiff[] = [];
    
    if (typeof a !== typeof b) {
      diffs.push({
        path,
        legacyValue: a,
        unifiedValue: b,
        severity: 'MAJOR',
        category: 'VALUE',
      });
      return diffs;
    }
    
    if (a === null || b === null) {
      if (a !== b) {
        diffs.push({
          path,
          legacyValue: a,
          unifiedValue: b,
          severity: 'MAJOR',
          category: 'VALUE',
        });
      }
      return diffs;
    }
    
    // Number comparison with rounding tolerance
    if (typeof a === 'number' && typeof b === 'number') {
      if (a !== b) {
        const diff = Math.abs(a - b);
        const relDiff = Math.abs(a) > 0 ? diff / Math.abs(a) : diff;
        
        // Classify severity based on difference
        let severity: ShadowDiff['severity'];
        let category: ShadowDiff['category'];
        
        if (diff < 0.01) {
          // Sub-cent difference → noise (rounding)
          severity = 'NOISE';
          category = 'ROUNDING';
        } else if (relDiff < 0.001) {
          // < 0.1% relative difference → minor
          severity = 'MINOR';
          category = 'ROUNDING';
        } else if (relDiff < 0.01) {
          // < 1% relative difference → major
          severity = 'MAJOR';
          category = 'VALUE';
        } else {
          // > 1% relative difference → critical
          severity = 'CRITICAL';
          category = 'VALUE';
        }
        
        diffs.push({ path, legacyValue: a, unifiedValue: b, severity, category });
      }
      return diffs;
    }
    
    // String comparison
    if (typeof a === 'string' && typeof b === 'string') {
      if (a !== b) {
        // Check if it's just formatting difference
        const aNorm = a.toLowerCase().trim();
        const bNorm = b.toLowerCase().trim();
        
        if (aNorm === bNorm) {
          diffs.push({
            path,
            legacyValue: a,
            unifiedValue: b,
            severity: 'NOISE',
            category: 'FORMAT',
          });
        } else {
          diffs.push({
            path,
            legacyValue: a,
            unifiedValue: b,
            severity: 'MAJOR',
            category: 'VALUE',
          });
        }
      }
      return diffs;
    }
    
    // Array comparison
    if (Array.isArray(a) && Array.isArray(b)) {
      if (a.length !== b.length) {
        diffs.push({
          path,
          legacyValue: `length: ${a.length}`,
          unifiedValue: `length: ${b.length}`,
          severity: 'MAJOR',
          category: 'VALUE',
        });
      }
      
      // Check if same elements but different order
      const aStr = JSON.stringify([...a].sort());
      const bStr = JSON.stringify([...b].sort());
      
      if (aStr === bStr && JSON.stringify(a) !== JSON.stringify(b)) {
        diffs.push({
          path,
          legacyValue: 'order differs',
          unifiedValue: 'order differs',
          severity: 'NOISE',
          category: 'ORDERING',
        });
        return diffs;
      }
      
      // Element-by-element comparison
      const maxLen = Math.max(a.length, b.length);
      for (let i = 0; i < maxLen; i++) {
        diffs.push(...this.findDiffWithSeverity(a[i], b[i], `${path}[${i}]`));
      }
      
      return diffs;
    }
    
    // Object comparison
    if (typeof a === 'object' && typeof b === 'object') {
      const aObj = a as Record<string, unknown>;
      const bObj = b as Record<string, unknown>;
      const allKeys = new Set([...Object.keys(aObj), ...Object.keys(bObj)]);
      
      for (const key of allKeys) {
        const newPath = path ? `${path}.${key}` : key;
        
        if (!(key in aObj)) {
          // Check if it's a policy-related field
          const isPolicyField = ['policy', 'gate', 'warning', 'softWarning'].some(
            p => key.toLowerCase().includes(p)
          );
          
          diffs.push({
            path: newPath,
            legacyValue: undefined,
            unifiedValue: bObj[key],
            severity: isPolicyField ? 'CRITICAL' : 'MINOR',
            category: isPolicyField ? 'POLICY' : 'MISSING',
          });
        } else if (!(key in bObj)) {
          diffs.push({
            path: newPath,
            legacyValue: aObj[key],
            unifiedValue: undefined,
            severity: 'MINOR',
            category: 'MISSING',
          });
        } else {
          diffs.push(...this.findDiffWithSeverity(aObj[key], bObj[key], newPath));
        }
      }
      
      return diffs;
    }
    
    if (a !== b) {
      diffs.push({
        path,
        legacyValue: a,
        unifiedValue: b,
        severity: 'MAJOR',
        category: 'VALUE',
      });
    }
    
    return diffs;
  }

  private findDiff(a: unknown, b: unknown, path: string = ''): string[] {
    // Legacy method - convert to string array for backward compatibility
    const diffs = this.findDiffWithSeverity(a, b, path);
    return diffs.map(d => `${d.path}: ${JSON.stringify(d.legacyValue)} vs ${JSON.stringify(d.unifiedValue)} [${d.severity}]`);
  }

  private cleanup(): void {
    const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    this.trafficRecords = this.trafficRecords.filter(r => r.timestamp > oneWeekAgo);
    
    // Keep only recent shadow results
    if (this.shadowResults.length > this.MAX_SHADOW_RESULTS / 2) {
      this.shadowResults = this.shadowResults.slice(-this.MAX_SHADOW_RESULTS / 2);
    }
  }

  /**
   * Reset all state (for testing)
   */
  reset(): void {
    this.trafficRecords = [];
    this.shadowResults = [];
    this.killSwitches.clear();
  }
}
