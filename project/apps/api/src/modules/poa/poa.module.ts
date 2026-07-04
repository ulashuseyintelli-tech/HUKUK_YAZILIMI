import { Module } from "@nestjs/common";
import { PoaService } from "./poa.service";
import { PoaController } from "./poa.controller";
import { PrismaModule } from "../../prisma/prisma.module";
import { OfficeApprovalModule } from "../office-approval/office-approval.module";

// P1A: AuditService @Global (AuditModule) — ek import gerekmez. OfficeApprovalModule
// revoke capability-gate (isApproverEligible) için gerekli.
@Module({
  imports: [PrismaModule, OfficeApprovalModule],
  controllers: [PoaController],
  providers: [PoaService],
  exports: [PoaService],
})
export class PoaModule {}
