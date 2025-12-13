import { Injectable, Logger, BadRequestException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { OfficeService } from "../office/office.service";
import * as nodemailer from "nodemailer";

export interface SendEmailDto {
  clientId: string;
  caseId?: string;
  type: string; // MASRAF_ISTEK, GENEL_BILGILENDIRME, RAPOR, HATIRLATMA
  subject: string;
  body: string;
  templateId?: string;
}

export interface SendSmsDto {
  clientId: string;
  caseId?: string;
  type: string;
  body: string;
}

@Injectable()
export class ClientNotificationService {
  private readonly logger = new Logger(ClientNotificationService.name);

  constructor(
    private prisma: PrismaService,
    private officeService: OfficeService
  ) {}

  // E-posta gönder
  async sendEmail(tenantId: string, userId: string, dto: SendEmailDto) {
    // Müvekkil bilgilerini al
    const client = await this.prisma.client.findFirst({
      where: { id: dto.clientId, tenantId },
      include: { contacts: true },
    });

    if (!client) {
      throw new BadRequestException("Müvekkil bulunamadı");
    }

    // E-posta adresini bul
    const emailContact = client.contacts?.find(
      (c) => c.type === "EMAIL" && c.isPrimary
    ) || client.contacts?.find((c) => c.type === "EMAIL");
    
    const recipientEmail = emailContact?.value || client.email;

    if (!recipientEmail) {
      throw new BadRequestException("Müvekkilin e-posta adresi bulunamadı");
    }

    // SMTP ayarlarını al
    const smtpSettings = await this.officeService.getFullSmtpSettings(tenantId);

    if (!smtpSettings.smtpHost || !smtpSettings.smtpUser) {
      throw new BadRequestException(
        "E-posta ayarları yapılandırılmamış. Lütfen Büro Ayarları > E-posta bölümünden SMTP ayarlarını yapın."
      );
    }

    // Nodemailer transporter oluştur
    const transporter = nodemailer.createTransport({
      host: smtpSettings.smtpHost,
      port: smtpSettings.smtpPort || 587,
      secure: smtpSettings.smtpSecure || false,
      auth: {
        user: smtpSettings.smtpUser,
        pass: smtpSettings.smtpPass,
      },
    } as nodemailer.TransportOptions);

    // Bildirim kaydı oluştur
    const notification = await this.prisma.clientNotification.create({
      data: {
        tenantId,
        clientId: dto.clientId,
        caseId: dto.caseId,
        channel: "EMAIL",
        type: dto.type,
        subject: dto.subject,
        body: dto.body,
        status: "PENDING",
        sentById: userId,
        metadata: dto.templateId ? { templateId: dto.templateId } : undefined,
      },
    });

    try {
      // E-posta gönder
      const fromName = smtpSettings.smtpFromName || "Hukuk Bürosu";
      const fromEmail = smtpSettings.smtpFromEmail || smtpSettings.smtpUser;

      await transporter.sendMail({
        from: `"${fromName}" <${fromEmail}>`,
        to: recipientEmail,
        subject: dto.subject,
        html: dto.body,
      });

      // Başarılı - durumu güncelle
      await this.prisma.clientNotification.update({
        where: { id: notification.id },
        data: {
          status: "SENT",
          sentAt: new Date(),
        },
      });

      this.logger.log(`E-posta gönderildi: ${recipientEmail}`);

      return {
        success: true,
        notificationId: notification.id,
        recipient: recipientEmail,
      };
    } catch (error: any) {
      // Hata - durumu güncelle
      await this.prisma.clientNotification.update({
        where: { id: notification.id },
        data: {
          status: "FAILED",
          errorMessage: error.message,
        },
      });

      this.logger.error(`E-posta gönderilemedi: ${error.message}`);
      throw new BadRequestException(`E-posta gönderilemedi: ${error.message}`);
    }
  }

  // SMS gönder (NetGSM API)
  async sendSms(tenantId: string, userId: string, dto: SendSmsDto) {
    const client = await this.prisma.client.findFirst({
      where: { id: dto.clientId, tenantId },
      include: { contacts: true },
    });

    if (!client) {
      throw new BadRequestException("Müvekkil bulunamadı");
    }

    // Telefon numarasını bul
    const phoneContact = client.contacts?.find(
      (c) => c.type === "MOBILE" && c.isPrimary
    ) || client.contacts?.find((c) => c.type === "MOBILE");
    
    let recipientPhone = phoneContact?.value || client.phone;

    if (!recipientPhone) {
      throw new BadRequestException("Müvekkilin telefon numarası bulunamadı");
    }

    // Telefon numarasını formatla (90 ile başlamalı)
    recipientPhone = this.formatPhoneNumber(recipientPhone);

    // SMS ayarlarını al
    const smsSettings = await this.officeService.getFullSmsSettings(tenantId);

    if (!smsSettings.smsProvider || !smsSettings.smsApiKey) {
      throw new BadRequestException(
        "SMS ayarları yapılandırılmamış. Lütfen Büro Ayarları > SMS bölümünden ayarları yapın."
      );
    }

    // Bildirim kaydı oluştur
    const notification = await this.prisma.clientNotification.create({
      data: {
        tenantId,
        clientId: dto.clientId,
        caseId: dto.caseId,
        channel: "SMS",
        type: dto.type,
        body: dto.body,
        status: "PENDING",
        sentById: userId,
      },
    });

    try {
      let result;
      
      const smsConfig = {
        smsApiKey: smsSettings.smsApiKey || "",
        smsApiSecret: smsSettings.smsApiSecret || "",
        smsSender: smsSettings.smsSender || "",
      };

      if (smsSettings.smsProvider === "NETGSM") {
        result = await this.sendNetGsmSms(smsConfig, recipientPhone, dto.body);
      } else if (smsSettings.smsProvider === "ILETI_MERKEZI") {
        result = await this.sendIletiMerkeziSms(smsConfig, recipientPhone, dto.body);
      } else {
        throw new BadRequestException(`Desteklenmeyen SMS sağlayıcı: ${smsSettings.smsProvider}`);
      }

      // Başarılı - durumu güncelle
      await this.prisma.clientNotification.update({
        where: { id: notification.id },
        data: {
          status: "SENT",
          sentAt: new Date(),
          metadata: { smsResult: result },
        },
      });

      this.logger.log(`SMS gönderildi: ${recipientPhone}`);

      return {
        success: true,
        notificationId: notification.id,
        recipient: recipientPhone,
      };
    } catch (error: any) {
      // Hata - durumu güncelle
      await this.prisma.clientNotification.update({
        where: { id: notification.id },
        data: {
          status: "FAILED",
          errorMessage: error.message,
        },
      });

      this.logger.error(`SMS gönderilemedi: ${error.message}`);
      throw new BadRequestException(`SMS gönderilemedi: ${error.message}`);
    }
  }

  // Telefon numarasını formatla
  private formatPhoneNumber(phone: string): string {
    // Boşlukları ve özel karakterleri temizle
    let cleaned = phone.replace(/[\s\-\(\)\.]/g, "");
    
    // +90 ile başlıyorsa + işaretini kaldır
    if (cleaned.startsWith("+")) {
      cleaned = cleaned.substring(1);
    }
    
    // 0 ile başlıyorsa 90 ekle
    if (cleaned.startsWith("0")) {
      cleaned = "90" + cleaned.substring(1);
    }
    
    // 5 ile başlıyorsa (sadece numara) 90 ekle
    if (cleaned.startsWith("5") && cleaned.length === 10) {
      cleaned = "90" + cleaned;
    }
    
    return cleaned;
  }

  // NetGSM API ile SMS gönder
  private async sendNetGsmSms(
    settings: { smsApiKey: string; smsApiSecret: string; smsSender: string },
    phone: string,
    message: string
  ): Promise<any> {
    const url = "https://api.netgsm.com.tr/sms/send/get";
    
    const params = new URLSearchParams({
      usercode: settings.smsApiKey,
      password: settings.smsApiSecret,
      gsmno: phone,
      message: message,
      msgheader: settings.smsSender || "HUKUKBURO",
      filter: "0",
    });

    const response = await fetch(`${url}?${params.toString()}`);
    const result = await response.text();

    // NetGSM yanıt kodları
    // 00: Başarılı, 20: Mesaj metni boş, 30: Geçersiz kullanıcı, vb.
    const code = result.split(" ")[0];
    
    if (code !== "00" && !result.startsWith("00")) {
      const errorMessages: Record<string, string> = {
        "20": "Mesaj metni boş",
        "30": "Geçersiz kullanıcı adı veya şifre",
        "40": "Gönderen adı sistemde tanımlı değil",
        "50": "Abone hesabı aktif değil",
        "51": "Abone hesabı aktif değil",
        "70": "Hatalı sorgulama",
        "80": "Gönderim tarihi hatalı",
        "85": "Mükerrer gönderim",
      };
      throw new Error(errorMessages[code] || `NetGSM hatası: ${result}`);
    }

    return { provider: "NETGSM", response: result };
  }

  // İleti Merkezi API ile SMS gönder
  private async sendIletiMerkeziSms(
    settings: { smsApiKey: string; smsApiSecret: string; smsSender: string },
    phone: string,
    message: string
  ): Promise<any> {
    const url = "https://api.iletimerkezi.com/v1/send-sms/get";
    
    const params = new URLSearchParams({
      username: settings.smsApiKey,
      password: settings.smsApiSecret,
      text: message,
      receipents: phone,
      sender: settings.smsSender || "HUKUKBURO",
    });

    const response = await fetch(`${url}?${params.toString()}`);
    const result = await response.text();

    // Basit hata kontrolü
    if (result.includes("error") || result.includes("Error")) {
      throw new Error(`İleti Merkezi hatası: ${result}`);
    }

    return { provider: "ILETI_MERKEZI", response: result };
  }

  // SMS bağlantı testi
  async testSmsConnection(tenantId: string) {
    const smsSettings = await this.officeService.getFullSmsSettings(tenantId);

    if (!smsSettings.smsProvider || !smsSettings.smsApiKey) {
      throw new BadRequestException("SMS ayarları yapılandırılmamış");
    }

    // Basit doğrulama - gerçek test için kredi kontrolü yapılabilir
    return { 
      success: true, 
      message: `${smsSettings.smsProvider} bağlantısı yapılandırılmış`,
      provider: smsSettings.smsProvider,
    };
  }

  // Müvekkilin bildirim geçmişi
  async getClientNotifications(tenantId: string, clientId: string) {
    return this.prisma.clientNotification.findMany({
      where: { tenantId, clientId },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
  }

  // Dosya bazlı bildirimler
  async getCaseNotifications(tenantId: string, caseId: string) {
    return this.prisma.clientNotification.findMany({
      where: { tenantId, caseId },
      orderBy: { createdAt: "desc" },
      include: {
        client: {
          select: { id: true, displayName: true, firstName: true, lastName: true },
        },
      },
    });
  }

  // E-posta şablonlarını getir
  async getEmailTemplates(tenantId: string, category?: string) {
    return this.prisma.emailTemplate.findMany({
      where: {
        tenantId,
        isActive: true,
        ...(category ? { category } : {}),
      },
      orderBy: { name: "asc" },
    });
  }

  // E-posta şablonu oluştur
  async createEmailTemplate(
    tenantId: string,
    data: {
      name: string;
      code: string;
      category: string;
      subject: string;
      body: string;
      isDefault?: boolean;
    }
  ) {
    return this.prisma.emailTemplate.create({
      data: {
        tenantId,
        ...data,
      },
    });
  }

  // E-posta şablonu güncelle
  async updateEmailTemplate(
    tenantId: string,
    templateId: string,
    data: {
      name?: string;
      subject?: string;
      body?: string;
      isActive?: boolean;
      isDefault?: boolean;
    }
  ) {
    return this.prisma.emailTemplate.update({
      where: { id: templateId },
      data,
    });
  }

  // Varsayılan şablonları oluştur
  async createDefaultTemplates(tenantId: string) {
    const templates = [
      {
        code: "MASRAF_TALEBI",
        name: "Masraf Talebi",
        category: "MASRAF",
        subject: "{{caseNo}} Nolu Dosya - Masraf Talebi",
        body: `<p>Sayın {{clientName}},</p>
<p><strong>{{caseNo}}</strong> numaralı dosyanız için aşağıdaki masrafların karşılanması gerekmektedir:</p>
<p>{{expenseDetails}}</p>
<p><strong>Toplam Tutar: {{totalAmount}} TL</strong></p>
<p>Ödemenizi aşağıdaki hesaba yapabilirsiniz:</p>
<p>{{bankDetails}}</p>
<p>Saygılarımızla,<br>{{officeName}}</p>`,
        isDefault: true,
      },
      {
        code: "GENEL_BILGILENDIRME",
        name: "Genel Bilgilendirme",
        category: "BILGILENDIRME",
        subject: "{{caseNo}} Nolu Dosya Hakkında Bilgilendirme",
        body: `<p>Sayın {{clientName}},</p>
<p><strong>{{caseNo}}</strong> numaralı dosyanız hakkında sizi bilgilendirmek istiyoruz:</p>
<p>{{messageContent}}</p>
<p>Sorularınız için bizimle iletişime geçebilirsiniz.</p>
<p>Saygılarımızla,<br>{{officeName}}</p>`,
        isDefault: true,
      },
      {
        code: "DOSYA_DURUMU",
        name: "Dosya Durum Raporu",
        category: "RAPOR",
        subject: "{{caseNo}} Nolu Dosya - Durum Raporu",
        body: `<p>Sayın {{clientName}},</p>
<p><strong>{{caseNo}}</strong> numaralı dosyanızın güncel durumu aşağıdaki gibidir:</p>
<p><strong>Dosya Durumu:</strong> {{caseStatus}}</p>
<p><strong>Son İşlem:</strong> {{lastAction}}</p>
<p><strong>Toplam Alacak:</strong> {{totalAmount}} TL</p>
<p><strong>Tahsil Edilen:</strong> {{collectedAmount}} TL</p>
<p>Saygılarımızla,<br>{{officeName}}</p>`,
        isDefault: true,
      },
    ];

    for (const template of templates) {
      const existing = await this.prisma.emailTemplate.findUnique({
        where: { tenantId_code: { tenantId, code: template.code } },
      });

      if (!existing) {
        await this.prisma.emailTemplate.create({
          data: { tenantId, ...template },
        });
      }
    }

    return { message: "Varsayılan şablonlar oluşturuldu" };
  }

  // SMTP bağlantı testi
  async testSmtpConnection(tenantId: string) {
    const smtpSettings = await this.officeService.getFullSmtpSettings(tenantId);

    if (!smtpSettings.smtpHost || !smtpSettings.smtpUser) {
      throw new BadRequestException("SMTP ayarları yapılandırılmamış");
    }

    const transporter = nodemailer.createTransport({
      host: smtpSettings.smtpHost,
      port: smtpSettings.smtpPort || 587,
      secure: smtpSettings.smtpSecure || false,
      auth: {
        user: smtpSettings.smtpUser,
        pass: smtpSettings.smtpPass,
      },
    } as nodemailer.TransportOptions);

    try {
      await transporter.verify();
      return { success: true, message: "SMTP bağlantısı başarılı" };
    } catch (error: any) {
      throw new BadRequestException(`SMTP bağlantı hatası: ${error.message}`);
    }
  }

  // Toplu e-posta gönder
  async sendBulkEmail(
    tenantId: string,
    userId: string,
    data: {
      recipients: string[];
      subject: string;
      message: string;
      type: "clients" | "debtors";
    }
  ) {
    const { recipients, subject, message, type } = data;
    
    if (!recipients || recipients.length === 0) {
      throw new BadRequestException("En az bir alıcı seçilmelidir");
    }

    // SMTP ayarlarını al
    const smtpSettings = await this.officeService.getFullSmtpSettings(tenantId);
    if (!smtpSettings.smtpHost || !smtpSettings.smtpUser) {
      throw new BadRequestException("SMTP ayarları yapılandırılmamış");
    }

    // Alıcıları getir
    let recipientList: { id: string; email: string | null; name: string }[] = [];
    
    if (type === "clients") {
      const clients = await this.prisma.client.findMany({
        where: { id: { in: recipients }, tenantId },
        select: { id: true, email: true, displayName: true },
      });
      recipientList = clients.map(c => ({ id: c.id, email: c.email, name: c.displayName || "Müvekkil" }));
    } else {
      const debtors = await this.prisma.debtor.findMany({
        where: { id: { in: recipients }, tenantId },
        select: { id: true, email: true, name: true },
      });
      recipientList = debtors.map(d => ({ id: d.id, email: d.email, name: d.name }));
    }

    // E-posta adresi olanları filtrele
    const validRecipients = recipientList.filter(r => r.email);
    
    if (validRecipients.length === 0) {
      throw new BadRequestException("Seçilen alıcıların hiçbirinde e-posta adresi yok");
    }

    // Transporter oluştur
    const transporter = nodemailer.createTransport({
      host: smtpSettings.smtpHost,
      port: smtpSettings.smtpPort || 587,
      secure: smtpSettings.smtpSecure || false,
      auth: {
        user: smtpSettings.smtpUser,
        pass: smtpSettings.smtpPass,
      },
    } as nodemailer.TransportOptions);

    // Her alıcıya e-posta gönder
    const results = { sent: 0, failed: 0, errors: [] as string[] };
    
    for (const recipient of validRecipients) {
      try {
        await transporter.sendMail({
          from: smtpSettings.smtpFromEmail || smtpSettings.smtpUser,
          to: recipient.email!,
          subject: subject,
          html: `<p>Sayın ${recipient.name},</p>${message.replace(/\n/g, "<br>")}`,
        });

        // Bildirim kaydı oluştur
        if (type === "clients") {
          await this.prisma.clientNotification.create({
            data: {
              tenantId,
              clientId: recipient.id,
              type: "BULK_EMAIL",
              channel: "EMAIL",
              subject,
              body: message,
              status: "SENT",
              sentAt: new Date(),
              sentById: userId,
            },
          });
        }

        results.sent++;
      } catch (error: any) {
        results.failed++;
        results.errors.push(`${recipient.email}: ${error.message}`);
      }
    }

    return {
      success: true,
      message: `${results.sent} e-posta gönderildi, ${results.failed} başarısız`,
      details: results,
    };
  }
}
