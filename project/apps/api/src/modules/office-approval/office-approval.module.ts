// P4-1 — OfficeApprovalModule (kurumsal Approval Engine substrate).
// AuditService global modülden (AuditModule @Global) gelir → ek import gerekmez. PrismaModule import edilir.
// CONTROLLER YOK → hiçbir route eklenmez. OfficeApprovalService export edilir (P4-2+ wiring için hazır, AMA henüz wire DEĞİL).
import { Module } from '@nestjs/common';
import { OfficeApprovalService } from './office-approval.service';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [OfficeApprovalService],
  exports: [OfficeApprovalService],
})
export class OfficeApprovalModule {}
