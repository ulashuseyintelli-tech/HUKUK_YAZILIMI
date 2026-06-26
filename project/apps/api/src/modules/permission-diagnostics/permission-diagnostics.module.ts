// WP-4c-1 — Phase 1 permission diagnostics modülü (READ-ONLY).
import { Module } from "@nestjs/common";
import { PermissionDiagnosticsController } from "./permission-diagnostics.controller";
import { PermissionDiagnosticsService } from "./permission-diagnostics.service";
import { WarnOnlyAuditService } from "./warn-only-audit.service";
import { PermissionHardGuardService } from "./permission-hard-guard.service";
import { GuidedOpenObserveService } from "./guided-open-observe.service";
import { ConfirmationTokenService } from "./guided-edge/confirmation-token.service";
import { PolicyEngineModule } from "../policy-engine/policy-engine.module";

@Module({
  // P2b-1: GuidedOpenObserveService, EffectivePermissionResolver'a (policy-engine) bağlı.
  // P3-1b: ConfirmationTokenService (guarded-edge substrate); ConfigService + AuditService
  //        global modüllerden (ConfigModule.forRoot isGlobal, AuditModule @Global) gelir →
  //        ek import GEREKMEZ. Hiçbir route'a bağlı DEĞİL (substrate-only, enforcement YOK).
  imports: [PolicyEngineModule],
  controllers: [PermissionDiagnosticsController],
  providers: [PermissionDiagnosticsService, WarnOnlyAuditService, PermissionHardGuardService, GuidedOpenObserveService, ConfirmationTokenService],
  exports: [PermissionDiagnosticsService, WarnOnlyAuditService, PermissionHardGuardService, GuidedOpenObserveService, ConfirmationTokenService],
})
export class PermissionDiagnosticsModule {}
