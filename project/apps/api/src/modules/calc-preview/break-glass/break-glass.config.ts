/**
 * Break-Glass Configuration
 * 
 * Configuration for the break-glass access system.
 * Includes kill switch, timing, circuit breaker, and network settings.
 */

import { Injectable } from '@nestjs/common';

/**
 * Break-glass configuration interface
 */
export interface BreakGlassConfig {
  /** Kill switch - when false, all internal-ops endpoints return 503 */
  enabled: boolean;
  
  /** Network restrictions */
  network: {
    /** Allowed CIDR ranges */
    allowedCidrs: string[];
    /** Require mTLS */
    requireMtls: boolean;
  };
  
  /** Timing configuration */
  timing: {
    /** Request TTL in minutes (approval window) */
    requestTtlMinutes: number;
    /** Grant TTL in minutes */
    grantTtlMinutes: number;
    /** Maximum renewals allowed */
    maxRenewals: number;
    /** Post-mortem deadline in hours */
    postMortemDeadlineHours: number;
  };
  
  /** Circuit breaker configuration */
  circuitBreaker: {
    /** Window size in minutes */
    windowMinutes: number;
    /** Maximum grants per window */
    maxGrantsPerWindow: number;
  };
  
  /** Audit configuration */
  audit: {
    /** Log level */
    logLevel: 'FULL' | 'SUMMARY';
    /** Retention in days */
    retentionDays: number;
  };
  
  /** Token configuration */
  token: {
    /** Issuer for break-glass tokens */
    issuer: string;
    /** Audience for break-glass tokens */
    audience: string;
    /** Secret for signing (should be different from user JWT secret) */
    secret: string;
  };
}

/**
 * Default configuration
 */
export const DEFAULT_BREAK_GLASS_CONFIG: BreakGlassConfig = {
  enabled: true,
  network: {
    allowedCidrs: ['10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16', '127.0.0.1/32'],
    requireMtls: false,
  },
  timing: {
    requestTtlMinutes: 30,
    grantTtlMinutes: 15,
    maxRenewals: 3,
    postMortemDeadlineHours: 48,
  },
  circuitBreaker: {
    windowMinutes: 60,
    maxGrantsPerWindow: 10,
  },
  audit: {
    logLevel: 'FULL',
    retentionDays: 2555, // ~7 years
  },
  token: {
    issuer: 'break-glass-authority',
    audience: 'internal-ops',
    secret: 'change-this-in-production',
  },
};

/**
 * Parse boolean from environment variable
 */
function parseBoolean(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined) return defaultValue;
  return value.toLowerCase() === 'true' || value === '1';
}

/**
 * Parse number from environment variable
 */
function parseNumber(value: string | undefined, defaultValue: number): number {
  if (value === undefined) return defaultValue;
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

/**
 * Parse CIDR list from environment variable
 */
function parseCidrList(value: string | undefined, defaultValue: string[]): string[] {
  if (value === undefined) return defaultValue;
  return value.split(',').map(s => s.trim()).filter(s => s.length > 0);
}

/**
 * Load configuration from environment variables
 */
export function loadBreakGlassConfig(): BreakGlassConfig {
  return {
    enabled: parseBoolean(process.env.BREAK_GLASS_ENABLED, DEFAULT_BREAK_GLASS_CONFIG.enabled),
    
    network: {
      allowedCidrs: parseCidrList(
        process.env.BREAK_GLASS_ALLOWED_CIDRS,
        DEFAULT_BREAK_GLASS_CONFIG.network.allowedCidrs,
      ),
      requireMtls: parseBoolean(
        process.env.BREAK_GLASS_REQUIRE_MTLS,
        DEFAULT_BREAK_GLASS_CONFIG.network.requireMtls,
      ),
    },
    
    timing: {
      requestTtlMinutes: parseNumber(
        process.env.BREAK_GLASS_REQUEST_TTL_MINUTES,
        DEFAULT_BREAK_GLASS_CONFIG.timing.requestTtlMinutes,
      ),
      grantTtlMinutes: parseNumber(
        process.env.BREAK_GLASS_GRANT_TTL_MINUTES,
        DEFAULT_BREAK_GLASS_CONFIG.timing.grantTtlMinutes,
      ),
      maxRenewals: parseNumber(
        process.env.BREAK_GLASS_MAX_RENEWALS,
        DEFAULT_BREAK_GLASS_CONFIG.timing.maxRenewals,
      ),
      postMortemDeadlineHours: parseNumber(
        process.env.BREAK_GLASS_POSTMORTEM_DEADLINE_HOURS,
        DEFAULT_BREAK_GLASS_CONFIG.timing.postMortemDeadlineHours,
      ),
    },
    
    circuitBreaker: {
      windowMinutes: parseNumber(
        process.env.BREAK_GLASS_CB_WINDOW_MINUTES,
        DEFAULT_BREAK_GLASS_CONFIG.circuitBreaker.windowMinutes,
      ),
      maxGrantsPerWindow: parseNumber(
        process.env.BREAK_GLASS_CB_MAX_GRANTS,
        DEFAULT_BREAK_GLASS_CONFIG.circuitBreaker.maxGrantsPerWindow,
      ),
    },
    
    audit: {
      logLevel: (process.env.BREAK_GLASS_AUDIT_LOG_LEVEL as 'FULL' | 'SUMMARY') ||
        DEFAULT_BREAK_GLASS_CONFIG.audit.logLevel,
      retentionDays: parseNumber(
        process.env.BREAK_GLASS_AUDIT_RETENTION_DAYS,
        DEFAULT_BREAK_GLASS_CONFIG.audit.retentionDays,
      ),
    },
    
    token: {
      issuer: process.env.BREAK_GLASS_TOKEN_ISSUER ||
        DEFAULT_BREAK_GLASS_CONFIG.token.issuer,
      audience: process.env.BREAK_GLASS_TOKEN_AUDIENCE ||
        DEFAULT_BREAK_GLASS_CONFIG.token.audience,
      secret: process.env.BREAK_GLASS_TOKEN_SECRET ||
        DEFAULT_BREAK_GLASS_CONFIG.token.secret,
    },
  };
}

/**
 * Injectable configuration service
 */
@Injectable()
export class BreakGlassConfigService {
  private readonly config: BreakGlassConfig;

  constructor() {
    this.config = loadBreakGlassConfig();
    
    // Warn about insecure defaults in production
    if (process.env.NODE_ENV === 'production') {
      if (this.config.token.secret === DEFAULT_BREAK_GLASS_CONFIG.token.secret) {
        console.error('SECURITY: Using default break-glass token secret in production!');
      }
    }
  }

  get(): BreakGlassConfig {
    return this.config;
  }

  isEnabled(): boolean {
    return this.config.enabled;
  }

  getNetworkConfig() {
    return this.config.network;
  }

  getTimingConfig() {
    return this.config.timing;
  }

  getCircuitBreakerConfig() {
    return this.config.circuitBreaker;
  }

  getAuditConfig() {
    return this.config.audit;
  }

  getTokenConfig() {
    return this.config.token;
  }
}
