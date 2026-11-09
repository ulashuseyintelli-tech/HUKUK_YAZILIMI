import { Module } from "@nestjs/common";
import { OfficeController } from "./office.controller";
import { OfficeService } from "./office.service";
import { PrismaModule } from "@/prisma/prisma.module";
import { PermissionDiagnosticsModule } from "../permission-diagnostics/permission-diagnostics.module";
import { OfficeApprovalModule } from "../office-approval/office-approval.module";
import { AuditModule } from "../audit/audit.module";
import { WorkScopePermissionModule } from "../work-scope-permission/work-scope-permission.module";
import { OfficeContactController } from "./office-contact.controller";
import { OfficeContactService } from "./office-contact.service";

@Module({
  // P2b-1: credential observe hook için GuidedOpenObserveService
  imports: [PrismaModule, PermissionDiagnosticsModule, OfficeApprovalModule, AuditModule, WorkScopePermissionModule],
  controllers: [OfficeController, OfficeContactController],
  providers: [OfficeService, OfficeContactService],
  exports: [OfficeService],
})
export class OfficeModule {}
