import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards, Request, Query } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { StaffService } from './staff.service';
import { StaffType } from '@prisma/client';

@Controller('staff')
@UseGuards(JwtAuthGuard)
export class StaffController {
  constructor(private staffService: StaffService) {}

  // Tüm personeli listele
  @Get()
  async findAll(@Request() req: any, @Query('type') type?: string) {
    const tenantId = req.user.tenantId;
    if (type) {
      return { data: await this.staffService.findByType(tenantId, type as StaffType) };
    }
    return { data: await this.staffService.findAll(tenantId) };
  }

  // Tek personel getir
  @Get(':id')
  async findOne(@Request() req: any, @Param('id') id: string) {
    const tenantId = req.user.tenantId;
    const staff = await this.staffService.findOne(id, tenantId);
    if (!staff) {
      return { error: 'Personel bulunamadı' };
    }
    return { data: staff };
  }

  // Yeni personel ekle
  @Post()
  async create(@Request() req: any, @Body() body: any) {
    const tenantId = req.user.tenantId;
    try {
      const staff = await this.staffService.create(tenantId, body);
      return { data: staff };
    } catch (error: any) {
      return { error: error.message };
    }
  }

  // Personel güncelle
  @Put(':id')
  async update(@Request() req: any, @Param('id') id: string, @Body() body: any) {
    const tenantId = req.user.tenantId;
    try {
      const staff = await this.staffService.update(id, tenantId, body);
      return { data: staff };
    } catch (error: any) {
      return { error: error.message };
    }
  }

  // Personel sil
  @Delete(':id')
  async remove(@Request() req: any, @Param('id') id: string) {
    const tenantId = req.user.tenantId;
    try {
      await this.staffService.remove(id, tenantId);
      return { success: true };
    } catch (error: any) {
      return { error: error.message };
    }
  }
}
