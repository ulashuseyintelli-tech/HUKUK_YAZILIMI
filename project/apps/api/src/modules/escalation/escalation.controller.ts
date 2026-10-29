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
 *    gönderim 0. ADMIN/USER bugünkü gibi tetikleyebilir.
 *  - Eşik (ADMIN tek başına / ELEVATED) F02 karar listesi J-26'da AÇIKTIR; bu değişiklik eşiği DEĞİŞTİRMEZ.
 */
@Controller("escalation")
@UseGuards(JwtAuthGuard, ViewerWriteDenyGuard)
export class EscalationController {
  constructor(private service: OperationalEscalationService) {}

  /**
   * Manuel tetik (test/operasyon): saat başı cron'u beklemeden eskalasyon turunu AKTÖRÜN KİRACISI için çalıştırır.
   * Sonuç: { processed, notified, skipped, failed } (PR-3b.2: failed = sağlayıcı hatası → retry edilir).
   */
  @Post("run")
  run(@CurrentUser("tenantId") tenantId: string | undefined) {
    if (!tenantId) {
      throw new ForbiddenException({ reasonCode: "ESCALATION_MANUAL_RUN_DENIED_NO_TENANT" });
    }
    return this.service.processEscalations(new Date(), { tenantId });
  }
}
