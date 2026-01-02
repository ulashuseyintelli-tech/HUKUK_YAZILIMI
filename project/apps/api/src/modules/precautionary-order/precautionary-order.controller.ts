import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards, Req } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PrecautionaryOrderService, CreatePrecautionaryOrderDto, CreatePrecautionaryCostDto } from './precautionary-order.service';

@Controller('precautionary-orders')
@UseGuards(JwtAuthGuard)
export class PrecautionaryOrderController {
  constructor(private readonly service: PrecautionaryOrderService) {}

  /**
   * İhtiyati haciz kararı oluştur
   */
  @Post()
  async create(@Req() req: any, @Body() dto: CreatePrecautionaryOrderDto) {
    return this.service.create(req.user.tenantId, dto, req.user.id);
  }

  /**
   * İhtiyati haciz kararını getir
   */
  @Get(':id')
  async findOne(@Req() req: any, @Param('id') id: string) {
    return this.service.findOne(req.user.tenantId, id);
  }

  /**
   * Dosyaya ait ihtiyati haciz kararlarını getir
   */
  @Get('case/:caseId')
  async findByCase(@Req() req: any, @Param('caseId') caseId: string) {
    return this.service.findByCase(req.user.tenantId, caseId);
  }

  /**
   * İhtiyati haciz kararını güncelle
   */
  @Put(':id')
  async update(@Req() req: any, @Param('id') id: string, @Body() dto: Partial<CreatePrecautionaryOrderDto>) {
    return this.service.update(req.user.tenantId, id, dto);
  }

  /**
   * İhtiyati haciz kararını uygula
   */
  @Post(':id/apply')
  async apply(@Req() req: any, @Param('id') id: string) {
    return this.service.apply(req.user.tenantId, id);
  }

  /**
   * İhtiyati haciz kararını kaldır
   */
  @Post(':id/lift')
  async lift(@Req() req: any, @Param('id') id: string, @Body() body: { reason?: string }) {
    return this.service.lift(req.user.tenantId, id, body.reason);
  }

  /**
   * İhtiyati haciz kararını sil
   */
  @Delete(':id')
  async delete(@Req() req: any, @Param('id') id: string) {
    return this.service.delete(req.user.tenantId, id);
  }

  // ==================== MASRAF KALEMLERİ ====================

  /**
   * İhtiyati haciz masraf kalemi ekle
   */
  @Post(':id/costs')
  async addCost(@Req() req: any, @Param('id') id: string, @Body() dto: Omit<CreatePrecautionaryCostDto, 'precautionaryOrderId'>) {
    return this.service.addCost(req.user.tenantId, { ...dto, precautionaryOrderId: id }, req.user.id);
  }

  /**
   * İhtiyati haciz masraf kalemini güncelle
   */
  @Put('costs/:costId')
  async updateCost(@Req() req: any, @Param('costId') costId: string, @Body() dto: Partial<CreatePrecautionaryCostDto>) {
    return this.service.updateCost(req.user.tenantId, costId, dto);
  }

  /**
   * İhtiyati haciz masraf kalemini sil
   */
  @Delete('costs/:costId')
  async deleteCost(@Req() req: any, @Param('costId') costId: string) {
    return this.service.deleteCost(req.user.tenantId, costId);
  }

  /**
   * İhtiyati haciz masraflarının toplamını hesapla
   */
  @Get(':id/costs/total')
  async calculateTotalCosts(@Req() req: any, @Param('id') id: string) {
    return this.service.calculateTotalCosts(req.user.tenantId, id);
  }
}
