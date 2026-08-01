/**
 * CLIENT-OWN-13-I02-R1 — Excel içe aktarım yolunda CLIENT mutasyon yetkisi.
 *
 * `POST /export-import/clients/import` kullanıcı tetiklemeli bir CLIENT create yoludur.
 * I01'de kapı yalnız `POST /clients` route'undaydı; bu yol `ClientService.create`'i
 * `actorUserId ? { userId } : undefined` ile çağırıp politikayı ATLIYORDU. R1 kapıyı servis
 * sınırına taşıdı ve bu çağıranın actor bağlamını ZORUNLU hâle getirdi.
 *
 * AYRI DOSYA: `case.service` ile aynı dosyada import edilince dairesel bağımlılık oluşuyor
 * (sınıf yarım yükleniyor). Bu yüzden CASE yolu `client/__tests__/`de, import yolu burada.
 */

import * as ExcelJS from 'exceljs';
import { ExportImportService } from '../export-import.service';
import { ClientService, type ClientMutationActorContext } from '../../client/client.service';

const SYNTHETIC_TCKN = '40294995552';

const actor = (role: string, tenantId = 't1', userId = 'u1'): ClientMutationActorContext => ({
  userId,
  tenantId,
  role,
});

const buildPrisma = () => {
  const tx = {
    client: {
      create: jest.fn().mockResolvedValue({ id: 'new' }),
      update: jest.fn().mockResolvedValue({ id: 'c1' }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findFirst: jest.fn().mockResolvedValue({ id: 'c1' }),
    },
    clientContact: {
      createMany: jest.fn().mockResolvedValue({}),
      deleteMany: jest.fn().mockResolvedValue({}),
      findMany: jest.fn().mockResolvedValue([]),
      updateMany: jest.fn().mockResolvedValue({}),
    },
    clientAddress: {
      findMany: jest.fn().mockResolvedValue([]),
      createMany: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({}),
      create: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockResolvedValue({}),
    },
  };
  const prisma: any = {
    client: {
      // OR → duplicate taraması (eşleşme yok); diğer → findOne sonucu.
      findFirst: jest.fn().mockImplementation(({ where }: any) =>
        where?.OR ? Promise.resolve(null) : Promise.resolve({ id: 'c1', tenantId: 't1', isActive: true, contacts: [] }),
      ),
      findUnique: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({ id: 'new' }),
      update: jest.fn().mockResolvedValue({ id: 'c1' }),
    },
    clientAddress: { findMany: jest.fn().mockResolvedValue([]) },
    $transaction: jest.fn().mockImplementation(async (cb: any) => (typeof cb === 'function' ? cb(tx) : [])),
  };
  return { prisma, tx };
};

const buildHarness = () => {
  const { prisma, tx } = buildPrisma();
  const audit = { log: jest.fn().mockResolvedValue(undefined), logInTransaction: jest.fn().mockResolvedValue(undefined) };
  const office = { isApproverEligible: jest.fn().mockResolvedValue(false) };
  const clientService = new ClientService(prisma as any, audit as any, office as any);
  const svc: any = Object.create(ExportImportService.prototype);
  svc.clientService = clientService;
  return { svc, prisma, tx, audit, office, clientService };
};

/** `getClientImportTemplate` ile AYNI kolon düzeni: 1=Tur, 2=Ad, 3=Soyad, 4=TCKN. */
const buildExcel = async (rows: (string | null)[][]): Promise<Buffer> => {
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet('Muvekkiller');
  sheet.addRow(['Tur', 'Ad', 'Soyad', 'TCKN']); // başlık satırı (import 2. satırdan başlar)
  for (const r of rows) sheet.addRow(r);
  return Buffer.from(await wb.xlsx.writeBuffer());
};

describe('R1 — Excel içe aktarımında CLIENT mutasyon yetkisi', () => {
  it('VIEWER import → hiçbir müvekkil yazılmaz, satırlar hata olarak raporlanır', async () => {
    const { svc, prisma } = buildHarness();
    const buf = await buildExcel([['PERSON', 'Ahmet', 'Yilmaz', SYNTHETIC_TCKN]]);

    const result = await svc.importClientsFromExcel('t1', buf, actor('VIEWER'));

    expect(result.success).toBe(0);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.client.create).not.toHaveBeenCalled();
  });

  it('yetkili aktör import → başarı', async () => {
    const { svc, prisma } = buildHarness();
    const buf = await buildExcel([['PERSON', 'Ahmet', 'Yilmaz', SYNTHETIC_TCKN]]);

    const result = await svc.importClientsFromExcel('t1', buf, actor('USER'));

    expect(result.success).toBe(1);
    expect(result.errors).toEqual([]);
    expect(prisma.$transaction).toHaveBeenCalled();
  });

  it('actor tenant ≠ hedef tenant → hiçbir satır yazılmaz', async () => {
    const { svc, prisma } = buildHarness();
    const buf = await buildExcel([['PERSON', 'Ahmet', 'Yilmaz', SYNTHETIC_TCKN]]);

    const result = await svc.importClientsFromExcel('t1', buf, actor('ADMIN', 'baska-tenant'));

    expect(result.success).toBe(0);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('reddedilen satırın hata mesajı ham TCKN taşımaz', async () => {
    const { svc } = buildHarness();
    const buf = await buildExcel([['PERSON', 'Ahmet', 'Yilmaz', SYNTHETIC_TCKN]]);

    const result = await svc.importClientsFromExcel('t1', buf, actor('VIEWER'));

    expect(JSON.stringify(result.errors)).not.toContain(SYNTHETIC_TCKN);
  });

  it('birden çok satırda VIEWER → hiçbiri yazılmaz (kısmi yazma YOK)', async () => {
    const { svc, prisma } = buildHarness();
    const buf = await buildExcel([
      ['PERSON', 'Ahmet', 'Yilmaz', SYNTHETIC_TCKN],
      ['PERSON', 'Mehmet', 'Demir', '10000000146'],
    ]);

    const result = await svc.importClientsFromExcel('t1', buf, actor('VIEWER'));

    expect(result.success).toBe(0);
    expect(result.errors.length).toBe(2);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
