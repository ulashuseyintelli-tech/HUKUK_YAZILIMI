/**
 * B4/D — case.service.create() fileNumber ön-benzersizlik kontrolü.
 *
 * createCase, inline-yeni müvekkil/borçlu/avukat'ı tx ÖNCESİ guard'lı servislerle KALICI
 * resolve eder (RFA-016 "Tasarım A"). Mükerrer (tenantId+fileNumber) bir takip için Case tx
 * @@unique([tenantId, fileNumber]) ile P2002 fırlatır — fakat o ana dek taraflar çoktan
 * yaratılmış olur (orphan yan-etki). B4/D, resolveInlinePartiesBeforeTx'ten HEMEN ÖNCE
 * tenant-scoped bir findFirst ile mükerrerliği yakalar ve erken 409 döner.
 *
 * Bu testin ASIL DEĞERİ "409 döndü" değil; 409'dan ÖNCE hiçbir tarafın (clientService/
 * debtorService/lawyerService.create) yaratılmadığını — yani orphan oluşmadığını — kanıtlamaktır.
 * Tenant-scope: aynı fileNumber farklı tenant'ta false-positive üretmemeli.
 */

import { ConflictException } from '@nestjs/common';
import { CaseService } from '../case.service';

const stub = {} as any;

// Constructor sırası: prisma, audit, clientInfo, interestEngine, expenseRequest,
// domainEventIngest, collectionService, clientService, lawyerService, debtorService
function build(prisma: any, clientService: any, lawyerService: any, debtorService: any) {
  return new CaseService(
    prisma,
    stub,
    stub,
    stub,
    stub,
    stub,
    stub,
    clientService,
    lawyerService,
    debtorService,
  );
}

describe('B4/D — createCase fileNumber ön-benzersizlik kontrolü (orphan-önleyici)', () => {
  it('mükerrer tenantId+fileNumber → ConflictException döner', async () => {
    const prisma = { case: { findFirst: jest.fn(async () => ({ id: 'existing-case' })) } };
    const svc = build(prisma, { create: jest.fn() }, { create: jest.fn() }, { create: jest.fn() });
    const dto: any = {
      fileNumber: '2024/100',
      creditors: [{ type: 'INDIVIDUAL', name: 'Ahmet Yılmaz', identityNo: '11111111111' }],
    };

    await expect(svc.create('tenant-1', dto, 'user-1')).rejects.toBeInstanceOf(ConflictException);
  });

  it('ASIL KANIT: mükerrerde 409 ÖNCESİ hiçbir taraf yaratılmaz (orphan yok)', async () => {
    const prisma = { case: { findFirst: jest.fn(async () => ({ id: 'existing-case' })) } };
    const clientService = { create: jest.fn() };
    const lawyerService = { create: jest.fn() };
    const debtorService = { create: jest.fn() };
    const svc = build(prisma, clientService, lawyerService, debtorService);
    // inline-yeni (id YOK) müvekkil + borçlu + avukat — normalde resolveInlineParties bunları yaratırdı
    const dto: any = {
      fileNumber: '2024/100',
      creditors: [{ type: 'INDIVIDUAL', name: 'Ahmet Yılmaz', identityNo: '11111111111' }],
      debtors: [{ type: 'INDIVIDUAL', name: 'Veli Demir' }],
      lawyers: [{ name: 'Av. Mehmet', surname: 'Kaya', barNumber: '5555' }],
    };

    await expect(svc.create('tenant-1', dto, 'user-1')).rejects.toBeInstanceOf(ConflictException);

    // Ön-kontrol resolveInlinePartiesBeforeTx'ten ÖNCE durdurdu → taraf yaratımı HİÇ çağrılmadı
    expect(clientService.create).not.toHaveBeenCalled();
    expect(debtorService.create).not.toHaveBeenCalled();
    expect(lawyerService.create).not.toHaveBeenCalled();
  });

  it('ön-kontrol TENANT-SCOPED sorgular: where = { tenantId, fileNumber }', async () => {
    const prisma = { case: { findFirst: jest.fn(async () => ({ id: 'existing-case' })) } };
    const svc = build(prisma, { create: jest.fn() }, { create: jest.fn() }, { create: jest.fn() });
    const dto: any = { fileNumber: '2024/100', creditors: [{ id: 'c1', name: 'X' }] };

    await expect(svc.create('tenant-1', dto, 'user-1')).rejects.toBeInstanceOf(ConflictException);

    expect(prisma.case.findFirst).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-1', fileNumber: '2024/100' },
      select: { id: true },
    });
  });

  it('farklı tenant aynı fileNumber → false-positive YOK (ön-kontrol geçer, tx aşamasına ulaşır)', async () => {
    // Tenant-scoped mock: yalnız tenant-DUP + 2024/1 mükerrer sayılır
    const prisma = {
      case: {
        findFirst: jest.fn(async ({ where }: any) =>
          where.tenantId === 'tenant-DUP' && where.fileNumber === '2024/1' ? { id: 'dup' } : null,
        ),
      },
      // CASE-CREATE-FK-TENANT: create() tx ÖNCESİ creditor.id'yi tenant-doğrular (validateCaseFkOwnership);
      // ön-kontrolü geçen happy-path bu mock'a uğrar (id same-tenant → bulundu, guard geçer).
      client: { findFirst: jest.fn(async () => ({ id: 'existing-c' })) },
      // Pre-check geçilince buraya gelinir; sentinel ile "geçti"yi kanıtla (tx içini test etmiyoruz)
      $transaction: jest.fn(async () => {
        throw new Error('REACHED_TX');
      }),
    };
    const svc = build(prisma, { create: jest.fn() }, { create: jest.fn() }, { create: jest.fn() });
    // id-li taraf → resolveInlineParties no-op (tx aşamasına temiz ulaşılır)
    const dto: any = { fileNumber: '2024/1', creditors: [{ id: 'existing-c', name: 'Var Olan' }] };

    // tenant-1: bu fileNumber yok → ön-kontrol GEÇER → tx sentinel'ine ulaşır (409 DEĞİL)
    await expect(svc.create('tenant-1', dto, 'user-1')).rejects.toThrow('REACHED_TX');

    // tenant-DUP: aynı fileNumber mükerrer → 409
    await expect(svc.create('tenant-DUP', dto, 'user-1')).rejects.toBeInstanceOf(ConflictException);
  });

  it('fileNumber yoksa ön-kontrol sorgu yapmaz (normal akış devralır)', async () => {
    const prisma = {
      case: { findFirst: jest.fn() },
      // CASE-CREATE-FK-TENANT: fileNumber yok → ön-kontrol atlanır; guard yine creditor.id'yi doğrular.
      client: { findFirst: jest.fn(async () => ({ id: 'existing-c' })) },
      $transaction: jest.fn(async () => {
        throw new Error('REACHED_TX');
      }),
    };
    const svc = build(prisma, { create: jest.fn() }, { create: jest.fn() }, { create: jest.fn() });
    const dto: any = { creditors: [{ id: 'existing-c', name: 'Var Olan' }] }; // fileNumber YOK

    await expect(svc.create('tenant-1', dto, 'user-1')).rejects.toThrow('REACHED_TX');
    expect(prisma.case.findFirst).not.toHaveBeenCalled();
  });
});
