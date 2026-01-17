/**
 * Phase 5.7 - Environment Flags Registry
 * 
 * TEK KAYNAK: Tüm env flag'ler buradan okunmalı.
 * process.env doğrudan kullanımı YASAK.
 * 
 * @see docs/single-source-of-truth-architecture.md - Phase 5.7
 */

// ============================================================================
// ENV FLAG DEFINITIONS
// ============================================================================

export interface EnvFlagDefinition {
  name: string;
  description: string;
  defaultValue: string | boolean | number | undefined;
  allowedInProd: boolean;
  usedBy: string[];
}

/**
 * Tüm env flag'lerin merkezi kaydı
 */
export const ENV_FLAG_REGISTRY: EnvFlagDefinition[] = [
  // ─────────────────────────────────────────────────────────────────────────
  // PRODUCTION FLAGS (prod'da kullanılabilir)
  // ─────────────────────────────────────────────────────────────────────────
  {
    name: 'NODE_ENV',
    description: 'Runtime environment',
    defaultValue: 'development',
    allowedInProd: true,
    usedBy: ['chaos.module', 'interest-engine.module', 'validation-gate.service'],
  },
  {
    name: 'SERVICE_VERSION',
    description: 'Service version for trace metadata',
    defaultValue: '1.0.0',
    allowedInProd: true,
    usedBy: ['trace-context'],
  },
  {
    name: 'GIT_COMMIT',
    description: 'Git commit hash for trace metadata',
    defaultValue: undefined,
    allowedInProd: true,
    usedBy: ['trace-context'],
  },
  {
    name: 'BUILD_NUMBER',
    description: 'CI build number for trace metadata',
    defaultValue: undefined,
    allowedInProd: true,
    usedBy: ['trace-context'],
  },
  {
    name: 'INTERNAL_API_KEY',
    description: 'API key for internal service authentication',
    defaultValue: undefined,
    allowedInProd: true,
    usedBy: ['calc-preview-rate-limit.guard'],
  },
  {
    name: 'TCMB_EVDS_API_KEY',
    description: 'TCMB EVDS API key for rate sync',
    defaultValue: undefined,
    allowedInProd: true,
    usedBy: ['rate-sync.service'],
  },
  {
    name: 'AUDIT_WRITER',
    description: 'Audit writer type (prisma | memory)',
    defaultValue: 'prisma',
    allowedInProd: true,
    usedBy: ['interest-engine.module'],
  },
  {
    name: 'JWT_SECRET',
    description: 'JWT signing secret',
    defaultValue: undefined, // MUST be set in prod
    allowedInProd: true,
    usedBy: ['portal.module'],
  },
  {
    name: 'CORS_ORIGIN',
    description: 'Allowed CORS origins (comma-separated)',
    defaultValue: 'http://localhost:3000',
    allowedInProd: true,
    usedBy: ['main'],
  },
  {
    name: 'PORT',
    description: 'Server port',
    defaultValue: 8080,
    allowedInProd: true,
    usedBy: ['main'],
  },
  {
    name: 'FRONTEND_URL',
    description: 'Frontend URL for email links',
    defaultValue: 'http://localhost:3000',
    allowedInProd: true,
    usedBy: ['automation.service'],
  },
  {
    name: 'UETS_API_URL',
    description: 'UETS API URL',
    defaultValue: 'https://uets.gov.tr/api',
    allowedInProd: true,
    usedBy: ['uets.service'],
  },
  {
    name: 'KEP_API_URL',
    description: 'KEP API URL',
    defaultValue: 'https://kep.gov.tr/api',
    allowedInProd: true,
    usedBy: ['uets.service'],
  },
  
  // ─────────────────────────────────────────────────────────────────────────
  // TEST-ONLY FLAGS (prod'da YASAK)
  // ─────────────────────────────────────────────────────────────────────────
  {
    name: 'ENABLE_CHAOS_ENDPOINTS',
    description: 'Enable chaos/fault injection endpoints',
    defaultValue: false,
    allowedInProd: false, // ⚠️ PROD'DA YASAK
    usedBy: ['chaos.module', 'fault-injector.service'],
  },
  {
    name: 'USER',
    description: 'Current user (for baseline generation)',
    defaultValue: 'unknown',
    allowedInProd: false, // Test-only
    usedBy: ['regression-runner'],
  },
];

// ============================================================================
// ENV CONFIG SERVICE
// ============================================================================

/**
 * Type-safe environment configuration
 */
export interface EnvConfig {
  // Production flags
  nodeEnv: 'development' | 'test' | 'production';
  serviceVersion: string;
  gitCommit?: string;
  buildNumber?: string;
  internalApiKey?: string;
  tcmbEvdsApiKey?: string;
  auditWriter: 'prisma' | 'memory';
  jwtSecret?: string;
  corsOrigin: string[];
  port: number;
  frontendUrl: string;
  uetsApiUrl: string;
  kepApiUrl: string;
  
  // Test-only flags
  enableChaosEndpoints: boolean;
}

/**
 * Load environment configuration with validation
 */
export function loadEnvConfig(): EnvConfig {
  const nodeEnv = (process.env.NODE_ENV || 'development') as EnvConfig['nodeEnv'];
  const isProduction = nodeEnv === 'production';
  
  // Validate test-only flags in production
  if (isProduction) {
    if (process.env.ENABLE_CHAOS_ENDPOINTS === 'true') {
      throw new Error('ENABLE_CHAOS_ENDPOINTS cannot be true in production!');
    }
  }
  
  return {
    nodeEnv,
    serviceVersion: process.env.SERVICE_VERSION || '1.0.0',
    gitCommit: process.env.GIT_COMMIT,
    buildNumber: process.env.BUILD_NUMBER,
    internalApiKey: process.env.INTERNAL_API_KEY,
    tcmbEvdsApiKey: process.env.TCMB_EVDS_API_KEY,
    auditWriter: (process.env.AUDIT_WRITER || 'prisma') as 'prisma' | 'memory',
    jwtSecret: process.env.JWT_SECRET,
    corsOrigin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:3000'],
    port: parseInt(process.env.PORT || '8080', 10),
    frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',
    uetsApiUrl: process.env.UETS_API_URL || 'https://uets.gov.tr/api',
    kepApiUrl: process.env.KEP_API_URL || 'https://kep.gov.tr/api',
    enableChaosEndpoints: process.env.ENABLE_CHAOS_ENDPOINTS === 'true',
  };
}

/**
 * Singleton instance
 */
let envConfigInstance: EnvConfig | null = null;

export function getEnvConfig(): EnvConfig {
  if (!envConfigInstance) {
    envConfigInstance = loadEnvConfig();
  }
  return envConfigInstance;
}

/**
 * Reset config (for testing)
 */
export function resetEnvConfig(): void {
  envConfigInstance = null;
}

// ============================================================================
// VALIDATION
// ============================================================================

/**
 * Validate environment configuration
 */
export function validateEnvConfig(config: EnvConfig): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  // Production-specific validations
  if (config.nodeEnv === 'production') {
    if (!config.jwtSecret) {
      errors.push('JWT_SECRET must be set in production');
    }
    
    if (config.enableChaosEndpoints) {
      errors.push('ENABLE_CHAOS_ENDPOINTS must be false in production');
    }
    
    if (config.corsOrigin.includes('http://localhost:3000')) {
      errors.push('CORS_ORIGIN should not include localhost in production');
    }
  }
  
  return {
    valid: errors.length === 0,
    errors,
  };
}

// ============================================================================
// ENV FLAG TABLE (for documentation)
// ============================================================================

/**
 * Generate markdown table of env flags
 */
export function generateEnvFlagTable(): string {
  const lines: string[] = [
    '| Flag | Description | Default | Prod? | Used By |',
    '|------|-------------|---------|-------|---------|',
  ];
  
  for (const flag of ENV_FLAG_REGISTRY) {
    const prodIcon = flag.allowedInProd ? '✅' : '❌';
    const defaultStr = flag.defaultValue === undefined ? '-' : String(flag.defaultValue);
    lines.push(`| ${flag.name} | ${flag.description} | ${defaultStr} | ${prodIcon} | ${flag.usedBy.join(', ')} |`);
  }
  
  return lines.join('\n');
}
