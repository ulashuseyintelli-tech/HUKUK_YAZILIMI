// WP-4c-1 — Phase 1 permission diagnostics ucu (READ-ONLY, admin-only).
// Hiçbir işlemi ENGELLEMEZ; yalnız "bu operasyon ileride hangi izni gerektirecek + bugün neyle korunuyor +
// enforce açık olsaydı izinli mi/would-deny mı" raporlar. Enforcement DEĞİL.

import { Controller, Get, Query, UseGuards, ForbiddenException } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { PermissionDiagnosticsService } from "./permission-diagnostics.service";

@Controller("permission-diagnostics")
@UseGuards(JwtAuthGuard)
export class PermissionDiagnosticsController {
  constructor(private readonly svc: PermissionDiagnosticsService) {}

  /**
   * GET /permission-diagnostics            → tüm haritalı operasyonların tanısı (current user rolüyle)
   * GET /permission-diagnostics?operation= → tek operasyon
   * GET /permission-diagnostics?simulateRole=USER → admin başka bir rolü simüle edebilir (read-only)
   *
   * Yalnız ADMIN görüntüleyebilir (ops/diagnostic aracı). Salt-okuma; hiçbir mutation yapmaz.
   */
  @Get()
  getDiagnostics(
    @CurrentUser("role") role: string,
    @Query("operation") operation?: string,
    @Query("simulateRole") simulateRole?: string,
  ) {
    if (role !== "ADMIN") {
      throw new ForbiddenException(
        "Permission diagnostics yalnız yönetici (ADMIN) tarafından görüntülenebilir",
      );
    }
    const ctx = { role: simulateRole ?? role };
    return operation ? this.svc.diagnose(operation, ctx) : this.svc.diagnoseAll(ctx);
  }
}
