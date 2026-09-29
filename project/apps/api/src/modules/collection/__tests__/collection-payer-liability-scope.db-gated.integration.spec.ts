import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { resolveTestDatabaseUrl } from '../../../../test/test-db-env';
import { AuditService } from '../../audit/audit.service';
import { CaseDebtorLifecycleGuardService } from '../../case-debtor-lifecycle-guard/case-debtor-lifecycle-guard.service';
import { CasePaymentPreviewService } from '../../case/case-payment-preview.service';
import { CaseService } from '../../case/case.service';
import { DomainEventIngestService } from '../../icrabot/domain-event-ingest';
import { TBK100AllocatorService } from '../../interest-engine/allocation/tbk100-allocator.service';
import { SummaryEngineService } from '../../summary-engine/summary-engine.service';
import { CollectionService } from '../collection.service';
import { CollectionType, type CreateCollectionDto } from '../dto/collection.dto';

/**
 * K3-L Faz 1b (owner kararları 2026-09-28) — tahsilat yalnız ödeyen borçlunun sorumlu olduğu kalemlere mahsup edilir.
 * Yeniden üretilen kusur: ciranta adına 500 TL tahsilat keşideciye ait çek tazminatına düşüyordu.
 * Gerçek CollectionService + SummaryEngine (TBK100) + disposable PostgreSQL.
 */
const TEST_DB_URL = resolveTestDatabaseUrl(process.env);
if (process.env.CI && !TEST_DB_URL) {
  throw new Error('K3-L payer scope DB gate requires TEST_DATABASE_URL in CI.');
}
const describeWithDisposableDb = TEST_DB_URL ? describe : describe.skip;

describeWithDisposableDb('K3-L ödeyen borçluya göre tahsilat mahsubu (disposable PostgreSQL)', () => {
  jest.setTimeout(120_000);
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
      undefined,
      undefined,
      new AuditService(prisma as any),
    );

  async function fixture(label: string, penaltyRestricted = true) {
    const suffix = randomUUID().slice(0, 8);
    const tenantId = `test-k3l-pay-${label}-${suffix}`;
    await prisma.tenant.create({ data: { id: tenantId, name: `K3L ${label}`, slug: tenantId } });
    const client = await prisma.client.create({ data: { tenantId, displayName: 'Alacaklı', type: 'COMPANY' } as never });
    const legalCase = await prisma.case.create({
      data: {
        tenantId,
        clientId: client.id,
        fileNumber: `K3L-PAY-${suffix}`,
        type: 'CHECK',
        caseStatus: 'DERDEST',
        status: 'ACTIVE',
        currency: 'TRY',
      } as never,
    });
    const kesideci = await prisma.debtor.create({ data: { tenantId, type: 'INDIVIDUAL', name: 'Keşideci Ali' } as never });
    const ciranta = await prisma.debtor.create({ data: { tenantId, type: 'INDIVIDUAL', name: 'Ciranta Ayşe' } as never });
    const kesideciCd = await prisma.caseDebtor.create({ data: { caseId: legalCase.id, debtorId: kesideci.id, role: 'KESIDECI' } });
    const cirantaCd = await prisma.caseDebtor.create({ data: { caseId: legalCase.id, debtorId: ciranta.id, role: 'CIRANTA' } });
    const item = (itemType: 'PRINCIPAL' | 'CHECK_PENALTY', amount: number, sortOrder: number, restrictedTo: string[] | null) =>
      prisma.claimItem.create({
        data: {
          tenantId,
          caseId: legalCase.id,
          itemType,
          originalAmount: amount,
          demandedAmount: amount,
          amount,
          currency: 'TRY',
          interestAccrualStatus: 'NO_INTEREST',
          isAllDebtorsLiable: restrictedTo === null,
          liableDebtorIds: restrictedTo ?? [],
          sortOrder,
        },
      });
    const principal = await item('PRINCIPAL', 10000, 1, null);
    const penalty = await item('CHECK_PENALTY', 1000, 2, penaltyRestricted ? [kesideci.id] : null);
    return { tenantId, caseId: legalCase.id, kesideciCd, cirantaCd, principal, penalty };
  }
  type Fixture = Awaited<ReturnType<typeof fixture>>;

  const pay = (f: Fixture, amount: number, caseDebtorId?: string) =>
    collections().create(
      f.tenantId,
      {
        caseId: f.caseId,
        idempotencyKey: `k3l-pay-${randomUUID()}`,
        amount,
        currency: 'TRY',
        type: CollectionType.BANK_TRANSFER,
        date: '2026-09-20T09:00:00.000Z',
        ...(caseDebtorId ? { caseDebtorId } : {}),
      } as CreateCollectionDto,
      `actor-${f.tenantId}`,
    );

  const collected = async (f: Fixture) => {
    const rows = await prisma.claimItem.findMany({ where: { caseId: f.caseId }, orderBy: { sortOrder: 'asc' } });
    return Object.fromEntries(rows.map((r) => [r.itemType, Number(r.collectedAmount)]));
  };

  it('ciranta ödemesi keşideciye ait tazminata DEĞİL, bedele mahsup edilir (kusur tersine döndü)', async () => {
    const f = await fixture('ciranta');
    await pay(f, 500, f.cirantaCd.id);
    expect(await collected(f)).toEqual({ PRINCIPAL: 500, CHECK_PENALTY: 0 });
  });

  it('keşideci ödemesi TBK100 sırasıyla önce fer\'i tazminata, sonra bedele', async () => {
    const f = await fixture('kesideci');
    await pay(f, 1500, f.kesideciCd.id);
    expect(await collected(f)).toEqual({ PRINCIPAL: 500, CHECK_PENALTY: 1000 });
  });

  it('kısıtlı kalemli dosyada ödeyensiz tahsilat 400 PAYER_DEBTOR_REQUIRED, hiçbir satır yazılmaz', async () => {
    const f = await fixture('no-payer');
    await expect(pay(f, 500)).rejects.toMatchObject({ response: { code: 'PAYER_DEBTOR_REQUIRED' } });
    expect(await prisma.collection.count({ where: { caseId: f.caseId } })).toBe(0);
    expect(await prisma.ledgerEntry.count({ where: { caseId: f.caseId } })).toBe(0);
    expect(await collected(f)).toEqual({ PRINCIPAL: 0, CHECK_PENALTY: 0 });
  });

  it('tüm kalemleri tüm borçlulara açık dosyada davranış değişmez (ödeyensiz tahsilat bugünkü gibi)', async () => {
    const f = await fixture('unrestricted', false);
    await pay(f, 500);
    expect(await collected(f)).toEqual({ PRINCIPAL: 0, CHECK_PENALTY: 500 });
  });

  it('cirantanın sorumlu olduğu tutarı aşan ödemesi tazminata taşmaz; fazlası engellenir', async () => {
    const f = await fixture('overpay');
    await pay(f, 12000, f.cirantaCd.id);
    expect(await collected(f)).toEqual({ PRINCIPAL: 10000, CHECK_PENALTY: 0 });
    expect(await prisma.collectionOverpayment.count({ where: { caseId: f.caseId, status: 'HELD' } })).toBe(0);
  });

  it('K3-L Faz 1c: borçlu bazlı bakiye kalıcı defterden — keşideci bedel + kendi tazminatı, ciranta yalnız bedel', async () => {
    const f = await fixture('ledger-balance');
    await pay(f, 500, f.cirantaCd.id);
    await pay(f, 300, f.kesideciCd.id);
    expect(await collected(f)).toEqual({ PRINCIPAL: 500, CHECK_PENALTY: 300 });

    const caseService = Object.assign(Object.create(CaseService.prototype), { prisma }) as CaseService;
    const result = await caseService.getDebtorLedgerBalances(f.tenantId, f.caseId);
    expect(result).toMatchObject({ kaynak: 'KALICI_DEFTER', isleyenFaizDahil: false, sorumlusuBulunamayanKalemler: [] });
    const byCaseDebtor = Object.fromEntries(result.borclular.map((b) => [b.caseDebtorId, b]));
    expect(byCaseDebtor[f.kesideciCd.id].toplamlar).toEqual([{ paraBirimi: 'TRY', tutar: 11000, tahsilEdilen: 800, kalan: 10200 }]);
    expect(byCaseDebtor[f.cirantaCd.id].toplamlar).toEqual([{ paraBirimi: 'TRY', tutar: 10000, tahsilEdilen: 500, kalan: 9500 }]);
    expect(byCaseDebtor[f.cirantaCd.id].kalemler.map((l) => l.kalemTuru)).toEqual(['PRINCIPAL']);
  });

  it('önizleme: ödeyensiz → kabul edilmez; ciranta → yalnız bedel; keşideci → bedel + tazminat', async () => {
    const f = await fixture('preview');
    const preview = new CasePaymentPreviewService(prisma as any);
    const noPayer = await preview.preview({ tenantId: f.tenantId, caseId: f.caseId, input: { amount: 500 } as any });
    expect(noPayer.acceptance).toMatchObject({ wouldAccept: false, blockingReasons: ['PAYER_DEBTOR_REQUIRED'] });
    const cirantaPreview = await preview.preview({ tenantId: f.tenantId, caseId: f.caseId, input: { amount: 500, caseDebtorId: f.cirantaCd.id } as any });
    expect(cirantaPreview.balanceImpact.currentOutstandingAmount).toBe(10000);
    expect(cirantaPreview.acceptance.warnings).toContain('PAYER_SCOPED_OUTSTANDING_EXCLUDES_INTEREST');
    const kesideciPreview = await preview.preview({ tenantId: f.tenantId, caseId: f.caseId, input: { amount: 500, caseDebtorId: f.kesideciCd.id } as any });
    expect(kesideciPreview.balanceImpact.currentOutstandingAmount).toBe(11000);
  });
});
