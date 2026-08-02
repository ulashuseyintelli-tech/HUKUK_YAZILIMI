/**
 * C1-B03 (F-SEED-05/06, CLAUDE-CLIENT-C1) — bulk atomiklik ve failure davranışı (SAF, DB-siz).
 *
 * KANITLA SEÇİLEN MODEL (kör tek-transaction YOK):
 *  - seedAll  → RESUMABLE/IDEMPOTENT STAGES: adım hatasında zincir DURUR; tamamlanan
 *    adımların sonuçları + failedStep + notRun AÇIKÇA raporlanır; yeniden çalıştırma
 *    idempotency ile kaldığı yerden tamamlar. Yetki hatası ESKİSİ GİBİ throw eder.
 *  - seedCases → SATIR-SEVİYESİ DAR TRANSACTION: satır başına 3 yazım (case + caseDebtor +
 *    caseLawyer) aynı tx client üzerinden; satır-bazlı devam (D07) korunur.
 *  - seedPublicInstitutionDebtors → BOUNDED BATCH: mevcutlar TEK okuma ile ayıklanır,
 *    eksikler 100'lük deterministik chunk'larla createMany; chunk düşerse satır-bazlı devam.
 */
import { ForbiddenException } from '@nestjs/common';
import { SeedService } from '../seed.service';

const actorElevated = { userId: 'u1', tenantId: 't1', role: 'USER' };

const allowedClientService = () =>
  ({
    assertCanRunElevatedClientBulkOperation: jest.fn().mockResolvedValue(undefined),
    create: jest.fn().mockResolvedValue({ id: 'c1', _existingReturned: false }),
  } as any);

const noopAudit = () => ({ log: jest.fn(), logInTransaction: jest.fn() } as any);

describe('SeedService.seedAll — resumable stages (C1-B03)', () => {
  it('adım hatasında zincir DURUR: önceki sonuçlar korunur, failedStep + notRun raporlanır, sonraki adımlar HİÇ çağrılmaz', async () => {
    const svc = new SeedService({} as any, noopAudit(), allowedClientService());
    jest.spyOn(svc, 'seedOffice').mockResolvedValue({ created: 1 } as any);
    jest.spyOn(svc, 'seedBankAccounts').mockResolvedValue({ created: 3 } as any);
    jest.spyOn(svc, 'seedLookups').mockRejectedValue(new Error('DB down'));
    const lawyersSpy = jest.spyOn(svc, 'seedLawyers');
    const clientsSpy = jest.spyOn(svc, 'seedClients');
    const casesSpy = jest.spyOn(svc, 'seedCases');

    const res: any = await svc.seedAll('t1', actorElevated);

    expect(res.success).toBe(false);
    expect(res.failedStep).toBe('lookups');
    expect(res.results.office).toEqual({ created: 1 });
    expect(res.results.bankAccounts).toEqual({ created: 3 });
    expect(res.results.lookups).toBeUndefined();
    expect(res.notRun).toEqual([
      'lawyers',
      'staff',
      'clients',
      'debtors',
      'executionOffices',
      'cases',
      'publicInstitutions',
      'publicInstitutionDebtors',
    ]);
    expect(lawyersSpy).not.toHaveBeenCalled();
    expect(clientsSpy).not.toHaveBeenCalled();
    expect(casesSpy).not.toHaveBeenCalled();
  });

  it('yetki hatası YUTULMAZ: assert reddi throw olarak yayılır (403 davranışı değişmedi)', async () => {
    const clientService = {
      assertCanRunElevatedClientBulkOperation: jest
        .fn()
        .mockRejectedValue(new ForbiddenException({ code: 'CLIENT_MUTATION_DENIED_LIFECYCLE' })),
      create: jest.fn(),
    } as any;
    const svc = new SeedService({} as any, noopAudit(), clientService);
    const officeSpy = jest.spyOn(svc, 'seedOffice');

    await expect(svc.seedAll('t1', actorElevated)).rejects.toBeInstanceOf(ForbiddenException);
    expect(officeSpy).not.toHaveBeenCalled();
  });

  it('hatasız zincirde davranış AYNI: success true + 11 adımın sonucu', async () => {
    const svc = new SeedService({} as any, noopAudit(), allowedClientService());
    const stepNames = [
      'seedOffice', 'seedBankAccounts', 'seedLookups', 'seedLawyers', 'seedStaff',
      'seedClients', 'seedDebtors', 'seedExecutionOffices', 'seedCases',
      'seedPublicInstitutions', 'seedPublicInstitutionDebtors',
    ] as const;
    for (const name of stepNames) {
      jest.spyOn(svc, name as any).mockResolvedValue({ created: 0 } as any);
    }

    const res: any = await svc.seedAll('t1', actorElevated);

    expect(res.success).toBe(true);
    expect(Object.keys(res.results)).toHaveLength(11);
  });
});

describe('SeedService.seedCases — satır-seviyesi dar transaction (C1-B03)', () => {
  const buildPrisma = (opts: { failCaseDebtorOnRow?: number } = {}) => {
    let row = 0;
    const txCalls: any[] = [];
    const prisma: any = {
      client: { findMany: jest.fn().mockResolvedValue([{ id: 'cl1' }]) },
      debtor: { findMany: jest.fn().mockResolvedValue([{ id: 'd1' }]) },
      lawyer: { findMany: jest.fn().mockResolvedValue([{ id: 'l1' }]) },
      executionOffice: { findMany: jest.fn().mockResolvedValue([{ id: 'eo1' }]) },
      lookupTakipTuru: { findMany: jest.fn().mockResolvedValue([{ id: 'tt1' }]) },
      lookupRisk: { findMany: jest.fn().mockResolvedValue([{ id: 'r1' }]) },
      case: { findFirst: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn().mockImplementation(async (cb: any) => {
        row++;
        const tx = {
          case: { create: jest.fn().mockResolvedValue({ id: `case-${row}` }) },
          caseDebtor: {
            create:
              opts.failCaseDebtorOnRow === row
                ? jest.fn().mockRejectedValue(new Error('FK violation'))
                : jest.fn().mockResolvedValue({}),
          },
          caseLawyer: { create: jest.fn().mockResolvedValue({}) },
        };
        txCalls.push(tx);
        return cb(tx);
      }),
    };
    return { prisma, txCalls };
  };

  it('satırın 3 yazımı da AYNI tx client üzerinden gider (atomik sınır yapısal kanıt)', async () => {
    const { prisma, txCalls } = buildPrisma();
    const svc = new SeedService(prisma, noopAudit(), allowedClientService());

    const res: any = await svc.seedCases('t1');

    expect(res.created).toBe(10);
    expect(res.failed).toBe(0);
    expect(prisma.$transaction).toHaveBeenCalledTimes(10);
    for (const tx of txCalls) {
      expect(tx.case.create).toHaveBeenCalledTimes(1);
      expect(tx.caseDebtor.create).toHaveBeenCalledTimes(1);
      expect(tx.caseLawyer.create).toHaveBeenCalledTimes(1);
    }
  });

  it('bir satırın tx hatası: o satır failed sayılır, ÖNCEKİ başarılar geri alınmaz, SONRAKİ satırlar devam eder (D07)', async () => {
    const { prisma } = buildPrisma({ failCaseDebtorOnRow: 3 });
    const svc = new SeedService(prisma, noopAudit(), allowedClientService());

    const res: any = await svc.seedCases('t1');

    expect(res.created).toBe(9);
    expect(res.failed).toBe(1);
    expect(prisma.$transaction).toHaveBeenCalledTimes(10); // 3. satırdan sonra da devam etti
  });
});

describe('SeedService.seedPublicInstitutionDebtors — bounded batch (C1-B03)', () => {
  const institutions = (n: number, offset = 0) =>
    Array.from({ length: n }, (_, i) => ({
      detsisNo: `D-${offset + i}`,
      name: `Kurum ${offset + i}`,
      category: 'BAKANLIK',
      kepAddress: null,
      isActive: true,
    }));

  const buildPrisma = (opts: {
    institutionRows: any[];
    existingDetsis?: string[];
    failCreateManyChunk?: number;
  }) => {
    let createManyCall = 0;
    const prisma: any = {
      publicInstitution: {
        count: jest.fn().mockResolvedValue(opts.institutionRows.length),
        findMany: jest.fn().mockResolvedValue(opts.institutionRows),
      },
      debtor: {
        findMany: jest
          .fn()
          .mockResolvedValue((opts.existingDetsis ?? []).map((d) => ({ detsisNo: d }))),
        createMany: jest.fn().mockImplementation(async ({ data }: any) => {
          createManyCall++;
          if (opts.failCreateManyChunk === createManyCall) {
            throw new Error('chunk write failed');
          }
          return { count: data.length };
        }),
        create: jest.fn().mockResolvedValue({}),
      },
    };
    return prisma;
  };

  it('250 kurum → tek existing okuması + 3 çağrıda (100+100+50) yazılır; kurum başına sorgu YOK', async () => {
    const prisma = buildPrisma({ institutionRows: institutions(250) });
    const svc = new SeedService(prisma, noopAudit(), allowedClientService());

    const res: any = await svc.seedPublicInstitutionDebtors('t1');

    expect(res.created).toBe(250);
    expect(res.failed).toBe(0);
    expect(prisma.debtor.findMany).toHaveBeenCalledTimes(1); // TEK okuma
    expect(prisma.debtor.createMany).toHaveBeenCalledTimes(3); // ceil(250/100)
    expect(prisma.debtor.create).not.toHaveBeenCalled(); // fallback tetiklenmedi
    // Okuma tenant-scoped ve detsisNo kümesiyle sınırlı
    const readArgs = prisma.debtor.findMany.mock.calls[0][0];
    expect(readArgs.where.tenantId).toBe('t1');
    expect(readArgs.where.detsisNo.in).toHaveLength(250);
  });

  it('mevcut kayıtlar tek okumayla ayıklanır: yalnız eksikler yazılır, skipped kurum-bazlı sayılır', async () => {
    const rows = institutions(120);
    const prisma = buildPrisma({
      institutionRows: rows,
      existingDetsis: rows.slice(0, 40).map((r) => r.detsisNo),
    });
    const svc = new SeedService(prisma, noopAudit(), allowedClientService());

    const res: any = await svc.seedPublicInstitutionDebtors('t1');

    expect(res.created).toBe(80);
    expect(res.skipped).toBe(40);
    expect(prisma.debtor.createMany).toHaveBeenCalledTimes(1); // ceil(80/100)
  });

  it('chunk düşerse satır-bazlı devam (D07): hatalı chunk tek tek denenir, kalan chunk devam eder', async () => {
    const prisma = buildPrisma({ institutionRows: institutions(150), failCreateManyChunk: 1 });
    prisma.debtor.create = jest
      .fn()
      .mockRejectedValueOnce(new Error('row failed')) // ilk satır düşer
      .mockResolvedValue({});
    const svc = new SeedService(prisma, noopAudit(), allowedClientService());

    const res: any = await svc.seedPublicInstitutionDebtors('t1');

    // chunk1 (100): createMany düştü → 99 satır tek tek başarılı, 1 failed; chunk2 (50): createMany başarılı
    expect(res.created).toBe(149);
    expect(res.failed).toBe(1);
    expect(res.skipped).toBe(1); // 0 mevcut + 1 failed
    expect(prisma.debtor.create).toHaveBeenCalledTimes(100);
    expect(prisma.debtor.createMany).toHaveBeenCalledTimes(2);
  });

  it('idempotency: tüm kurumlar zaten borçluysa hiç yazım yapılmaz', async () => {
    const rows = institutions(50);
    const prisma = buildPrisma({
      institutionRows: rows,
      existingDetsis: rows.map((r) => r.detsisNo),
    });
    const svc = new SeedService(prisma, noopAudit(), allowedClientService());

    const res: any = await svc.seedPublicInstitutionDebtors('t1');

    expect(res.created).toBe(0);
    expect(res.skipped).toBe(50);
    expect(prisma.debtor.createMany).not.toHaveBeenCalled();
    expect(prisma.debtor.create).not.toHaveBeenCalled();
  });
});
