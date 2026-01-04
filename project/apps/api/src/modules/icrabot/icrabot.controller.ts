import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { IcrabotService } from './icrabot.service';

/**
 * ICRABOT CONTROLLER
 * 
 * API endpoints for icrabot automation system.
 */
@Controller('icrabot')
@UseGuards(JwtAuthGuard)
export class IcrabotController {
  constructor(private icrabotService: IcrabotService) {}

  /**
   * Dashboard verisi
   * GET /api/icrabot/dashboard
   */
  @Get('dashboard')
  async getDashboard(@Request() req: any) {
    return this.icrabotService.getDashboard(req.user.tenantId);
  }

  /**
   * Kuyruk istatistikleri
   * GET /api/icrabot/queue/stats
   */
  @Get('queue/stats')
  async getQueueStats(@Request() req: any) {
    return this.icrabotService.getQueueStats(req.user.tenantId);
  }

  /**
   * Tüm recipe'leri listele
   * GET /api/icrabot/recipes
   */
  @Get('recipes')
  getRecipes() {
    return this.icrabotService.getRecipes();
  }

  /**
   * Dosya için dijital ikiz
   * GET /api/icrabot/cases/:caseId/twin
   */
  @Get('cases/:caseId/twin')
  async getDigitalTwin(@Param('caseId') caseId: string) {
    return this.icrabotService.getDigitalTwin(caseId);
  }

  /**
   * Dosya için Next Best Actions
   * GET /api/icrabot/cases/:caseId/next-actions
   */
  @Get('cases/:caseId/next-actions')
  async getNextBestActions(@Param('caseId') caseId: string) {
    return this.icrabotService.getNextBestActions(caseId);
  }

  /**
   * Dosya için bekleyen görevler
   * GET /api/icrabot/cases/:caseId/tasks
   */
  @Get('cases/:caseId/tasks')
  async getPendingTasks(@Param('caseId') caseId: string) {
    return this.icrabotService.getPendingTasks(caseId);
  }

  /**
   * Dosya için kanıt raporu
   * GET /api/icrabot/cases/:caseId/evidence
   */
  @Get('cases/:caseId/evidence')
  async getEvidenceReport(@Param('caseId') caseId: string) {
    return this.icrabotService.getEvidenceReport(caseId);
  }

  /**
   * Otomasyonu başlat
   * POST /api/icrabot/cases/:caseId/start
   */
  @Post('cases/:caseId/start')
  async startAutomation(
    @Param('caseId') caseId: string,
    @Request() req: any
  ) {
    return this.icrabotService.startAutomation(caseId, req.user.tenantId);
  }

  /**
   * Otomasyonu durdur
   * POST /api/icrabot/cases/:caseId/stop
   */
  @Post('cases/:caseId/stop')
  async stopAutomation(@Param('caseId') caseId: string) {
    await this.icrabotService.stopAutomation(caseId);
    return { success: true };
  }

  /**
   * Recipe'yi manuel çalıştır
   * POST /api/icrabot/cases/:caseId/run/:recipeId
   */
  @Post('cases/:caseId/run/:recipeId')
  async runRecipe(
    @Param('caseId') caseId: string,
    @Param('recipeId') recipeId: string,
    @Request() req: any
  ) {
    return this.icrabotService.runRecipeManually(
      caseId,
      recipeId,
      req.user.tenantId,
      req.user.id
    );
  }

  /**
   * Görevi onayla
   * POST /api/icrabot/tasks/:taskId/approve
   */
  @Post('tasks/:taskId/approve')
  async approveTask(
    @Param('taskId') taskId: string,
    @Request() req: any
  ) {
    await this.icrabotService.approveTask(taskId, req.user.id);
    return { success: true };
  }

  /**
   * Görevi iptal et
   * POST /api/icrabot/tasks/:taskId/cancel
   */
  @Post('tasks/:taskId/cancel')
  async cancelTask(
    @Param('taskId') taskId: string,
    @Body() body: { reason?: string }
  ) {
    await this.icrabotService.cancelTask(taskId, body.reason);
    return { success: true };
  }

  // ==================== KISA YOL ENDPOINTS ====================

  /**
   * E-tebligat durumu kontrol et
   * POST /api/icrabot/cases/:caseId/check-etebligat
   */
  @Post('cases/:caseId/check-etebligat')
  async checkEtebligat(
    @Param('caseId') caseId: string,
    @Request() req: any
  ) {
    return this.icrabotService.checkEtebligatStatus(caseId, req.user.tenantId);
  }

  /**
   * Kesinleşme kontrolü
   * POST /api/icrabot/cases/:caseId/check-finalization
   */
  @Post('cases/:caseId/check-finalization')
  async checkFinalization(
    @Param('caseId') caseId: string,
    @Request() req: any
  ) {
    return this.icrabotService.checkFinalization(caseId, req.user.tenantId);
  }

  /**
   * Varlık sorguları
   * POST /api/icrabot/cases/:caseId/run-asset-queries
   */
  @Post('cases/:caseId/run-asset-queries')
  async runAssetQueries(
    @Param('caseId') caseId: string,
    @Request() req: any
  ) {
    return this.icrabotService.runAssetQueries(caseId, req.user.tenantId);
  }

  /**
   * Safahat senkronizasyonu
   * POST /api/icrabot/cases/:caseId/sync-safahat
   */
  @Post('cases/:caseId/sync-safahat')
  async syncSafahat(
    @Param('caseId') caseId: string,
    @Request() req: any
  ) {
    return this.icrabotService.syncSafahat(caseId, req.user.tenantId);
  }

  // ==================== STATE MACHINE ENDPOINTS ====================

  /**
   * Event ile aşama geçişi yap
   * POST /api/icrabot/cases/:caseId/transition
   */
  @Post('cases/:caseId/transition')
  async processEvent(
    @Param('caseId') caseId: string,
    @Body() body: { event: string; context?: Record<string, any> }
  ) {
    return this.icrabotService.processEvent(caseId, body.event as any, body.context);
  }

  /**
   * Mevcut aşamadan yapılabilecek geçişleri getir
   * GET /api/icrabot/cases/:caseId/transitions
   */
  @Get('cases/:caseId/transitions')
  async getAvailableTransitions(@Param('caseId') caseId: string) {
    return this.icrabotService.getAvailableTransitions(caseId);
  }

  /**
   * Aşama metadata'sını getir
   * GET /api/icrabot/stages
   */
  @Get('stages')
  getStageMetadata() {
    return this.icrabotService.getStageMetadata();
  }

  // ==================== v3: İCRA TÜRÜ BAZLI ENDPOINTS ====================

  /**
   * İcra türüne göre stage akışını getir
   * GET /api/icrabot/stage-flows/:icraType
   */
  @Get('stage-flows/:icraType')
  getStageFlow(@Param('icraType') icraType: string) {
    return this.icrabotService.getStageFlow(icraType as any);
  }

  /**
   * İcra türüne göre kesinleşme gerekli mi?
   * GET /api/icrabot/requires-finalization/:icraType
   */
  @Get('requires-finalization/:icraType')
  requiresFinalization(@Param('icraType') icraType: string) {
    return {
      icraType,
      requiresFinalization: this.icrabotService.requiresFinalization(icraType as any),
    };
  }

  /**
   * İcra türüne göre itiraz süresini getir
   * GET /api/icrabot/objection-deadline/:icraType
   */
  @Get('objection-deadline/:icraType')
  getObjectionDeadline(@Param('icraType') icraType: string) {
    return {
      icraType,
      objectionDeadlineDays: this.icrabotService.getObjectionDeadline(icraType as any),
    };
  }

  /**
   * Sistem parametrelerini getir
   * GET /api/icrabot/params
   */
  @Get('params')
  getParams() {
    return this.icrabotService.getParams();
  }

  /**
   * Borçlu için tebligat kanalını belirle
   * POST /api/icrabot/determine-channel
   */
  @Post('determine-channel')
  determineChannel(
    @Body() body: {
      hasUetsAddress: boolean;
      hasPhysicalAddress: boolean;
      requiresPhysicalCopy?: boolean;
    }
  ) {
    return this.icrabotService.determineDebtorChannel(body);
  }

  // ==================== v2: UI MAP ENDPOINTS ====================

  /**
   * Tüm UYAP ekran ID'lerini getir
   * GET /api/icrabot/ui-map/screens
   */
  @Get('ui-map/screens')
  getUyapScreenIds() {
    return {
      screens: this.icrabotService.getAllUyapScreenIds(),
    };
  }

  /**
   * UYAP ekran bilgisini getir
   * GET /api/icrabot/ui-map/screens/:screenId
   */
  @Get('ui-map/screens/:screenId')
  getUyapScreen(@Param('screenId') screenId: string) {
    const screen = this.icrabotService.getUyapScreen(screenId);
    if (!screen) {
      return { error: 'Ekran bulunamadı', screenId };
    }
    return screen;
  }
}
