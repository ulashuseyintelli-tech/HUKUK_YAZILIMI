/**
 * RFA-016 — case.service.create() inline taraf duplicate-guard BYPASS kapanışı.
 *
 * Eskiden case.create içinde inline-yeni client/lawyer/debtor `tx.X.create` ile guard'sız
 * açılıyordu (Şükrü-deseninin dış-kapı hali). Tasarım A: taraflar tx ÖNCESİ guard'lı servislerle
 * resolve/create edilir. Bu test `resolveInlinePartiesBeforeTx`'in:
 *  - inline-yeni taraf (id YOK) için guard'lı servisi ÇAĞIRDIĞINI,
 *  - mevcut id'li tarafa DOKUNMADIĞINI,
 *  - DebtorService DUPLICATE_IDENTITY fırlatınca mevcut kaydı REUSE ettiğini (yeni create YOK),
 *  - SIMILAR_NAME_REVIEW'da forceCreate ile devam ettiğini,
 *  - caseDebtors varken legacy debtors yolunu İŞLEMEDİĞİNİ
 * doğrular. (Çağrı sayısı = "yeni kayıt açılmadı/duplicate yok" kanıtı; canlı DB-count doğrulaması
 * ayrıca e2e ile yapılır.)
 */

import { ConflictException } from '@nestjs/common';
import { CaseService } from '../case.service';

function build(clientService: any, lawyerService: any, debtorService: any) {
  const stub = {} as any;
  // deps: prisma, audit, clientInfo, interestEngine, expenseRequest, domainEventIngest,
  // collectionService, clientService, lawyerService, debtorService
  return new CaseService(stub, stub, stub, stub, stub, stub, stub, clientService, lawyerService, debtorService);
}

async function resolve(svc: CaseService, dto: any) {
  await (svc as any).resolveInlinePartiesBeforeTx('tenant-1', dto);
}

describe('RFA-016 resolveInlinePartiesBeforeTx — inline taraf guard bypass kapandı', () => {
  it('inline-yeni müvekkil (id YOK) → ClientService.create çağrılır, identityNo type-e göre tckn map edilir, id atanır', async () => {
    const clientService = { create: jest.fn(async (_t: string, _data: any) => ({ id: 'client-new' })) };
    const svc = build(clientService, { create: jest.fn() }, { create: jest.fn() });
    const dto: any = { creditors: [{ type: 'INDIVIDUAL', name: 'Ahmet Yılmaz', identityNo: '11111111111' }] };

    await resolve(svc, dto);

    expect(clientService.create).toHaveBeenCalledTimes(1);
    const arg = clientService.create.mock.calls[0][1];
    expect(arg.tckn).toBe('11111111111'); // INDIVIDUAL → tckn (guard tckn/vkn'e bakar)
    expect(arg.vkn).toBeUndefined();
    expect(dto.creditors[0].id).toBe('client-new');
  });

  it('COMPANY müvekkil → identityNo vkn olarak map edilir', async () => {
    const clientService = { create: jest.fn(async (_t: string, _data: any) => ({ id: 'c-co' })) };
    const svc = build(clientService, { create: jest.fn() }, { create: jest.fn() });
    const dto: any = { creditors: [{ type: 'COMPANY', name: 'ACME A.Ş.', identityNo: '1234567890' }] };

    await resolve(svc, dto);

    const arg = clientService.create.mock.calls[0][1];
    expect(arg.vkn).toBe('1234567890');
    expect(arg.tckn).toBeUndefined();
    expect(arg.companyName).toBe('ACME A.Ş.');
  });

  it('mevcut id-li müvekkil → ClientService.create ÇAĞRILMAZ (dokunulmaz)', async () => {
    const clientService = { create: jest.fn() };
    const svc = build(clientService, { create: jest.fn() }, { create: jest.fn() });
    const dto: any = { creditors: [{ id: 'existing-1', type: 'INDIVIDUAL', name: 'Var Olan' }] };

    await resolve(svc, dto);

    expect(clientService.create).not.toHaveBeenCalled();
    expect(dto.creditors[0].id).toBe('existing-1');
  });

  it('inline-yeni avukat → LawyerService.create çağrılır, id atanır', async () => {
    const lawyerService = { create: jest.fn(async () => ({ id: 'lawyer-new' })) };
    const svc = build({ create: jest.fn() }, lawyerService, { create: jest.fn() });
    const dto: any = { lawyers: [{ name: 'Av. Mehmet', surname: 'Demir', barNumber: '5555' }] };

    await resolve(svc, dto);

    expect(lawyerService.create).toHaveBeenCalledTimes(1);
    expect(dto.lawyers[0].id).toBe('lawyer-new');
  });

  it('legacy borçlu + DUPLICATE_IDENTITY → mevcut borçlu REUSE edilir (ikinci create YOK)', async () => {
    const debtorService = {
      create: jest.fn(async () => {
        throw new ConflictException({
          code: 'DUPLICATE_IDENTITY',
          message: 'mevcut',
          existingDebtor: { id: 'debtor-existing' },
        });
      }),
    };
    const svc = build({ create: jest.fn() }, { create: jest.fn() }, debtorService);
    const dto: any = { debtors: [{ type: 'INDIVIDUAL', name: 'Ali Veli', identityNo: '22222222222' }] };

    await resolve(svc, dto);

    expect(debtorService.create).toHaveBeenCalledTimes(1); // tek deneme, forceCreate yok
    expect(dto.debtors[0].id).toBe('debtor-existing'); // mevcut reuse
  });

  it('legacy borçlu + SIMILAR_NAME_REVIEW → forceCreate ile ayrı kişi oluşturulur', async () => {
    const debtorService = {
      create: jest
        .fn()
        .mockImplementationOnce(async () => {
          throw new ConflictException({ code: 'SIMILAR_NAME_REVIEW', message: 'benzer', candidates: [] });
        })
        .mockImplementationOnce(async () => ({ id: 'debtor-forced' })),
    };
    const svc = build({ create: jest.fn() }, { create: jest.fn() }, debtorService);
    const dto: any = { debtors: [{ type: 'INDIVIDUAL', name: 'Mehmet Yılmaz' }] };

    await resolve(svc, dto);

    expect(debtorService.create).toHaveBeenCalledTimes(2);
    expect(debtorService.create.mock.calls[1][1].forceCreate).toBe(true);
    expect(dto.debtors[0].id).toBe('debtor-forced');
  });

  it('caseDebtors VARSA legacy debtors yolu İŞLENMEZ (DebtorService.create çağrılmaz)', async () => {
    const debtorService = { create: jest.fn() };
    const svc = build({ create: jest.fn() }, { create: jest.fn() }, debtorService);
    const dto: any = {
      caseDebtors: [{ debtorId: 'existing-debtor' }],
      debtors: [{ type: 'INDIVIDUAL', name: 'İşlenmemeli' }],
    };

    await resolve(svc, dto);

    expect(debtorService.create).not.toHaveBeenCalled();
  });
});
