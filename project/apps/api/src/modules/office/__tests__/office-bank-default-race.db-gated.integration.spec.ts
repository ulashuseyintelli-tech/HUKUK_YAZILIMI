import { PrismaClient } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { describeDb } from '../../../../test/describe-db';
import { AuditService } from '../../audit/audit.service';
import { OfficeService } from '../office.service';

/**
 * OFFICE-BANK-ACCOUNT — varsayılan hesap yarışı (GERÇEK PostgreSQL).
 *
 * NEDEN GERÇEK DB: kanıtlanan şey KİLİT DAVRANIŞIDIR. Mock'lu bir test iki eşzamanlı işlemin birbirinin
 * "diğerlerini kaldır" ifadesini görüp görmediğini KANITLAYAMAZ. Ölçülen (2026-10-02, disposable PG16): ürün yolunda
 * iki eşzamanlı ekleme 10/10 (boş büro) ve 9/10 (bir varsayılanı olan büro), iki eşzamanlı güncelleme 10/10 İKİ varsayılan
 * bıraktı; düz `$transaction` (READ COMMITTED) da 10/10 AÇIK; büro satırı `FOR UPDATE` kilidi 0/10.
 *
 * Bu suite İKİ AYRI bağlantıdan (iki PrismaClient) eşzamanlı çağırır ve her denemede "tam bir varsayılan" invariantını
 * doğrular. Kilit kaldırılırsa (mutant) bu testler DÜŞER — bkz. kanıt kaydı.
 *
 * SALT-KENDİ-FIXTURE'I: yalnız `obk-race-*` tenant'ı yazılır/silinir; persistent dev DB'ye karşı koşmaz
 * (`describeDb` + `TEST_DATABASE_URL` fail-safe'i).
 */
describeDb('OFFICE banka hesabı — varsayılan hesap yarışı (gercek Postgres)', () => {
  jest.setTimeout(120_000);

  const TENANT = 'obk-race-tenant';
  const prisma = new PrismaClient();
  const clientA = new PrismaClient();
  const clientB = new PrismaClient();
  const audit = { log: jest.fn().mockResolvedValue(undefined) } as unknown as AuditService;
  const serviceA = new OfficeService(clientA as unknown as PrismaService, audit);
  const serviceB = new OfficeService(clientB as unknown as PrismaService, audit);
  const ATTEMPTS = 10;
  let tenantId = '';
  let officeId = '';

  const iban = (n: number) => `TR00000000000000000000${String(n).padStart(4, '0')}`;
  const defaults = async () => (await prisma.officeBankAccount.findMany({ where: { officeId, isDefault: true } })).length;
  const total = async () => prisma.officeBankAccount.count({ where: { officeId } });
  const reset = async () => { await prisma.officeBankAccount.deleteMany({ where: { officeId } }); };

  beforeAll(async () => {
    await prisma.tenant.deleteMany({ where: { slug: TENANT } });
    const tenant = await prisma.tenant.create({ data: { name: 'Banka Yarış Tenant', slug: TENANT } });
    tenantId = tenant.id;
    const office = await prisma.office.create({ data: { tenantId, name: 'Banka Yarış Büro' } });
    officeId = office.id;
  });

  afterAll(async () => {
    await prisma.tenant.deleteMany({ where: { slug: TENANT } });
    await Promise.all([prisma.$disconnect(), clientA.$disconnect(), clientB.$disconnect()]);
  });

  beforeEach(reset);

  it(`boş büroda iki eşzamanlı "varsayılan ekle" → her denemede TEK varsayılan (${ATTEMPTS}/${ATTEMPTS})`, async () => {
    for (let i = 0; i < ATTEMPTS; i += 1) {
      await reset();
      await Promise.all([
        serviceA.addBankAccount(tenantId, { bankName: 'A', iban: iban(1), isDefault: true }),
        serviceB.addBankAccount(tenantId, { bankName: 'B', iban: iban(2), isDefault: true }),
      ]);
      expect({ deneme: i, toplam: await total(), varsayilan: await defaults() }).toEqual({ deneme: i, toplam: 2, varsayilan: 1 });
    }
  });

  it(`bir varsayılanı olan büroda iki eşzamanlı "varsayılan ekle" → TEK varsayılan (${ATTEMPTS}/${ATTEMPTS})`, async () => {
    for (let i = 0; i < ATTEMPTS; i += 1) {
      await reset();
      await prisma.officeBankAccount.create({ data: { officeId, bankName: 'Mevcut', iban: iban(9), isDefault: true } });
      await Promise.all([
        serviceA.addBankAccount(tenantId, { bankName: 'A', iban: iban(1), isDefault: true }),
        serviceB.addBankAccount(tenantId, { bankName: 'B', iban: iban(2), isDefault: true }),
      ]);
      expect({ deneme: i, toplam: await total(), varsayilan: await defaults() }).toEqual({ deneme: i, toplam: 3, varsayilan: 1 });
    }
  });

  it(`iki ayrı hesap üzerinde iki eşzamanlı "varsayılan yap" (PUT) → TEK varsayılan (${ATTEMPTS}/${ATTEMPTS})`, async () => {
    for (let i = 0; i < ATTEMPTS; i += 1) {
      await reset();
      const a = await prisma.officeBankAccount.create({ data: { officeId, bankName: 'A', iban: iban(1), isDefault: false } });
      const b = await prisma.officeBankAccount.create({ data: { officeId, bankName: 'B', iban: iban(2), isDefault: false } });
      await Promise.all([
        serviceA.updateBankAccount(tenantId, a.id, { isDefault: true }),
        serviceB.updateBankAccount(tenantId, b.id, { isDefault: true }),
      ]);
      expect({ deneme: i, varsayilan: await defaults() }).toEqual({ deneme: i, varsayilan: 1 });
    }
  });

  it(`eşzamanlı "ekle (varsayılan)" + "başka hesabı varsayılan yap" → TEK varsayılan (${ATTEMPTS}/${ATTEMPTS})`, async () => {
    for (let i = 0; i < ATTEMPTS; i += 1) {
      await reset();
      const existing = await prisma.officeBankAccount.create({ data: { officeId, bankName: 'Mevcut', iban: iban(9), isDefault: false } });
      await Promise.all([
        serviceA.addBankAccount(tenantId, { bankName: 'Yeni', iban: iban(1), isDefault: true }),
        serviceB.updateBankAccount(tenantId, existing.id, { isDefault: true }),
      ]);
      expect({ deneme: i, toplam: await total(), varsayilan: await defaults() }).toEqual({ deneme: i, toplam: 2, varsayilan: 1 });
    }
  });

  it('düzenle = mevcut hesabı günceller: değişmeyen alanlar (şube, hesap sahibi, IBAN) KORUNUR, hesap sayısı değişmez', async () => {
    const acc = await prisma.officeBankAccount.create({
      data: { officeId, bankName: 'Ziraat', branchName: 'Merkez', accountName: 'Büro Hesabı', iban: iban(5), isDefault: false },
    });
    await serviceA.updateBankAccount(tenantId, acc.id, { bankName: 'Ziraat Bankası' });
    const after = await prisma.officeBankAccount.findUniqueOrThrow({ where: { id: acc.id } });
    expect(after).toMatchObject({ bankName: 'Ziraat Bankası', branchName: 'Merkez', accountName: 'Büro Hesabı', iban: iban(5), isDefault: false });
    expect(await total()).toBe(1);
  });

  it('ilk hesap otomatik varsayılan OLMAZ (yeni politika yok): isDefault gönderilmeyen ilk hesap varsayılan değildir', async () => {
    await serviceA.addBankAccount(tenantId, { bankName: 'İlk', iban: iban(1) });
    expect(await defaults()).toBe(0);
  });

  it('kiracı sınırı: başka bürodaki hesap güncellenemez / silinemez (404) ve DEĞİŞMEZ', async () => {
    const otherTenant = await prisma.tenant.create({ data: { name: 'Diğer', slug: 'obk-race-other' } });
    try {
      const otherOffice = await prisma.office.create({ data: { tenantId: otherTenant.id, name: 'Diğer Büro' } });
      const victim = await prisma.officeBankAccount.create({
        data: { officeId: otherOffice.id, bankName: 'Kurban', iban: iban(7), isDefault: true },
      });
      await expect(serviceA.updateBankAccount(tenantId, victim.id, { isDefault: false, bankName: 'Ele geçirildi' })).rejects.toThrow('Banka hesabı bulunamadı');
      await expect(serviceA.deleteBankAccount(tenantId, victim.id)).rejects.toThrow('Banka hesabı bulunamadı');
      const after = await prisma.officeBankAccount.findUniqueOrThrow({ where: { id: victim.id } });
      expect(after).toMatchObject({ officeId: otherOffice.id, bankName: 'Kurban', isDefault: true });
    } finally {
      await prisma.tenant.deleteMany({ where: { slug: 'obk-race-other' } });
    }
  });
});
