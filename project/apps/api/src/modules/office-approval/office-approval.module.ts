// P4-1/P4-4 — OfficeApprovalModule (kurumsal Approval Engine).
// AuditService global modülden (AuditModule @Global) gelir → ek import gerekmez. PrismaModule import edilir.
// P4-4: OfficeApprovalController eklendi → Inbox/Approve API route'ları (decision-only; execution P4-5).
import { Module } from '@nestjs/common';
import { OfficeApprovalService } from './office-approval.service';
import { OfficeApprovalShadowService } from './office-approval-shadow.service';
import { OfficeApprovalController } from './office-approval.controller';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  // P4-2: OfficeApprovalShadowService (CHANGE_STATUS shadow; ConfigService global, PrismaModule import, AuditService @Global).
  imports: [PrismaModule],
  controllers: [OfficeApprovalController],
  providers: [OfficeApprovalService, OfficeApprovalShadowService],
  exports: [OfficeApprovalService, OfficeApprovalShadowService],
})
export class OfficeApprovalModule {}
