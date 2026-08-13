import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards, Request, Query, HttpException } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { StaffService } from './staff.service';
import { StaffType } from '@prisma/client';
import { OfficeF01AuthorizationGuard } from '../office-approval/office-f01-authorization.guard';
import { OfficeApprovalService } from '../office-approval/office-approval.service';
import { projectStaffRowForActor, projectStaffRowsForActor } from './staff-public-projection';
import { CreateStaffDto, UpdateStaffDto, UpdateStaffOrderDto } from './dto/staff.dto';

@Controller('staff')
@UseGuards(JwtAuthGuard)
export class StaffController {
  constructor(
    private staffService: StaffService,
    // P5-B04 (S3): okuma yüzeyi kapı DEĞİL projeksiyon — aktörün F01 yetkisi burada
    // sorulur, yanıt alan-daraltmasından geçer. Mutasyon kapısı (F01 guard) DEĞİŞMEZ.
    private officeApproval: OfficeApprovalService,
  ) {}

  // Tüm personeli listele
  @Get()
  async findAll(@Request() req: any, @Query('type') type?: string) {
    const tenantId = req.user.tenantId;
    const authorized = await this.officeApproval.isF01ActorAuthorized(req.user.id, tenantId);
    const rows = type
      ? await this.staffService.findByType(tenantId, type as StaffType)
      : await this.staffService.findAll(tenantId);
    // P5-B04 (S3): F01-yetkisiz aktöre yetki bayrakları + tckn anahtarı düşürülür;
    // yetkili aktörün yanıtı birebir bugünkü gibidir.
    return { data: projectStaffRowsForActor(rows, authorized) };
  }

  // Tek personel getir
  @Get(':id')
  async findOne(@Request() req: any, @Param('id') id: string) {
    const tenantId = req.user.tenantId;
    const staff = await this.staffService.findOne(id, tenantId);
    if (!staff) {
      return { error: 'Personel bulunamadı' };
    }
    const authorized = await this.officeApproval.isF01ActorAuthorized(req.user.id, tenantId);
    return { data: projectStaffRowForActor(staff, authorized) };
  }

  // Yeni personel ekle
  @Post()
  @UseGuards(OfficeF01AuthorizationGuard)
  async create(@Request() req: any, @Body() body: CreateStaffDto) {
    const tenantId = req.user.tenantId;
    try {
      const staff = await this.staffService.create(tenantId, body);
      return { data: staff };
    } catch (error: any) {
      // PR-S: yapısal HttpException'lar (örn. 409 SIMILAR_NAME_REVIEW) frontend'e olduğu gibi
      // geçmeli — yutup 200 { error } döndürmek review-dialog'u kırardı.
      if (error instanceof HttpException) throw error;
      return { error: error.message };
    }
  }

  // Personel güncelle
  @Put(':id')
  @UseGuards(OfficeF01AuthorizationGuard)
  async update(@Request() req: any, @Param('id') id: string, @Body() body: UpdateStaffDto) {
    const tenantId = req.user.tenantId;
    try {
      const staff = await this.staffService.update(id, tenantId, body);
      return { data: staff };
    } catch (error: any) {
      // PR-U3: yapısal HttpException'lar (409 SIMILAR_NAME_REVIEW/DUPLICATE_IDENTITY) frontend'e
      // olduğu gibi geçmeli — yutup 200 { error } döndürmek review-dialog'u kırardı.
      if (error instanceof HttpException) throw error;
      return { error: error.message };
    }
  }

  // Personel sil
  @Delete(':id')
  @UseGuards(OfficeF01AuthorizationGuard)
  async remove(@Request() req: any, @Param('id') id: string) {
    const tenantId = req.user.tenantId;
    try {
      await this.staffService.remove(id, tenantId);
      return { success: true };
    } catch (error: any) {
      return { error: error.message };
    }
  }

  // Sıralama güncelle
  @Put('order/update')
  @UseGuards(OfficeF01AuthorizationGuard)
  async updateOrder(@Request() req: any, @Body() body: UpdateStaffOrderDto) {
    const tenantId = req.user.tenantId;
    try {
      await this.staffService.updateOrder(tenantId, body.staffIds);
      return { success: true };
    } catch (error: any) {
      return { error: error.message };
    }
  }
}
