import { Controller, Get, Post, Body, Param, Query, UseGuards, Req, ForbiddenException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Request } from 'express';
import { ClientStatementStatus } from '@prisma/client';
import { ClientStatementService } from './client-statement.service';
import { ClientStatementMonthlyDeliveryService } from './client-statement-monthly-delivery.service';
import { OfficeApprovalService } from '../office-approval/office-approval.service';
import { decideManualSchedulerRun, SCHEDULER_MANUAL_RUN_REASON } from '../scheduler/scheduler-manual-run-policy';
import {
  CreateClientStatementDto,
  CreateClientLevelStatementDto,
  SupersedeClientStatementDto,
  VoidClientStatementDto,
} from './dto/client-statement.dto';

interface AuthRequest extends Request {
  user: { id: string; tenantId: string; role: string };
}

/**
 * Müvekkil Ekstresi controller (PR-3).
 * Yalnız create(generate) + supersede + void + read. İçerik PATCH/PUT/DELETE YOK (immutability).
 * tenantId/userId daima CurrentUser'dan.
 *
 * G7 (İ12): `POST monthly-delivery/run-now` — aylık teslimi MANUEL, kimlik-doğrulamalı,
 * yetkilendirilmiş ve YALNIZ aktörün kendi tenant'ı kapsamında tetikler. Yetki modeli
 * scheduler manuel-run ile AYNI (`decideManualSchedulerRun`: VIEWER DENY + `isApproverEligible`).
 * Kapsam HER ZAMAN `req.user.tenantId`'den türetilir; istek gövdesinden tenant/kapsam ALINMAZ →
 * başka tenant'a veya (kapsam yokken) tüm tenant'lara geçiş İMKÂNSIZ. Yerleşik cron davranışı
 * (global, aylık) değişmez; bu yalnız hedef-scoped manuel bir giriştir.
 */
@Controller('client-statements')
@UseGuards(AuthGuard('jwt'))
export class ClientStatementController {
  constructor(
    private readonly service: ClientStatementService,
    private readonly monthlyDelivery: ClientStatementMonthlyDeliveryService,
    private readonly officeApproval: OfficeApprovalService,
  ) {}

  /**
   * G7 manuel aylık teslim — POST /client-statements/monthly-delivery/run-now
   * Kapsam DAİMA aktörün tenant'ı; gövde/param'dan tenant/kapsam OKUNMAZ. `runMonthlyDelivery`
   * scope={tenantId} ile çağrılır — asla `{}` (tüm tenant) değil. Aylık teslim bayrağı
   * (`CLIENT_STATEMENT_MONTHLY_DELIVERY`) kapalıysa `runMonthlyDelivery` tek sorgu bile
   * çalıştırmadan `enabled:false` döner (manuel yol yeni gönderim yeteneği AÇMAZ).
   */
  @Post('monthly-delivery/run-now')
  async runMonthlyDeliveryNow(@Req() req: AuthRequest) {
    await this.assertCanRunManualDelivery(req.user.id, req.user.tenantId, req.user.role);
    // KAPSAM aktörün tenant'ından TÜRETİLİR — istekten DEĞİL. Boş scope (tüm tenant) ASLA geçmez.
    const result = await this.monthlyDelivery.runMonthlyDelivery(new Date(), { tenantId: req.user.tenantId });
    return { record: 'CLIENT_STATEMENT_MONTHLY_DELIVERY_MANUAL_RUN', tenantId: req.user.tenantId, result };
  }

  /**
   * Yetki: scheduler manuel-run ile AYNI politika (owner F02 kararı). VIEWER DENY; elevated =
   * `OfficeApprovalService.isApproverEligible` (PARTNER veya canApproveOfficeActions). ADMIN rolü
   * TEK BAŞINA yetmez. Hiçbir yazma yapılmadan ÖNCE karar verilir; reddte ForbiddenException(reasonCode).
   */
  private async assertCanRunManualDelivery(userId: string, tenantId: string, role: string): Promise<void> {
    // FAIL-CLOSED KAPSAM KAPISI: tenantId yoksa DURULUR. Aksi halde scope={tenantId: undefined}
    // `runMonthlyDelivery` içinde TÜM aktif tenant'lara düşerdi (kapsam sızıntısı) — asla oraya varılmaz.
    if (!tenantId) {
      throw new ForbiddenException({ reasonCode: SCHEDULER_MANUAL_RUN_REASON.NO_ACTOR });
    }
    const elevatedAuthority = userId ? await this.officeApproval.isApproverEligible(userId, tenantId) : false;
    const decision = decideManualSchedulerRun({ userId, role, elevatedAuthority });
    if (!decision.allowed) {
      throw new ForbiddenException({ reasonCode: decision.reasonCode });
    }
  }

  /** Ekstre üret (ACTIVE) — POST /client-statements/case/:caseId */
  @Post('case/:caseId')
  async create(
    @Req() req: AuthRequest,
    @Param('caseId') caseId: string,
    @Body() dto: CreateClientStatementDto,
  ) {
    return this.service.create(req.user.tenantId, caseId, req.user.id, dto);
  }

  /**
   * Faz B — CLIENT-LEVEL (genel) ekstre üret (caseId=null; tüm eligible dosyalar, yalnız CLIENT_SPECIFIC).
   * POST /client-statements/client/:clientId  (':id/...' route'larından ÖNCE; static 'client' segment ayırır)
   */
  @Post('client/:clientId')
  async createClientLevel(
    @Req() req: AuthRequest,
    @Param('clientId') clientId: string,
    @Body() dto: CreateClientLevelStatementDto,
  ) {
    return this.service.createClientLevel(req.user.tenantId, clientId, req.user.id, dto);
  }

  /** Supersede (eskisi SUPERSEDED + yeni ACTIVE) — POST /client-statements/:id/supersede */
  @Post(':id/supersede')
  async supersede(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body() dto: SupersedeClientStatementDto,
  ) {
    return this.service.supersede(req.user.tenantId, id, req.user.id, dto);
  }

  /** Void (ACTIVE → VOID) — POST /client-statements/:id/void */
  @Post(':id/void')
  async void(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body() body: VoidClientStatementDto,
  ) {
    return this.service.void(req.user.tenantId, id, req.user.id, body.note);
  }

  /** Dosya bazlı liste (default ACTIVE) — GET /client-statements/case/:caseId?status= */
  @Get('case/:caseId')
  async listByCase(
    @Req() req: AuthRequest,
    @Param('caseId') caseId: string,
    @Query('status') status?: ClientStatementStatus,
  ) {
    return this.service.listByCase(req.user.tenantId, caseId, status);
  }

  /**
   * Faz B — CLIENT-LEVEL (genel) ekstre listesi (caseId=null; default ACTIVE) — GET /client-statements/client/:clientId?status=
   * (':id' detay route'undan ÖNCE; 'client' static segment iki-segment match ile ayırır.)
   */
  @Get('client/:clientId')
  async listByClient(
    @Req() req: AuthRequest,
    @Param('clientId') clientId: string,
    @Query('status') status?: ClientStatementStatus,
  ) {
    return this.service.listByClient(req.user.tenantId, clientId, status);
  }

  /** Detay + satırlar — GET /client-statements/:id */
  @Get(':id')
  async findOne(@Req() req: AuthRequest, @Param('id') id: string) {
    return this.service.findOne(req.user.tenantId, id);
  }
}
