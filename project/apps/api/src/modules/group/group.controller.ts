import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { GroupService } from './group.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@Controller('groups')
@UseGuards(JwtAuthGuard)
export class GroupController {
  constructor(private readonly service: GroupService) {}

  // Tüm grupları listele
  @Get()
  async findAll(
    @CurrentUser('tenantId') tenantId: string,
    @Query('clientId') clientId?: string,
  ) {
    const data = await this.service.findAll(tenantId, clientId);
    return { success: true, data };
  }

  // Grup detayı
  @Get(':id')
  async findOne(
    @CurrentUser('tenantId') tenantId: string,
    @Param('id') id: string,
  ) {
    const data = await this.service.findOne(tenantId, id);
    return { success: true, data };
  }

  // Yeni grup oluştur
  @Post()
  async create(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentUser('id') userId: string,
    @Body() body: any,
  ) {
    const data = await this.service.create(tenantId, userId, body);
    return { success: true, data };
  }

  // Grup güncelle
  @Put(':id')
  async update(
    @CurrentUser('tenantId') tenantId: string,
    @Param('id') id: string,
    @Body() body: any,
  ) {
    const data = await this.service.update(tenantId, id, body);
    return { success: true, data };
  }

  // Grup sil
  @Delete(':id')
  async delete(
    @CurrentUser('tenantId') tenantId: string,
    @Param('id') id: string,
  ) {
    await this.service.delete(tenantId, id);
    return { success: true, message: 'Grup silindi' };
  }
}

// Case-Group ilişkileri için ayrı controller
@Controller('cases/:caseId/groups')
@UseGuards(JwtAuthGuard)
export class CaseGroupController {
  constructor(private readonly service: GroupService) {}

  // Dosyanın gruplarını getir
  @Get()
  async getCaseGroups(@Param('caseId') caseId: string) {
    const data = await this.service.getCaseGroups(caseId);
    return { success: true, data };
  }

  // Dosyaya grup ata
  @Post(':groupId')
  async assignGroup(
    @CurrentUser('id') userId: string,
    @Param('caseId') caseId: string,
    @Param('groupId') groupId: string,
  ) {
    const data = await this.service.assignGroupToCase(caseId, groupId, userId);
    return { success: true, data };
  }

  // Dosyadan grup çıkar
  @Delete(':groupId')
  async removeGroup(
    @Param('caseId') caseId: string,
    @Param('groupId') groupId: string,
  ) {
    await this.service.removeGroupFromCase(caseId, groupId);
    return { success: true, message: 'Grup çıkarıldı' };
  }
}
