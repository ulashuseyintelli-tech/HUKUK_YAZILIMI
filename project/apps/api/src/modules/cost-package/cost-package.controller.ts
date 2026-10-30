import { Controller, Get, Post, Body, Param, Query, UseGuards, Req } from '@nestjs/common';
import { CostPackageService, ComputeExpenseParams } from './cost-package.service';
import { AuthGuard } from '@nestjs/passport';
import { AllowViewerReadOnlyPost, ViewerWriteDenyGuard } from '../auth/guards/viewer-write-deny.guard';
import { Request } from 'express';

interface AuthRequest extends Request {
  user: { id: string; tenantId: string };
}

// F02-D-2 dilim 3 (owner "Burada başla" + ek talimat 30.10.2026): VIEWER kiracıya özel masraf paketi OLUŞTURAMAZ (yazma). `compute` saf hesap (okuma) → açık. Ölçülen boşluk:
// yalnız JWT; CostPackageService rol sormuyor. Kapalı kural OWN-13 §51 / AK-1a / B4-B6 `ViewerWriteDenyGuard` (AuthGuard('jwt')'den SONRA).
@Controller('cost-packages')
@UseGuards(AuthGuard('jwt'), ViewerWriteDenyGuard)
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
   * Dosya çağıranın bürosunda aranır: başka büronun dosyası, var olmayan dosyayla aynı 404 "Takip bulunamadı" alır.
   */
  @AllowViewerReadOnlyPost() // saf: masraf önerisi hesabı (computeExpenseRequest yalnız okur) — DB yazma / denetim izi / dış çağrı yok (servis kaynağı yan etki haritası)
  @Post('compute')
  async computeExpenseRequest(
    @Body() body: ComputeExpenseParams,
    @Req() req: AuthRequest,
  ) {
    return this.costPackageService.computeExpenseRequest(req.user.tenantId, body);
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
