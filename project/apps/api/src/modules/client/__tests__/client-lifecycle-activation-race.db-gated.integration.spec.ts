/**
 * LIFECYCLE AKTIVASYON YARISI — REGRESYON (gercek PostgreSQL, sirasi BARIYERLE belirlenen).
 *
 * KUSUR (duzeltme oncesi): `ClientService.update()` kaydi okuduktan sonra `isActive` alanini
 * KOSULSUZ yaziyordu (`isActive: data.isActive !== undefined ? data.isActive : undefined`).
 * Iki istek yarisa girdiginde:
 *   1. Istek A kaydi AKTIF okur (payload'inda `isActive:true` var — amaci baska bir alani degistirmek).
 *   2. Istek B (gercek pasiflestirme) TAMAMLANIR; kayit artik PASIF.
 *   3. Gecikmis istek A yazar → `isActive:true` → pasiflestirme SESSIZCE geri alinir.
 * Bu yolda lifecycle yetki kapisi da CALISMAZ, cunku A'nin okumasina gore "gecis yok" gorunur.
 *
 * Bu suite MOCK KAYIT KULLANMAZ: gercek PostgreSQL'e yazan gercek servis yollari
 * (`ClientService.update()` ve `ClientService.remove()`) kosar. Yarisin sirasi bariyerle
 * belirlenir: `update()`'in `existing` okumasi dondukten SONRA, transaction'dan ONCE rakip
 * islem sonuna kadar isletilir. Sonuc DB'den GERI OKUNUR.
 *
 * Beklenen (duzeltme sonrasi):
 *  - Ilk okumada AKTIF bulunan kayit, arada pasiflestirilirse gecikmis `isActive:true` ile
 *    YENIDEN ETKINLESMEZ (lifecycle alanina hic yazilmaz).
 *  - GERCEK gecis yarista kaybederse CATISMA doner; sessiz basari YOK.
 *  - Ayni degerin tekrar gonderimi KABUL edilir ama lifecycle alanina YAZMAZ.
 *  - Gercek gecislerde yetki (`assertCanManageLifecycle`), kimlik (D-1b checksum) ve kosullu
 *    yazma AYNEN korunur.
 */
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';

import { resolveTestDatabaseUrl } from '../../../../test/test-db-env';
import { ClientService } from '../client.service';

const TEST_DATABASE_URL = resolveTestDatabaseUrl(process.env);
if (process.env.CI && !TEST_DATABASE_URL) {
  throw new Error('CLIENT_LIFECYCLE_RACE_TEST_DATABASE_REQUIRED');
}
const describeWithDatabase = TEST_DATABASE_URL ? describe : describe.skip;

/** Gercek validator ile dogrulanmis GECERLI TCKN (D-1b reaktivasyon kapisi icin). */
const VALID_TCKN = '10000000146';
/** Gercek validator ile dogrulanmis GECERSIZ TCKN (checksum kapisi kanit testi icin). */
const INVALID_TCKN = '12345678901';

describeWithDatabase('LIFECYCLE aktivasyon yarisi (gercek PostgreSQL, bariyer sirali)', () => {
  jest.setTimeout(120_000);

  let prisma: PrismaClient;
  let tenantId: string;
  let userId: string;

  /** Bariyer: `update()`'in `existing` okumasi dondugu anda BIR KEZ calisir. */
  let barrier: null | (() => Promise<void>);
  /** Transaction icindeki `client.updateMany` cagrilarinin `data` argumanlari. */
  let updateManyData: any[];
  /** Lifecycle yetkisi (officeApproval.isApproverEligible) sahte cevabi. */
  let lifecycleEligible: boolean;
  let auditCalls: any[];

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url: TEST_DATABASE_URL! } } });
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  /**
   * Gercek PrismaClient'i saran proxy:
   *  - `client.findFirst`: `update()`'in `existing` okumasi (include.contacts) DONDUKTEN sonra
   *    bariyeri BIR KEZ isletir → yarisin sirasi deterministik olur.
   *  - `$transaction`: icerideki `tx.client.updateMany` argumanlarini kaydeder (lifecycle
   *    alanina gereksiz yazma OLCULUR). `tx` gercek transaction nesnesidir.
   */
  function buildPrismaProxy(): any {
    const clientDelegate: any = new Proxy((prisma as any).client, {
      get(target, prop, receiver) {
        const value = Reflect.get(target, prop, receiver);
        if (prop === 'findFirst' && typeof value === 'function') {
          return async (...args: any[]) => {
            const result = await value.apply(target, args);
            if (barrier && args[0] && args[0].include && args[0].include.contacts) {
              const run = barrier;
              barrier = null; // tek seferlik: re-entrant servis cagrilari tetiklemez
              await run();
            }
            return result;
          };
        }
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });

    function wrapTx(tx: any): any {
      return new Proxy(tx, {
        get(target, prop, receiver) {
          if (prop === 'client') {
            const txClient = Reflect.get(target, prop, receiver);
            return new Proxy(txClient, {
              get(t2, p2, r2) {
                const v2 = Reflect.get(t2, p2, r2);
                if (p2 === 'updateMany' && typeof v2 === 'function') {
                  return (...args: any[]) => {
                    updateManyData.push(args[0] && args[0].data);
                    return v2.apply(t2, args);
                  };
                }
                return typeof v2 === 'function' ? v2.bind(t2) : v2;
              },
            });
          }
          const value = Reflect.get(target, prop, receiver);
          return typeof value === 'function' ? value.bind(target) : value;
        },
      });
    }

    return new Proxy(prisma as any, {
      get(target, prop, receiver) {
        if (prop === 'client') return clientDelegate;
        if (prop === '$transaction') {
          return (arg: any, ...rest: any[]) =>
            typeof arg === 'function'
              ? (target as any).$transaction(async (tx: any) => arg(wrapTx(tx)), ...rest)
              : (target as any).$transaction(arg, ...rest);
        }
        const value = Reflect.get(target, prop, receiver);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
  }

  function buildService(): ClientService {
    const audit = {
      log: jest.fn(async (input: any) => {
        auditCalls.push(input);
      }),
      logInTransaction: jest.fn(async (_tx: any, input: any) => {
        auditCalls.push(input);
      }),
    };
    const officeApproval = {
      isApproverEligible: jest.fn(async () => lifecycleEligible),
    };
    // Nest DI'a gerek yok: gercek sinif, gercek metotlar, gercek DB.
    return new ClientService(buildPrismaProxy(), audit as any, officeApproval as any);
  }

  beforeEach(async () => {
    barrier = null;
    updateManyData = [];
    auditCalls = [];
    lifecycleEligible = true;
    const sfx = randomUUID().slice(0, 8);

    const tenant = await prisma.tenant.create({
      data: { name: `Race ${sfx}`, slug: `lifecycle-race-${sfx}` },
      select: { id: true },
    });
    tenantId = tenant.id;

    const user = await prisma.user.create({
      data: {
        tenantId,
        email: `race-${sfx}@test.invalid`,
        passwordHash: 'x'.repeat(20),
        name: 'Race',
        surname: 'Probe',
        role: 'ADMIN',
      },
      select: { id: true },
    });
    userId = user.id;
  });

  afterEach(async () => {
    await prisma.clientContact.deleteMany({ where: { client: { tenantId } } }).catch(() => undefined);
    await prisma.client.deleteMany({ where: { tenantId } }).catch(() => undefined);
    await prisma.user.deleteMany({ where: { tenantId } }).catch(() => undefined);
    await prisma.tenant.delete({ where: { id: tenantId } }).catch(() => undefined);
  });

  async function createClient(overrides: any = {}): Promise<string> {
    const row = await prisma.client.create({
      data: {
        tenantId,
        type: 'INDIVIDUAL',
        firstName: 'Yaris',
        lastName: 'Probe',
        displayName: 'Yaris Probe',
        name: 'Yaris Probe',
        tckn: VALID_TCKN,
        isActive: true,
        ...overrides,
      },
      select: { id: true },
    });
    return row.id;
  }

  const actor = () => ({ userId, tenantId, role: 'ADMIN' as const });

  it('YARIS: aktif okunan kayit arada pasiflestirilirse gecikmis isActive:true onu YENIDEN ETKINLESTIRMEZ', async () => {
    const id = await createClient();
    const service = buildService();
    const remover = buildService();

    // Bariyer: update() kaydi AKTIF okuduktan sonra gercek pasiflestirme SONUNA KADAR isler.
    barrier = async () => {
      await remover.remove(id, tenantId, { userId, tenantId } as any);
      const mid = await prisma.client.findUniqueOrThrow({ where: { id }, select: { isActive: true } });
      expect(mid.isActive).toBe(false); // yaris gercekten kuruldu
      // Olcum yalniz GECIKMIS update'in yazmalarini kapsasin (remove()'un kendi yazmasi haric).
      updateManyData = [];
    };

    // Gecikmis istek: amaci telefonu guncellemek; payload'inda okundugu andaki `isActive` de var.
    await service.update(id, tenantId, { phone: '5551112233', isActive: true }, actor() as any);

    const after = await prisma.client.findUniqueOrThrow({
      where: { id },
      select: { isActive: true, phone: true },
    });
    expect(after.isActive).toBe(false); // pasiflestirme KORUNDU
    expect(after.phone).toBe('5551112233'); // gecerli istemci davranisi KORUNDU

    // Lifecycle alanina hic yazilmadi (gereksiz yazma YOK).
    expect(updateManyData.length).toBeGreaterThan(0);
    for (const data of updateManyData) {
      expect(data.isActive).toBeUndefined();
    }
  });

  it('YARIS (GERCEK GECIS): pasif okunan kayit arada aktiflestirilirse gecikmis update CATISMA doner', async () => {
    const id = await createClient({ isActive: false });
    const service = buildService();
    const activator = buildService();

    barrier = async () => {
      // Rakip islem de GERCEK servis yolu: pasif → aktif gecisi.
      await activator.update(id, tenantId, { isActive: true }, actor() as any);
      const mid = await prisma.client.findUniqueOrThrow({ where: { id }, select: { isActive: true } });
      expect(mid.isActive).toBe(true);
    };

    // Gecikmis istek pasif duruma gore karar vermisti; kosullu yazma onu YAKALAR.
    await expect(
      service.update(id, tenantId, { isActive: true, phone: '5559998877' }, actor() as any),
    ).rejects.toMatchObject({ response: { code: 'CLIENT_STATE_CHANGED' } });

    const after = await prisma.client.findUniqueOrThrow({
      where: { id },
      select: { isActive: true, phone: true },
    });
    expect(after.isActive).toBe(true);
    expect(after.phone).toBeNull(); // reddedilen istek HICBIR alani yazmadi
  });

  it('AYNI DEGER: isActive tekrar gonderimi KABUL edilir ama lifecycle alanina YAZMAZ', async () => {
    const id = await createClient();
    const service = buildService();

    await service.update(id, tenantId, { isActive: true, phone: '5551110000' }, actor() as any);

    const after = await prisma.client.findUniqueOrThrow({
      where: { id },
      select: { isActive: true, phone: true },
    });
    expect(after.isActive).toBe(true);
    expect(after.phone).toBe('5551110000');
    expect(updateManyData.length).toBeGreaterThan(0);
    for (const data of updateManyData) {
      expect(data.isActive).toBeUndefined();
    }
    expect(auditCalls.some((c) => c && c.action === 'CLIENT_UPDATE')).toBe(true);
  });

  it('GERCEK GECIS: yetkisiz aktor reddedilir ve HICBIR alan yazilmaz', async () => {
    const id = await createClient({ isActive: false });
    lifecycleEligible = false;
    const service = buildService();

    await expect(
      service.update(id, tenantId, { isActive: true, phone: '5554443322' }, actor() as any),
    ).rejects.toThrow(/yetki yok/i);

    const after = await prisma.client.findUniqueOrThrow({
      where: { id },
      select: { isActive: true, phone: true },
    });
    expect(after.isActive).toBe(false);
    expect(after.phone).toBeNull();
    expect(updateManyData).toHaveLength(0);
  });

  it('GERCEK GECIS: reaktivasyonda D-1b kimlik checksum kapisi KORUNUR', async () => {
    const id = await createClient({ isActive: false, tckn: INVALID_TCKN });
    const service = buildService();

    await expect(
      service.update(id, tenantId, { isActive: true }, actor() as any),
    ).rejects.toMatchObject({
      response: { reasonCode: 'CLIENT_IDENTITY_CHECKSUM_INVALID', offendingFields: ['tckn'] },
    });

    const after = await prisma.client.findUniqueOrThrow({ where: { id }, select: { isActive: true } });
    expect(after.isActive).toBe(false);
    expect(updateManyData).toHaveLength(0);
  });

  it('GERCEK GECIS (yarissiz): yetkili aktorun pasiflestirmesi TAMAMLANIR', async () => {
    const id = await createClient();
    const service = buildService();

    await service.update(id, tenantId, { isActive: false }, actor() as any);

    const after = await prisma.client.findUniqueOrThrow({ where: { id }, select: { isActive: true } });
    expect(after.isActive).toBe(false);
    expect(updateManyData.some((d) => d && d.isActive === false)).toBe(true);
  });
});
