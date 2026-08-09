/**
 * C1-B05-B — QUEUED delivery-intent yaşam döngüsü (unit).
 * State ayrımı (owner): QUEUED=provider çağrılmadı/güvenle işlenebilir; PENDING=in-flight/belirsiz
 * → OTOMATİK resend YOK; SENT=tekrar yok; FAILED=yalnız explicit reclaim. Render fail-closed → FAILED
 * (yalnız token ADLARI). Drain yalnız QUEUED işler.
 */
import { NotificationDispatcherService } from '../notification-dispatcher.service';
import { ClientNotificationService } from '../client-notification.service';
import { UnresolvedTemplateTokenError } from '@/modules/message-template/message-template.service';

const TENANT = 'tenant-b05b';
const USER = 'user-b05b';

const QUEUED_ROW = {
  id: 'intent-1',
  status: 'QUEUED',
  dedupeKey: 'EXPENSE_ACTUAL_POSTED:BalanceLedger:bl-1:1',
  clientId: 'client-1',
  caseId: 'case-1',
  type: 'MASRAF_GERCEKLESEN',
  metadata: { intent: 'EMAIL_TEMPLATE', templateCode: 'EXPENSE_ACTUAL_POSTED', tokens: { clientName: 'X', amount: '250,00' } },
};

function makeDispatcher(row: any = QUEUED_ROW) {
  const prisma: any = {
    clientNotification: {
      findFirst: jest.fn().mockResolvedValue(row),
      findMany: jest.fn().mockResolvedValue([]),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  };
  const clientNotification: any = {
    claimQueuedNotificationSlot: jest.fn().mockResolvedValue({ kind: 'CLAIMED', notificationId: 'intent-1' }),
    sendEmail: jest.fn().mockResolvedValue({ success: true, notificationId: 'intent-1' }),
    claimNotificationSlot: jest.fn(),
    reclaimFailedNotificationSlot: jest.fn(),
  };
  const messageTemplate: any = {
    findByCode: jest.fn().mockResolvedValue({ id: 'tpl-ea', subject: '{{clientName}} masraf', body: 'Sayın {{clientName}}, {{amount}} TL' }),
    renderTemplate: jest.fn(() => ({ subject: 'X masraf', body: 'Sayın X, 250,00 TL' })),
  };
  const dispatcher = new NotificationDispatcherService(prisma, clientNotification, messageTemplate);
  return { dispatcher, prisma, clientNotification, messageTemplate };
}

describe('C1-B05-B dispatchQueuedIntent', () => {
  it('QUEUED → render → atomik claim → sendEmail(reuse) → sent; provider claim tx DIŞINDA', async () => {
    const h = makeDispatcher();
    const result = await h.dispatcher.dispatchQueuedIntent(TENANT, USER, 'intent-1');

    expect(h.clientNotification.claimQueuedNotificationSlot).toHaveBeenCalledWith(TENANT, 'intent-1', {
      subject: 'X masraf',
      body: 'Sayın X, 250,00 TL',
    });
    expect(h.clientNotification.sendEmail).toHaveBeenCalledWith(TENANT, USER, expect.objectContaining({
      clientId: 'client-1',
      caseId: 'case-1',
      type: 'MASRAF_GERCEKLESEN',
      dedupeKey: QUEUED_ROW.dedupeKey,
      reuseNotificationId: 'intent-1',
    }));
    expect(result.status).toBe('sent');
  });

  it.each(['PENDING', 'SENT', 'FAILED'])('%s satıra DOKUNMAZ → skipped (otomatik resend YOK)', async (status) => {
    const h = makeDispatcher({ ...QUEUED_ROW, status });
    const result = await h.dispatcher.dispatchQueuedIntent(TENANT, USER, 'intent-1');
    expect(result.status).toBe('skipped');
    expect(h.clientNotification.claimQueuedNotificationSlot).not.toHaveBeenCalled();
    expect(h.clientNotification.sendEmail).not.toHaveBeenCalled();
    expect(h.prisma.clientNotification.updateMany).not.toHaveBeenCalled(); // FAILED'a çevrilmez
  });

  it('render unresolved-token → intent FAILED (yalnız token ADLARI; değer/PII yok) + provider YOK', async () => {
    const h = makeDispatcher();
    h.messageTemplate.renderTemplate.mockImplementation(() => {
      throw new UnresolvedTemplateTokenError(['officeIban', 'dueDate']);
    });
    const result = await h.dispatcher.dispatchQueuedIntent(TENANT, USER, 'intent-1');
    expect(result.status).toBe('failed');
    expect(h.prisma.clientNotification.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: 'intent-1', status: 'QUEUED' }),
      data: expect.objectContaining({ status: 'FAILED', errorMessage: 'unresolved-tokens: officeIban,dueDate' }),
    }));
    expect(h.clientNotification.sendEmail).not.toHaveBeenCalled();
  });

  it('şablon yok → FAILED (fail-closed) + provider YOK', async () => {
    const h = makeDispatcher();
    h.messageTemplate.findByCode.mockRejectedValue(new Error('Şablon bulunamadı: EXPENSE_ACTUAL_POSTED'));
    const result = await h.dispatcher.dispatchQueuedIntent(TENANT, USER, 'intent-1');
    expect(result.status).toBe('failed');
    expect(h.clientNotification.sendEmail).not.toHaveBeenCalled();
  });

  it('metadata eksik (templateCode/tokens yok) → FAILED intent-metadata-missing', async () => {
    const h = makeDispatcher({ ...QUEUED_ROW, metadata: {} });
    const result = await h.dispatcher.dispatchQueuedIntent(TENANT, USER, 'intent-1');
    expect(result).toEqual(expect.objectContaining({ status: 'failed', error: 'intent-metadata-missing' }));
  });

  it('concurrent claim yarışı kaybedilirse → skipped, İKİNCİ gönderim YOK', async () => {
    const h = makeDispatcher();
    h.clientNotification.claimQueuedNotificationSlot.mockResolvedValue({ kind: 'NOT_QUEUED', notificationId: 'intent-1', status: 'PENDING' });
    const result = await h.dispatcher.dispatchQueuedIntent(TENANT, USER, 'intent-1');
    expect(result.status).toBe('skipped');
    expect(h.clientNotification.sendEmail).not.toHaveBeenCalled();
  });

  it('sendEmail hatası → failed döner ama THROW ETMEZ (finansal çağırana sızmaz)', async () => {
    const h = makeDispatcher();
    h.clientNotification.sendEmail.mockRejectedValue(new Error('E-posta gönderim sonucu belirsiz'));
    const result = await h.dispatcher.dispatchQueuedIntent(TENANT, USER, 'intent-1');
    expect(result.status).toBe('failed');
  });

  it('intent yok → failed intent-not-found (throw yok)', async () => {
    const h = makeDispatcher(null);
    const result = await h.dispatcher.dispatchQueuedIntent(TENANT, USER, 'missing');
    expect(result).toEqual(expect.objectContaining({ status: 'failed', error: 'intent-not-found' }));
  });
});

describe('C1-B05-B drainQueuedNotifications', () => {
  it('yalnız QUEUED satırları tarar; her biri dispatchQueuedIntent ile işlenir; özet döner', async () => {
    const h = makeDispatcher();
    h.prisma.clientNotification.findMany.mockResolvedValue([{ id: 'q1' }, { id: 'q2' }]);
    const spy = jest.spyOn(h.dispatcher, 'dispatchQueuedIntent')
      .mockResolvedValueOnce({ status: 'sent', dedupeKey: 'a' })
      .mockResolvedValueOnce({ status: 'failed', dedupeKey: 'b', error: 'x' });

    const summary = await h.dispatcher.drainQueuedNotifications(TENANT, USER, 10);

    expect(h.prisma.clientNotification.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { tenantId: TENANT, status: 'QUEUED' },
    }));
    expect(spy).toHaveBeenCalledTimes(2);
    expect(summary).toEqual({ processed: 2, sent: 1, failed: 1, skipped: 0 });
  });

  it('limit [1,50] aralığına sıkıştırılır', async () => {
    const h = makeDispatcher();
    await h.dispatcher.drainQueuedNotifications(TENANT, USER, 999);
    expect(h.prisma.clientNotification.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 50 }));
  });
});

describe('C1-B05-B ClientNotificationService intent primitifleri (unit)', () => {
  it('enqueueEmailIntentInTransaction: QUEUED satır + metadata(templateCode/tokens); render/provider YOK', async () => {
    const tx: any = {
      clientNotification: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'intent-new' }),
      },
    };
    const svc = new ClientNotificationService({} as any, {} as any);
    const result = await svc.enqueueEmailIntentInTransaction(tx, TENANT, USER, {
      clientId: 'client-1', caseId: 'case-1', type: 'MASRAF_GERCEKLESEN',
      dedupeKey: 'EXPENSE_ACTUAL_POSTED:BalanceLedger:bl-9:1',
      templateCode: 'EXPENSE_ACTUAL_POSTED', tokens: { clientName: 'X' },
    });
    expect(result).toEqual({ notificationId: 'intent-new', created: true });
    const data = tx.clientNotification.create.mock.calls[0][0].data;
    expect(data.status).toBe('QUEUED');
    expect(data.metadata).toEqual(expect.objectContaining({ templateCode: 'EXPENSE_ACTUAL_POSTED' }));
    expect(data.body).not.toContain('{{'); // placeholder nötr — render edilmemiş şablon sızmaz
  });

  it('enqueue: aynı dedupeKey mevcutsa YENİ satır AÇMAZ (idempotent replay)', async () => {
    const tx: any = {
      clientNotification: {
        findFirst: jest.fn().mockResolvedValue({ id: 'intent-old' }),
        create: jest.fn(),
      },
    };
    const svc = new ClientNotificationService({} as any, {} as any);
    const result = await svc.enqueueEmailIntentInTransaction(tx, TENANT, USER, {
      clientId: 'c', type: 'MASRAF_GERCEKLESEN', dedupeKey: 'dk', templateCode: 'T', tokens: {},
    });
    expect(result).toEqual({ notificationId: 'intent-old', created: false });
    expect(tx.clientNotification.create).not.toHaveBeenCalled();
  });

  it('claimQueuedNotificationSlot: yalnız QUEUED → PENDING; PENDING/SENT/FAILED → NOT_QUEUED (dokunulmaz)', async () => {
    const txInner: any = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      clientNotification: {
        findFirst: jest.fn().mockResolvedValue({ id: 'intent-1', status: 'SENT' }),
        update: jest.fn(),
      },
    };
    const prisma: any = {
      clientNotification: { findFirst: jest.fn().mockResolvedValue({ id: 'intent-1', dedupeKey: 'dk' }) },
      $transaction: jest.fn().mockImplementation(async (cb: any) => cb(txInner)),
    };
    const svc = new ClientNotificationService(prisma, {} as any);
    const result = await svc.claimQueuedNotificationSlot(TENANT, 'intent-1', { subject: 's', body: 'b' });
    expect(result).toEqual({ kind: 'NOT_QUEUED', notificationId: 'intent-1', status: 'SENT' });
    expect(txInner.clientNotification.update).not.toHaveBeenCalled();
  });
});
