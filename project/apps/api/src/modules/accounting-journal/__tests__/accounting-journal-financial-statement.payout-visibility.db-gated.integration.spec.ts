/**
 * Muhasebe Defteri (CLIENT_CASE_STATEMENT) — yazıcı → okuyucu sınırı, GERÇEK PostgreSQL.
 *
 * Neyi kanıtlar: günlük satırını GERÇEK yazıcılar yazar (dağıtım kesinleştirme, müvekkile ödeme, mahsup,
 * mahsup iptali, genel ters kayıt); ekstre projeksiyonu o satırları okur. Ölçüt, tek kaynak olan
 * `ClientSettlementReadService.computeOutstanding` ile ekstre kapanışının eşitliğidir.
 *
 * Neden var: yazıcı ve okuyucu ayrı birim testleriyle ayrı ayrı yeşildi. Ödeme yazıcısı günlük satırına
 * `clientId` yazmıyor (yalnız `caseClientId`); okuyucu ise `clientId` ile süzüyordu → müvekkile yapılan ödeme
 * ekstrede hiç görünmüyordu (2026-10-01 ölçümü: ödenecek 1.200 ↔ ekstre kapanışı 1.500). Bu test iki tarafı
 * birlikte koşturur; test içinde iş mantığı KOPYALANMAZ, günlük satırı elle YAZILMAZ.
 */
import 'reflect-metadata';
import { Prisma, PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';

import { describeDb } from '../../../../test/describe-db';
import { PrismaService } from '../../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { ClientOffsetService } from '../../client-settlement/client-offset.service';
import { ClientPayoutService } from '../../client-settlement/client-payout.service';
import { ClientSettlementReadService } from '../../client-settlement/client-settlement-read.service';
import { DispositionPostingService } from '../../client-settlement/disposition-posting.service';
import { PayoutApprovalPolicy } from '../../office-approval/client-payout-approval.policy';
import { OfficeApprovalService } from '../../office-approval/office-approval.service';
import { AccountingJournalFinancialStatementProjectionService } from '../accounting-journal-financial-statement.projection.service';
import { AccountingJournalReversalService } from '../accounting-journal-reversal.service';
import { AccountingJournalWriterService } from '../accounting-journal.writer';

const D = (n: string | number) => new Prisma.Decimal(n);

const PERIOD = {
  from: '2020-01-01T00:00:00.000Z',
  to: '2100-12-31T23:59:59.999Z',
  dateBasis: 'postedAt' as const,
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
  collectionId: string;
  dispositionId: string;
  expenseRequestId: string;
  creditors: Creditor[];
}

describeDb('Muhasebe Defteri: yazıcı → okuyucu sınırı (gerçek PostgreSQL)', () => {
  jest.setTimeout(120_000);

  let prisma: PrismaService;
  let posting: DispositionPostingService;
  let payout: ClientPayoutService;
  let offset: ClientOffsetService;
  let approval: OfficeApprovalService;
  let reversal: AccountingJournalReversalService;
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
    offset = new ClientOffsetService(prisma, audit, readService);
    reversal = new AccountingJournalReversalService(prisma, audit, new AccountingJournalWriterService(prisma));
    projection = new AccountingJournalFinancialStatementProjectionService(prisma);
  });

  afterAll(async () => {
    // Fixture temizliği: yalnız bu spec'in ürettiği kiracılar; bağımlılık sırasıyla.
    for (const tenantId of createdTenants) {
      await cleanupTenant(prisma, tenantId);
    }
    await prisma.$disconnect();
  });

  /**
   * Kesinleştirme öncesi (DISTRIBUTION_APPROVED) bir dağıtım kurar; günlük satırı YAZMAZ.
   * Her alacaklı için bir CLIENT_PAYABLE satırı; tahsilat tutarı satırların toplamıdır.
   */
  async function seedScenario(payables: string[]): Promise<Scenario> {
    const sfx = randomUUID().slice(0, 8);
    const tenant = await prisma.tenant.create({
      data: { name: `Defter ${sfx}`, slug: `defter-${sfx}` },
      select: { id: true },
    });
    createdTenants.push(tenant.id);

    const user = await prisma.user.create({
      data: {
        tenantId: tenant.id,
        email: `defter-${sfx}@example.test`,
        name: 'Defter',
        surname: 'Ortak',
        passwordHash: 'x'.repeat(20),
      },
      select: { id: true },
    });
    // Dağıtım kesinleştirme, ödeme ve mahsup için PARTNER (office-admin) kapasitesi gerekir.
    await prisma.lawyer.create({
      data: { tenantId: tenant.id, name: 'Defter', surname: 'Ortak', lawyerRank: 'PARTNER', userId: user.id },
    });

    const kase = await prisma.case.create({
      data: { tenantId: tenant.id, fileNumber: `DEFTER-${sfx}`, type: 'GENERAL_EXECUTION' },
      select: { id: true },
    });

    const creditors: Creditor[] = [];
    for (const [index, payable] of payables.entries()) {
      const client = await prisma.client.create({
        data: { tenantId: tenant.id, type: 'PERSON', name: `Defter Müvekkil ${index + 1} ${sfx}` },
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
        type: 'TAHSILAT',
        date: new Date(),
        idempotencyKey: `defter-col-${sfx}`,
        status: 'CONFIRMED',
      },
      select: { id: true },
    });

    // Mahsup senaryosu için ilk müvekkilin ödenmemiş masraf talebi.
    const expenseRequest = await prisma.expenseRequest.create({
      data: {
        tenantId: tenant.id,
        caseId: kase.id,
        clientId: creditors[0].clientId,
        totalAmount: D('1000.00'),
        paidTotal: D('0.00'),
        currency: 'TRY',
        status: 'SENT',
        expenseApprovalStatus: 'APPROVED',
        createdById: user.id,
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
        payloadHash: `defter-${sfx}`,
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
        currency: 'TRY',
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
      collectionId: collection.id,
      dispositionId: disposition.id,
      expenseRequestId: expenseRequest.id,
      creditors,
    };
  }

  /** GERÇEK kesinleştirme: dağıtım günlük satırlarını ürün yazıcısı yazar. */
  async function post(s: Scenario): Promise<void> {
    await posting.post(s.tenantId, s.dispositionId, { userId: s.userId });
  }

  /** GERÇEK ödeme zinciri (sayfadaki akış): talep → onay → kesinleştirme. */
  async function pay(s: Scenario, creditor: Creditor, amount: string): Promise<string> {
    const dto = {
      caseId: s.caseId,
      caseClientId: creditor.caseClientId,
      amount,
      currency: 'TRY',
      idempotencyKey: `defter-payout-${randomUUID()}`,
    };
    const requested = await payout.requestPayout(s.tenantId, dto, { userId: s.userId });
    await approval.approve(requested.approvalRequestId, s.userId);
    const result = await payout.finalize(s.tenantId, requested.approvalRequestId, dto, { userId: s.userId });
    return result.payoutId;
  }

  async function statement(
    s: Scenario,
    creditor: Creditor,
    overrides: { tenantId?: string; clientId?: string; caseClientId?: string | null } = {},
  ) {
    return projection.getClientCaseStatement({
      tenantId: overrides.tenantId ?? s.tenantId,
      statementType: 'CLIENT_CASE_STATEMENT',
      period: PERIOD,
      currency: 'TRY',
      scope: {
        caseId: s.caseId,
        clientId: overrides.clientId ?? creditor.clientId,
        caseClientId: overrides.caseClientId === undefined ? creditor.caseClientId : overrides.caseClientId,
      },
    });
  }

  async function outstanding(s: Scenario, creditor: Creditor): Promise<string> {
    const value = await readService.computeOutstanding(prisma, s.tenantId, s.caseId, creditor.caseClientId, 'TRY');
    return value.toFixed(2);
  }

  const movementsOf = (report: Awaited<ReturnType<typeof statement>>) =>
    report.movements.map((movement) => `${movement.direction} ${movement.amount} ${movement.source.displayRef}`);

  it('kontrol: kesinleşmiş dağıtımdan sonra, ödeme yokken ekstre kapanışı ödenecek tutara eşittir', async () => {
    const s = await seedScenario(['1500.00']);
    const [a] = s.creditors;
    await post(s);

    const report = await statement(s, a);

    expect(movementsOf(report)).toEqual(['CREDIT 1500.00 COLLECTION_DISPOSITION_LINE:posted']);
    expect(report.closing.amount).toBe('1500.00');
    expect(await outstanding(s, a)).toBe('1500.00');
  });

  it('müvekkile ödeme ekstrede borç satırı olarak görünür; kapanış ödenecek tutara eşittir', async () => {
    const s = await seedScenario(['1500.00']);
    const [a] = s.creditors;
    await post(s);
    await pay(s, a, '300');

    const report = await statement(s, a);

    expect(movementsOf(report)).toEqual([
      'CREDIT 1500.00 COLLECTION_DISPOSITION_LINE:posted',
      'DEBIT 300.00 CLIENT_PAYOUT:recorded',
    ]);
    expect(report.closing.amount).toBe('1200.00');
    expect(await outstanding(s, a)).toBe('1200.00');
    // Yanıttaki her hareket istenen müvekkile ve onun dosya bağına aittir.
    expect(report.movements.every((movement) => movement.clientId === a.clientId)).toBe(true);
    expect(report.movements.every((movement) => movement.caseClientId === a.caseClientId)).toBe(true);
  });

  it('istekte caseClientId verilmese de ödeme görünür', async () => {
    const s = await seedScenario(['1500.00']);
    const [a] = s.creditors;
    await post(s);
    await pay(s, a, '300');

    const report = await statement(s, a, { caseClientId: null });

    expect(movementsOf(report)).toEqual([
      'CREDIT 1500.00 COLLECTION_DISPOSITION_LINE:posted',
      'DEBIT 300.00 CLIENT_PAYOUT:recorded',
    ]);
    expect(report.closing.amount).toBe('1200.00');
  });

  it('mahsup, mahsup iptali ve ödeme birlikteyken kapanış her adımda ödenecek tutara eşittir', async () => {
    const s = await seedScenario(['1800.00']);
    const [a] = s.creditors;
    await post(s);

    const applied = await offset.createOffset(s.tenantId, s.userId, {
      clientId: a.clientId,
      currency: 'TRY',
      payableCaseId: s.caseId,
      payableCaseClientId: a.caseClientId,
      expenseCaseId: s.caseId,
      expenseRequestId: s.expenseRequestId,
      amount: '400',
      idempotencyKey: `defter-offset-${randomUUID()}`,
    });
    expect((await statement(s, a)).closing.amount).toBe('1400.00');
    expect(await outstanding(s, a)).toBe('1400.00');

    await offset.reverseOffset(s.tenantId, s.userId, applied.offsetId, {
      reason: 'Defter testi: mahsup geri alma',
      idempotencyKey: `defter-offset-rev-${randomUUID()}`,
    });
    expect((await statement(s, a)).closing.amount).toBe('1800.00');
    expect(await outstanding(s, a)).toBe('1800.00');

    await pay(s, a, '350');
    const report = await statement(s, a);
    expect(movementsOf(report)).toEqual([
      'CREDIT 1800.00 COLLECTION_DISPOSITION_LINE:posted',
      'DEBIT 400.00 CLIENT_OFFSET:apply',
      'CREDIT 400.00 CLIENT_OFFSET:reversal',
      'DEBIT 350.00 CLIENT_PAYOUT:recorded',
    ]);
    expect(report.closing.amount).toBe('1450.00');
    expect(await outstanding(s, a)).toBe('1450.00');
  });

  it('çok müvekkilli dosyada her müvekkil yalnız kendi ödemesini görür', async () => {
    const s = await seedScenario(['900.00', '600.00']);
    const [a, b] = s.creditors;
    await post(s);
    await pay(s, a, '300');
    await pay(s, b, '100');

    const reportA = await statement(s, a);
    const reportB = await statement(s, b);

    expect(movementsOf(reportA)).toEqual([
      'CREDIT 900.00 COLLECTION_DISPOSITION_LINE:posted',
      'DEBIT 300.00 CLIENT_PAYOUT:recorded',
    ]);
    expect(reportA.closing.amount).toBe('600.00');
    expect(await outstanding(s, a)).toBe('600.00');

    expect(movementsOf(reportB)).toEqual([
      'CREDIT 600.00 COLLECTION_DISPOSITION_LINE:posted',
      'DEBIT 100.00 CLIENT_PAYOUT:recorded',
    ]);
    expect(reportB.closing.amount).toBe('500.00');
    expect(await outstanding(s, b)).toBe('500.00');

    // caseClientId verilmeden de müvekkiller birbirinin ödemesini görmez.
    expect((await statement(s, a, { caseClientId: null })).closing.amount).toBe('600.00');
    expect((await statement(s, b, { caseClientId: null })).closing.amount).toBe('500.00');
  });

  it('başka müvekkilin dosya bağıyla ya da başka kiracıyla sorulursa ödeme satırı sızmaz', async () => {
    const s = await seedScenario(['900.00', '600.00']);
    const [a, b] = s.creditors;
    await post(s);
    await pay(s, a, '300');
    await pay(s, b, '100');

    // Müvekkil A + müvekkil B'nin CaseClient kimliği: iki koşul birlikte hiçbir satırı tutmaz.
    const crossed = await statement(s, a, { caseClientId: b.caseClientId });
    expect(crossed.movements).toEqual([]);
    expect(crossed.closing.amount).toBe('0.00');

    // Başka kiracı kimliği: CaseClient çözülmez, günlük satırı da kiracıya bağlıdır.
    const otherTenant = await seedScenario(['100.00']);
    const foreign = await statement(s, a, { tenantId: otherTenant.tenantId });
    expect(foreign.movements).toEqual([]);
    expect(foreign.closing.amount).toBe('0.00');
  });

  it('ödeme günlük kaydının genel ters kaydı alındıysa ekstre ödemeyi ve ters kaydını birlikte gösterir (günlüğe sadık)', async () => {
    const s = await seedScenario(['1200.00']);
    const [a] = s.creditors;
    await post(s);
    const payoutId = await pay(s, a, '250');
    const entry = await prisma.accountingJournalEntry.findFirstOrThrow({
      where: { tenantId: s.tenantId, sourceType: 'CLIENT_PAYOUT', sourceId: payoutId },
      select: { id: true },
    });

    await reversal.reverseEntry(s.tenantId, s.userId, entry.id, { reason: 'Defter testi: ödeme günlük ters kaydı' });

    const report = await statement(s, a);
    expect(movementsOf(report)).toEqual([
      'CREDIT 1200.00 COLLECTION_DISPOSITION_LINE:posted',
      'DEBIT 250.00 CLIENT_PAYOUT:recorded',
      'CREDIT 250.00 ACCOUNTING_JOURNAL_ENTRY:reversal',
    ]);
    // Ekstre günlüğü izler. Genel ters kayıt ödeme kaydını (ClientPayout RECORDED) değiştirmediği için ödenecek
    // tutar 950 kalır; bu ayrışma ters kayıt ucunun anlamına ilişkin ayrı bir owner kararıdır (K3), ekstrenin değil.
    expect(report.closing.amount).toBe('1200.00');
    expect(await outstanding(s, a)).toBe('950.00');
  });
});

/** Bu spec'in ürettiği kiracının satırlarını bağımlılık sırasıyla siler (en iyi çaba; disposable test DB). */
async function cleanupTenant(prisma: PrismaClient, tenantId: string): Promise<void> {
  const steps: Array<() => Promise<unknown>> = [
    () => prisma.auditLog.deleteMany({ where: { tenantId } }),
    () => prisma.clientPayoutAllocation.deleteMany({ where: { tenantId } }),
    () => prisma.clientPayout.deleteMany({ where: { tenantId } }),
    () => prisma.clientOffset.deleteMany({ where: { tenantId } }),
    () => prisma.accountingJournalLine.deleteMany({ where: { tenantId } }),
    // Ters kayıt girdileri özgün girdiye Restrict ile bağlı → önce ters kayıtlar.
    () => prisma.accountingJournalEntry.deleteMany({ where: { tenantId, reversalOfEntryId: { not: null } } }),
    () => prisma.accountingJournalEntry.deleteMany({ where: { tenantId } }),
    () => prisma.expenseRequest.deleteMany({ where: { tenantId } }),
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
