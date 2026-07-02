import { Module } from "@nestjs/common";
import { LawyerController } from "./lawyer.controller";
import { LawyerService } from "./lawyer.service";
import { PrismaModule } from "@/prisma/prisma.module";
import { OfficeApprovalModule } from "../office-approval/office-approval.module";

// L1A: AuditService @Global (AuditModule) — ek import gerekmez. OfficeApprovalModule
// deactivate capability-gate (isApproverEligible) için gerekli.
@Module({
  imports: [PrismaModule, OfficeApprovalModule],
  controllers: [LawyerController],
  providers: [LawyerService],
  exports: [LawyerService],
})
export class LawyerModule {}
