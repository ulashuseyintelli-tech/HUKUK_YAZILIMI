import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { NotificationDispatcherService } from '@/modules/client-notification/notification-dispatcher.service';
import { OfficeService } from '@/modules/office/office.service';
import { AuditService } from '@/modules/audit/audit.service';
import { CaseBalanceService } from '@/modules/interest-engine/orchestration/case-balance.service';
import { ClientStatementService } from '../client-statement.service';

/**
 * E1 — ekstre üretimi KAYNAK PARA BİRİMİ sınırı (servis düzeyi; prisma mock).
 *
 * Kural: ekstreye girecek kaynaklardan biri TL dışı / belirlenemeyen para birimindeyse üretim, hiçbir kalıcı kayıt
 * (ekstre, satır, denetim günlüğü, bildirim) yazılmadan açık kodla reddedilir. Denetlenen şey Case.currency değil,
 * kaynak satırların KENDİ para birimidir. Gerçek HTTP + disposable PostgreSQL kabulü ayrı spec'te
 * (client-statement-currency.http.db-gated.integration.spec.ts).
 */
const D = (n: number) => new Prisma.Decimal(n);
const TENANT = 'tenant-1';
const CASE = 'case-1';
const CLIENT = 'client-1';
const USER = 'user-1';
const CC = 'cc-1';

const grp = (currency: string | null, count = 1) => ({ currency, _count: { _all: count } });

const mockPrisma: any = {
  case: { findFirst: jest.fn() },
  client: { findFirst: jest.fn() },
  caseClient: { findFirst: jest.fn(), findMany: jest.fn() },
  caseBalance: { findFirst: jest.fn() },
  balanceLedger: { aggregate: jest.fn(), findMany: jest.fn(), groupBy: jest.fn() },
  expenseRequest: { findMany: jest.fn(), groupBy: jest.fn() },
  expensePayment: { findMany: jest.fn(), aggregate: jest.fn() },
  collectionDisposition: { findMany: jest.fn(), groupBy: jest.fn() },
  collectionDispositionLine: { findMany: jest.fn(), aggregate: jest.fn() },
  ledgerAllocation: { findMany: jest.fn() },
  clientPayout: { findMany: jest.fn(), aggregate: jest.fn(), groupBy: jest.fn() },
  clientOffset: { findMany: jest.fn(), groupBy: jest.fn() },
  clientStatement: { create: jest.fn(), update: jest.fn(), findFirst: jest.fn(), count: jest.fn() },
  clientStatementLine: { createMany: jest.fn() },
  $executeRaw: jest.fn(),
  $transaction: jest.fn(),
};
const mockDispatcher: any = { dispatch: jest.fn() };
const mockOffice: any = { getOfficeIdentity: jest.fn() };
const mockAudit: any = { logInTransaction: jest.fn(), log: jest.fn() };
const mockCaseBalance: any = { computeCaseBalance: jest.fn() };

function resetMocks() {
  jest.clearAllMocks();
  mockPrisma.case.findFirst.mockResolvedValue({ id: CASE });
  mockPrisma.client.findFirst.mockResolvedValue({ id: CLIENT });
  mockPrisma.caseClient.findFirst.mockResolvedValue({ id: CC });
  mockPrisma.caseClient.findMany.mockResolvedValue([{ id: CC, caseId: CASE }]);
  mockPrisma.caseBalance.findFirst.mockResolvedValue({ id: 'cb-1' });
  mockPrisma.balanceLedger.aggregate.mockResolvedValue({ _sum: { amount: D(100) } });
  mockPrisma.balanceLedger.findMany.mockResolvedValue([]);
  mockPrisma.balanceLedger.groupBy.mockResolvedValue([grp('TRY', 3)]);
  mockPrisma.expenseRequest.findMany.mockResolvedValue([]);
  mockPrisma.expenseRequest.groupBy.mockResolvedValue([grp('TRY')]);
  mockPrisma.expensePayment.findMany.mockResolvedValue([]);
  mockPrisma.expensePayment.aggregate.mockResolvedValue({ _sum: { amount: null } });
  mockPrisma.collectionDisposition.findMany.mockResolvedValue([]);
  mockPrisma.collectionDisposition.groupBy.mockResolvedValue([grp('TRY')]);
  mockPrisma.collectionDispositionLine.findMany.mockResolvedValue([]);
  mockPrisma.collectionDispositionLine.aggregate.mockResolvedValue({ _sum: { amount: null } });
  mockPrisma.ledgerAllocation.findMany.mockResolvedValue([]);
  mockPrisma.clientPayout.findMany.mockResolvedValue([]);
  mockPrisma.clientPayout.aggregate.mockResolvedValue({ _sum: { amount: null } });
  mockPrisma.clientPayout.groupBy.mockResolvedValue([grp('TRY')]);
  mockPrisma.clientOffset.findMany.mockResolvedValue([]);
  mockPrisma.clientOffset.groupBy.mockResolvedValue([grp('TRY')]);
  mockPrisma.clientStatement.create.mockResolvedValue({ id: 'st-1' });
  mockPrisma.clientStatement.update.mockResolvedValue({});
  mockPrisma.clientStatement.findFirst.mockResolvedValue({ id: 'st-1', lines: [] });
  mockPrisma.clientStatement.count.mockResolvedValue(0);
  mockPrisma.clientStatementLine.createMany.mockResolvedValue({ count: 0 });
  mockPrisma.$executeRaw.mockResolvedValue(1);
  mockPrisma.$transaction.mockImplementation((fn: any) => fn(mockPrisma));
  mockDispatcher.dispatch.mockResolvedValue({ status: 'sent' });
  mockOffice.getOfficeIdentity.mockResolvedValue({ name: 'Test Büro' });
  mockAudit.logInTransaction.mockResolvedValue(undefined);
  mockCaseBalance.computeCaseBalance.mockResolvedValue({ currencyResults: [] });
}

/** Reddin hiçbir kalıcı yan etki bırakmadığını kanıtlar. */
function expectNothingPersisted() {
  expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  expect(mockPrisma.clientStatement.create).not.toHaveBeenCalled();
  expect(mockPrisma.clientStatement.update).not.toHaveBeenCalled();
  expect(mockPrisma.clientStatementLine.createMany).not.toHaveBeenCalled();
  expect(mockAudit.logInTransaction).not.toHaveBeenCalled();
  expect(mockDispatcher.dispatch).not.toHaveBeenCalled();
}

async function rejection(promise: Promise<unknown>): Promise<any> {
  try {
    await promise;
  } catch (e) {
    return e;
  }
  throw new Error('ret bekleniyordu ama işlem başarılı oldu');
}

describe('ClientStatementService — E1 kaynak para birimi sınırı', () => {
  let service: ClientStatementService;

  beforeEach(async () => {
    resetMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClientStatementService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: NotificationDispatcherService, useValue: mockDispatcher },
        { provide: OfficeService, useValue: mockOffice },
        { provide: AuditService, useValue: mockAudit },
        { provide: CaseBalanceService, useValue: mockCaseBalance },
      ],
    }).compile();
    service = module.get(ClientStatementService);
  });

  const dto = { clientId: CLIENT, periodStart: '2026-06-01T00:00:00Z', periodEnd: '2026-06-30T23:59:59Z' };
  const levelDto = { periodStart: '2026-06-01T00:00:00Z', periodEnd: '2026-06-30T23:59:59Z' };

  describe('dosya ekstresi (create)', () => {
    it('geçerli TL kaynaklar: ekstre üretilir ve başlık para birimi açıkça TRY yazılır', async () => {
      await service.create(TENANT, CASE, USER, dto);

      expect(mockPrisma.clientStatement.create).toHaveBeenCalledTimes(1);
      expect(mockPrisma.clientStatement.create.mock.calls[0][0].data.currency).toBe('TRY');
    });

    it.each([
      ['BalanceLedger', 'balanceLedger', 'masraf/avans defteri'],
      ['ExpenseRequest', 'expenseRequest', 'masraf talebi'],
      ['CollectionDisposition', 'collectionDisposition', 'tahsilat dağıtımı'],
      ['ClientPayout', 'clientPayout', 'müvekkile ödeme'],
      ['ClientOffset', 'clientOffset', 'mahsup'],
    ])('%s kaynağında USD → açık kodla reddedilir, hiçbir kalıcı kayıt yazılmaz', async (source, model, label) => {
      mockPrisma[model].groupBy.mockResolvedValue([grp('TRY', 2), grp('USD')]);

      const error = await rejection(service.create(TENANT, CASE, USER, dto));

      expect(error).toBeInstanceOf(BadRequestException);
      const body = error.getResponse();
      expect(body.code).toBe('CLIENT_STATEMENT_UNSUPPORTED_CURRENCY');
      expect(body.reasonCode).toBe('NON_TRY_SOURCE');
      expect(body.currencies).toEqual(['USD']);
      expect(body.sources).toEqual([source]);
      expect(body.message).toContain(label);
      expectNothingPersisted();
    });

    it('para birimi belirlenemeyen satır → reddedilir; TL ya da sıfır varsayılmaz', async () => {
      mockPrisma.balanceLedger.groupBy.mockResolvedValue([grp('', 1)]);

      const error = await rejection(service.create(TENANT, CASE, USER, dto));

      expect(error.getResponse().reasonCode).toBe('CURRENCY_UNDETERMINED');
      expectNothingPersisted();
    });

    it('Case.currency denetime GİRMEZ: dosya USD olsa da kaynaklar TL ise üretilir', async () => {
      mockPrisma.case.findFirst.mockResolvedValue({ id: CASE, currency: 'USD' });

      await service.create(TENANT, CASE, USER, dto);

      expect(mockPrisma.clientStatement.create).toHaveBeenCalledTimes(1);
    });

    it('Case.currency TL olsa da kaynak satırı USD ise reddedilir (doğrudan API çağrısı da yanlış ekstre üretemez)', async () => {
      mockPrisma.case.findFirst.mockResolvedValue({ id: CASE, currency: 'TRY' });
      mockPrisma.clientPayout.groupBy.mockResolvedValue([grp('USD')]);

      const error = await rejection(service.create(TENANT, CASE, USER, dto));

      expect(error.getResponse().code).toBe('CLIENT_STATEMENT_UNSUPPORTED_CURRENCY');
      expectNothingPersisted();
    });

    it('includeRequests=false → masraf talebi kaynağı ekstreye girmediği için denetlenmez', async () => {
      mockPrisma.expenseRequest.groupBy.mockResolvedValue([grp('USD')]);

      await service.create(TENANT, CASE, USER, { ...dto, includeRequests: false });

      expect(mockPrisma.expenseRequest.groupBy).not.toHaveBeenCalled();
      expect(mockPrisma.clientStatement.create).toHaveBeenCalledTimes(1);
    });

    it('alacaklı (caseClient) çözülmemişse dağıtım / ödeme kaynakları ekstreye girmez → denetlenmez', async () => {
      mockPrisma.caseClient.findFirst.mockResolvedValue(null);
      mockPrisma.collectionDisposition.groupBy.mockResolvedValue([grp('USD')]);
      mockPrisma.clientPayout.groupBy.mockResolvedValue([grp('USD')]);

      await service.create(TENANT, CASE, USER, dto);

      expect(mockPrisma.collectionDisposition.groupBy).not.toHaveBeenCalled();
      expect(mockPrisma.clientPayout.groupBy).not.toHaveBeenCalled();
      expect(mockPrisma.clientStatement.create).toHaveBeenCalledTimes(1);
    });

    it('açılış devri dahil: defter denetimi dönem başlangıcıyla sınırlı DEĞİL, dönem sonuna kadar tüm satırları kapsar', async () => {
      await service.create(TENANT, CASE, USER, dto);

      const where = mockPrisma.balanceLedger.groupBy.mock.calls[0][0].where;
      expect(where.caseBalanceId).toBe('cb-1');
      expect(where.createdAt).toEqual({ lte: new Date(dto.periodEnd) });
      expect(mockPrisma.balanceLedger.groupBy.mock.calls[0][0].by).toEqual(['currency']);
    });

    it('büro sınırı: kaynak denetimleri tenant + dosya + alacaklı kapsamıyla yapılır; defter yalnız tenant-scoped bakiyeden', async () => {
      await service.create(TENANT, CASE, USER, dto);

      expect(mockPrisma.caseBalance.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { caseId: CASE, tenantId: TENANT } }));
      expect(mockPrisma.expenseRequest.groupBy.mock.calls[0][0].where).toMatchObject({ tenantId: TENANT, caseId: CASE });
      expect(mockPrisma.collectionDisposition.groupBy.mock.calls[0][0].where).toMatchObject({
        tenantId: TENANT,
        caseId: CASE,
        status: 'POSTED',
        manualReversalRequiredAt: null,
        lines: { some: { caseClientId: CC } },
      });
      expect(mockPrisma.clientPayout.groupBy.mock.calls[0][0].where).toMatchObject({
        tenantId: TENANT,
        caseId: CASE,
        caseClientId: CC,
        status: 'RECORDED',
      });
      const offsetWhere = mockPrisma.clientOffset.groupBy.mock.calls[0][0].where;
      expect(offsetWhere.tenantId).toBe(TENANT);
      expect(offsetWhere.OR).toEqual([{ payableCaseId: CASE, payableCaseClientId: CC }, { expenseCaseId: CASE }]);
    });

    it('ret, dönem çakışma (409) denetiminden ÖNCE gelir ve aktif ekstreyi etkilemez', async () => {
      mockPrisma.clientPayout.groupBy.mockResolvedValue([grp('USD')]);
      mockPrisma.clientStatement.count.mockResolvedValue(1); // aktif ekstre var → 409 beklenirdi

      const error = await rejection(service.create(TENANT, CASE, USER, dto));

      expect(error.getResponse().code).toBe('CLIENT_STATEMENT_UNSUPPORTED_CURRENCY');
      expectNothingPersisted();
    });
  });

  describe('genel ekstre (createClientLevel)', () => {
    it('geçerli TL kaynaklar: ekstre üretilir ve başlık para birimi TRY', async () => {
      await service.createClientLevel(TENANT, CLIENT, USER, levelDto);

      expect(mockPrisma.clientStatement.create).toHaveBeenCalledTimes(1);
      expect(mockPrisma.clientStatement.create.mock.calls[0][0].data.currency).toBe('TRY');
    });

    it.each([
      ['CollectionDisposition', 'collectionDisposition', null],
      ['ClientPayout', 'clientPayout', null],
      ['ExpenseRequest', 'expenseRequest', 'er'],
      ['ExpensePayment', 'expenseRequest', 'ep'],
      ['ClientOffset', 'clientOffset', null],
    ])('%s kaynağında USD → reddedilir, hiçbir kalıcı kayıt yazılmaz', async (source, model, variant) => {
      if (variant === 'er') {
        mockPrisma.expenseRequest.groupBy.mockImplementation((args: any) =>
          Promise.resolve(args.where.payments ? [grp('TRY')] : [grp('USD')]),
        );
      } else if (variant === 'ep') {
        mockPrisma.expenseRequest.groupBy.mockImplementation((args: any) =>
          Promise.resolve(args.where.payments ? [grp('USD')] : [grp('TRY')]),
        );
      } else {
        mockPrisma[model].groupBy.mockResolvedValue([grp('USD')]);
      }

      const error = await rejection(service.createClientLevel(TENANT, CLIENT, USER, levelDto));

      expect(error).toBeInstanceOf(BadRequestException);
      expect(error.getResponse().code).toBe('CLIENT_STATEMENT_UNSUPPORTED_CURRENCY');
      expect(error.getResponse().sources).toEqual([source]);
      expectNothingPersisted();
    });

    it('TL müvekkil alacağı + USD müvekkil alacağı birlikte (karma) → reddedilir', async () => {
      mockPrisma.collectionDisposition.groupBy.mockResolvedValue([grp('TRY', 2), grp('USD')]);

      const error = await rejection(service.createClientLevel(TENANT, CLIENT, USER, levelDto));

      expect(error.getResponse().currencies).toEqual(['USD']);
      expectNothingPersisted();
    });

    it('devir dahil: dağıtım / ödeme denetimi dönem sonuna kadar (dönem öncesi + dönem içi) kapsar ve alacaklı bağlarıyla sınırlıdır', async () => {
      await service.createClientLevel(TENANT, CLIENT, USER, levelDto);

      const dispWhere = mockPrisma.collectionDisposition.groupBy.mock.calls[0][0].where;
      expect(dispWhere).toMatchObject({ tenantId: TENANT, status: 'POSTED', manualReversalRequiredAt: null });
      expect(dispWhere.postedAt).toEqual({ lte: new Date(levelDto.periodEnd) });
      expect(dispWhere.lines.some).toEqual({ type: 'CLIENT_PAYABLE', caseClientId: { in: [CC] } });
      expect(mockPrisma.clientPayout.groupBy.mock.calls[0][0].where).toMatchObject({
        tenantId: TENANT,
        caseClientId: { in: [CC] },
        status: 'RECORDED',
        paidAt: { lte: new Date(levelDto.periodEnd) },
      });
    });

    it('büro / müvekkil sınırı: masraf ve mahsup denetimi tenant + müvekkil kapsamıyla yapılır', async () => {
      await service.createClientLevel(TENANT, CLIENT, USER, levelDto);

      for (const call of mockPrisma.expenseRequest.groupBy.mock.calls) {
        expect(call[0].where).toMatchObject({ tenantId: TENANT, clientId: CLIENT });
      }
      expect(mockPrisma.clientOffset.groupBy.mock.calls[0][0].where).toMatchObject({ tenantId: TENANT, clientId: CLIENT });
    });

    it('alacaklı dosyası olmayan müvekkil: dağıtım / ödeme sorgulanmaz ama masraf ve mahsup yine denetlenir', async () => {
      mockPrisma.caseClient.findMany.mockResolvedValue([]);
      mockPrisma.expenseRequest.groupBy.mockResolvedValue([grp('USD')]);

      const error = await rejection(service.createClientLevel(TENANT, CLIENT, USER, levelDto));

      expect(mockPrisma.collectionDisposition.groupBy).not.toHaveBeenCalled();
      expect(mockPrisma.clientPayout.groupBy).not.toHaveBeenCalled();
      expect(error.getResponse().code).toBe('CLIENT_STATEMENT_UNSUPPORTED_CURRENCY');
      expectNothingPersisted();
    });
  });

  describe('yenileme (supersede)', () => {
    const supersedeDto = { periodStart: '2026-06-01T00:00:00Z', periodEnd: '2026-06-30T23:59:59Z' };

    it('dosya ekstresi: kaynakta USD varsa yenileme reddedilir, eski ekstre ACTIVE kalır ve hiçbir şey yazılmaz', async () => {
      mockPrisma.clientStatement.findFirst.mockResolvedValue({
        id: 'old-1',
        status: 'ACTIVE',
        caseId: CASE,
        clientId: CLIENT,
      });
      mockPrisma.clientPayout.groupBy.mockResolvedValue([grp('USD')]);

      const error = await rejection(service.supersede(TENANT, 'old-1', USER, supersedeDto));

      expect(error.getResponse().code).toBe('CLIENT_STATEMENT_UNSUPPORTED_CURRENCY');
      expectNothingPersisted(); // update (SUPERSEDED damgası) dahil
    });

    it('genel ekstre: kaynakta USD varsa yenileme reddedilir, eski ekstre ACTIVE kalır', async () => {
      mockPrisma.clientStatement.findFirst.mockResolvedValue({
        id: 'old-2',
        status: 'ACTIVE',
        caseId: null,
        clientId: CLIENT,
      });
      mockPrisma.collectionDisposition.groupBy.mockResolvedValue([grp('USD')]);

      const error = await rejection(service.supersede(TENANT, 'old-2', USER, supersedeDto));

      expect(error.getResponse().code).toBe('CLIENT_STATEMENT_UNSUPPORTED_CURRENCY');
      expectNothingPersisted();
    });

    it('geçerli TL kaynaklarla yenileme çalışmaya devam eder (eski SUPERSEDED, yeni TRY)', async () => {
      mockPrisma.clientStatement.findFirst.mockResolvedValue({
        id: 'old-3',
        status: 'ACTIVE',
        caseId: CASE,
        clientId: CLIENT,
        lines: [],
      });

      await service.supersede(TENANT, 'old-3', USER, supersedeDto);

      expect(mockPrisma.clientStatement.create.mock.calls[0][0].data.currency).toBe('TRY');
      expect(mockPrisma.clientStatement.update).toHaveBeenCalledTimes(1);
    });
  });
});
