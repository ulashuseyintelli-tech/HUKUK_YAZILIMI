import { PrismaClient, StaffType } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { describeDb } from '../../../../../test/describe-db';
import { OfficeWorkPoolPrismaRepository } from '../office-work-pool.repository';
import { OfficeWorkPoolResolverService } from '../office-work-pool-resolver.service';
import { runOfficeWorkPoolParitySweep } from '../office-work-pool-parity';

/**
 * OFFICE-WR01-B02 AŞAMA 3 — GERÇEK POSTGRES PARİTE HARNESS'İ.
 *
 * SALT-OKUNUR SÖZLEŞME: bu suite YALNIZ kendi fixture'ını yazar/siler. Persistent development
 * veritabanına karşı KOŞMAZ — `describeDb` gate'i `DATABASE_URL` yoksa tüm suite'i atlar ve
 * CI/lokal koşum disposable Postgres'e (`TEST_DATABASE_URL`) yönlendirilir (AGENTS.md §10).
 *
 * NEYİ KANITLAR (saf testlerin kanıtlayamadıkları):
 *  1) predikat sınırlarının gerçek `TIMESTAMP(3)` kolonlarında da aynı davranması,
 *  2) tenant izolasyonunun ORM sorgusu düzeyinde de tutması,
 *  3) bir çözümlemenin gerçekten TAM 2 SELECT ürettiği (ölçülmüş sayı, tahmin değil),
 *  4) pasif kullanıcının üyeliğinin resolver tarafından SÜZÜLMEDİĞİ (§7.7),
 *  5) legacy düz diziler ile resolver çıktısının `asOf = now` düzleminde parite tuttuğu.
 *
 * GERÇEK-VERİ PARİTESİ: son describe bloğu YALNIZ `OFFICE_WR01_B02_REAL_DATA_PARITY=1` ile
 * çalışır ve persistent DB'nin DISPOSABLE KLONUNA karşı koşulmak üzere tasarlanmıştır. CI'da
 * bu değişken YOKTUR; oradaki ölçüm sentetik fixture'dır ve "real-data parity" DİYE
 * RAPORLANAMAZ.
 */
describeDb('OFFICE-WR01-B02 A3 — effective-dated havuz resolver (gercek Postgres)', () => {
  const prisma = new PrismaClient();
  const repository = new OfficeWorkPoolPrismaRepository(prisma as unknown as PrismaService);
  const resolver = new OfficeWorkPoolResolverService(repository);

  // Suite'e özgü, çakışmayan sabitler.
  const T1 = 'owp-tenant-1';
  const T2 = 'owp-tenant-2';
  const T_NO_ANCHOR = 'owp-tenant-no-anchor';
  const L1 = 'owp-lawyer-manager-1';
  const L2 = 'owp-lawyer-founder-2';
  const L3 = 'owp-lawyer-passive-3';

  /** Migration'ın ürettiği cutover anına karşılık gelen sabit sınır. */
  const CUTOVER = new Date('2026-08-17T12:00:00.000Z');
  const AFTER_CUTOVER = new Date('2026-08-18T12:00:00.000Z');

  const TENANTS = [T1, T2, T_NO_ANCHOR];

  const cleanup = async () => {
    // Sıra bağlayıcıdır: membership -> Lawyer FK'si Restrict'tir, önce üyelik düşmelidir.
    await prisma.officeWorkPoolMembership.deleteMany({ where: { tenantId: { in: TENANTS } } });
    await prisma.officeWorkPoolEpoch.deleteMany({ where: { tenantId: { in: TENANTS } } });
    await prisma.lawyer.deleteMany({ where: { tenantId: { in: TENANTS } } });
    await prisma.office.deleteMany({ where: { tenantId: { in: TENANTS } } });
    await prisma.tenant.deleteMany({ where: { id: { in: TENANTS } } });
  };

  beforeAll(async () => {
    await cleanup();

    await prisma.tenant.createMany({
      data: TENANTS.map((id) => ({ id, name: `OWP ${id}`, slug: id })),
    });

    await prisma.office.createMany({
      data: [
        {
          tenantId: T1,
          name: 'OWP Buro 1',
          opStaffTypes: [StaffType.SEKRETER, StaffType.MUHASEBE],
          escalationManagerLawyerIds: [L1],
          escalationFounderLawyerIds: [L2],
        },
        {
          tenantId: T2,
          name: 'OWP Buro 2',
          opStaffTypes: [],
          escalationManagerLawyerIds: [],
          escalationFounderLawyerIds: [],
        },
        {
          tenantId: T_NO_ANCHOR,
          name: 'OWP Buro anchorsiz',
          opStaffTypes: [StaffType.ARSIV],
          escalationManagerLawyerIds: [],
          escalationFounderLawyerIds: [],
        },
      ],
    });

    await prisma.lawyer.createMany({
      data: [
        { id: L1, tenantId: T1, name: 'Yonetici', surname: 'Avukat' },
        { id: L2, tenantId: T1, name: 'Kurucu', surname: 'Avukat' },
        // §7.7 / §2.E kanıtı: PASİF avukat. Üyeliği KAPANMAZ ve resolver onu SÜZMEZ.
        { id: L3, tenantId: T1, name: 'Pasif', surname: 'Avukat', isActive: false },
      ],
    });

    // Anchor seed — migration ADIM 5 semantiği: her havuz için TAM BİR anchor,
    // knownFrom = cutoverAt. T_NO_ANCHOR BİLEREK anchor'sız bırakılır.
    await prisma.officeWorkPoolEpoch.createMany({
      data: [T1, T2].flatMap((tenantId) =>
        (['OP_STAFF_TYPE', 'ESCALATION_MANAGER', 'ESCALATION_FOUNDER'] as const).map(
          (poolKind) => ({
            tenantId,
            poolKind,
            knownFrom: CUTOVER,
            provenance: 'LEGACY_CUTOVER_IMPORT' as const,
          }),
        ),
      ),
    });

    // Backfill — migration ADIM 6 semantiği: validFrom = cutoverAt, açık uçlu.
    await prisma.officeWorkPoolMembership.createMany({
      data: [
        {
          tenantId: T1,
          poolKind: 'OP_STAFF_TYPE',
          memberStaffType: StaffType.SEKRETER,
          validFrom: CUTOVER,
          provenance: 'LEGACY_CUTOVER_IMPORT',
        },
        {
          tenantId: T1,
          poolKind: 'OP_STAFF_TYPE',
          memberStaffType: StaffType.MUHASEBE,
          validFrom: CUTOVER,
          provenance: 'LEGACY_CUTOVER_IMPORT',
        },
        {
          tenantId: T1,
          poolKind: 'ESCALATION_MANAGER',
          memberLawyerId: L1,
          validFrom: CUTOVER,
          provenance: 'LEGACY_CUTOVER_IMPORT',
        },
        {
          tenantId: T1,
          poolKind: 'ESCALATION_FOUNDER',
          memberLawyerId: L2,
          validFrom: CUTOVER,
          provenance: 'LEGACY_CUTOVER_IMPORT',
        },
      ],
    });
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  describe('UNKNOWN / RESOLVED ayrimi gercek satirlarda', () => {
    it('cutover ONCESI -> UNKNOWN / BEFORE_KNOWN_FROM', async () => {
      const resolution = await resolver.resolveLawyerPool(
        'ESCALATION_MANAGER',
        new Date(CUTOVER.getTime() - 1),
        T1,
      );
      expect(resolution).toEqual({ status: 'UNKNOWN', reason: 'BEFORE_KNOWN_FROM', members: [] });
    });

    it('cutover ANINDA -> RESOLVED (knownFrom ve validFrom INCLUSIVE)', async () => {
      const resolution = await resolver.resolveLawyerPool('ESCALATION_MANAGER', CUTOVER, T1);
      expect(resolution).toEqual({ status: 'RESOLVED', members: [L1] });
    });

    it('anchor YOK -> UNKNOWN / ANCHOR_MISSING (bos havuzla KARISTIRILMAZ)', async () => {
      const resolution = await resolver.resolveStaffTypePool(
        'OP_STAFF_TYPE',
        AFTER_CUTOVER,
        T_NO_ANCHOR,
      );
      expect(resolution).toEqual({ status: 'UNKNOWN', reason: 'ANCHOR_MISSING', members: [] });
    });

    it('anchor VAR, uye YOK -> RESOLVED / [] (bilinen bos havuz)', async () => {
      const resolution = await resolver.resolveStaffTypePool('OP_STAFF_TYPE', AFTER_CUTOVER, T2);
      expect(resolution).toEqual({ status: 'RESOLVED', members: [] });
    });
  });

  describe('tenant izolasyonu (§7.5)', () => {
    it('T1 satirlari T2 sonucuna SIZMAZ', async () => {
      const manager = await resolver.resolveLawyerPool('ESCALATION_MANAGER', AFTER_CUTOVER, T2);
      const staff = await resolver.resolveStaffTypePool('OP_STAFF_TYPE', AFTER_CUTOVER, T2);
      expect(manager).toEqual({ status: 'RESOLVED', members: [] });
      expect(staff).toEqual({ status: 'RESOLVED', members: [] });
    });
  });

  describe('pasif kullanici sinirinin GERCEK veri uzerinde kaniti (§7.7, §2.E)', () => {
    it('pasif avukatin uyeligi resolver tarafindan SUZULMEZ', async () => {
      await prisma.officeWorkPoolMembership.create({
        data: {
          tenantId: T1,
          poolKind: 'ESCALATION_MANAGER',
          memberLawyerId: L3,
          validFrom: CUTOVER,
          provenance: 'ADMIN_DECLARED',
        },
      });

      try {
        const passive = await prisma.lawyer.findUniqueOrThrow({ where: { id: L3 } });
        expect(passive.isActive).toBe(false);

        const resolution = await resolver.resolveLawyerPool(
          'ESCALATION_MANAGER',
          AFTER_CUTOVER,
          T1,
        );
        // Uyelik (effective-dated) ile kisinin aktifligi (current-state) AYRI eksenlerdir.
        expect(resolution).toEqual({ status: 'RESOLVED', members: [L1, L3].sort() });
      } finally {
        await prisma.officeWorkPoolMembership.deleteMany({
          where: { tenantId: T1, memberLawyerId: L3 },
        });
      }
    });
  });

  describe('sorgu maliyeti — OLCULMUS deger', () => {
    it('bir cozumleme TAM OLARAK 2 SELECT uretir (anchor + membership dilimi)', async () => {
      const counted = new PrismaClient({ log: [{ level: 'query', emit: 'event' }] });
      const statements: string[] = [];
      counted.$on('query', (event) => statements.push(event.query));

      try {
        const countedResolver = new OfficeWorkPoolResolverService(
          new OfficeWorkPoolPrismaRepository(counted as unknown as PrismaService),
        );
        await countedResolver.resolveLawyerPool('ESCALATION_MANAGER', AFTER_CUTOVER, T1);
      } finally {
        await counted.$disconnect();
      }

      const selects = statements.filter((sql) => /^\s*SELECT/i.test(sql));
      // Sayi TAHMIN degil OLCUMDUR; buyurse (N+1 / tekrar okuma) bu assertion kirilir.
      expect(selects).toHaveLength(2);
      expect(statements).toHaveLength(selects.length);
    });
  });

  describe('parite: legacy duz diziler vs resolver (sirasiz kume esitligi)', () => {
    it('fixture tenant lari icin parite PASS uretir', async () => {
      const report = await runOfficeWorkPoolParitySweep(
        { legacy: repository, resolver },
        { asOf: AFTER_CUTOVER, source: 'SYNTHETIC_FIXTURE', tenantIds: [T1, T2] },
      );

      expect(report.comparedCount).toBe(6);
      expect(report.mismatchCount).toBe(0);
      expect(report.anchorMissingCount).toBe(0);
      expect(report.verdict).toBe('PASS');
    });

    it('anchor siz tenant PASS uretmez; ayri anomali olarak raporlanir', async () => {
      const report = await runOfficeWorkPoolParitySweep(
        { legacy: repository, resolver },
        { asOf: AFTER_CUTOVER, source: 'SYNTHETIC_FIXTURE', tenantIds: [T_NO_ANCHOR] },
      );

      expect(report.anchorMissingCount).toBe(3);
      expect(report.comparedCount).toBe(0);
      expect(report.verdict).toBe('NOT_MEASURED');
      // Legacy'de dolu olan havuz "esit" sayilmamalidir.
      const staffPool = report.comparisons.find((c) => c.poolKind === 'OP_STAFF_TYPE');
      expect(staffPool?.status).toBe('ANCHOR_MISSING');
      expect(staffPool?.legacyCount).toBe(1);
    });

    it('cutover ONCESI duzlem parite kapsami DISIDIR (PASS da FAIL de uretmez)', async () => {
      const report = await runOfficeWorkPoolParitySweep(
        { legacy: repository, resolver },
        {
          asOf: new Date(CUTOVER.getTime() - 1),
          source: 'SYNTHETIC_FIXTURE',
          tenantIds: [T1, T2],
        },
      );

      expect(report.beforeKnownFromCount).toBe(6);
      expect(report.comparedCount).toBe(0);
      expect(report.verdict).toBe('NOT_MEASURED');
    });
  });

  /**
   * GERÇEK-VERİ PARİTESİ — yalnız persistent DB'nin DISPOSABLE KLONUNDA çalıştırılır.
   *
   * Kullanım (persistent DB'ye ASLA yazmaz):
   *   1) persistent DB'den salt-okunur dump alınır,
   *   2) dump disposable bir Postgres 16 konteynerine geri yüklenir,
   *   3) `prisma migrate deploy` YALNIZ klonda koşturulur,
   *   4) `TEST_DATABASE_URL` klona bakarken `OFFICE_WR01_B02_REAL_DATA_PARITY=1` ile bu blok
   *      koşturulur.
   */
  const realDataDescribe =
    process.env.OFFICE_WR01_B02_REAL_DATA_PARITY === '1' ? describe : describe.skip;

  realDataDescribe('gercek-veri paritesi (disposable klon)', () => {
    it('TUM Office satirlari icin asOf=now paritesi PASS uretir', async () => {
      const report = await runOfficeWorkPoolParitySweep(
        { legacy: repository, resolver },
        {
          asOf: new Date(),
          source: 'REAL_DATA_DISPOSABLE_CLONE',
          // Bu suite'in kendi sentetik fixture'i GERCEK VERI DEGILDIR ve olcume girmez;
          // aksi halde kasten anchor'siz birakilan fixture, gercek veriye ait olmayan bir
          // ANCHOR_MISSING uretir ve "real-data parity" iddiasi kirlenir.
          excludeTenantIds: TENANTS,
        },
      );

      // Rapor maskelenmiş kimlik taşır; ham tenant/lawyer id loglanmaz.
      // eslint-disable-next-line no-console
      console.log(JSON.stringify(report, null, 2));

      // Bos tarama uzerinden yesil rapor uretilmesini engeller.
      expect(report.tenantCount).toBeGreaterThan(0);
      expect(report.mismatchCount).toBe(0);
      expect(report.anchorMissingCount).toBe(0);
      expect(report.verdict).toBe('PASS');
    });
  });
});
