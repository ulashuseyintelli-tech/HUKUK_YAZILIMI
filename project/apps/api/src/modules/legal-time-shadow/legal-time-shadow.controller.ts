import { Controller, Get, Post, Param, UseGuards, Optional } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { ViewerWriteDenyGuard } from "../auth/guards/viewer-write-deny.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { LegalTimeShadowService } from "./legal-time-shadow.service";
import { CaseViewScopeService, requireCaseViewScope } from "../case/case-view-scope.service";

/**
 * MPB-028(a) PR-3 Evidence Activation.
 *
 * Bilinçli olarak dar: bu controller yalnız shadow-diff hesaplamasını tetikler ve
 * biriken kanıtı okur. Hiçbir consumer/workflow/scheduler/UI bu endpoint'leri
 * çağırmaz; tetikleme yalnız bu PR kapsamındaki manuel/lokal doğrulama amaçlıdır.
 * `LEGAL_TIME_SHADOW_ENABLED` kapalıyken (varsayılan) compute endpoint'i hiçbir
 * satır yazmaz, `triggered: false` döner.
 */
// F02-D-2 dilim 5 (owner ek talimatı 30.10.2026): VIEWER gölge hesap tetikleyemez (`compute` LegalTimeShadowDiff YAZAR). Kapalı kural OWN-13 §51 / AK-1a / B4-B6 `ViewerWriteDenyGuard`; okuma uçları DEĞİŞMEZ.
@Controller("legal-time-shadow")
@UseGuards(JwtAuthGuard, ViewerWriteDenyGuard)
export class LegalTimeShadowController {
  constructor(
    private legalTimeShadowService: LegalTimeShadowService,
    @Optional() private readonly caseViewScope?: CaseViewScopeService,
  ) {}
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
  async evidenceReport(@CurrentUser("tenantId") tenantId: string, @CurrentUser("id") actorUserId?: string) {
    // S6: gölge fark raporu yalnız aktörün görebildiği dosyaların satırlarından üretilir.
    const caseFilter = await requireCaseViewScope(this.caseViewScope)?.caseRowFilter(tenantId, actorUserId);
    return caseFilter ? this.legalTimeShadowService.buildEvidenceReport(tenantId, caseFilter) : this.legalTimeShadowService.buildEvidenceReport(tenantId); // bayrak kapalı: bugünkü çağrı aynen
  }
}
