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
 * DENETİM KAYDI (gerçek `AuditService.logInTransaction`): banka yazması ile denetim satırı AYNI işlemdedir. Bu suite
 * satırın gerçekten yazıldığını, yalnız ALAN ADLARI taşıdığını (IBAN / banka adı / şube / hesap sahibi YOK), reddedilen
 * istekte HİÇ satır olmadığını ve denetim yazılamazsa mutasyonun (varsayılan hesap temizliği dahil) GERİ ALINDIĞINI
 * gerçek PostgreSQL'de doğrular.
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
  // GERÇEK AuditService: `logInTransaction` tx üzerinden gerçek `AuditLog` satırı yazar (log() bu yollarda kullanılmaz).
  const audit = new AuditService(prisma as unknown as PrismaService);
  const serviceA = new OfficeService(clientA as unknown as PrismaService, audit);
  const serviceB = new OfficeService(clientB as unknown as PrismaService, audit);
  const ATTEMPTS = 10;
  let tenantId = '';
  let officeId = '';

  const iban = (n: number) => `TR00000000000000000000${String(n).padStart(4, '0')}`;
  const defaults = async () => (await prisma.officeBankAccount.findMany({ where: { officeId, isDefault: true } })).length;
  const total = async () => prisma.officeBankAccount.count({ where: { officeId } });
  const reset = async () => {
    await prisma.officeBankAccount.deleteMany({ where: { officeId } });
    await prisma.auditLog.deleteMany({ where: { tenantId } });
  };
  const bankAudits = () =>
    prisma.auditLog.findMany({ where: { tenantId, entityType: 'OFFICE_BANK_ACCOUNT' }, orderBy: { createdAt: 'asc' } });

  beforeAll(async () => {
    await prisma.tenant.deleteMany({ where: { slug: TENANT } });
    const tenant = await prisma.tenant.create({ data: { name: 'Banka Yarış Tenant', slug: TENANT } });
    tenantId = tenant.id;
    const office = await prisma.office.create({ data: { tenantId, name: 'Banka Yarış Büro' } });
    officeId = office.id;
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { tenantId } });
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
      // her başarılı yazma TAM BİR denetim satırı bırakır (kayıp / mükerrer yok)
      expect({ deneme: i, audit: (await bankAudits()).length }).toEqual({ deneme: i, audit: 2 });
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

  describe('denetim kaydı (gerçek AuditLog satırı)', () => {
    const SENSITIVE = ['TR000000000000000000000001', 'TR000000000000000000000002', 'Gizli Banka', 'Gizli Şube', 'Gizli Sahip', 'Yeni Gizli Ad'];

    it('ekle / güncelle / sil → CREATE / UPDATE / DELETE satırları; metadata yalnız alan adları; hassas değer satırda HİÇ yok', async () => {
      const actor = { userId: 'obk-actor-1' };
      const created = await serviceA.addBankAccount(tenantId, {
        bankName: 'Gizli Banka', branchName: 'Gizli Şube', iban: 'TR000000000000000000000001', accountName: 'Gizli Sahip', isDefault: true,
      }, actor);
      const id = (created as { id: string }).id;
      await serviceA.updateBankAccount(tenantId, id, { bankName: 'Yeni Gizli Ad', iban: 'TR000000000000000000000002' }, actor);
      await serviceA.deleteBankAccount(tenantId, id, actor);

      const rows = await bankAudits();
      expect(rows.map((r) => [r.action, r.entityId, r.userId, r.actorType])).toEqual([
        ['CREATE', id, 'obk-actor-1', 'USER'],
        ['UPDATE', id, 'obk-actor-1', 'USER'],
        ['DELETE', id, 'obk-actor-1', 'USER'],
      ]);
      expect(rows[0].metadata).toEqual({ changedFields: ['bankName', 'branchName', 'iban', 'accountName', 'isDefault'] });
      expect(rows[1].metadata).toEqual({ changedFields: ['bankName', 'iban'] });
      expect(rows[2].metadata).toBeNull();
      // ham değer ne metadata'da ne eski/yeni değer / açıklama kolonlarında
      for (const r of rows) {
        expect([r.oldValues, r.newValues, r.description]).toEqual([null, null, null]);
        for (const v of SENSITIVE) expect(JSON.stringify(r)).not.toContain(v);
      }
    });

    it('gerçek değişiklik yoksa (aynı değer) denetim satırı YAZILMAZ', async () => {
      const acc = await prisma.officeBankAccount.create({ data: { officeId, bankName: 'Ziraat', iban: iban(5), isDefault: false } });
      await serviceA.updateBankAccount(tenantId, acc.id, { bankName: 'Ziraat', isDefault: false });
      expect(await bankAudits()).toHaveLength(0);
    });

    it('reddedilen istek (geçersiz IBAN, başka bürodaki hesap) → HİÇ denetim satırı, HİÇ yazma', async () => {
      const otherTenant = await prisma.tenant.create({ data: { name: 'Diğer 2', slug: 'obk-race-other2' } });
      try {
        const otherOffice = await prisma.office.create({ data: { tenantId: otherTenant.id, name: 'Diğer Büro 2' } });
        const victim = await prisma.officeBankAccount.create({ data: { officeId: otherOffice.id, bankName: 'Kurban', iban: iban(7), isDefault: true } });
        await expect(serviceA.addBankAccount(tenantId, { bankName: 'B', iban: '' })).rejects.toThrow();
        await expect(serviceA.updateBankAccount(tenantId, victim.id, { isDefault: false })).rejects.toThrow('Banka hesabı bulunamadı');
        await expect(serviceA.deleteBankAccount(tenantId, victim.id)).rejects.toThrow('Banka hesabı bulunamadı');
        expect(await prisma.auditLog.count({ where: { tenantId: { in: [tenantId, otherTenant.id] }, entityType: 'OFFICE_BANK_ACCOUNT' } })).toBe(0);
        expect(await total()).toBe(0);
        const after = await prisma.officeBankAccount.findUniqueOrThrow({ where: { id: victim.id } });
        expect(after).toMatchObject({ officeId: otherOffice.id, bankName: 'Kurban', isDefault: true });
      } finally {
        await prisma.tenant.deleteMany({ where: { slug: 'obk-race-other2' } });
      }
    });

    it('denetim yazılamazsa mutasyon GERİ ALINIR: ekleme yazılmaz; varsayılan temizliği geri alınır; silme geri alınır', async () => {
      const failing = new AuditService(prisma as unknown as PrismaService);
      jest.spyOn(failing, 'logInTransaction').mockRejectedValue(new Error('audit down'));
      const svc = new OfficeService(clientA as unknown as PrismaService, failing);

      // ekleme: satır YAZILMAZ
      await expect(svc.addBankAccount(tenantId, { bankName: 'B', iban: iban(1), isDefault: true })).rejects.toThrow('audit down');
      expect(await total()).toBe(0);

      // güncelleme (varsayılan yap): diğer hesabın varsayılanı KALKMAZ, hedef varsayılan OLMAZ
      const cur = await prisma.officeBankAccount.create({ data: { officeId, bankName: 'Mevcut', iban: iban(9), isDefault: true } });
      const other = await prisma.officeBankAccount.create({ data: { officeId, bankName: 'Diğer', iban: iban(8), isDefault: false } });
      await expect(svc.updateBankAccount(tenantId, other.id, { isDefault: true })).rejects.toThrow('audit down');
      expect((await prisma.officeBankAccount.findUniqueOrThrow({ where: { id: cur.id } })).isDefault).toBe(true);
      expect((await prisma.officeBankAccount.findUniqueOrThrow({ where: { id: other.id } })).isDefault).toBe(false);

      // silme: satır DURUR
      await expect(svc.deleteBankAccount(tenantId, other.id)).rejects.toThrow('audit down');
      expect(await total()).toBe(2);
      expect(await bankAudits()).toHaveLength(0);
    });
  });
});
