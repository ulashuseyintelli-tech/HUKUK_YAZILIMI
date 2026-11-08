import { Controller, Get, Post, Put, Delete, Param, Body, UseGuards, Request } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ViewerWriteDenyGuard } from '../auth/guards/viewer-write-deny.guard';
import { CaseViewScoped } from '../case/case-view-scope.guard';
import { CaseCollateralService, CreateCollateralDto, UpdateCollateralDto } from './case-collateral.service';

@Controller('case-collaterals')
// F02-D / J-27: VIEWER yazma reddi (kapalı kural; B4/B6 yüklemi). Okuma değişmez.
@UseGuards(JwtAuthGuard, ViewerWriteDenyGuard)
export class CaseCollateralController {
  constructor(private readonly service: CaseCollateralService) {}

  /**
   * Yeni teminat ekle
   * POST /api/case-collaterals
   */
  @Post()
  async create(@Request() req: any, @Body() dto: CreateCollateralDto) {
    return this.service.create(req.user.tenantId, req.user.id, dto);
  }

  /**
   * Dosyaya ait tum teminatlari getir
   * GET /api/case-collaterals/case/:caseId
   */
  @CaseViewScoped() // F02 P3-D3b-1: dosya görünüm kapsamı (bayrak açıkken; kapsam dışı / yok 404)
  @Get('case/:caseId')
  async findAllByCase(@Request() req: any, @Param('caseId') caseId: string) {
    return this.service.findAllByCase(req.user.tenantId, caseId);
  }

  /**
   * Tek teminat getir
   * GET /api/case-collaterals/:id
   */
  @Get(':id')
  async findOne(@Request() req: any, @Param('id') id: string) {
    return this.service.findOne(req.user.tenantId, id);
  }

  /**
   * Teminat guncelle
   * PUT /api/case-collaterals/:id
   */
  @Put(':id')
  async update(@Request() req: any, @Param('id') id: string, @Body() dto: UpdateCollateralDto) {
    return this.service.update(req.user.tenantId, id, dto);
  }

  /**
   * Teminat sil
   * DELETE /api/case-collaterals/:id
   */
  @Delete(':id')
  async remove(@Request() req: any, @Param('id') id: string) {
    return this.service.remove(req.user.tenantId, id);
  }

  /**
   * Toplam teminat degeri
   * GET /api/case-collaterals/case/:caseId/total
   */
  @CaseViewScoped() // F02 P3-D3b-1: dosya görünüm kapsamı (bayrak açıkken; kapsam dışı / yok 404)
  @Get('case/:caseId/total')
  async getTotalValue(@Request() req: any, @Param('caseId') caseId: string) {
    return this.service.getTotalValue(req.user.tenantId, caseId);
  }
}
