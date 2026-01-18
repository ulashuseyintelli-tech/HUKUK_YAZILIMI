/**
 * Simulation API Module
 * 
 * Sprint 2F - Task 11.1
 * 
 * Registers all simulation API controllers and guards.
 * 
 * @see .kiro/specs/simulation-api-2f/design.md
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
import { SimulationRunStoreService } from './simulation-run-store.service';

// Existing services from simulation module
import { SimulationEngineService } from '../simulation/simulation-engine.service';
import { InMemoryIncidentStore } from '../simulation/incident-store.service';
import { BaselineResolverService } from '../simulation/baseline-resolver.service';
import { EvidenceBundleService } from '../simulation/evidence-bundle.service';
import { LegalHoldInventoryService } from '../simulation/legal-hold-inventory.service';

// Evidence services
import { InMemorySnapshotStore } from '../evidence/snapshot-store.service';
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
  controllers: [
    SimulationController,
    EvidenceBundleController,
    LegalHoldController,
  ],
  providers: [
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
      useFactory: (clock: IClock) => new SimulationRateLimitGuard(clock),
      inject: ['IClock'],
    },
    
    // Run Store
    {
      provide: SimulationRunStoreService,
      useFactory: (clock: IClock) => new SimulationRunStoreService(clock),
      inject: ['IClock'],
    },
    
    // Snapshot Store
    {
      provide: InMemorySnapshotStore,
      useFactory: (clock: IClock) => new InMemorySnapshotStore(clock),
      inject: ['IClock'],
    },
    
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
    
    // Baseline Resolver
    {
      provide: BaselineResolverService,
      useFactory: (clock: IClock, snapshotStore: InMemorySnapshotStore, incidentStore: InMemoryIncidentStore) =>
        new BaselineResolverService(clock, snapshotStore, incidentStore),
      inject: ['IClock', InMemorySnapshotStore, InMemoryIncidentStore],
    },
    
    // Evidence Bundle Service
    {
      provide: EvidenceBundleService,
      useFactory: (clock: IClock, incidentStore: InMemoryIncidentStore, snapshotStore: InMemorySnapshotStore) =>
        new EvidenceBundleService(clock, incidentStore, snapshotStore),
      inject: ['IClock', InMemoryIncidentStore, InMemorySnapshotStore],
    },
    
    // Legal Hold Inventory Service
    {
      provide: LegalHoldInventoryService,
      useFactory: (clock: IClock, snapshotStore: InMemorySnapshotStore, incidentStore: InMemoryIncidentStore) =>
        new LegalHoldInventoryService(clock, snapshotStore, incidentStore),
      inject: ['IClock', InMemorySnapshotStore, InMemoryIncidentStore],
    },
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
  ],
})
export class SimulationApiModule {}
