/**
 * Object Store Configuration
 * 
 * Phase 9C - Task 0: Foundation Gates
 * 
 * Environment-based configuration for S3/MinIO object storage.
 * 
 * RULES:
 * - EVIDENCE_BUNDLE_S3_ENABLED=false → S3 config not required
 * - EVIDENCE_BUNDLE_S3_ENABLED=true → all S3 config required
 * - Validation runs at module load time (fail-fast)
 * 
 * @see .kiro/specs/phase-9c-object-storage-migration/PHASE-9C-IMPLEMENTATION-CHECKLIST.md
 */

import { z } from 'zod';

// ============================================================================
// Feature Flag
// ============================================================================

export const EVIDENCE_BUNDLE_FEATURE_FLAG = 'EVIDENCE_BUNDLE_S3_ENABLED';

/**
 * Check if evidence bundle S3 feature is enabled.
 * 
 * Default: disabled (false)
 * Enabled only when env var is explicitly 'true'
 */
export function isEvidenceBundleS3Enabled(env: Record<string, string | undefined> = process.env): boolean {
  const value = env[EVIDENCE_BUNDLE_FEATURE_FLAG];
  return value === 'true';
}

// ============================================================================
// Configuration Schema
// ============================================================================

/**
 * S3/MinIO configuration schema (Zod)
 * 
 * All fields required when feature is enabled.
 */
export const ObjectStoreConfigSchema = z.object({
  /** S3/MinIO endpoint URL */
  endpoint: z.string().url('S3_ENDPOINT must be a valid URL'),
  
  /** Bucket name */
  bucket: z.string().min(1, 'S3_BUCKET is required'),
  
  /** AWS region (MinIO accepts any value) */
  region: z.string().min(1, 'S3_REGION is required'),
  
  /** Access key ID */
  accessKeyId: z.string().min(1, 'S3_ACCESS_KEY is required'),
  
  /** Secret access key */
  secretAccessKey: z.string().min(1, 'S3_SECRET_KEY is required'),
  
  /** Force path-style URLs (required for MinIO) */
  forcePathStyle: z.boolean().default(true),
  
  /** Key prefix for bundle objects */
  keyPrefix: z.string().default('tenants'),
  
  /** Allow insecure TLS (local MinIO only) */
  tlsInsecure: z.boolean().default(false),
});

export type ObjectStoreConfig = z.infer<typeof ObjectStoreConfigSchema>;

// ============================================================================
// Configuration Loader
// ============================================================================

/**
 * Configuration validation error
 */
export class ObjectStoreConfigError extends Error {
  readonly code = 'OBJECT_STORE_CONFIG_ERROR';
  
  constructor(message: string, public readonly details?: z.ZodError) {
    super(message);
    this.name = 'ObjectStoreConfigError';
  }
}

/**
 * Load and validate object store configuration from environment.
 * 
 * @param env Environment variables
 * @returns Validated configuration
 * @throws ObjectStoreConfigError if validation fails
 */
export function loadObjectStoreConfig(
  env: Record<string, string | undefined> = process.env,
): ObjectStoreConfig {
  // Parse boolean values
  const forcePathStyle = env.S3_FORCE_PATH_STYLE !== 'false';
  const tlsInsecure = env.S3_TLS_INSECURE === 'true';
  
  const rawConfig = {
    endpoint: env.S3_ENDPOINT,
    bucket: env.S3_BUCKET,
    region: env.S3_REGION || 'us-east-1',
    accessKeyId: env.S3_ACCESS_KEY,
    secretAccessKey: env.S3_SECRET_KEY,
    forcePathStyle,
    keyPrefix: env.BUNDLE_KEY_PREFIX || 'tenants',
    tlsInsecure,
  };
  
  const result = ObjectStoreConfigSchema.safeParse(rawConfig);
  
  if (!result.success) {
    const issues = result.error.issues
      .map(i => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    
    throw new ObjectStoreConfigError(
      `Invalid object store configuration:\n${issues}\n\n` +
      `Required environment variables when EVIDENCE_BUNDLE_S3_ENABLED=true:\n` +
      `  S3_ENDPOINT - S3/MinIO endpoint URL (e.g., http://localhost:9000)\n` +
      `  S3_BUCKET - Bucket name\n` +
      `  S3_REGION - AWS region (any value for MinIO)\n` +
      `  S3_ACCESS_KEY - Access key ID\n` +
      `  S3_SECRET_KEY - Secret access key\n` +
      `Optional:\n` +
      `  S3_FORCE_PATH_STYLE - Use path-style URLs (default: true for MinIO)\n` +
      `  BUNDLE_KEY_PREFIX - Key prefix (default: tenants)\n` +
      `  S3_TLS_INSECURE - Allow insecure TLS (default: false)`,
      result.error,
    );
  }
  
  return result.data;
}

/**
 * Validate configuration if feature is enabled.
 * 
 * Call this at module load time for fail-fast behavior.
 * 
 * @param env Environment variables
 * @returns Configuration if enabled, null if disabled
 * @throws ObjectStoreConfigError if enabled but config invalid
 */
export function validateObjectStoreConfig(
  env: Record<string, string | undefined> = process.env,
): ObjectStoreConfig | null {
  if (!isEvidenceBundleS3Enabled(env)) {
    return null;
  }
  
  return loadObjectStoreConfig(env);
}

// ============================================================================
// Logging Helpers
// ============================================================================

/**
 * Get startup log message for object store configuration.
 * 
 * SECURITY: Never log credentials.
 */
export function getObjectStoreLogMessage(
  enabled: boolean,
  config: ObjectStoreConfig | null,
): string {
  if (!enabled || !config) {
    return `Evidence Bundle S3: DISABLED (${EVIDENCE_BUNDLE_FEATURE_FLAG}=false)`;
  }
  
  return (
    `Evidence Bundle S3: ENABLED\n` +
    `  Endpoint: ${config.endpoint}\n` +
    `  Bucket: ${config.bucket}\n` +
    `  Region: ${config.region}\n` +
    `  ForcePathStyle: ${config.forcePathStyle}\n` +
    `  KeyPrefix: ${config.keyPrefix}`
  );
}
