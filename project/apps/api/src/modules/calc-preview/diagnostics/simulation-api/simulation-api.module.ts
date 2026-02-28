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
import { PromoteController } from './promote.controller';
import { ScenarioRankerController } from './scenario-ranker.controller';
import { SimulationV1AliasController } from './simulation-v1-alias.controller';

// Guards
import { SimulationFeatureFlagGuard } from './guards/simulation-feature-flag.guard';
import { SimulationRBACGuard } from './guards/simulation-rbac.guard';
import { SimulationRateLimitGuard } from './guards/simulation-rate-limit.guard';

// Services
import { SimulationFeatureFlagService, FEATURE_FLAG_SERVICE } from './simulation-feature-flag.service';
import { SimulationRunStoreService, SIMULATION_RUN_REPOSITORY } from './simulation-run-store.service';

// Sprint 3 Services
import { PromoteService } from './promote.service';
import { PromoteRequestStore } from './promote-request.store';
import { ScenarioRankerService } from './scenario-ranker.service';
import { SimulationMetricsService } from './simulation-metrics.service';
import { SimulationAuditAdapter } from './simulation-audit.adapter';
import { EscalationStateRepository } from '../playbook/escalation-state.repository';
import { DiagnosticsAuditService } from '../diagnostics-audit.service';

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
import { ClockService, IClock, CLOCK, SIMULATION_CLOCK } from '../evidence/clock.service';

// Simulation types
import { ISimulationClock } from '../simulation/simulation.types';
import { IIncidentStore } from '../simulation/incident.types';
import { ISnapshotStore } from '../persistence/snapshot-store.interface';

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
    PromoteController,
    ScenarioRankerController,
    SimulationV1AliasController,
  ],
  providers: [
    // Prisma Service
    PrismaService,
    
    // Clock
    {
      provide: CLOCK,
      useClass: ClockService,
    },
    {
      provide: ClockService,
      useClass: ClockService,
    },
    
    // Simulation Clock Adapter
    {
      provide: SIMULATION_CLOCK,
      useFactory: (clock: IClock) => new SimulationClockAdapter(clock),
      inject: [CLOCK],
    },
    
    // Feature Flag Service
    SimulationFeatureFlagService,
    {
      provide: FEATURE_FLAG_SERVICE,
      useExisting: SimulationFeatureFlagService,
    },
    
    // Guards — constructor injection via Symbol tokens, no mutation needed
    {
      provide: SimulationFeatureFlagGuard,
      useFactory: (featureFlagService: SimulationFeatureFlagService) => {
        return new SimulationFeatureFlagGuard(featureFlagService);
      },
      inject: [SimulationFeatureFlagService],
    },
    SimulationRBACGuard,
    {
      provide: SimulationRateLimitGuard,
      useFactory: (clock: IClock) => new SimulationRateLimitGuard(undefined, clock),
      inject: [CLOCK],
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
    {
      provide: EvidenceGateService,
      useFactory: (clock: IClock) => new EvidenceGateService(clock),
      inject: [CLOCK],
    },
    
    // Simulation Engine
    {
      provide: SimulationEngineService,
      useFactory: (simulationClock: ISimulationClock, evidenceGate: EvidenceGateService) => 
        new SimulationEngineService(simulationClock, evidenceGate),
      inject: [SIMULATION_CLOCK, EvidenceGateService],
    },
    
    // Incident Store
    {
      provide: InMemoryIncidentStore,
      useFactory: (clock: IClock) => new InMemoryIncidentStore(clock),
      inject: [CLOCK],
    },
    
    // Phase 9B.5: BaselineResolverService now uses SNAPSHOT_STORE token
    // BaselineResolverService only needs SNAPSHOT_STORE (injected via @Inject)
    BaselineResolverService,
    
    // Phase 9B.5: SnapshotQueryService - Query Facade for controllers
    SnapshotQueryService,
    
    // Phase 9B.5: EvidenceBundleService - needs IClock, IIncidentStore, SNAPSHOT_STORE
    {
      provide: EvidenceBundleService,
      useFactory: (clock: IClock, incidentStore: IIncidentStore, snapshotStore: ISnapshotStore) =>
        new EvidenceBundleService(clock, incidentStore, snapshotStore),
      inject: [CLOCK, InMemoryIncidentStore, SNAPSHOT_STORE],
    },
    
    // Phase 9B.5: LegalHoldInventoryService - needs IClock, SNAPSHOT_STORE, IIncidentStore
    {
      provide: LegalHoldInventoryService,
      useFactory: (clock: IClock, snapshotStore: ISnapshotStore, incidentStore: IIncidentStore) =>
        new LegalHoldInventoryService(clock, snapshotStore, incidentStore),
      inject: [CLOCK, SNAPSHOT_STORE, InMemoryIncidentStore],
    },

    // Sprint 3: Promote pipeline
    PromoteRequestStore,
    {
      provide: 'ISnapshotProvider',
      useFactory: (snapshotQuery: SnapshotQueryService) => ({
        async getSnapshot(snapshotId: string) {
          // SnapshotQueryService.getSnapshotById needs tenantId for security,
          // but ISnapshotProvider only has snapshotId. Use store directly.
          // For promote flow, we bypass tenant check (internal operation).
          const snap = await (snapshotQuery as any).snapshotStore.findById(snapshotId);
          if (!snap) return null;
          // Return minimal EvidenceSnapshot shape
          return {
            snapshotId: snap.snapshotId,
            tenantId: snap.tenantId,
            incidentId: snap.incidentId,
            capturedAt: snap.createdAt,
            points: [],
            promoted: snap.retentionPolicy === 'PROMOTED' || snap.retentionPolicy === 'LEGAL_HOLD',
          };
        },
      }),
      inject: [SnapshotQueryService],
    },
    {
      provide: PromoteService,
      useFactory: (
        featureFlag: SimulationFeatureFlagService,
        promoteStore: PromoteRequestStore,
        runStore: SimulationRunStoreService,
        metrics: SimulationMetricsService,
        audit: SimulationAuditAdapter,
        clock: IClock,
        snapshotProvider: any,
      ) => new PromoteService(featureFlag, promoteStore, runStore, metrics, audit, clock, snapshotProvider),
      inject: [
        SimulationFeatureFlagService,
        PromoteRequestStore,
        SimulationRunStoreService,
        SimulationMetricsService,
        SimulationAuditAdapter,
        CLOCK,
        'ISnapshotProvider',
      ],
    },
    SimulationMetricsService,

    // Sprint 3: ScenarioRanker
    ScenarioRankerService,

    // Sprint 3: Audit adapter
    DiagnosticsAuditService,
    SimulationAuditAdapter,

    // Sprint 3: Escalation state (DB-backed CAS)
    EscalationStateRepository,
  ],
  exports: [
    SimulationFeatureFlagGuard,
    SimulationRBACGuard,
    SimulationRateLimitGuard,
    SimulationRunStoreService,
    CLOCK,
  ],
})
export class SimulationApiModule {}
