import { Controller, Get, Post, Param, Query, UseGuards, Optional } from "@nestjs/common";
import { RiskService } from "./risk.service";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { ViewerWriteDenyGuard } from "../auth/guards/viewer-write-deny.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { CaseViewScoped } from "../case/case-view-scope.guard";
import { CaseViewScopeService, requireCaseViewScope } from "../case/case-view-scope.service";

// F02-D-2 dilim 5 (owner ek talimatı 30.10.2026): VIEWER risk analizi tetikleyemez (RiskReport YAZAR). Kapalı kural OWN-13 §51 / AK-1a / B4-B6 `ViewerWriteDenyGuard`; okuma uçları DEĞİŞMEZ.
@Controller("risk")
@UseGuards(JwtAuthGuard, ViewerWriteDenyGuard)
export class RiskController {
  constructor(
    private riskService: RiskService,
    @Optional() private readonly caseViewScope?: CaseViewScopeService,
  ) {}
  // Dosya için risk analizi yap
  @Post("case/:caseId/analyze")
  async analyzeCase(@CurrentUser() user: any, @Param("caseId") caseId: string) {
    return this.riskService.analyzeCase(user.tenantId, caseId);
  }

  // Son risk raporu
  @Get("case/:caseId/latest")
  @CaseViewScoped() // F02 P3 tarama S5–S7: dosya görünüm kapsamı (bayrak açıkken; kapsam dışı / yok 404)
  async getLatestReport(@CurrentUser() user: any, @Param("caseId") caseId: string) {
    return this.riskService.getLatestReport(user.tenantId, caseId);
  }

  // Risk raporu geçmişi
  @Get("case/:caseId/history")
  @CaseViewScoped() // F02 P3 tarama S5–S7: dosya görünüm kapsamı (bayrak açıkken; kapsam dışı / yok 404)
  async getReportHistory(@CurrentUser() user: any, @Param("caseId") caseId: string) {
    return this.riskService.getReportHistory(user.tenantId, caseId);
  }

  // Yüksek riskli dosyalar
  @Get("high-risk")
  async getHighRiskCases(
    @CurrentUser() user: any,
    @Query("limit") limit?: string
  ) {
    // S6: yüksek riskli dosya listesi aktörün görebildiği dosyalarla sınırlı (dosya listesiyle aynı kapsam).
    const caseFilter = await requireCaseViewScope(this.caseViewScope)?.caseRowFilter(user.tenantId, user.id);
    return this.riskService.getHighRiskCases(
      user.tenantId,
      limit ? parseInt(limit) : 10,
      caseFilter
    );
  }

  // Risk istatistikleri
  @Get("stats")
  async getRiskStats(@CurrentUser() user: any) {
    return this.riskService.getRiskStats(user.tenantId);
  }
}
