import { Controller, Get, Post, Body, Param, Query, UseGuards, Req } from '@nestjs/common';
import { CostPackageService, ComputeExpenseParams } from './cost-package.service';
import { AuthGuard } from '@nestjs/passport';
import { Request } from 'express';

interface AuthRequest extends Request {
  user: { id: string; tenantId: string };
}

@Controller('cost-packages')
@UseGuards(AuthGuard('jwt'))
export class CostPackageController {
  constructor(private readonly costPackageService: CostPackageService) {}

  /**
   * Tüm masraf paketlerini listele
   */
  @Get()
  async findAll(@Req() req: AuthRequest) {
    return this.costPackageService.findAll(req.user.tenantId);
  }

  /**
   * Masraf talebini hesapla
   * POST /cost-packages/compute
   * NOT: Bu endpoint :code'dan ÖNCE tanımlanmalı!
   */
  @Post('compute')
  async computeExpenseRequest(
    @Body() body: ComputeExpenseParams,
    @Req() req: AuthRequest,
  ) {
    return this.costPackageService.computeExpenseRequest(body);
  }

  /**
   * Tek bir paketi getir
   * NOT: Bu endpoint compute'dan SONRA olmalı (wildcard route)
   */
  @Get(':code')
  async findByCode(
    @Param('code') code: string,
    @Req() req: AuthRequest,
  ) {
    return this.costPackageService.findByCode(code, req.user.tenantId);
  }

  /**
   * Yeni paket oluştur (tenant'a özel)
   */
  @Post()
  async create(
    @Body() body: {
      code: string;
      name: string;
      description?: string;
      caseTypes?: string[];
      items: Array<{
        itemCode: string;
        label: string;
        defaultAmount: number;
        isEditable?: boolean;
        isRequired?: boolean;
        calcRule?: any;
      }>;
    },
    @Req() req: AuthRequest,
  ) {
    return this.costPackageService.create(req.user.tenantId, body);
  }
}
