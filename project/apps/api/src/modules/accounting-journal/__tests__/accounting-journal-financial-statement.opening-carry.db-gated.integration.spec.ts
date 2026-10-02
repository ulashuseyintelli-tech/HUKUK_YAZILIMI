/**
 * Muhasebe Defteri (CLIENT_CASE_STATEMENT) — dönem öncesi hareketlerin açılışa devri, GERÇEK PostgreSQL.
 *
 * Neyi kanıtlar: günlük satırlarını GERÇEK yazıcılar yazar (dağıtım kesinleştirme, müvekkile ödeme); satırların
 * `postedAt` değeri senaryo tarihlerine ÇEKİLİR (yalnız tarih; tutar / boyut / hesap dokunulmaz). Ekstre
 * projeksiyonu, dönem başlangıcından ÖNCEKİ satırları açılışa devreder: kapanış = açılış + dönem net hareketi.
 *
 * Neden var: açılış her zaman 0,00 yazılıyordu ve kapanış yalnız dönem içi hareketlerin toplamıydı; dönem
 * başlangıcı ilk hareketten sonraya alınınca kapanış "Müvekkile Borç (Net)" ile ayrışıyordu. Ölçüt, tek kaynak
 * olan `ClientSettlementReadService.computeOutstanding` ile "bugüne kadarki" kapanışın eşitliğidir.
 */
import 'reflect-metadata';
import { BadRequestException } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';

import { describeDb } from '../../../../test/describe-db';
import { PrismaService } from '../../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { ClientPayoutService } from '../../client-settlement/client-payout.service';
import { ClientSettlementReadService } from '../../client-settlement/client-settlement-read.service';
import { DispositionPostingService } from '../../client-settlement/disposition-posting.service';
import { PayoutApprovalPolicy } from '../../office-approval/client-payout-approval.policy';
import { OfficeApprovalService } from '../../office-approval/office-approval.service';
import { AccountingJournalFinancialStatementProjectionService } from '../accounting-journal-financial-statement.projection.service';

const D = (n: string | number) => new Prisma.Decimal(n);

/** Senaryo tarihleri (UTC anları; hepsi geçmişte, dönem sınırları testte açıkça seçilir). */
const AT = {
  dispositionPosted: '2026-03-10T09:00:00.000Z',
  payoutRecorded: '2026-05-20T09:00:00.000Z',
};

interface Creditor {
  clientId: string;
  caseClientId: string;
  payable: string;
}

interface Scenario {
  tenantId: string;
  userId: string;
  caseId: string;
  currency: 'TRY' | 'USD';
  dispositionId: string;
  creditors: Creditor[];
}

describeDb('Muhasebe Defteri: açılış devri (gerçek PostgreSQL)', () => {
  jest.setTimeout(120_000);

  let prisma: PrismaService;
  let posting: DispositionPostingService;
  let payout: ClientPayoutService;
  let approval: OfficeApprovalService;
  let readService: ClientSettlementReadService;
  let projection: AccountingJournalFinancialStatementProjectionService;
  const createdTenants: string[] = [];

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();

    const audit = new AuditService(prisma);
    const policy = new PayoutApprovalPolicy(prisma);
    approval = new OfficeApprovalService(prisma, audit, undefined, policy);
    readService = new ClientSettlementReadService(prisma);
    posting = new DispositionPostingService(prisma, approval, readService);
    payout = new ClientPayoutService(prisma, readService, audit, approval, policy);
    projection = new AccountingJournalFinancialStatementProjectionService(prisma);
  });

  afterAll(async () => {
    for (const tenantId of createdTenants) {
      await cleanupTenant(prisma, tenantId);
    }
    await prisma.$disconnect();
  });

  /** Kesinleştirme öncesi (DISTRIBUTION_APPROVED) bir dağıtım kurar; günlük satırı YAZMAZ. */
  async function seedScenario(payables: string[], currency: 'TRY' | 'USD' = 'TRY'): Promise<Scenario> {
    const sfx = randomUUID().slice(0, 8);
    const tenant = await prisma.tenant.create({
      data: { name: `Açılış ${sfx}`, slug: `acilis-${sfx}` },
      select: { id: true },
    });
    createdTenants.push(tenant.id);

    const user = await prisma.user.create({
      data: {
        tenantId: tenant.id,
        email: `acilis-${sfx}@example.test`,
        name: 'Açılış',
        surname: 'Ortak',
        passwordHash: 'x'.repeat(20),
      },
      select: { id: true },
    });
    await prisma.lawyer.create({
      data: { tenantId: tenant.id, name: 'Açılış', surname: 'Ortak', lawyerRank: 'PARTNER', userId: user.id },
    });

    const kase = await prisma.case.create({
      data: { tenantId: tenant.id, fileNumber: `ACILIS-${sfx}`, type: 'GENERAL_EXECUTION', currency },
      select: { id: true },
    });

    const creditors: Creditor[] = [];
    for (const [index, payable] of payables.entries()) {
      const client = await prisma.client.create({
        data: { tenantId: tenant.id, type: 'PERSON', name: `Açılış Müvekkil ${index + 1} ${sfx}` },
        select: { id: true },
      });
      const caseClient = await prisma.caseClient.create({
        data: { caseId: kase.id, clientId: client.id, role: index === 0 ? 'ALACAKLI' : 'ORTAK_ALACAKLI' },
        select: { id: true },
      });
      creditors.push({ clientId: client.id, caseClientId: caseClient.id, payable });
    }

    const total = payables.reduce((sum, amount) => sum.plus(D(amount)), D(0));
    const collection = await prisma.collection.create({
      data: {
        tenantId: tenant.id,
        caseId: kase.id,
        amount: total,
        currency,
        type: 'TAHSILAT',
        date: new Date(),
        idempotencyKey: `acilis-col-${sfx}`,
        status: 'CONFIRMED',
      },
      select: { id: true },
    });

    const approvalRow = await prisma.officeApprovalRequest.create({
      data: {
        tenantId: tenant.id,
        actionCode: 'COLLECTION_DISPOSITION_POST',
        targetType: 'COLLECTION_DISPOSITION',
        targetRef: 'pending',
        requesterUserId: user.id,
        approverUserId: user.id,
        status: 'APPROVED',
        decidedAt: new Date(),
        savedIntent: {},
        payloadHash: `acilis-${sfx}`,
      },
      select: { id: true },
    });

    const single = creditors.length === 1;
    const disposition = await prisma.collectionDisposition.create({
      data: {
        tenantId: tenant.id,
        caseId: kase.id,
        collectionId: collection.id,
        beneficiaryScope: single ? 'SINGLE_CASE_CLIENT' : 'CASE_CREDITOR_CLUSTER',
        caseClientId: single ? creditors[0].caseClientId : null,
        status: 'DISTRIBUTION_APPROVED',
        totalAmount: total,
        currency,
        approvalRequestId: approvalRow.id,
        approvedById: user.id,
        lines: {
          create: creditors.map((creditor) => ({
            type: 'CLIENT_PAYABLE' as const,
            amount: D(creditor.payable),
            caseClientId: creditor.caseClientId,
          })),
        },
      },
      select: { id: true },
    });

    return {
      tenantId: tenant.id,
      userId: user.id,
      caseId: kase.id,
      currency,
      dispositionId: disposition.id,
      creditors,
    };
  }

  /** GERÇEK kesinleştirme: dağıtım günlük satırlarını ürün yazıcısı yazar; ardından gün senaryo tarihine çekilir. */
  async function post(s: Scenario, at: string = AT.dispositionPosted): Promise<void> {
    await posting.post(s.tenantId, s.dispositionId, { userId: s.userId });
    await setEntryDate(s, 'COLLECTION_DISPOSITION_LINE', at);
  }

  /** GERÇEK ödeme zinciri (talep → onay → kesinleştirme); ardından ödeme günlüğü senaryo tarihine çekilir. */
  async function pay(s: Scenario, creditor: Creditor, amount: string, at: string = AT.payoutRecorded): Promise<void> {
    const dto = {
      caseId: s.caseId,
      caseClientId: creditor.caseClientId,
      amount,
      currency: s.currency,
      idempotencyKey: `acilis-payout-${randomUUID()}`,
    };
    const requested = await payout.requestPayout(s.tenantId, dto, { userId: s.userId });
    await approval.approve(requested.approvalRequestId, s.userId);
    await payout.finalize(s.tenantId, requested.approvalRequestId, dto, { userId: s.userId });
    await setEntryDate(s, 'CLIENT_PAYOUT', at);
  }

  /**
   * Kaynak türündeki günlük girdilerinin YALNIZ tarihini senaryo anına çeker (tutar / boyut / hesap dokunulmaz).
   * Yazıcılar tarihi "şimdi" yazar; dönem öncesi ve sınır senaryoları için gerçek zaman geçmesi beklenemez.
   */
  async function setEntryDate(
    s: Scenario,
    sourceType: 'COLLECTION_DISPOSITION_LINE' | 'CLIENT_PAYOUT',
    at: string,
  ): Promise<void> {
    const when = new Date(at);
    const result = await prisma.accountingJournalEntry.updateMany({
      where: { tenantId: s.tenantId, sourceType },
      data: { postedAt: when, sourceOccurredAt: when },
    });
    expect(result.count).toBeGreaterThan(0);
  }

  function statement(
    s: Scenario,
    creditor: Creditor,
    period: { from: string; to: string },
    overrides: { tenantId?: string; currency?: string; caseClientId?: string | null } = {},
  ) {
    return projection.getClientCaseStatement({
      tenantId: overrides.tenantId ?? s.tenantId,
      statementType: 'CLIENT_CASE_STATEMENT',
      period: { ...period, dateBasis: 'postedAt' },
      currency: overrides.currency ?? s.currency,
      scope: {
        caseId: s.caseId,
        clientId: creditor.clientId,
        caseClientId: overrides.caseClientId === undefined ? creditor.caseClientId : overrides.caseClientId,
      },
    });
  }

  async function outstanding(s: Scenario, creditor: Creditor): Promise<string> {
    const value = await readService.computeOutstanding(prisma, s.tenantId, s.caseId, creditor.caseClientId, s.currency);
    return value.toFixed(2);
  }

  const movementsOf = (report: Awaited<ReturnType<typeof statement>>) =>
    report.movements.map((movement) => `${movement.direction} ${movement.amount} ${movement.source.displayRef}`);

  it('dönem başlangıcı ilk hareketten sonraysa dönem öncesi hareketler açılışa devredilir (kapanış = açılış + dönem)', async () => {
    const s = await seedScenario(['1500.00']);
    const [a] = s.creditors;
    await post(s);
    await pay(s, a, '300');

    // Mayıs: dağıtım (Mart) açılışa girer, ödeme (20 Mayıs) dönemde.
    const may = await statement(s, a, { from: '2026-05-01T00:00:00.000Z', to: '2026-05-31T23:59:59.999Z' });
    expect(may.opening.amount).toBe('1500.00');
    expect(movementsOf(may)).toEqual(['DEBIT 300.00 CLIENT_PAYOUT:recorded']);
    expect(may.closing.amount).toBe('1200.00');

    // Haziran: dönemde hareket yok; açılış ve kapanış ikisi de 1200.00 (ödeme açılışa devredildi).
    const june = await statement(s, a, { from: '2026-06-01T00:00:00.000Z', to: '2026-06-30T23:59:59.999Z' });
    expect(june.opening.amount).toBe('1200.00');
    expect(june.movements).toEqual([]);
    expect(june.closing.amount).toBe('1200.00');

    // Tüm tarihçe: açılış 0.00 (devredilecek öncül yok); kapanış ödenecek tutardır.
    const all = await statement(s, a, { from: '2026-01-01T00:00:00.000Z', to: '2026-12-31T23:59:59.999Z' });
    expect(all.opening.amount).toBe('0.00');
    expect(movementsOf(all)).toEqual([
      'CREDIT 1500.00 COLLECTION_DISPOSITION_LINE:posted',
      'DEBIT 300.00 CLIENT_PAYOUT:recorded',
    ]);
    expect(all.closing.amount).toBe('1200.00');
    expect(all.closing.amount).toBe(await outstanding(s, a));
  });

  it('ardışık dönemlerde bir dönemin kapanışı sonrakinin açılışıdır; hiçbir tarihten sonra kapanış ödenecek tutardan sapmaz', async () => {
    const s = await seedScenario(['1500.00']);
    const [a] = s.creditors;
    await post(s);
    await pay(s, a, '300');

    const periods = [
      { from: '2026-01-01T00:00:00.000Z', to: '2026-03-31T23:59:59.999Z' },
      { from: '2026-04-01T00:00:00.000Z', to: '2026-05-31T23:59:59.999Z' },
      { from: '2026-06-01T00:00:00.000Z', to: '2026-12-31T23:59:59.999Z' },
    ];
    const reports = [];
    for (const period of periods) reports.push(await statement(s, a, period));

    expect(reports.map((r) => [r.opening.amount, r.closing.amount])).toEqual([
      ['0.00', '1500.00'],
      ['1500.00', '1200.00'],
      ['1200.00', '1200.00'],
    ]);
    // Zincir: her dönemin açılışı bir öncekinin kapanışı.
    expect(reports[1].opening.amount).toBe(reports[0].closing.amount);
    expect(reports[2].opening.amount).toBe(reports[1].closing.amount);
    expect(reports[2].closing.amount).toBe(await outstanding(s, a));
  });

  it('dönem sınırı milisaniye hassasiyetindedir: sınırdaki satır ya açılışta ya dönemdedir; boşluk ve çift sayım yok', async () => {
    const s = await seedScenario(['1500.00']);
    const [a] = s.creditors;
    await post(s);
    await pay(s, a, '300');
    const boundary = '2026-05-01T00:00:00.000Z';
    await setEntryDate(s, 'CLIENT_PAYOUT', boundary);

    // Sınırdan bir ms ÖNCE biten dönem ödemeyi görmez.
    const before = await statement(s, a, { from: '2026-01-01T00:00:00.000Z', to: '2026-04-30T23:59:59.999Z' });
    expect(before.closing.amount).toBe('1500.00');

    // Sınırda BAŞLAYAN dönem: ödeme dönemin hareketi, açılış yalnız Mart dağıtımıdır.
    const startsAt = await statement(s, a, { from: boundary, to: '2026-05-31T23:59:59.999Z' });
    expect(startsAt.opening.amount).toBe('1500.00');
    expect(movementsOf(startsAt)).toEqual(['DEBIT 300.00 CLIENT_PAYOUT:recorded']);
    expect(startsAt.closing.amount).toBe('1200.00');

    // Sınırı bir ms SONRA başlayan dönem: ödeme açılışa devredilir (çift sayım yok).
    const startsAfter = await statement(s, a, { from: '2026-05-01T00:00:00.001Z', to: '2026-05-31T23:59:59.999Z' });
    expect(startsAfter.opening.amount).toBe('1200.00');
    expect(startsAfter.movements).toEqual([]);
    expect(startsAfter.closing.amount).toBe('1200.00');

    // Sınırda BİTEN dönem (lte): ödeme dönemdedir.
    const endsAt = await statement(s, a, { from: '2026-04-01T00:00:00.000Z', to: boundary });
    expect(endsAt.opening.amount).toBe('1500.00');
    expect(endsAt.closing.amount).toBe('1200.00');
  });

  it('Türkiye takvimi gün sınırı: TSİ 1 Mayıs 00:00 (= 30 Nisan 21:00 UTC) ile başlayan dönem 30 Nisan 23:59 TSİ ödemesini açılışa katar', async () => {
    const s = await seedScenario(['1500.00']);
    const [a] = s.creditors;
    await post(s);
    await pay(s, a, '300');
    // 30 Nisan 23:59 TSİ = 30 Nisan 20:59 UTC.
    await setEntryDate(s, 'CLIENT_PAYOUT', '2026-04-30T20:59:00.000Z');

    const may = await statement(s, a, { from: '2026-04-30T21:00:00.000Z', to: '2026-05-31T20:59:59.999Z' });
    expect(may.opening.amount).toBe('1200.00');
    expect(may.movements).toEqual([]);
  });

  it('başka kiracının satırı açılışa girmez; başka para biriminin satırı açılışa girmez', async () => {
    const s = await seedScenario(['1500.00']);
    const [a] = s.creditors;
    await post(s);
    const period = { from: '2026-06-01T00:00:00.000Z', to: '2026-06-30T23:59:59.999Z' };

    expect((await statement(s, a, period)).opening.amount).toBe('1500.00');

    // Başka kiracı kimliğiyle sorulursa kiracı süzgeci hiçbir satırı tutmaz.
    const other = await seedScenario(['700.00']);
    await post(other);
    const foreignTenant = await statement(s, a, period, { tenantId: other.tenantId });
    expect(foreignTenant.opening.amount).toBe('0.00');
    expect(foreignTenant.closing.amount).toBe('0.00');

    // Aynı dosya + müvekkil, başka para biriminde sorulursa TRY açılışı devredilmez.
    const usd = await statement(s, a, period, { currency: 'USD' });
    expect(usd.opening.amount).toBe('0.00');
    expect(usd.closing.amount).toBe('0.00');

    // Dövizli dosya yalnız kendi para biriminde açılış taşır; TRY'ye çevrilmez, toplanmaz.
    const usdScenario = await seedScenario(['500.00'], 'USD');
    await post(usdScenario);
    const usdReport = await statement(usdScenario, usdScenario.creditors[0], period);
    expect(usdReport.currency).toBe('USD');
    expect(usdReport.opening.amount).toBe('500.00');
    expect(usdReport.opening.currency).toBe('USD');
    const usdAsTry = await statement(usdScenario, usdScenario.creditors[0], period, { currency: 'TRY' });
    expect(usdAsTry.opening.amount).toBe('0.00');
  });

  it('çok müvekkilli dosyada her müvekkil yalnız kendi dönem öncesi hareketini açılışa devreder', async () => {
    const s = await seedScenario(['900.00', '600.00']);
    const [a, b] = s.creditors;
    await post(s);
    await pay(s, a, '300');
    await pay(s, b, '100');
    const june = { from: '2026-06-01T00:00:00.000Z', to: '2026-06-30T23:59:59.999Z' };

    const reportA = await statement(s, a, june);
    const reportB = await statement(s, b, june);
    expect([reportA.opening.amount, reportA.closing.amount]).toEqual(['600.00', '600.00']);
    expect([reportB.opening.amount, reportB.closing.amount]).toEqual(['500.00', '500.00']);
    expect(reportA.closing.amount).toBe(await outstanding(s, a));
    expect(reportB.closing.amount).toBe(await outstanding(s, b));

    // caseClientId verilmeden de müvekkiller birbirinin açılışını görmez.
    expect((await statement(s, a, june, { caseClientId: null })).opening.amount).toBe('600.00');
    expect((await statement(s, b, june, { caseClientId: null })).opening.amount).toBe('500.00');
  });

  it('kapsamda hiç satır yoksa açılış 0.00 kalır ve "defter kanıtı gerekli" uyarısı korunur', async () => {
    const s = await seedScenario(['1500.00']);
    const [a] = s.creditors; // dağıtım KESİNLEŞTİRİLMEDİ → günlük satırı yok
    const report = await statement(s, a, { from: '2026-06-01T00:00:00.000Z', to: '2026-06-30T23:59:59.999Z' });

    expect(report.opening.amount).toBe('0.00');
    expect(report.movements).toEqual([]);
    expect(report.closing.amount).toBe('0.00');
    expect(report.reconciliation.status).toBe('TRIAL_BALANCE_REQUIRED');
    expect(report.reconciliation.trialBalanceEvidenceStatus).toBe('NO_LINES');
  });

  it('dönemde hareket yok ama dönem öncesi satır varsa defter kanıtı vardır (uyarı "kanıt gerekli" demez)', async () => {
    const s = await seedScenario(['1500.00']);
    const [a] = s.creditors;
    await post(s);

    const report = await statement(s, a, { from: '2026-06-01T00:00:00.000Z', to: '2026-06-30T23:59:59.999Z' });

    expect(report.movements).toEqual([]);
    expect(report.opening.amount).toBe('1500.00');
    expect(report.reconciliation.status).toBe('READY');
    expect(report.reconciliation.trialBalanceEvidenceStatus).toBe('BALANCED');
    expect(report.reconciliation.warnings.map((w) => w.code)).not.toContain('TRIAL_BALANCE_REQUIRED');
  });

  it('geçersiz aralık (başlangıç > bitiş) sessizce başka bir aralığa çevrilmez; 400 döner', async () => {
    const s = await seedScenario(['1500.00']);
    const [a] = s.creditors;
    await post(s);

    await expect(
      statement(s, a, { from: '2026-06-30T00:00:00.000Z', to: '2026-06-01T00:00:00.000Z' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(statement(s, a, { from: 'gecersiz-tarih', to: '2026-06-01T00:00:00.000Z' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});

/** Bu spec'in ürettiği kiracının satırlarını bağımlılık sırasıyla siler (en iyi çaba; disposable test DB). */
async function cleanupTenant(prisma: PrismaClient, tenantId: string): Promise<void> {
  const steps: Array<() => Promise<unknown>> = [
    () => prisma.auditLog.deleteMany({ where: { tenantId } }),
    () => prisma.clientPayoutAllocation.deleteMany({ where: { tenantId } }),
    () => prisma.clientPayout.deleteMany({ where: { tenantId } }),
    () => prisma.accountingJournalLine.deleteMany({ where: { tenantId } }),
    () => prisma.accountingJournalEntry.deleteMany({ where: { tenantId, reversalOfEntryId: { not: null } } }),
    () => prisma.accountingJournalEntry.deleteMany({ where: { tenantId } }),
    () => prisma.collectionDispositionLine.deleteMany({ where: { disposition: { tenantId } } }),
    () => prisma.collectionDisposition.deleteMany({ where: { tenantId } }),
    () => prisma.collection.deleteMany({ where: { tenantId } }),
    () => prisma.officeApprovalRequest.deleteMany({ where: { tenantId } }),
    () => prisma.caseClient.deleteMany({ where: { case: { tenantId } } }),
    () => prisma.case.deleteMany({ where: { tenantId } }),
    () => prisma.lawyer.deleteMany({ where: { tenantId } }),
    () => prisma.user.deleteMany({ where: { tenantId } }),
    () => prisma.client.deleteMany({ where: { tenantId } }),
    () => prisma.tenant.deleteMany({ where: { id: tenantId } }),
  ];
  for (const step of steps) {
    await step().catch(() => undefined);
  }
}
