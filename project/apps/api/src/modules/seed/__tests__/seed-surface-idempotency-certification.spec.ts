/**
 * C1-B06 (CLAUDE-CLIENT-C1) — seed modülü yüzey sertifikasyonu (SAF, DB-siz).
 *
 * #2107 ile başlayan seed test kapsamını TAMAMLAR: önceki spec'ler authority/guard/
 * runtime-gate/atomiklik davranışlarını kilitledi (seed-client-authority,
 * seed-controller-guards, seed-runtime-gate, seed-bulk-atomicity); bu spec kalan
 * yüzeylerin İDEMPOTENCY ve ÖN-KOŞUL sözleşmelerini karakterize eder:
 * her yüzey "varsa DOKUNMA / yoksa yaz" davranışını korur, ön-koşul yoksa yazmadan
 * açık mesajla döner. Böylece B01–B05 regresyon kilidi seed yüzeyinin tamamını kapsar.
 */
import { SeedService } from '../seed.service';

const noopAudit = () => ({ log: jest.fn(), logInTransaction: jest.fn() } as any);
const clientServiceStub = () =>
  ({
    assertCanRunElevatedClientBulkOperation: jest.fn().mockResolvedValue(undefined),
    create: jest.fn(),
  } as any);

const svcWith = (prisma: any) => new SeedService(prisma, noopAudit(), clientServiceStub());

describe('SeedService — kalan yüzeylerin idempotency sertifikasyonu (C1-B06)', () => {
  it('seedOffice: mevcut ofis varsa CREATE değil UPDATE (idempotent onarım)', async () => {
    const prisma: any = {
      office: {
        findFirst: jest.fn().mockResolvedValue({ id: 'o1', name: 'Var Olan Büro' }),
        update: jest.fn().mockResolvedValue({}),
        create: jest.fn(),
      },
    };
    const res: any = await svcWith(prisma).seedOffice('t1');
    expect(prisma.office.update).toHaveBeenCalledTimes(1);
    expect(prisma.office.create).not.toHaveBeenCalled();
    expect(res.updated).toBe(1);
  });

  it('seedBankAccounts: büro yoksa HİÇBİR yazım yapılmaz, açık mesajla döner (ön-koşul)', async () => {
    const prisma: any = {
      office: { findFirst: jest.fn().mockResolvedValue(null) },
      officeBankAccount: { findFirst: jest.fn(), create: jest.fn() },
    };
    const res: any = await svcWith(prisma).seedBankAccounts('t1');
    expect(res.created).toBe(0);
    expect(prisma.officeBankAccount.create).not.toHaveBeenCalled();
  });

  it('seedBankAccounts: mevcut IBAN atlanır, eksik yazılır (idempotency)', async () => {
    let call = 0;
    const prisma: any = {
      office: { findFirst: jest.fn().mockResolvedValue({ id: 'o1' }) },
      officeBankAccount: {
        // 3 hesaptan ilki mevcut, diğer ikisi eksik
        findFirst: jest.fn().mockImplementation(() => Promise.resolve(++call === 1 ? { id: 'ba1' } : null)),
        create: jest.fn().mockResolvedValue({}),
      },
    };
    const res: any = await svcWith(prisma).seedBankAccounts('t1');
    expect(res.created).toBe(2);
    expect(prisma.officeBankAccount.create).toHaveBeenCalledTimes(2);
  });

  it('seedLawyers: barNumber mevcutsa satır atlanır (tenant-scoped probe)', async () => {
    const prisma: any = {
      office: { findFirst: jest.fn().mockResolvedValue({ id: 'o1' }) },
      lawyer: {
        findFirst: jest.fn().mockResolvedValue({ id: 'l1' }), // hepsi mevcut
        create: jest.fn(),
      },
    };
    const res: any = await svcWith(prisma).seedLawyers('t1');
    expect(res.created).toBe(0);
    expect(prisma.lawyer.create).not.toHaveBeenCalled();
    // probe tenant-scoped
    const args = prisma.lawyer.findFirst.mock.calls[0][0];
    expect(args.where.tenantId).toBe('t1');
  });

  it('seedStaff: email mevcutsa satır atlanır', async () => {
    const prisma: any = {
      staffMember: {
        findFirst: jest.fn().mockResolvedValue({ id: 's1' }),
        create: jest.fn(),
      },
    };
    const res: any = await svcWith(prisma).seedStaff('t1');
    expect(res.created).toBe(0);
    expect(prisma.staffMember.create).not.toHaveBeenCalled();
  });

  it('seedDebtors: identityNo mevcutsa satır atlanır, eksikler tenant ile yazılır', async () => {
    let call = 0;
    const prisma: any = {
      debtor: {
        findFirst: jest.fn().mockImplementation(() => Promise.resolve(++call <= 5 ? { id: 'd' } : null)),
        create: jest.fn().mockResolvedValue({}),
      },
    };
    const res: any = await svcWith(prisma).seedDebtors('t1');
    expect(res.created).toBe(35); // 40 borçludan ilk 5'i mevcut
    expect(prisma.debtor.create).toHaveBeenCalledTimes(35);
    const createArg = prisma.debtor.create.mock.calls[0][0];
    expect(createArg.data.tenantId).toBe('t1');
  });

  it('seedExecutionOffices: uyapCode mevcutsa atlanır', async () => {
    const prisma: any = {
      executionOffice: {
        findFirst: jest.fn().mockResolvedValue({ id: 'eo1' }),
        create: jest.fn(),
      },
    };
    const res: any = await svcWith(prisma).seedExecutionOffices('t1');
    expect(res.created).toBe(0);
    expect(prisma.executionOffice.create).not.toHaveBeenCalled();
  });

  it('seedCases: müvekkil veya borçlu yoksa HİÇ yazım yapılmaz (ön-koşul)', async () => {
    const prisma: any = {
      client: { findMany: jest.fn().mockResolvedValue([]) },
      debtor: { findMany: jest.fn().mockResolvedValue([]) },
      lawyer: { findMany: jest.fn().mockResolvedValue([]) },
      executionOffice: { findMany: jest.fn().mockResolvedValue([]) },
      lookupTakipTuru: { findMany: jest.fn().mockResolvedValue([]) },
      lookupRisk: { findMany: jest.fn().mockResolvedValue([]) },
      case: { findFirst: jest.fn() },
      $transaction: jest.fn(),
    };
    const res: any = await svcWith(prisma).seedCases('t1');
    expect(res.created).toBe(0);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('getDataStatus: 7 sayaç tenant-scoped döner (salt okuma)', async () => {
    const count = jest.fn().mockResolvedValue(2);
    const prisma: any = {
      lawyer: { count },
      client: { count },
      debtor: { count },
      case: { count },
      executionOffice: { count },
      staffMember: { count },
      lookupTakipTuru: { count },
    };
    const res = await svcWith(prisma).getDataStatus('t1');
    expect(res).toEqual({ lawyers: 2, clients: 2, debtors: 2, cases: 2, offices: 2, staff: 2, lookups: 2 });
    expect(count).toHaveBeenCalledWith({ where: { tenantId: 't1' } });
  });
});
