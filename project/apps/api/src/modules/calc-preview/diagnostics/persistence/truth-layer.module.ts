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
   */
  async onModuleInit(): Promise<void> {
    this.logger.log('[TruthLayerModule] Initializing - checking PostgreSQL connection...');
    
    try {
      // Simple health check query
      await this.prisma.$queryRaw`SELECT 1`;
      
      this.logger.log('[TruthLayerModule] PostgreSQL connection verified ✓');
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
