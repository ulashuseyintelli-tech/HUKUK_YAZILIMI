import { Controller, Get, Post, Body, Param, Query, UseGuards, Req } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ViewerWriteDenyGuard } from '../auth/guards/viewer-write-deny.guard';
import { Request } from 'express';
import { ExpenseBlockStatus } from '@prisma/client';
import { ExpenseBlockReasonService } from './expense-block-reason.service';
import {
  CreateExpenseBlockReasonDto,
  TransitionExpenseBlockReasonDto,
} from './dto/expense-block-reason.dto';

interface AuthRequest extends Request {
  user: { id: string; tenantId: string };
}

/**
 * Masraf Blok Gerekçesi controller (PR-1).
 * Yalnız create + transition (resolve/cancel) + list. İçerik PATCH/PUT/DELETE YOK (immutability).
 * tenantId/userId daima CurrentUser'dan (req.user), body'den ASLA.
 */
// F02-D-2 dilim 5 (owner ek talimatı 30.10.2026): VIEWER masraf blokaj nedeni açamaz / çözemez / iptal edemez (3 yazma). Kapalı kural OWN-13 §51 / AK-1a / B4-B6 `ViewerWriteDenyGuard`; okuma uçları DEĞİŞMEZ.
@Controller('expense-block-reasons')
@UseGuards(AuthGuard('jwt'), ViewerWriteDenyGuard)
export class ExpenseBlockReasonController {
  constructor(private readonly service: ExpenseBlockReasonService) {}

  /**
   * Savunma kaydı oluştur (OPEN)
   * POST /expense-block-reasons/case/:caseId
   */
  @Post('case/:caseId')
  async create(
    @Req() req: AuthRequest,
    @Param('caseId') caseId: string,
    @Body() dto: CreateExpenseBlockReasonDto,
  ) {
    return this.service.create(req.user.tenantId, caseId, req.user.id, dto);
  }

  /**
   * Gerekçeyi çöz (OPEN → RESOLVED)
   * POST /expense-block-reasons/:id/resolve
   */
  @Post(':id/resolve')
  async resolve(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body() body: TransitionExpenseBlockReasonDto,
  ) {
    return this.service.resolve(req.user.tenantId, id, req.user.id, body.note);
  }

  /**
   * Gerekçeyi iptal et (OPEN → CANCELLED) — silinmez
   * POST /expense-block-reasons/:id/cancel
   */
  @Post(':id/cancel')
  async cancel(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body() body: TransitionExpenseBlockReasonDto,
  ) {
    return this.service.cancel(req.user.tenantId, id, req.user.id, body.note);
  }

  /**
   * Dosya bazlı liste (default: OPEN)
   * GET /expense-block-reasons/case/:caseId?status=OPEN
   */
  @Get('case/:caseId')
  async listByCase(
    @Req() req: AuthRequest,
    @Param('caseId') caseId: string,
    @Query('status') status?: ExpenseBlockStatus,
  ) {
    return this.service.listByCase(req.user.tenantId, caseId, status);
  }
}
