/**
 * Truth Layer Module
 * 
 * Phase 9B.5 - Snapshot Store Interface Cutover
 * 
 * NestJS module for Truth Layer persistence.
 * Wires Prisma repositories to store services.
 * 
 * LOCKED RULES:
 * - onModuleInit: SELECT 1 health check - fail fast if DB unavailable
 * - NO in-memory fallback - DB down = system down
 * - All invariants enforced in repository layer
 * - Prod path uses SNAPSHOT_STORE token (InMemorySnapshotStore FORBIDDEN)
 * - Production Safety Gate: inmemory + production/staging = HARD FAIL
 * 
 * @see snapshot-store-backend.ts for production safety gate implementation
 */

import { Module, OnModuleInit, Logger } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';

// Repositories
import { PrismaSimulationRunRepository } from './prisma-simulation-run.repository';
import { PrismaSnapshotRepository } from './prisma-snapshot.repository';

// Store Services
import {
  SimulationRunStoreService,
  SIMULATION_RUN_REPOSITORY,
} from '../simulation-api/simulation-run-store.service';
import {
  SnapshotStoreService,
  SNAPSHOT_REPOSITORY,
} from './snapshot-store.service';

// Store Interface (Phase 9B.5)
import { SNAPSHOT_STORE } from './snapshot-store.interface';

// Errors
import { DatabaseUnavailableError } from './truth-layer-errors';

// Production Safety Gate (Phase 9B.5 - Task 2)
import {
  resolveSnapshotStoreBackend,
  getBackendLogMessage,
  SnapshotStoreBackend,
  AppEnvironment,
} from './snapshot-store-backend';

// ============================================================================
// Production Safety Gate - Boot-time Enforcement
// ============================================================================

/**
 * Resolve backend at module load time.
 * 
 * CRITICAL: This runs BEFORE module instantiation.
 * If configuration is invalid, the application will NOT start.
 * 
 * This is the PRIMARY gate - InMemory is FORBIDDEN in production/staging.
 */
const RESOLVED_BACKEND: SnapshotStoreBackend = resolveSnapshotStoreBackend(process.env);
const RESOLVED_APP_ENV: AppEnvironment = (process.env.APP_ENV?.toLowerCase() || 'development') as AppEnvironment;

// Log at module load time (before DI)
const bootLogger = new Logger('TruthLayerModule:Boot');
bootLogger.log(getBackendLogMessage(RESOLVED_BACKEND, RESOLVED_APP_ENV));

// ============================================================================
// Module Configuration
// ============================================================================

@Module({
  providers: [
    // Prisma Service (should be provided by PrismaModule, but we ensure it's available)
    PrismaService,
    
    // Repositories
    PrismaSimulationRunRepository,
    PrismaSnapshotRepository,
    
    // Repository injection tokens
    {
      provide: SIMULATION_RUN_REPOSITORY,
      useExisting: PrismaSimulationRunRepository,
    },
    {
      provide: SNAPSHOT_REPOSITORY,
      useExisting: PrismaSnapshotRepository,
    },
    
    // Store Services
    SimulationRunStoreService,
    SnapshotStoreService,
    
    // Phase 9B.5: SNAPSHOT_STORE token → SnapshotStoreService (PostgreSQL)
    // This is the ONLY token that consumers should inject
    // InMemorySnapshotStore is FORBIDDEN in prod paths
    // Production Safety Gate ensures this at boot time
    {
      provide: SNAPSHOT_STORE,
      useExisting: SnapshotStoreService,
    },
  ],
  exports: [
    // Export store services for use by other modules
    SimulationRunStoreService,
    SnapshotStoreService,
    
    // Phase 9B.5: Export SNAPSHOT_STORE token for consumer injection
    SNAPSHOT_STORE,
    
    // Export repositories for direct access if needed
    SIMULATION_RUN_REPOSITORY,
    SNAPSHOT_REPOSITORY,
  ],
})
export class TruthLayerModule implements OnModuleInit {
  private readonly logger = new Logger(TruthLayerModule.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Fail-fast health check on module initialization
   * 
   * LOCKED: If PostgreSQL is unavailable, the application MUST NOT start.
   * There is NO in-memory fallback for the Truth Layer.
   * 
   * Production Safety Gate has already validated backend selection at boot time.
   */
  async onModuleInit(): Promise<void> {
    // Log resolved backend configuration
    this.logger.log(
      `[TruthLayerModule] Initializing with backend=${RESOLVED_BACKEND} (APP_ENV=${RESOLVED_APP_ENV})`,
    );
    
    // Skip DB check if using inmemory (only allowed in dev/test)
    if (RESOLVED_BACKEND === 'inmemory') {
      this.logger.warn(
        '[TruthLayerModule] Using InMemory backend - data will NOT persist across restarts!',
      );
      return;
    }
    
    this.logger.log('[TruthLayerModule] Checking PostgreSQL connection...');
    
    try {
      // Simple health check query
      await this.prisma.$queryRaw`SELECT 1`;
      
      this.logger.log('[TruthLayerModule] PostgreSQL connection verified ✓');
      this.logger.log(
        `[TruthLayerModule] ✓ ${getBackendLogMessage(RESOLVED_BACKEND, RESOLVED_APP_ENV)}`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      
      this.logger.error(
        '[TruthLayerModule] FATAL: PostgreSQL unavailable. Truth Layer requires database.',
        { error: message },
      );
      
      // Throw to prevent application startup
      throw new DatabaseUnavailableError(
        'Truth Layer initialization failed: PostgreSQL unavailable. ' +
        'The application cannot start without database connectivity. ' +
        'There is NO in-memory fallback for the Truth Layer.',
        error instanceof Error ? error : undefined,
      );
    }
  }
}
