import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { ClientNotificationService } from './client-notification.service';
import { MessageTemplateService, TemplateTokens } from '@/modules/message-template/message-template.service';

export interface DispatchInput {
  clientId: string;
  caseId?: string;
  templateCode: string; // MessageTemplate.code (EMAIL)
  type: string; // ClientNotification.type (ör. CLIENT_APPROVAL, STATEMENT_READY, PAYMENT_INFO)
  tokens: TemplateTokens; // çağıran doldurur (render motoru değişmez — m3a-4)
  persistedTokens?: TemplateTokens; // DBde saklanacak subject/body icin redacted token seti.
  dedupeKey?: string; // Cagiran typed command stable artifact dedupeKey'i verebilir.
  refType: string; // 'ClientApprovalRequest' | 'ClientStatement' | 'ExpenseRequest' ...
  refId: string;
  force?: boolean; // true → SENT idempotency kontrolünü atla (açık tekrar gönderim — m3a-2)
}

export type DispatchStatus = 'sent' | 'failed' | 'skipped';
export interface DispatchResult {
  status: DispatchStatus;
  notificationId?: string;
  dedupeKey: string;
  error?: string;
}

/**
 * Mail dispatch'inin ORTAK, BEST-EFFORT zemini (Faz 3 alt-faz 3.3).
 *
 * SÖZLEŞME (Faz 3 omurgası):
 * - Mail gönderimi/başarısızlığı finansal/onay/ekstre state'ini DEĞİŞTİRMEZ.
 * - dispatch() ASLA throw etmez — çağıran state-sahibi akış, mail başarısız olsa da bozulmaz.
 * - Idempotency: aynı dedupeKey için SENT bildirim varsa tekrar gönderilmez (force hariç).
 * - Yeni mail sistemi YOK: ClientNotificationService.sendEmail reuse edilir.
 */
@Injectable()
export class NotificationDispatcherService {
  private readonly logger = new Logger(NotificationDispatcherService.name);

  constructor(
    private prisma: PrismaService,
    private clientNotification: ClientNotificationService,
    private messageTemplate: MessageTemplateService,
  ) {}

  /**
   * dedupeKey üret: "{templateCode}:{refType}:{refId}:{bucket}". bucket sabit "1"
   * (talep/onay/ekstre/teyit tek mail). Hatırlatma gün/sayı bucket'ı sonraki faz.
   */
  buildDedupeKey(templateCode: string, refType: string, refId: string, bucket = '1'): string {
    return `${templateCode}:${refType}:${refId}:${bucket}`;
  }

  /**
   * Tek bir mail gönder (best-effort, idempotent). Throw ETMEZ.
   *
   * <remarks>
   * Çağrıldığı yerler:
   * - (3.4/3.5) ClientApproval/ClientStatement/Expense tetikleri → bu servisi çağıracak (henüz bağlanmadı)
   * - NotificationDispatchController.resend() → POST /client-notifications/resend
   * </remarks>
   */
  async dispatch(tenantId: string, userId: string, input: DispatchInput): Promise<DispatchResult> {
    const dedupeKey = input.dedupeKey ?? this.buildDedupeKey(input.templateCode, input.refType, input.refId);

    try {
      // 1) Idempotency: aynı dedupeKey için SENT var mı? (force değilse)
      if (!input.force) {
        const existing = await this.prisma.clientNotification.findFirst({
          where: { tenantId, dedupeKey, status: 'SENT' },
          select: { id: true },
        });
        if (existing) {
          return { status: 'skipped', notificationId: existing.id, dedupeKey };
        }
      }

      // 2) Şablonu bul + render et
      const template = await this.messageTemplate.findByCode(tenantId, input.templateCode);
      const { subject, body } = this.messageTemplate.renderTemplate(
        { subject: template.subject, body: template.body },
        input.tokens,
      );
      const persisted = input.persistedTokens
        ? this.messageTemplate.renderTemplate({ subject: template.subject, body: template.body }, input.persistedTokens)
        : undefined;

      // 3) Gönder (best-effort) — sendEmail başarısızsa ClientNotification FAILED yazar + throw eder
      const res = await this.clientNotification.sendEmail(tenantId, userId, {
        clientId: input.clientId,
        caseId: input.caseId,
        type: input.type,
        subject: subject || template.subject || '',
        body,
        persistedSubject: persisted?.subject,
        persistedBody: persisted?.body,
        templateId: template.id,
        dedupeKey,
      });

      return { status: 'sent', notificationId: res.notificationId, dedupeKey };
    } catch (error: any) {
      // BEST-EFFORT: hata yutulur, çağırana fırlatılmaz (state bozulmaz).
      this.logger.warn(`Mail dispatch başarısız (dedupeKey=${dedupeKey}): ${error.message}`);
      return { status: 'failed', dedupeKey, error: error.message };
    }
  }

  /**
   * Manuel resend: SENT yoksa (yalnız FAILED/yok) tekrar dener. SENT varsa force gerektirir.
   *
   * <remarks>
   * Çağrıldığı yerler:
   * - NotificationDispatchController.resend() → POST /client-notifications/resend
   * </remarks>
   */
  async resend(tenantId: string, userId: string, input: DispatchInput): Promise<DispatchResult> {
    // force=false ise dispatch zaten SENT'i skip eder; force=true açık tekrar gönderim.
    return this.dispatch(tenantId, userId, input);
  }
}
