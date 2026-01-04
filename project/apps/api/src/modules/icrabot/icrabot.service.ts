import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RecipeService } from './recipe.service';
import { TaskOrchestratorService } from './task-orchestrator.service';
import { EvidenceService } from './evidence.service';
import { NextBestAction, CaseDigitalTwin, StageTag, IcraType } from './types/recipe.types';
import { StateMachine, CaseEvent, STAGE_METADATA } from './state-machine';
import { getStageFlow, requiresFinalizationStage } from './config/stage-flows.config';
import { DEFAULT_PARAMS, getObjectionDeadlineDays } from './config/params.config';
import { determineChannel, getChannelDisplayName } from './config/channel-matrix.config';
import { getScreen, getScreenByNavPath, getAllScreenIds, UyapScreen } from './config/ui-map.config';

/**
 * ICRABOT SERVICE
 * 
 * Ana orkestrasyon servisi.
 * Tüm icrabot işlemlerini koordine eder.
 */
@Injectable()
export class IcrabotService {
  private readonly logger = new Logger(IcrabotService.name);

  constructor(
    private prisma: PrismaService,
    private recipeService: RecipeService,
    private taskOrchestrator: TaskOrchestratorService,
    private evidenceService: EvidenceService,
  ) {}

  // Prisma client'a erişim (generate sonrası düzelecek)
  private get db(): any {
    return this.prisma;
  }

  /**
   * Dosya için dijital ikiz getir
   */
  async getDigitalTwin(caseId: string): Promise<CaseDigitalTwin> {
    const twin = await this.recipeService.buildDigitalTwin(caseId);
    
    // Next actions hesapla
    twin.nextActions = await this.recipeService.calculateNextBestActions(caseId);
    
    return twin;
  }

  /**
   * Dosya için Next Best Actions getir
   */
  async getNextBestActions(caseId: string): Promise<NextBestAction[]> {
    return this.recipeService.calculateNextBestActions(caseId);
  }

  /**
   * Dosya için otomasyonu başlat
   */
  async startAutomation(caseId: string, tenantId: string): Promise<{
    tasksEnqueued: number;
    tasks: string[];
  }> {
    // Next best actions hesapla
    const actions = await this.getNextBestActions(caseId);
    
    // Otomatik çalıştırılabilir olanları kuyruğa ekle
    const autoActions = actions.filter(a => a.canAutoExecute);
    
    const tasks = await this.taskOrchestrator.enqueueTasks(
      autoActions.map(a => a.recipeId),
      caseId,
      tenantId
    );

    // Dosyayı otomasyon moduna al
    await this.prisma.case.update({
      where: { id: caseId },
      data: {
        isAutomationEnabled: true,
        isAutoMode: true,
      },
    });

    this.logger.log(`Automation started for case ${caseId}: ${tasks.length} tasks enqueued`);

    return {
      tasksEnqueued: tasks.length,
      tasks: autoActions.map(a => a.recipeName),
    };
  }

  /**
   * Dosya için otomasyonu durdur
   */
  async stopAutomation(caseId: string): Promise<void> {
    // Bekleyen görevleri iptal et
    await this.db.botTask.updateMany({
      where: {
        caseId,
        status: { in: ['PENDING', 'QUEUED'] },
      },
      data: {
        status: 'CANCELLED',
        lastError: 'Automation stopped by user',
      },
    });

    // Dosyayı otomasyon modundan çıkar
    await this.db.case.update({
      where: { id: caseId },
      data: {
        isAutomationEnabled: false,
        isAutoMode: false,
      },
    });

    this.logger.log(`Automation stopped for case ${caseId}`);
  }

  /**
   * Belirli bir recipe'yi manuel çalıştır
   */
  async runRecipeManually(
    caseId: string,
    recipeId: string,
    tenantId: string,
    userId: string
  ): Promise<{ taskId: string }> {
    const recipe = this.recipeService.getRecipeById(recipeId);
    if (!recipe) {
      throw new NotFoundException(`Recipe bulunamadı: ${recipeId}`);
    }

    const task = await this.taskOrchestrator.enqueueTask({
      recipeId,
      caseId,
      tenantId,
      priority: 'HIGH', // Manuel çalıştırma yüksek öncelikli
      inputData: { triggeredBy: userId, manual: true },
    });

    // Onay gerektiriyorsa hemen onayla (manuel çalıştırma)
    if (recipe.requiresApproval) {
      await this.taskOrchestrator.approveTask(task.id, userId);
    }

    return { taskId: task.id };
  }

  /**
   * Dosya için bekleyen görevleri getir
   */
  async getPendingTasks(caseId: string): Promise<any[]> {
    return this.taskOrchestrator.getPendingTasks(caseId);
  }

  /**
   * Görevi onayla
   */
  async approveTask(taskId: string, userId: string): Promise<void> {
    await this.taskOrchestrator.approveTask(taskId, userId);
  }

  /**
   * Görevi iptal et
   */
  async cancelTask(taskId: string, reason?: string): Promise<void> {
    await this.taskOrchestrator.cancelTask(taskId, reason);
  }

  /**
   * Dosya için kanıt raporu getir
   */
  async getEvidenceReport(caseId: string): Promise<any> {
    return this.evidenceService.generateEvidenceReport(caseId);
  }

  /**
   * Tüm recipe'leri getir
   */
  getRecipes(): any[] {
    return this.recipeService.getAllRecipes().map(r => ({
      id: r.recipeId,
      name: r.name,
      description: r.description,
      stageTags: r.stageTags,
      priority: r.priority,
      requiresApproval: r.requiresApproval,
      isActive: r.isActive,
    }));
  }

  /**
   * Kuyruk istatistiklerini getir
   */
  async getQueueStats(tenantId?: string): Promise<any> {
    return this.taskOrchestrator.getQueueStats(tenantId);
  }

  /**
   * Tenant için otomasyon dashboard verisi
   */
  async getDashboard(tenantId: string): Promise<{
    queueStats: any;
    recentTasks: any[];
    activeCases: number;
    todayActions: number;
  }> {
    const [queueStats, recentTasks, activeCases, todayActions] = await Promise.all([
      this.getQueueStats(tenantId),
      this.db.botTask.findMany({
        where: { tenantId },
        orderBy: { createdAt: 'desc' },
        take: 10,
        include: {
          case: { select: { fileNumber: true } },
        },
      }),
      this.db.case.count({
        where: {
          tenantId,
          isAutomationEnabled: true,
          status: 'ACTIVE',
        },
      }),
      this.db.botTask.count({
        where: {
          tenantId,
          status: 'COMPLETED',
          completedAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) },
        },
      }),
    ]);

    return {
      queueStats,
      recentTasks,
      activeCases,
      todayActions,
    };
  }

  /**
   * E-tebligat durumu kontrol et (manuel tetikleme)
   */
  async checkEtebligatStatus(caseId: string, tenantId: string): Promise<{ taskId: string }> {
    return this.runRecipeManually(caseId, 'FetchEtebligatStatuses', tenantId, 'system');
  }

  /**
   * Kesinleşme kontrolü yap (manuel tetikleme)
   */
  async checkFinalization(caseId: string, tenantId: string): Promise<{ taskId: string }> {
    return this.runRecipeManually(caseId, 'DetectFinalizationCandidate', tenantId, 'system');
  }

  /**
   * Varlık sorgularını başlat (manuel tetikleme)
   */
  async runAssetQueries(caseId: string, tenantId: string): Promise<{ taskId: string }> {
    return this.runRecipeManually(caseId, 'RunAssetQueriesBatch', tenantId, 'system');
  }

  /**
   * Safahat senkronizasyonu (manuel tetikleme)
   */
  async syncSafahat(caseId: string, tenantId: string): Promise<{ taskId: string }> {
    return this.runRecipeManually(caseId, 'SyncSafahatTimeline', tenantId, 'system');
  }

  // ==================== STATE MACHINE ====================

  /**
   * Event ile aşama geçişi yap
   * v3: İcra türü bazlı geçiş
   */
  async processEvent(
    caseId: string,
    event: CaseEvent,
    context?: Record<string, any>
  ): Promise<{
    success: boolean;
    previousStage?: StageTag;
    newStage?: StageTag;
    actionsTriggered?: string[];
    message: string;
  }> {
    const twin = await this.recipeService.buildDigitalTwin(caseId);
    const currentStage = twin.stage;
    const icraType = twin.icraType;

    // Context'e icraType ekle
    const fullContext = { ...context, icraType };

    // Geçiş yapılabilir mi kontrol et
    const transition = StateMachine.transition(currentStage, event, fullContext);

    if (!transition) {
      return {
        success: false,
        previousStage: currentStage,
        message: `${currentStage} aşamasından ${event} eventi ile geçiş yapılamaz (icraType: ${icraType})`,
      };
    }

    // Aşamayı güncelle
    await this.prisma.case.update({
      where: { id: caseId },
      data: {
        workflowStage: this.mapStageToWorkflow(transition.newStage) as any,
      },
    });

    // Lifecycle event ekle
    await this.prisma.caseLifecycle.create({
      data: {
        caseId,
        stage: transition.newStage as any,
        action: `STAGE_TRANSITION_${event}`,
        description: transition.description,
        triggeredBy: 'AUTO',
        metadata: {
          event,
          previousStage: currentStage,
          newStage: transition.newStage,
          icraType,
          context,
        },
      },
    });

    // Tetiklenen recipe'leri kuyruğa ekle
    if (transition.actions.length > 0) {
      const caseData = await this.prisma.case.findUnique({
        where: { id: caseId },
        select: { tenantId: true },
      });

      if (caseData) {
        await this.taskOrchestrator.enqueueTasks(
          transition.actions,
          caseId,
          caseData.tenantId
        );
      }
    }

    this.logger.log(
      `Stage transition: ${currentStage} → ${transition.newStage} (event: ${event}, icraType: ${icraType})`
    );

    return {
      success: true,
      previousStage: currentStage,
      newStage: transition.newStage,
      actionsTriggered: transition.actions,
      message: transition.description,
    };
  }

  /**
   * Mevcut aşamadan yapılabilecek geçişleri getir
   * v3: İcra türüne göre filtreleme
   */
  async getAvailableTransitions(caseId: string): Promise<{
    currentStage: StageTag;
    icraType: IcraType;
    transitions: Array<{
      event: CaseEvent;
      targetStage: StageTag;
      description: string;
    }>;
  }> {
    const twin = await this.recipeService.buildDigitalTwin(caseId);
    const currentStage = twin.stage;
    const icraType = twin.icraType;

    const transitions = StateMachine.getAvailableTransitions(currentStage, icraType);

    return {
      currentStage,
      icraType,
      transitions: transitions.map(t => ({
        event: t.event,
        targetStage: t.to,
        description: t.description,
      })),
    };
  }

  /**
   * Aşama metadata'sını getir
   */
  getStageMetadata(): typeof STAGE_METADATA {
    return STAGE_METADATA;
  }

  /**
   * v3: İcra türüne göre stage akışını getir
   */
  getStageFlow(icraType: IcraType) {
    return getStageFlow(icraType);
  }

  /**
   * v3: İcra türüne göre kesinleşme gerekli mi?
   */
  requiresFinalization(icraType: IcraType): boolean {
    return requiresFinalizationStage(icraType);
  }

  /**
   * v3: İcra türüne göre itiraz süresini getir
   */
  getObjectionDeadline(icraType: IcraType): number {
    return getObjectionDeadlineDays(icraType);
  }

  /**
   * v3: Borçlu için tebligat kanalını belirle
   */
  determineDebtorChannel(debtor: {
    hasUetsAddress: boolean;
    hasPhysicalAddress: boolean;
    requiresPhysicalCopy?: boolean;
  }): { channel: string; displayName: string } {
    const channel = determineChannel(debtor);
    return {
      channel,
      displayName: getChannelDisplayName(channel),
    };
  }

  /**
   * v3: Sistem parametrelerini getir
   */
  getParams() {
    return DEFAULT_PARAMS;
  }

  // ==================== UI MAP ====================

  /**
   * v2: UYAP ekran bilgisini getir
   */
  getUyapScreen(screenId: string): UyapScreen | undefined {
    return getScreen(screenId);
  }

  /**
   * v2: Navigasyon yoluna göre ekran bul
   */
  getUyapScreenByNavPath(navPath: string[]): UyapScreen | undefined {
    return getScreenByNavPath(navPath);
  }

  /**
   * v2: Tüm UYAP ekran ID'lerini getir
   */
  getAllUyapScreenIds(): string[] {
    return getAllScreenIds();
  }

  /**
   * StageTag'i WorkflowStage'e map et
   */
  private mapStageToWorkflow(stage: StageTag): string {
    const mapping: Record<StageTag, string> = {
      ACILIS: 'INITIAL',
      TEBLIGAT: 'PAYMENT_ORDER',
      KESINLESME: 'ENFORCEMENT',
      VARLIK: 'ENFORCEMENT',
      HACIZ: 'SEIZURE',
      TAHSILAT: 'PARTIAL_PAYMENT',
      SATIS: 'SALE_REQUEST',
      KAPANIS: 'FULL_PAYMENT',
    };
    return mapping[stage] || 'INITIAL';
  }
}
