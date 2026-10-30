import { Controller, Get, Post, Param, Query, UseGuards } from "@nestjs/common";
import { RiskService } from "./risk.service";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { ViewerWriteDenyGuard } from "../auth/guards/viewer-write-deny.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";

// F02-D-2 dilim 5 (owner ek talimatı 30.10.2026): VIEWER risk analizi tetikleyemez (RiskReport YAZAR). Kapalı kural OWN-13 §51 / AK-1a / B4-B6 `ViewerWriteDenyGuard`; okuma uçları DEĞİŞMEZ.
@Controller("risk")
@UseGuards(JwtAuthGuard, ViewerWriteDenyGuard)
export class RiskController {
  constructor(private riskService: RiskService) {}

  // Dosya için risk analizi yap
  @Post("case/:caseId/analyze")
  async analyzeCase(@CurrentUser() user: any, @Param("caseId") caseId: string) {
    return this.riskService.analyzeCase(user.tenantId, caseId);
  }

  // Son risk raporu
  @Get("case/:caseId/latest")
  async getLatestReport(@CurrentUser() user: any, @Param("caseId") caseId: string) {
    return this.riskService.getLatestReport(user.tenantId, caseId);
  }

  // Risk raporu geçmişi
  @Get("case/:caseId/history")
  async getReportHistory(@CurrentUser() user: any, @Param("caseId") caseId: string) {
    return this.riskService.getReportHistory(user.tenantId, caseId);
  }

  // Yüksek riskli dosyalar
  @Get("high-risk")
  async getHighRiskCases(
    @CurrentUser() user: any,
    @Query("limit") limit?: string
  ) {
    return this.riskService.getHighRiskCases(
      user.tenantId,
      limit ? parseInt(limit) : 10
    );
  }

  // Risk istatistikleri
  @Get("stats")
  async getRiskStats(@CurrentUser() user: any) {
    return this.riskService.getRiskStats(user.tenantId);
  }
}
