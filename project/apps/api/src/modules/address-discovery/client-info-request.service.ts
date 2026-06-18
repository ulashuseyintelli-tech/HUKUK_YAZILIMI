import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { EmailProviderService } from '../notification/email-provider.service';
import { maskEmail } from '../../common/pii-mask.util';
import { CreateClientInfoRequestDto } from './dto/client-info-request.dto';
import {
  ClientInfoEmailData,
  generateClientInfoEmailSubject,
  generateClientInfoEmailText,
  generateClientInfoEmailHtml,
  generateReminderEmailSubject,
  generateReminderEmailText,
} from './templates/client-info-email.template';

@Injectable()
export class ClientInfoRequestService {
  private readonly logger = new Logger(ClientInfoRequestService.name);

  constructor(
    private prisma: PrismaService,
    private emailProvider: EmailProviderService,
  ) {}

  /// <remarks>
  /// Çağrıldığı yerler:
  /// - AddressDiscoveryController.createClientInfoRequest() → POST /address-discovery/client-info-request (Manuel müvekkil bilgi talebi)
  /// - ClientInfoRequestService.sendAutoRequestOnCaseCreate() → Takip oluşturma sonrası otomatik bilgi talebi
  /// </remarks>
  /**
   * Müvekkil bilgi talebi oluştur
   */
  async createRequest(tenantId: string, dto: CreateClientInfoRequestDto) {
    // Case ve Client'ı doğrula
    const caseData = await this.prisma.case.findFirst({
      where: { id: dto.caseId, tenantId },
      include: {
        client: { select: { id: true, displayName: true } },
        lawyers: {
          where: { isResponsible: true },
          include: { lawyer: { select: { name: true, surname: true } } },
          take: 1,
        },
        debtors: {
          include: { debtor: { select: { id: true, name: true, identityNo: true } } },
        },
      },
    });

    if (!caseData) {
      throw new NotFoundException('Dosya bulunamadı');
    }

    const client = await this.prisma.client.findFirst({
      where: { id: dto.clientId, tenantId },
      select: { id: true, displayName: true, email: true },
    });

    if (!client) {
      throw new NotFoundException('Müvekkil bulunamadı');
    }

    // Office bilgilerini al
    const office = await this.prisma.office.findFirst({
      where: { tenantId },
      select: { name: true, phone: true, email: true },
    });

    // Borçlu bilgisi (opsiyonel)
    let debtor = null;
    if (dto.debtorId) {
      debtor = caseData.debtors.find(d => d.debtor.id === dto.debtorId)?.debtor;
      if (!debtor) {
        throw new NotFoundException('Borçlu bu dosyaya bağlı değil');
      }
    } else if (caseData.debtors.length > 0) {
      debtor = caseData.debtors[0].debtor;
    }

    // E-posta şablonu verilerini hazırla
    const emailData: ClientInfoEmailData = {
      clientName: client.displayName || 'Müvekkil',
      debtorName: debtor?.name || 'Borçlu',
      debtorIdentityNo: debtor?.identityNo || undefined,
      caseNumber: caseData.fileNumber,
      lawyerName: caseData.lawyers[0]
        ? `Av. ${caseData.lawyers[0].lawyer.name} ${caseData.lawyers[0].lawyer.surname}`
        : 'Avukat',
      firmName: office?.name || 'Hukuk Bürosu',
      firmPhone: office?.phone || undefined,
      firmEmail: office?.email || undefined,
    };

    // E-posta içeriğini oluştur
    const emailSubject = dto.emailSubject || generateClientInfoEmailSubject(emailData);
    const emailBody = dto.emailBody || generateClientInfoEmailText(emailData);
    const emailTo = dto.emailTo || client.email;

    if (!emailTo) {
      throw new BadRequestException('Müvekkilin e-posta adresi bulunamadı');
    }

    // Veritabanına kaydet
    const request = await this.prisma.clientInfoRequest.create({
      data: {
        tenantId,
        caseId: dto.caseId,
        clientId: dto.clientId,
        debtorId: dto.debtorId,
        emailTo,
        emailSubject,
        emailBody,
        status: 'SENT',
        sentAt: new Date(),
      },
      include: {
        client: { select: { id: true, displayName: true } },
        debtor: { select: { id: true, name: true } },
      },
    });

    // E-postayı gönder
    const emailResult = await this.emailProvider.send({
      to: emailTo,
      subject: emailSubject,
      text: emailBody,
      html: generateClientInfoEmailHtml(emailData),
    });

    if (!emailResult.success) {
      this.logger.warn(`E-posta gönderilemedi: ${emailResult.errorMessage}`);
    } else {
      this.logger.log(`Müvekkil bilgi talebi gönderildi: ${maskEmail(emailTo)}`);
      
      // Müvekkil Bildirimleri'ne kayıt ekle
      try {
        const now = new Date();
        
        await this.prisma.clientNotification.create({
          data: {
            tenantId,
            clientId: dto.clientId,
            caseId: dto.caseId,
            channel: 'EMAIL',
            type: 'ADRES_TALEP',
            subject: emailSubject,
            body: `📬 Adres bilgisi talep e-postası gönderildi.\n\nBorçlu: ${debtor?.name || 'Belirtilmemiş'}\nAlıcı: ${emailTo}`,
            status: 'SENT',
            sentAt: now,
            sentById: 'system',
          },
        });
        
        // AddressAuditLog'a da kayıt ekle (UI'da görünmesi için)
        await this.prisma.addressAuditLog.create({
          data: {
            tenantId,
            caseId: dto.caseId,
            debtorId: dto.debtorId,
            action: 'CLIENT_NOTIFICATION_SENT',
            details: {
              emailTo,
              debtorName: debtor?.name,
              clientName: client.displayName,
            },
            showInNotes: true,
            noteText: `📬 Müvekkile adres bilgisi talebi gönderildi\nBorçlu: ${debtor?.name || 'Belirtilmemiş'}\nAlıcı: ${emailTo}`,
          },
        });
        
        this.logger.log(`Müvekkil bildirimi oluşturuldu: ${dto.clientId}`);
      } catch (notifError: any) {
        this.logger.error(`Müvekkil bildirimi oluşturulamadı: ${notifError.message}`);
      }
    }

    return {
      ...request,
      emailSent: emailResult.success,
      emailError: emailResult.errorMessage,
    };
  }

  /**
   * Dosya oluşturulduğunda otomatik bilgi talebi gönder
   */
  async sendAutoRequestOnCaseCreate(tenantId: string, caseId: string): Promise<void> {
    try {
      // Tenant ayarlarını kontrol et
      const tenant = await this.prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { settings: true },
      });

      const settings = tenant?.settings as any;
      if (settings?.autoClientInfoRequest === false) {
        this.logger.log('Otomatik müvekkil bilgi talebi devre dışı');
        return;
      }

      // Case bilgilerini al
      const caseData = await this.prisma.case.findUnique({
        where: { id: caseId },
        include: {
          caseClients: {
            include: {
              client: {
                include: {
                  contacts: {
                    where: { type: 'EMAIL', isPrimary: true },
                    take: 1,
                  },
                },
              },
            },
          },
          debtors: {
            include: { debtor: { select: { id: true, name: true } } },
          },
        },
      });

      if (!caseData) {
        this.logger.warn(`Case bulunamadı: ${caseId}`);
        return;
      }

      // Müvekkil veya borçlu yoksa çık
      if (caseData.caseClients.length === 0 || caseData.debtors.length === 0) {
        this.logger.log('Müvekkil veya borçlu yok, bilgi talebi gönderilmedi');
        return;
      }

      // Her müvekkil için bilgi talebi gönder
      for (const caseClient of caseData.caseClients) {
        const client = caseClient.client;
        const email = client.email || client.contacts?.[0]?.value;

        if (!email) {
          this.logger.warn(`Müvekkilin e-postası yok: ${client.displayName}`);
          continue;
        }

        // Her borçlu için ayrı talep gönder
        for (const caseDebtor of caseData.debtors) {
          try {
            await this.createRequest(tenantId, {
              caseId,
              clientId: client.id,
              debtorId: caseDebtor.debtor.id,
              emailTo: email,
            });
          } catch (error: any) {
            this.logger.error(`Bilgi talebi gönderilemedi: ${error.message}`);
          }
        }
      }
    } catch (error: any) {
      this.logger.error(`sendAutoRequestOnCaseCreate hatası: ${error.message}`);
    }
  }

  /**
   * Hatırlatma e-postası gönder
   */
  async sendReminder(tenantId: string, requestId: string) {
    const request = await this.prisma.clientInfoRequest.findFirst({
      where: { id: requestId, tenantId },
      include: {
        client: { select: { displayName: true } },
        debtor: { select: { name: true, identityNo: true } },
        case: {
          select: {
            fileNumber: true,
            lawyers: {
              where: { isResponsible: true },
              include: { lawyer: { select: { name: true, surname: true } } },
              take: 1,
            },
          },
        },
      },
    });

    if (!request) {
      throw new NotFoundException('Bilgi talebi bulunamadı');
    }

    if (request.status !== 'SENT') {
      throw new BadRequestException('Sadece gönderilmiş taleplere hatırlatma yapılabilir');
    }

    // Office bilgilerini al
    const office = await this.prisma.office.findFirst({
      where: { tenantId },
      select: { name: true },
    });

    const emailData: ClientInfoEmailData = {
      clientName: request.client?.displayName || 'Müvekkil',
      debtorName: request.debtor?.name || 'Borçlu',
      debtorIdentityNo: request.debtor?.identityNo || undefined,
      caseNumber: request.case.fileNumber,
      lawyerName: request.case.lawyers[0]
        ? `Av. ${request.case.lawyers[0].lawyer.name} ${request.case.lawyers[0].lawyer.surname}`
        : 'Avukat',
      firmName: office?.name || 'Hukuk Bürosu',
    };

    const newReminderCount = request.reminderCount + 1;

    // E-postayı gönder
    const emailResult = await this.emailProvider.send({
      to: request.emailTo,
      subject: generateReminderEmailSubject(emailData, newReminderCount),
      text: generateReminderEmailText(emailData),
    });

    // Güncelle
    const updated = await this.prisma.clientInfoRequest.update({
      where: { id: requestId },
      data: {
        reminderSentAt: new Date(),
        reminderCount: newReminderCount,
      },
    });

    return {
      ...updated,
      emailSent: emailResult.success,
      emailError: emailResult.errorMessage,
    };
  }

  /**
   * Yanıt alındı olarak işaretle
   */
  async markAsResponded(tenantId: string, requestId: string, notes?: string) {
    const request = await this.prisma.clientInfoRequest.findFirst({
      where: { id: requestId, tenantId },
    });

    if (!request) {
      throw new NotFoundException('Bilgi talebi bulunamadı');
    }

    return this.prisma.clientInfoRequest.update({
      where: { id: requestId },
      data: {
        status: 'RESPONDED',
        respondedAt: new Date(),
        responseNotes: notes,
      },
      include: {
        client: { select: { id: true, displayName: true } },
        debtor: { select: { id: true, name: true } },
      },
    });
  }

  /**
   * Yanıt yok olarak işaretle
   */
  async markAsNoResponse(tenantId: string, requestId: string) {
    const request = await this.prisma.clientInfoRequest.findFirst({
      where: { id: requestId, tenantId },
    });

    if (!request) {
      throw new NotFoundException('Bilgi talebi bulunamadı');
    }

    return this.prisma.clientInfoRequest.update({
      where: { id: requestId },
      data: {
        status: 'NO_RESPONSE',
      },
    });
  }

  /**
   * Dosya için talepleri getir
   */
  async getRequestsForCase(tenantId: string, caseId: string) {
    return this.prisma.clientInfoRequest.findMany({
      where: { tenantId, caseId },
      include: {
        client: { select: { id: true, displayName: true } },
        debtor: { select: { id: true, name: true } },
      },
      orderBy: { sentAt: 'desc' },
    });
  }

  /**
   * Tek bir talebi getir
   */
  async getRequest(tenantId: string, requestId: string) {
    const request = await this.prisma.clientInfoRequest.findFirst({
      where: { id: requestId, tenantId },
      include: {
        client: { select: { id: true, displayName: true } },
        debtor: { select: { id: true, name: true } },
        case: { select: { id: true, fileNumber: true } },
      },
    });

    if (!request) {
      throw new NotFoundException('Bilgi talebi bulunamadı');
    }

    return request;
  }
}
