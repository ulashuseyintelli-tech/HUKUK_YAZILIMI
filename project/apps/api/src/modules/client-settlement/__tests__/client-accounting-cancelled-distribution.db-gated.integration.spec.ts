/**
 * Müvekkil Genel Cari "Dağıtım Bekleyen" — tahsilatı iptal edilen KESİNLEŞMİŞ dağıtım, GERÇEK PostgreSQL.
 *
 * Neden var (2026-10-01 ölçümü, satır 7 / owner kararı 6): iptal edilen tahsilat `Σ CONFIRMED tahsilat` toplamından düşerken
 * dağıtımı `Σ POSTED dağıtım` toplamında kalıyordu → "Dağıtım Bekleyen" negatif ve "Kontrol gerekli" kalıcı; aynı dosyada
 * dağıtılmamış gerçek bir tahsilat varsa onunla netleşip UYARISIZ eksik görünüyordu (gerçek 600 → 0, gerçek 1.000 → 400).
 * Ödenecek tutar, hareket listesi, ekstre ve ödeme planı aynı dağıtımı `manualReversalRequiredAt` işaretiyle zaten dışlıyordu.
 *
 * İşaretli durum, `CollectionReversalService` POSTED dağıtıma PAYMENT_REVERSED geldiğinde yazdığı durumun AYNISIDIR
 * (status POSTED KORUNUR + `manualReversalRequiredAt` dolu; collection-reversal.service.ts, POSTED dalı); yazıcı ayrıca
 * f04-posting-reversal-race.db-gated.integration.spec.ts ile sınanır. Burada okuyucu gerçek veritabanıyla koşar.
 * Sentetik veri; canlı veriyle ilgisi yoktur.
 */
import 'reflect-metadata';
import { Prisma, PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';

import { describeDb } from '../../../../test/describe-db';
import { PrismaService } from '../../../prisma/prisma.service';
import { ClientSettlementReadService } from '../client-settlement-read.service';

const D = (n: string | number) => new Prisma.Decimal(n);

interface SeedCollection {
  amount: number;
  status: 'CONFIRMED' | 'CANCELLED';
  /** Dağıtım: kesinleşmiş (canlı / iptal işaretli) ya da kesinleşmemiş taslak. */
  disposition?: { state: 'POSTED_LIVE' | 'POSTED_MARKED' | 'DRAFT'; payable: number; fee: number };
}

describeDb('Genel Cari "Dağıtım Bekleyen": iptal işaretli kesinleşmiş dağıtım (gerçek PostgreSQL)', () => {
  jest.setTimeout(120_000);

  let prisma: PrismaService;
  let read: ClientSettlementReadService;
  const createdTenants: string[] = [];

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    read = new ClientSettlementReadService(prisma);
  });

  afterAll(async () => {
    for (const tenantId of createdTenants) await cleanupTenant(prisma, tenantId);
    await prisma.$disconnect();
  });

  /** Tek müvekkil; her eleman bir dosya (içinde tahsilat + isteğe bağlı dağıtım). */
  async function seed(cases: SeedCollection[][]) {
    const sfx = randomUUID().slice(0, 8);
    const tenant = await prisma.tenant.create({ data: { name: `Dagitim ${sfx}`, slug: `dagitim-${sfx}` }, select: { id: true } });
    createdTenants.push(tenant.id);
    const client = await prisma.client.create({ data: { tenantId: tenant.id, type: 'PERSON', name: `Muvekkil ${sfx}` }, select: { id: true } });
    const caseIds: string[] = [];
    const caseClientIds: string[] = [];
    let n = 0;
    for (const collections of cases) {
      const kase = await prisma.case.create({ data: { tenantId: tenant.id, fileNumber: `DAGITIM-${sfx}-${caseIds.length + 1}`, type: 'GENERAL_EXECUTION' }, select: { id: true } });
      const caseClient = await prisma.caseClient.create({ data: { caseId: kase.id, clientId: client.id, role: 'ALACAKLI' }, select: { id: true } });
      caseIds.push(kase.id);
      caseClientIds.push(caseClient.id);
      for (const c of collections) {
        n += 1;
        const collection = await prisma.collection.create({
          data: {
            tenantId: tenant.id,
            caseId: kase.id,
            amount: D(c.amount),
            type: 'TAHSILAT',
            date: new Date('2026-03-01T00:00:00.000Z'),
            idempotencyKey: `dagitim-${sfx}-${n}`,
            status: c.status,
          },
          select: { id: true },
        });
        if (!c.disposition) continue;
        const { state, payable, fee } = c.disposition;
        await prisma.collectionDisposition.create({
          data: {
            tenantId: tenant.id,
            caseId: kase.id,
            collectionId: collection.id,
            beneficiaryScope: 'SINGLE_CASE_CLIENT',
            caseClientId: caseClient.id,
            status: state === 'DRAFT' ? 'HELD_PENDING_DISTRIBUTION' : 'POSTED',
            totalAmount: D(payable + fee),
            currency: 'TRY',
            ...(state === 'DRAFT' ? {} : { postedAt: new Date('2026-03-02T00:00:00.000Z') }),
            ...(state === 'POSTED_MARKED'
              ? { manualReversalRequiredAt: new Date('2026-03-03T00:00:00.000Z'), manualReversalReason: 'PAYMENT_REVERSED POSTED disposition (test)' }
              : {}),
            ...(state === 'DRAFT'
              ? {}
              : {
                  lines: {
                    create: [
                      { type: 'CLIENT_PAYABLE' as const, amount: D(payable), caseClientId: caseClient.id },
                      { type: 'CONTRACTUAL_FEE_WITHHELD' as const, amount: D(fee) },
                    ],
                  },
                }),
          },
        });
      }
    }
    return { tenantId: tenant.id, clientId: client.id, caseIds, caseClientIds };
  }

  async function summaryOf(s: { tenantId: string; clientId: string }) {
    return read.getClientAccountingSummary(s.tenantId, s.clientId, 'TRY');
  }

  it('1) tahsilat iptali: 3.000 iptal, dağıtım 2.200 + 800 işaretli → "dağıtım bekleyen" 0, uyarı YOK (önceden −3.000 + uyarı)', async () => {
    const s = await seed([[{ amount: 3000, status: 'CANCELLED', disposition: { state: 'POSTED_MARKED', payable: 2200, fee: 800 } }]]);
    const res = await summaryOf(s);
    expect(res.caseScopedContext.debtorCollection).toBe('0');
    expect(res.caseScopedContext.pendingDistribution).toBe('0');
    expect(res.needsReview).toBe(false);
    expect(res.caseBreakdown[0].needsReview).toBe(false);
    // Aynı işaret müvekkile borçta da esas: iptal edilen dağıtım borç sayılmaz.
    expect(res.clientScoped.payableNet).toBe('0');
  });

  it('2) kısmi dağıtım: aynı dosyada 1.000 (dağıtım 700 + 300 canlı) ve 600 (iptal, dağıtım 400 + 200 işaretli) → 0, uyarı YOK', async () => {
    const s = await seed([
      [
        { amount: 1000, status: 'CONFIRMED', disposition: { state: 'POSTED_LIVE', payable: 700, fee: 300 } },
        { amount: 600, status: 'CANCELLED', disposition: { state: 'POSTED_MARKED', payable: 400, fee: 200 } },
      ],
    ]);
    const res = await summaryOf(s);
    expect(res.caseScopedContext.debtorCollection).toBe('1000');
    expect(res.caseScopedContext.pendingDistribution).toBe('0');
    expect(res.needsReview).toBe(false);
    expect(res.clientScoped.payableNet).toBe('700');
  });

  it('3) GERÇEK bekleyen tutar gizlenmez: iptal edilen 600 dağıtım + dağıtılmamış onaylı 1.000 tahsilat → 1.000 (önceden 400, uyarısız)', async () => {
    const s = await seed([
      [
        { amount: 600, status: 'CANCELLED', disposition: { state: 'POSTED_MARKED', payable: 400, fee: 200 } },
        { amount: 1000, status: 'CONFIRMED', disposition: { state: 'DRAFT', payable: 0, fee: 0 } },
      ],
    ]);
    const res = await summaryOf(s);
    expect(res.caseScopedContext.pendingDistribution).toBe('1000');
    expect(res.caseBreakdown[0].pendingDistribution).toBe('1000');
    expect(res.caseBreakdown[0].pendingDistributionExcludingHeld).toBe('1000');
    expect(res.needsReview).toBe(false);
  });

  it('3b) aynı müvekkilin iki dosyası: iptal edilen dosya (−1.200 olurdu) gerçek bekleyen 1.200 ile NETLEŞİP gizlemez', async () => {
    const s = await seed([
      [{ amount: 1200, status: 'CANCELLED', disposition: { state: 'POSTED_MARKED', payable: 900, fee: 300 } }],
      [{ amount: 1200, status: 'CONFIRMED', disposition: { state: 'DRAFT', payable: 0, fee: 0 } }],
    ]);
    const res = await summaryOf(s);
    expect(res.caseScopedContext.pendingDistribution).toBe('1200');
    expect(res.caseBreakdown.map((b) => b.pendingDistribution).sort()).toEqual(['0', '1200']);
    expect(res.needsReview).toBe(false);
  });

  it('4) gerçek tutarsızlık hâlâ GÖRÜNÜR: işaretsiz dağıtım onaylı tahsilatı aşarsa negatif kalır + uyarı (negatif KIRPILMAZ)', async () => {
    const s = await seed([[{ amount: 100, status: 'CONFIRMED', disposition: { state: 'POSTED_LIVE', payable: 200, fee: 100 } }]]);
    const res = await summaryOf(s);
    expect(res.caseScopedContext.pendingDistribution).toBe('-200');
    expect(res.needsReview).toBe(true);
    expect(res.caseBreakdown[0].needsReview).toBe(true);
  });

  it('5) kontrol: iptal edilmemiş dosya değişmez (onaylı 1.000, dağıtım 700 + 300) → 0, ödenecek 700', async () => {
    const s = await seed([[{ amount: 1000, status: 'CONFIRMED', disposition: { state: 'POSTED_LIVE', payable: 700, fee: 300 } }]]);
    const res = await summaryOf(s);
    expect(res.caseScopedContext.pendingDistribution).toBe('0');
    expect(res.needsReview).toBe(false);
    expect(res.clientScoped.payableNet).toBe('700');
  });

  it('6) sözleşme eşitliği: ödenecek tutar (computeOutstanding) iptal işaretli dağıtımı özetle AYNI biçimde dışlar', async () => {
    const s = await seed([
      [
        { amount: 1000, status: 'CONFIRMED', disposition: { state: 'POSTED_LIVE', payable: 700, fee: 300 } },
        { amount: 600, status: 'CANCELLED', disposition: { state: 'POSTED_MARKED', payable: 400, fee: 200 } },
      ],
    ]);
    const outstanding = await read.computeOutstanding(prisma, s.tenantId, s.caseIds[0], s.caseClientIds[0], 'TRY');
    const res = await summaryOf(s);
    expect(outstanding.toString()).toBe('700');
    expect(res.clientScoped.payableNet).toBe(outstanding.toString());
  });
});

async function cleanupTenant(prisma: PrismaClient, tenantId: string): Promise<void> {
  const steps: Array<() => Promise<unknown>> = [
    () => prisma.collectionDispositionLine.deleteMany({ where: { disposition: { tenantId } } }),
    () => prisma.collectionDisposition.deleteMany({ where: { tenantId } }),
    () => prisma.collection.deleteMany({ where: { tenantId } }),
    () => prisma.caseBalance.deleteMany({ where: { tenantId } }),
    () => prisma.caseClient.deleteMany({ where: { case: { tenantId } } }),
    () => prisma.case.deleteMany({ where: { tenantId } }),
    () => prisma.client.deleteMany({ where: { tenantId } }),
    () => prisma.tenant.deleteMany({ where: { id: tenantId } }),
  ];
  for (const step of steps) {
    await step().catch(() => undefined);
  }
}
