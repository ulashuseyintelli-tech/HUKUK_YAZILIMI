import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { NotificationDispatcherService } from '@/modules/client-notification/notification-dispatcher.service';
import { OfficeService } from '@/modules/office/office.service';
import { AuditService } from '@/modules/audit/audit.service';
import { ClientStatementService } from './client-statement.service';
import { CreateClientStatementDto } from './dto/client-statement.dto';

const D = (n: number) => new Prisma.Decimal(n);
const TENANT = 'tenant-1';
const CASE = 'case-1';
const CLIENT = 'client-1';
const USER = 'user-1';

const mockPrisma: any = {
  case: { findFirst: jest.fn() },
  client: { findFirst: jest.fn() },
  // M2 resolveCaseClientId (findFirst) + Faz B collectClientLevel (findMany)
  caseClient: { findFirst: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
  caseBalance: { findFirst: jest.fn() },
  balanceLedger: { aggregate: jest.fn(), findMany: jest.fn() },
  // Faz B aggregate'leri (opening devir) default boş-sum
  expenseRequest: { findMany: jest.fn(), aggregate: jest.fn().mockResolvedValue({ _sum: { totalAmount: null } }) },
  expensePayment: { findMany: jest.fn().mockResolvedValue([]), aggregate: jest.fn().mockResolvedValue({ _sum: { amount: null } }) },
  collectionDisposition: { findMany: jest.fn() }, // M2 case-level: POSTED proceeds (disposition+lines)
  collectionDispositionLine: { findMany: jest.fn().mockResolvedValue([]), aggregate: jest.fn().mockResolvedValue({ _sum: { amount: null } }) }, // Faz B client-level
  clientPayout: { findMany: jest.fn(), aggregate: jest.fn().mockResolvedValue({ _sum: { amount: null } }) }, // M3 RECORDED payouts
  clientStatement: { create: jest.fn(), update: jest.fn(), findFirst: jest.fn(), findMany: jest.fn(), count: jest.fn().mockResolvedValue(0) },
  clientStatementLine: { createMany: jest.fn() },
  $executeRaw: jest.fn().mockResolvedValue(1), // pg_advisory_xact_lock (Faz 7-E concurrency guard)
  $transaction: jest.fn((fn: any) => fn(mockPrisma)),
};
const mockDispatcher: any = { dispatch: jest.fn().mockResolvedValue({ status: 'sent' }) };
const mockOffice: any = { getOrCreate: jest.fn().mockResolvedValue({ name: 'Test Büro' }) };
// Faz 7-E: audit mock — logInTransaction (mutation ile aynı tx). clearAllMocks implementasyonu silmez
// ama count default'unu da korur; logInTransaction no-op (hata yutmaz davranışı testte ayrıca kontrol edilmez).
const mockAudit: any = { logInTransaction: jest.fn().mockResolvedValue(undefined), log: jest.fn() };

describe('ClientStatementService', () => {
  let service: ClientStatementService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockDispatcher.dispatch.mockResolvedValue({ status: 'sent' });
    mockOffice.getOrCreate.mockResolvedValue({ name: 'Test Büro' });
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClientStatementService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: NotificationDispatcherService, useValue: mockDispatcher },
        { provide: OfficeService, useValue: mockOffice },
        { provide: AuditService, useValue: mockAudit },
      ],
    }).compile();
    service = module.get(ClientStatementService);
  });

  const dto: CreateClientStatementDto = {
    clientId: CLIENT,
    periodStart: '2026-06-01T00:00:00Z',
    periodEnd: '2026-06-30T23:59:59Z',
  };

  describe('create / türetim', () => {
    beforeEach(() => {
      mockPrisma.case.findFirst.mockResolvedValue({ id: CASE });
      mockPrisma.client.findFirst.mockResolvedValue({ id: CLIENT });
      mockPrisma.caseBalance.findFirst.mockResolvedValue({ id: 'cb-1' });
      mockPrisma.balanceLedger.aggregate.mockResolvedValue({ _sum: { amount: D(100) } }); // opening=100
      mockPrisma.balanceLedger.findMany.mockResolvedValue([
        { id: 'l1', amount: D(50), type: 'CREDIT', description: 'avans', createdAt: new Date(1000) },
        { id: 'l2', amount: D(-30), type: 'DEBIT', description: 'masraf', createdAt: new Date(2000) },
      ]);
      mockPrisma.expenseRequest.findMany.mockResolvedValue([
        { id: 'er1', totalAmount: D(75), currency: 'TRY', status: 'PENDING', createdAt: new Date(1500) },
      ]);
      mockPrisma.clientStatement.create.mockResolvedValue({ id: 'st-1' });
      mockPrisma.clientStatement.findFirst.mockResolvedValue({ id: 'st-1', lines: [] });
    });

    it('opening/running/closing doğru; EXPENSE_REQUESTED bakiyeyi oynatmaz', async () => {
      await service.create(TENANT, CASE, USER, dto);

      // başlık: opening=100, closing=120 (100 +50 -30)
      const stArgs = mockPrisma.clientStatement.create.mock.calls[0][0].data;
      expect(stArgs.openingBalance.toString()).toBe('100');
      expect(stArgs.closingBalance.toString()).toBe('120');

      // satırlar: l1(credit50, run150), er1(info 0/0, run150), l2(debit30, run120)
      const lines = mockPrisma.clientStatementLine.createMany.mock.calls[0][0].data;
      expect(lines).toHaveLength(3);

      const credit = lines.find((l: any) => l.refId === 'l1');
      expect(credit.credit.toString()).toBe('50');
      expect(credit.debit.toString()).toBe('0');
      expect(credit.runningBalance.toString()).toBe('150');
      expect(credit.lineType).toBe('ADVANCE_CREDIT');

      const info = lines.find((l: any) => l.refId === 'er1');
      expect(info.lineType).toBe('EXPENSE_REQUESTED');
      expect(info.debit.toString()).toBe('0');
      expect(info.credit.toString()).toBe('0');
      expect(info.runningBalance.toString()).toBe('150'); // değişmedi

      const debit = lines.find((l: any) => l.refId === 'l2');
      expect(debit.debit.toString()).toBe('30');
      expect(debit.credit.toString()).toBe('0');
      expect(debit.runningBalance.toString()).toBe('120');
      expect(debit.lineType).toBe('EXPENSE_ACTUAL');
    });

    it('includeRequests=false → ExpenseRequest okunmaz, bilgi satırı yok', async () => {
      await service.create(TENANT, CASE, USER, { ...dto, includeRequests: false });
      expect(mockPrisma.expenseRequest.findMany).not.toHaveBeenCalled();
      const lines = mockPrisma.clientStatementLine.createMany.mock.calls[0][0].data;
      expect(lines.every((l: any) => l.lineType !== 'EXPENSE_REQUESTED')).toBe(true);
      expect(lines).toHaveLength(2);
    });

    it('CaseBalance yoksa opening=0, yalnız bilgi satırları', async () => {
      mockPrisma.caseBalance.findFirst.mockResolvedValue(null);
      await service.create(TENANT, CASE, USER, dto);
      const stArgs = mockPrisma.clientStatement.create.mock.calls[0][0].data;
      expect(stArgs.openingBalance.toString()).toBe('0');
      expect(mockPrisma.balanceLedger.findMany).not.toHaveBeenCalled();
    });
  });

  describe('create / guard', () => {
    it('periodStart > periodEnd reddedilir', async () => {
      mockPrisma.case.findFirst.mockResolvedValue({ id: CASE });
      mockPrisma.client.findFirst.mockResolvedValue({ id: CLIENT });
      await expect(
        service.create(TENANT, CASE, USER, { ...dto, periodStart: '2026-07-01T00:00:00Z', periodEnd: '2026-06-01T00:00:00Z' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('bulunamayan case reddedilir', async () => {
      mockPrisma.case.findFirst.mockResolvedValue(null);
      await expect(service.create(TENANT, CASE, USER, dto)).rejects.toThrow(NotFoundException);
    });
  });

  describe('supersede', () => {
    it('ACTIVE → yeni üret + eskisini SUPERSEDED + supersededById', async () => {
      mockPrisma.clientStatement.findFirst
        .mockResolvedValueOnce({ id: 'old-1', status: 'ACTIVE', caseId: CASE, clientId: CLIENT }) // findOwned
        .mockResolvedValue({ id: 'new-1', lines: [] }); // findOne (dönüş)
      mockPrisma.caseBalance.findFirst.mockResolvedValue(null);
      mockPrisma.expenseRequest.findMany.mockResolvedValue([]);
      mockPrisma.clientStatement.create.mockResolvedValue({ id: 'new-1' });

      await service.supersede(TENANT, 'old-1', USER, { periodStart: dto.periodStart, periodEnd: dto.periodEnd });

      expect(mockPrisma.clientStatement.update).toHaveBeenCalledWith({
        where: { id: 'old-1' },
        data: expect.objectContaining({ status: 'SUPERSEDED', supersededById: 'new-1', supersededAt: expect.any(Date) }),
      });
    });

    it('ACTIVE olmayan supersede reddedilir', async () => {
      mockPrisma.clientStatement.findFirst.mockResolvedValue({ id: 'old-1', status: 'SUPERSEDED', caseId: CASE, clientId: CLIENT });
      await expect(
        service.supersede(TENANT, 'old-1', USER, { periodStart: dto.periodStart, periodEnd: dto.periodEnd }),
      ).rejects.toThrow(BadRequestException);
      expect(mockPrisma.clientStatement.create).not.toHaveBeenCalled();
    });
  });

  describe('void', () => {
    it('ACTIVE → VOID (voidedAt/By/voidNote)', async () => {
      mockPrisma.clientStatement.findFirst
        .mockResolvedValueOnce({ id: 'st-1', status: 'ACTIVE', caseId: CASE, clientId: CLIENT })
        .mockResolvedValue({ id: 'st-1', lines: [] });
      await service.void(TENANT, 'st-1', USER, 'yanlış dönem');
      expect(mockPrisma.clientStatement.update).toHaveBeenCalledWith({
        where: { id: 'st-1' },
        data: expect.objectContaining({ status: 'VOID', voidedById: USER, voidNote: 'yanlış dönem', voidedAt: expect.any(Date) }),
      });
    });

    it('ACTIVE olmayan void reddedilir', async () => {
      mockPrisma.clientStatement.findFirst.mockResolvedValue({ id: 'st-1', status: 'VOID', caseId: CASE, clientId: CLIENT });
      await expect(service.void(TENANT, 'st-1', USER)).rejects.toThrow(BadRequestException);
      expect(mockPrisma.clientStatement.update).not.toHaveBeenCalled();
    });
  });

  describe('mail tetiği (3.4) — yalnız create, best-effort', () => {
    it('create → dispatcher STATEMENT_READY ile çağrılır', async () => {
      mockPrisma.case.findFirst.mockResolvedValue({ id: CASE });
      mockPrisma.client.findFirst.mockResolvedValue({ id: CLIENT });
      mockPrisma.caseBalance.findFirst.mockResolvedValue(null);
      mockPrisma.clientStatement.create.mockResolvedValue({ id: 'st-1' });
      mockPrisma.clientStatement.findFirst.mockResolvedValue({
        id: 'st-1', clientId: CLIENT, caseId: CASE,
        periodStart: new Date('2026-06-01'), periodEnd: new Date('2026-06-30'),
        closingBalance: D(120), lines: [],
      });

      await service.create(TENANT, CASE, USER, dto);

      expect(mockDispatcher.dispatch).toHaveBeenCalledWith(
        TENANT, USER,
        expect.objectContaining({ templateCode: 'STATEMENT_READY', type: 'STATEMENT_READY', refType: 'ClientStatement', refId: 'st-1' }),
      );
    });

    it('supersede STATEMENT_READY maili TETİKLEMEZ (m34-1 create only)', async () => {
      mockPrisma.clientStatement.findFirst
        .mockResolvedValueOnce({ id: 'old-1', status: 'ACTIVE', caseId: CASE, clientId: CLIENT })
        .mockResolvedValue({ id: 'new-1', clientId: CLIENT, caseId: CASE, periodStart: new Date(), periodEnd: new Date(), closingBalance: D(0), lines: [] });
      mockPrisma.caseBalance.findFirst.mockResolvedValue(null);
      mockPrisma.expenseRequest.findMany.mockResolvedValue([]);
      mockPrisma.clientStatement.create.mockResolvedValue({ id: 'new-1' });

      await service.supersede(TENANT, 'old-1', USER, { periodStart: dto.periodStart, periodEnd: dto.periodEnd });
      expect(mockDispatcher.dispatch).not.toHaveBeenCalled();
    });
  });

  describe('read & immutability', () => {
    it('listByCase default ACTIVE', async () => {
      mockPrisma.clientStatement.findMany.mockResolvedValue([]);
      await service.listByCase(TENANT, CASE);
      expect(mockPrisma.clientStatement.findMany).toHaveBeenCalledWith({
        where: { tenantId: TENANT, caseId: CASE, status: 'ACTIVE' },
        orderBy: { createdAt: 'desc' },
      });
    });

    it('cross-tenant findOne reddedilir', async () => {
      mockPrisma.clientStatement.findFirst.mockResolvedValue(null);
      await expect(service.findOne(TENANT, 'st-1')).rejects.toThrow(NotFoundException);
    });

    it('çoklu-alacaklı: create() OTOMATİK-SUPERSEDE YAPMAZ; snapshot clientId-scoped (A/B çakışmaz)', async () => {
      // ClientStatement header clientId taşır (caseId+clientId = caseClientId-eşdeğeri, CaseClient @@unique).
      // create() case+period ile otomatik-supersede YAPMAZ → B'nin collect'i A snapshot'ını bozmaz.
      mockPrisma.case.findFirst.mockResolvedValue({ id: CASE });
      mockPrisma.caseBalance.findFirst.mockResolvedValue(null);
      mockPrisma.expenseRequest.findMany.mockResolvedValue([]);
      mockPrisma.caseClient.findFirst.mockResolvedValue(null);
      mockPrisma.clientStatement.create.mockResolvedValue({ id: 'st-x' });
      mockPrisma.clientStatement.findFirst.mockResolvedValue({ id: 'st-x', lines: [] });

      mockPrisma.client.findFirst.mockResolvedValue({ id: 'A' });
      await service.create(TENANT, CASE, USER, { ...dto, clientId: 'A' });
      mockPrisma.client.findFirst.mockResolvedValue({ id: 'B' });
      await service.create(TENANT, CASE, USER, { ...dto, clientId: 'B' });

      // create() hiçbir statement'ı SUPERSEDED yapmadı (case+period otomatik-supersede YOK)
      expect(mockPrisma.clientStatement.update).not.toHaveBeenCalled();
      // header clientId-scoped
      expect(mockPrisma.clientStatement.create.mock.calls[0][0].data.clientId).toBe('A');
      expect(mockPrisma.clientStatement.create.mock.calls[1][0].data.clientId).toBe('B');
    });

    it('servis içerik update/delete metodu SUNMAZ', () => {
      expect((service as any).update).toBeUndefined();
      expect((service as any).delete).toBeUndefined();
      expect((service as any).patchContent).toBeUndefined();
    });
  });

  describe('M2 proceeds — POSTED disposition (model A)', () => {
    beforeEach(() => {
      mockPrisma.case.findFirst.mockResolvedValue({ id: CASE });
      mockPrisma.client.findFirst.mockResolvedValue({ id: CLIENT });
      mockPrisma.caseClient.findFirst.mockResolvedValue({ id: 'cc-A' }); // statement'ın alacaklısı
      mockPrisma.caseBalance.findFirst.mockResolvedValue(null); // opening 0
      mockPrisma.expenseRequest.findMany.mockResolvedValue([]);
      mockPrisma.clientPayout.findMany.mockResolvedValue([]); // M3: default payout yok
      mockPrisma.clientStatement.create.mockResolvedValue({ id: 'st-1' });
      mockPrisma.clientStatement.findFirst.mockResolvedValue({ id: 'st-1', lines: [] });
    });

    it('CLIENT_PAYABLE → CASE_COLLECTION_PAYABLE credit+; FEE → bilgi(0); closing doğru', async () => {
      mockPrisma.collectionDisposition.findMany.mockResolvedValue([
        { postedAt: new Date(3000), lines: [
          { id: 'dl1', type: 'CLIENT_PAYABLE', amount: D(60), caseClientId: 'cc-A' },
          { id: 'dl2', type: 'CONTRACTUAL_FEE_WITHHELD', amount: D(40), caseClientId: 'cc-A' },
        ] },
      ]);
      await service.create(TENANT, CASE, USER, dto);

      const lines = mockPrisma.clientStatementLine.createMany.mock.calls[0][0].data;
      const payable = lines.find((l: any) => l.refId === 'dl1');
      expect(payable.lineType).toBe('CASE_COLLECTION_PAYABLE');
      expect(payable.credit.toString()).toBe('60');
      expect(payable.runningBalance.toString()).toBe('60');
      expect(payable.caseClientId).toBe('cc-A');
      expect(payable.refType).toBe('CollectionDispositionLine');

      const fee = lines.find((l: any) => l.refId === 'dl2');
      expect(fee.lineType).toBe('CONTRACTUAL_FEE_WITHHELD');
      expect(fee.credit.toString()).toBe('0'); // ofis payı bakiyeyi oynatmaz
      expect(fee.runningBalance.toString()).toBe('60');

      expect(mockPrisma.clientStatement.create.mock.calls[0][0].data.closingBalance.toString()).toBe('60');
      expect(mockPrisma.collectionDisposition.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({
          tenantId: TENANT,
          caseId: CASE,
          status: 'POSTED',
          manualReversalRequiredAt: null,
        }),
      }));
    });

    it('manualReversalRequiredAt dolu POSTED disposition yeni normal statement snapshotina GIRMEZ', async () => {
      const sourceRows = [
        {
          postedAt: new Date(3000),
          manualReversalRequiredAt: null,
          lines: [{ id: 'dl-ok', type: 'CLIENT_PAYABLE', amount: D(60), caseClientId: 'cc-A' }],
        },
        {
          postedAt: new Date(3500),
          manualReversalRequiredAt: new Date('2026-06-27T00:00:00Z'),
          lines: [{ id: 'dl-blocked', type: 'CLIENT_PAYABLE', amount: D(90), caseClientId: 'cc-A' }],
        },
      ];
      mockPrisma.collectionDisposition.findMany.mockImplementation(async (args: any) => sourceRows
        .filter((row) => (args.where.manualReversalRequiredAt === null ? row.manualReversalRequiredAt === null : true))
        .map((row) => ({ postedAt: row.postedAt, lines: row.lines })));

      await service.create(TENANT, CASE, USER, dto);

      expect(mockPrisma.collectionDisposition.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({ tenantId: TENANT, caseId: CASE, status: 'POSTED', manualReversalRequiredAt: null }),
      }));
      const lines = mockPrisma.clientStatementLine.createMany.mock.calls[0][0].data;
      expect(lines.find((l: any) => l.refId === 'dl-ok')).toBeDefined();
      expect(lines.find((l: any) => l.refId === 'dl-blocked')).toBeUndefined();
      expect(mockPrisma.clientStatement.create.mock.calls[0][0].data.closingBalance.toString()).toBe('60');
      expect(mockPrisma.clientStatement.update).not.toHaveBeenCalled();
    });

    it('OFFSET çift-sayım YOK: BalanceLedger CREDIT bir kez oynatır, proceeds OFFSET = bilgi(0)', async () => {
      mockPrisma.caseBalance.findFirst.mockResolvedValue({ id: 'cb-1' });
      mockPrisma.balanceLedger.aggregate.mockResolvedValue({ _sum: { amount: D(0) } });
      mockPrisma.balanceLedger.findMany.mockResolvedValue([
        { id: 'bl1', amount: D(100), type: 'CREDIT', description: 'avans mahsubu', createdAt: new Date(2000) },
      ]);
      mockPrisma.collectionDisposition.findMany.mockResolvedValue([
        { postedAt: new Date(3000), lines: [
          { id: 'dl-off', type: 'OFFSET_CLIENT_ADVANCE', amount: D(100), caseClientId: 'cc-A' },
        ] },
      ]);
      await service.create(TENANT, CASE, USER, dto);

      // Toplam etki = +100 (yalnız BalanceLedger'dan); 200 OLMAYACAK.
      expect(mockPrisma.clientStatement.create.mock.calls[0][0].data.closingBalance.toString()).toBe('100');
      const lines = mockPrisma.clientStatementLine.createMany.mock.calls[0][0].data;
      const off = lines.find((l: any) => l.refId === 'dl-off');
      expect(off.lineType).toBe('COLLECTION_OFFSET_ADVANCE');
      expect(off.credit.toString()).toBe('0');
    });

    it('cross-client: başka caseClientId proceeds satırı bu ekstreye GİRMEZ', async () => {
      mockPrisma.collectionDisposition.findMany.mockResolvedValue([
        { postedAt: new Date(3000), lines: [
          { id: 'dl-other', type: 'CLIENT_PAYABLE', amount: D(99), caseClientId: 'cc-OTHER' },
        ] },
      ]);
      await service.create(TENANT, CASE, USER, dto);

      const call = mockPrisma.clientStatementLine.createMany.mock.calls[0];
      const lines = call ? call[0].data : [];
      expect(lines.find((l: any) => l.refId === 'dl-other')).toBeUndefined();
      expect(mockPrisma.clientStatement.create.mock.calls[0][0].data.closingBalance.toString()).toBe('0');
    });

    it('M3 payout: CLIENT_PAYABLE 1000 + ClientPayout 400 → net 600; CLIENT_PAYOUT_SENT debit; collect read-only', async () => {
      mockPrisma.collectionDisposition.findMany.mockResolvedValue([
        { postedAt: new Date(3000), lines: [{ id: 'dl1', type: 'CLIENT_PAYABLE', amount: D(1000), caseClientId: 'cc-A' }] },
      ]);
      mockPrisma.clientPayout.findMany.mockResolvedValue([
        { id: 'po1', amount: D(400), paidAt: new Date(4000) },
      ]);
      await service.create(TENANT, CASE, USER, dto);

      const lines = mockPrisma.clientStatementLine.createMany.mock.calls[0][0].data;
      expect(lines.find((l: any) => l.refId === 'dl1').credit.toString()).toBe('1000');
      const payout = lines.find((l: any) => l.refId === 'po1');
      expect(payout.lineType).toBe('CLIENT_PAYOUT_SENT');
      expect(payout.refType).toBe('ClientPayout');
      expect(payout.debit.toString()).toBe('400');
      expect(payout.credit.toString()).toBe('0');
      // net müvekkile-borç = 1000 − 400 = 600
      expect(mockPrisma.clientStatement.create.mock.calls[0][0].data.closingBalance.toString()).toBe('600');
    });
  });

  describe('Faz 7-E — period-scoped tek-ACTIVE guard + audit', () => {
    beforeEach(() => {
      mockPrisma.case.findFirst.mockResolvedValue({ id: CASE });
      mockPrisma.client.findFirst.mockResolvedValue({ id: CLIENT });
      mockPrisma.caseClient.findFirst.mockResolvedValue(null);
      mockPrisma.caseBalance.findFirst.mockResolvedValue(null); // opening 0, ledger okunmaz
      mockPrisma.expenseRequest.findMany.mockResolvedValue([]);
      mockPrisma.collectionDisposition.findMany.mockResolvedValue([]);
      mockPrisma.clientPayout.findMany.mockResolvedValue([]);
      mockPrisma.clientStatement.create.mockResolvedValue({ id: 'st-1' });
      mockPrisma.clientStatement.findFirst.mockResolvedValue({ id: 'st-1', lines: [] });
    });

    it('aynı case+client+period için ACTIVE varsa create REDDEDİLİR (count>0)', async () => {
      mockPrisma.clientStatement.count.mockResolvedValueOnce(1);
      await expect(service.create(TENANT, CASE, USER, dto)).rejects.toThrow(/aktif ekstre zaten var/i);
      // guard tx içinde → persist (create) çağrılmadı
      expect(mockPrisma.clientStatement.create).not.toHaveBeenCalled();
      // count period-scoped where ile sorgulandı
      const where = mockPrisma.clientStatement.count.mock.calls[0][0].where;
      expect(where).toEqual(
        expect.objectContaining({ tenantId: TENANT, caseId: CASE, clientId: CLIENT, status: 'ACTIVE' }),
      );
      expect(where.periodStart).toBeInstanceOf(Date);
      expect(where.periodEnd).toBeInstanceOf(Date);
    });

    it('farklı dönem (bu period için ACTIVE yok, count=0) → create İZİNLİ', async () => {
      mockPrisma.clientStatement.count.mockResolvedValueOnce(0);
      await service.create(TENANT, CASE, USER, dto);
      expect(mockPrisma.clientStatement.create).toHaveBeenCalledTimes(1);
    });

    it('create path advisory lock alır (tx.$executeRaw — concurrency guard)', async () => {
      mockPrisma.clientStatement.count.mockResolvedValueOnce(0);
      await service.create(TENANT, CASE, USER, dto);
      expect(mockPrisma.$executeRaw).toHaveBeenCalled();
    });

    it('create → CLIENT_STATEMENT_GENERATED audit (aynı tx)', async () => {
      mockPrisma.clientStatement.count.mockResolvedValueOnce(0);
      await service.create(TENANT, CASE, USER, dto);
      expect(mockAudit.logInTransaction).toHaveBeenCalledWith(
        mockPrisma, // tx (mock $transaction tx=mockPrisma)
        expect.objectContaining({
          action: 'CLIENT_STATEMENT_GENERATED',
          entityType: 'ClientStatement',
          entityId: 'st-1',
          userId: USER,
          tenantId: TENANT,
        }),
      );
    });

    it('boş ekstre (hareket yok) İZİNLİ — create REDDEDİLMEZ', async () => {
      mockPrisma.clientStatement.count.mockResolvedValueOnce(0);
      await service.create(TENANT, CASE, USER, dto);
      // hiç satır yok ama statement yine de oluşturuldu
      expect(mockPrisma.clientStatement.create).toHaveBeenCalledTimes(1);
      const lineCall = mockPrisma.clientStatementLine.createMany.mock.calls[0];
      if (lineCall) expect(lineCall[0].data).toHaveLength(0);
    });

    it('supersede → CLIENT_STATEMENT_SUPERSEDED audit (entityId = eski id)', async () => {
      mockPrisma.clientStatement.findFirst
        .mockResolvedValueOnce({ id: 'old-1', status: 'ACTIVE', caseId: CASE, clientId: CLIENT }) // findOwned
        .mockResolvedValue({ id: 'new-1', lines: [] }); // findOne
      mockPrisma.clientStatement.create.mockResolvedValue({ id: 'new-1' });
      mockPrisma.clientStatement.count.mockResolvedValueOnce(0); // yeni dönem çakışması yok

      await service.supersede(TENANT, 'old-1', USER, { periodStart: dto.periodStart, periodEnd: dto.periodEnd });

      expect(mockPrisma.$executeRaw).toHaveBeenCalled(); // supersede path advisory lock
      expect(mockAudit.logInTransaction).toHaveBeenCalledWith(
        mockPrisma,
        expect.objectContaining({
          action: 'CLIENT_STATEMENT_SUPERSEDED',
          entityType: 'ClientStatement',
          entityId: 'old-1',
          userId: USER,
          metadata: expect.objectContaining({ oldStatementId: 'old-1', newStatementId: 'new-1' }),
        }),
      );
    });

    it('void → CLIENT_STATEMENT_VOIDED audit', async () => {
      mockPrisma.clientStatement.findFirst
        .mockResolvedValueOnce({ id: 'st-1', status: 'ACTIVE', caseId: CASE, clientId: CLIENT })
        .mockResolvedValue({ id: 'st-1', lines: [] });
      await service.void(TENANT, 'st-1', USER, 'gerekçe');
      expect(mockAudit.logInTransaction).toHaveBeenCalledWith(
        mockPrisma,
        expect.objectContaining({ action: 'CLIENT_STATEMENT_VOIDED', entityType: 'ClientStatement', entityId: 'st-1', userId: USER }),
      );
    });
  });

  // ===================================================================================
  // Faz B — CLIENT-LEVEL (genel) immutable ekstre (caseId=null, yalnız CLIENT_SPECIFIC)
  // ===================================================================================
  describe('Faz B — client-level (genel) ekstre', () => {
    const CL_DTO = { periodStart: '2026-06-01T00:00:00Z', periodEnd: '2026-06-30T23:59:59Z' };
    const ALLOWED_TYPES = ['CASE_COLLECTION_PAYABLE', 'CLIENT_PAYOUT_SENT', 'EXPENSE_REQUESTED', 'CLIENT_PAYMENT'];
    const ALLOWED_REFS = ['CollectionDispositionLine', 'ClientPayout', 'ExpenseRequest', 'ExpensePayment'];

    beforeEach(() => {
      mockPrisma.client.findFirst.mockResolvedValue({ id: CLIENT });
      mockPrisma.caseClient.findMany.mockResolvedValue([{ id: 'cc-A', caseId: 'caseX' }]);
      mockPrisma.clientStatement.create.mockResolvedValue({ id: 'cl-1' });
      mockPrisma.clientStatement.findFirst.mockResolvedValue({ id: 'cl-1', lines: [] });
      mockPrisma.clientStatement.count.mockResolvedValue(0);
    });

    /** 4 CLIENT_SPECIFIC kaynağı tek senaryoda doldurur (math + satır kontrolü için). */
    function seedFourSources() {
      mockPrisma.collectionDispositionLine.findMany.mockResolvedValue([
        { id: 'dl1', amount: D(1000), caseClientId: 'cc-A', disposition: { caseId: 'caseX', postedAt: new Date(3000) } },
      ]);
      mockPrisma.clientPayout.findMany.mockResolvedValue([
        { id: 'po1', amount: D(400), paidAt: new Date(4000), caseId: 'caseX', caseClientId: 'cc-A' },
      ]);
      mockPrisma.expenseRequest.findMany.mockResolvedValue([
        { id: 'er1', caseId: 'caseX', totalAmount: D(300), currency: 'TRY', status: 'PENDING', createdAt: new Date(2000) },
      ]);
      mockPrisma.expensePayment.findMany.mockResolvedValue([
        { id: 'ep1', amount: D(100), paymentDate: new Date(5000), expenseRequest: { caseId: 'caseX' } },
      ]);
    }

    it('2. createClientLevel → header caseId=NULL (client-level)', async () => {
      await service.createClientLevel(TENANT, CLIENT, USER, CL_DTO);
      expect(mockPrisma.clientStatement.create.mock.calls[0][0].data.caseId).toBeNull();
      expect(mockPrisma.clientStatement.create.mock.calls[0][0].data.clientId).toBe(CLIENT);
    });

    it('3. createClientLevel → her satır caseId DOLU (zorunlu)', async () => {
      seedFourSources();
      await service.createClientLevel(TENANT, CLIENT, USER, CL_DTO);
      const lines = mockPrisma.clientStatementLine.createMany.mock.calls[0][0].data;
      expect(lines).toHaveLength(4);
      expect(lines.every((l: any) => typeof l.caseId === 'string' && l.caseId.length > 0)).toBe(true);
    });

    it('4. yalnız CLIENT_SPECIFIC kaynaklar; CASE_CONTEXT (BalanceLedger/Collection) SORGULANMAZ', async () => {
      seedFourSources();
      await service.createClientLevel(TENANT, CLIENT, USER, CL_DTO);
      // CASE_CONTEXT kaynakları client-level toplamada hiç çağrılmaz
      expect(mockPrisma.balanceLedger.findMany).not.toHaveBeenCalled();
      expect(mockPrisma.balanceLedger.aggregate).not.toHaveBeenCalled();
      expect(mockPrisma.caseBalance.findFirst).not.toHaveBeenCalled();
      // yalnız 4 CLIENT_SPECIFIC kaynağı kullanıldı
      expect(mockPrisma.collectionDispositionLine.findMany).toHaveBeenCalled();
      expect(mockPrisma.clientPayout.findMany).toHaveBeenCalled();
      expect(mockPrisma.expenseRequest.findMany).toHaveBeenCalled();
      expect(mockPrisma.expensePayment.findMany).toHaveBeenCalled();
    });

    it('5. satır tip/ref yalnız 4 izinli CLIENT_SPECIFIC değer (CASE_CONTEXT lineType yok)', async () => {
      seedFourSources();
      await service.createClientLevel(TENANT, CLIENT, USER, CL_DTO);
      const lines = mockPrisma.clientStatementLine.createMany.mock.calls[0][0].data;
      expect(lines.every((l: any) => ALLOWED_TYPES.includes(l.lineType))).toBe(true);
      expect(lines.every((l: any) => ALLOWED_REFS.includes(l.refType))).toBe(true);
    });

    it('math: payable +1000 − payout 400 − talep 300 + tahsil 100 = net 400; runningBalance sıralı', async () => {
      seedFourSources();
      await service.createClientLevel(TENANT, CLIENT, USER, CL_DTO);
      expect(mockPrisma.clientStatement.create.mock.calls[0][0].data.closingBalance.toString()).toBe('400');
      const lines = mockPrisma.clientStatementLine.createMany.mock.calls[0][0].data;
      // tarih sırası: er1(2000)→dl1(3000)→po1(4000)→ep1(5000)
      expect(lines.map((l: any) => l.refId)).toEqual(['er1', 'dl1', 'po1', 'ep1']);
      expect(lines.find((l: any) => l.refId === 'er1').runningBalance.toString()).toBe('-300');
      expect(lines.find((l: any) => l.refId === 'dl1').runningBalance.toString()).toBe('700');
      expect(lines.find((l: any) => l.refId === 'po1').runningBalance.toString()).toBe('300');
      expect(lines.find((l: any) => l.refId === 'ep1').runningBalance.toString()).toBe('400');
      // yön: payable credit, payout debit, talep debit, tahsil credit
      expect(lines.find((l: any) => l.refId === 'dl1').credit.toString()).toBe('1000');
      expect(lines.find((l: any) => l.refId === 'po1').debit.toString()).toBe('400');
      expect(lines.find((l: any) => l.refId === 'er1').debit.toString()).toBe('300');
      expect(lines.find((l: any) => l.refId === 'ep1').credit.toString()).toBe('100');
    });

    it('6+7. aynı client+period 2. ACTIVE client-level ENGELLENİR; guard caseId:null scope', async () => {
      mockPrisma.clientStatement.count.mockResolvedValueOnce(1);
      await expect(service.createClientLevel(TENANT, CLIENT, USER, CL_DTO)).rejects.toThrow(/genel.*ekstre zaten var/i);
      expect(mockPrisma.clientStatement.create).not.toHaveBeenCalled();
      // count CLIENT-LEVEL scope: caseId:null (case-level satırlar sayılmaz → çakışmaz)
      const where = mockPrisma.clientStatement.count.mock.calls[0][0].where;
      expect(where).toEqual(expect.objectContaining({ tenantId: TENANT, clientId: CLIENT, caseId: null, status: 'ACTIVE' }));
    });

    it('8. advisory lock key case-level vs client-level AYRI namespace', () => {
      const d1 = new Date('2026-06-01T00:00:00Z');
      const d2 = new Date('2026-06-30T23:59:59Z');
      const caseKey = (service as any).activeLockKey(TENANT, 'case-1', CLIENT, d1, d2);
      const clientKey = (service as any).activeLockKey(TENANT, null, CLIENT, d1, d2);
      expect(caseKey).toContain(':case-1:');
      expect(clientKey).toContain(':__CLIENT__:');
      expect(caseKey).not.toEqual(clientKey);
    });

    it('9+10. listByCase caseId-scope (client-level döndürmez); listByClient caseId:null', async () => {
      mockPrisma.clientStatement.findMany.mockResolvedValue([]);
      await service.listByCase(TENANT, CASE);
      expect(mockPrisma.clientStatement.findMany.mock.calls[0][0].where).toEqual(
        expect.objectContaining({ tenantId: TENANT, caseId: CASE, status: 'ACTIVE' }),
      );
      await service.listByClient(TENANT, CLIENT);
      expect(mockPrisma.clientStatement.findMany.mock.calls[1][0].where).toEqual(
        expect.objectContaining({ tenantId: TENANT, clientId: CLIENT, caseId: null, status: 'ACTIVE' }),
      );
    });

    it('11. supersede client-level (old.caseId=null) → collectClientLevel path, yeni caseId=null, BalanceLedger sorgulanmaz', async () => {
      mockPrisma.clientStatement.findFirst
        .mockResolvedValueOnce({ id: 'old-cl', status: 'ACTIVE', caseId: null, clientId: CLIENT }) // findOwned
        .mockResolvedValue({ id: 'new-cl', lines: [] }); // findOne
      mockPrisma.clientStatement.create.mockResolvedValue({ id: 'new-cl' });
      mockPrisma.clientStatement.count.mockResolvedValueOnce(0);
      seedFourSources();

      await service.supersede(TENANT, 'old-cl', USER, { periodStart: CL_DTO.periodStart, periodEnd: CL_DTO.periodEnd });

      // client-level path: BalanceLedger/resolveCaseClientId(caseClient.findFirst) DEĞİL, caseClient.findMany kullanıldı
      expect(mockPrisma.caseClient.findMany).toHaveBeenCalled();
      expect(mockPrisma.balanceLedger.findMany).not.toHaveBeenCalled();
      // yeni statement caseId=null + eskisi SUPERSEDED
      expect(mockPrisma.clientStatement.create.mock.calls[0][0].data.caseId).toBeNull();
      expect(mockPrisma.clientStatement.update).toHaveBeenCalledWith({
        where: { id: 'old-cl' },
        data: expect.objectContaining({ status: 'SUPERSEDED', supersededById: 'new-cl' }),
      });
    });

    it('12. case-level create REGRESYON: header caseId=CASE dolu, satır caseId=null (kural)', async () => {
      mockPrisma.case.findFirst.mockResolvedValue({ id: CASE });
      mockPrisma.client.findFirst.mockResolvedValue({ id: CLIENT });
      mockPrisma.caseClient.findFirst.mockResolvedValue(null);
      mockPrisma.caseBalance.findFirst.mockResolvedValue({ id: 'cb-1' });
      mockPrisma.balanceLedger.aggregate.mockResolvedValue({ _sum: { amount: D(0) } });
      mockPrisma.balanceLedger.findMany.mockResolvedValue([
        { id: 'l1', amount: D(50), type: 'CREDIT', description: 'avans', createdAt: new Date(1000) },
      ]);
      mockPrisma.expenseRequest.findMany.mockResolvedValue([]);
      mockPrisma.collectionDisposition.findMany.mockResolvedValue([]);
      mockPrisma.clientPayout.findMany.mockResolvedValue([]);
      mockPrisma.clientStatement.create.mockResolvedValue({ id: 'cs-1' });
      mockPrisma.clientStatement.findFirst.mockResolvedValue({ id: 'cs-1', lines: [] });

      await service.create(TENANT, CASE, USER, { clientId: CLIENT, periodStart: CL_DTO.periodStart, periodEnd: CL_DTO.periodEnd });

      expect(mockPrisma.clientStatement.create.mock.calls[0][0].data.caseId).toBe(CASE);
      const lines = mockPrisma.clientStatementLine.createMany.mock.calls[0][0].data;
      expect(lines.length).toBeGreaterThan(0);
      expect(lines.every((l: any) => l.caseId === null)).toBe(true); // case-level satır caseId null
    });
  });
});
