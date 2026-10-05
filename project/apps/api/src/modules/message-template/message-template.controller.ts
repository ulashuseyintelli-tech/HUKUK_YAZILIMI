import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards, Req } from '@nestjs/common';
import { MessageTemplateService, CreateMessageTemplateDto, UpdateMessageTemplateDto, TemplateTokens } from './message-template.service';
import { AuthGuard } from '@nestjs/passport';
import { MessageTemplateCategory, MessageTemplateChannel } from '@prisma/client';
import { Request } from 'express';
import { OfficeF01AuthorizationGuard } from '../office-approval/office-f01-authorization.guard';

interface AuthRequest extends Request {
  user: { id: string; tenantId: string };
}

/**
 * ŞABLON YAZMA KAPISI (owner kararı 4, 05.10.2026). Şablon metni müvekkile giden e-postanın içeriğidir; YAZMA uçları
 * (oluştur / güncelle / sil / varsayılanları oluştur) büro ayarlarının yazma rotalarıyla AYNI F01 kapısını taşır
 * (`OfficeF01AuthorizationGuard`: VIEWER elenir — bağlı avukatı PARTNER / MANAGER / delege olsa bile; yazan = ADMIN ya da
 * aynı büroya bağlı, personel olmayan PARTNER / MANAGER / delege avukat). Yeni rol, yeni izin kodu, yeni politika YOKTUR.
 * Kapı handler düzeyindedir: F01 guard'ı GET dışındaki her fiili yazma sayar; sınıf düzeyinde bağlansaydı şablonu YAZMAYAN
 * önizleme (`:id/render`) ve OKUMA uçları da F01 aktörüne kısıtlanırdı — bunların davranışı DEĞİŞMEZ.
 *
 * <remarks>
 * Çağrıldığı yerler:
 * - web: yok (şablon yazan arayüz bulunmuyor; `api.seedMessageTemplates` tanımlı, çağrılmıyor)
 * </remarks>
 */
@Controller('message-templates')
@UseGuards(AuthGuard('jwt'))
export class MessageTemplateController {
  constructor(private readonly service: MessageTemplateService) {}

  @Get()
  async findAll(
    @Req() req: AuthRequest,
    @Query('category') category?: MessageTemplateCategory,
    @Query('channel') channel?: MessageTemplateChannel,
    @Query('isActive') isActive?: string,
  ) {
    return this.service.findAll(req.user.tenantId, {
      category,
      channel,
      isActive: isActive === 'true' ? true : isActive === 'false' ? false : undefined,
    });
  }

  @Get('by-code/:code')
  async findByCode(@Req() req: AuthRequest, @Param('code') code: string) {
    return this.service.findByCode(req.user.tenantId, code);
  }

  @Get(':id')
  async findOne(@Req() req: AuthRequest, @Param('id') id: string) {
    return this.service.findOne(req.user.tenantId, id);
  }

  @Post()
  @UseGuards(OfficeF01AuthorizationGuard)
  async create(@Req() req: AuthRequest, @Body() dto: CreateMessageTemplateDto) {
    return this.service.create(req.user.tenantId, dto);
  }

  @Put(':id')
  @UseGuards(OfficeF01AuthorizationGuard)
  async update(@Req() req: AuthRequest, @Param('id') id: string, @Body() dto: UpdateMessageTemplateDto) {
    return this.service.update(req.user.tenantId, id, dto);
  }

  @Delete(':id')
  @UseGuards(OfficeF01AuthorizationGuard)
  async delete(@Req() req: AuthRequest, @Param('id') id: string) {
    return this.service.delete(req.user.tenantId, id);
  }

  // Şablonu render et (önizleme için) — şablonu YAZMAZ: F01 kapısı yok, davranış değişmez
  @Post(':id/render')
  async renderTemplate(@Req() req: AuthRequest, @Param('id') id: string, @Body() tokens: TemplateTokens) {
    const template = await this.service.findOne(req.user.tenantId, id);
    return this.service.renderTemplate(template, tokens);
  }

  // Varsayılan şablonları oluştur
  @Post('seed')
  @UseGuards(OfficeF01AuthorizationGuard)
  async seedDefaults(@Req() req: AuthRequest) {
    return this.service.seedDefaultTemplates(req.user.tenantId);
  }
}
