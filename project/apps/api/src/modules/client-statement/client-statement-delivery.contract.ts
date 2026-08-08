import type { ClientStatementStatus } from '@prisma/client';
import { assertStatementRenderable } from './client-statement-pdf.document';
import type { ClientStatementRenderV1 } from './client-statement-render.contract';

/**
 * CAD C3-B03 — EKSTRE TESLİM SÖZLEŞMESİ (içerikli mail + PDF eki).
 *
 * Bugünkü `STATEMENT_READY` yalnız "ekstreniz hazır" der (4 token, best-effort).
 * Bu sözleşme, gönderilecek İÇERİĞİ ve EK'i POL-4 sınırında sabitler:
 *
 * - Özet YALNIZ render sözleşmesinden türer → iç ID (statementId/caseId/refId/...) İÇERMEZ.
 * - Ek dosya adı da güvenlidir: iç ID taşımaz, yalnız dönem + kapsam bilgisi taşır.
 * - Gönderim ÖNCESİ fail-closed kapı: ekstre ACTIVE değilse VE alıcı doğrulanmamışsa
 *   hiçbir şey gönderilmez (assertStatementDeliverable).
 * - Taşıma (transport) bir PORT'tur; bu blokta gerçek SMTP çağrılmaz — test double ile
 *   doğrulanır. Kalıcı teslim durumu/outbox/idempotency C3-B05'in işidir.
 */

export const CLIENT_STATEMENT_DELIVERY_CONTRACT_VERSION = 'ClientStatementDeliveryV1' as const;

export class ClientStatementRecipientMissingError extends Error {
  constructor() {
    super('Müvekkilin doğrulanmış e-posta adresi yok; ekstre gönderilemez.');
    this.name = 'ClientStatementRecipientMissingError';
  }
}

export interface ClientStatementDeliveryAttachment {
  readonly filename: string;
  readonly content: Buffer;
  readonly contentType: 'application/pdf';
}

export interface ClientStatementDeliveryMessage {
  readonly contractVersion: typeof CLIENT_STATEMENT_DELIVERY_CONTRACT_VERSION;
  readonly to: string;
  readonly subject: string;
  readonly text: string;
  readonly html: string;
  readonly attachments: readonly [ClientStatementDeliveryAttachment];
}

/** Taşıma portu — üretimde EmailProviderService, testte double. */
export interface ClientStatementDeliveryPort {
  send(message: ClientStatementDeliveryMessage): Promise<{ success: boolean; messageId?: string; errorCode?: string }>;
}

const yyyymmdd = (d: Date): string =>
  `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;

const dateTr = (d: Date): string => {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getUTCDate())}.${p(d.getUTCMonth() + 1)}.${d.getUTCFullYear()}`;
};

/** Ek dosya adı: iç ID YOK; yalnız kapsam + dönem (deterministik). */
export function buildStatementAttachmentFilename(render: ClientStatementRenderV1): string {
  const scope = render.scope === 'CLIENT_LEVEL' ? 'genel' : 'dosya';
  return `ekstre-${scope}-${yyyymmdd(render.periodStart)}-${yyyymmdd(render.periodEnd)}.pdf`;
}

/**
 * Gönderim öncesi FAIL-CLOSED kapı: durum + alıcı. Sıra bilinçlidir — durum kapısı
 * önce çalışır ki geçersiz ekstre için alıcı sorgusu bile anlam taşımasın.
 */
export function assertStatementDeliverable(
  status: ClientStatementStatus,
  recipientEmail: string | null | undefined,
): asserts recipientEmail is string {
  assertStatementRenderable(status); // SUPERSEDED/VOID → ClientStatementNotRenderableError
  const trimmed = typeof recipientEmail === 'string' ? recipientEmail.trim() : '';
  if (trimmed.length === 0 || !trimmed.includes('@')) {
    throw new ClientStatementRecipientMissingError();
  }
}

/** Güvenli özet gövdesi — YALNIZ render sözleşmesinden türer (POL-4). */
export function buildStatementDeliveryMessage(input: {
  render: ClientStatementRenderV1;
  recipientEmail: string;
  pdf: Buffer;
}): ClientStatementDeliveryMessage {
  const { render, recipientEmail, pdf } = input;
  const periodLabel = `${dateTr(render.periodStart)} – ${dateTr(render.periodEnd)}`;
  const scopeLabel = render.scope === 'CLIENT_LEVEL' ? 'genel (tüm dosyalar)' : 'dosya bazlı';
  const refLine = render.fileReference ? `${render.fileReference.label}: ${render.fileReference.value}` : null;

  const summaryRows: string[] = [
    `Dönem: ${periodLabel}`,
    `Kapsam: ${scopeLabel}`,
    ...(refLine ? [refLine] : []),
    `Açılış bakiyesi: ${render.openingBalance} ${render.currency}`,
    `Kapanış bakiyesi: ${render.closingBalance} ${render.currency}`,
    `Hareket sayısı: ${render.lines.length}`,
  ];

  const text = [
    `Sayın ${render.clientName},`,
    '',
    `${periodLabel} dönemine ait ekstreniz ektedir.`,
    '',
    ...summaryRows,
    '',
    'Ayrıntılı hareket dökümü ekteki PDF dosyasındadır.',
    render.officeName,
  ].join('\n');

  const html = [
    `<p>Sayın ${render.clientName},</p>`,
    `<p>${periodLabel} dönemine ait ekstreniz ektedir.</p>`,
    `<ul>${summaryRows.map((r) => `<li>${r}</li>`).join('')}</ul>`,
    '<p>Ayrıntılı hareket dökümü ekteki PDF dosyasındadır.</p>',
    `<p>${render.officeName}</p>`,
  ].join('');

  return Object.freeze({
    contractVersion: CLIENT_STATEMENT_DELIVERY_CONTRACT_VERSION,
    to: recipientEmail,
    subject: `Müvekkil ekstresi — ${periodLabel}`,
    text,
    html,
    attachments: Object.freeze([
      Object.freeze({
        filename: buildStatementAttachmentFilename(render),
        content: pdf,
        contentType: 'application/pdf' as const,
      }),
    ]) as unknown as readonly [ClientStatementDeliveryAttachment],
  });
}
