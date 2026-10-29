import { Controller, ForbiddenException, Post, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { ViewerWriteDenyGuard } from "../auth/guards/viewer-write-deny.guard";
import { OperationalEscalationService } from "./operational-escalation.service";

/**
 * KI-019 / F02-D (owner F02 uygulama talimatı 2026-10-29; OFP-18): manuel tetik YALNIZ aktörün kiracısını işler.
 *  - Kapsam: tenantId JWT'den türetilir (req.user her istekte DB'den yüklenir); HTTP isteği GLOBAL kapsamı SEÇEMEZ.
 *    Cron giriş noktası (`scheduledRun` → parametresiz `processEscalations`) TÜM aktif kiracıları işlemeye devam eder.
 *  - VIEWER: kapalı salt-okuyucu kuralı (ACT-11 / OWN-13; B4/B6 `ViewerWriteDenyGuard` yüklemi) → 403, yazma ve
 *    gönderim 0.
 *  - Eşik (J-26, owner kararı 2026-10-29): ELEVATED — scheduler manuel tetiğiyle AYNI yüklem (PARTNER ya da
 *    canApproveOfficeActions avukat kartı; ADMIN tek başına YETMEZ; operasyon personeli USER tetikleyemez). Karar SERVİS
 *    girişinde (`OperationalEscalationService.runManual`); controller yalnız JWT aktörünü iletir — rol politikası burada
 *    ÜRETİLMEZ (OWN-13 I02-R6 deseni). Cron etkilenmez.
 */
@Controller("escalation")
@UseGuards(JwtAuthGuard, ViewerWriteDenyGuard)
export class EscalationController {
  constructor(private service: OperationalEscalationService) {}

  /**
   * Manuel tetik (operasyon): saat başı cron'u beklemeden eskalasyon turunu AKTÖRÜN KİRACISI için çalıştırır.
   * Sonuç: { processed, notified, skipped, failed } (PR-3b.2: failed = sağlayıcı hatası → retry edilir).
   */
  @Post("run")
  run(@CurrentUser() user: { id?: string; tenantId?: string; role?: string } | undefined) {
    if (!user?.tenantId) {
      throw new ForbiddenException({ reasonCode: "ESCALATION_MANUAL_RUN_DENIED_NO_TENANT" });
    }
    return this.service.runManual({ userId: user.id ?? "", tenantId: user.tenantId, role: user.role ?? "" });
  }
}
