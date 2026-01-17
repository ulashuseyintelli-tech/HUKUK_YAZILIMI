/**
 * Playbook Module
 * 
 * Phase 7B - Sprint 1, 2 & 3
 * 
 * Ops Playbook System module registration.
 * 
 * @see .kiro/specs/ops-playbook/design.md
 */

import { Module, forwardRef } from '@nestjs/common';
import { PlaybookYAMLValidator } from './playbook-yaml-validator.service';
import { PlaybookRegistry } from './playbook-registry.service';
import { PlaybookMatcher } from './playbook-matcher.service';
import { ActionPolicyGuard } from './action-policy-guard.service';
import { ActionLeaseManager } from './action-lease-manager.service';
import { ActionExecutor } from './action-executor.service';
import { PlaybookAuditService } from './playbook-audit.service';
import { PlaybookMetricsService } from './playbook-metrics.service';
import { NotificationService } from './notification.service';
import { EscalationService } from './escalation.service';
import { CalcPreviewModule } from '../../calc-preview.module';

@Module({
  imports: [
    forwardRef(() => CalcPreviewModule),
  ],
  providers: [
    // Sprint 1
    PlaybookYAMLValidator,
    PlaybookRegistry,
    PlaybookMatcher,
    // Sprint 2
    ActionPolicyGuard,
    ActionLeaseManager,
    ActionExecutor,
    PlaybookAuditService,
    PlaybookMetricsService,
    // Sprint 3
    NotificationService,
    EscalationService,
  ],
  exports: [
    // Sprint 1
    PlaybookYAMLValidator,
    PlaybookRegistry,
    PlaybookMatcher,
    // Sprint 2
    ActionPolicyGuard,
    ActionLeaseManager,
    ActionExecutor,
    PlaybookAuditService,
    PlaybookMetricsService,
    // Sprint 3
    NotificationService,
    EscalationService,
  ],
})
export class PlaybookModule {}
