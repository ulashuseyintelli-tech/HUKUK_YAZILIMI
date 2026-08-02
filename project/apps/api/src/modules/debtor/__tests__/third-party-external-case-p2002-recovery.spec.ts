import { Prisma } from '@prisma/client';
import { ThirdPartyService } from '../third-party.service';

// I15 Phase A regression guard: gercek CI kosusunda (25-way concurrent race,
// bkz. PR CI log'u) createExternalCase()'in P2002 catch bloğu, meta.target'in
// Postgres+Prisma'da CONSTRAINT ADI degil KOLON ADLARI dizisi oldugunu
// varsaymadigi icin gercek bir duplikasyonu yakalayamadan disari sizdirdi.
// Bu spec, o TAM hata sekli (gercek Postgres P2002 meta.target formati) ile
// mock kullanarak catch blogunun DOGRU sekilde idempotent replay yaptigini
// deterministik olarak dogrular (yerel/CI eszamanlilik farkina bagimli degil).

function makePostgresP2002(columns: string[]) {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: '5.22.0',
    meta: { target: columns },
  });
}

describe('I15 Phase A — createExternalCase() P2002 recovery (mocked, deterministic)', () => {
  function build(existingRow: any) {
    const guard = { assertActiveByCaseDebtorId: jest.fn().mockResolvedValue(undefined) };
    const prisma: any = {
      caseDebtor: {
        findFirst: jest.fn().mockResolvedValue({ id: 'cd1', case: { tenantId: 't1' } }),
      },
      externalCase: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce(null) // on-kontrol: henuz yok (yaris penceresi)
          .mockResolvedValueOnce(existingRow), // catch-block replay: rakip cagri commit etti
        create: jest.fn().mockRejectedValue(makePostgresP2002(['tenantId', 'caseDebtorId', 'externalOffice', 'externalCaseNo'])),
      },
    };
    return { service: new ThirdPartyService(prisma, {} as any, guard as any, {} as any, {} as any), prisma };
  }

  it('gercek Postgres P2002 (meta.target=kolon adlari dizisi) yakalanip idempotent replay doner', async () => {
    const existingRow = { id: 'ec-existing', tenantId: 't1', caseDebtorId: 'cd1' };
    const { service, prisma } = build(existingRow);

    const result = await service.createExternalCase(
      't1',
      'cd1',
      {
        externalOffice: 'Ankara 5. İcra Dairesi',
        externalCaseNo: '2026/12345',
        counterpartyName: 'Karşı Taraf',
        claimAmount: 1000,
      } as any,
      'user-1',
    );

    expect(result).toEqual(existingRow);
    expect(prisma.externalCase.findUnique).toHaveBeenCalledTimes(2);
    expect(prisma.externalCase.create).toHaveBeenCalledTimes(1);
  });

  it('P2002 sonrasi findUnique de null donerse (gercekten cozulemeyen durum) orijinal hata firlatilir', async () => {
    const { service } = build(null);

    await expect(
      service.createExternalCase(
        't1',
        'cd1',
        {
          externalOffice: 'Ankara 5. İcra Dairesi',
          externalCaseNo: '2026/12345',
          counterpartyName: 'Karşı Taraf',
          claimAmount: 1000,
        } as any,
        'user-1',
      ),
    ).rejects.toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
  });
});
