import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ClientNotificationService } from '../client-notification/client-notification.service';
import { maskPhone } from '../../common/pii-mask.util';
import {
  AddressTask,
  AddressTaskType,
  AddressTaskStatus,
  AddressTaskResultType,
  AddressTaskFailureReason,
  AddressTaskCancellationReason,
  ManualTaskResolution,
  Prisma,
} from '@prisma/client';
import {
  calculateClientResponseDueAt,
  calculateManualTaskDueAt,
  calculateAnnualRefreshAt,
} from './utils';

export interface CreateTaskParams {
  tenantId: string;
  caseId: string;
  debtorId: string;
  taskType: AddressTaskType;
  scopeKey?: string;
  title?: string;
  description?: string;
  assignedToId?: string;
  dueAt?: Date;
  sendNotification?: boolean; // Müvekkile bildirim gönder
  /**
   * true ise: caseId+debtorId çiftinin gerçekten bir CaseDebtor ilişkisine sahip olduğu
   * (borçlu o dosyanın borçlusu) doğrulanır; yoksa BadRequestException atılır.
   * Default (false/undefined): yalnız tenant-ownership kontrolü yapılır — iç çağrılar
   * (triggerAddressWorkflowForCase, scheduler escalation/annual) ilişkiyi yapısı gereği
   * sağladığı için bu bayrağı GEÇMEZ ve davranışları değişmez. Yalnız controller
   * POST /create (keyfi caseId+debtorId girişi) true geçirir.
   */
  enforceCaseDebtorLink?: boolean;
}

export interface CompleteTaskParams {
  resultType: AddressTaskResultType;
  resultData?: any;
  resolution?: ManualTaskResolution;
  resolutionNotes?: string;
}

@Injectable()
export class AddressTaskService {
  private readonly logger = new Logger(AddressTaskService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly clientNotificationService: ClientNotificationService,
  ) {}

  /**
   * taskId'nin verilen tenant'a ait olduğunu doğrula (cross-tenant mutasyon engeli — ASSIGN-1).
   * tenantId verilmezse (scheduler / iç sistem bağlamı) kontrol atlanır; controller DAİMA geçirir.
   * @remarks Çağıran: updateTaskStatus, completeTask, cancelTask, failTask (hepsi controller'dan tenantId ile gelir).
   */
  private async assertTaskTenant(taskId: string, tenantId?: string): Promise<void> {
    if (!tenantId) return;
    const owned = await this.prisma.addressTask.findFirst({
      where: { id: taskId, tenantId },
      select: { id: true },
    });
    if (!owned) {
      throw new NotFoundException(`Adres görevi bulunamadı: ${taskId}`);
    }
  }

  /**
   * Yeni görev oluştur (idempotent)
   * Aynı dedupe key ile görev varsa ve terminal durumda değilse, mevcut görevi döndürür
   *
   * @remarks
   * Çağrıldığı yerler:
   * - AddressTaskController.createTask() → POST /address-tasks/create (manuel/tetikleyici;
   *   keyfi caseId+debtorId girişi → enforceCaseDebtorLink=true geçirir)
   * - AddressTaskService.triggerAddressWorkflowForCase() → caseDebtor.findMany döngüsü
   *   (ilişki yapısı gereği var; bayrak geçmez)
   * - AddressTaskSchedulerService.checkOverdueTasks() → escalation (caseId+debtorId mevcut
   *   task'tan kopyalanır; bayrak geçmez)
   * - AddressTaskSchedulerService.checkAnnualRefreshTasks() → yıllık yenileme (mevcut task'tan
   *   kopyalanır; bayrak geçmez)
   */
  async createTask(params: CreateTaskParams): Promise<AddressTask | null> {
    const { tenantId, caseId, debtorId, taskType, scopeKey, title, description, assignedToId, dueAt, enforceCaseDebtorLink } = params;

    // Cross-tenant input guard (ASSIGN-1 blocker #1): caseId ve debtorId DAİMA bu tenant'a
    // ait olmalı. Controller body'sinden keyfi caseId/debtorId gelebilir; auth-tenant'a ait
    // değilse görev oluşturulmaz (cross-tenant veri bağlama engeli). İç çağrılar (scheduler/
    // workflow) tutarlı veri geçirdiği için bu kontrolü sorunsuz geçer.
    const [caseOwned, debtorOwned] = await Promise.all([
      this.prisma.case.findFirst({ where: { id: caseId, tenantId }, select: { id: true } }),
      this.prisma.debtor.findFirst({ where: { id: debtorId, tenantId }, select: { id: true } }),
    ]);
    if (!caseOwned || !debtorOwned) {
      throw new NotFoundException(
        `Dosya veya borçlu bu tenant'ta bulunamadı (case=${caseId}, debtor=${debtorId})`,
      );
    }

    // Veri bütünlüğü guard'ı (opt-in): caseId+debtorId aynı tenant'ta olsa bile, borçlu
    // gerçekten o dosyanın borçlusu (CaseDebtor satırı) olmalı. Yoksa A dosyası + B dosyasının
    // borçlusuyla tutarsız bir AddressTask oluşur. caseId yukarıda tenant-doğrulandığı için
    // CaseDebtor sorgusu tenant-güvenlidir (ek case:{tenantId} gereksiz). Yalnız controller
    // POST /create bu bayrağı geçirir; iç çağrılar ilişkiyi yapısı gereği sağlar (bkz. @remarks).
    // (Mevcut desen: client-intake-promotion.service.ts içindeki "Borçlu bu takibe ait değil".)
    if (enforceCaseDebtorLink) {
      const link = await this.prisma.caseDebtor.findFirst({
        where: { caseId, debtorId },
        select: { id: true },
      });
      if (!link) {
        throw new BadRequestException('Borçlu bu takibe ait değil');
      }
    }

    // Dedupe key kontrolü (tenant-scoped — ASSIGN-1)
    const existingTask = await this.prisma.addressTask.findFirst({
      where: {
        tenantId,
        caseId,
        debtorId,
        taskType,
        scopeKey: scopeKey || null,
        status: {
          notIn: ['DONE', 'CANCELLED', 'FAILED', 'RESOLVED'],
        },
      },
    });

    if (existingTask) {
      this.logger.log(`Task already exists: ${existingTask.id} (${taskType})`);
      
      // Audit log - duplicate task skipped
      await this.logAuditEvent(tenantId, caseId, debtorId, 'DUPLICATE_TASK_SKIPPED', {
        existingTaskId: existingTask.id,
        taskType,
      });
      
      return null;
    }

    // Varsayılan due date hesapla
    let calculatedDueAt = dueAt;
    if (!calculatedDueAt) {
      switch (taskType) {
        case 'CLIENT_REQUEST_DEBTOR_ADDRESSES':
        case 'CLIENT_REMIND_DEBTOR_ADDRESSES':
          calculatedDueAt = calculateClientResponseDueAt();
          break;
        case 'ASSIGN_MANUAL_CALL_CLIENT':
        case 'MANUAL_CLIENT_FOLLOWUP':
        case 'CLIENT_CONTACT_VALIDATE':
          calculatedDueAt = calculateManualTaskDueAt();
          break;
        case 'CLIENT_ANNUAL_ADDRESS_REFRESH':
          calculatedDueAt = calculateAnnualRefreshAt();
          break;
        default:
          calculatedDueAt = calculateManualTaskDueAt();
      }
    }

    // Varsayılan title
    const taskTitle = title || this.getDefaultTitle(taskType);

    const task = await this.prisma.addressTask.create({
      data: {
        tenantId,
        caseId,
        debtorId,
        taskType,
        scopeKey,
        title: taskTitle,
        description,
        assignedToId,
        dueAt: calculatedDueAt,
        status: 'PENDING',
        attemptCount: 0,
        maxAttempts: 3,
      },
    });

    this.logger.log(`Task created: ${task.id} (${taskType})`);

    // Audit log
    await this.logAuditEvent(tenantId, caseId, debtorId, 'TASK_CREATED', {
      taskId: task.id,
      taskType,
      dueAt: calculatedDueAt,
    }, true, `Yeni görev oluşturuldu: ${taskTitle}`);

    return task;
  }

  /**
   * Görev durumunu güncelle
   */
  async updateTaskStatus(
    taskId: string,
    status: AddressTaskStatus,
    additionalData?: {
      resultType?: AddressTaskResultType;
      resultData?: any;
      resolution?: ManualTaskResolution;
      resolutionNotes?: string;
      channelUsed?: string;
      lastRunAt?: Date;
      nextRunAt?: Date;
    },
    tenantId?: string,
  ): Promise<AddressTask> {
    await this.assertTaskTenant(taskId, tenantId);

    const task = await this.prisma.addressTask.update({
      where: { id: taskId },
      data: {
        status,
        ...additionalData,
        updatedAt: new Date(),
        ...(status === 'DONE' || status === 'RESOLVED' ? { completedAt: new Date() } : {}),
      },
    });

    this.logger.log(`Task status updated: ${taskId} -> ${status}`);

    // Audit log
    await this.logAuditEvent(
      task.tenantId,
      task.caseId,
      task.debtorId,
      'TASK_STATUS_CHANGED',
      { taskId, newStatus: status },
      true,
      `Görev durumu güncellendi: ${status}`,
    );

    return task;
  }

  /**
   * Görevi tamamla
   */
  async completeTask(taskId: string, params: CompleteTaskParams, tenantId?: string): Promise<AddressTask> {
    const { resultType, resultData, resolution, resolutionNotes } = params;

    await this.assertTaskTenant(taskId, tenantId);

    const task = await this.prisma.addressTask.update({
      where: { id: taskId },
      data: {
        status: 'DONE',
        resultType,
        resultData: resultData ? JSON.parse(JSON.stringify(resultData)) : undefined,
        resolution,
        resolutionNotes,
        completedAt: new Date(),
        updatedAt: new Date(),
      },
    });

    this.logger.log(`Task completed: ${taskId} (${resultType})`);

    // Audit log
    const noteText = resultType === 'POSITIVE'
      ? 'Görev tamamlandı - olumlu sonuç'
      : resultType === 'NEGATIVE'
        ? 'Görev tamamlandı - olumsuz sonuç'
        : 'Görev tamamlandı';

    await this.logAuditEvent(
      task.tenantId,
      task.caseId,
      task.debtorId,
      'TASK_COMPLETED',
      { taskId, resultType, resolution },
      true,
      noteText,
    );

    return task;
  }

  /**
   * Görevi iptal et
   */
  async cancelTask(
    taskId: string,
    reason: AddressTaskCancellationReason,
    tenantId?: string,
  ): Promise<AddressTask> {
    await this.assertTaskTenant(taskId, tenantId);

    const task = await this.prisma.addressTask.update({
      where: { id: taskId },
      data: {
        status: 'CANCELLED',
        cancellationReason: reason,
        completedAt: new Date(),
        updatedAt: new Date(),
      },
    });

    this.logger.log(`Task cancelled: ${taskId} (${reason})`);

    // Audit log
    await this.logAuditEvent(
      task.tenantId,
      task.caseId,
      task.debtorId,
      'TASK_CANCELLED',
      { taskId, reason },
      true,
      `Görev iptal edildi: ${reason}`,
    );

    return task;
  }

  /**
   * Görevi başarısız olarak işaretle
   */
  async failTask(
    taskId: string,
    reason: AddressTaskFailureReason,
    details?: string,
    tenantId?: string,
  ): Promise<AddressTask> {
    await this.assertTaskTenant(taskId, tenantId);

    const task = await this.prisma.addressTask.update({
      where: { id: taskId },
      data: {
        status: 'FAILED',
        failureReason: reason,
        failureDetails: details,
        completedAt: new Date(),
        updatedAt: new Date(),
      },
    });

    this.logger.log(`Task failed: ${taskId} (${reason})`);

    // Audit log
    await this.logAuditEvent(
      task.tenantId,
      task.caseId,
      task.debtorId,
      'TASK_FAILED',
      { taskId, reason, details },
      true,
      `Görev başarısız: ${reason}`,
    );

    return task;
  }

  /**
   * Hatırlatma gönder ve attempt count artır
   */
  async incrementAttempt(taskId: string): Promise<AddressTask> {
    const task = await this.prisma.addressTask.findUnique({
      where: { id: taskId },
    });

    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }

    const newAttemptCount = task.attemptCount + 1;
    const newDueAt = calculateClientResponseDueAt();

    const updatedTask = await this.prisma.addressTask.update({
      where: { id: taskId },
      data: {
        attemptCount: newAttemptCount,
        dueAt: newDueAt,
        lastRunAt: new Date(),
        updatedAt: new Date(),
      },
    });

    this.logger.log(`Task attempt incremented: ${taskId} (${newAttemptCount}/${task.maxAttempts})`);

    // Audit log
    await this.logAuditEvent(
      task.tenantId,
      task.caseId,
      task.debtorId,
      'REMINDER_SENT',
      { taskId, attemptCount: newAttemptCount, maxAttempts: task.maxAttempts },
      true,
      `Hatırlatma #${newAttemptCount} gönderildi`,
    );

    return updatedTask;
  }

  /**
   * Süresi geçmiş görevleri bul
   */
  async findOverdueTasks(tenantId?: string): Promise<AddressTask[]> {
    const now = new Date();

    return this.prisma.addressTask.findMany({
      where: {
        ...(tenantId ? { tenantId } : {}),
        status: 'WAITING_EXTERNAL',
        dueAt: { lt: now },
        attemptCount: { lt: 3 }, // maxAttempts'ten küçük
      },
      orderBy: { dueAt: 'asc' },
    });
  }

  /**
   * Maksimum denemeye ulaşmış görevleri bul
   */
  async findTasksAtMaxAttempts(tenantId?: string): Promise<AddressTask[]> {
    return this.prisma.addressTask.findMany({
      where: {
        ...(tenantId ? { tenantId } : {}),
        status: 'WAITING_EXTERNAL',
        attemptCount: { gte: 3 },
      },
    });
  }

  /**
   * Dosya için bekleyen görevleri getir
   */
  async getPendingTasksForCase(caseId: string, tenantId?: string): Promise<AddressTask[]> {
    return this.prisma.addressTask.findMany({
      where: {
        ...(tenantId ? { tenantId } : {}),
        caseId,
        status: {
          in: ['PENDING', 'IN_PROGRESS', 'WAITING_EXTERNAL', 'OVERDUE'],
        },
      },
      orderBy: { dueAt: 'asc' },
    });
  }

  /**
   * Dosya için tüm görevleri getir (tamamlananlar dahil)
   */
  async getAllTasksForCase(caseId: string, tenantId?: string): Promise<AddressTask[]> {
    return this.prisma.addressTask.findMany({
      where: {
        ...(tenantId ? { tenantId } : {}),
        caseId,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Dosya için notları getir (audit log'lardan showInNotes=true olanlar)
   */
  async getNotesForCase(caseId: string, tenantId?: string): Promise<any[]> {
    const logs = await this.prisma.addressAuditLog.findMany({
      where: {
        ...(tenantId ? { tenantId } : {}),
        caseId,
        showInNotes: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 50, // Son 50 not
    });

    return logs.map((log) => ({
      id: log.id,
      content: log.noteText || log.action,
      createdAt: log.createdAt.toISOString(),
      createdBy: { name: 'Sistem' },
      type: 'SISTEM' as const,
      action: log.action,
      details: log.details,
    }));
  }

  /**
   * Borçlu için görevleri getir
   */
  async getTasksByDebtor(debtorId: string, tenantId?: string): Promise<AddressTask[]> {
    return this.prisma.addressTask.findMany({
      where: {
        ...(tenantId ? { tenantId } : {}),
        debtorId,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Dosya yenilendiğinde adres iş akışını başlat
   * Her borçlu için CLIENT_REQUEST_DEBTOR_ADDRESSES görevi oluşturur
   * Müvekkile otomatik bildirim gönderir
   */
  async triggerAddressWorkflowForCase(
    tenantId: string,
    caseId: string,
    sendNotification: boolean = true,
  ): Promise<{ tasksCreated: number; debtorsProcessed: number; notificationSent: boolean; skippedDuplicate?: boolean }> {
    // 1) Dosya bu tenant'a ait mi? (ASSIGN-1 blocker #2: cross-tenant bilgi sızıntısı engeli —
    //    audit/varlık kontrolünden ÖNCE. Yabancı tenant'ın caseId'si için recent-audit oracle'ı
    //    çalışmadan 404 döner.)
    const caseData = await this.prisma.case.findFirst({
      where: { id: caseId, tenantId },
      include: {
        caseClients: {
          include: {
            client: {
              select: {
                id: true,
                displayName: true,
                email: true,
              },
            },
          },
        },
      },
    });

    if (!caseData) {
      throw new NotFoundException(`Dosya bu tenant'ta bulunamadı: ${caseId}`);
    }

    // 2) Son 5 dakika içinde aynı dosya için e-posta gönderilmiş mi (tenant-scoped — ASSIGN-1 blocker #2)
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    const recentNotification = await this.prisma.addressAuditLog.findFirst({
      where: {
        tenantId,
        caseId,
        action: 'CLIENT_NOTIFICATION_SENT',
        createdAt: { gte: fiveMinutesAgo },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (recentNotification) {
      this.logger.warn(`Son 5 dakika içinde bu dosya için e-posta gönderilmiş, atlanıyor: ${caseId}`);
      return {
        tasksCreated: 0,
        debtorsProcessed: 0,
        notificationSent: false,
        skippedDuplicate: true,
      };
    }

    // Dosyadaki borçluları al (tenant-scoped via case relation — ASSIGN-1 blocker #3)
    const caseDebtors = await this.prisma.caseDebtor.findMany({
      where: { caseId, case: { tenantId } },
      include: {
        debtor: {
          select: {
            id: true,
            name: true,
            type: true,
          },
        },
      },
    });

    let tasksCreated = 0;
    let tasksSkipped = 0;
    const debtorNames: string[] = [];
    const skippedDebtorNames: string[] = [];

    for (const cd of caseDebtors) {
      // Bypass kontrolü - müvekkil teyitli adres varsa görev oluşturma (tenant-scoped — ASSIGN-1 blocker #3)
      const bypassCheck = await this.shouldBypassAddressRequest(cd.debtorId, tenantId);
      if (bypassCheck.bypass) {
        this.logger.log(`Skipping address request for ${cd.debtor.name}: ${bypassCheck.reason}`);
        skippedDebtorNames.push(cd.debtor.name);
        tasksSkipped++;
        continue;
      }

      // Sadece şahıs borçlular için müvekkile sor görevi oluştur
      // Şirketler için farklı bir akış olabilir (Ticaret Sicil sorgusu vb.)
      const taskType: AddressTaskType =
        cd.debtor.type === 'INDIVIDUAL'
          ? 'CLIENT_REQUEST_DEBTOR_ADDRESSES'
          : 'CLIENT_REQUEST_DEBTOR_ADDRESSES'; // Şirketler için de aynı şimdilik

      const task = await this.createTask({
        tenantId,
        caseId,
        debtorId: cd.debtorId,
        taskType,
        title: `${cd.debtor.name} için adres bilgisi iste`,
        description: `Müvekkilden ${cd.debtor.name} için güncel adres bilgisi talep edilecek`,
      });

      if (task) {
        tasksCreated++;
        debtorNames.push(cd.debtor.name);
      }
    }

    // Bypass edilen borçlular için audit log
    if (tasksSkipped > 0) {
      await this.logAuditEvent(
        tenantId,
        caseId,
        null,
        'ADDRESS_REQUEST_BYPASSED',
        { skippedCount: tasksSkipped, skippedDebtors: skippedDebtorNames },
        true,
        `${tasksSkipped} borçlu için adres talebi atlandı (müvekkil teyitli adres mevcut)`,
      );
    }

    // Müvekkile bildirim gönder
    let notificationSent = false;
    if (sendNotification && tasksCreated > 0 && caseData.caseClients?.length > 0) {
      const primaryClient = caseData.caseClients[0]?.client;
      
      if (primaryClient?.id) {
        try {
          // E-posta içeriği oluştur (Profesyonel format)
          const debtorList = debtorNames.map(name => `<li><strong>${name}</strong></li>`).join('');
          const emailBody = `
            <p>Sayın ${primaryClient.displayName || 'Müvekkilimiz'},</p>
            
            <p><strong>${caseData.fileNumber}</strong> numaralı dosyanız kapsamında aşağıda bilgileri yer alan borçlulara ait güncel iletişim ve adres bilgilerinin tarafımıza iletilmesi gerekmektedir:</p>
            
            <ul style="margin: 15px 0;">${debtorList}</ul>
            
            <p>Lütfen her bir borçlu için mümkün olan tüm bilgileri aşağıdaki kapsamda bizimle paylaşınız:</p>
            
            <ul style="margin: 15px 0;">
              <li>Ev adresi</li>
              <li>İş adresi</li>
              <li>Şube / depo / üretim tesisi gibi fiili kullanım adresleri</li>
              <li>Telefon numaraları (sabit / GSM)</li>
              <li>E-posta adresleri</li>
              <li>Bildiğiniz başkaca adres veya iletişim bilgileri</li>
            </ul>
            
            <p>Bu bilgiler, tebligat işlemlerinin usulüne uygun ve gecikmeksizin yürütülebilmesi açısından kritik öneme sahiptir. Eksik veya hatalı bilgi, dosya sürecinde gecikmelere ve ek masraflara yol açabilecektir.</p>
            
            <p><strong>Yanıt süresi:</strong> Bu e-postanın tarafınıza ulaşmasından itibaren <strong>3 gün</strong>.</p>
            
            <p>Bilgi paylaşımı veya sorularınız için bizimle iletişime geçebilirsiniz.</p>
            
            <p>Saygılarımızla</p>
          `;

          await this.clientNotificationService.sendEmail(tenantId, 'system', {
            clientId: primaryClient.id,
            caseId: caseId,
            type: 'ADRES_TALEBI',
            subject: `${caseData.fileNumber} - Borçlu Adres Bilgisi Talebi`,
            body: emailBody,
          });

          notificationSent = true;
          this.logger.log(`Müvekkile adres talebi e-postası gönderildi: ${primaryClient.displayName}`);

          // Audit log - bildirim gönderildi
          await this.logAuditEvent(
            tenantId,
            caseId,
            null,
            'CLIENT_NOTIFICATION_SENT',
            {
              channel: 'EMAIL',
              clientId: primaryClient.id,
              debtorCount: debtorNames.length,
            },
            true,
            `Müvekkile adres talebi e-postası gönderildi (${debtorNames.length} borçlu için)`,
          );
        } catch (error: any) {
          this.logger.warn(`Müvekkile e-posta gönderilemedi: ${error.message}`);
          // E-posta gönderilemese bile görevler oluşturuldu, hata fırlatma
          await this.logAuditEvent(
            tenantId,
            caseId,
            null,
            'CLIENT_NOTIFICATION_FAILED',
            {
              channel: 'EMAIL',
              error: error.message,
            },
            true,
            `Müvekkile e-posta gönderilemedi: ${error.message}`,
          );
        }
      }
    }

    // Genel audit log
    await this.logAuditEvent(
      tenantId,
      caseId,
      null,
      'ADDRESS_WORKFLOW_TRIGGERED',
      {
        debtorsProcessed: caseDebtors.length,
        tasksCreated,
        notificationSent,
      },
      true,
      `Adres iş akışı başlatıldı: ${caseDebtors.length} borçlu için ${tasksCreated} görev oluşturuldu`,
    );

    return {
      tasksCreated,
      debtorsProcessed: caseDebtors.length,
      notificationSent,
    };
  }

  /**
   * Dosya kapandığında tüm bekleyen görevleri iptal et
   */
  async cancelAllPendingTasksForCase(caseId: string): Promise<number> {
    const result = await this.prisma.addressTask.updateMany({
      where: {
        caseId,
        status: {
          in: ['PENDING', 'IN_PROGRESS', 'WAITING_EXTERNAL'],
        },
      },
      data: {
        status: 'CANCELLED',
        cancellationReason: 'CASE_CLOSED',
        completedAt: new Date(),
        updatedAt: new Date(),
      },
    });

    this.logger.log(`Cancelled ${result.count} tasks for case ${caseId}`);

    return result.count;
  }

  /**
   * Varsayılan görev başlığı
   */
  private getDefaultTitle(taskType: AddressTaskType): string {
    const titles: Record<AddressTaskType, string> = {
      DOC_EXTRACT_DEBTOR_ADDRESSES: 'Evraktan adres çıkar',
      CLIENT_CONTACT_VALIDATE: 'Müvekkil iletişim bilgilerini doğrula',
      CLIENT_REQUEST_DEBTOR_ADDRESSES: 'Müvekkile adres talebi gönder',
      CLIENT_REMIND_DEBTOR_ADDRESSES: 'Müvekkile hatırlatma gönder',
      CLIENT_ANNUAL_ADDRESS_REFRESH: 'Yıllık adres talebi',
      ASSIGN_MANUAL_CALL_CLIENT: 'Müvekkili telefonla ara',
      MANUAL_CLIENT_FOLLOWUP: 'Müvekkil takibi',
      UYAP_PULL_MERNIS: 'MERNİS sorgusu yap',
      UYAP_PULL_SGK: 'SGK sorgusu yap',
    };

    return titles[taskType] || 'Adres görevi';
  }

  /**
   * Audit log kaydı oluştur
   */
  private async logAuditEvent(
    tenantId: string,
    caseId: string,
    debtorId: string | null,
    action: string,
    details: Record<string, any>,
    showInNotes: boolean = false,
    noteText?: string,
  ): Promise<void> {
    try {
      await this.prisma.addressAuditLog.create({
        data: {
          tenantId,
          caseId,
          debtorId,
          action,
          details: details as Prisma.JsonObject,
          showInNotes,
          noteText,
        },
      });
    } catch (error) {
      this.logger.error(`Failed to create audit log: ${error}`);
    }
  }

  // ============================================================================
  // TASK BYPASS & AUTO-COMPLETION RULES
  // ============================================================================

  /**
   * Borçlunun "yararlı adresi" var mı kontrol et
   * Yararlı adres: DECLARED_CLIENT, DECLARED_DOCUMENT veya MERNIS_RESIDENCE
   * isCurrent = true ve confidenceLevel >= MEDIUM
   */
  async hasUsefulAddresses(debtorId: string, tenantId?: string): Promise<boolean> {
    const usefulAddressCount = await this.prisma.debtorAddress.count({
      where: {
        debtorId,
        // DebtorAddress'te tenantId yok → debtor relation üzerinden scope (ASSIGN-1)
        ...(tenantId ? { debtor: { tenantId } } : {}),
        isCurrent: true,
        addressCategory: {
          in: ['DECLARED_CLIENT', 'DECLARED_DOCUMENT', 'MERNIS_RESIDENCE'],
        },
        confidenceLevel: {
          in: ['MEDIUM', 'HIGH'],
        },
      },
    });

    return usefulAddressCount > 0;
  }

  /**
   * Adres talebi bypass edilmeli mi kontrol et
   * Bypass koşulları:
   * 1. Debtor'un addressIntakeMode = CLIENT_CONFIRMED
   * 2. VE yararlı adresi var
   */
  async shouldBypassAddressRequest(debtorId: string, tenantId?: string): Promise<{ bypass: boolean; reason?: string }> {
    // Debtor tenant-scoped (ASSIGN-1 blocker #3): tenantId verilirse yabancı tenant borçlusu okunmaz.
    const debtor = await this.prisma.debtor.findFirst({
      where: { id: debtorId, ...(tenantId ? { tenantId } : {}) },
      select: { addressIntakeMode: true, name: true },
    });

    if (!debtor) {
      return { bypass: false, reason: 'Debtor not found' };
    }

    // CLIENT_CONFIRMED ise ve yararlı adres varsa bypass
    if (debtor.addressIntakeMode === 'CLIENT_CONFIRMED') {
      const hasUseful = await this.hasUsefulAddresses(debtorId, tenantId);
      if (hasUseful) {
        return { 
          bypass: true, 
          reason: `${debtor.name} için adresler müvekkil teyitli - otomatik talep atlandı` 
        };
      }
    }

    return { bypass: false };
  }

  /**
   * Adres geldiğinde açık görevleri otomatik tamamla
   * - CLIENT_REQUEST_DEBTOR_ADDRESSES → DONE
   * - CLIENT_REMIND_DEBTOR_ADDRESSES → CANCELLED
   */
  async autoCompleteOnAddressReceived(
    tenantId: string,
    caseId: string,
    debtorId: string,
    source: 'CLIENT_REPLY' | 'CLIENT_CONFIRMED_UI' | 'MANUAL_ENTRY',
  ): Promise<{ tasksCompleted: number; tasksCancelled: number }> {
    let tasksCompleted = 0;
    let tasksCancelled = 0;

    // Açık CLIENT_REQUEST_DEBTOR_ADDRESSES görevini bul ve tamamla
    const requestTask = await this.prisma.addressTask.findFirst({
      where: {
        tenantId,
        caseId,
        debtorId,
        taskType: 'CLIENT_REQUEST_DEBTOR_ADDRESSES',
        status: {
          in: ['PENDING', 'IN_PROGRESS', 'WAITING_EXTERNAL'],
        },
      },
    });

    if (requestTask) {
      await this.prisma.addressTask.update({
        where: { id: requestTask.id },
        data: {
          status: 'DONE',
          resultType: 'POSITIVE',
          resultData: { doneReason: 'ADDRESSES_RECEIVED', source } as Prisma.JsonObject,
          completedAt: new Date(),
          updatedAt: new Date(),
        },
      });
      tasksCompleted++;

      this.logger.log(`Auto-completed task ${requestTask.id} - addresses received from ${source}`);
    }

    // Açık hatırlatma görevlerini iptal et
    const reminderResult = await this.prisma.addressTask.updateMany({
      where: {
        tenantId,
        caseId,
        debtorId,
        taskType: 'CLIENT_REMIND_DEBTOR_ADDRESSES',
        status: {
          in: ['PENDING', 'IN_PROGRESS', 'WAITING_EXTERNAL'],
        },
      },
      data: {
        status: 'CANCELLED',
        cancellationReason: 'SUPERSEDED',
        completedAt: new Date(),
        updatedAt: new Date(),
      },
    });
    tasksCancelled = reminderResult.count;

    // Audit log
    if (tasksCompleted > 0 || tasksCancelled > 0) {
      await this.logAuditEvent(
        tenantId,
        caseId,
        debtorId,
        'TASKS_AUTO_COMPLETED',
        { tasksCompleted, tasksCancelled, source },
        true,
        `Adres bilgileri alındı - ${tasksCompleted} görev tamamlandı, ${tasksCancelled} hatırlatma iptal edildi`,
      );
    }

    return { tasksCompleted, tasksCancelled };
  }

  /**
   * Operatör tarafından "Zaten aldık" ile görevi tamamla
   */
  async confirmReceivedByOperator(
    taskId: string,
    operatorId?: string,
    tenantId?: string,
  ): Promise<AddressTask> {
    // Tenant-scoped sahiplik kontrolü (ASSIGN-1): controller tenantId geçirir,
    // scheduler/iç bağlam geçmezse tüm tenant'larda aranır (eski davranış).
    const task = await this.prisma.addressTask.findFirst({
      where: { id: taskId, ...(tenantId ? { tenantId } : {}) },
    });

    if (!task) {
      throw new NotFoundException(`Adres görevi bulunamadı: ${taskId}`);
    }

    // Görevi tamamla
    const updatedTask = await this.prisma.addressTask.update({
      where: { id: taskId },
      data: {
        status: 'DONE',
        resultType: 'POSITIVE',
        resultData: { doneReason: 'CONFIRMED_BY_OPERATOR', operatorId } as Prisma.JsonObject,
        completedAt: new Date(),
        updatedAt: new Date(),
      },
    });

    // Aynı borçlu için açık hatırlatma görevlerini iptal et (tenant-scoped — ASSIGN-1 blocker #4)
    await this.prisma.addressTask.updateMany({
      where: {
        tenantId: task.tenantId,
        caseId: task.caseId,
        debtorId: task.debtorId,
        taskType: 'CLIENT_REMIND_DEBTOR_ADDRESSES',
        status: {
          in: ['PENDING', 'IN_PROGRESS', 'WAITING_EXTERNAL'],
        },
      },
      data: {
        status: 'CANCELLED',
        cancellationReason: 'SUPERSEDED',
        completedAt: new Date(),
        updatedAt: new Date(),
      },
    });

    // Audit log
    await this.logAuditEvent(
      task.tenantId,
      task.caseId,
      task.debtorId,
      'TASK_CONFIRMED_BY_OPERATOR',
      { taskId, operatorId },
      true,
      'Görev operatör tarafından tamamlandı - adresler zaten alınmış',
    );

    this.logger.log(`Task ${taskId} confirmed by operator ${operatorId}`);

    return updatedTask;
  }

  // ============================================================================
  // COMMUNICATION CHANNEL SELECTION (Task 7)
  // ============================================================================

  /**
   * Müvekkilin iletişim kanallarını belirle
   * @returns Kullanılabilir kanallar ve tercih edilen kanal
   */
  async getClientContactChannels(clientId: string): Promise<{
    hasEmail: boolean;
    hasWhatsApp: boolean;
    hasSms: boolean;
    preferredChannel: 'EMAIL' | 'WHATSAPP' | 'SMS' | 'BOTH' | 'NONE';
    email?: string;
    phone?: string;
  }> {
    const client = await this.prisma.client.findUnique({
      where: { id: clientId },
      include: {
        contacts: true,
      },
    });

    if (!client) {
      return {
        hasEmail: false,
        hasWhatsApp: false,
        hasSms: false,
        preferredChannel: 'NONE',
      };
    }

    // E-posta kontrolü
    const emailContact = client.contacts?.find(c => c.type === 'EMAIL' && c.isPrimary) 
      || client.contacts?.find(c => c.type === 'EMAIL');
    const email = emailContact?.value || client.email;
    const hasEmail = !!email;

    // Telefon kontrolü (WhatsApp ve SMS için)
    const phoneContact = client.contacts?.find(c => c.type === 'MOBILE' && c.isPrimary)
      || client.contacts?.find(c => c.type === 'MOBILE');
    const phone = phoneContact?.value || client.phone;
    const hasPhone = !!phone;

    // WhatsApp kontrolü - telefon varsa WhatsApp da var kabul ediyoruz
    // Gerçek implementasyonda WhatsApp Business API entegrasyonu gerekir
    const hasWhatsApp = hasPhone;
    const hasSms = hasPhone;

    // Tercih edilen kanal belirleme
    let preferredChannel: 'EMAIL' | 'WHATSAPP' | 'SMS' | 'BOTH' | 'NONE' = 'NONE';
    
    if (hasEmail && hasWhatsApp) {
      preferredChannel = 'BOTH';
    } else if (hasEmail) {
      preferredChannel = 'EMAIL';
    } else if (hasWhatsApp) {
      preferredChannel = 'WHATSAPP';
    } else if (hasSms) {
      preferredChannel = 'SMS';
    }

    return {
      hasEmail,
      hasWhatsApp,
      hasSms,
      preferredChannel,
      email: email || undefined,
      phone: phone || undefined,
    };
  }

  /**
   * Kanal seçim mantığı
   * - Sadece email varsa → EMAIL
   * - Sadece whatsapp varsa → WHATSAPP
   * - İkisi de varsa → BOTH (önce email, sonra whatsapp)
   */
  selectCommunicationChannel(channels: {
    hasEmail: boolean;
    hasWhatsApp: boolean;
    hasSms: boolean;
  }): 'EMAIL' | 'WHATSAPP' | 'SMS' | 'BOTH' | 'NONE' {
    const { hasEmail, hasWhatsApp, hasSms } = channels;

    if (hasEmail && hasWhatsApp) {
      return 'BOTH';
    } else if (hasEmail) {
      return 'EMAIL';
    } else if (hasWhatsApp) {
      return 'WHATSAPP';
    } else if (hasSms) {
      return 'SMS';
    }
    
    return 'NONE';
  }

  /**
   * Adres talebi mesajı gönder
   * Seçilen kanala göre e-posta ve/veya WhatsApp gönderir
   */
  async sendAddressRequest(
    tenantId: string,
    taskId: string,
    clientId: string,
    debtorNames: string[],
    caseFileNumber: string,
  ): Promise<{ success: boolean; channelUsed: string; error?: string }> {
    const channels = await this.getClientContactChannels(clientId);
    const selectedChannel = this.selectCommunicationChannel(channels);

    if (selectedChannel === 'NONE') {
      return {
        success: false,
        channelUsed: 'NONE',
        error: 'Müvekkilin iletişim bilgisi bulunamadı',
      };
    }

    try {
      // E-posta gönder
      if (selectedChannel === 'EMAIL' || selectedChannel === 'BOTH') {
        const debtorList = debtorNames.map(name => `<li><strong>${name}</strong></li>`).join('');
        const emailBody = `
          <p>Sayın Müvekkilimiz,</p>
          <p><strong>${caseFileNumber}</strong> numaralı dosyanız kapsamında aşağıdaki borçlulara ait güncel adres bilgilerinin tarafımıza iletilmesi gerekmektedir:</p>
          <ul>${debtorList}</ul>
          <p><strong>Yanıt süresi:</strong> 3 gün</p>
          <p>Saygılarımızla</p>
        `;

        await this.clientNotificationService.sendEmail(tenantId, 'system', {
          clientId,
          type: 'ADRES_TALEBI',
          subject: `${caseFileNumber} - Borçlu Adres Bilgisi Talebi`,
          body: emailBody,
        });
      }

      // WhatsApp gönder (şimdilik simüle - gerçek implementasyon için WhatsApp Business API gerekir)
      if (selectedChannel === 'WHATSAPP' || selectedChannel === 'BOTH') {
        // TODO: WhatsApp Business API entegrasyonu
        this.logger.log(`WhatsApp mesajı gönderilecek: ${maskPhone(channels.phone)}`);
      }

      // Task'ı güncelle - channelUsed kaydet
      await this.prisma.addressTask.update({
        where: { id: taskId },
        data: {
          channelUsed: selectedChannel,
          status: 'WAITING_EXTERNAL',
          lastRunAt: new Date(),
        },
      });

      return {
        success: true,
        channelUsed: selectedChannel,
      };
    } catch (error: any) {
      return {
        success: false,
        channelUsed: selectedChannel,
        error: error.message,
      };
    }
  }

  /**
   * Hatırlatma mesajı gönder
   */
  async sendReminder(
    tenantId: string,
    taskId: string,
    clientId: string,
    debtorNames: string[],
    caseFileNumber: string,
    attemptNumber: number,
  ): Promise<{ success: boolean; channelUsed: string; error?: string }> {
    const channels = await this.getClientContactChannels(clientId);
    const selectedChannel = this.selectCommunicationChannel(channels);

    if (selectedChannel === 'NONE') {
      return {
        success: false,
        channelUsed: 'NONE',
        error: 'Müvekkilin iletişim bilgisi bulunamadı',
      };
    }

    try {
      // E-posta hatırlatması gönder
      if (selectedChannel === 'EMAIL' || selectedChannel === 'BOTH') {
        const debtorList = debtorNames.map(name => `<li><strong>${name}</strong></li>`).join('');
        const emailBody = `
          <p>Sayın Müvekkilimiz,</p>
          <p><strong>HATIRLATMA (${attemptNumber}. bildirim)</strong></p>
          <p><strong>${caseFileNumber}</strong> numaralı dosyanız için daha önce talep ettiğimiz borçlu adres bilgilerini henüz almadık:</p>
          <ul>${debtorList}</ul>
          <p>Lütfen en kısa sürede bilgileri iletiniz.</p>
          <p>Saygılarımızla</p>
        `;

        await this.clientNotificationService.sendEmail(tenantId, 'system', {
          clientId,
          type: 'ADRES_HATIRLATMA',
          subject: `HATIRLATMA: ${caseFileNumber} - Borçlu Adres Bilgisi`,
          body: emailBody,
        });
      }

      return {
        success: true,
        channelUsed: selectedChannel,
      };
    } catch (error: any) {
      return {
        success: false,
        channelUsed: selectedChannel,
        error: error.message,
      };
    }
  }
}
