import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { SummaryEngineService, SummaryResult } from './summary-engine.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@Controller('summary-engine')
@UseGuards(JwtAuthGuard)
export class SummaryEngineController {
  constructor(private readonly service: SummaryEngineService) {}

  /**
   * Dosya için hesap özeti hesapla
   * GET /api/summary-engine/case/:caseId
   */
  @Get('case/:caseId')
  async getCaseSummary(
    @CurrentUser('tenantId') tenantId: string,
    @Param('caseId') caseId: string,
    @Query('asOfDate') asOfDate?: string,
  ): Promise<SummaryResult> {
    const date = asOfDate ? new Date(asOfDate) : undefined;
    return this.service.calculateSummary(tenantId, caseId, date);
  }

  /**
   * Tahsilat kaydet (TBK 100 ile otomatik dağıtım)
   * POST /api/summary-engine/case/:caseId/payment
   */
  @Post('case/:caseId/payment')
  async recordPayment(
    @CurrentUser('tenantId') tenantId: string,
    @Param('caseId') caseId: string,
    @Body() body: {
      amount: number;
      entryDate?: string;
      description?: string;
      referenceNo?: string;
      sourceType?: string;
    },
  ) {
    return this.service.recordPayment(tenantId, caseId, body.amount, {
      entryDate: body.entryDate ? new Date(body.entryDate) : undefined,
      description: body.description,
      referenceNo: body.referenceNo,
      sourceType: body.sourceType,
    });
  }

  /**
   * Kısmi talep güncelle (demandedAmount)
   * PUT /api/summary-engine/claim-item/:id/demanded-amount
   */
  @Put('claim-item/:id/demanded-amount')
  async updateDemandedAmount(
    @CurrentUser('tenantId') tenantId: string,
    @Param('id') claimItemId: string,
    @Body() body: { demandedAmount: number },
  ) {
    return this.service.updateDemandedAmount(tenantId, claimItemId, body.demandedAmount);
  }

  /**
   * Hesap motoru kurallarını getir
   * GET /api/summary-engine/rules
   */
  @Get('rules')
  getRules(): { rules: any; buckets: any; allocationOrder: string[] } {
    return {
      rules: this.service.getRules(),
      buckets: this.service.getBuckets(),
      allocationOrder: this.service.getAllocationOrder(),
    };
  }

  /**
   * Bucket listesini getir
   * GET /api/summary-engine/buckets
   */
  @Get('buckets')
  getBuckets() {
    return this.service.getBuckets();
  }

  /**
   * TBK 100 mahsup sırasını getir
   * GET /api/summary-engine/allocation-order
   */
  @Get('allocation-order')
  getAllocationOrder() {
    return {
      order: this.service.getAllocationOrder(),
      description: 'TBK 100 / BK 84 mahsup sırası',
    };
  }
}
