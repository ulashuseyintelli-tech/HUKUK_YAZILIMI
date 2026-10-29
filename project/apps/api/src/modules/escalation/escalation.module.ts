import { Module } from "@nestjs/common";
import { PrismaModule } from "@/prisma/prisma.module";
import { OfficeModule } from "../office/office.module";
import { OfficeApprovalModule } from "../office-approval/office-approval.module"; // J-26: manuel tetik eşiği (isApproverEligible); scheduler.module ile aynı, döngü yok
import { OperationalEscalationService } from "./operational-escalation.service";
import { CaseTaskEscalationService } from "./case-task-escalation.service";
import { TenantNotifier } from "./tenant-notifier.service";
import { EscalationController } from "./escalation.controller";

@Module({
  imports: [PrismaModule, OfficeModule, OfficeApprovalModule],
  controllers: [EscalationController],
  providers: [OperationalEscalationService, CaseTaskEscalationService, TenantNotifier],
  exports: [TenantNotifier],
})
export class EscalationModule {}
