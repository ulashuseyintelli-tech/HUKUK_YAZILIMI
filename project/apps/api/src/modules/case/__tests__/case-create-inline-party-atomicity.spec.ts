/**
 * DAR ATOMİKLİK — `POST /cases` satır içi taraf yazmaları dosya transaction'ına KATILIR.
 *
 * ÖLÇÜLEN AÇIK (inceleme paketi R01 §3): `resolveInlinePartiesBeforeTx` gerçekten transaction
 * ÖNCESİ çağrılıyordu ve her taraf servisi KENDİ `$transaction`'ını açıp BAĞIMSIZ commit ediyordu.
 * Sonraki adımdaki bir hata (yetki reddi, `fileNumber` P2002 TOCTOU, FK, domain event, tx timeout)
 * dosyayı geri alırken avukat + ofis + müvekkil + iletişim/adres + borçlu + audit satırlarını
 * KALICI bırakıyordu; reaktivasyon dalında pasif bir kayıt geri alınmaksızın AKTİF kalıyordu.
 *
 * BU SPEC'İN SABİTLEDİĞİ (owner GO 2026-09-12 "OFFICE DAR ATOMİKLİK YAMASI"):
 *  - taraf servisleri dosya transaction'ının client'ı ile çağrılır (ortak transaction),
 *  - iç içe transaction AÇILMAZ (Prisma interactive transaction'ı iç içe desteklemez),
 *  - transaction süre sınırları AÇIK verilir (varsayılan 5 sn'ye bırakılmaz),
 *  - hata hâlinde commit-sonrası (best-effort) işler HİÇ çalışmaz,
 *  - commit-sonrası işler yalnız transaction DÖNDÜKTEN sonra çalışır,
 *  - HTTP/e-posta/bildirim işleri transaction'ın İÇİNE taşınmaz.
 *
 * KAPSAM SINIRI: bu birim testleri "hangi client ile yazıldığını" kanıtlar. GERÇEK geri alma
 * kanıtı `case-create-inline-party-atomicity.db-gated.integration.spec.ts` içindedir.
 */

import { CaseService } from '../case.service';

const stub = {} as any;

/** Constructor sırası: prisma, audit, clientInfo, interestEngine, expenseRequest, domainEventIngest, collectionService, clientService, lawyerService, debtorService */
function build(prisma: any, parties: { clientService?: any; lawyerService?: any; debtorService?: any } = {}) {
  return new CaseService(
    prisma,
    stub,
    stub,
    stub,
    stub,
    stub,
    stub,
    parties.clientService ?? { create: jest.fn(async () => ({ id: 'client-new' })) },
    parties.lawyerService ?? {
      assertCreateAuthorized: jest.fn(async () => undefined),
      create: jest.fn(async () => ({ id: 'lawyer-new' })),
    },
    parties.debtorService ?? { create: jest.fn(async () => ({ id: 'debtor-new' })) },
  );
}

/** Dosya transaction'ı içinde ilk yazmada patlayan sahte tx client'ı. */
function buildTxClient(failOnCaseCreate: Error | null) {
  return {
    case: {
      create: jest.fn(async () => {
        if (failOnCaseCreate) throw failOnCaseCreate;
        return { id: 'case-1', fileNumber: '2024/1', type: 'ILAMSIZ' };
      }),
    },
  } as any;
}

const INLINE_LAWYER = { name: 'Ada', surname: 'Lovelace' };
const INLINE_CREDITOR = { type: 'INDIVIDUAL', name: 'Ahmet Yılmaz', identityNo: '11111111111' };

describe('DAR ATOMİKLİK — satır içi taraflar dosya transaction\'ına katılır', () => {
  it('taraf servisleri DOSYA transaction client\'ı ile çağrılır (ortak transaction)', async () => {
    const txClient = buildTxClient(new Error('CASE_CREATE_PATLADI'));
    const prisma = {
      case: { findFirst: jest.fn(async () => null) },
      $transaction: jest.fn(async (cb: any) => cb(txClient)),
    };
    const clientService = { create: jest.fn(async () => ({ id: 'client-new' })) };
    const lawyerService = {
      assertCreateAuthorized: jest.fn(async () => undefined),
      create: jest.fn(async () => ({ id: 'lawyer-new' })),
    };
    const debtorService = { create: jest.fn(async () => ({ id: 'debtor-new' })) };
    const svc = build(prisma, { clientService, lawyerService, debtorService });
    const dto: any = {
      fileNumber: '2024/1',
      lawyers: [{ ...INLINE_LAWYER }],
      creditors: [{ ...INLINE_CREDITOR }],
      debtors: [{ type: 'INDIVIDUAL', name: 'Veli Demir' }],
    };

    await expect(svc.create('tenant-1', dto, 'user-1')).rejects.toThrow('CASE_CREATE_PATLADI');

    // Üç taraf servisi de AYNI transaction bağlamını aldı ve bağlamın client'ı dosya tx'i.
    const lawyerCtx = lawyerService.create.mock.calls[0]![4] as any;
    const clientCtx = clientService.create.mock.calls[0]![3] as any;
    const debtorCtx = debtorService.create.mock.calls[0]![3] as any;
    expect(lawyerCtx?.tx).toBe(txClient);
    expect(clientCtx?.tx).toBe(txClient);
    expect(debtorCtx?.tx).toBe(txClient);
    // AK-2 ön kontrolü de aynı bağlamdan okur.
    expect(lawyerService.assertCreateAuthorized.mock.calls[0]![3]).toBe(lawyerCtx);
  });

  it('İÇ İÇE TRANSACTION YOK: prisma.$transaction dosya oluşturmada YALNIZ 1 kez açılır', async () => {
    const txClient = buildTxClient(new Error('DUR'));
    const prisma = {
      case: { findFirst: jest.fn(async () => null) },
      $transaction: jest.fn(async (cb: any) => cb(txClient)),
    };
    const svc = build(prisma);
    const dto: any = { fileNumber: '2024/2', lawyers: [{ ...INLINE_LAWYER }], creditors: [{ ...INLINE_CREDITOR }] };

    await expect(svc.create('tenant-1', dto, 'user-1')).rejects.toThrow('DUR');

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('transaction süre sınırları AÇIK verilir (Prisma varsayılanı 5 sn\'ye bırakılmaz)', async () => {
    const txClient = buildTxClient(new Error('DUR'));
    const prisma = {
      case: { findFirst: jest.fn(async () => null) },
      $transaction: jest.fn(async (cb: any) => cb(txClient)),
    };
    const svc = build(prisma);

    await expect(
      svc.create('tenant-1', { fileNumber: '2024/3', creditors: [{ ...INLINE_CREDITOR }] } as any, 'user-1'),
    ).rejects.toThrow('DUR');

    const options = prisma.$transaction.mock.calls[0]![1] as any;
    expect(options).toEqual({ maxWait: 15_000, timeout: 20_000 });
    // Süre sınırı bir DOĞRULUK çözümü değildir: atomikliği ortak transaction sağlar. Bu iddia
    // yalnız "varsayılan 5 sn sessizce miras alınmıyor" gerçeğini sabitler.
    expect(options.timeout).toBeGreaterThan(5_000);
  });

  it('HATA hâlinde commit-sonrası (best-effort) işler HİÇ çalışmaz', async () => {
    const afterCommitJob = jest.fn(async () => undefined);
    const txClient = buildTxClient(new Error('ROLLBACK'));
    const prisma = {
      case: { findFirst: jest.fn(async () => null) },
      $transaction: jest.fn(async (cb: any) => cb(txClient)),
    };
    // Müvekkil servisi commit-sonrası bir iş kuyruğa alır (gerçekte: görev senkronizasyonu).
    const clientService = {
      create: jest.fn(async (_t: any, _d: any, _a: any, ctx: any) => {
        ctx.afterCommit(afterCommitJob);
        return { id: 'client-new' };
      }),
    };
    const svc = build(prisma, { clientService });
    const dto: any = { fileNumber: '2024/4', creditors: [{ ...INLINE_CREDITOR }] };

    await expect(svc.create('tenant-1', dto, 'user-1')).rejects.toThrow('ROLLBACK');

    expect(clientService.create).toHaveBeenCalled();
    expect(afterCommitJob).not.toHaveBeenCalled();
  });

  it('BAŞARI YOLU: commit-sonrası işler transaction DÖNDÜKTEN SONRA, bildirim/e-posta ise tx DIŞINDA çalışır', async () => {
    const order: string[] = [];
    const txClient = {
      case: {
        create: jest.fn(async () => {
          order.push('tx:case.create');
          return { id: 'case-1', fileNumber: '2024/5', type: 'GENERAL_EXECUTION' };
        }),
        findUnique: jest.fn(async () => ({ id: 'case-1', fileNumber: '2024/5', type: 'GENERAL_EXECUTION', clientId: 'client-new' })),
      },
      caseClient: { create: jest.fn(async () => ({ id: 'cc-1' })) },
      lawyer: { findMany: jest.fn(async () => []) },
    } as any;
    const prisma = {
      case: { findFirst: jest.fn(async () => null) },
      $transaction: jest.fn(async (cb: any) => {
        const out = await cb(txClient);
        order.push('txDondu');
        return out;
      }),
    };
    const afterCommitJob = jest.fn(async () => {
      order.push('afterCommit');
    });
    const clientService = {
      create: jest.fn(async (_t: any, _d: any, _a: any, ctx: any) => {
        order.push('taraf:client.create');
        ctx.afterCommit(afterCommitJob);
        return { id: 'client-new' };
      }),
    };
    const auditService = {
      log: jest.fn(async () => {
        order.push('audit.log');
      }),
    };
    const clientInfoRequestService = {
      sendAutoRequestOnCaseCreate: jest.fn(async () => {
        order.push('bildirim');
      }),
    };
    const expenseRequestService = {
      createOpeningExpenseSet: jest.fn(async () => {
        order.push('masraf');
        return null;
      }),
    };
    const domainEventIngestService = { appendInTransaction: jest.fn(async () => undefined) };
    const svc = new CaseService(
      prisma as any,
      auditService as any,
      clientInfoRequestService as any,
      stub,
      expenseRequestService as any,
      domainEventIngestService as any,
      stub,
      clientService as any,
      { assertCreateAuthorized: jest.fn(), create: jest.fn() } as any,
      { create: jest.fn() } as any,
    );
    (svc as any).assignCaseStaff = jest.fn(async () => ({ selectionProvided: false, assigned: [] }));

    const created: any = await svc.create('tenant-1', { fileNumber: '2024/5', type: 'GENERAL_EXECUTION', creditors: [{ ...INLINE_CREDITOR }] } as any, 'user-1');

    expect(created.id).toBe('case-1');
    // Satır içi müvekkil dosya transaction'ının İÇİNDE yaratıldı (case.create'ten ÖNCE).
    expect(order.indexOf('taraf:client.create')).toBeLessThan(order.indexOf('tx:case.create'));
    // Commit-sonrası iş transaction DÖNDÜKTEN sonra çalıştı.
    expect(order.indexOf('txDondu')).toBeLessThan(order.indexOf('afterCommit'));
    // Audit ve bildirim/e-posta işleri transaction'ın İÇİNDE değil, dönüşünden SONRA.
    expect(order.indexOf('txDondu')).toBeLessThan(order.indexOf('audit.log'));
    expect(clientInfoRequestService.sendAutoRequestOnCaseCreate).toHaveBeenCalled();
    expect(order.indexOf('bildirim')).toBeGreaterThan(order.indexOf('txDondu'));
    // Transaction gövdesi bildirim/e-posta işini HİÇ çağırmadı.
    expect(order.slice(0, order.indexOf('txDondu'))).not.toContain('bildirim');
    expect(order.slice(0, order.indexOf('txDondu'))).not.toContain('masraf');
  });

  it('AK-1a/AK-2: ön kontrol reddi transaction\'ın İLK adımında olur → hiçbir taraf yazılmaz', async () => {
    const txClient = buildTxClient(null);
    const prisma = {
      case: { findFirst: jest.fn(async () => null) },
      $transaction: jest.fn(async (cb: any) => cb(txClient)),
    };
    const clientService = { create: jest.fn() };
    const lawyerService = {
      assertCreateAuthorized: jest.fn(async () => {
        throw new Error('OFFICE_WRITE_DENIED_VIEWER');
      }),
      create: jest.fn(),
    };
    const svc = build(prisma, { clientService, lawyerService });
    const dto: any = { fileNumber: '2024/6', lawyers: [{ ...INLINE_LAWYER }], creditors: [{ ...INLINE_CREDITOR }] };

    await expect(svc.create('tenant-1', dto, 'user-1')).rejects.toThrow('OFFICE_WRITE_DENIED_VIEWER');

    expect(lawyerService.create).not.toHaveBeenCalled();
    expect(clientService.create).not.toHaveBeenCalled();
    expect(txClient.case.create).not.toHaveBeenCalled();
  });

  it('borçlu/adres SAHİPLİK guard\'ı transaction AÇILMADAN reddeder (fail-fast korunur)', async () => {
    const prisma = {
      case: { findFirst: jest.fn(async () => null) },
      debtor: { findMany: jest.fn(async () => []) },
      debtorAddress: { findMany: jest.fn(async () => []) },
      $transaction: jest.fn(),
    };
    const clientService = { create: jest.fn() };
    const lawyerService = { assertCreateAuthorized: jest.fn(), create: jest.fn() };
    const svc = build(prisma, { clientService, lawyerService });
    const dto: any = { fileNumber: '2024/7', caseDebtors: [{ debtorId: 'yabanci-borclu' }] };

    await expect(svc.create('tenant-1', dto, 'user-1')).rejects.toThrow();

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(clientService.create).not.toHaveBeenCalled();
    expect(lawyerService.create).not.toHaveBeenCalled();
  });
});
