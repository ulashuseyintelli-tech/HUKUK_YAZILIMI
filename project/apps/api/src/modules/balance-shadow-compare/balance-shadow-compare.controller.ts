/**
 * G4c-3: BalanceShadowCompareController — read-only diagnostic endpoint.
 * GET /balance-compare/case/:caseId → summary-engine vs computeBalance farkı (gözlem; cutover YOK).
 */

import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { BalanceShadowCompareService, BalanceShadowCompareResult } from './balance-shadow-compare.service';

@Controller('balance-compare')
export class BalanceShadowCompareController {
  constructor(private readonly compareService: BalanceShadowCompareService) {}

  /**
   * GET /balance-compare/case/:caseId
   *
   * READ-ONLY gözlem: iki bakiye motorunu karşılaştırır. tenantId YALNIZ auth context'ten.
   * asOfDate yoksa bugün (YYYY-MM-DD). Canlı bakiye/route'lar DEĞİŞMEZ.
   *
   * <remarks>Çağrıldığı yerler: HTTP GET /balance-compare/case/:caseId (Av./ürün cutover analizi).</remarks>
   */
  @Get('case/:caseId')
  @UseGuards(JwtAuthGuard)
  async getShadowCompare(
    @CurrentUser('tenantId') tenantId: string,
    @Param('caseId') caseId: string,
    @Query('asOfDate') asOfDate?: string,
  ): Promise<BalanceShadowCompareResult> {
    const date = asOfDate ?? new Date().toISOString().slice(0, 10);
    return this.compareService.compare(tenantId, caseId, date);
  }
}
