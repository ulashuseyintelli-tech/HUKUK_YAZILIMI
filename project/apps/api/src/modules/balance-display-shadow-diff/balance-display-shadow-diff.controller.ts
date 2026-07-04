import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { BalanceDisplayShadowDiffService } from './balance-display-shadow-diff.service';
import type { BalanceDisplayShadowDiffReport } from './balance-display-shadow-diff.types';

@Controller('interest-engine')
export class BalanceDisplayShadowDiffController {
  constructor(private readonly shadowDiff: BalanceDisplayShadowDiffService) {}

  /**
   * GET /interest-engine/case/:caseId/balance/display/shadow-diff
   *
   * READ-ONLY shadow evidence: legacy calculation-summary DTO ile hardened balance/display
   * DTO'sunu aynı tenant/case/date bağlamında yan yana üretir. UI cutover yapmaz.
   * tenantId yalnız auth context'ten alınır; client/body/query tenantId kabul edilmez.
   *
   * <remarks>
   * Çağrıldığı yerler:
   * - HTTP GET /interest-engine/case/:caseId/balance/display/shadow-diff (UI cutover öncesi backend evidence)
   * </remarks>
   */
  @Get('case/:caseId/balance/display/shadow-diff')
  @UseGuards(JwtAuthGuard)
  async getShadowDiff(
    @CurrentUser('tenantId') tenantId: string,
    @Param('caseId') caseId: string,
    @Query('asOfDate') asOfDate?: string,
    @Query('date') date?: string,
  ): Promise<BalanceDisplayShadowDiffReport> {
    const generatedAt = new Date().toISOString();
    const effectiveDate = asOfDate ?? date ?? generatedAt.slice(0, 10);
    return this.shadowDiff.compare(tenantId, caseId, effectiveDate, generatedAt);
  }
}
