// WP-4c-1 — Phase 1 permission diagnostics modülü (READ-ONLY).
import { Module } from "@nestjs/common";
import { PermissionDiagnosticsController } from "./permission-diagnostics.controller";
import { PermissionDiagnosticsService } from "./permission-diagnostics.service";

@Module({
  controllers: [PermissionDiagnosticsController],
  providers: [PermissionDiagnosticsService],
  exports: [PermissionDiagnosticsService],
})
export class PermissionDiagnosticsModule {}
