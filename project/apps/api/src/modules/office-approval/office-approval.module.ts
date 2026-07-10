// P4-1/P4-4 — OfficeApprovalModule (kurumsal Approval Engine).
// AuditService global modülden (AuditModule @Global) gelir → ek import gerekmez. PrismaModule import edilir.
// P4-4: OfficeApprovalController eklendi → Inbox/Approve API route'ları (decision-only; execution P4-5).
import { Module } from '@nestjs/common';
import { OfficeApprovalService } from './office-approval.service';
import { OfficeApprovalDomainSyncService } from './office-approval-domain-sync.service';
import { OfficeApprovalShadowService } from './office-approval-shadow.service';
import { OfficeApprovalController } from './office-approval.controller';
import { PayoutApprovalPolicy } from './client-payout-approval.policy';
import { PrismaModule } from '../../prisma/prisma.module';
import { DomainEventIngestModule } from '../icrabot/domain-event-ingest';
import { AccountingJournalWriterService } from '../accounting-journal';

@Module({
  // P4-2: OfficeApprovalShadowService (CHANGE_STATUS shadow; ConfigService global, PrismaModule import, AuditService @Global).
  imports: [PrismaModule, DomainEventIngestModule],
  controllers: [OfficeApprovalController],
  providers: [
    OfficeApprovalService,
    OfficeApprovalShadowService,
    OfficeApprovalDomainSyncService,
    PayoutApprovalPolicy,
    AccountingJournalWriterService,
  ],
  // PAYOUT-APPROVAL-2: PayoutApprovalPolicy export → ClientSettlementModule (zaten bu modülü import ediyor)
  // ClientPayoutService.finalize()'da izole re-check için kullanır.
  exports: [OfficeApprovalService, OfficeApprovalShadowService, OfficeApprovalDomainSyncService, PayoutApprovalPolicy],
})
export class OfficeApprovalModule {}
