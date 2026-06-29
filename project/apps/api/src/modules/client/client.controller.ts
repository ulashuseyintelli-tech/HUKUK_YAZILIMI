import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards, Request, Query, ForbiddenException, NotFoundException } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ClientService } from './client.service';

/** C0-a: actor compile-time shape — req.user JWT validate'ten gelen User; id+tenantId auth context. */
interface AuthRequest {
  user: { id: string; tenantId: string; role?: string };
}

@Controller('clients')
@UseGuards(JwtAuthGuard)
export class ClientController {
  constructor(private clientService: ClientService) {}

  // Tüm müvekkilleri listele
  @Get()
  async findAll(@Request() req: any, @Query('type') type?: string, @Query('search') search?: string) {
    const tenantId = req.user.tenantId;
    if (search) {
      return { data: await this.clientService.search(tenantId, search) };
    }
    return { data: await this.clientService.findAll(tenantId, type) };
  }

  // Tek müvekkil getir
  @Get(':id')
  async findOne(@Request() req: any, @Param('id') id: string) {
    const tenantId = req.user.tenantId;
    const client = await this.clientService.findOne(id, tenantId);
    // P0.4: bulunamayan kayıt 404 (eski: HTTP 200 + {error} → FE !response.ok kontrolü "başarı" sanıyordu).
    if (!client) throw new NotFoundException('Müvekkil bulunamadı');
    return { data: client };
  }

  // Yeni müvekkil oluştur
  @Post()
  async create(@Request() req: AuthRequest, @Body() body: any) {
    const tenantId = req.user.tenantId;
    // C0-a: actor YALNIZ req.user.id (auth); body'den userId ASLA okunmaz.
    // P0.4: hata yutma YOK — service exception'ları (NotFound/Conflict/500) gerçek HTTP status ile FE'ye gider.
    const client = await this.clientService.create(tenantId, body, { userId: req.user.id });
    return { data: client };
  }

  // TEK SEFERLİK BAKIM (admin): özellik öncesi oluşmuş eksik müvekkillere görev/rozet üret.
  // Idempotent; dedupeKey ile mükerrer görev oluşmaz.
  @Post('backfill-contact-followup')
  async backfillContactFollowUp(@Request() req: any) {
    if (req.user?.role !== 'ADMIN') {
      throw new ForbiddenException('Bu işlem yalnızca admin tarafından yapılabilir');
    }
    return this.clientService.backfillContactFollowUp(req.user.tenantId);
  }

  // Müvekkil güncelle
  @Put(':id')
  async update(@Request() req: AuthRequest, @Param('id') id: string, @Body() body: any) {
    const tenantId = req.user.tenantId;
    // P0.4: hata yutma YOK. PR-U4 409 DUPLICATE_IDENTITY (ConflictException) ve 404 NotFound
    // doğrudan gerçek HTTP status ile FE'ye gider (eski catch HTTP 200 {error} üretiyordu).
    const client = await this.clientService.update(id, tenantId, body, { userId: req.user.id });
    return { data: client };
  }

  // Müvekkil sil
  @Delete(':id')
  async remove(@Request() req: AuthRequest, @Param('id') id: string) {
    const tenantId = req.user.tenantId;
    // P0.4: hata yutma YOK — bulunamayan kayıt gerçek HTTP status (404) döner.
    await this.clientService.remove(id, tenantId, { userId: req.user.id });
    return { success: true };
  }
}
