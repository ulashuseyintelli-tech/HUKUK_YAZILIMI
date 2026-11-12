import { Injectable } from '@nestjs/common';
import { NotificationDispatcherService } from '@/modules/client-notification/notification-dispatcher.service';
import type {
  ClientStatementDeliveryContext,
  ClientStatementDeliveryMessage,
  ClientStatementDeliveryPort,
  ClientStatementDeliveryResult,
} from './client-statement-delivery.contract';

/**
 * CAD C3 — TAŞIMA PORTUNUN MEVCUT BİLDİRİM ZİNCİRİNE BAĞLANMASI.
 *
 * Owner ratifikasyonu (OPTION A): gönderim MEVCUT zincirden geçer
 * (`NotificationDispatcherService` → `ClientNotificationService`); doğrudan
 * provider çağrısı YASAKTIR. Böylece dedupeKey idempotency'si, ClientNotification
 * persistence'ı ve audit otoritesi tek yerde kalır.
 *
 * - Ek (PDF) yalnız TAŞINIR: dispatcher'ın `attachments` alanından geçer, kalıcı
 *   kayda içerik olarak yazılmaz.
 * - Gövde/başlık kalıcı şablon motorundan üretilir; bu adaptör kendi metnini
 *   dayatmaz — B03 mesajı ekin kimliğini (dosya adı) ve içeriğini sağlar.
 * - `dispatch()` ASLA throw etmez; sonucu tipli bir teslim sonucuna çeviririz.
 *   Typed skipped evidence distinguishes SENT, FAILED and uncertain PENDING.
 *   SENT evidence can reconcile the monthly ledger; PENDING never authorizes transport.
 */
export const CLIENT_STATEMENT_DELIVERY_TEMPLATE_CODE = 'STATEMENT_READY';
export const CLIENT_STATEMENT_DELIVERY_REF_TYPE = 'ClientStatement';

@Injectable()
export class ClientStatementNotificationDeliveryAdapter implements ClientStatementDeliveryPort {
  constructor(private readonly dispatcher: NotificationDispatcherService) {}

  async send(
    message: ClientStatementDeliveryMessage,
    context: ClientStatementDeliveryContext,
  ): Promise<ClientStatementDeliveryResult> {
    const result = await this.dispatcher.dispatch(context.tenantId, context.actorId, {
      clientId: context.clientId,
      ...(context.caseId ? { caseId: context.caseId } : {}),
      templateCode: CLIENT_STATEMENT_DELIVERY_TEMPLATE_CODE,
      type: CLIENT_STATEMENT_DELIVERY_TEMPLATE_CODE,
      tokens: context.tokens,
      dedupeKey: context.dedupeKey,
      ...(context.retryFailed ? { force: true } : {}),
      expectedRecipientEmail: message.to,
      refType: CLIENT_STATEMENT_DELIVERY_REF_TYPE,
      refId: context.statementId,
      attachments: message.attachments.map((attachment) => ({
        filename: attachment.filename,
        content: attachment.content,
        contentType: attachment.contentType,
      })),
    });

    if (result.status === 'sent') {
      return { success: true, messageId: result.notificationId };
    }
    if (result.status === 'skipped') {
      if (result.existingStatus === 'SENT') {
        return { success: true, messageId: result.notificationId, reconciled: true };
      }
      if (result.existingStatus === 'PENDING') {
        return { success: false, messageId: result.notificationId, errorCode: 'DELIVERY_UNCERTAIN' };
      }
      if (result.existingStatus === 'FAILED' || result.existingStatus === 'MISSING') {
        return { success: false, messageId: result.notificationId, errorCode: 'RETRY_NOT_CLAIMED' };
      }
      return { success: false, messageId: result.notificationId, errorCode: 'ALREADY_SENT' };
    }
    return { success: false, errorCode: 'DISPATCH_FAILED' };
  }
}
