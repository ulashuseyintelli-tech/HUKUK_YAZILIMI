import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { LookupService, LookupType } from './lookup.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@Controller('lookups')
@UseGuards(JwtAuthGuard)
export class LookupController {
  constructor(private readonly service: LookupService) {}

  // Tüm lookup tiplerini tek seferde getir
  @Get()
  async getAllLookups(@CurrentUser('tenantId') tenantId: string) {
    const data = await this.service.getAllLookups(tenantId);
    return { success: true, data };
  }

  // Belirli bir lookup tipinin tüm değerlerini getir
  @Get(':type')
  async findAll(
    @CurrentUser('tenantId') tenantId: string,
    @Param('type') type: LookupType,
    @Query('includeInactive') includeInactive?: string,
  ) {
    const data = await this.service.findAll(tenantId, type, includeInactive === 'true');
    return { success: true, data };
  }

  // Belirli bir lookup değerini getir
  @Get(':type/:id')
  async findOne(
    @CurrentUser('tenantId') tenantId: string,
    @Param('type') type: LookupType,
    @Param('id') id: string,
  ) {
    const data = await this.service.findOne(tenantId, type, id);
    return { success: true, data };
  }

  // Yeni lookup değeri ekle (admin)
  @Post(':type')
  async create(
    @CurrentUser('tenantId') tenantId: string,
    @Param('type') type: LookupType,
    @Body() body: any,
  ) {
    const data = await this.service.create(tenantId, type, body);
    return { success: true, data };
  }

  // Lookup değerini güncelle (admin)
  @Put(':type/:id')
  async update(
    @CurrentUser('tenantId') tenantId: string,
    @Param('type') type: LookupType,
    @Param('id') id: string,
    @Body() body: any,
  ) {
    const data = await this.service.update(tenantId, type, id, body);
    return { success: true, data };
  }

  // Lookup değerini sil (soft delete - admin)
  @Delete(':type/:id')
  async delete(
    @CurrentUser('tenantId') tenantId: string,
    @Param('type') type: LookupType,
    @Param('id') id: string,
  ) {
    await this.service.delete(tenantId, type, id);
    return { success: true, message: 'Silindi' };
  }
}
