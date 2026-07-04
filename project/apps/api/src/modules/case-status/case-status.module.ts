import { Module } from '@nestjs/common';
import { CaseStatusService } from './case-status.service';
import { CaseStatusController } from './case-status.controller';
import { PrismaModule } from '../../prisma/prisma.module';
import { PermissionDiagnosticsModule } from '../permission-diagnostics/permission-diagnostics.module';
import { OfficeApprovalModule } from '../office-approval/office-approval.module';

@Module({
  // P2b-2c-2: CHANGE_STATUS observe hook için GuidedOpenObserveService.
  // P4-2: OfficeApprovalShadowService için OfficeApprovalModule (observe-only shadow; davranış değişmez).
  imports: [PrismaModule, PermissionDiagnosticsModule, OfficeApprovalModule],
  controllers: [CaseStatusController],
  providers: [CaseStatusService],
  exports: [CaseStatusService],
})
export class CaseStatusModule {}
