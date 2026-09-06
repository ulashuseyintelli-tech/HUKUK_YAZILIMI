import { ForbiddenException, Injectable, Logger, NotFoundException, ServiceUnavailableException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { EmailProviderService } from '../notification/email-provider.service';
import { AuditService } from '../audit/audit.service';
import { OfficeApprovalService } from '../office-approval/office-approval.service';
import {
  CLIENT_WORKSPACE_COMMAND,
  runAuthorizedClientWorkspaceCommand,
  type ClientWorkspaceCommandActor,
} from '../client/client-workspace-command-authority';
import { decideClientOperationalCommand } from '../client/client-mutation-policy';
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
    private audit: AuditService,
    private officeApproval: OfficeApprovalService,
  ) {}

  /**
   * D-3a: C2 frozen primitive bağımlılıkları — elevated sinyali OFFICE'ten (`isApproverEligible`),
   * audit ortak `AuditService.log`. OFFICE eligibility hesabı KOPYALANMAZ.
   */
  private workspaceCommandDeps() {
    return {
      isApproverEligible: (userId: string, tenantId: string) =>
        this.officeApproval.isApproverEligible(userId, tenantId),
      auditLog: (input: Parameters<AuditService['log']>[0]) => this.audit.log(input),
    };
  }

  /**
   * D-3a: durum işaretleri (respond / no-response) için D01 coarse kapısı — VIEWER DENY,
   * USER/ADMIN ALLOW. Gönderim komutlarının WORKSPACE eşiğinden AYRIDIR ve onu gevşetmez.
   */
  private assertCanMarkStatus(actor: ClientWorkspaceCommandActor, tenantId: string): void {
    const actorTenantId = String(actor?.tenantId ?? '').trim();
    if (!actorTenantId || actorTenantId !== tenantId) {
      throw new ForbiddenException({
        message: 'Aktör hedef tenant ile eşleşmiyor.',
        reasonCode: 'CLIENT_MUTATION_DENIED_TENANT_MISMATCH',
      });
    }
    const decision = decideClientOperationalCommand({ userId: actor?.userId, role: actor?.role });
    if (!decision.allowed) {
      throw new ForbiddenException({
        message: 'Bilgi talebi durumunu güncelleme yetkiniz yok.',
        reasonCode: decision.reasonCode,
      });
    }
  }

  /**
   * Müvekkil bilgi talebi oluştur ve GERÇEK e-posta gönder — D-3a (owner GO 2026-09-06):
   * yetki + audit SERVİS GİRİŞİNDE, gönderimden ÖNCE.
   *
   * Önceden yalnız `JwtAuthGuard` vardı: VIEWER dahil her kimlikli kullanıcı müvekkile e-posta
   * gönderebiliyordu ve AuditLog üretilmiyordu. Artık C2 frozen primitive (`INFO_REQUEST_SEND`,
   * §13/11 madde 6 eşiği: ADMIN VEYA canonical elevated; VIEWER/tanımsız rol fail-closed;
   * cross-tenant TENANT_MISMATCH) çalışır; yetkisiz aktörde sağlayıcı çağrısı ve DB mutasyonu
   * OLUŞMAZ. Aktör ve tenant YALNIZ sunucu tarafı JWT'den gelir.
   *
   * @remarks Çağrıldığı yerler:
   * - AddressDiscoveryController.createClientInfoRequest() → POST /address-discovery/client-info-request
   */
  async createRequest(tenantId: string, dto: CreateClientInfoRequestDto, actor: ClientWorkspaceCommandActor) {
    return runAuthorizedClientWorkspaceCommand(
      this.workspaceCommandDeps(),
      actor,
      { tenantId, clientId: dto.clientId, commandType: CLIENT_WORKSPACE_COMMAND.INFO_REQUEST_SEND },
      () => this.createRequestUnchecked(tenantId, dto, actor.userId ?? null),
      (r: any) => ({ requestId: r?.id ?? null, status: 'sent', caseId: dto.caseId }),
    );
  }

  /// <remarks>
  /// Çağrıldığı yerler:
  /// - ClientInfoRequestService.createRequest() → D-3a kapısından SONRA (manuel yol)
  /// - ClientInfoRequestService.sendAutoRequestOnCaseCreate() → Takip oluşturma sonrası otomatik
  ///   bilgi talebi (SİSTEM yolu; HTTP'den erişilemez, aktör taşımaz — istemci "SYSTEM" veya
  ///   "skip-authority" seçerek manuel kapıyı AŞAMAZ).
  /// </remarks>
  /**
   * Müvekkil bilgi talebi oluştur (yetki KARARI YOKTUR)
   */
  private async createRequestUnchecked(
    tenantId: string,
    dto: CreateClientInfoRequestDto,
    actorUserId: string | null,
  ) {
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
      // D-3a: sağlayıcı başarısızlığı BAŞARILI GÖNDERİM olarak KAYDEDİLMEZ. "SENT" satırı geri
      // alınır ve istek hata ile biter → primitive audit de üretmez (başarısız komut audit üretmez).
      this.logger.warn(`E-posta gönderilemedi: ${emailResult.errorMessage}`);
      await this.prisma.clientInfoRequest
        .delete({ where: { id: request.id } })
        .catch((e: any) => this.logger.error(`Başarısız talep kaydı geri alınamadı: ${e?.message}`));
      throw new ServiceUnavailableException({
        message: 'Bilgi talebi e-postası gönderilemedi; kayıt oluşturulmadı',
        reasonCode: 'CLIENT_INFO_REQUEST_EMAIL_FAILED',
      });
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
            // D-3a: ortak aktör — manuel yolda gerçek kullanıcı, otomatik yolda 'system'.
            sentById: actorUserId ?? 'system',
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
            // D-3a: mevcut AddressAuditLog kaydı KORUNUR; yalnız aktör alanı doldurulur.
            userId: actorUserId ?? undefined,
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
            // D-3a: SİSTEM yolu — manuel kapıdan geçmez, aktör taşımaz (audit 'system').
            await this.createRequestUnchecked(tenantId, {
              caseId,
              clientId: client.id,
              debtorId: caseDebtor.debtor.id,
              emailTo: email,
            }, null);
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
   * Hatırlatma e-postası gönder — D-3a: yetki + audit SERVİS GİRİŞİNDE (`INFO_REQUEST_REMINDER_SEND`,
   * gönderimle AYNI eşik). Yetkisiz aktörde sağlayıcı çağrısı ve sayaç güncellemesi OLUŞMAZ.
   *
   * @remarks Çağrıldığı yerler:
   * - AddressDiscoveryController.sendClientInfoRequestReminder() → POST /address-discovery/client-info-request/:id/reminder
   */
  async sendReminder(tenantId: string, requestId: string, actor: ClientWorkspaceCommandActor) {
    // Tenant-scoped okuma (yan etki YOK): audit entityId için clientId; yok/cross-tenant → NotFound.
    const owner = await this.prisma.clientInfoRequest.findFirst({
      where: { id: requestId, tenantId },
      select: { clientId: true },
    });
    if (!owner) {
      throw new NotFoundException('Bilgi talebi bulunamadı');
    }
    return runAuthorizedClientWorkspaceCommand(
      this.workspaceCommandDeps(),
      actor,
      { tenantId, clientId: owner.clientId, commandType: CLIENT_WORKSPACE_COMMAND.INFO_REQUEST_REMINDER_SEND },
      () => this.sendReminderUnchecked(tenantId, requestId),
      (r: any) => ({ requestId, status: 'reminder_sent', reminderCount: r?.reminderCount ?? null }),
    );
  }

  /** Hatırlatma gövdesi — yetki KARARI YOKTUR; yalnız `sendReminder()` çağırır. */
  private async sendReminderUnchecked(tenantId: string, requestId: string) {
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

    // D-3a: sağlayıcı başarısızlığı gönderim SAYILMAZ — sayaç ve `reminderSentAt` YAZILMAZ.
    if (!emailResult.success) {
      this.logger.warn(`Hatırlatma e-postası gönderilemedi: ${emailResult.errorMessage}`);
      throw new ServiceUnavailableException({
        message: 'Hatırlatma e-postası gönderilemedi; hatırlatma kaydedilmedi',
        reasonCode: 'CLIENT_INFO_REQUEST_EMAIL_FAILED',
      });
    }

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
   * Yanıt alındı olarak işaretle — D-3a: VIEWER'a KAPALI, USER/ADMIN'e açık (D01 coarse);
   * dış gönderim olmadığı için elevated ŞARTI YOKTUR. Başarılı mutasyon ortak aktörlü audit üretir.
   *
   * @remarks Çağrıldığı yerler:
   * - AddressDiscoveryController.markClientInfoRequestAsResponded() → PUT /address-discovery/client-info-request/:id/respond
   */
  async markAsResponded(tenantId: string, requestId: string, actor: ClientWorkspaceCommandActor, notes?: string) {
    this.assertCanMarkStatus(actor, tenantId);
    const request = await this.prisma.clientInfoRequest.findFirst({
      where: { id: requestId, tenantId },
    });

    if (!request) {
      throw new NotFoundException('Bilgi talebi bulunamadı');
    }

    const result = await this.prisma.clientInfoRequest.update({
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

    await this.logStatusAudit(tenantId, request.clientId, requestId, 'RESPONDED', actor);
    return result;
  }

  /**
   * Yanıt yok olarak işaretle — D-3a: VIEWER'a KAPALI, USER/ADMIN'e açık; başarılı mutasyon audit üretir.
   *
   * @remarks Çağrıldığı yerler:
   * - AddressDiscoveryController.markClientInfoRequestAsNoResponse() → PUT /address-discovery/client-info-request/:id/no-response
   */
  async markAsNoResponse(tenantId: string, requestId: string, actor: ClientWorkspaceCommandActor) {
    this.assertCanMarkStatus(actor, tenantId);
    const request = await this.prisma.clientInfoRequest.findFirst({
      where: { id: requestId, tenantId },
    });

    if (!request) {
      throw new NotFoundException('Bilgi talebi bulunamadı');
    }

    const result = await this.prisma.clientInfoRequest.update({
      where: { id: requestId },
      data: {
        status: 'NO_RESPONSE',
      },
    });

    await this.logStatusAudit(tenantId, request.clientId, requestId, 'NO_RESPONSE', actor);
    return result;
  }

  /**
   * D-3a: durum işaretlerinin ortak aktörlü audit'i. Yalnız BAŞARILI mutasyondan sonra çağrılır;
   * metadata yalnız talep kimliği ve yeni durumu taşır (e-posta içeriği/adresi YAZILMAZ).
   */
  private async logStatusAudit(
    tenantId: string,
    clientId: string,
    requestId: string,
    status: 'RESPONDED' | 'NO_RESPONSE',
    actor: ClientWorkspaceCommandActor,
  ): Promise<void> {
    await this.audit.log({
      tenantId,
      userId: String(actor?.userId ?? ''),
      action: 'CLIENT_INFO_REQUEST_STATUS',
      entityType: 'Client',
      entityId: clientId,
      metadata: { requestId, status, actorRole: actor?.role ?? null },
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
