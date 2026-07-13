import { Controller, Get, Post, Param, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { LegalTimeShadowService } from "./legal-time-shadow.service";

/**
 * MPB-028(a) PR-3 Evidence Activation.
 *
 * Bilinçli olarak dar: bu controller yalnız shadow-diff hesaplamasını tetikler ve
 * biriken kanıtı okur. Hiçbir consumer/workflow/scheduler/UI bu endpoint'leri
 * çağırmaz; tetikleme yalnız bu PR kapsamındaki manuel/lokal doğrulama amaçlıdır.
 * `LEGAL_TIME_SHADOW_ENABLED` kapalıyken (varsayılan) compute endpoint'i hiçbir
 * satır yazmaz, `triggered: false` döner.
 */
@Controller("legal-time-shadow")
@UseGuards(JwtAuthGuard)
export class LegalTimeShadowController {
  constructor(private legalTimeShadowService: LegalTimeShadowService) {}

  // Tek bir tebligat için shadow-diff hesapla (flag kapalıysa no-op).
  @Post("tebligat/:tebligatId/compute")
  async compute(
    @CurrentUser("tenantId") tenantId: string,
    @Param("tebligatId") tebligatId: string,
  ) {
    const diff = await this.legalTimeShadowService.computeShadowDiff({ tenantId, tebligatId });
    return {
      triggered: diff !== null,
      diff,
    };
  }

  // Birikmiş kanıtı salt-okuma olarak döner (kategori/limit yok — Owner Decision 7/8).
  @Get("evidence-report")
  async evidenceReport(@CurrentUser("tenantId") tenantId: string) {
    return this.legalTimeShadowService.buildEvidenceReport(tenantId);
  }
}
