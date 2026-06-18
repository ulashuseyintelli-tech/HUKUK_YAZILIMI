import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  UseGuards,
  ForbiddenException,
} from '@nestjs/common';
import { AddressTaskService, CompleteTaskParams } from './address-task.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import {
  AddressTaskStatus,
  AddressTaskCancellationReason,
  AddressTaskFailureReason,
  AddressTaskType,
} from '@prisma/client';

/**
 * Adres görevleri controller'ı.
 *
 * GÜVENLİK (ASSIGN-1 — tenant izolasyonu):
 * - Tüm uçlar `JwtAuthGuard` arkasındadır (önce: guard YOKTU → kimliksiz erişim).
 * - Tenant DAİMA auth context'ten türetilir: `@CurrentUser('tenantId')`.
 * - İstek gövdesi/query'sinde tenantId gelirse yalnızca auth-tenant ile EŞLEŞİRSE
 *   kabul edilir; uyuşmazsa 403 (`resolveTenantId`). Hiç gelmezse auth-tenant kullanılır.
 * - Servis sorguları da bu tenantId ile filtrelenir (controller + service = iki katman).
 *
 * Çağrıldığı yerler (frontend → bu controller, mevcut `request` pattern'i ile JWT taşır):
 * - apps/web/src/lib/api.ts: getAddressTasksForCase · getAllAddressTasksForCase ·
 *   getAddressNotesForCase · triggerAddressWorkflow · completeAddressTask ·
 *   cancelAddressTask · confirmAddressTaskReceived · hasUsefulAddresses · notifyAddressReceived
 * - Not: createTask/status/fail uçlarının frontend karşılığı yoktur (manuel/tetikleyici);
 *   scheduler ise controller'ı DEĞİL servisi doğrudan çağırır (guard'dan etkilenmez).
 */
@Controller('address-tasks')
@UseGuards(JwtAuthGuard)
export class AddressTaskController {
  constructor(private readonly addressTaskService: AddressTaskService) {}

  /**
   * İstekte gelen (body/query) tenantId'yi auth-tenant ile doğrular.
   * - Gelmezse: auth-tenant kullanılır.
   * - Gelir ve uyuşmazsa: 403 (cross-tenant girişimi reddedilir).
   * @remarks Çağıran: bu controller'daki tenantId taşıyan uçlar (create/trigger/overdue/address-received).
   */
  private resolveTenantId(authTenantId: string, providedTenantId?: string): string {
    if (providedTenantId && providedTenantId !== authTenantId) {
      throw new ForbiddenException('Tenant uyuşmazlığı: işlem reddedildi');
    }
    return authTenantId;
  }

  /**
   * Dosya için bekleyen görevleri getir
   * @remarks Çağıran: api.ts#getAddressTasksForCase. Tenant=auth context.
   */
  @Get('case/:caseId')
  async getTasksForCase(
    @CurrentUser('tenantId') tenantId: string,
    @Param('caseId') caseId: string,
  ) {
    const tasks = await this.addressTaskService.getPendingTasksForCase(caseId, tenantId);
    return { tasks };
  }

  /**
   * Dosya için tüm görevleri getir (tamamlananlar dahil)
   * @remarks Çağıran: api.ts#getAllAddressTasksForCase. Tenant=auth context.
   */
  @Get('case/:caseId/all')
  async getAllTasksForCase(
    @CurrentUser('tenantId') tenantId: string,
    @Param('caseId') caseId: string,
  ) {
    const tasks = await this.addressTaskService.getAllTasksForCase(caseId, tenantId);
    return { tasks };
  }

  /**
   * Dosya için notları getir (audit log'lardan showInNotes=true olanlar)
   * @remarks Çağıran: api.ts#getAddressNotesForCase. Tenant=auth context.
   */
  @Get('case/:caseId/notes')
  async getNotesForCase(
    @CurrentUser('tenantId') tenantId: string,
    @Param('caseId') caseId: string,
  ) {
    const notes = await this.addressTaskService.getNotesForCase(caseId, tenantId);
    return { notes };
  }

  /**
   * Borçlu için görevleri getir
   * @remarks Çağıran: api.ts (borçlu görev listesi). Tenant=auth context.
   */
  @Get('debtor/:debtorId')
  async getTasksForDebtor(
    @CurrentUser('tenantId') tenantId: string,
    @Param('debtorId') debtorId: string,
  ) {
    const tasks = await this.addressTaskService.getTasksByDebtor(debtorId, tenantId);
    return { tasks };
  }

  /**
   * Süresi geçmiş görevleri getir
   * @remarks Çağıran: api.ts (operasyon ekranı). Tenant=auth context;
   *          query'de tenantId gelirse auth ile eşleşmeli (yoksa 403).
   */
  @Get('overdue')
  async getOverdueTasks(
    @CurrentUser('tenantId') tenantId: string,
    @Query('tenantId') queryTenantId?: string,
  ) {
    const resolved = this.resolveTenantId(tenantId, queryTenantId);
    const tasks = await this.addressTaskService.findOverdueTasks(resolved);
    return { tasks };
  }

  /**
   * Yeni görev oluştur (manuel veya tetikleyici)
   * @remarks Çağıran: api.ts (manuel görev). Tenant=auth context;
   *          body.tenantId gelirse auth ile eşleşmeli (yoksa 403).
   */
  @Post('create')
  @HttpCode(HttpStatus.CREATED)
  async createTask(
    @CurrentUser('tenantId') tenantId: string,
    @Body() body: {
      tenantId?: string;
      caseId: string;
      debtorId: string;
      taskType: AddressTaskType;
      scopeKey?: string;
      title?: string;
      description?: string;
      assignedToId?: string;
    },
  ) {
    const resolved = this.resolveTenantId(tenantId, body.tenantId);
    const task = await this.addressTaskService.createTask({ ...body, tenantId: resolved });
    return { task, created: !!task };
  }

  /**
   * Dosya yenilendiğinde çağrılacak endpoint
   * Borçular için adres görevlerini başlatır
   * @remarks Çağıran: api.ts#triggerAddressWorkflow. Tenant=auth context;
   *          body.tenantId gelirse auth ile eşleşmeli (yoksa 403).
   */
  @Post('case/:caseId/trigger-address-workflow')
  @HttpCode(HttpStatus.OK)
  async triggerAddressWorkflow(
    @CurrentUser('tenantId') tenantId: string,
    @Param('caseId') caseId: string,
    @Body() body: { tenantId?: string },
  ) {
    const resolved = this.resolveTenantId(tenantId, body.tenantId);
    const result = await this.addressTaskService.triggerAddressWorkflowForCase(
      resolved,
      caseId,
    );
    return result;
  }

  /**
   * Görev durumunu güncelle
   * @remarks Çağıran: api.ts (görev durum güncelleme). Tenant=auth context (sahiplik guard'ı).
   */
  @Post(':taskId/status')
  @HttpCode(HttpStatus.OK)
  async updateTaskStatus(
    @CurrentUser('tenantId') tenantId: string,
    @Param('taskId') taskId: string,
    @Body() body: { status: AddressTaskStatus },
  ) {
    const task = await this.addressTaskService.updateTaskStatus(taskId, body.status, undefined, tenantId);
    return { task };
  }

  /**
   * Görevi tamamla
   * @remarks Çağıran: api.ts#completeAddressTask. Tenant=auth context (sahiplik guard'ı).
   */
  @Post(':taskId/complete')
  @HttpCode(HttpStatus.OK)
  async completeTask(
    @CurrentUser('tenantId') tenantId: string,
    @Param('taskId') taskId: string,
    @Body() body: CompleteTaskParams,
  ) {
    const task = await this.addressTaskService.completeTask(taskId, body, tenantId);
    return { task };
  }

  /**
   * Görevi iptal et
   * @remarks Çağıran: api.ts#cancelAddressTask. Tenant=auth context (sahiplik guard'ı).
   */
  @Post(':taskId/cancel')
  @HttpCode(HttpStatus.OK)
  async cancelTask(
    @CurrentUser('tenantId') tenantId: string,
    @Param('taskId') taskId: string,
    @Body() body: { reason: AddressTaskCancellationReason },
  ) {
    const task = await this.addressTaskService.cancelTask(taskId, body.reason, tenantId);
    return { task };
  }

  /**
   * Görevi başarısız olarak işaretle
   * @remarks Çağıran: api.ts (görev başarısız). Tenant=auth context (sahiplik guard'ı).
   *          Scheduler aynı servis metodunu tenantId'siz çağırır (sistem bağlamı).
   */
  @Post(':taskId/fail')
  @HttpCode(HttpStatus.OK)
  async failTask(
    @CurrentUser('tenantId') tenantId: string,
    @Param('taskId') taskId: string,
    @Body() body: { reason: AddressTaskFailureReason; details?: string },
  ) {
    const task = await this.addressTaskService.failTask(taskId, body.reason, body.details, tenantId);
    return { task };
  }

  /**
   * "Zaten aldık" - Operatör tarafından görevi tamamla
   * Adresler zaten alınmış, görev manuel olarak kapatılıyor
   * @remarks Çağıran: api.ts#confirmAddressTaskReceived. Tenant=auth context (sahiplik guard'ı).
   */
  @Post(':taskId/confirm-received')
  @HttpCode(HttpStatus.OK)
  async confirmReceived(
    @CurrentUser('tenantId') tenantId: string,
    @Param('taskId') taskId: string,
    @Body() body: { operatorId?: string },
  ) {
    const task = await this.addressTaskService.confirmReceivedByOperator(
      taskId,
      body.operatorId,
      tenantId,
    );
    return { task };
  }

  /**
   * Borçlunun yararlı adresi var mı kontrol et
   * @remarks Çağıran: api.ts#hasUsefulAddresses. Tenant=auth context (debtor relation üzerinden scope).
   */
  @Get('debtor/:debtorId/has-useful-addresses')
  async hasUsefulAddresses(
    @CurrentUser('tenantId') tenantId: string,
    @Param('debtorId') debtorId: string,
  ) {
    const hasUseful = await this.addressTaskService.hasUsefulAddresses(debtorId, tenantId);
    return { hasUsefulAddresses: hasUseful };
  }

  /**
   * Adres geldiğinde görevleri otomatik tamamla
   * @remarks Çağıran: api.ts#notifyAddressReceived. Tenant=auth context;
   *          body.tenantId gelirse auth ile eşleşmeli (yoksa 403).
   */
  @Post('case/:caseId/debtor/:debtorId/address-received')
  @HttpCode(HttpStatus.OK)
  async addressReceived(
    @CurrentUser('tenantId') tenantId: string,
    @Param('caseId') caseId: string,
    @Param('debtorId') debtorId: string,
    @Body() body: { tenantId?: string; source: 'CLIENT_REPLY' | 'CLIENT_CONFIRMED_UI' | 'MANUAL_ENTRY' },
  ) {
    const resolved = this.resolveTenantId(tenantId, body.tenantId);
    const result = await this.addressTaskService.autoCompleteOnAddressReceived(
      resolved,
      caseId,
      debtorId,
      body.source,
    );
    return result;
  }
}
