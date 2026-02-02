/**
 * Evidence Bundle Module
 * 
 * Phase 9C - Task 0: Foundation Gates
 * 
 * NestJS module for S3/MinIO evidence bundle storage.
 * 
 * CRITICAL RULES:
 * - EVIDENCE_BUNDLE_S3_ENABLED=false → Module NOT loaded (not 503 stub)
 * - EVIDENCE_BUNDLE_S3_ENABLED=true → All S3 config required, fail-fast validation
 * - Startup log: endpoint + bucket + forcePathStyle (NEVER credentials)
 * - If flag disabled and service called → EvidenceBundleDisabledError
 * 
 * @see .kiro/specs/phase-9c-object-storage-migration/PHASE-9C-IMPLEMENTATION-CHECKLIST.md
 */

import { Module, DynamicModule, Logger, OnModuleInit } from '@nestjs/common';
import {
  isEvidenceBundleS3Enabled,
  validateObjectStoreConfig,
  getObjectStoreLogMessage,
  ObjectStoreConfig,
  EVIDENCE_BUNDLE_FEATURE_FLAG,
} from './object-store.config';
import { MinioObjectStoreClient } from './minio-object-store.client';
import {
  OBJECT_STORE_CLIENT,
  OBJECT_STORE_CONFIG,
  EvidenceBundleDisabledError,
} from './evidence-bundle.tokens';
import { IObjectStoreClient } from './object-store.interface';

// ============================================================================
// Module Configuration
// ============================================================================

const bootLogger = new Logger('EvidenceBundleModule:Boot');

/**
 * Evidence Bundle Module
 * 
 * Use EvidenceBundleModule.forRoot() to conditionally load based on feature flag.
 * 
 * When EVIDENCE_BUNDLE_S3_ENABLED=false:
 * - Module returns empty providers
 * - OBJECT_STORE_CLIENT token is NOT available
 * - Any attempt to inject OBJECT_STORE_CLIENT will fail at DI resolution
 * 
 * When EVIDENCE_BUNDLE_S3_ENABLED=true:
 * - Config validation runs at module load (fail-fast)
 * - MinioObjectStoreClient is provided
 * - Startup log shows endpoint + bucket (never credentials)
 */
@Module({})
export class EvidenceBundleModule implements OnModuleInit {
  private static config: ObjectStoreConfig | null = null;
  private static enabled = false;

  /**
   * Create module with conditional loading based on feature flag.
   * 
   * @param env Environment variables (default: process.env)
   * @returns Dynamic module configuration
   */
  static forRoot(env: Record<string, string | undefined> = process.env): DynamicModule {
    const enabled = isEvidenceBundleS3Enabled(env);
    EvidenceBundleModule.enabled = enabled;
    
    // Log feature flag status at boot time
    bootLogger.log(`[EvidenceBundleModule] ${EVIDENCE_BUNDLE_FEATURE_FLAG}=${enabled}`);
    
    if (!enabled) {
      bootLogger.log('[EvidenceBundleModule] Feature DISABLED - module will not provide S3 client');
      return {
        module: EvidenceBundleModule,
        providers: [],
        exports: [],
      };
    }
    
    // Validate config (fail-fast if invalid)
    const config = validateObjectStoreConfig(env);
    if (!config) {
      // This should never happen since enabled=true
      throw new Error('Config validation returned null despite feature being enabled');
    }
    
    EvidenceBundleModule.config = config;
    
    // Log startup info (NEVER credentials)
    bootLogger.log(getObjectStoreLogMessage(enabled, config));
    
    return {
      module: EvidenceBundleModule,
      providers: [
        // Config provider
        {
          provide: OBJECT_STORE_CONFIG,
          useValue: config,
        },
        // MinIO client provider
        {
          provide: MinioObjectStoreClient,
          useFactory: (cfg: ObjectStoreConfig) => new MinioObjectStoreClient(cfg),
          inject: [OBJECT_STORE_CONFIG],
        },
        // Interface token → implementation
        {
          provide: OBJECT_STORE_CLIENT,
          useExisting: MinioObjectStoreClient,
        },
      ],
      exports: [
        OBJECT_STORE_CLIENT,
        OBJECT_STORE_CONFIG,
      ],
    };
  }

  /**
   * Check if feature is enabled (for conditional imports in other modules)
   */
  static isEnabled(): boolean {
    return EvidenceBundleModule.enabled;
  }

  /**
   * Get config (for testing/debugging)
   */
  static getConfig(): ObjectStoreConfig | null {
    return EvidenceBundleModule.config;
  }

  async onModuleInit(): Promise<void> {
    const logger = new Logger(EvidenceBundleModule.name);
    
    if (!EvidenceBundleModule.enabled) {
      logger.log('[EvidenceBundleModule] Module initialized (DISABLED mode)');
      return;
    }
    
    logger.log('[EvidenceBundleModule] Module initialized (ENABLED mode)');
    logger.log(`[EvidenceBundleModule] Bucket: ${EvidenceBundleModule.config?.bucket}`);
  }
}

// ============================================================================
// Null Guard Service
// ============================================================================

/**
 * Null guard for when feature is disabled.
 * 
 * This service throws EvidenceBundleDisabledError on any method call.
 * Use this as a fallback when you need to handle disabled state gracefully.
 * 
 * NOTE: Prefer NOT loading the module at all (forRoot pattern) over using this guard.
 */
export class NullObjectStoreClient implements IObjectStoreClient {
  private throwDisabled(): never {
    throw new EvidenceBundleDisabledError();
  }

  async putObject(): Promise<never> {
    this.throwDisabled();
  }

  async putWriteOnce(): Promise<never> {
    this.throwDisabled();
  }

  async headObject(): Promise<never> {
    this.throwDisabled();
  }

  async getObject(): Promise<never> {
    this.throwDisabled();
  }

  async getObjectStream(): Promise<never> {
    this.throwDisabled();
  }

  async putObjectTagging(): Promise<never> {
    this.throwDisabled();
  }

  async deleteObject(): Promise<never> {
    this.throwDisabled();
  }

  async deleteObjects(): Promise<never> {
    this.throwDisabled();
  }
}
