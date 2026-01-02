import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards, Req } from '@nestjs/common';
import { MessageTemplateService, CreateMessageTemplateDto, UpdateMessageTemplateDto, TemplateTokens } from './message-template.service';
import { AuthGuard } from '@nestjs/passport';
import { MessageTemplateCategory, MessageTemplateChannel } from '@prisma/client';
import { Request } from 'express';

interface AuthRequest extends Request {
  user: { id: string; tenantId: string };
}

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
  async create(@Req() req: AuthRequest, @Body() dto: CreateMessageTemplateDto) {
    return this.service.create(req.user.tenantId, dto);
  }

  @Put(':id')
  async update(@Req() req: AuthRequest, @Param('id') id: string, @Body() dto: UpdateMessageTemplateDto) {
    return this.service.update(req.user.tenantId, id, dto);
  }

  @Delete(':id')
  async delete(@Req() req: AuthRequest, @Param('id') id: string) {
    return this.service.delete(req.user.tenantId, id);
  }

  // Şablonu render et (önizleme için)
  @Post(':id/render')
  async renderTemplate(@Req() req: AuthRequest, @Param('id') id: string, @Body() tokens: TemplateTokens) {
    const template = await this.service.findOne(req.user.tenantId, id);
    return this.service.renderTemplate(template, tokens);
  }

  // Varsayılan şablonları oluştur
  @Post('seed')
  async seedDefaults(@Req() req: AuthRequest) {
    return this.service.seedDefaultTemplates(req.user.tenantId);
  }
}
