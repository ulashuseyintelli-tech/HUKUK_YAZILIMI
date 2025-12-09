import { Controller, Get, Post, Param, Query, UseGuards } from "@nestjs/common";
import { RiskService } from "./risk.service";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";

@Controller("risk")
@UseGuards(JwtAuthGuard)
export class RiskController {
  constructor(private riskService: RiskService) {}

  // Dosya için risk analizi yap
  @Post("case/:caseId/analyze")
  async analyzeCase(@Param("caseId") caseId: string) {
    return this.riskService.analyzeCase(caseId);
  }

  // Son risk raporu
  @Get("case/:caseId/latest")
  async getLatestReport(@Param("caseId") caseId: string) {
    return this.riskService.getLatestReport(caseId);
  }

  // Risk raporu geçmişi
  @Get("case/:caseId/history")
  async getReportHistory(@Param("caseId") caseId: string) {
    return this.riskService.getReportHistory(caseId);
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
