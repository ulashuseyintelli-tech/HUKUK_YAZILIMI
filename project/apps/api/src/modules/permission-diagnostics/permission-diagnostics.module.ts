// WP-4c-1 — Phase 1 permission diagnostics modülü (READ-ONLY).
import { Module } from "@nestjs/common";
import { PermissionDiagnosticsController } from "./permission-diagnostics.controller";
import { PermissionDiagnosticsService } from "./permission-diagnostics.service";
import { WarnOnlyAuditService } from "./warn-only-audit.service";
import { PermissionHardGuardService } from "./permission-hard-guard.service";

@Module({
  controllers: [PermissionDiagnosticsController],
  providers: [PermissionDiagnosticsService, WarnOnlyAuditService, PermissionHardGuardService],
  exports: [PermissionDiagnosticsService, WarnOnlyAuditService, PermissionHardGuardService],
})
export class PermissionDiagnosticsModule {}
