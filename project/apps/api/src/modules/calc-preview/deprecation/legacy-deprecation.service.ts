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
  diff?: string[];
  timestamp: string;
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
   */
  recordShadowCompare(params: {
    endpoint: string;
    requestHash: string;
    legacyResult: unknown;
    unifiedResult: unknown;
  }): ShadowCompareResult {
    const match = this.deepEqual(params.legacyResult, params.unifiedResult);
    const diff = match ? undefined : this.findDiff(params.legacyResult, params.unifiedResult);
    
    const result: ShadowCompareResult = {
      endpoint: params.endpoint,
      requestHash: params.requestHash,
      legacyResult: params.legacyResult,
      unifiedResult: params.unifiedResult,
      match,
      diff,
      timestamp: new Date().toISOString(),
    };
    
    this.shadowResults.push(result);
    
    // Cleanup if too many
    if (this.shadowResults.length > this.MAX_SHADOW_RESULTS) {
      this.shadowResults = this.shadowResults.slice(-this.MAX_SHADOW_RESULTS / 2);
    }
    
    if (!match) {
      this.logger.warn(`[Deprecation] Shadow compare MISMATCH: ${params.endpoint}`, {
        requestHash: params.requestHash,
        diff,
      });
    }
    
    return result;
  }

  /**
   * Get shadow compare stats
   */
  getShadowStats(endpoint?: string): {
    total: number;
    matches: number;
    mismatches: number;
    matchRate: number;
    recentMismatches: ShadowCompareResult[];
  } {
    const filtered = endpoint 
      ? this.shadowResults.filter(r => r.endpoint === endpoint)
      : this.shadowResults;
    
    const matches = filtered.filter(r => r.match).length;
    const mismatches = filtered.filter(r => !r.match);
    
    return {
      total: filtered.length,
      matches,
      mismatches: mismatches.length,
      matchRate: filtered.length > 0 ? matches / filtered.length : 1,
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

  private findDiff(a: unknown, b: unknown, path: string = ''): string[] {
    const diffs: string[] = [];
    
    if (typeof a !== typeof b) {
      diffs.push(`${path}: type mismatch (${typeof a} vs ${typeof b})`);
      return diffs;
    }
    
    if (a === null || b === null) {
      if (a !== b) {
        diffs.push(`${path}: ${a} vs ${b}`);
      }
      return diffs;
    }
    
    if (typeof a === 'object' && typeof b === 'object') {
      const aObj = a as Record<string, unknown>;
      const bObj = b as Record<string, unknown>;
      const allKeys = new Set([...Object.keys(aObj), ...Object.keys(bObj)]);
      
      for (const key of allKeys) {
        const newPath = path ? `${path}.${key}` : key;
        
        if (!(key in aObj)) {
          diffs.push(`${newPath}: missing in legacy`);
        } else if (!(key in bObj)) {
          diffs.push(`${newPath}: missing in unified`);
        } else {
          diffs.push(...this.findDiff(aObj[key], bObj[key], newPath));
        }
      }
      
      return diffs;
    }
    
    if (a !== b) {
      diffs.push(`${path}: ${JSON.stringify(a)} vs ${JSON.stringify(b)}`);
    }
    
    return diffs;
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
