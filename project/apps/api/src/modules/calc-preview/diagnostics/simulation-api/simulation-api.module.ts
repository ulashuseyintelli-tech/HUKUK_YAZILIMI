/**
 * Simulation API Module
 * 
 * Sprint 2F - Task 11.1
 * Phase 9B.5 - Migrated to ISnapshotStore interface
 * 
 * Registers all simulation API controllers and guards.
 * 
 * LOCKED: InMemorySnapshotStore is FORBIDDEN in prod paths.
 * All snapshot operations go through SNAPSHOT_STORE token → PostgreSQL.
 * 
 * @see .kiro/specs/simulation-api-2f/design.md
 * @see .kiro/specs/phase-9b-postgresql-migration/PHASE-9B-LOCK.md
 */

import { Module } from '@nestjs/common';

// Controllers
import { SimulationController } from './simulation.controller';
import { EvidenceBundleController } from './evidence-bundle.controller';
import { LegalHoldController } from './legal-hold.controller';

// Guards
import { SimulationFeatureFlagGuard } from './guards/simulation-feature-flag.guard';
import { SimulationRBACGuard } from './guards/simulation-rbac.guard';
import { SimulationRateLimitGuard } from './guards/simulation-rate-limit.guard';

// Services
import { SimulationFeatureFlagService } from './simulation-feature-flag.service';
import { SimulationRunStoreService, SIMULATION_RUN_REPOSITORY } from './simulation-run-store.service';

// Persistence - Phase 9B.5 Truth Layer
import { TruthLayerModule } from '../persistence/truth-layer.module';
import { SNAPSHOT_STORE } from '../persistence/snapshot-store.interface';
import { PrismaSimulationRunRepository } from '../persistence/prisma-simulation-run.repository';
import { PrismaService } from '../../../../prisma/prisma.service';

// Existing services from simulation module
import { SimulationEngineService } from '../simulation/simulation-engine.service';
import { InMemoryIncidentStore } from '../simulation/incident-store.service';
import { BaselineResolverService } from '../simulation/baseline-resolver.service';
import { EvidenceBundleService } from '../simulation/evidence-bundle.service';
import { LegalHoldInventoryService } from '../simulation/legal-hold-inventory.service';
import { SnapshotQueryService } from '../simulation/snapshot-query.service';

// Evidence services
import { EvidenceGateService } from '../evidence/evidence-gate.service';
import { ClockService, IClock } from '../evidence/clock.service';

// Simulation clock adapter
import { ISimulationClock } from '../simulation/simulation.types';

/**
 * Adapter to use IClock as ISimulationClock
 */
class SimulationClockAdapter implements ISimulationClock {
  constructor(private readonly clock: IClock) {}

  now(): Date {
    return this.clock.now();
  }

  advanceSeconds(_seconds: number): void {
    // No-op for production clock
  }

  reset(_to?: Date): void {
    // No-op for production clock
  }
}

@Module({
  imports: [
    // Phase 9B.5: Import TruthLayerModule for SNAPSHOT_STORE token
    // This provides PostgreSQL-backed snapshot storage
    // InMemorySnapshotStore is FORBIDDEN in prod paths
    TruthLayerModule,
  ],
  controllers: [
    SimulationController,
    EvidenceBundleController,
    LegalHoldController,
  ],
  providers: [
    // Prisma Service
    PrismaService,
    
    // Clock
    {
      provide: 'IClock',
      useClass: ClockService,
    },
    {
      provide: ClockService,
      useClass: ClockService,
    },
    
    // Simulation Clock Adapter
    {
      provide: 'ISimulationClock',
      useFactory: (clock: IClock) => new SimulationClockAdapter(clock),
      inject: ['IClock'],
    },
    
    // Feature Flag Service
    SimulationFeatureFlagService,
    
    // Guards
    {
      provide: SimulationFeatureFlagGuard,
      useFactory: (featureFlagService: SimulationFeatureFlagService) => {
        const guard = new SimulationFeatureFlagGuard();
        guard.setFeatureFlagService(featureFlagService);
        return guard;
      },
      inject: [SimulationFeatureFlagService],
    },
    SimulationRBACGuard,
    {
      provide: SimulationRateLimitGuard,
      useFactory: (clock: IClock) => new SimulationRateLimitGuard(undefined, clock),
      inject: ['IClock'],
    },
    
    // Simulation Run Repository (Phase 9B)
    PrismaSimulationRunRepository,
    {
      provide: SIMULATION_RUN_REPOSITORY,
      useExisting: PrismaSimulationRunRepository,
    },
    
    // Run Store (Phase 9B - uses repository)
    {
      provide: SimulationRunStoreService,
      useFactory: (repo: PrismaSimulationRunRepository) => new SimulationRunStoreService(repo),
      inject: [PrismaSimulationRunRepository],
    },
    
    // Phase 9B.5: SNAPSHOT_STORE is provided by TruthLayerModule
    // InMemorySnapshotStore is REMOVED from prod wiring
    
    // Evidence Gate
    EvidenceGateService,
    
    // Simulation Engine
    {
      provide: SimulationEngineService,
      useFactory: (simulationClock: ISimulationClock, evidenceGate: EvidenceGateService) => 
        new SimulationEngineService(simulationClock, evidenceGate),
      inject: ['ISimulationClock', EvidenceGateService],
    },
    
    // Incident Store
    {
      provide: InMemoryIncidentStore,
      useFactory: (clock: IClock) => new InMemoryIncidentStore(clock),
      inject: ['IClock'],
    },
    
    // Phase 9B.5: BaselineResolverService now uses SNAPSHOT_STORE token
    BaselineResolverService,
    
    // Phase 9B.5: SnapshotQueryService - Query Facade for controllers
    // Controllers use this instead of direct store access
    SnapshotQueryService,
    
    // Phase 9B.5: EvidenceBundleService now uses SNAPSHOT_STORE token
    EvidenceBundleService,
    
    // Phase 9B.5: LegalHoldInventoryService now uses SNAPSHOT_STORE token
    LegalHoldInventoryService,
  ],
  exports: [
    SimulationController,
    EvidenceBundleController,
    LegalHoldController,
    SimulationFeatureFlagGuard,
    SimulationRBACGuard,
    SimulationRateLimitGuard,
    SimulationRunStoreService,
    'IClock',
    // Phase 9B.5: Export SNAPSHOT_STORE for consumers
    SNAPSHOT_STORE,
  ],
})
export class SimulationApiModule {}
