/** @jest-environment node */
/**
 * DEBTOR-ADDRESS-OWNERSHIP-GUARD-P1-I03 — ConfidenceScoreService tenant sozlesmesi.
 *
 * DURUST SINIFLANDIRMA — bu CANLI bir acik DEGILDI:
 * Bu gorevin baslangicinda `computeAddressScore` / `updateAddressScore` /
 * `updateAllScoresForDebtor` / `updateAllScoresForCaseDebtor` metotlari HIC tenant
 * baglami tasimiyordu; zorlama tamamen cagiranin `assertAddressBelongsToTenant` veya
 * `assertDebtorBelongsToTenant`'i ONCE cagirmasina bagliydi. Tum uretim cagiranlari
 * (yalniz AddressDiscoveryController'in 3 ucu + servis-ici rekursiyon) bunu yapiyordu,
 * dolayisiyla sömürülebilir bir cross-tenant yol YOKTU. Kapatilan sey LATENT SOZLESME
 * BOSLUGU idi: guard'i atlayan tek bir yeni cagiran sessizce cross-tenant okuma/yazma
 * acardi ve hicbir test bunu yakalamazdi.
 *
 * Bu suite o bosluğun geri gelmesini engeller:
 *  - tenant baglami derleme zamaninda zorunlu (imza sozlesmesi),
 *  - sahiplik her metodun ILK islemi (davranis),
 *  - yazma yollari da tenant-scoped (`updateMany` + etkilenen satir kontrolu),
 *  - sahte Prisma `where` kosullarini GERCEKTEN uygular: tenant zinciri dususe
 *    testler yesil KALAMAZ.
 */
import { NotFoundException } from '@nestjs/common';
import { readFileSync } from 'fs';
import { join } from 'path';
import { ConfidenceScoreService } from './confidence-score.service';

const T1 = 'tenant-alpha';
const T2 = 'tenant-beta';

const ADDRESSES = [
  { id: 'addr-a1', debtorId: 'debtor-a', tenantId: T1 },
  { id: 'addr-a2', debtorId: 'debtor-a', tenantId: T1 },
  { id: 'addr-b1', debtorId: 'debtor-b', tenantId: T2 },
];
const DEBTORS = [
  { id: 'debtor-a', tenantId: T1 },
  { id: 'debtor-b', tenantId: T2 },
];
const CASE_DEBTORS = [
  { id: 'cd-a', debtorId: 'debtor-a', tenantId: T1 },
  { id: 'cd-b', debtorId: 'debtor-b', tenantId: T2 },
];

/** `where` kosullarini GERCEKTEN uygulayan sahte Prisma (kanit-uretici fixture). */
function makePrisma() {
  const writes: Array<{ id?: string; tenantId?: string; score: number }> = [];

  const addrMatches = (a: (typeof ADDRESSES)[number], w: any) =>
    (w.id === undefined || a.id === w.id) &&
    (w.debtorId === undefined || a.debtorId === w.debtorId) &&
    (w.debtor?.tenantId === undefined || a.tenantId === w.debtor.tenantId);

  return {
    writes,
    debtorAddress: {
      findFirst: jest.fn(async ({ where }: any) => {
        const a = ADDRESSES.find((x) => addrMatches(x, where));
        return a ? { id: a.id } : null;
      }),
      findUnique: jest.fn(async ({ where }: any) => {
        const a = ADDRESSES.find((x) => x.id === where.id);
        return a
          ? {
              id: a.id,
              source: 'UYAP',
              verified: true,
              verifiedAt: new Date('2026-01-01'),
              updatedAt: new Date('2026-01-01'),
              serviceHistory: [],
            }
          : null;
      }),
      findMany: jest.fn(async ({ where }: any) =>
        ADDRESSES.filter((x) => addrMatches(x, where)).map((x) => ({ id: x.id })),
      ),
      updateMany: jest.fn(async ({ where, data }: any) => {
        const hits = ADDRESSES.filter((x) => addrMatches(x, where));
        hits.forEach((h) =>
          writes.push({ id: h.id, tenantId: h.tenantId, score: data.confidenceScore }),
        );
        return { count: hits.length };
      }),
      update: jest.fn(async () => {
        throw new Error('tenant-scoped OLMAYAN update() kullanilmamali');
      }),
    },
    debtor: {
      findFirst: jest.fn(async ({ where }: any) => {
        const d = DEBTORS.find(
          (x) =>
            (where.id === undefined || x.id === where.id) &&
            (where.tenantId === undefined || x.tenantId === where.tenantId),
        );
        return d ? { id: d.id } : null;
      }),
    },
    caseDebtor: {
      findFirst: jest.fn(async ({ where }: any) => {
        const cd = CASE_DEBTORS.find(
          (x) =>
            (where.id === undefined || x.id === where.id) &&
            (where.case?.tenantId === undefined || x.tenantId === where.case.tenantId),
        );
        return cd ? { debtorId: cd.debtorId } : null;
      }),
      findUnique: jest.fn(async () => {
        throw new Error('tenant-scoped OLMAYAN findUnique() kullanilmamali');
      }),
    },
  } as any;
}

const svcOf = (prisma: any) => new ConfidenceScoreService(prisma);

afterEach(() => jest.clearAllMocks());

// ============================================================
describe('DEBTOR-ADDRESS-OWNERSHIP-GUARD-P1-I03 — computeAddressScore', () => {
  it('SEN-01: kendi tenant adresi → sahiplik tenant-zincirli sorgulanir ve hesap yapilir', async () => {
    const prisma = makePrisma();
    await expect(svcOf(prisma).computeAddressScore(T1, 'addr-a1')).resolves.toEqual(
      expect.any(Number),
    );
    expect(prisma.debtorAddress.findFirst).toHaveBeenCalledWith({
      where: { id: 'addr-a1', debtor: { tenantId: T1 } },
      select: { id: true },
    });
  });

  it('SEN-02: cross-tenant adres → NotFound, adres HIC okunmaz', async () => {
    const prisma = makePrisma();
    await expect(svcOf(prisma).computeAddressScore(T1, 'addr-b1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.debtorAddress.findUnique).not.toHaveBeenCalled();
  });

  it('SEN-03: var olmayan adres → cross-tenant ile AYNI yanit (varlik sizintisi yok)', async () => {
    const a = await svcOf(makePrisma()).computeAddressScore(T1, 'addr-b1').catch((e) => e);
    const b = await svcOf(makePrisma()).computeAddressScore(T1, 'yok').catch((e) => e);
    expect(a.constructor).toBe(b.constructor);
    expect(a.getStatus()).toBe(b.getStatus());
    expect(String(a.message)).toBe(String(b.message));
  });
});

describe('DEBTOR-ADDRESS-OWNERSHIP-GUARD-P1-I03 — updateAddressScore', () => {
  it('SEN-04: kendi tenant adresi → yazma tenant-scoped where ile yapilir', async () => {
    const prisma = makePrisma();
    await svcOf(prisma).updateAddressScore(T1, 'addr-a1');
    expect(prisma.debtorAddress.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'addr-a1', debtor: { tenantId: T1 } } }),
    );
    expect(prisma.writes.map((w: any) => w.tenantId)).toEqual([T1]);
  });

  it('SEN-05: cross-tenant adres → NotFound, HICBIR yazma olmaz', async () => {
    const prisma = makePrisma();
    await expect(svcOf(prisma).updateAddressScore(T1, 'addr-b1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.debtorAddress.updateMany).not.toHaveBeenCalled();
    expect(prisma.writes).toEqual([]);
  });

  it('SEN-06: tenant-scoped OLMAYAN update() ASLA kullanilmaz', async () => {
    const prisma = makePrisma();
    await svcOf(prisma).updateAddressScore(T1, 'addr-a1');
    expect(prisma.debtorAddress.update).not.toHaveBeenCalled();
  });
});

describe('DEBTOR-ADDRESS-OWNERSHIP-GUARD-P1-I03 — updateAllScoresForDebtor', () => {
  it('SEN-07: kendi tenant borclusu → yalniz o tenant`in adresleri guncellenir', async () => {
    const prisma = makePrisma();
    await svcOf(prisma).updateAllScoresForDebtor(T1, 'debtor-a');
    expect(prisma.debtor.findFirst).toHaveBeenCalledWith({
      where: { id: 'debtor-a', tenantId: T1 },
      select: { id: true },
    });
    expect(prisma.debtorAddress.findMany).toHaveBeenCalledWith({
      where: { debtorId: 'debtor-a', debtor: { tenantId: T1 } },
      select: { id: true },
    });
    // debtor-a'nin iki adresi var, ikisi de T1.
    expect(prisma.writes.map((w: any) => w.id).sort()).toEqual(['addr-a1', 'addr-a2']);
  });

  it('SEN-08: cross-tenant borclu → NotFound, HICBIR adres okunmaz/yazilmaz', async () => {
    const prisma = makePrisma();
    await expect(
      svcOf(prisma).updateAllScoresForDebtor(T1, 'debtor-b'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.debtorAddress.findMany).not.toHaveBeenCalled();
    expect(prisma.writes).toEqual([]);
  });

  it('SEN-09: var olmayan borclu → cross-tenant ile AYNI yanit', async () => {
    const a = await svcOf(makePrisma()).updateAllScoresForDebtor(T1, 'debtor-b').catch((e) => e);
    const b = await svcOf(makePrisma()).updateAllScoresForDebtor(T1, 'yok').catch((e) => e);
    expect(a.constructor).toBe(b.constructor);
    expect(String(a.message)).toBe(String(b.message));
  });
});

describe('DEBTOR-ADDRESS-OWNERSHIP-GUARD-P1-I03 — updateAllScoresForCaseDebtor', () => {
  it('SEN-10: kendi tenant caseDebtor → tenant-scoped cozulur ve guncellenir', async () => {
    const prisma = makePrisma();
    await svcOf(prisma).updateAllScoresForCaseDebtor(T1, 'cd-a');
    expect(prisma.caseDebtor.findFirst).toHaveBeenCalledWith({
      where: { id: 'cd-a', case: { tenantId: T1 } },
      select: { debtorId: true },
    });
    expect(prisma.writes.length).toBe(2);
  });

  it('SEN-11: cross-tenant caseDebtor → hicbir sey guncellenmez', async () => {
    const prisma = makePrisma();
    await svcOf(prisma).updateAllScoresForCaseDebtor(T1, 'cd-b');
    expect(prisma.debtor.findFirst).not.toHaveBeenCalled();
    expect(prisma.writes).toEqual([]);
  });

  it('SEN-12: bos tenantId → fail-closed, DB`ye hic gidilmez', async () => {
    const prisma = makePrisma();
    await expect(
      svcOf(prisma).updateAllScoresForCaseDebtor('', 'cd-a'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.caseDebtor.findFirst).not.toHaveBeenCalled();
  });

  it('SEN-13: tenant-scoped OLMAYAN findUnique() ASLA kullanilmaz', async () => {
    const prisma = makePrisma();
    await svcOf(prisma).updateAllScoresForCaseDebtor(T1, 'cd-a');
    expect(prisma.caseDebtor.findUnique).not.toHaveBeenCalled();
  });
});

// ============================================================
// Sozlesme (static) — latent boslugun geri gelmesini engelle
// ============================================================
describe('DEBTOR-ADDRESS-OWNERSHIP-GUARD-P1-I03 — imza sozlesmesi', () => {
  const SRC = readFileSync(join(__dirname, 'confidence-score.service.ts'), 'utf8');

  it('SEN-14: dort metot da tenantId`i ZORUNLU ilk parametre alir (optional DEGIL)', () => {
    for (const m of [
      'computeAddressScore',
      'updateAddressScore',
      'updateAllScoresForDebtor',
      'updateAllScoresForCaseDebtor',
    ]) {
      expect(SRC).toMatch(new RegExp(`async ${m}\\(tenantId: string,`));
      expect(SRC).not.toMatch(new RegExp(`async ${m}\\(tenantId\\?`));
    }
  });

  it('SEN-15: yazma yolunda tenant-scoped OLMAYAN `debtorAddress.update(` kalmadi', () => {
    expect(SRC).not.toMatch(/debtorAddress\.update\(/);
  });

  it('SEN-16: caseDebtor cozumu tenant-scoped (`findUnique` degil `findFirst` + case.tenantId)', () => {
    expect(SRC).not.toMatch(/caseDebtor\.findUnique\(/);
    expect(SRC).toMatch(/caseDebtor\.findFirst\([\s\S]{0,200}?case: \{ tenantId \}/);
  });
});
