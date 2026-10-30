import { Controller, Get, Post, Put, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ExecutionOfficeService } from './execution-office.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ViewerWriteDenyGuard } from '../auth/guards/viewer-write-deny.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

// F02-D-2 dilim 5 (owner ek talimatı 30.10.2026): VIEWER icra dairesi oluşturamaz / güncelleyemez / tohumlayamaz (3 yazma). Kapalı kural OWN-13 §51 / AK-1a / B4-B6 `ViewerWriteDenyGuard`; okuma uçları DEĞİŞMEZ.
@Controller('execution-offices')
@UseGuards(JwtAuthGuard, ViewerWriteDenyGuard)
export class ExecutionOfficeController {
  constructor(private readonly service: ExecutionOfficeService) {}

  @Get()
  async findAll(
    @CurrentUser('tenantId') tenantId: string,
    @Query('city') city?: string,
  ) {
    const data = await this.service.findAll(tenantId, city);
    return { success: true, data };
  }

  @Get('cities')
  async getCities(@CurrentUser('tenantId') tenantId: string) {
    const data = await this.service.getCities(tenantId);
    return { success: true, data };
  }

  @Get(':id')
  async findOne(
    @CurrentUser('tenantId') tenantId: string,
    @Param('id') id: string,
  ) {
    const data = await this.service.findOne(tenantId, id);
    return { success: true, data };
  }

  @Post()
  async create(
    @CurrentUser('tenantId') tenantId: string,
    @Body() body: any,
  ) {
    const data = await this.service.create(tenantId, body);
    return { success: true, data };
  }

  @Post('seed')
  async seed(@CurrentUser('tenantId') tenantId: string) {
    await this.service.seedDefaultOffices(tenantId);
    return { success: true, message: 'Default offices seeded' };
  }

  @Put(':id')
  async update(
    @CurrentUser('tenantId') tenantId: string,
    @Param('id') id: string,
    @Body() body: any,
  ) {
    const data = await this.service.update(tenantId, id, body);
    return { success: true, data };
  }
}
