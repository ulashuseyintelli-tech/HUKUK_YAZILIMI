/**
 * DAR ATOMİKLİK — taraf servislerinin ORTAK transaction sözleşmesi.
 *
 * Owner GO 2026-09-12: `POST /cases` satır içi avukat / ofis / audit / müvekkil / adres / borçlu
 * yazmaları dosya transaction'ına KATILIR; "Mevcut bağımsız servis çağrıları geriye uyumlu kalsın;
 * iç içe transaction açılmasın. İşlem içindeki ilgili okuma ve yazmalar aynı tx'i kullansın."
 *
 * Bu spec üç servisin de İKİ yolunu birlikte sabitler:
 *   (A) `txCtx` VERİLİNCE  → kendi `$transaction`'ını AÇMAZ, yazma/okumaları verilen client'tan yapar,
 *                            commit-sonrası "best-effort" işleri ERTELER;
 *   (B) `txCtx` VERİLMEYİNCE → davranış BİREBİR eskisi gibidir (kendi `$transaction`'ı, işler anında).
 *
 * Reaktivasyon dalları da (A)'ya tabidir: pasif bir kaydın yeniden etkinleştirilmesi dosya
 * oluşturma düşerse geri alınabilsin diye AYNI transaction'a yazılır.
 */

import { LawyerService } from '../../modules/lawyer/lawyer.service';
import { ClientService } from '../../modules/client/client.service';
import { DebtorService } from '../../modules/debtor/debtor.service';
import { createPartyWriteTxContext } from '../party-write-tx';

const TENANT = 'tenant-1';

/** Dış transaction client'ı — gerçek dosya transaction'ının yerine geçer. */
function buildOuterTx() {
  return {
    office: { findUnique: jest.fn(async () => ({ id: 'office-1' })), create: jest.fn() },
    tenant: { findUnique: jest.fn(async () => ({ name: 'Büro' })) },
    lawyer: {
      create: jest.fn(async () => ({ id: 'lawyer-1', name: 'Ada', surname: 'Lovelace', officeId: 'office-1' })),
      updateMany: jest.fn(async () => ({ count: 1 })),
      findMany: jest.fn(async () => []),
      aggregate: jest.fn(async () => ({ _max: { sortOrder: 0 } })),
      findFirst: jest.fn(async () => null),
    },
    client: {
      create: jest.fn(async () => ({ id: 'client-1', displayName: 'Ahmet Yılmaz' })),
      findFirst: jest.fn(async () => null),
      updateMany: jest.fn(async () => ({ count: 1 })),
    },
    clientContact: { createMany: jest.fn(async () => ({ count: 1 })) },
    clientAddress: { createMany: jest.fn(async () => ({ count: 1 })) },
    debtor: {
      create: jest.fn(async () => ({ id: 'debtor-1', name: 'Veli Demir' })),
      findFirst: jest.fn(async () => null),
      findMany: jest.fn(async () => []),
    },
    auditLog: { create: jest.fn(async () => ({ id: 'audit-1' })) },
  } as any;
}

const audit = () => ({ log: jest.fn(async () => undefined), logInTransaction: jest.fn(async () => undefined) });
const officeApproval = () => ({ isF01ActorAuthorized: jest.fn(async () => false), isApproverEligible: jest.fn(async () => true) });

describe('AVUKAT — LawyerService.create transaction sözleşmesi', () => {
  it('(A) txCtx verilince KENDİ $transaction\'ını açmaz; ofis + avukat + audit ortak tx\'e yazılır', async () => {
    const outerTx = buildOuterTx();
    const prisma = { $transaction: jest.fn(), lawyer: { findMany: jest.fn(), aggregate: jest.fn() } } as any;
    const auditSvc = audit();
    const svc = new LawyerService(prisma, auditSvc as any, officeApproval() as any);
    const { ctx } = createPartyWriteTxContext(outerTx);

    const created: any = await svc.create(TENANT, { name: 'Ada', surname: 'Lovelace' }, undefined, undefined, ctx);

    expect(prisma.$transaction).not.toHaveBeenCalled(); // İÇ İÇE TRANSACTION YOK
    expect(outerTx.lawyer.create).toHaveBeenCalled();
    expect(outerTx.office.findUnique).toHaveBeenCalled();
    expect(auditSvc.logInTransaction).toHaveBeenCalledWith(outerTx, expect.objectContaining({ action: 'LAWYER_CREATE' }));
    // Yazma yolundaki OKUMALAR da ortak tx'ten: mükerrer araması ve sortOrder toplaması.
    expect(outerTx.lawyer.findMany).toHaveBeenCalled();
    expect(outerTx.lawyer.aggregate).toHaveBeenCalled();
    expect(prisma.lawyer.findMany).not.toHaveBeenCalled();
    expect(prisma.lawyer.aggregate).not.toHaveBeenCalled();
    expect(created.id).toBe('lawyer-1');
  });

  it('(B) txCtx YOKKEN geriye uyumlu: servis KENDİ $transaction\'ını açar (POST /lawyers, seed)', async () => {
    const ownTx = buildOuterTx();
    const prisma = {
      $transaction: jest.fn(async (cb: any) => cb(ownTx)),
      lawyer: { findMany: jest.fn(async () => []), aggregate: jest.fn(async () => ({ _max: { sortOrder: 0 } })) },
    } as any;
    const svc = new LawyerService(prisma, audit() as any, officeApproval() as any);

    await svc.create(TENANT, { name: 'Ada', surname: 'Lovelace' });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.lawyer.findMany).toHaveBeenCalled(); // okumalar servisin kendi client'ından
  });

  it('(A) REAKTİVASYON dalı da ortak tx\'e yazılır (dosya düşerse geri alınabilsin)', async () => {
    const outerTx = buildOuterTx();
    outerTx.lawyer.findMany = jest.fn(async () => [
      { id: 'lawyer-pasif', name: 'Ada', surname: 'Lovelace', isActive: false, lawyerRank: null, canModifyOtherPermissions: false, permissionsLocked: false, canApproveOfficeActions: false },
    ]);
    const prisma = { $transaction: jest.fn(), lawyer: { findMany: jest.fn() } } as any;
    const auditSvc = audit();
    const svc = new LawyerService(prisma, auditSvc as any, officeApproval() as any);
    const { ctx } = createPartyWriteTxContext(outerTx);

    await svc.create(TENANT, { name: 'Ada', surname: 'Lovelace' }, undefined, undefined, ctx);

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(outerTx.lawyer.updateMany).toHaveBeenCalled();
    expect(auditSvc.logInTransaction).toHaveBeenCalledWith(outerTx, expect.objectContaining({ action: 'LAWYER_REACTIVATE' }));
  });
});

describe('MÜVEKKİL — ClientService.create transaction sözleşmesi', () => {
  const actor = { userId: 'u1', tenantId: TENANT, role: 'ADMIN' } as any;

  it('(A) txCtx verilince KENDİ $transaction\'ını açmaz; müvekkil + iletişim + audit ortak tx\'e yazılır', async () => {
    const outerTx = buildOuterTx();
    const prisma = { $transaction: jest.fn(), client: { findFirst: jest.fn() }, task: { findUnique: jest.fn() } } as any;
    const auditSvc = audit();
    const svc = new ClientService(prisma, auditSvc as any, officeApproval() as any);
    const { ctx } = createPartyWriteTxContext(outerTx);

    await svc.create(TENANT, { type: 'PERSON', firstName: 'Ahmet', lastName: 'Yılmaz', phones: [{ value: '5550001122' }] }, actor, ctx);

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(outerTx.client.create).toHaveBeenCalled();
    expect(outerTx.clientContact.createMany).toHaveBeenCalled();
    expect(auditSvc.logInTransaction).toHaveBeenCalledWith(outerTx, expect.objectContaining({ action: 'CLIENT_CREATE' }));
  });

  it('(A) commit-sonrası görev senkronizasyonu ERTELENİR (tx içinde çalışmaz)', async () => {
    const outerTx = buildOuterTx();
    const prisma = { $transaction: jest.fn(), client: { findFirst: jest.fn() }, task: { findUnique: jest.fn(async () => null), create: jest.fn() } } as any;
    const svc = new ClientService(prisma, audit() as any, officeApproval() as any);
    const { ctx, deferred } = createPartyWriteTxContext(outerTx);

    await svc.create(TENANT, { type: 'PERSON', firstName: 'Ahmet', lastName: 'Yılmaz' }, actor, ctx);

    // Görev senkronu HENÜZ çalışmadı — kuyruğa alındı.
    expect(prisma.task.findUnique).not.toHaveBeenCalled();
    expect(deferred).toHaveLength(1);

    await deferred[0]!(); // commit sonrası
    expect(prisma.task.findUnique).toHaveBeenCalled();
  });

  it('(B) txCtx YOKKEN geriye uyumlu: kendi $transaction\'ı + görev senkronu ANINDA', async () => {
    const ownTx = buildOuterTx();
    const prisma = {
      $transaction: jest.fn(async (cb: any) => cb(ownTx)),
      client: { findFirst: jest.fn(async () => null) },
      task: { findUnique: jest.fn(async () => null), create: jest.fn(async () => ({ id: 't1' })) },
    } as any;
    const svc = new ClientService(prisma, audit() as any, officeApproval() as any);

    await svc.create(TENANT, { type: 'PERSON', firstName: 'Ahmet', lastName: 'Yılmaz' }, actor);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.task.findUnique).toHaveBeenCalled(); // ertelenmedi
  });
});

describe('BORÇLU — DebtorService.create transaction sözleşmesi', () => {
  it('(A) txCtx verilince borçlu ortak tx\'e yazılır ve audit AYNI transaction\'a düşer', async () => {
    const outerTx = buildOuterTx();
    const prisma = { debtor: { create: jest.fn(), findFirst: jest.fn(), findMany: jest.fn() } } as any;
    const auditSvc = audit();
    const svc = new DebtorService(prisma, auditSvc as any, officeApproval() as any);
    const { ctx, deferred } = createPartyWriteTxContext(outerTx);

    await svc.create(TENANT, { type: 'INDIVIDUAL', firstName: 'Veli', lastName: 'Demir', forceCreate: true } as any, undefined, ctx);

    expect(outerTx.debtor.create).toHaveBeenCalled();
    expect(prisma.debtor.create).not.toHaveBeenCalled();
    // Audit standalone log() DEĞİL, ortak transaction'a yazılır → audit düşerse borçlu da geri alınır.
    expect(auditSvc.logInTransaction).toHaveBeenCalledWith(outerTx, expect.objectContaining({ action: 'DEBTOR_CREATE' }));
    expect(auditSvc.log).not.toHaveBeenCalled();
    // Görev senkronu ertelendi.
    expect(deferred).toHaveLength(1);
  });

  it('(B) txCtx YOKKEN geriye uyumlu: standalone audit log() + görev senkronu ANINDA', async () => {
    const prisma = {
      debtor: {
        create: jest.fn(async () => ({ id: 'debtor-1', name: 'Veli Demir' })),
        findFirst: jest.fn(async () => null),
        findMany: jest.fn(async () => []),
      },
    } as any;
    const auditSvc = audit();
    const svc = new DebtorService(prisma, auditSvc as any, officeApproval() as any);
    (svc as any).syncDebtorTaskByIdSafe = jest.fn(async () => undefined);

    await svc.create(TENANT, { type: 'INDIVIDUAL', firstName: 'Veli', lastName: 'Demir', forceCreate: true } as any);

    expect(prisma.debtor.create).toHaveBeenCalled();
    expect(auditSvc.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'DEBTOR_CREATE' }));
    expect(auditSvc.logInTransaction).not.toHaveBeenCalled();
    expect((svc as any).syncDebtorTaskByIdSafe).toHaveBeenCalled();
  });
});
