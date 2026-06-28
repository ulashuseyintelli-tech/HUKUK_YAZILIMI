// P4-1 — OfficeApprovalModule (kurumsal Approval Engine substrate).
// AuditService global modülden (AuditModule @Global) gelir → ek import gerekmez. PrismaModule import edilir.
// CONTROLLER YOK → hiçbir route eklenmez. OfficeApprovalService export edilir (P4-2+ wiring için hazır, AMA henüz wire DEĞİL).
import { Module } from '@nestjs/common';
import { OfficeApprovalService } from './office-approval.service';
import { OfficeApprovalShadowService } from './office-approval-shadow.service';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  // P4-2: OfficeApprovalShadowService (CHANGE_STATUS shadow; ConfigService global, PrismaModule import, AuditService @Global).
  imports: [PrismaModule],
  providers: [OfficeApprovalService, OfficeApprovalShadowService],
  exports: [OfficeApprovalService, OfficeApprovalShadowService],
})
export class OfficeApprovalModule {}
