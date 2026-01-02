import { Controller, Get, Post, Body, Param, UseGuards, Req } from '@nestjs/common';
import { CaseBalanceService, CreditBalanceDto, DebitBalanceDto } from './case-balance.service';
import { AuthGuard } from '@nestjs/passport';
import { Request } from 'express';

interface AuthRequest extends Request {
  user: { id: string; tenantId: string };
}

@Controller('cases/:caseId/balance')
@UseGuards(AuthGuard('jwt'))
export class CaseBalanceController {
  constructor(private readonly caseBalanceService: CaseBalanceService) {}

  /**
   * Dosya bakiyesini getir
   */
  @Get()
  async getBalance(
    @Param('caseId') caseId: string,
    @Req() req: AuthRequest,
  ) {
    return this.caseBalanceService.getBalance(req.user.tenantId, caseId);
  }

  /**
   * Bakiye hareketlerini listele
   */
  @Get('ledger')
  async getLedger(
    @Param('caseId') caseId: string,
    @Req() req: AuthRequest,
  ) {
    return this.caseBalanceService.getLedger(req.user.tenantId, caseId);
  }

  /**
   * Bakiyeye kredi ekle (ödeme geldi)
   * POST /cases/:caseId/balance/credit
   */
  @Post('credit')
  async credit(
    @Param('caseId') caseId: string,
    @Body() dto: CreditBalanceDto,
    @Req() req: AuthRequest,
  ) {
    return this.caseBalanceService.credit(req.user.tenantId, caseId, dto, req.user.id);
  }

  /**
   * Bakiyeden düş (masraf yapıldı)
   * POST /cases/:caseId/balance/debit
   */
  @Post('debit')
  async debit(
    @Param('caseId') caseId: string,
    @Body() dto: DebitBalanceDto,
    @Req() req: AuthRequest,
  ) {
    return this.caseBalanceService.debit(req.user.tenantId, caseId, dto, req.user.id);
  }
}
