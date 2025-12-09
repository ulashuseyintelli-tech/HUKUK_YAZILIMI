import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import {
  NotificationType,
  NotificationChannel,
  NotificationStatus,
  WorkflowStage,
  TriggerType,
} from "@prisma/client";

export interface CreateNotificationDto {
  caseId: string;
  type: NotificationType;
  channel: NotificationChannel;
  recipient: string;
  recipientName?: string;
  subject?: string;
  content?: string;
  templateCode?: string;
  scheduledAt?: Date;
  expiresAt?: Date;
  metadata?: any;
}

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(private prisma: PrismaService) {}

  // Tebligat oluştur
  async create(dto: CreateNotificationDto) {
    return this.prisma.notificationQueue.create({
      data: {
        caseId: dto.caseId,
        type: dto.type,
        channel: dto.channel,
        recipient: dto.recipient,
        recipientName: dto.recipientName,
        subject: dto.subject,
        content: dto.content,
        templateCode: dto.templateCode,
        status: NotificationStatus.PENDING,
        scheduledAt: dto.scheduledAt || new Date(),
        expiresAt: dto.expiresAt,
        metadata: dto.metadata,
      },
    });
  }

  // Ödeme emri tebligatı oluştur
  async createPaymentOrderNotification(
    caseId: string,
    debtorInfo: { tcNo: string; name: string; address?: string }
  ) {
    const caseData = await this.prisma.case.findUnique({
      where: { id: caseId },
      include: { formType: true },
    });

    if (!caseData) throw new Error("Case not found");

    // 10 günlük süre hesapla
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 10);

    const notification = await this.create({
      caseId,
      type: NotificationType.PAYMENT_ORDER,
      channel: NotificationChannel.E_TEBLIGAT,
      recipient: debtorInfo.tcNo,
      recipientName: debtorInfo.name,
      subject: `Ödeme Emri - ${caseData.fileNumber}`,
      templateCode: "ODEME_EMRI_" + (caseData.formType?.code || "GENEL"),
      expiresAt,
      metadata: {
        fileNumber: caseData.fileNumber,
        principalAmount: caseData.principalAmount,
        debtorAddress: debtorInfo.address,
      },
    });

    // Dosya aşamasını güncelle
    await this.prisma.case.update({
      where: { id: caseId },
      data: { workflowStage: WorkflowStage.PAYMENT_ORDER },
    });

    // Lifecycle event ekle
    await this.prisma.caseLifecycle.create({
      data: {
        caseId,
        stage: WorkflowStage.PAYMENT_ORDER,
        action: "Ödeme emri tebligatı oluşturuldu",
        description: `Borçlu: ${debtorInfo.name}`,
        triggeredBy: TriggerType.MANUAL,
      },
    });

    return notification;
  }

  // Tebligat durumunu güncelle
  async updateStatus(
    notificationId: string,
    status: NotificationStatus,
    details?: { deliveredAt?: Date; responseAt?: Date; errorMessage?: string }
  ) {
    const notification = await this.prisma.notificationQueue.update({
      where: { id: notificationId },
      data: {
        status,
        deliveredAt: details?.deliveredAt,
        responseAt: details?.responseAt,
        errorMessage: details?.errorMessage,
      },
      include: { case: true },
    });

    // Tebligat teslim edildiyse dosya aşamasını güncelle
    if (status === NotificationStatus.DELIVERED) {
      await this.prisma.case.update({
        where: { id: notification.caseId },
        data: { workflowStage: WorkflowStage.WAITING_RESPONSE },
      });

      await this.prisma.caseLifecycle.create({
        data: {
          caseId: notification.caseId,
          stage: WorkflowStage.WAITING_RESPONSE,
          action: "Tebligat teslim edildi",
          description: `Teslim tarihi: ${details?.deliveredAt?.toLocaleDateString("tr-TR")}`,
          triggeredBy: TriggerType.SYSTEM,
        },
      });
    }

    return notification;
  }

  // E-Tebligat kontrolü (simülasyon)
  async checkETebligatStatus(notificationId: string) {
    // Gerçek sistemde UYAP/E-Tebligat API'si çağrılacak
    // Şimdilik simülasyon
    const notification = await this.prisma.notificationQueue.findUnique({
      where: { id: notificationId },
    });

    if (!notification) throw new Error("Notification not found");

    // Simülasyon: %80 başarılı teslim
    const isDelivered = Math.random() > 0.2;

    if (isDelivered) {
      return this.updateStatus(notificationId, NotificationStatus.DELIVERED, {
        deliveredAt: new Date(),
      });
    }

    return notification;
  }

  // Dosya için tebligatları getir
  async findByCaseId(caseId: string) {
    return this.prisma.notificationQueue.findMany({
      where: { caseId },
      orderBy: { createdAt: "desc" },
    });
  }

  // Bekleyen tebligatları getir
  async findPending() {
    return this.prisma.notificationQueue.findMany({
      where: {
        status: { in: [NotificationStatus.PENDING, NotificationStatus.SCHEDULED] },
        scheduledAt: { lte: new Date() },
      },
      include: { case: { select: { fileNumber: true, tenantId: true } } },
      orderBy: { scheduledAt: "asc" },
    });
  }

  // Süresi dolan tebligatları getir
  async findExpired() {
    return this.prisma.notificationQueue.findMany({
      where: {
        status: NotificationStatus.DELIVERED,
        expiresAt: { lte: new Date() },
      },
      include: { case: true },
    });
  }

  // SMS gönder (simülasyon)
  async sendSMS(caseId: string, phone: string, message: string) {
    // Gerçek sistemde SMS API'si çağrılacak
    return this.create({
      caseId,
      type: NotificationType.REMINDER,
      channel: NotificationChannel.SMS,
      recipient: phone,
      content: message,
    });
  }

  // Email gönder (simülasyon)
  async sendEmail(caseId: string, email: string, subject: string, content: string) {
    // Gerçek sistemde Email API'si çağrılacak
    return this.create({
      caseId,
      type: NotificationType.INFO,
      channel: NotificationChannel.EMAIL,
      recipient: email,
      subject,
      content,
    });
  }

  // 10 günlük ödeme süresi sayacı
  async getPaymentDeadline(caseId: string): Promise<{ deadline: Date | null; daysRemaining: number }> {
    const notification = await this.prisma.notificationQueue.findFirst({
      where: {
        caseId,
        type: NotificationType.PAYMENT_ORDER,
        status: NotificationStatus.DELIVERED,
      },
      orderBy: { deliveredAt: "desc" },
    });

    if (!notification?.expiresAt) {
      return { deadline: null, daysRemaining: -1 };
    }

    const now = new Date();
    const daysRemaining = Math.ceil(
      (notification.expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
    );

    return {
      deadline: notification.expiresAt,
      daysRemaining: Math.max(0, daysRemaining),
    };
  }

  // İstatistikler
  async getStats(tenantId?: string) {
    const where = tenantId ? { case: { tenantId } } : {};

    const [total, pending, delivered, expired] = await Promise.all([
      this.prisma.notificationQueue.count({ where }),
      this.prisma.notificationQueue.count({
        where: { ...where, status: NotificationStatus.PENDING },
      }),
      this.prisma.notificationQueue.count({
        where: { ...where, status: NotificationStatus.DELIVERED },
      }),
      this.prisma.notificationQueue.count({
        where: { ...where, status: NotificationStatus.EXPIRED },
      }),
    ]);

    return { total, pending, delivered, expired };
  }
}
