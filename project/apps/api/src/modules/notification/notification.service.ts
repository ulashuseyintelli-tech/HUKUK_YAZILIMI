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
    if (status === NotificationStatus.DELIVERED && notification.caseId) {
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

  // ==================== TAHSİLAT BİLDİRİMİ ŞABLONLARI ====================

  /**
   * Tahsilat bildirimi SMS şablonu oluştur
   */
  generateCollectionSmsTemplate(params: {
    debtorName: string;
    amount: number;
    currency: string;
    dueDate?: string;
    documentNo?: string;
    creditorName?: string;
    fileNumber?: string;
  }): string {
    const { debtorName, amount, currency, dueDate, documentNo, creditorName, fileNumber } = params;
    
    const currencySymbol = currency === "TRY" ? "TL" : currency;
    const formattedAmount = amount.toLocaleString("tr-TR", { minimumFractionDigits: 2 });
    
    let message = `Sayın ${debtorName},\n\n`;
    
    if (documentNo) {
      message += `${documentNo} numaralı belgeye istinaden `;
    }
    
    message += `${formattedAmount} ${currencySymbol} tutarındaki borcunuzun `;
    
    if (dueDate) {
      const dueDateFormatted = new Date(dueDate).toLocaleDateString("tr-TR");
      message += `${dueDateFormatted} tarihinde vadesi dolmuştur.\n\n`;
    } else {
      message += `ödenmesi gerekmektedir.\n\n`;
    }
    
    message += `Borcunuzu en kısa sürede ödemenizi rica ederiz.\n\n`;
    
    if (creditorName) {
      message += `Alacaklı: ${creditorName}\n`;
    }
    
    if (fileNumber) {
      message += `Dosya No: ${fileNumber}\n`;
    }
    
    message += `\nBu mesaj bilgilendirme amaçlıdır.`;
    
    return message;
  }

  /**
   * Tahsilat bildirimi e-posta şablonu oluştur
   */
  generateCollectionEmailTemplate(params: {
    debtorName: string;
    amount: number;
    currency: string;
    dueDate?: string;
    documentNo?: string;
    documentType?: string;
    creditorName?: string;
    fileNumber?: string;
    bankName?: string;
    iban?: string;
  }): { subject: string; body: string; html: string } {
    const { 
      debtorName, amount, currency, dueDate, documentNo, documentType,
      creditorName, fileNumber, bankName, iban 
    } = params;
    
    const currencySymbol = currency === "TRY" ? "TL" : currency;
    const formattedAmount = amount.toLocaleString("tr-TR", { minimumFractionDigits: 2 });
    const dueDateFormatted = dueDate ? new Date(dueDate).toLocaleDateString("tr-TR") : null;
    
    // Konu
    const subject = `Ödeme Hatırlatması - ${formattedAmount} ${currencySymbol}${fileNumber ? ` (${fileNumber})` : ""}`;
    
    // Düz metin
    let body = `Sayın ${debtorName},\n\n`;
    
    if (documentType && documentNo) {
      body += `${documentType} (${documentNo}) belgesine istinaden `;
    } else if (documentNo) {
      body += `${documentNo} numaralı belgeye istinaden `;
    }
    
    body += `${formattedAmount} ${currencySymbol} tutarındaki borcunuz bulunmaktadır.\n\n`;
    
    if (dueDateFormatted) {
      body += `Vade Tarihi: ${dueDateFormatted}\n`;
    }
    
    if (creditorName) {
      body += `Alacaklı: ${creditorName}\n`;
    }
    
    if (fileNumber) {
      body += `Dosya No: ${fileNumber}\n`;
    }
    
    body += `\n`;
    
    if (bankName && iban) {
      body += `Ödeme Bilgileri:\n`;
      body += `Banka: ${bankName}\n`;
      body += `IBAN: ${iban}\n\n`;
    }
    
    body += `Borcunuzu en kısa sürede ödemenizi rica ederiz.\n\n`;
    body += `Saygılarımızla,\n`;
    if (creditorName) {
      body += creditorName;
    }
    
    // HTML
    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #f59e0b, #d97706); color: white; padding: 20px; border-radius: 8px 8px 0 0; }
    .content { background: #fff; padding: 20px; border: 1px solid #e5e7eb; border-top: none; }
    .amount { font-size: 24px; font-weight: bold; color: #d97706; }
    .info-box { background: #fef3c7; padding: 15px; border-radius: 8px; margin: 15px 0; }
    .payment-box { background: #ecfdf5; padding: 15px; border-radius: 8px; margin: 15px 0; border-left: 4px solid #10b981; }
    .footer { background: #f9fafb; padding: 15px; border-radius: 0 0 8px 8px; font-size: 12px; color: #6b7280; }
    .label { font-weight: bold; color: #4b5563; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h2 style="margin: 0;">💰 Ödeme Hatırlatması</h2>
    </div>
    <div class="content">
      <p>Sayın <strong>${debtorName}</strong>,</p>
      
      <div class="info-box">
        <p style="margin: 0;">
          ${documentType && documentNo ? `<strong>${documentType}</strong> (${documentNo}) belgesine istinaden ` : documentNo ? `${documentNo} numaralı belgeye istinaden ` : ""}
          aşağıdaki tutarda borcunuz bulunmaktadır:
        </p>
        <p class="amount" style="margin: 10px 0 0 0;">${formattedAmount} ${currencySymbol}</p>
      </div>
      
      <table style="width: 100%; border-collapse: collapse;">
        ${dueDateFormatted ? `<tr><td class="label">Vade Tarihi:</td><td>${dueDateFormatted}</td></tr>` : ""}
        ${creditorName ? `<tr><td class="label">Alacaklı:</td><td>${creditorName}</td></tr>` : ""}
        ${fileNumber ? `<tr><td class="label">Dosya No:</td><td>${fileNumber}</td></tr>` : ""}
      </table>
      
      ${bankName && iban ? `
      <div class="payment-box">
        <p style="margin: 0 0 10px 0;"><strong>💳 Ödeme Bilgileri</strong></p>
        <p style="margin: 0;"><span class="label">Banka:</span> ${bankName}</p>
        <p style="margin: 5px 0 0 0;"><span class="label">IBAN:</span> <code>${iban}</code></p>
      </div>
      ` : ""}
      
      <p>Borcunuzu en kısa sürede ödemenizi rica ederiz.</p>
      
      <p>Saygılarımızla,<br>${creditorName || ""}</p>
    </div>
    <div class="footer">
      <p style="margin: 0;">Bu e-posta bilgilendirme amaçlıdır. Ödeme yaptıysanız lütfen bu mesajı dikkate almayınız.</p>
    </div>
  </div>
</body>
</html>`;
    
    return { subject, body, html };
  }

  /**
   * Tahsilat bildirimi şablonlarını getir (SMS ve E-posta)
   */
  getCollectionTemplates(params: {
    debtorName: string;
    amount: number;
    currency: string;
    dueDate?: string;
    documentNo?: string;
    documentType?: string;
    creditorName?: string;
    fileNumber?: string;
    bankName?: string;
    iban?: string;
  }): { sms: string; email: { subject: string; body: string; html: string } } {
    return {
      sms: this.generateCollectionSmsTemplate(params),
      email: this.generateCollectionEmailTemplate(params),
    };
  }
}
