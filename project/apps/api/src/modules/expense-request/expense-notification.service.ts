import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@/prisma/prisma.service';
import { EmailProviderService, EmailOptions } from '@/modules/notification/email-provider.service';
import { maskEmail } from '@/common/pii-mask.util';

export interface EmailContent {
  subject: string;
  text: string;
  html: string;
}

export interface ExpenseEmailData {
  clientName: string;
  clientEmail: string;
  caseFileNumber: string;
  executionFileNumber?: string;
  executionOfficeName?: string;
  // Taraf bilgileri
  creditorName?: string; // Alacaklı (müvekkil)
  debtorNames?: string[]; // Borçlular
  items: Array<{ label: string; amount: number }>;
  totalAmount: number;
  dueDate?: Date;
  // Banka bilgileri
  accountHolder?: string;
  bankName?: string;
  branchName?: string;
  iban?: string;
  paymentDescription?: string;
  lawyerName?: string;
  officePhone?: string;
  officeEmail?: string;
}

@Injectable()
export class ExpenseNotificationService {
  private readonly logger = new Logger(ExpenseNotificationService.name);

  constructor(
    private prisma: PrismaService,
    private emailProvider: EmailProviderService,
    private configService: ConfigService,
  ) {}

  /**
   * Masraf talebi e-postası render et
   */
  renderExpenseEmail(data: ExpenseEmailData): EmailContent {
    const formattedTotal = data.totalAmount.toLocaleString('tr-TR', { minimumFractionDigits: 2 });
    const formattedDueDate = data.dueDate 
      ? new Date(data.dueDate).toLocaleDateString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric' })
      : null;

    // Subject
    const subject = `Masraf Talebi - ${data.caseFileNumber}${data.executionFileNumber ? ` (${data.executionFileNumber})` : ''}`;

    // Plain text
    let text = `Sayın ${data.clientName},\n\n`;
    text += `${data.caseFileNumber} numaralı dosyanız için aşağıdaki masrafların ödenmesi gerekmektedir:\n\n`;
    
    // Taraf bilgileri
    if (data.creditorName || (data.debtorNames && data.debtorNames.length > 0)) {
      text += `DOSYA BİLGİLERİ:\n`;
      text += `${'─'.repeat(40)}\n`;
      if (data.creditorName) {
        text += `Alacaklı: ${data.creditorName}\n`;
      }
      if (data.debtorNames && data.debtorNames.length > 0) {
        text += `Borçlu: ${data.debtorNames.join(', ')}\n`;
      }
      text += `${'─'.repeat(40)}\n\n`;
    }
    
    text += `MASRAF KALEMLERİ:\n`;
    text += `${'─'.repeat(40)}\n`;
    for (const item of data.items) {
      const amount = item.amount.toLocaleString('tr-TR', { minimumFractionDigits: 2 });
      text += `• ${item.label}: ${amount} TL\n`;
    }
    text += `${'─'.repeat(40)}\n`;
    text += `TOPLAM: ${formattedTotal} TL\n\n`;

    if (formattedDueDate) {
      text += `Son Ödeme Tarihi: ${formattedDueDate}\n\n`;
    }

    if (data.iban) {
      text += `ÖDEME BİLGİLERİ:\n`;
      if (data.accountHolder) text += `Hesap Sahibi: ${data.accountHolder}\n`;
      if (data.bankName) text += `Banka: ${data.bankName}\n`;
      if (data.branchName) text += `Şube: ${data.branchName}\n`;
      text += `IBAN: ${data.iban}\n`;
      if (data.paymentDescription) {
        text += `Açıklama: ${data.paymentDescription}\n`;
      }
      text += `\n`;
    }

    text += `Ödemenizi yaptıktan sonra dekontunuzu bu e-postaya yanıt olarak gönderebilirsiniz.\n\n`;
    text += `Saygılarımızla,\n`;
    if (data.lawyerName) text += `${data.lawyerName}\n`;
    if (data.officePhone) text += `Tel: ${data.officePhone}\n`;

    // HTML
    const html = this.renderExpenseEmailHtml(data, formattedTotal, formattedDueDate);

    return { subject, text, html };
  }

  /**
   * HTML e-posta şablonu
   */
  private renderExpenseEmailHtml(
    data: ExpenseEmailData, 
    formattedTotal: string, 
    formattedDueDate: string | null
  ): string {
    const itemsHtml = data.items.map(item => {
      const amount = item.amount.toLocaleString('tr-TR', { minimumFractionDigits: 2 });
      return `
        <tr>
          <td style="padding: 10px; border-bottom: 1px solid #e5e7eb;">${item.label}</td>
          <td style="padding: 10px; border-bottom: 1px solid #e5e7eb; text-align: right; font-weight: 500;">${amount} TL</td>
        </tr>
      `;
    }).join('');

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #1f2937; margin: 0; padding: 0; background: #f3f4f6; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .card { background: #fff; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); overflow: hidden; }
    .header { background: linear-gradient(135deg, #3b82f6, #1d4ed8); color: white; padding: 24px; }
    .header h1 { margin: 0; font-size: 20px; font-weight: 600; }
    .header p { margin: 8px 0 0 0; opacity: 0.9; font-size: 14px; }
    .content { padding: 24px; }
    .greeting { font-size: 16px; margin-bottom: 16px; }
    .table-container { margin: 20px 0; }
    table { width: 100%; border-collapse: collapse; }
    th { background: #f9fafb; padding: 12px; text-align: left; font-weight: 600; color: #374151; }
    .total-row { background: #eff6ff; }
    .total-row td { padding: 14px; font-weight: 700; font-size: 18px; color: #1d4ed8; }
    .info-box { background: #fef3c7; border-left: 4px solid #f59e0b; padding: 16px; margin: 20px 0; border-radius: 0 8px 8px 0; }
    .payment-box { background: #ecfdf5; border-left: 4px solid #10b981; padding: 16px; margin: 20px 0; border-radius: 0 8px 8px 0; }
    .payment-box code { background: #d1fae5; padding: 4px 8px; border-radius: 4px; font-family: monospace; }
    .footer { background: #f9fafb; padding: 20px 24px; font-size: 13px; color: #6b7280; border-top: 1px solid #e5e7eb; }
    .btn { display: inline-block; background: #3b82f6; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 500; }
  </style>
</head>
<body>
  <div class="container">
    <div class="card">
      <div class="header">
        <h1>💼 Masraf Talebi</h1>
        <p>Dosya No: ${data.caseFileNumber}${data.executionFileNumber ? ` | İcra No: ${data.executionFileNumber}` : ''}</p>
      </div>
      
      <div class="content">
        <p class="greeting">Sayın <strong>${data.clientName}</strong>,</p>
        
        <p>Dosyanız için aşağıdaki masrafların ödenmesi gerekmektedir:</p>
        
        ${(data.creditorName || (data.debtorNames && data.debtorNames.length > 0)) ? `
        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin: 16px 0;">
          <p style="margin: 0 0 8px 0; font-weight: 600; color: #475569;">📋 Dosya Bilgileri</p>
          ${data.creditorName ? `<p style="margin: 4px 0;"><strong>Alacaklı:</strong> ${data.creditorName}</p>` : ''}
          ${data.debtorNames && data.debtorNames.length > 0 ? `<p style="margin: 4px 0;"><strong>Borçlu:</strong> ${data.debtorNames.join(', ')}</p>` : ''}
        </div>
        ` : ''}
        
        <div class="table-container">
          <table>
            <thead>
              <tr>
                <th>Masraf Kalemi</th>
                <th style="text-align: right;">Tutar</th>
              </tr>
            </thead>
            <tbody>
              ${itemsHtml}
            </tbody>
            <tfoot>
              <tr class="total-row">
                <td>TOPLAM</td>
                <td style="text-align: right;">${formattedTotal} TL</td>
              </tr>
            </tfoot>
          </table>
        </div>
        
        ${formattedDueDate ? `
        <div class="info-box">
          <strong>⏰ Son Ödeme Tarihi:</strong> ${formattedDueDate}
        </div>
        ` : ''}
        
        ${data.iban ? `
        <div class="payment-box">
          <p style="margin: 0 0 12px 0;"><strong>💳 Ödeme Bilgileri</strong></p>
          ${data.accountHolder ? `<p style="margin: 0 0 6px 0;"><strong>Hesap Sahibi:</strong> ${data.accountHolder}</p>` : ''}
          ${data.bankName ? `<p style="margin: 0 0 6px 0;"><strong>Banka:</strong> ${data.bankName}</p>` : ''}
          ${data.branchName ? `<p style="margin: 0 0 6px 0;"><strong>Şube:</strong> ${data.branchName}</p>` : ''}
          <p style="margin: 0 0 6px 0;"><strong>IBAN:</strong> <code>${data.iban}</code></p>
          ${data.paymentDescription ? `<p style="margin: 8px 0 0 0;"><strong>Açıklama:</strong> ${data.paymentDescription}</p>` : ''}
        </div>
        ` : ''}
        
        <p style="margin-top: 20px;">Ödemenizi yaptıktan sonra dekontunuzu bu e-postaya yanıt olarak gönderebilirsiniz.</p>
      </div>
      
      <div class="footer">
        <p style="margin: 0;">
          ${data.lawyerName ? `<strong>${data.lawyerName}</strong><br>` : ''}
          ${data.officePhone ? `📞 ${data.officePhone}<br>` : ''}
          ${data.officeEmail ? `✉️ ${data.officeEmail}` : ''}
        </p>
      </div>
    </div>
  </div>
</body>
</html>`;
  }

  /**
   * Masraf talebi e-postası gönder
   */
  async sendExpenseRequest(tenantId: string, requestId: string, userId: string) {
    // Masraf talebini detaylı getir
    const request = await this.prisma.expenseRequest.findFirst({
      where: { id: requestId, tenantId },
      include: {
        requestItems: { orderBy: { sortOrder: 'asc' } },
        client: {
          select: {
            id: true,
            displayName: true,
            name: true,
            email: true,
            contacts: { where: { type: 'EMAIL', isPrimary: true }, take: 1 },
          },
        },
        case: {
          select: {
            sorumluPersonelId: true, // A5: varsayılan görev sahibi (Dosya Sorumlusu)
            fileNumber: true,
            executionFileNumber: true,
            executionOffice: { select: { name: true } },
            debtors: {
              select: {
                debtor: {
                  select: {
                    name: true,
                    firstName: true,
                    lastName: true,
                    companyName: true,
                  }
                }
              }
            }
          },
        },
      },
    });

    if (!request) {
      throw new NotFoundException('Masraf talebi bulunamadı');
    }

    // Client email bul
    const clientEmail = request.client.email || request.client.contacts?.[0]?.value;
    if (!clientEmail) {
      throw new NotFoundException('Müvekkil e-posta adresi bulunamadı');
    }

    // Office bilgilerini al (IBAN için bankAccounts'a bak)
    const office = await this.prisma.office.findFirst({
      where: { tenantId },
      select: { 
        name: true, 
        phone: true, 
        email: true,
        bankAccounts: {
          where: { isDefault: true },
          take: 1,
          select: { iban: true }
        }
      },
    });

    const defaultIban = office?.bankAccounts?.[0]?.iban;

    // .env'den banka bilgilerini al (öncelikli) veya DB'den
    const accountHolder = this.configService.get('BANK_ACCOUNT_HOLDER');
    const bankName = this.configService.get('BANK_NAME');
    const branchName = this.configService.get('BANK_BRANCH');
    const envIban = this.configService.get('BANK_IBAN');
    const finalIban = envIban || defaultIban;

    // Borçlu isimlerini hazırla
    const debtorNames = request.case.debtors?.map((cd: any) => {
      const d = cd.debtor;
      return d.name || d.companyName || `${d.firstName || ''} ${d.lastName || ''}`.trim() || 'Borçlu';
    }).filter(Boolean) || [];

    // Alacaklı (müvekkil) ismi
    const creditorName = request.client.displayName || request.client.name || undefined;

    // Email data hazırla
    const emailData: ExpenseEmailData = {
      clientName: request.client.displayName || request.client.name || 'Müvekkil',
      clientEmail,
      caseFileNumber: request.case.fileNumber,
      executionFileNumber: request.case.executionFileNumber || undefined,
      executionOfficeName: request.case.executionOffice?.name,
      creditorName,
      debtorNames: debtorNames.length > 0 ? debtorNames : undefined,
      items: request.requestItems.map(item => ({
        label: item.label,
        amount: item.finalAmount.toNumber(),
      })),
      totalAmount: request.totalAmount.toNumber(),
      dueDate: request.dueDate || undefined,
      accountHolder: accountHolder || undefined,
      bankName: bankName || undefined,
      branchName: branchName || undefined,
      iban: finalIban || undefined,
      paymentDescription: `${request.case.fileNumber} - Masraf`,
      lawyerName: office?.name,
      officePhone: office?.phone || undefined,
      officeEmail: office?.email || undefined,
    };

    // Email render et
    const emailContent = this.renderExpenseEmail(emailData);

    // Email gönder
    const emailOptions: EmailOptions = {
      to: clientEmail,
      subject: emailContent.subject,
      text: emailContent.text,
      html: emailContent.html,
    };

    const result = await this.emailProvider.send(emailOptions);

    if (result.success) {
      const formattedTotal = emailData.totalAmount.toLocaleString('tr-TR', { minimumFractionDigits: 2 });
      const now = new Date();
      const formattedDate = now.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

      // Masraf talebini güncelle + Task + Müvekkil Notu oluştur
      await this.prisma.$transaction(async (tx) => {
        // Masraf talebini güncelle
        await tx.expenseRequest.update({
          where: { id: requestId },
          data: {
            status: 'SENT',
            sentAt: now,
            sentVia: 'EMAIL',
            renderedSubject: emailContent.subject,
            renderedBody: emailContent.text,
          },
        });

        // Audit log
        await tx.expenseAuditLog.create({
          data: {
            expenseRequestId: requestId,
            action: 'EMAIL_SENT',
            details: {
              to: clientEmail,
              subject: emailContent.subject,
              messageId: result.messageId,
              provider: result.provider,
            },
            userId,
          },
        });

        // Yapılacaklar'a görev ekle - Masraf takibi için
        await tx.task.create({
          data: {
            tenantId,
            caseId: request.caseId,
            // G4a (A5 reversal): otomatik görev ATANMAMIŞ doğar (Dosya Sorumlusu DOER değil; assignee=doer sonradan manuel atanır).
            title: `Masraf Takibi - ${request.case.fileNumber}`,
            description: `${formattedTotal} TL masraf talebi müvekkile gönderildi. Ödeme takibi yapılmalı.\n\nGönderim: ${formattedDate}\nAlıcı: ${clientEmail}`,
            status: 'PENDING',
            priority: 'MEDIUM',
            createdById: userId === 'system' ? null : userId,
          },
        });

        // Müvekkil Bildirimleri'ne kayıt ekle
        if (request.clientId) {
          await tx.clientNotification.create({
            data: {
              tenantId,
              clientId: request.clientId,
              caseId: request.caseId,
              channel: 'EMAIL',
              type: 'MASRAF_ISTEK',
              subject: emailContent.subject,
              body: `📧 Masraf talebi e-postası gönderildi.\n\nTutar: ${formattedTotal} TL\nAlıcı: ${clientEmail}`,
              status: 'SENT',
              sentAt: now,
              sentById: userId === 'system' ? 'system' : userId,
            },
          });
        }
      });

      this.logger.log(`Expense email sent to ${maskEmail(clientEmail)} for request ${requestId}`);
    } else {
      this.logger.error(`Failed to send expense email: ${result.errorMessage}`);
      
      // Hata logla
      await this.prisma.expenseAuditLog.create({
        data: {
          expenseRequestId: requestId,
          action: 'EMAIL_FAILED',
          details: {
            to: clientEmail,
            errorCode: result.errorCode,
            errorMessage: result.errorMessage,
            provider: result.provider,
          },
          userId,
        },
      });
    }

    return result;
  }

  /**
   * Hatırlatma e-postası gönder
   */
  async sendReminder(tenantId: string, requestId: string, userId: string) {
    const request = await this.prisma.expenseRequest.findFirst({
      where: { id: requestId, tenantId },
      include: {
        requestItems: { orderBy: { sortOrder: 'asc' } },
        client: {
          select: {
            displayName: true,
            name: true,
            email: true,
            contacts: { where: { type: 'EMAIL', isPrimary: true }, take: 1 },
          },
        },
        case: { 
          select: { 
            fileNumber: true, 
            executionFileNumber: true,
            debtors: {
              select: {
                debtor: {
                  select: {
                    name: true,
                    firstName: true,
                    lastName: true,
                    companyName: true,
                  }
                }
              }
            }
          } 
        },
      },
    });

    if (!request) {
      throw new NotFoundException('Masraf talebi bulunamadı');
    }

    const clientEmail = request.client.email || request.client.contacts?.[0]?.value;
    if (!clientEmail) {
      throw new NotFoundException('Müvekkil e-posta adresi bulunamadı');
    }

    const formattedTotal = request.totalAmount.toNumber().toLocaleString('tr-TR', { minimumFractionDigits: 2 });
    const clientName = request.client.displayName || request.client.name || 'Müvekkil';

    // Hatırlatma e-postası
    const subject = `⏰ Hatırlatma: Masraf Talebi - ${request.case.fileNumber}`;
    const text = `Sayın ${clientName},\n\n${request.case.fileNumber} numaralı dosyanız için gönderdiğimiz ${formattedTotal} TL tutarındaki masraf talebinin henüz ödenmediğini hatırlatmak isteriz.\n\nÖdemenizi en kısa sürede yapmanızı rica ederiz.\n\nSaygılarımızla`;

    const result = await this.emailProvider.send({
      to: clientEmail,
      subject,
      text,
    });

    if (result.success) {
      await this.prisma.$transaction(async (tx) => {
        await tx.expenseRequest.update({
          where: { id: requestId },
          data: {
            status: 'REMINDED',
            reminderCount: { increment: 1 },
            lastReminderAt: new Date(),
          },
        });

        await tx.expenseAuditLog.create({
          data: {
            expenseRequestId: requestId,
            action: 'REMINDER_SENT',
            details: { to: clientEmail, messageId: result.messageId },
            userId,
          },
        });
      });

      this.logger.log(`Reminder sent to ${maskEmail(clientEmail)} for request ${requestId}`);
    }

    return result;
  }

  /**
   * Vadesi yaklaşan masraf taleplerini bul
   */
  async findDueReminders(tenantId: string, daysBeforeDue: number = 2) {
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + daysBeforeDue);

    return this.prisma.expenseRequest.findMany({
      where: {
        tenantId,
        status: { in: ['SENT', 'REMINDED'] },
        dueDate: { lte: targetDate },
      },
      include: {
        client: { select: { displayName: true, email: true } },
        case: { select: { fileNumber: true } },
      },
    });
  }

  /**
   * Vadesi geçmiş masraf talepleri için manuel görev oluştur
   */
  async createOverdueTask(tenantId: string, requestId: string, userId: string) {
    const request = await this.prisma.expenseRequest.findFirst({
      where: { id: requestId, tenantId },
      include: {
        case: { select: { id: true, fileNumber: true, sorumluPersonelId: true } },
        client: { select: { displayName: true } },
      },
    });

    if (!request) {
      throw new NotFoundException('Masraf talebi bulunamadı');
    }

    const formattedTotal = request.totalAmount.toNumber().toLocaleString('tr-TR', { minimumFractionDigits: 2 });

    // Task oluştur
    const task = await this.prisma.task.create({
      data: {
        tenantId,
        caseId: request.caseId,
        // G4a (A5 reversal): otomatik görev ATANMAMIŞ doğar (Dosya Sorumlusu DOER değil; assignee=doer sonradan manuel atanır).
        title: `Masraf takibi - ${request.client?.displayName || 'Müvekkil'}`,
        description: `${request.case.fileNumber} dosyası için ${formattedTotal} TL masraf talebi vadesi geçti. Müvekkil ile iletişime geçilmeli.`,
        status: 'PENDING',
        priority: 'HIGH',
        createdById: userId,
      },
    });

    // Masraf talebini güncelle
    await this.prisma.expenseRequest.update({
      where: { id: requestId },
      data: {
        status: 'OVERDUE',
        taskId: task.id,
      },
    });

    this.logger.log(`Overdue task created for expense request ${requestId}: ${task.id}`);
    return task;
  }
}
