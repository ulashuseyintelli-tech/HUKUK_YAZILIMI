import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import { resolveTestDatabaseUrl } from '../../../../test/test-db-env';
import { AccountingJournalWriterService } from '../../accounting-journal/accounting-journal.writer';
import { AuditService } from '../../audit/audit.service';
import { CaseDebtorLifecycleGuardService } from '../../case-debtor-lifecycle-guard/case-debtor-lifecycle-guard.service';
import { buildDebtorLedgerBalances } from '../../case/debtor-ledger-balance';
import { allocationHoldReason, scopeItemsToPayer } from '../../claim-item/payer-liability-scope';
import { CollectionService } from '../../collection/collection.service';
import { CollectionType, type CreateCollectionDto } from '../../collection/dto/collection.dto';
import { ReceiptObjectScopeAuthorizationService } from '../../collection/receipt-object-scope-authorization.service';
import { DomainEventIngestService } from '../../icrabot/domain-event-ingest';
import { TBK100AllocatorService } from '../../interest-engine/allocation/tbk100-allocator.service';
import { SummaryEngineService } from '../../summary-engine/summary-engine.service';
import { CaseService } from '../../case/case.service';
import { legacyProjection, type ClaimLiabilityModeValue } from '../claim-liability.domain';

/**
 * AT-25 — ESKİ KOD UYUMLULUĞU (geri dönüş sınırı; owner güvenlik düzeltmesi 2).
 *
 * Yeni modelle oluşmuş kayıtlar üzerinde ÖNCEKİ sürümün mahsup kapsamı ve borçlu bakiyesi işlevleri çalıştırılır.
 * Bu işlevler (`payer-liability-scope.ts`, sorumluluk bağlamı verilmeden `buildDebtorLedgerBalances`) bu teslimde
 * DEĞİŞMEDİ; önceki sürümün okuduğu tek şey kalemdeki iki eski alandır (izdüşüm).
 *
 *  - müteselsil kalem: sonuç eşdeğer (liste = seçilen borçlular; her biri tamamından);
 *  - paylı / tutarla sınırlı kalem: eski işlevler hiçbir borçlu adına mahsup kapsamı VERMEZ (tahsilat bekletilir);
 *    hiçbir sınır aşılamaz;
 *  - borçlu atıflı fazla ödeme: tutar eski alanlarla doğru okunur.
 *
 * GERÇEK eski derlemeyle (canlıdaki sürümün derleme çıktısı + kendi Prisma istemcisi) yapılan sınama depo dışındadır;
 * bu test `LIABILITY_ROLLBACK_FIXTURE_OUT` verilirse o sınamanın kullanacağı kimlikleri dosyaya yazar. Tutarlar SENTETİKTİR.
 */
const TEST_DB_URL = resolveTestDatabaseUrl(process.env);
if (process.env.CI && !TEST_DB_URL) {
  throw new Error('Claim liability rollback-compat DB gate requires TEST_DATABASE_URL in CI.');
}
const describeWithDisposableDb = TEST_DB_URL ? describe : describe.skip;

describeWithDisposableDb('Seçimlik borçlu sorumluluğu — eski kod uyumluluğu (disposable PostgreSQL)', () => {
  jest.setTimeout(180_000);
  let prisma: PrismaClient;
  let engine: SummaryEngineService;

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url: TEST_DB_URL } } });
    await prisma.$connect();
    engine = new SummaryEngineService(prisma as never, new TBK100AllocatorService());
    await engine.onModuleInit();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  const collections = () =>
    new CollectionService(
      prisma as any,
      new DomainEventIngestService(),
      new CaseDebtorLifecycleGuardService(prisma as any),
      engine,
      new AccountingJournalWriterService(prisma as any),
      undefined,
      new AuditService(prisma as any),
      new ReceiptObjectScopeAuthorizationService(prisma as any, { isSecretConfigured: () => false } as any),
    );

  async function buildCase(tenantId: string, label: string, items: Array<{ key: string; itemType: string; amount: number }>) {
    const suffix = randomUUID().slice(0, 8);
    const client = await prisma.client.create({ data: { tenantId, displayName: `Alacaklı ${label}`, type: 'COMPANY' } as never });
    const legalCase = await prisma.case.create({
      data: { tenantId, clientId: client.id, fileNumber: `LIAB-RB-${label}-${suffix}`, type: 'GENERAL_EXECUTION', caseStatus: 'DERDEST', status: 'ACTIVE', currency: 'TRY' } as never,
    });
    const debtors: Array<{ caseDebtorId: string; debtorId: string }> = [];
    for (let index = 1; index <= 3; index += 1) {
      const debtor = await prisma.debtor.create({ data: { tenantId, type: 'INDIVIDUAL', name: `Sentetik Borçlu ${index}` } as never });
      const caseDebtor = await prisma.caseDebtor.create({ data: { caseId: legalCase.id, debtorId: debtor.id, role: 'ASIL_BORCLU' } });
      debtors.push({ caseDebtorId: caseDebtor.id, debtorId: debtor.id });
    }
    const itemIds: Record<string, string> = {};
    for (const [index, seed] of items.entries()) {
      const created = await prisma.claimItem.create({
        data: {
          tenantId,
          caseId: legalCase.id,
          itemType: seed.itemType as never,
          originalAmount: seed.amount,
          demandedAmount: seed.amount,
          amount: seed.amount,
          currency: 'TRY',
          interestAccrualStatus: 'NO_INTEREST',
          liableDebtorIds: [],
          sortOrder: index + 1,
        },
      });
      itemIds[seed.key] = created.id;
    }
    return { caseId: legalCase.id, debtors, itemIds };
  }

  async function select(
    tenantId: string,
    caseId: string,
    claimItemId: string,
    mode: ClaimLiabilityModeValue,
    parties: Array<{ caseDebtorId: string; debtorId: string; shareWeight?: number; limitAmount?: number; unlimited?: boolean }>,
  ) {
    await prisma.claimItemLiabilitySet.create({
      data: {
        tenantId,
        caseId,
        claimItemId,
        version: 1,
        mode,
        limitScope: mode === 'CAPPED' ? 'ITEM_AMOUNT' : null,
        basis: 'COURT_JUDGMENT',
        decidedByUserId: `actor-${tenantId}`,
        decidedAt: new Date(),
        appliedVia: 'SINGLE',
        parties: {
          create: parties.map((party, sortOrder) => ({
            caseDebtorId: party.caseDebtorId,
            shareWeight: party.shareWeight ?? null,
            limitAmount: party.limitAmount ?? null,
            unlimited: party.unlimited ?? false,
            sortOrder,
          })),
        },
      },
    });
    await prisma.claimItem.update({ where: { id: claimItemId }, data: legacyProjection(mode, parties.map((party) => party.debtorId)) });
  }

  const pay = (tenantId: string, caseId: string, amount: number, caseDebtorId?: string, extra: Partial<CreateCollectionDto> = {}) =>
    collections().create(
      tenantId,
      {
        caseId,
        idempotencyKey: `liab-rb-${randomUUID()}`,
        amount,
        currency: 'TRY',
        type: CollectionType.BANK_TRANSFER,
        date: '2026-09-20T09:00:00.000Z',
        ...(caseDebtorId ? { caseDebtorId } : {}),
        ...extra,
      } as CreateCollectionDto,
      `actor-${tenantId}`,
    );

  it('AT-25: yeni modelle oluşmuş kayıtları önceki sürümün işlevleri güvenle okur — müteselsil eşdeğer, paylı / tavanlı kalemde mahsup yok', async () => {
    const suffix = randomUUID().slice(0, 8);
    const tenantId = `test-liab-rb-${suffix}`;
    await prisma.tenant.create({ data: { id: tenantId, name: 'LIAB RB', slug: tenantId } });

    // Dosya A: müteselsil + paylı + tutarla sınırlı + belirlenmedi kalemler; yeni kodla tahsilat ve borçlu fazla ödemesi
    const a = await buildCase(tenantId, 'A', [
      { key: 'J', itemType: 'EXPENSE', amount: 1000 },
      { key: 'P', itemType: 'PRINCIPAL', amount: 9000 },
      { key: 'C', itemType: 'CHECK_PENALTY', amount: 2000 },
    ]);
    const [b1, b2, b3] = a.debtors;
    await select(tenantId, a.caseId, a.itemIds.J, 'JOINT_AND_SEVERAL', [b1, b2]);
    await select(tenantId, a.caseId, a.itemIds.P, 'PROPORTIONAL', [{ ...b1, shareWeight: 6000 }, { ...b2, shareWeight: 4000 }]);
    await select(tenantId, a.caseId, a.itemIds.C, 'CAPPED', [{ ...b1, unlimited: true }, { ...b2, limitAmount: 500 }]);
    // B2 kapasitesi: 1.000 (J ortak kalan) + 500 (C tavan) + 3.600 (P pay) = 5.100 → 5.600 ödeme: 500 borçlu fazla ödemesi
    const attributed = await pay(tenantId, a.caseId, 5600, b2.caseDebtorId);

    // Dosya B: yalnız paylı kalem → önceki sürüm hiçbir borçlu adına mahsup yapamamalı
    const b = await buildCase(tenantId, 'B', [{ key: 'P', itemType: 'PRINCIPAL', amount: 4000 }]);
    await select(tenantId, b.caseId, b.itemIds.P, 'PROPORTIONAL', [
      { ...b.debtors[0], shareWeight: 1 },
      { ...b.debtors[1], shareWeight: 1 },
    ]);

    // Dosya C: haciz kaynağında sorumluluğu aşan ödeme → tamamı bekletilir (ayrıntı kodu metadata'da)
    const c = await buildCase(tenantId, 'C', [{ key: 'P', itemType: 'PRINCIPAL', amount: 4000 }]);
    await select(tenantId, c.caseId, c.itemIds.P, 'PROPORTIONAL', [
      { ...c.debtors[0], shareWeight: 1 },
      { ...c.debtors[1], shareWeight: 1 },
    ]);
    const heldSeizure = await pay(tenantId, c.caseId, 2500, c.debtors[0].caseDebtorId, { channel: 'HACIZ' as never });

    // ── Önceki sürümün işlevleri (bu teslimde değişmeyen dosya) kalemlerin iki eski alanını okur ──
    const itemsA = await prisma.claimItem.findMany({ where: { caseId: a.caseId }, orderBy: { sortOrder: 'asc' } });
    const byKey = (key: string) => itemsA.find((item) => item.id === a.itemIds[key])!;
    // Müteselsil: eşdeğer — listedeki borçlular kapsamda, listede olmayan değil
    expect(byKey('J')).toMatchObject({ isAllDebtorsLiable: false });
    expect([...byKey('J').liableDebtorIds].sort()).toEqual([b1.debtorId, b2.debtorId].sort());
    // Paylı / tutarla sınırlı: kısıtlı kalem, BOŞ liste
    for (const key of ['P', 'C']) expect(byKey(key)).toMatchObject({ isAllDebtorsLiable: false, liableDebtorIds: [] });

    expect(allocationHoldReason(itemsA, null)).toBe('ON_BEHALF_DEBTOR_REQUIRED');
    expect(allocationHoldReason(itemsA, b3.debtorId)).toBe('ON_BEHALF_DEBTOR_NOT_LIABLE');
    // Önceki sürüm B1 / B2 için YALNIZ müteselsil kalemi kapsama alır; paylı ve tavanlı kaleme mahsup yapamaz
    for (const debtor of [b1, b2]) {
      expect(allocationHoldReason(itemsA, debtor.debtorId)).toBeNull();
      expect(scopeItemsToPayer(itemsA, debtor.debtorId).map((item) => item.id)).toEqual([a.itemIds.J]);
    }
    // Yalnız paylı kalemi olan dosyada önceki sürüm her borçluda mahsubu BEKLETİR → sınır aşılamaz
    const itemsB = await prisma.claimItem.findMany({ where: { caseId: b.caseId } });
    for (const debtor of b.debtors) expect(allocationHoldReason(itemsB, debtor.debtorId)).toBe('ON_BEHALF_DEBTOR_NOT_LIABLE');
    expect(allocationHoldReason(itemsB, null)).toBe('ON_BEHALF_DEBTOR_REQUIRED');

    // Önceki sürümün borçlu bakiyesi (sorumluluk bağlamı YOK): çökmeden okur; paylı / tavanlı kalem hiçbir borçluya
    // yazılmaz ("sorumlusu bulunamayan" altında görünür) — işlev eksilir, kayıt bozulmaz
    const legacyBalances = buildDebtorLedgerBalances({
      caseDebtors: a.debtors.map((debtor, index) => ({ id: debtor.caseDebtorId, debtorId: debtor.debtorId, role: 'ASIL_BORCLU', lifecycleStatus: 'ACTIVE', name: `B${index + 1}` })),
      items: itemsA as never,
    });
    expect(legacyBalances.borclular.map((row) => row.kalemler.map((line) => line.claimItemId))).toEqual([[a.itemIds.J], [a.itemIds.J], []]);
    expect(legacyBalances.sorumlusuBulunamayanKalemler.map((line) => line.claimItemId).sort()).toEqual([a.itemIds.P, a.itemIds.C].sort());

    // Borçlu atıflı fazla ödeme: önceki sürümün okuduğu alanlarla tutar doğru; yeni sütun yok sayılabilir
    const overpayment = await prisma.collectionOverpayment.findUniqueOrThrow({
      where: { collectionId: (attributed as any).id },
      select: { status: true, amount: true, remainingAmount: true, currency: true, caseId: true, tenantId: true },
    });
    expect({ ...overpayment, amount: Number(overpayment.amount), remainingAmount: Number(overpayment.remainingAmount) }).toEqual({
      status: 'HELD',
      amount: 500,
      remainingAmount: 500,
      currency: 'TRY',
      caseId: a.caseId,
      tenantId,
    });
    const seizureHold = await prisma.collectionAllocationHold.findUniqueOrThrow({ where: { collectionId: (heldSeizure as any).id } });
    // Kayıtlı neden önceki sürümün enum kümesindedir (tanımadığı değer yazılmaz); ayrıntı kodu metadata'da
    expect(seizureHold).toMatchObject({ status: 'HELD', holdReason: 'ON_BEHALF_DEBTOR_NOT_LIABLE' });
    expect((seizureHold.metadata as any).details.reasonCode).toBe('LIABILITY_LIMIT_EXCEEDED');

    // Gerçek eski derleme sınaması için kimlikler (yalnız istenirse yazılır; depo dışı kanıt betiği okur)
    const out = process.env.LIABILITY_ROLLBACK_FIXTURE_OUT;
    if (out) {
      fs.writeFileSync(
        out,
        JSON.stringify(
          {
            tenantId,
            caseA: { caseId: a.caseId, itemIds: a.itemIds, debtors: a.debtors, attributedCollectionId: (attributed as any).id },
            caseB: { caseId: b.caseId, itemIds: b.itemIds, debtors: b.debtors },
            caseC: { caseId: c.caseId, itemIds: c.itemIds, debtors: c.debtors, heldCollectionId: (heldSeizure as any).id },
          },
          null,
          2,
        ),
        'utf8',
      );
    }
  });

  /**
   * AT-4 — GERÇEK eski sürümün ürettiği "altın çıktı" ile karşılaştırma (yalnız `LIABILITY_OLD_GOLDEN_IN` verilirse;
   * depo dışı kanıt akışı: eski derleme veritabanını doldurur ve borçlu bakiyesi yanıtlarını yazar, seçim migration'ı
   * uygulanır, bu test YENİ kodla aynı dosyaları okur). Seçimsiz dosyada mevcut alanlar BİREBİR aynı olmalıdır.
   */
  const goldenPath = process.env.LIABILITY_OLD_GOLDEN_IN;
  (goldenPath ? it : it.skip)('AT-4: seçimsiz dosyada borçlu bakiyesinin mevcut alanları gerçek eski sürümün çıktısıyla birebir aynı', async () => {
    const golden = JSON.parse(fs.readFileSync(goldenPath as string, 'utf8')) as {
      tenantId: string;
      cases: Array<{ name: string; caseId: string; balances: Record<string, any> }>;
    };
    expect(golden.cases.length).toBeGreaterThan(0);
    const caseService = Object.assign(Object.create(CaseService.prototype), { prisma }) as CaseService;
    for (const entry of golden.cases) {
      const current = (await caseService.getDebtorLedgerBalances(golden.tenantId, entry.caseId)) as Record<string, any>;
      const legacyFields = {
        kaynak: current.kaynak,
        isleyenFaizDahil: current.isleyenFaizDahil,
        not: current.not,
        borclular: current.borclular.map((row: Record<string, any>) => ({
          caseDebtorId: row.caseDebtorId,
          debtorId: row.debtorId,
          ad: row.ad,
          rol: row.rol,
          kalemler: row.kalemler.map(({ sorumluluk: _sorumluluk, ...rest }: Record<string, any>) => rest),
          toplamlar: row.toplamlar,
        })),
        sorumlusuBulunamayanKalemler: current.sorumlusuBulunamayanKalemler,
        mahsubuBekleyenTahsilatlar: current.mahsubuBekleyenTahsilatlar,
      };
      expect({ name: entry.name, fields: JSON.parse(JSON.stringify(legacyFields)) }).toEqual({ name: entry.name, fields: entry.balances });
      // Yeni alanlar eklendi; seçimsiz kalem "belirlenmedi" ya da "kayıttan kısıtlı"
      expect(current.dosyaKalani).toBeDefined();
      for (const row of current.borclular) {
        expect(row.toplamDurumu).toBe('HESAPLANDI');
        for (const line of row.kalemler) expect(['BELIRLENMEDI', 'KAYITTAN_KISITLI']).toContain(line.sorumluluk.tur);
      }
    }
  });
});
