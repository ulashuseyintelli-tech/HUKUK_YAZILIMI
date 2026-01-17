/**
 * Diagnostics Module
 * 
 * Phase 7A - Sprint 1, 2 & 3
 * Phase 7B - Ops Playbook System
 * 
 * Self-serve diagnostics module registration.
 * 
 * @see .kiro/specs/self-serve-diagnostics/design.md
 * @see .kiro/specs/ops-playbook/design.md
 */

import { Module } from '@nestjs/common';
import { DiagnosticsController } from './diagnostics.controller';
import { DiagnosticsService } from './diagnostics.service';
import { DiagnosticsAggregatorService } from './diagnostics-aggregator.service';
import { DiagnosticsRedactionService } from './diagnostics-redaction.service';
import { DiagnosticsAuditService } from './diagnostics-audit.service';
import { DiagnosticsIncidentService } from './diagnostics-incident.service';
import { DiagnosticsRBACGuard, DiagnosticsRateLimitGuard } from './guards';

// Phase 7B: Playbook services
import { PlaybookYAMLValidator } from './playbook/playbook-yaml-validator.service';
import { PlaybookRegistry } from './playbook/playbook-registry.service';
import { PlaybookMatcher } from './playbook/playbook-matcher.service';

// Import existing services
import { CalcPreviewCircuitBreakerService } from '../circuit-breaker/calc-preview-circuit-breaker.service';
import { CalcPreviewRateLimitService } from '../rate-limit/calc-preview-rate-limit.service';
import { VersionedCacheService } from '../cache/versioned-cache.service';
import { CalcPreviewMetricsService } from '../metrics/calc-preview-metrics.service';
import { TraceStorageService } from '../trace/trace-storage.service';

@Module({
  controllers: [DiagnosticsController],
  providers: [
    // Diagnostics services
    DiagnosticsService,
    DiagnosticsAggregatorService,
    DiagnosticsRedactionService,
    DiagnosticsAuditService,
    DiagnosticsIncidentService,
    
    // Phase 7B: Playbook services
    PlaybookYAMLValidator,
    PlaybookRegistry,
    PlaybookMatcher,
    
    // Guards
    DiagnosticsRBACGuard,
    DiagnosticsRateLimitGuard,
    
    // Existing services (reused)
    CalcPreviewCircuitBreakerService,
    CalcPreviewRateLimitService,
    VersionedCacheService,
    CalcPreviewMetricsService,
    TraceStorageService,
  ],
  exports: [
    DiagnosticsService,
    DiagnosticsAggregatorService,
    DiagnosticsRedactionService,
    DiagnosticsAuditService,
    DiagnosticsIncidentService,
    // Phase 7B exports
    PlaybookYAMLValidator,
    PlaybookRegistry,
    PlaybookMatcher,
  ],
})
export class DiagnosticsModule {}
