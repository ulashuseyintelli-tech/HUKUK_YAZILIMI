import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards, Req } from '@nestjs/common';
import { ExpenseRequestService, CreateExpenseRequestDto, UpdateExpenseRequestDto, PaymentInput } from './expense-request.service';
import { ExpenseGateService } from './expense-gate.service';
import { ExpenseNotificationService } from './expense-notification.service';
import { ExpenseViewService } from './expense-view.service';
import { ExpenseCalculatorService } from './expense-calculator.service';
import { AuthGuard } from '@nestjs/passport';
import { ExpenseRequestStatus } from '@prisma/client';
import { Request } from 'express';
// CPE Integration - Phase 3
import { CpeRequired, ScopeResolvers } from '@/modules/policy-engine';
import { ActionCode } from '@/modules/policy-engine/types/action-code.enum';

interface AuthRequest extends Request {
  user: { id: string; tenantId: string };
}

@Controller('expense-requests')
@UseGuards(AuthGuard('jwt'))
export class ExpenseRequestController {
  constructor(
    private readonly service: ExpenseRequestService,
    private readonly gateService: ExpenseGateService,
    private readonly notificationService: ExpenseNotificationService,
    private readonly viewService: ExpenseViewService,
    private readonly calculatorService: ExpenseCalculatorService,
  ) {}

  @Get()
  async findAll(
    @Req() req: AuthRequest,
    @Query('caseId') caseId?: string,
    @Query('clientId') clientId?: string,
    @Query('status') status?: ExpenseRequestStatus,
  ) {
    return this.service.findAll(req.user.tenantId, { caseId, clientId, status });
  }

  @Get('stats')
  async getStats(@Req() req: AuthRequest, @Query('caseId') caseId?: string) {
    return this.service.getStats(req.user.tenantId, caseId);
  }

  @Get('by-case/:caseId')
  async findByCaseId(@Req() req: AuthRequest, @Param('caseId') caseId: string) {
    return this.service.findByCaseId(req.user.tenantId, caseId);
  }

  @Get(':id')
  async findOne(@Req() req: AuthRequest, @Param('id') id: string) {
    return this.service.findOne(req.user.tenantId, id);
  }

  @Post()
  async create(@Req() req: AuthRequest, @Body() dto: CreateExpenseRequestDto) {
    return this.service.create(req.user.tenantId, req.user.id, dto);
  }

  @Post('from-package')
  async createFromPackage(
    @Req() req: AuthRequest,
    @Body() dto: {
      caseId: string;
      clientId: string;
      packageCode: string;
      items: Array<{
        itemCode: string;
        label: string;
        suggestedAmount: number;
        finalAmount: number;
        wasOverridden?: boolean;
      }>;
      dueDate?: string;
      notes?: string;
      sendEmail?: boolean;
      sendSms?: boolean;
      sendWhatsapp?: boolean;
      paidByLawyer?: boolean;
    },
  ) {
    return this.service.createFromPackage(req.user.tenantId, req.user.id, dto);
  }

  @Put(':id')
  async update(@Req() req: AuthRequest, @Param('id') id: string, @Body() dto: UpdateExpenseRequestDto) {
    return this.service.update(req.user.tenantId, id, dto);
  }

  @Post(':id/send')
  async markAsSent(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body() body: { channel: string; notificationId?: string },
  ) {
    return this.service.markAsSent(req.user.tenantId, id, body.channel, body.notificationId);
  }

  @Post(':id/remind')
  async markAsReminded(@Req() req: AuthRequest, @Param('id') id: string) {
    return this.service.markAsReminded(req.user.tenantId, id);
  }

  @Post(':id/receive')
  async markAsReceived(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body() body: { paidAmount: number; receiptDocId?: string },
  ) {
    return this.service.markAsReceived(req.user.tenantId, id, body.paidAmount, body.receiptDocId, req.user.id);
  }

  @Post(':id/cancel')
  async cancel(@Req() req: AuthRequest, @Param('id') id: string, @Body() body: { reason?: string }) {
    return this.service.cancel(req.user.tenantId, id, body.reason);
  }

  @Delete(':id')
  async delete(@Req() req: AuthRequest, @Param('id') id: string) {
    return this.service.delete(req.user.tenantId, id);
  }

  // ==================== YENİ ENDPOINT'LER ====================

  /**
   * Otomatik açılış masraf seti oluştur
   * POST /expense-requests/case/:caseId/opening
   */
  @Post('case/:caseId/opening')
  async createOpeningExpenses(@Req() req: AuthRequest, @Param('caseId') caseId: string) {
    return this.service.createOpeningExpenseSet(caseId, req.user.tenantId, req.user.id);
  }

  /**
   * Aşama bazlı masraf seti oluştur
   * POST /expense-requests/case/:caseId/stage/:stageCode
   */
  @Post('case/:caseId/stage/:stageCode')
  async createStageExpenses(
    @Req() req: AuthRequest,
    @Param('caseId') caseId: string,
    @Param('stageCode') stageCode: string,
  ) {
    return this.service.createStageExpenseSet(caseId, stageCode, req.user.tenantId, req.user.id);
  }

  /**
   * Masraf talebi kesinleştir ve gönder
   * POST /expense-requests/:id/finalize
   * 
   * @CpeRequired - Masraf onaylama HIGH risk aksiyon
   */
  @Post(':id/finalize')
  @CpeRequired(ActionCode.APPROVE_EXPENSE, ScopeResolvers.fromExpenseParam)
  async finalizeAndSend(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body() body: { channel?: string },
  ) {
    return this.service.finalizeAndSend(req.user.tenantId, id, body.channel || 'EMAIL', req.user.id);
  }

  /**
   * Ödeme kaydet
   * POST /expense-requests/:id/payment
   * 
   * @CpeRequired - Tahsilat kaydı MEDIUM risk aksiyon
   */
  @Post(':id/payment')
  @CpeRequired(ActionCode.RECORD_COLLECTION, ScopeResolvers.fromExpenseParam)
  async recordPayment(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body() body: { amount: number; paymentDate: string; method: string; reference?: string; notes?: string },
  ) {
    const payment: PaymentInput = {
      amount: body.amount,
      paymentDate: new Date(body.paymentDate),
      method: body.method,
      reference: body.reference,
      notes: body.notes,
    };
    return this.service.recordPayment(req.user.tenantId, id, payment, req.user.id);
  }

  /**
   * Dosya masraf özeti
   * GET /expense-requests/case/:caseId/summary
   */
  @Get('case/:caseId/summary')
  async getExpenseSummary(@Req() req: AuthRequest, @Param('caseId') caseId: string) {
    return this.service.getExpenseSummaryForCase(req.user.tenantId, caseId);
  }

  /**
   * Dosya masrafları detaylı
   * GET /expense-requests/case/:caseId/details
   */
  @Get('case/:caseId/details')
  async getExpenseDetails(@Req() req: AuthRequest, @Param('caseId') caseId: string) {
    return this.service.getExpenseRequestsWithDetails(req.user.tenantId, caseId);
  }

  // ==================== GATE ENDPOINT'LERİ ====================

  /**
   * Gate durumu kontrol et
   * GET /expense-requests/case/:caseId/gate-status
   */
  @Get('case/:caseId/gate-status')
  async getGateStatus(@Req() req: AuthRequest, @Param('caseId') caseId: string) {
    return this.gateService.checkGate(caseId);
  }

  /**
   * UYAP işlem izni kontrol et
   * GET /expense-requests/case/:caseId/can-perform/:actionType
   */
  @Get('case/:caseId/can-perform/:actionType')
  async canPerformAction(
    @Req() req: AuthRequest,
    @Param('caseId') caseId: string,
    @Param('actionType') actionType: string,
  ) {
    const canPerform = await this.gateService.canPerformUyapAction(caseId, actionType);
    return { canPerform, actionType };
  }

  /**
   * Gate özeti
   * GET /expense-requests/case/:caseId/gate-summary
   */
  @Get('case/:caseId/gate-summary')
  async getGateSummary(@Req() req: AuthRequest, @Param('caseId') caseId: string) {
    return this.gateService.getGateSummary(caseId);
  }

  // ==================== NOTIFICATION ENDPOINT'LERİ ====================

  /**
   * E-posta gönder
   * POST /expense-requests/:id/send-email
   */
  @Post(':id/send-email')
  async sendExpenseEmail(@Req() req: AuthRequest, @Param('id') id: string) {
    return this.notificationService.sendExpenseRequest(req.user.tenantId, id, req.user.id);
  }

  /**
   * Hatırlatma gönder
   * POST /expense-requests/:id/send-reminder
   */
  @Post(':id/send-reminder')
  async sendReminder(@Req() req: AuthRequest, @Param('id') id: string) {
    return this.notificationService.sendReminder(req.user.tenantId, id, req.user.id);
  }

  /**
   * Vadesi yaklaşan masraf taleplerini getir
   * GET /expense-requests/due-reminders
   */
  @Get('due-reminders')
  async getDueReminders(@Req() req: AuthRequest, @Query('days') days?: string) {
    const daysBeforeDue = days ? parseInt(days, 10) : 2;
    return this.notificationService.findDueReminders(req.user.tenantId, daysBeforeDue);
  }

  /**
   * Gecikme görevi oluştur
   * POST /expense-requests/:id/create-overdue-task
   */
  @Post(':id/create-overdue-task')
  async createOverdueTask(@Req() req: AuthRequest, @Param('id') id: string) {
    return this.notificationService.createOverdueTask(req.user.tenantId, id, req.user.id);
  }

  // ==================== 3-VIEW ENDPOINT'LERİ ====================

  /**
   * Tek masraf için 3 görünüm
   * GET /expense-requests/:id/three-view
   */
  @Get(':id/three-view')
  async getThreeView(@Req() req: AuthRequest, @Param('id') id: string) {
    return this.viewService.getThreeViewData(req.user.tenantId, id);
  }

  /**
   * Dosya için tüm masrafların 3 görünümü
   * GET /expense-requests/case/:caseId/three-view
   */
  @Get('case/:caseId/three-view')
  async getThreeViewForCase(@Req() req: AuthRequest, @Param('caseId') caseId: string) {
    return this.viewService.getThreeViewDataForCase(req.user.tenantId, caseId);
  }

  /**
   * Yapılacaklar paneli için bekleyen masraf task'ları
   * GET /expense-requests/pending-tasks
   */
  @Get('pending-tasks')
  async getPendingTasks(@Req() req: AuthRequest) {
    return this.viewService.getPendingExpenseTasks(req.user.tenantId);
  }

  /**
   * Finans paneli için dosya masrafları
   * GET /expense-requests/case/:caseId/finance-items
   */
  @Get('case/:caseId/finance-items')
  async getFinanceItems(@Req() req: AuthRequest, @Param('caseId') caseId: string) {
    return this.viewService.getExpenseFinanceItems(req.user.tenantId, caseId);
  }

  /**
   * Müvekkil Talepleri paneli için masraf talepleri
   * GET /expense-requests/client/:clientId/requests
   */
  @Get('client/:clientId/requests')
  async getClientRequests(@Req() req: AuthRequest, @Param('clientId') clientId: string) {
    return this.viewService.getExpenseClientRequests(req.user.tenantId, clientId);
  }

  // ==================== CALCULATOR ENDPOINT'LERİ ====================

  /**
   * Masraf hesaplama önizleme
   * POST /expense-requests/calculate-preview
   */
  @Post('calculate-preview')
  async calculatePreview(
    @Req() req: AuthRequest,
    @Body() body: { principalAmount: number; caseType?: string; stageCode?: string },
  ) {
    const caseData = {
      principalAmount: body.principalAmount,
      caseType: body.caseType || 'ILAMSIZ',
    };

    if (body.stageCode && body.stageCode !== 'OPENING') {
      const items = this.calculatorService.calculateStageExpenses(body.stageCode, caseData);
      const total = this.calculatorService.calculateTotal(items);
      return { stageCode: body.stageCode, items, total };
    }

    const items = this.calculatorService.calculateOpeningExpenses(caseData);
    const total = this.calculatorService.calculateTotal(items);
    return { stageCode: 'OPENING', items, total };
  }
}
