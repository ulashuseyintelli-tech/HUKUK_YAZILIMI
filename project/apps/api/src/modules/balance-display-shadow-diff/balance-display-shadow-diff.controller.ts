import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { BalanceDisplayShadowDiffService } from './balance-display-shadow-diff.service';
import type { BalanceDisplayShadowDiffReport } from './balance-display-shadow-diff.types';
import { turkeyToday } from '../../common/turkey-calendar';

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
    const now = new Date();
    const generatedAt = now.toISOString();
    // K3-L KP-11: varsayılan hesap tarihi Türkiye takvimine göre bugün (generatedAt'in UTC günü değil)
    const effectiveDate = asOfDate ?? date ?? turkeyToday(now);
    return this.shadowDiff.compare(tenantId, caseId, effectiveDate, generatedAt);
  }
}
