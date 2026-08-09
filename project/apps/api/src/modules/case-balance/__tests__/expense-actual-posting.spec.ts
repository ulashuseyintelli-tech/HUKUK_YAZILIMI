/**
 * C1-B05-B — TYPED EXPENSE_ACTUAL posting komutu (unit).
 * Owner kabulleri: generic DEBIT/adjust/reversal ASLA typed sınıflandırma + intent üretmez;
 * yalnız postExpenseActual üretir; intent AYNI tx'te QUEUED doğar; dispatch commit SONRASI
 * best-effort'tur ve POSTED sonucu asla bozamaz; alıcı belirsizse gönderim YOK; POL-4 raw ID yok.
 */
import { Prisma } from '@prisma/client';
import { CaseBalanceService } from '../case-balance.service';

const D = (value: number | string) => new Prisma.Decimal(value);
const CREATED_AT = new Date('2026-08-09T10:00:00.000Z');

function buildHarness(options: {
  balance?: Prisma.Decimal;
  caseClients?: Array<{ clientId: string }>;
  caseClientId?: string | null;
  existingPosting?: { id: string } | null;
} = {}) {
  const balance = {
    id: 'case-balance-1',
    tenantId: 'tenant-1',
    caseId: 'case-1',
    balance: options.balance ?? D(1000),
    lowThreshold: D(500),
  };
  const tx = {
    $executeRaw: jest.fn().mockResolvedValue(1),
    balanceLedger: {
      findFirst: jest.fn().mockResolvedValue(options.existingPosting ?? null),
      create: jest.fn().mockResolvedValue({
        id: 'bl-actual-1',
        tenantId: 'tenant-1',
        caseBalanceId: balance.id,
        type: 'DEBIT',
        amount: D(-250),
        currency: 'TRY',
        source: 'expense_actual:pk-1',
        sourceId: 'pk-1',
        createdById: 'user-1',
        createdAt: CREATED_AT,
      }),
    },
    caseBalance: { update: jest.fn().mockResolvedValue({ balance: D(750), lowThreshold: D(500) }) },
  };
  const prisma = {
    case: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'case-1',
        clientId: options.caseClientId === undefined ? 'client-1' : options.caseClientId,
        fileNumber: '2026/77',
        executionFileNumber: '2026/900',
        caseClients: options.caseClients ?? [],
      }),
    },
    caseBalance: { findUnique: jest.fn().mockResolvedValue(balance), create: jest.fn() },
    client: { findFirst: jest.fn().mockResolvedValue({ displayName: 'Deneme Müvekkil', name: null }) },
    office: { findFirst: jest.fn().mockResolvedValue({ name: 'TELLİ HUKUK', phone: '0212 000 00 00' }) },
    $transaction: jest.fn().mockImplementation(async (cb: (txArg: any) => Promise<unknown>) => cb(tx)),
  };
  const journalWriter = {
    write: jest.fn().mockResolvedValue({ ok: true, output: { status: 'CREATED', journalEntryId: 'j1', idempotencyKey: 'k', sourceVersion: 'v', lineCount: 2 } }),
  };
  const clientNotification = {
    enqueueEmailIntentInTransaction: jest.fn().mockResolvedValue({ notificationId: 'intent-1', created: true }),
  };
  const dispatcher = {
    dispatchQueuedIntent: jest.fn().mockResolvedValue({ status: 'sent', notificationId: 'intent-1', dedupeKey: 'x' }),
  };
  const service = new CaseBalanceService(prisma as never, journalWriter as never, clientNotification as never, dispatcher as never);
  return { balance, tx, prisma, journalWriter, clientNotification, dispatcher, service };
}

const dto = { amount: 250, postingKey: 'pk-1', description: 'Bilirkişi ücreti' };

describe('C1-B05-B postExpenseActual — typed posting + QUEUED intent', () => {
  it('happy path: ledger TYPED (entryKind+postingKey+source prefix) + intent AYNI tx + dispatch commit SONRASI', async () => {
    const { tx, clientNotification, dispatcher, journalWriter, service } = buildHarness();

    const result = await service.postExpenseActual('tenant-1', 'case-1', dto, 'user-1');

    // Typed sınıflandırma yazım anında (owner outcome-1)
    expect(tx.balanceLedger.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        type: 'DEBIT',
        entryKind: 'EXPENSE_ACTUAL',
        postingKey: 'pk-1',
        source: 'expense_actual:pk-1',
        amount: -250,
      }),
    }));
    // Journal aynı tx'te (mevcut DEBIT yolu)
    expect(journalWriter.write).toHaveBeenCalledTimes(1);
    // Intent AYNI tx nesnesiyle enqueue edildi (outcome-4) — tx parametresi birebir aynı obje
    expect(clientNotification.enqueueEmailIntentInTransaction).toHaveBeenCalledWith(
      tx, 'tenant-1', 'user-1',
      expect.objectContaining({
        clientId: 'client-1',
        caseId: 'case-1',
        type: 'MASRAF_GERCEKLESEN',
        templateCode: 'EXPENSE_ACTUAL_POSTED',
        dedupeKey: 'EXPENSE_ACTUAL_POSTED:BalanceLedger:bl-actual-1:1',
      }),
    );
    // Dispatch commit sonrası (outcome-5) — intent id ile
    expect(dispatcher.dispatchQueuedIntent).toHaveBeenCalledWith('tenant-1', 'user-1', 'intent-1');
    expect(result).toEqual(expect.objectContaining({
      success: true,
      alreadyPosted: false,
      ledgerId: 'bl-actual-1',
      notification: expect.objectContaining({ outcome: 'QUEUED_AND_DISPATCHED', dispatchStatus: 'sent' }),
    }));
  });

  it('POL-4: token seti yalnız insan-okur alanlar — raw iç ID (case/client/ledger id) İÇERMEZ, tutar tr-TR', async () => {
    const { clientNotification, service } = buildHarness();
    await service.postExpenseActual('tenant-1', 'case-1', dto, 'user-1');
    const tokens = clientNotification.enqueueEmailIntentInTransaction.mock.calls[0][3].tokens as Record<string, string>;
    const values = Object.values(tokens).join(' ');
    expect(values).not.toContain('case-1');
    expect(values).not.toContain('client-1');
    expect(values).not.toContain('bl-actual-1');
    expect(tokens.caseFileNumber).toBe('2026/77'); // insan-okur dosya referansı
    expect(tokens.amount).toBe('250,00'); // tr-TR
    expect(tokens.officeName).toBe('TELLİ HUKUK');
  });

  it('alıcı belirsiz (2 farklı CaseClient) → intent YOK, posting yine POSTED (broadcast yasak)', async () => {
    const { tx, clientNotification, dispatcher, service } = buildHarness({
      caseClients: [{ clientId: 'client-A' }, { clientId: 'client-B' }],
      caseClientId: null,
    });
    const result = await service.postExpenseActual('tenant-1', 'case-1', dto, 'user-1');
    expect(tx.balanceLedger.create).toHaveBeenCalledTimes(1); // finansal kayıt POSTED
    expect(clientNotification.enqueueEmailIntentInTransaction).not.toHaveBeenCalled();
    expect(dispatcher.dispatchQueuedIntent).not.toHaveBeenCalled();
    expect(result.notification).toEqual({ outcome: 'RECIPIENT_SCOPE_AMBIGUOUS' });
  });

  it('CaseClient tekil ve Case.clientId AYNI müvekkil → tek aday, intent üretilir', async () => {
    const { clientNotification, service } = buildHarness({ caseClients: [{ clientId: 'client-1' }], caseClientId: 'client-1' });
    await service.postExpenseActual('tenant-1', 'case-1', dto, 'user-1');
    expect(clientNotification.enqueueEmailIntentInTransaction).toHaveBeenCalledTimes(1);
  });

  it('aynı postingKey replay → alreadyPosted; yeni ledger/intent/mail YOK', async () => {
    const { tx, clientNotification, dispatcher, service } = buildHarness({ existingPosting: { id: 'bl-existing' } });
    const result = await service.postExpenseActual('tenant-1', 'case-1', dto, 'user-1');
    expect(tx.balanceLedger.create).not.toHaveBeenCalled();
    expect(clientNotification.enqueueEmailIntentInTransaction).not.toHaveBeenCalled();
    expect(dispatcher.dispatchQueuedIntent).not.toHaveBeenCalled();
    expect(result).toEqual(expect.objectContaining({
      alreadyPosted: true,
      ledgerId: 'bl-existing',
      notification: { outcome: 'ALREADY_POSTED_NO_NEW_INTENT' },
    }));
  });

  it('dispatch fırlatsa bile POSTED sonuç sağlam döner (outcome-6; mail finansal kaydı bozamaz)', async () => {
    const { dispatcher, service } = buildHarness();
    dispatcher.dispatchQueuedIntent.mockRejectedValue(new Error('provider infra down'));
    const result = await service.postExpenseActual('tenant-1', 'case-1', dto, 'user-1');
    expect(result.success).toBe(true);
    expect(result.notification).toEqual({ outcome: 'QUEUED', notificationId: 'intent-1' });
  });

  it('geçersiz tutar / postingKey → reddedilir, tx AÇILMAZ', async () => {
    const { prisma, service } = buildHarness();
    await expect(service.postExpenseActual('tenant-1', 'case-1', { amount: 0, postingKey: 'pk' }, 'u')).rejects.toThrow('Geçersiz tutar');
    await expect(service.postExpenseActual('tenant-1', 'case-1', { amount: -5, postingKey: 'pk' }, 'u')).rejects.toThrow('Geçersiz tutar');
    await expect(service.postExpenseActual('tenant-1', 'case-1', { amount: 10, postingKey: 'kötü anahtar!' }, 'u')).rejects.toThrow('Geçersiz postingKey');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('yetersiz bakiye → debit() ile birebir aynı red (politika icat edilmez)', async () => {
    const { service } = buildHarness({ balance: D(100) });
    await expect(service.postExpenseActual('tenant-1', 'case-1', dto, 'u')).rejects.toThrow('Yetersiz bakiye');
  });

  it('notification bağımlılıkları yoksa açık red (fail-closed) — sessiz intent kaybı YOK', async () => {
    const prisma: any = { case: { findFirst: jest.fn() } };
    const svc = new CaseBalanceService(prisma, { write: jest.fn() } as never);
    await expect(svc.postExpenseActual('t', 'c', dto, 'u')).rejects.toThrow('yapılandırılmamış');
  });
});

describe('C1-B05-B — generic yollar TYPED sınıflandırma/intent ÜRETMEZ (owner kabul: generic DEBIT → mail yok)', () => {
  it('generic debit(): entryKind/postingKey YOK, notification intenti YOK', async () => {
    const { tx, clientNotification, dispatcher, service } = buildHarness();
    tx.balanceLedger.create.mockResolvedValue({
      id: 'bl-generic', tenantId: 'tenant-1', caseBalanceId: 'case-balance-1', type: 'DEBIT',
      amount: D(-40), currency: 'TRY', source: 'operation:haciz', sourceId: 'op-1', createdById: 'u', createdAt: CREATED_AT,
    });
    await service.debit('tenant-1', 'case-1', { amount: 40, source: 'operation:haciz', sourceId: 'op-1' }, 'user-1');

    const data = tx.balanceLedger.create.mock.calls[0][0].data;
    expect(data.entryKind).toBeUndefined();
    expect(data.postingKey).toBeUndefined();
    expect(clientNotification.enqueueEmailIntentInTransaction).not.toHaveBeenCalled();
    expect(dispatcher.dispatchQueuedIntent).not.toHaveBeenCalled();
  });

  it('reversal (reverseExpensePaymentCreditInTransaction): DEBIT ama typed DEĞİL, intent YOK → ikinci gerçekleşen-masraf maili imkânsız', async () => {
    const { tx, clientNotification, service } = buildHarness();
    tx.balanceLedger.create.mockResolvedValue({
      id: 'bl-rev', tenantId: 'tenant-1', caseBalanceId: 'case-balance-1', type: 'DEBIT',
      amount: D(-60), currency: 'TRY', source: 'expense_payment:pay-1:reversal', sourceId: 'pay-1', createdById: 'u', createdAt: CREATED_AT,
    });
    await service.reverseExpensePaymentCreditInTransaction(
      tx as never, 'tenant-1', 'case-1',
      { expensePaymentId: 'pay-1', originalBalanceLedgerId: 'bl-orig', caseBalanceId: 'case-balance-1', amount: D(60) },
      'user-1',
    );
    const data = tx.balanceLedger.create.mock.calls[0][0].data;
    expect(data.entryKind).toBeUndefined();
    expect(data.postingKey).toBeUndefined();
    expect(clientNotification.enqueueEmailIntentInTransaction).not.toHaveBeenCalled();
  });

  it('adjust(): typed alan YOK, intent YOK', async () => {
    const { tx, clientNotification, service } = buildHarness();
    tx.balanceLedger.create.mockResolvedValue({ id: 'bl-adj', type: 'ADJUST', amount: D(10), createdAt: CREATED_AT });
    await service.adjust('tenant-1', 'case-1', 10, 'düzeltme', 'user-1');
    const data = tx.balanceLedger.create.mock.calls[0][0].data;
    expect(data.entryKind).toBeUndefined();
    expect(data.postingKey).toBeUndefined();
    expect(clientNotification.enqueueEmailIntentInTransaction).not.toHaveBeenCalled();
  });
});
