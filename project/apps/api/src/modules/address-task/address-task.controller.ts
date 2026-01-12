import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { AddressTaskService, CompleteTaskParams } from './address-task.service';
import {
  AddressTaskStatus,
  AddressTaskCancellationReason,
  AddressTaskFailureReason,
  AddressTaskType,
} from '@prisma/client';

@Controller('address-tasks')
export class AddressTaskController {
  constructor(private readonly addressTaskService: AddressTaskService) {}

  /**
   * Dosya için bekleyen görevleri getir
   */
  @Get('case/:caseId')
  async getTasksForCase(@Param('caseId') caseId: string) {
    const tasks = await this.addressTaskService.getPendingTasksForCase(caseId);
    return { tasks };
  }

  /**
   * Dosya için tüm görevleri getir (tamamlananlar dahil)
   */
  @Get('case/:caseId/all')
  async getAllTasksForCase(@Param('caseId') caseId: string) {
    const tasks = await this.addressTaskService.getAllTasksForCase(caseId);
    return { tasks };
  }

  /**
   * Dosya için notları getir (audit log'lardan showInNotes=true olanlar)
   */
  @Get('case/:caseId/notes')
  async getNotesForCase(@Param('caseId') caseId: string) {
    const notes = await this.addressTaskService.getNotesForCase(caseId);
    return { notes };
  }

  /**
   * Borçlu için görevleri getir
   */
  @Get('debtor/:debtorId')
  async getTasksForDebtor(@Param('debtorId') debtorId: string) {
    const tasks = await this.addressTaskService.getTasksByDebtor(debtorId);
    return { tasks };
  }

  /**
   * Süresi geçmiş görevleri getir
   */
  @Get('overdue')
  async getOverdueTasks(@Query('tenantId') tenantId?: string) {
    const tasks = await this.addressTaskService.findOverdueTasks(tenantId);
    return { tasks };
  }

  /**
   * Yeni görev oluştur (manuel veya tetikleyici)
   */
  @Post('create')
  @HttpCode(HttpStatus.CREATED)
  async createTask(
    @Body() body: {
      tenantId: string;
      caseId: string;
      debtorId: string;
      taskType: AddressTaskType;
      scopeKey?: string;
      title?: string;
      description?: string;
      assignedToId?: string;
    },
  ) {
    const task = await this.addressTaskService.createTask(body);
    return { task, created: !!task };
  }

  /**
   * Dosya yenilendiğinde çağrılacak endpoint
   * Borçular için adres görevlerini başlatır
   */
  @Post('case/:caseId/trigger-address-workflow')
  @HttpCode(HttpStatus.OK)
  async triggerAddressWorkflow(
    @Param('caseId') caseId: string,
    @Body() body: { tenantId: string },
  ) {
    const result = await this.addressTaskService.triggerAddressWorkflowForCase(
      body.tenantId,
      caseId,
    );
    return result;
  }

  /**
   * Görev durumunu güncelle
   */
  @Post(':taskId/status')
  @HttpCode(HttpStatus.OK)
  async updateTaskStatus(
    @Param('taskId') taskId: string,
    @Body() body: { status: AddressTaskStatus },
  ) {
    const task = await this.addressTaskService.updateTaskStatus(taskId, body.status);
    return { task };
  }

  /**
   * Görevi tamamla
   */
  @Post(':taskId/complete')
  @HttpCode(HttpStatus.OK)
  async completeTask(
    @Param('taskId') taskId: string,
    @Body() body: CompleteTaskParams,
  ) {
    const task = await this.addressTaskService.completeTask(taskId, body);
    return { task };
  }

  /**
   * Görevi iptal et
   */
  @Post(':taskId/cancel')
  @HttpCode(HttpStatus.OK)
  async cancelTask(
    @Param('taskId') taskId: string,
    @Body() body: { reason: AddressTaskCancellationReason },
  ) {
    const task = await this.addressTaskService.cancelTask(taskId, body.reason);
    return { task };
  }

  /**
   * Görevi başarısız olarak işaretle
   */
  @Post(':taskId/fail')
  @HttpCode(HttpStatus.OK)
  async failTask(
    @Param('taskId') taskId: string,
    @Body() body: { reason: AddressTaskFailureReason; details?: string },
  ) {
    const task = await this.addressTaskService.failTask(taskId, body.reason, body.details);
    return { task };
  }

  /**
   * "Zaten aldık" - Operatör tarafından görevi tamamla
   * Adresler zaten alınmış, görev manuel olarak kapatılıyor
   */
  @Post(':taskId/confirm-received')
  @HttpCode(HttpStatus.OK)
  async confirmReceived(
    @Param('taskId') taskId: string,
    @Body() body: { operatorId?: string },
  ) {
    const task = await this.addressTaskService.confirmReceivedByOperator(
      taskId,
      body.operatorId,
    );
    return { task };
  }

  /**
   * Borçlunun yararlı adresi var mı kontrol et
   */
  @Get('debtor/:debtorId/has-useful-addresses')
  async hasUsefulAddresses(@Param('debtorId') debtorId: string) {
    const hasUseful = await this.addressTaskService.hasUsefulAddresses(debtorId);
    return { hasUsefulAddresses: hasUseful };
  }

  /**
   * Adres geldiğinde görevleri otomatik tamamla
   */
  @Post('case/:caseId/debtor/:debtorId/address-received')
  @HttpCode(HttpStatus.OK)
  async addressReceived(
    @Param('caseId') caseId: string,
    @Param('debtorId') debtorId: string,
    @Body() body: { tenantId: string; source: 'CLIENT_REPLY' | 'CLIENT_CONFIRMED_UI' | 'MANUAL_ENTRY' },
  ) {
    const result = await this.addressTaskService.autoCompleteOnAddressReceived(
      body.tenantId,
      caseId,
      debtorId,
      body.source,
    );
    return result;
  }
}
