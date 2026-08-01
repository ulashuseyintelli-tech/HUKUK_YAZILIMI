import { Module } from "@nestjs/common";
import { OfficeController } from "./office.controller";
import { OfficeService } from "./office.service";
import { PrismaModule } from "@/prisma/prisma.module";
import { PermissionDiagnosticsModule } from "../permission-diagnostics/permission-diagnostics.module";
import { OfficeApprovalModule } from "../office-approval/office-approval.module";

@Module({
  // P2b-1: credential observe hook için GuidedOpenObserveService
  imports: [PrismaModule, PermissionDiagnosticsModule, OfficeApprovalModule],
  controllers: [OfficeController],
  providers: [OfficeService],
  exports: [OfficeService],
})
export class OfficeModule {}
