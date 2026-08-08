import { ClientStatementLineType } from '@prisma/client';
import {
  buildStatementDeliveryMessage,
  buildStatementDeliveryTokens,
  CLIENT_STATEMENT_DELIVERY_CONTRACT_VERSION,
  type ClientStatementDeliveryContext,
} from '../client-statement-delivery.contract';
import { createClientStatementRender } from '../client-statement-render.contract';
import { lineLabelTr } from '../client-statement-pdf.document';
import { ClientStatementNotificationDeliveryAdapter } from '../client-statement-notification-delivery.adapter';

/**
 * CAD C3 — teslim portunun MEVCUT bildirim zincirine bağlanması (owner OPTION A).
 * Doğrudan provider çağrısı yoktur; dispatcher test double'dır, SMTP çağrılmaz.
 */

const TENANT = 'tenant-adapter';
const CLIENT = 'client-adapter';
const PDF = Buffer.from('%PDF-1.4 ekstre');

function makeRender() {
  return createClientStatementRender({
    scope: 'CLIENT_LEVEL',
    officeName: 'Deneme Hukuk Bürosu',
    clientName: 'Deneme Müvekkil',
    currency: 'TRY',
    periodStart: new Date('2026-01-31T21:00:00.000Z'),
    periodEnd: new Date('2026-02-28T20:59:59.999Z'),
    openingBalance: '100.00',
    closingBalance: '250.00',
    fileReference: null,
    lines: [
      {
        lineDate: new Date('2026-02-10T09:00:00.000Z'),
        label: lineLabelTr(ClientStatementLineType.CASE_COLLECTION_PAYABLE),
        note: null,
        debit: '0.00',
        credit: '150.00',
        runningBalance: '250.00',
        isInformational: false,
        fileReference: null,
      },
    ],
  });
}

function makeContext(render = makeRender()): ClientStatementDeliveryContext {
  return {
    tenantId: TENANT,
    clientId: CLIENT,
    caseId: null,
    statementId: 'stmt-1',
    dedupeKey: 'STATEMENT_MONTHLY:ClientStatement:stmt-1:2026-02',
    periodKey: '2026-02',
    actorId: 'SYSTEM_MONTHLY_STATEMENT',
    tokens: buildStatementDeliveryTokens(render),
  };
}

function makeAdapter(status: 'sent' | 'failed' | 'skipped' = 'sent') {
  const dispatcher: any = {
    dispatch: jest.fn().mockResolvedValue({
      status,
      dedupeKey: 'STATEMENT_MONTHLY:ClientStatement:stmt-1:2026-02',
      ...(status === 'failed' ? { error: 'smtp down' } : { notificationId: 'notif-1' }),
    }),
  };
  return { adapter: new ClientStatementNotificationDeliveryAdapter(dispatcher), dispatcher };
}

describe('CAD C3 — teslim token sözleşmesi', () => {
  it('[ADP-1] token seti yalnız render sözleşmesinden türer, iç ID taşımaz', () => {
    const tokens = buildStatementDeliveryTokens(makeRender());

    expect(tokens.clientName).toBe('Deneme Müvekkil');
    expect(tokens.periodEnd).toBe('2026-02-28');
    expect(tokens.closingBalance).toBe('250.00');
    expect(tokens.lineCount).toBe('1');
    // Dosya referansı X2 primitifinden gelir; yoksa fallback ÜRETİLMEZ.
    expect(tokens.caseFileNumber).toBe('');

    const serialized = JSON.stringify(tokens);
    for (const forbidden of ['stmt-1', TENANT, CLIENT]) {
      expect(serialized).not.toContain(forbidden);
    }
  });
});

describe('CAD C3 — bildirim zinciri adaptörü', () => {
  it('[ADP-2] ek, dispatcher girdisine byte-parity ile ve TEK ek olarak taşınır', async () => {
    const render = makeRender();
    const message = buildStatementDeliveryMessage({ render, recipientEmail: 'muvekkil@ornek.com', pdf: PDF });
    const { adapter, dispatcher } = makeAdapter();

    const result = await adapter.send(message, makeContext(render));

    expect(message.contractVersion).toBe(CLIENT_STATEMENT_DELIVERY_CONTRACT_VERSION);
    expect(dispatcher.dispatch).toHaveBeenCalledTimes(1);
    const [tenantId, actorId, input] = dispatcher.dispatch.mock.calls[0];
    expect(tenantId).toBe(TENANT);
    expect(actorId).toBe('SYSTEM_MONTHLY_STATEMENT');
    expect(input.attachments).toHaveLength(1);
    expect(input.attachments[0].contentType).toBe('application/pdf');
    expect(Buffer.compare(input.attachments[0].content, PDF)).toBe(0);
    expect(result).toEqual({ success: true, messageId: 'notif-1' });
  });

  it('[ADP-3] idempotency ve kayıt otoritesi zincire devredilir (dedupeKey + refType/refId)', async () => {
    const render = makeRender();
    const message = buildStatementDeliveryMessage({ render, recipientEmail: 'muvekkil@ornek.com', pdf: PDF });
    const { adapter, dispatcher } = makeAdapter();

    await adapter.send(message, makeContext(render));

    const input = dispatcher.dispatch.mock.calls[0][2];
    expect(input.dedupeKey).toBe('STATEMENT_MONTHLY:ClientStatement:stmt-1:2026-02');
    expect(input.refType).toBe('ClientStatement');
    expect(input.refId).toBe('stmt-1');
    expect(input.templateCode).toBe('STATEMENT_READY');
    // client-level ekstrede caseId gönderilmez.
    expect(input).not.toHaveProperty('caseId');
    // force KULLANILMAZ — "tekrar gönder" düğmesi değildir.
    expect(input.force).toBeUndefined();
  });

  it('[ADP-4] zincir zaten SENT diyorsa sonuç başarı sayılmaz (ikinci gönderim yok)', async () => {
    const render = makeRender();
    const message = buildStatementDeliveryMessage({ render, recipientEmail: 'muvekkil@ornek.com', pdf: PDF });
    const { adapter } = makeAdapter('skipped');

    const result = await adapter.send(message, makeContext(render));

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe('ALREADY_SENT');
  });

  it('[ADP-5] dispatch başarısızsa başarı raporlanmaz', async () => {
    const render = makeRender();
    const message = buildStatementDeliveryMessage({ render, recipientEmail: 'muvekkil@ornek.com', pdf: PDF });
    const { adapter } = makeAdapter('failed');

    const result = await adapter.send(message, makeContext(render));

    expect(result).toEqual({ success: false, errorCode: 'DISPATCH_FAILED' });
  });
});
