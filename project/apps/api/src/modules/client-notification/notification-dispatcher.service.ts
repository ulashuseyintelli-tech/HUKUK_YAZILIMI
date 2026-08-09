import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { ClientNotificationService, type ClientNotificationAttachment } from './client-notification.service';
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
  /**
   * CAD C3: opsiyonel mail ekleri — TAŞIMA-ONLY. Verilmezse dispatch davranışı
   * birebir aynıdır (backward-compatible). Ek içeriği ne render motoruna, ne
   * ClientNotification kaydına, ne de loga girer; yalnız sendEmail'e devredilir.
   */
  attachments?: readonly ClientNotificationAttachment[];
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
      // 1) Şablonu bul + render et (fail-closed: çözülmemiş {{token}} → throw → aşağıda 'failed').
      //    Render CLAIM'den ÖNCE: kalıcı claim satırına güvenli subject/body yazılabilsin, hatalı
      //    şablon için orphan claim oluşmasın.
      const template = await this.messageTemplate.findByCode(tenantId, input.templateCode);
      const { subject, body } = this.messageTemplate.renderTemplate(
        { subject: template.subject, body: template.body },
        input.tokens,
      );
      const persisted = input.persistedTokens
        ? this.messageTemplate.renderTemplate({ subject: template.subject, body: template.body }, input.persistedTokens)
        : undefined;

      const sendDto = {
        clientId: input.clientId,
        caseId: input.caseId,
        type: input.type,
        subject: subject || template.subject || '',
        body,
        persistedSubject: persisted?.subject,
        persistedBody: persisted?.body,
        templateId: template.id,
        dedupeKey,
        ...(input.attachments?.length ? { attachments: input.attachments } : {}),
      };

      // 2) G4 atomik claim (force değilse). Inv-1: SENT/PENDING/FAILED üçü de EXISTING → normal
      //    dispatch retry ETMEZ (retry yalnız resend/force). Inv-5: claim sonucu public DispatchResult'a
      //    map edilir (status kümesi 'sent'|'failed'|'skipped' DEĞİŞMEZ).
      if (!input.force) {
        const claim = await this.clientNotification.claimNotificationSlot(tenantId, userId, sendDto);
        if (claim.kind !== 'ACQUIRED') {
          // EXISTING_PENDING | EXISTING_SENT | EXISTING_FAILED → skipped (ikinci normal send yok).
          return { status: 'skipped', notificationId: claim.notificationId, dedupeKey };
        }
        // 3) Yalnız claim sahibi provider'a ulaşır (Inv-2/3). reuseNotificationId ile claim tx DIŞINDA gönderilir.
        const res = await this.clientNotification.sendEmail(tenantId, userId, {
          ...sendDto,
          reuseNotificationId: claim.notificationId,
        });
        return { status: 'sent', notificationId: res.notificationId, dedupeKey };
      }

      // force = resend (owner düzeltme-2): claim BYPASS EDİLMEZ, kilitsiz force-send YASAK.
      // Aynı advisory lock altında YALNIZ FAILED→PENDING reclaim gönderebilir; PENDING/SENT/kayıt-yok → RED.
      const reclaim = await this.clientNotification.reclaimFailedNotificationSlot(tenantId, userId, sendDto);
      if (reclaim.kind !== 'RECLAIMED') {
        // EXISTING_PENDING | EXISTING_SENT | NO_RECORD → resend RED → skipped (yeni satır/gönderim yok).
        return {
          status: 'skipped',
          ...(reclaim.kind !== 'NO_RECORD' ? { notificationId: reclaim.notificationId } : {}),
          dedupeKey,
        };
      }
      const res = await this.clientNotification.sendEmail(tenantId, userId, {
        ...sendDto,
        reuseNotificationId: reclaim.notificationId,
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
