import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { ExpenseRequestService, PaymentInput } from './expense-request.service';
import { ExpenseGateService, GateCheckResult } from './expense-gate.service';
import { ExpenseCalculatorService } from './expense-calculator.service';
import { PrismaService } from '@/prisma/prisma.service';
import { CaseBalanceService } from '@/modules/case-balance/case-balance.service';
import { AccountingJournalWriterService } from '@/modules/accounting-journal';
import { ClientSettlementReadService } from '@/modules/client-settlement/client-settlement-read.service';
import { NotificationDispatcherService } from '@/modules/client-notification/notification-dispatcher.service';
import { OfficeService } from '@/modules/office/office.service';
import { TariffService } from '@/modules/tariff/tariff.service';
import { Decimal } from '@prisma/client/runtime/library';
import { Prisma } from '@prisma/client';
import { stageExpenseRequestFingerprint } from './stage-expense-idempotency';

const CREATED_AT = new Date('2026-07-01T10:00:00.000Z');
const PAYMENT_CREATED_AT = new Date('2026-07-01T11:00:00.000Z');
const PAYMENT_DATE = new Date('2026-07-01T09:30:00.000Z');

const defaultJournalWriteResult = {
  ok: true,
  output: {
    status: 'CREATED',
    journalEntryId: 'journal-entry-1',
    idempotencyKey: 'journal-created-key',
    sourceVersion: 'journal-created-version',
    lineCount: 2,
  },
} as const;

const replayedJournalWriteResult = {
  ok: true,
  output: {
    status: 'REPLAYED',
    journalEntryId: 'journal-entry-replay',
    idempotencyKey: 'journal-replay-key',
    sourceVersion: 'journal-replay-version',
    lineCount: 2,
  },
} as const;

function recordedSourceVersion(expenseRequestId: string): string {
  return `${CREATED_AT.toISOString()}:${expenseRequestId}:RECORDED`;
}

function recordedPaymentSourceVersion(expensePaymentId: string, createdAt = PAYMENT_CREATED_AT): string {
  return `${createdAt.toISOString()}:${expensePaymentId}:RECORDED`;
}

// Mock data
const mockExpenseRequest = {
  id: 'exp-1',
  tenantId: 'tenant-1',
  caseId: 'case-1',
  clientId: 'client-1',
  stageCode: 'OPENING',
  gateType: 'BLOCKING',
  totalAmount: new Decimal(1500),
  currency: 'TRY',
  createdAt: CREATED_AT,
  paidTotal: new Decimal(0),
  status: 'PENDING',
};

const mockCase = {
  id: 'case-1',
  tenantId: 'tenant-1',
  clientId: 'client-1',
  caseType: 'ILAMSIZ',
  claimItems: [{ itemType: 'PRINCIPAL', amount: new Decimal(100000) }],
  client: { id: 'client-1', name: 'Test Client' },
};

// Mock services
const mockPrismaService: any = {
  expenseRequest: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
  },
  expenseRequestItem: {
    create: jest.fn(),
  },
  expensePayment: {
    create: jest.fn(),
  },
  expenseAuditLog: {
    create: jest.fn(),
  },
  case: {
    findFirst: jest.fn(),
  },
  client: {
    findFirst: jest.fn(),
  },
  // Paket modu talebi: paket tanımı okunur (bulunamazsa eksik-öneri denetimi atlanır — bugünkü davranış)
  costPackage: {
    findFirst: jest.fn(),
  },
  $transaction: jest.fn((fn: any) => fn(mockPrismaService)),
  $executeRaw: jest.fn().mockResolvedValue(1), // pg_advisory_xact_lock (açılış seti eşzamanlılık kilidi)
};

const mockCaseBalanceService = {
  credit: jest.fn(),
};

const mockJournalWriter = {
  write: jest.fn(),
};

const mockClientSettlementReadService = {
  computeExpenseRemaining: jest.fn((_prisma, _tenantId, _expenseRequestId, totalAmount, paidTotal) =>
    Promise.resolve(totalAmount.minus(paidTotal)),
  ),
};

// Faz 3.5: ödeme maili tetiği — best-effort dispatcher + office (mail finansal state'i etkilemez).
const mockDispatcher = {
  dispatch: jest.fn().mockResolvedValue({ status: 'sent' }),
};
const mockOffice = {
  getOfficeIdentity: jest.fn().mockResolvedValue({ name: 'Test Büro' }),
};

// ExpenseCalculatorService artık getActiveSharedTariff() çağırıp camelCase okuyor (fixedFees/rateFees/minAmount).
// Eski snake_case getActiveTariff mock'u eşleşmiyordu → camelCase getActiveSharedTariff eklendi.
const sharedTariff = {
  fixedFees: {
    application_fee: { amount: 738.50 },
    poa_copy_fee: { amount: 105.00 },
    bar_stamp_fee: { amount: 165.60 },
    file_expense: { amount: 50.00 },
  },
  rateFees: {
    ilamsiz_pesin_harc: { rate: 0.005, minAmount: 120 },
  },
  postage: {
    NORMAL: { amount: 252.00 },
  },
};
const mockTariffService = {
  getActiveSharedTariff: jest.fn().mockReturnValue(sharedTariff),
  getActiveTariff: jest.fn().mockReturnValue(sharedTariff),
};

// ExpenseRequestService yeni bağımlılık kazandı: ExpenseNotificationService (forwardRef, index [3]).
// Property testleri e-posta göndermeyi test etmiyor → stub (yalnız servisin çağırdığı sendExpenseRequest).
const mockExpenseNotificationService = {
  sendExpenseRequest: jest.fn().mockResolvedValue(undefined),
};

describe('ExpenseRequestService - Property Tests', () => {
  let service: ExpenseRequestService;
  let gateService: ExpenseGateService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockJournalWriter.write.mockReset();
    mockJournalWriter.write.mockResolvedValue(defaultJournalWriteResult);
    mockPrismaService.expensePayment.create.mockResolvedValue({ id: 'pay-default', createdAt: PAYMENT_CREATED_AT });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExpenseRequestService,
        ExpenseGateService,
        ExpenseCalculatorService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: ClientSettlementReadService, useValue: mockClientSettlementReadService },
        { provide: CaseBalanceService, useValue: mockCaseBalanceService },
        { provide: AccountingJournalWriterService, useValue: mockJournalWriter },
        { provide: TariffService, useValue: mockTariffService },
        { provide: ExpenseNotificationService, useValue: mockExpenseNotificationService },
        { provide: NotificationDispatcherService, useValue: mockDispatcher },
        { provide: OfficeService, useValue: mockOffice },
      ],
    }).compile();

    service = module.get<ExpenseRequestService>(ExpenseRequestService);
    gateService = module.get<ExpenseGateService>(ExpenseGateService);
  });

  function expectLastRecordedJournalDraft(sourceId: string, amount: string): void {
    const calls = mockJournalWriter.write.mock.calls;
    expect(calls.length).toBeGreaterThan(0);

    const [input, tx] = calls[calls.length - 1];
    const draft = input.draft;
    const sourceVersion = recordedSourceVersion(sourceId);

    expect(tx).toBe(mockPrismaService);
    expect(draft).toEqual(expect.objectContaining({
      tenantId: 'tenant-1',
      caseId: 'case-1',
      currency: 'TRY',
      entryType: 'EXPENSE_REQUEST_RECORDED',
      sourceType: 'EXPENSE_REQUEST',
      sourceAction: 'recorded',
      sourceId,
      sourceVersion,
      sourceOccurredAt: CREATED_AT.toISOString(),
      effectiveDate: '2026-07-01',
      postedById: 'user-1',
    }));
    expect(draft.idempotencyKey).toBe(
      `acct-journal:v1:tenant-1:EXPENSE_REQUEST:${sourceId}:recorded:${sourceVersion}`,
    );
    expect(draft.lines).toHaveLength(2);
    expect(draft.lines).toEqual(expect.arrayContaining([
      expect.objectContaining({
        accountCode: 'CLIENT_EXPENSE_RECEIVABLE',
        direction: 'DEBIT',
        amount,
        caseId: 'case-1',
        clientId: 'client-1',
        caseClientId: null,
        expenseRequestId: sourceId,
      }),
      expect.objectContaining({
        accountCode: 'FIRM_EXPENSE_REIMBURSEMENT',
        direction: 'CREDIT',
        amount,
        caseId: 'case-1',
        clientId: 'client-1',
        caseClientId: null,
        expenseRequestId: sourceId,
      }),
    ]));
  }

  function expectLastRecordedPaymentJournalDraft(expensePaymentId: string, amount: string, paymentDate = PAYMENT_DATE, createdAt = PAYMENT_CREATED_AT): void {
    const calls = mockJournalWriter.write.mock.calls;
    expect(calls.length).toBeGreaterThan(0);

    const [input, tx] = calls[calls.length - 1];
    const draft = input.draft;
    const sourceVersion = recordedPaymentSourceVersion(expensePaymentId, createdAt);

    expect(tx).toBe(mockPrismaService);
    expect(draft).toEqual(expect.objectContaining({
      tenantId: 'tenant-1',
      caseId: 'case-1',
      currency: 'TRY',
      entryType: 'EXPENSE_PAYMENT_RECORDED',
      sourceType: 'EXPENSE_PAYMENT',
      sourceAction: 'recorded',
      sourceId: expensePaymentId,
      sourceVersion,
      sourceOccurredAt: paymentDate.toISOString(),
      effectiveDate: paymentDate.toISOString().slice(0, 10),
      postedById: 'user-1',
    }));
    expect(draft.idempotencyKey).toBe(
      `acct-journal:v1:tenant-1:EXPENSE_PAYMENT:${expensePaymentId}:recorded:${sourceVersion}`,
    );
    expect(draft.lines).toHaveLength(2);
    expect(draft.lines).toEqual(expect.arrayContaining([
      expect.objectContaining({
        accountCode: 'CASH_CLEARING',
        direction: 'DEBIT',
        amount,
        caseId: 'case-1',
        clientId: 'client-1',
        caseClientId: null,
        expenseRequestId: 'exp-1',
        expensePaymentId,
      }),
      expect.objectContaining({
        accountCode: 'CLIENT_EXPENSE_RECEIVABLE',
        direction: 'CREDIT',
        amount,
        caseId: 'case-1',
        clientId: 'client-1',
        caseClientId: null,
        expenseRequestId: 'exp-1',
        expensePaymentId,
      }),
    ]));
  }

  describe('ExpenseRequest recorded journal wiring', () => {
    it('writes recorded journal inside manual create transaction', async () => {
      mockPrismaService.case.findFirst.mockResolvedValue(mockCase);
      mockPrismaService.client.findFirst.mockResolvedValue({ id: 'client-1' });
      mockPrismaService.expenseRequest.create.mockResolvedValue({
        ...mockExpenseRequest,
        id: 'manual-exp-1',
        totalAmount: new Decimal(250),
      });

      const result = await service.create('tenant-1', 'user-1', {
        caseId: 'case-1',
        clientId: 'client-1',
        items: [{ type: 'HARC', description: 'Filing harci', amount: 250 }],
      });

      expect(result.id).toBe('manual-exp-1');
      expect(mockPrismaService.$transaction).toHaveBeenCalledTimes(1);
      expectLastRecordedJournalDraft('manual-exp-1', '250');
    });

    it('writes recorded journal inside package create transaction', async () => {
      mockPrismaService.case.findFirst.mockResolvedValue(mockCase);
      mockPrismaService.client.findFirst.mockResolvedValue({ id: 'client-1' });
      mockPrismaService.expenseRequest.create.mockResolvedValue({
        ...mockExpenseRequest,
        id: 'package-exp-1',
        totalAmount: new Decimal(275),
      });

      const result = await service.createFromPackage('tenant-1', 'user-1', {
        caseId: 'case-1',
        clientId: 'client-1',
        packageCode: 'OPENING',
        items: [
          { itemCode: 'FILING', label: 'Filing', suggestedAmount: 300, finalAmount: 275 },
        ],
      });

      expect(result.id).toBe('package-exp-1');
      expect(mockPrismaService.$transaction).toHaveBeenCalledTimes(1);
      expectLastRecordedJournalDraft('package-exp-1', '275');
    });

    describe('createFromPackage — kalem satırları ve gönderim ("Oluştur ve Gönder")', () => {
      beforeEach(() => {
        mockPrismaService.case.findFirst.mockResolvedValue(mockCase);
        mockPrismaService.client.findFirst.mockResolvedValue({ id: 'client-1' });
        mockPrismaService.costPackage.findFirst.mockResolvedValue(null);
        mockPrismaService.expenseRequest.create.mockResolvedValue({ ...mockExpenseRequest, id: 'package-exp-2', totalAmount: new Decimal(630.4) });
      });

      const packageItems = [
        { itemCode: 'BASVURMA_HARCI', label: 'Başvurma Harcı', suggestedAmount: 615.4, finalAmount: 615.4 },
        { itemCode: 'TEBLIGAT_GIDERI', label: 'Tebligat Gideri', suggestedAmount: 15, finalAmount: 12, wasOverridden: true },
      ];

      it('paket talebi kalem SATIRI yazmaz (kalem yazım sözleşmesi owner kararı bekliyor; bugünkü davranış korunur)', async () => {
        await service.createFromPackage('tenant-1', 'user-1', { caseId: 'case-1', clientId: 'client-1', packageCode: 'UYAP_PRE', items: packageItems } as never);

        expect(mockPrismaService.expenseRequestItem.create).not.toHaveBeenCalled();
        expect(mockPrismaService.expenseRequest.create.mock.calls[0][0].data.totalAmount).toBeCloseTo(627.4, 2);
      });

      it('sendEmail:true talebi "gönderildi" YAPMAZ ve e-posta göndermez (eski sahte işaretleme kaldırıldı)', async () => {
        // Eski kod markAsSent → findOne ile talebi okuyup update çağırırdı: okunabilir PENDING talep hazırlanır ki geri dönüş testi DÜŞÜRSÜN
        mockPrismaService.expenseRequest.findFirst.mockResolvedValue({ ...mockExpenseRequest, id: 'package-exp-2', status: 'PENDING' });
        mockPrismaService.expenseRequest.update.mockResolvedValue({ ...mockExpenseRequest, id: 'package-exp-2', status: 'SENT', sentVia: 'EMAIL' });
        const result = await service.createFromPackage('tenant-1', 'user-1', {
          caseId: 'case-1',
          clientId: 'client-1',
          packageCode: 'UYAP_PRE',
          items: packageItems,
          sendEmail: true,
        } as never);

        expect(mockPrismaService.expenseRequest.update).not.toHaveBeenCalled();
        expect(mockExpenseNotificationService.sendExpenseRequest).not.toHaveBeenCalled();
        expect(result.status).toBe('PENDING');
        expect((result as any).sentVia).toBeUndefined();
      });
    });

    describe('sendExpenseEmailWithOutcome — pencerenin gönderim sonucu', () => {
      const lastAudit = (action: string, details: unknown) =>
        mockPrismaService.expenseRequest.findFirst.mockResolvedValue({ auditLogs: [{ action, details }] });

      it('başarı: sağlayıcı kabulü bildirilir, alıcıya teslim doğrulanmaz', async () => {
        mockExpenseNotificationService.sendExpenseRequest.mockResolvedValue({ success: true, notificationId: 'bildirim-1' });

        const result: any = await service.sendExpenseEmailWithOutcome('tenant-1', 'exp-1', 'user-1');

        expect(result).toMatchObject({ success: true, notificationId: 'bildirim-1', status: 'EMAIL_ACCEPTED', deliveryConfirmed: false });
        expect(result.message).toContain('Alıcıya teslim edildiği doğrulanmaz');
        expect(mockPrismaService.expenseRequest.findFirst).not.toHaveBeenCalled();
      });

      it.each([
        ['kapalı kapı: varsayılan hesap yok', { via: 'dispatcher', outcome: 'default-account-missing' }, 'PAYMENT_ACCOUNT_MISSING', true],
        ['kapalı kapı: IBAN yok', { via: 'dispatcher', outcome: 'iban-missing-fail-closed' }, 'PAYMENT_IBAN_MISSING', true],
        ['kalem satırı yok (paket talebi)', { via: 'dispatcher', outcome: 'items-missing' }, 'REQUEST_ITEMS_INVALID', false],
        ['kalem tutarı <= 0', { via: 'dispatcher', outcome: 'non-positive-amount' }, 'REQUEST_ITEMS_INVALID', false],
        ['müvekkil e-postası yok', { via: 'dispatcher', outcome: 'delivery-not-confirmed', reason: 'RECIPIENT_MISSING' }, 'RECIPIENT_MISSING', true],
        ['büro SMTP ayarı yok', { via: 'dispatcher', outcome: 'delivery-not-confirmed', reason: 'SMTP_NOT_CONFIGURED' }, 'SMTP_NOT_CONFIGURED', true],
        ['şablon yok', { via: 'dispatcher', outcome: 'delivery-not-confirmed', reason: 'TEMPLATE_MISSING' }, 'TEMPLATE_MISSING', true],
        ['sağlayıcı reddi', { via: 'dispatcher', outcome: 'delivery-not-confirmed', reason: 'DELIVERY_REJECTED' }, 'DELIVERY_REJECTED', true],
        ['zaman aşımı / belirsiz', { via: 'dispatcher', outcome: 'delivery-not-confirmed', reason: 'DELIVERY_UNCERTAIN' }, 'DELIVERY_UNCERTAIN', false],
        ['nedensiz eski kayıt', { via: 'dispatcher', outcome: 'delivery-not-confirmed' }, 'DELIVERY_NOT_CONFIRMED', false],
      ])('başarısızlık — %s → neden kodu + yeniden denenebilirlik', async (_title, details, reasonCode, retryable) => {
        mockExpenseNotificationService.sendExpenseRequest.mockResolvedValue({ success: false, reason: 'ham-kod' });
        lastAudit('EMAIL_FAILED', details);

        const result: any = await service.sendExpenseEmailWithOutcome('tenant-1', 'exp-1', 'user-1');

        expect(result).toMatchObject({ success: false, status: 'EMAIL_NOT_SENT', reasonCode, retryable, reason: 'ham-kod' });
        expect(typeof result.message).toBe('string');
        expect(result.message.length).toBeGreaterThan(10);
        expect(Array.isArray(result.requiredInfo)).toBe(true);
      });

      it('başarısızlık ama denetim kaydı okunamadı: tahmin edilmez, belirsiz (yeniden gönderilmez)', async () => {
        mockExpenseNotificationService.sendExpenseRequest.mockResolvedValue({ success: false });
        mockPrismaService.expenseRequest.findFirst.mockResolvedValue(null);

        const result: any = await service.sendExpenseEmailWithOutcome('tenant-1', 'exp-1', 'user-1');

        expect(result).toMatchObject({ success: false, reasonCode: 'DELIVERY_NOT_CONFIRMED', retryable: false });
      });

      it('talep bulunamazsa istisna aynen yayılır (başarı gibi sunulmaz)', async () => {
        mockExpenseNotificationService.sendExpenseRequest.mockRejectedValue(new NotFoundException('Masraf talebi bulunamadı'));

        await expect(service.sendExpenseEmailWithOutcome('tenant-1', 'yok', 'user-1')).rejects.toThrow('Masraf talebi bulunamadı');
      });
    });

    describe('createFromPackage — boş / eksik tutar reddi (eksik tutar 0 sayılmaz)', () => {
      const send = (items: unknown) =>
        service.createFromPackage('tenant-1', 'user-1', { caseId: 'case-1', clientId: 'client-1', packageCode: 'OPENING', items } as never);

      beforeEach(() => {
        mockPrismaService.case.findFirst.mockResolvedValue(mockCase);
        mockPrismaService.client.findFirst.mockResolvedValue({ id: 'client-1' });
        mockPrismaService.costPackage.findFirst.mockResolvedValue(null);
      });

      it.each([
        ['finalAmount null', [{ itemCode: 'PESIN_HARC', label: 'Peşin Harç', suggestedAmount: 100, finalAmount: null }]],
        ['finalAmount yok', [{ itemCode: 'PESIN_HARC', label: 'Peşin Harç' }]],
        ['finalAmount metin', [{ itemCode: 'PESIN_HARC', label: 'Peşin Harç', suggestedAmount: 100, finalAmount: '100' }]],
        ['finalAmount NaN', [{ itemCode: 'PESIN_HARC', label: 'Peşin Harç', suggestedAmount: 100, finalAmount: Number.NaN }]],
        ['kalemlerden biri tutarsız', [{ itemCode: 'A', label: 'A', suggestedAmount: 5, finalAmount: 5 }, { itemCode: 'B', label: 'B' }]],
      ])('%s → 400, hiçbir kayıt yazılmaz', async (_title, items) => {
        await expect(send(items)).rejects.toThrow('eksik tutar 0 sayılmaz');
        expect(mockPrismaService.$transaction).not.toHaveBeenCalled();
        expect(mockPrismaService.expenseRequest.create).not.toHaveBeenCalled();
      });

      it.each([[undefined], [null], [[]]])('kalem listesi boş ya da yok (%p) → 400, hiçbir kayıt yazılmaz', async (items) => {
        await expect(send(items)).rejects.toThrow('En az bir masraf kalemi zorunludur');
        expect(mockPrismaService.$transaction).not.toHaveBeenCalled();
      });

      it('AÇIKÇA girilmiş 0 bugünkü kuralla işlenir: kalem 0 yazılır, toplam diğer kalemlerinkidir (reddedilmez)', async () => {
        mockPrismaService.expenseRequest.create.mockResolvedValue({ ...mockExpenseRequest, id: 'package-exp-0', totalAmount: new Decimal(615.4) });

        const result = await send([
          { itemCode: 'BASVURMA_HARCI', label: 'Başvurma Harcı', suggestedAmount: 615.4, finalAmount: 615.4 },
          { itemCode: 'PESIN_HARC', label: 'Peşin Harç', suggestedAmount: 0, finalAmount: 0 },
        ]);

        expect(result.id).toBe('package-exp-0');
        expect(mockPrismaService.$transaction).toHaveBeenCalledTimes(1);
        expect(mockPrismaService.expenseRequest.create.mock.calls[0][0].data.totalAmount).toBe(615.4);
      });

      it('toplamı 0 olan talep bugün de (günlük doğrulaması) reddedilir — bu işte DEĞİŞMEDİ', async () => {
        mockPrismaService.expenseRequest.create.mockResolvedValue({ ...mockExpenseRequest, id: 'package-exp-z', totalAmount: new Decimal(0) });

        await expect(send([{ itemCode: 'PESIN_HARC', label: 'Peşin Harç', suggestedAmount: 0, finalAmount: 0 }])).rejects.toThrow('journal validation failed');
      });
    });

    it('writes recorded journal inside stage expense set transaction', async () => {
      mockPrismaService.case.findFirst.mockResolvedValue(mockCase);
      mockPrismaService.expenseRequest.create.mockResolvedValue({
        ...mockExpenseRequest,
        id: 'stage-exp-1',
        stageCode: 'SEIZURE',
        totalAmount: new Decimal(300),
      });

      const result = await service.createStageExpenseSet('case-1', 'SEIZURE', 'tenant-1', 'user-1');

      expect(result.id).toBe('stage-exp-1');
      expect(mockPrismaService.expenseRequestItem.create).toHaveBeenCalled();
      expectLastRecordedJournalDraft('stage-exp-1', '300');
    });

    it('fails closed and prevents post-create side effects when journal writer fails', async () => {
      mockPrismaService.case.findFirst.mockResolvedValue(mockCase);
      mockPrismaService.client.findFirst.mockResolvedValue({ id: 'client-1' });
      mockPrismaService.expenseRequest.create.mockResolvedValue({
        ...mockExpenseRequest,
        id: 'manual-exp-fail',
        totalAmount: new Decimal(250),
      });
      mockJournalWriter.write.mockResolvedValueOnce({
        ok: false,
        errors: [{ code: 'DB_WRITE_FAILED', message: 'journal write failed', path: null, details: {} }],
      });

      await expect(service.create('tenant-1', 'user-1', {
        caseId: 'case-1',
        clientId: 'client-1',
        items: [{ type: 'HARC', description: 'Filing harci', amount: 250 }],
        paidByLawyer: true,
      })).rejects.toThrow('ExpenseRequest journal write failed: DB_WRITE_FAILED');

      expect(mockCaseBalanceService.credit).not.toHaveBeenCalled();
    });

    it('accepts writer replay with deterministic idempotency key', async () => {
      mockPrismaService.case.findFirst.mockResolvedValue(mockCase);
      mockPrismaService.client.findFirst.mockResolvedValue({ id: 'client-1' });
      mockPrismaService.expenseRequest.create.mockResolvedValue({
        ...mockExpenseRequest,
        id: 'manual-exp-replay',
        totalAmount: new Decimal(250),
      });
      mockJournalWriter.write.mockResolvedValueOnce(replayedJournalWriteResult);

      const result = await service.create('tenant-1', 'user-1', {
        caseId: 'case-1',
        clientId: 'client-1',
        items: [{ type: 'HARC', description: 'Filing harci', amount: 250 }],
      });

      expect(result.id).toBe('manual-exp-replay');
      expectLastRecordedJournalDraft('manual-exp-replay', '250');
    });
  });
  describe('Property 1: Case Creation Triggers Expense Set', () => {
    /**
     * Property: For any Case that transitions from DRAFT to CREATED status,
     * the system should automatically create an ExpenseRequest with 6 items.
     */
    it('should create expense set with 6 items when case is created', async () => {
      mockPrismaService.case.findFirst.mockResolvedValue(mockCase);
      mockPrismaService.expenseRequest.findFirst.mockResolvedValue(null);
      mockPrismaService.expenseRequest.create.mockResolvedValue({
        ...mockExpenseRequest,
        id: 'new-exp-1',
      });

      const result = await service.createOpeningExpenseSet('case-1', 'tenant-1', 'user-1');

      expect(result).toBeDefined();
      expect(mockPrismaService.expenseRequest.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            stageCode: 'OPENING',
            gateType: 'BLOCKING',
          }),
        })
      );
      // 6 items should be created
      expect(mockPrismaService.expenseRequestItem.create).toHaveBeenCalledTimes(6);
      expectLastRecordedJournalDraft('new-exp-1', '1500');
    });

    it('should throw error if expense set already exists for OPENING stage', async () => {
      mockPrismaService.case.findFirst.mockResolvedValue(mockCase);
      mockPrismaService.expenseRequest.findFirst.mockResolvedValue(mockExpenseRequest);

      await expect(
        service.createOpeningExpenseSet('case-1', 'tenant-1', 'user-1')
      ).rejects.toThrow('Bu takip için açılış masrafları zaten oluşturulmuş');
    });

    it('should throw error if case has no client', async () => {
      mockPrismaService.case.findFirst.mockResolvedValue({ ...mockCase, clientId: null });

      await expect(
        service.createOpeningExpenseSet('case-1', 'tenant-1', 'user-1')
      ).rejects.toThrow('Takibe müvekkil atanmamış');
    });

    it.each([
      ['dosya USD', { currency: 'USD', claimItems: [{ itemType: 'PRINCIPAL', amount: new Decimal(100000), currency: 'USD' }] }, ['USD']],
      ['dosya TRY, anapara kalemi USD', { currency: 'TRY', dues: [{ type: 'PRINCIPAL', amount: new Decimal(100000), currency: 'USD' }] }, ['TRY', 'USD']],
      ['dosya USD, anapara kalemi TRY damgalı', { currency: 'USD', dues: [{ type: 'PRINCIPAL', amount: new Decimal(100000), currency: 'TRY' }] }, ['TRY', 'USD']],
    ])('peşin harç matrahı TL değilse (%s) hiçbir kayıt yazmadan gerekçesiyle reddeder', async (_title, caseOverride, basisCurrencies) => {
      mockPrismaService.case.findFirst.mockResolvedValue({ ...mockCase, ...caseOverride });
      mockPrismaService.expenseRequest.findFirst.mockResolvedValue(null);

      const error = await service.createOpeningExpenseSet('case-1', 'tenant-1', 'user-1').catch((caught) => caught);

      expect(error?.getStatus?.()).toBe(409);
      expect(error.getResponse()).toEqual({
        code: 'OPENING_EXPENSE_FX_BASIS_POLICY_MISSING',
        message: expect.stringContaining('Açılış masraf talebi otomatik oluşturulmadı'),
        requiredInfo: ['Peşin harç tutarı (TL)'],
        notCalculableItems: [{ itemCode: 'PESIN_HARC', label: 'Peşin Harç' }],
        caseCurrency: caseOverride.currency,
        basisCurrencies,
        tariffCurrency: 'TRY',
      });
      expect(mockPrismaService.$transaction).not.toHaveBeenCalled();
      expect(mockPrismaService.expenseRequest.create).not.toHaveBeenCalled();
      expect(mockPrismaService.expenseRequestItem.create).not.toHaveBeenCalled();
      expect(mockPrismaService.expenseAuditLog.create).not.toHaveBeenCalled();
      expect(mockJournalWriter.write).not.toHaveBeenCalled();
    });

    it('dövizli dosyada ÖNCEDEN oluşmuş açılış talebi varsa eski kural geçerlidir ("zaten oluşturulmuş"); kayıt değiştirilmez', async () => {
      mockPrismaService.case.findFirst.mockResolvedValue({ ...mockCase, currency: 'USD' });
      mockPrismaService.expenseRequest.findFirst.mockResolvedValue(mockExpenseRequest);

      await expect(
        service.createOpeningExpenseSet('case-1', 'tenant-1', 'user-1')
      ).rejects.toThrow('Bu takip için açılış masrafları zaten oluşturulmuş');
      expect(mockPrismaService.expenseRequest.update).not.toHaveBeenCalled();
      expect(mockPrismaService.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('Açılış masraf seti — eşzamanlılık kilidi', () => {
    it('yazma dosya bazında kilitlenir; "zaten oluşturulmuş" kuralı kilit altında yeniden denetlenir, sonra yazılır', async () => {
      mockPrismaService.case.findFirst.mockResolvedValue(mockCase);
      mockPrismaService.expenseRequest.findFirst.mockResolvedValue(null);
      mockPrismaService.expenseRequest.create.mockResolvedValue({ ...mockExpenseRequest, id: 'locked-exp-1' });

      await service.createOpeningExpenseSet('case-1', 'tenant-1', 'user-1');

      // Kilit: işlem (transaction) istemcisi üzerinde, dosyaya özgü anahtarla, tam bir kez
      expect(mockPrismaService.$executeRaw).toHaveBeenCalledTimes(1);
      const [strings, lockKey] = mockPrismaService.$executeRaw.mock.calls[0];
      expect(strings.join('?')).toBe('SELECT pg_advisory_xact_lock(hashtextextended(?, 0))');
      expect(lockKey).toBe('expense-request-opening-set:tenant-1:case-1');
      // Sıra: işlem dışı ön denetim → kilit → kilit altında yeniden denetim → yazma
      const where = { caseId: 'case-1', tenantId: 'tenant-1', stageCode: 'OPENING', status: { not: 'CANCELLED' } };
      expect(mockPrismaService.expenseRequest.findFirst.mock.calls.map(([args]: [any]) => args.where)).toEqual([where, where]);
      const [preCheckOrder, reCheckOrder] = mockPrismaService.expenseRequest.findFirst.mock.invocationCallOrder;
      const lockOrder = mockPrismaService.$executeRaw.mock.invocationCallOrder[0];
      const createOrder = mockPrismaService.expenseRequest.create.mock.invocationCallOrder[0];
      expect(preCheckOrder).toBeLessThan(lockOrder);
      expect(lockOrder).toBeLessThan(reCheckOrder);
      expect(reCheckOrder).toBeLessThan(createOrder);
    });

    it('kilit beklenirken başka istek talebi yazmışsa: "zaten oluşturulmuş" — ikinci talep, kalem ve günlük kaydı yazılmaz', async () => {
      mockPrismaService.case.findFirst.mockResolvedValue(mockCase);
      mockPrismaService.expenseRequest.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'exp-concurrent' });

      await expect(service.createOpeningExpenseSet('case-1', 'tenant-1', 'user-1')).rejects.toThrow(
        'Bu takip için açılış masrafları zaten oluşturulmuş',
      );

      expect(mockPrismaService.$executeRaw).toHaveBeenCalledTimes(1);
      expect(mockPrismaService.expenseRequest.findFirst).toHaveBeenCalledTimes(2);
      expect(mockPrismaService.expenseRequest.create).not.toHaveBeenCalled();
      expect(mockPrismaService.expenseRequestItem.create).not.toHaveBeenCalled();
      expect(mockPrismaService.expenseAuditLog.create).not.toHaveBeenCalled();
      expect(mockJournalWriter.write).not.toHaveBeenCalled();
    });
  });

  describe('Aşama masraf seti — oranlı kalem matrahı ve açılış yönlendirmesi', () => {
    const usdCase = { ...mockCase, currency: 'USD', claimItems: [{ itemType: 'PRINCIPAL', amount: new Decimal(100000), currency: 'USD' }] };
    const mixedCase = {
      ...mockCase,
      currency: 'USD',
      claimItems: [
        { itemType: 'PRINCIPAL', amount: new Decimal(100000), currency: 'USD' },
        { itemType: 'PRINCIPAL', amount: new Decimal(25000), currency: 'TRY' },
      ],
    };
    const legacyCase = { ...mockCase, currency: 'USD', claimItems: [{ itemType: 'PRINCIPAL', amount: new Decimal(100000), currency: 'TRY' }] };

    const expectNothingWritten = () => {
      expect(mockPrismaService.$transaction).not.toHaveBeenCalled();
      expect(mockPrismaService.expenseRequest.create).not.toHaveBeenCalled();
      expect(mockPrismaService.expenseRequestItem.create).not.toHaveBeenCalled();
      expect(mockPrismaService.expenseAuditLog.create).not.toHaveBeenCalled();
      expect(mockJournalWriter.write).not.toHaveBeenCalled();
    };

    it.each([
      ['SEIZURE', 'dosya USD', usdCase, ['USD'], { itemCode: 'HACIZ_HARCI', label: 'Haciz Harcı' }],
      ['SALE', 'dosya USD', usdCase, ['USD'], { itemCode: 'SATIS_HARCI', label: 'Satış Harcı' }],
      ['SEIZURE', 'dosya USD + TRY anapara kalemi', mixedCase, ['TRY', 'USD'], { itemCode: 'HACIZ_HARCI', label: 'Haciz Harcı' }],
      ['SALE', 'dosya USD, anapara kalemi TRY damgalı', legacyCase, ['TRY', 'USD'], { itemCode: 'SATIS_HARCI', label: 'Satış Harcı' }],
    ])('%s seti, %s: oranlı kalemin matrahı TL değil → hiçbir kayıt yazmadan gerekçesiyle reddeder', async (stageCode, _title, caseRow, basisCurrencies, item) => {
      mockPrismaService.case.findFirst.mockResolvedValue(caseRow);

      const error = await service.createStageExpenseSet('case-1', stageCode, 'tenant-1', 'user-1').catch((caught) => caught);

      expect(error?.getStatus?.()).toBe(409);
      expect(error.getResponse()).toEqual({
        code: 'STAGE_EXPENSE_FX_BASIS_POLICY_MISSING',
        message: expect.stringContaining('talebi otomatik oluşturulmadı'),
        stageCode,
        requiredInfo: [`${item.label} tutarı (TL)`],
        notCalculableItems: [item],
        caseCurrency: 'USD',
        basisCurrencies,
        tariffCurrency: 'TRY',
      });
      expectNothingWritten();
    });

    it('TL dosya: haciz seti bugünkü tutarlarla yazılır (davranış değişmez)', async () => {
      mockPrismaService.case.findFirst.mockResolvedValue({ ...mockCase, currency: 'TRY', claimItems: [{ itemType: 'PRINCIPAL', amount: new Decimal(100000), currency: 'TRY' }] });
      mockPrismaService.expenseRequest.create.mockResolvedValue({ ...mockExpenseRequest, id: 'stage-try-1', stageCode: 'SEIZURE', totalAmount: new Decimal(790) });

      const result = await service.createStageExpenseSet('case-1', 'SEIZURE', 'tenant-1', 'user-1');

      expect(result.id).toBe('stage-try-1');
      expect(mockPrismaService.expenseRequest.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ stageCode: 'SEIZURE', packageCode: 'SEIZURE', gateType: 'BLOCKING', status: 'PENDING', totalSuggested: 790, totalAmount: 790 }),
        }),
      );
      expect(mockPrismaService.expenseRequestItem.create.mock.calls.map(([args]: [any]) => [args.data.itemCode, args.data.finalAmount])).toEqual([
        ['HACIZ_HARCI', 440],
        ['HACIZ_YOLLUK', 350],
      ]);
      expectLastRecordedJournalDraft('stage-try-1', '790');
    });

    it('yeniden tebligat seti dövizli dosyada da yazılır: oranlı kalemi yoktur (sabit TL gider)', async () => {
      mockPrismaService.case.findFirst.mockResolvedValue(usdCase);
      mockPrismaService.expenseRequest.create.mockResolvedValue({ ...mockExpenseRequest, id: 'stage-usd-renotif', stageCode: 'RE_NOTIFICATION', totalAmount: new Decimal(252) });

      const result = await service.createStageExpenseSet('case-1', 'RE_NOTIFICATION', 'tenant-1', 'user-1');

      expect(result.id).toBe('stage-usd-renotif');
      expect(mockPrismaService.expenseRequestItem.create.mock.calls.map(([args]: [any]) => [args.data.itemCode, args.data.finalAmount])).toEqual([
        ['YENIDEN_TEBLIGAT', 252],
      ]);
      expectLastRecordedJournalDraft('stage-usd-renotif', '252');
    });

    it('OPENING aşama kodu açılış işlevine devredilir: aşama hesaplayıcısıyla (kalemleri 0) yazılmaz', async () => {
      const opening = jest.spyOn(service, 'createOpeningExpenseSet').mockResolvedValue({ id: 'opening-via-stage' } as never);

      const result = await service.createStageExpenseSet('case-1', 'OPENING', 'tenant-1', 'user-1');

      expect(result).toEqual({ id: 'opening-via-stage' });
      expect(opening).toHaveBeenCalledTimes(1);
      expect(opening).toHaveBeenCalledWith('case-1', 'tenant-1', 'user-1');
      // Aşama yolunun kendi okuma / yazma adımları hiç çalışmaz
      expect(mockPrismaService.case.findFirst).not.toHaveBeenCalled();
      expectNothingWritten();
    });

    it('OPENING aşama kodu açılış kurallarını devralır: talep varsa "zaten oluşturulmuş", dövizli dosyada peşin harç gerekçesi', async () => {
      mockPrismaService.case.findFirst.mockResolvedValue(mockCase);
      mockPrismaService.expenseRequest.findFirst.mockResolvedValue(mockExpenseRequest);
      await expect(service.createStageExpenseSet('case-1', 'OPENING', 'tenant-1', 'user-1')).rejects.toThrow(
        'Bu takip için açılış masrafları zaten oluşturulmuş',
      );

      mockPrismaService.case.findFirst.mockResolvedValue(usdCase);
      mockPrismaService.expenseRequest.findFirst.mockResolvedValue(null);
      const error = await service.createStageExpenseSet('case-1', 'OPENING', 'tenant-1', 'user-1').catch((caught) => caught);
      expect(error?.getStatus?.()).toBe(409);
      expect(error.getResponse()).toMatchObject({ code: 'OPENING_EXPENSE_FX_BASIS_POLICY_MISSING', notCalculableItems: [{ itemCode: 'PESIN_HARC', label: 'Peşin Harç' }] });

      expectNothingWritten();
    });
  });

  describe('Aşama masraf seti — istek anahtarı (idempotency)', () => {
    const tryCase = { ...mockCase, currency: 'TRY', claimItems: [{ itemType: 'PRINCIPAL', amount: new Decimal(100000), currency: 'TRY' }] };
    const fingerprintOf = (caseId: string, stageCode: string) => stageExpenseRequestFingerprint({ caseId, stageCode });
    const existingRow = (overrides: Record<string, unknown> = {}) => ({
      ...mockExpenseRequest,
      id: 'keyed-1',
      stageCode: 'SEIZURE',
      status: 'PENDING',
      idempotencyKey: 'key-1',
      requestFingerprint: fingerprintOf('case-1', 'SEIZURE'),
      ...overrides,
    });
    const expectNothingWritten = () => {
      expect(mockPrismaService.$transaction).not.toHaveBeenCalled();
      expect(mockPrismaService.expenseRequest.create).not.toHaveBeenCalled();
      expect(mockPrismaService.expenseRequestItem.create).not.toHaveBeenCalled();
      expect(mockPrismaService.expenseAuditLog.create).not.toHaveBeenCalled();
      expect(mockJournalWriter.write).not.toHaveBeenCalled();
    };

    it('aynı büro + anahtar + aynı içerik: mevcut talep tekrar olarak döner; işlem, kilit, talep, kalem, denetim ve günlük yazımı YOK', async () => {
      mockPrismaService.case.findFirst.mockResolvedValue(tryCase);
      mockPrismaService.expenseRequest.findFirst.mockResolvedValue(existingRow());

      const result = await service.createStageExpenseSet('case-1', 'SEIZURE', 'tenant-1', 'user-1', { idempotencyKey: 'key-1' });

      expect(result).toEqual(expect.objectContaining({ id: 'keyed-1', idempotentReplay: true }));
      expect(mockPrismaService.expenseRequest.findFirst).toHaveBeenCalledWith({ where: { tenantId: 'tenant-1', idempotencyKey: 'key-1' } });
      expect(mockPrismaService.$executeRaw).not.toHaveBeenCalled();
      expectNothingWritten();
    });

    it('dosya denetimi tekrarda da çalışır: başka büronun / var olmayan dosya anahtar aranmadan 404', async () => {
      mockPrismaService.case.findFirst.mockResolvedValue(null);

      await expect(service.createStageExpenseSet('case-x', 'SEIZURE', 'tenant-1', 'user-1', { idempotencyKey: 'key-1' })).rejects.toThrow('Takip bulunamadı');

      expect(mockPrismaService.case.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'case-x', tenantId: 'tenant-1' } }));
      expect(mockPrismaService.expenseRequest.findFirst).not.toHaveBeenCalled();
      expectNothingWritten();
    });

    it('aynı anahtar farklı içerik (başka aşama): 409 IDEMPOTENCY_KEY_CONFLICT, yazım yok', async () => {
      mockPrismaService.case.findFirst.mockResolvedValue(tryCase);
      mockPrismaService.expenseRequest.findFirst.mockResolvedValue(existingRow());

      const error = await service.createStageExpenseSet('case-1', 'SALE', 'tenant-1', 'user-1', { idempotencyKey: 'key-1' }).catch((caught) => caught);

      expect(error?.getStatus?.()).toBe(409);
      expect(error.getResponse()).toEqual({ code: 'IDEMPOTENCY_KEY_CONFLICT', message: expect.stringContaining('farklı içerikle') });
      expectNothingWritten();
    });

    it('iptal edilmiş talebin anahtarı: 409 IDEMPOTENCY_KEY_CANCELLED, yazım yok', async () => {
      mockPrismaService.case.findFirst.mockResolvedValue(tryCase);
      mockPrismaService.expenseRequest.findFirst.mockResolvedValue(existingRow({ status: 'CANCELLED' }));

      const error = await service.createStageExpenseSet('case-1', 'SEIZURE', 'tenant-1', 'user-1', { idempotencyKey: 'key-1' }).catch((caught) => caught);

      expect(error?.getStatus?.()).toBe(409);
      expect(error.getResponse()).toMatchObject({ code: 'IDEMPOTENCY_KEY_CANCELLED' });
      expectNothingWritten();
    });

    it('yeni anahtar: büro+anahtar kilidi alınır, kilit altında yeniden okunur, sonra anahtar ve parmak iziyle yazılır; yanıt idempotentReplay false', async () => {
      mockPrismaService.case.findFirst.mockResolvedValue(tryCase);
      mockPrismaService.expenseRequest.findFirst.mockResolvedValue(null);
      mockPrismaService.expenseRequest.create.mockResolvedValue({ ...mockExpenseRequest, id: 'keyed-new', stageCode: 'SEIZURE', totalAmount: new Decimal(790) });

      const result = await service.createStageExpenseSet('case-1', 'SEIZURE', 'tenant-1', 'user-1', { idempotencyKey: '  key-new  ' });

      expect(result).toEqual(expect.objectContaining({ id: 'keyed-new', idempotentReplay: false }));
      const [strings, lockKey] = mockPrismaService.$executeRaw.mock.calls[0];
      expect(strings.join('?')).toBe('SELECT pg_advisory_xact_lock(hashtextextended(?, 0))');
      expect(lockKey).toBe('expense-request-stage-key:tenant-1:key-new');
      const where = { tenantId: 'tenant-1', idempotencyKey: 'key-new' };
      expect(mockPrismaService.expenseRequest.findFirst.mock.calls.map(([args]: [any]) => args.where)).toEqual([where, where]);
      const [preCheckOrder, reCheckOrder] = mockPrismaService.expenseRequest.findFirst.mock.invocationCallOrder;
      const lockOrder = mockPrismaService.$executeRaw.mock.invocationCallOrder[0];
      const createOrder = mockPrismaService.expenseRequest.create.mock.invocationCallOrder[0];
      expect(preCheckOrder).toBeLessThan(lockOrder);
      expect(lockOrder).toBeLessThan(reCheckOrder);
      expect(reCheckOrder).toBeLessThan(createOrder);
      expect(mockPrismaService.expenseRequest.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ idempotencyKey: 'key-new', requestFingerprint: fingerprintOf('case-1', 'SEIZURE'), stageCode: 'SEIZURE', totalAmount: 790 }),
        }),
      );
    });

    it('kilit beklenirken başka istek aynı anahtarı yazmışsa: tekrar olarak döner; ikinci talep, kalem, denetim ve günlük yazılmaz', async () => {
      mockPrismaService.case.findFirst.mockResolvedValue(tryCase);
      mockPrismaService.expenseRequest.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(existingRow({ id: 'keyed-race' }));

      const result = await service.createStageExpenseSet('case-1', 'SEIZURE', 'tenant-1', 'user-1', { idempotencyKey: 'key-1' });

      expect(result).toEqual(expect.objectContaining({ id: 'keyed-race', idempotentReplay: true }));
      expect(mockPrismaService.$executeRaw).toHaveBeenCalledTimes(1);
      expect(mockPrismaService.expenseRequest.create).not.toHaveBeenCalled();
      expect(mockPrismaService.expenseRequestItem.create).not.toHaveBeenCalled();
      expect(mockPrismaService.expenseAuditLog.create).not.toHaveBeenCalled();
      expect(mockJournalWriter.write).not.toHaveBeenCalled();
    });

    it('benzersiz indeks son savunma: yazım P2002 verirse kazanan satır yeniden okunur ve tekrar olarak döner', async () => {
      mockPrismaService.case.findFirst.mockResolvedValue(tryCase);
      mockPrismaService.expenseRequest.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(existingRow({ id: 'keyed-winner' }));
      mockPrismaService.expenseRequest.create.mockRejectedValue(new Prisma.PrismaClientKnownRequestError('Unique constraint failed', { code: 'P2002', clientVersion: 'test' }));

      const result = await service.createStageExpenseSet('case-1', 'SEIZURE', 'tenant-1', 'user-1', { idempotencyKey: 'key-1' });

      expect(result).toEqual(expect.objectContaining({ id: 'keyed-winner', idempotentReplay: true }));
    });

    it('anahtarsız çağrı (iş akışı yolu dahil): kilit YOK, anahtar alanları yazılmaz, yanıtta idempotentReplay alanı yok (koruma DIŞI, bugünkü davranış)', async () => {
      mockPrismaService.case.findFirst.mockResolvedValue(tryCase);
      mockPrismaService.expenseRequest.create.mockResolvedValue({ ...mockExpenseRequest, id: 'keyless-1', stageCode: 'SEIZURE', totalAmount: new Decimal(790) });

      const result = await service.createStageExpenseSet('case-1', 'SEIZURE', 'tenant-1', 'user-1');

      expect(result).not.toHaveProperty('idempotentReplay');
      expect(mockPrismaService.$executeRaw).not.toHaveBeenCalled();
      expect(mockPrismaService.expenseRequest.findFirst).not.toHaveBeenCalled();
      const data = mockPrismaService.expenseRequest.create.mock.calls[0][0].data;
      expect(data).not.toHaveProperty('idempotencyKey');
      expect(data).not.toHaveProperty('requestFingerprint');
    });

    it.each([['boş', ''], ['uzun', 'x'.repeat(129)], ['izinsiz karakter', 'a b'], ['metin değil', 42]])(
      'geçersiz anahtar (%s): 400 IDEMPOTENCY_KEY_INVALID; dosya bile okunmaz',
      async (_title, value) => {
        const error = await service.createStageExpenseSet('case-1', 'SEIZURE', 'tenant-1', 'user-1', { idempotencyKey: value }).catch((caught) => caught);

        expect(error?.getStatus?.()).toBe(400);
        expect(error.getResponse()).toMatchObject({ code: 'IDEMPOTENCY_KEY_INVALID' });
        expect(mockPrismaService.case.findFirst).not.toHaveBeenCalled();
        expectNothingWritten();
      },
    );

    it('OPENING + anahtar: açılış işlevine devredilmez, 400 IDEMPOTENCY_KEY_UNSUPPORTED_FOR_OPENING', async () => {
      const opening = jest.spyOn(service, 'createOpeningExpenseSet').mockResolvedValue({ id: 'must-not-run' } as never);

      const error = await service.createStageExpenseSet('case-1', 'OPENING', 'tenant-1', 'user-1', { idempotencyKey: 'key-1' }).catch((caught) => caught);

      expect(error?.getStatus?.()).toBe(400);
      expect(error.getResponse()).toMatchObject({ code: 'IDEMPOTENCY_KEY_UNSUPPORTED_FOR_OPENING' });
      expect(opening).not.toHaveBeenCalled();
      expectNothingWritten();
    });

    it('dövizli dosyada anahtarlı çağrı: oranlı kalem gerekçesiyle 409 (anahtar kaydı bırakmaz); mevcut anahtarlı satır varsa matrah denetimi tekrarlanmadan özgün sonuç döner', async () => {
      const usdCase = { ...mockCase, currency: 'USD', claimItems: [{ itemType: 'PRINCIPAL', amount: new Decimal(100000), currency: 'USD' }] };
      mockPrismaService.case.findFirst.mockResolvedValue(usdCase);
      mockPrismaService.expenseRequest.findFirst.mockResolvedValue(null);

      const rejected = await service.createStageExpenseSet('case-1', 'SEIZURE', 'tenant-1', 'user-1', { idempotencyKey: 'key-usd' }).catch((caught) => caught);
      expect(rejected?.getStatus?.()).toBe(409);
      expect(rejected.getResponse()).toMatchObject({ code: 'STAGE_EXPENSE_FX_BASIS_POLICY_MISSING' });
      expectNothingWritten();

      mockPrismaService.expenseRequest.findFirst.mockResolvedValue(existingRow({ id: 'keyed-usd' }));
      const replayed = await service.createStageExpenseSet('case-1', 'SEIZURE', 'tenant-1', 'user-1', { idempotencyKey: 'key-usd' });
      expect(replayed).toEqual(expect.objectContaining({ id: 'keyed-usd', idempotentReplay: true }));
    });
  });

  describe('Açılış masraf setinin otomatik hesap durumu (salt okuma)', () => {
    it('evaluateOpeningExpenseBasisForCase: dosya tenant altında aranır; bulunamazsa NotFound', async () => {
      mockPrismaService.case.findFirst.mockResolvedValue(null);

      await expect(service.evaluateOpeningExpenseBasisForCase('case-x', 'tenant-1')).rejects.toThrow('Takip bulunamadı');
      expect(mockPrismaService.case.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'case-x', tenantId: 'tenant-1' } }),
      );
    });

    it('getOpeningExpenseAutomationStatus: dövizli dosyada talep yoksa nedeni bildirir; hiçbir kayıt yazmaz', async () => {
      mockPrismaService.case.findFirst.mockResolvedValue({
        clientId: 'client-1',
        currency: 'EUR',
        dues: [{ currency: 'EUR' }],
        claimItems: [],
      });
      mockPrismaService.expenseRequest.findFirst.mockResolvedValue(null);
      mockPrismaService.expenseRequest.count.mockResolvedValue(0);

      const status = await service.getOpeningExpenseAutomationStatus('case-1', 'tenant-1');

      expect(status).toMatchObject({
        caseId: 'case-1',
        clientAssigned: true,
        openingRequestExists: false,
        activeExpenseRequestCount: 0,
        automaticCalculation: { calculable: false, reasonCode: 'OPENING_EXPENSE_FX_BASIS_POLICY_MISSING', caseCurrency: 'EUR' },
      });
      expect(mockPrismaService.expenseRequest.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { caseId: 'case-1', tenantId: 'tenant-1', stageCode: 'OPENING', status: { not: 'CANCELLED' } } }),
      );
      expect(mockPrismaService.expenseRequest.count).toHaveBeenCalledWith({
        where: { caseId: 'case-1', tenantId: 'tenant-1', status: { not: 'CANCELLED' } },
      });
      expect(mockPrismaService.$transaction).not.toHaveBeenCalled();
      expect(mockPrismaService.expenseRequest.create).not.toHaveBeenCalled();
    });

    it('getOpeningExpenseAutomationStatus: TL dosyada açılış talebi varsa hesaplanabilir + talep var', async () => {
      mockPrismaService.case.findFirst.mockResolvedValue({ clientId: 'client-1', currency: 'TRY', dues: [{ currency: 'TRY' }], claimItems: [] });
      mockPrismaService.expenseRequest.findFirst.mockResolvedValue({ id: 'exp-1' });
      mockPrismaService.expenseRequest.count.mockResolvedValue(2);

      expect(await service.getOpeningExpenseAutomationStatus('case-1', 'tenant-1')).toEqual({
        caseId: 'case-1',
        clientAssigned: true,
        openingRequestExists: true,
        activeExpenseRequestCount: 2,
        automaticCalculation: { calculable: true },
      });
    });
  });

  describe('Property 3: Payment Status Correctness', () => {
    /**
     * Property: For any ExpenseRequest with payments,
     * if paidTotal < totalAmount then status should be PARTIAL,
     * if paidTotal >= totalAmount then status should be PAID.
     */
    it('should set status to PARTIAL when payment is less than total', async () => {
      const partialRequest = {
        ...mockExpenseRequest,
        totalAmount: new Decimal(1000),
        paidTotal: new Decimal(0),
      };
      mockPrismaService.expenseRequest.findFirst.mockResolvedValue(partialRequest);
      mockPrismaService.expensePayment.create.mockResolvedValue({
        id: 'pay-partial',
        amount: new Decimal(500),
        paymentDate: PAYMENT_DATE,
        method: 'BANK_TRANSFER',
        reference: 'DEKONT-PARTIAL',
        createdAt: PAYMENT_CREATED_AT,
      });
      mockPrismaService.expenseRequest.update.mockResolvedValue({
        ...partialRequest,
        paidTotal: new Decimal(500),
        status: 'PARTIAL',
      });

      const payment: PaymentInput = {
        amount: 500,
        paymentDate: PAYMENT_DATE,
        method: 'BANK_TRANSFER',
        reference: 'DEKONT-PARTIAL',
      };

      const result = await service.recordPayment('tenant-1', 'exp-1', payment, 'user-1');

      expect(result).toBeDefined();
      expect(mockPrismaService.expenseRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'PARTIAL',
            paidTotal: 500,
          }),
        })
      );
      expectLastRecordedPaymentJournalDraft('pay-partial', '500');
      expect(mockCaseBalanceService.credit).toHaveBeenCalledWith(
        'tenant-1',
        'case-1',
        expect.objectContaining({
          amount: 500,
          source: 'expense_payment:pay-partial',
          sourceId: 'pay-partial',
        }),
        'user-1',
      );
    });

    it('should set status to PAID when payment equals total', async () => {
      const request = {
        ...mockExpenseRequest,
        totalAmount: new Decimal(1000),
        paidTotal: new Decimal(500),
      };
      mockPrismaService.expenseRequest.findFirst.mockResolvedValue(request);
      mockPrismaService.expensePayment.create.mockResolvedValue({
        id: 'pay-full',
        amount: new Decimal(500),
        paymentDate: PAYMENT_DATE,
        method: 'BANK_TRANSFER',
        reference: 'DEKONT-FULL',
        createdAt: PAYMENT_CREATED_AT,
      });
      mockPrismaService.expenseRequest.update.mockResolvedValue({
        ...request,
        paidTotal: new Decimal(1000),
        status: 'PAID',
      });

      const payment: PaymentInput = {
        amount: 500,
        paymentDate: PAYMENT_DATE,
        method: 'BANK_TRANSFER',
        reference: 'DEKONT-FULL',
      };

      await service.recordPayment('tenant-1', 'exp-1', payment, 'user-1');

      expect(mockPrismaService.expenseRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'PAID',
            paidTotal: 1000,
          }),
        })
      );
      expectLastRecordedPaymentJournalDraft('pay-full', '500');
    });

    it('fails closed before status update when ExpensePayment journal writer fails', async () => {
      const req = { ...mockExpenseRequest, totalAmount: new Decimal(1000), paidTotal: new Decimal(0), clientId: 'client-1', caseId: 'case-1' };
      mockPrismaService.expenseRequest.findFirst.mockResolvedValue(req);
      mockPrismaService.expensePayment.create.mockResolvedValue({
        id: 'pay-fail',
        amount: new Decimal(400),
        paymentDate: PAYMENT_DATE,
        method: 'BANK_TRANSFER',
        reference: 'DEKONT-FAIL',
        createdAt: PAYMENT_CREATED_AT,
      });
      mockJournalWriter.write.mockResolvedValueOnce({
        ok: false,
        errors: [{ code: 'DB_WRITE_FAILED', message: 'journal write failed', path: null, details: {} }],
      });

      await expect(
        service.recordPayment('tenant-1', 'exp-1', { amount: 400, paymentDate: PAYMENT_DATE, method: 'BANK_TRANSFER' }, 'user-1'),
      ).rejects.toThrow('ExpensePayment journal write failed: DB_WRITE_FAILED');

      expect(mockPrismaService.expenseRequest.update).not.toHaveBeenCalled();
      expect(mockPrismaService.expenseAuditLog.create).not.toHaveBeenCalled();
      expect(mockCaseBalanceService.credit).not.toHaveBeenCalled();
      expect(mockDispatcher.dispatch).not.toHaveBeenCalled();
    });

    it('accepts ExpensePayment writer replay with deterministic idempotency key', async () => {
      const req = { ...mockExpenseRequest, totalAmount: new Decimal(1000), paidTotal: new Decimal(0), clientId: 'client-1', caseId: 'case-1' };
      mockPrismaService.expenseRequest.findFirst.mockResolvedValue(req);
      mockPrismaService.expensePayment.create.mockResolvedValue({
        id: 'pay-replay',
        amount: new Decimal(400),
        paymentDate: PAYMENT_DATE,
        method: 'BANK_TRANSFER',
        reference: 'DEKONT-REPLAY',
        createdAt: PAYMENT_CREATED_AT,
      });
      mockPrismaService.expenseRequest.update.mockResolvedValue({ ...req, paidTotal: new Decimal(400), status: 'PARTIAL' });
      mockJournalWriter.write.mockResolvedValueOnce(replayedJournalWriteResult);

      const result = await service.recordPayment('tenant-1', 'exp-1', { amount: 400, paymentDate: PAYMENT_DATE, method: 'BANK_TRANSFER' }, 'user-1');

      expect(result).toBeDefined();
      expectLastRecordedPaymentJournalDraft('pay-replay', '400');
    });

    // ===== Faz 3.5: ödeme maili tetiği (best-effort; ödeme state'ini etkilemez) =====
    it('PARTIAL → dispatcher PARTIAL_PAYMENT_BALANCE (paidAmount=bu ödeme, remaining doğru)', async () => {
      const req = { ...mockExpenseRequest, totalAmount: new Decimal(1000), paidTotal: new Decimal(0), clientId: 'client-1', caseId: 'case-1' };
      mockPrismaService.expenseRequest.findFirst.mockResolvedValue(req);
      mockPrismaService.expensePayment.create.mockResolvedValue({ id: 'pay-1' });
      mockPrismaService.expenseRequest.update.mockResolvedValue({ ...req, paidTotal: new Decimal(400), status: 'PARTIAL' });
      mockPrismaService.client.findFirst.mockResolvedValue({ name: 'Test Müvekkil' });
      mockPrismaService.case.findFirst.mockResolvedValue({ fileNumber: '2024/1', executionFileNumber: '2024/99' });

      await service.recordPayment('tenant-1', 'exp-1', { amount: 400, paymentDate: new Date(), method: 'BANK_TRANSFER' }, 'user-1');

      expect(mockDispatcher.dispatch).toHaveBeenCalledWith('tenant-1', 'user-1',
        expect.objectContaining({
          templateCode: 'PARTIAL_PAYMENT_BALANCE', type: 'PAYMENT_INFO', refType: 'ExpensePayment', refId: 'pay-1',
          tokens: expect.objectContaining({ paidAmount: '400.00', remainingAmount: '600.00' }),
        }),
      );
    });

    it('PAID → dispatcher PAYMENT_RECEIVED', async () => {
      const req = { ...mockExpenseRequest, totalAmount: new Decimal(1000), paidTotal: new Decimal(500), clientId: 'client-1', caseId: 'case-1' };
      mockPrismaService.expenseRequest.findFirst.mockResolvedValue(req);
      mockPrismaService.expensePayment.create.mockResolvedValue({ id: 'pay-2' });
      mockPrismaService.expenseRequest.update.mockResolvedValue({ ...req, paidTotal: new Decimal(1000), status: 'PAID' });
      mockPrismaService.client.findFirst.mockResolvedValue({ name: 'Test' });
      mockPrismaService.case.findFirst.mockResolvedValue({ fileNumber: '2024/1' });

      await service.recordPayment('tenant-1', 'exp-1', { amount: 500, paymentDate: new Date(), method: 'BANK_TRANSFER' }, 'user-1');

      expect(mockDispatcher.dispatch).toHaveBeenCalledWith('tenant-1', 'user-1',
        expect.objectContaining({ templateCode: 'PAYMENT_RECEIVED', refType: 'ExpensePayment', refId: 'pay-2' }),
      );
    });

    it('mail dispatch reddedilse de ödeme sonucu SAĞLAM döner (throw yok)', async () => {
      const req = { ...mockExpenseRequest, totalAmount: new Decimal(1000), paidTotal: new Decimal(0), clientId: 'client-1', caseId: 'case-1' };
      mockPrismaService.expenseRequest.findFirst.mockResolvedValue(req);
      mockPrismaService.expensePayment.create.mockResolvedValue({ id: 'pay-3' });
      mockPrismaService.expenseRequest.update.mockResolvedValue({ ...req, paidTotal: new Decimal(400), status: 'PARTIAL' });
      mockPrismaService.client.findFirst.mockResolvedValue({ name: 'Test' });
      mockPrismaService.case.findFirst.mockResolvedValue({ fileNumber: '2024/1' });
      mockDispatcher.dispatch.mockRejectedValueOnce(new Error('mail patladı'));

      const result = await service.recordPayment('tenant-1', 'exp-1', { amount: 400, paymentDate: new Date(), method: 'BANK_TRANSFER' }, 'user-1');
      expect(result).toBeDefined(); // throw yok — ödeme state'i sağlam döndü
    });
  });

  describe('Property 4: Payment Sum Invariant', () => {
    /**
     * Property: For any ExpenseRequest, paidTotal should never exceed totalAmount.
     */
    it('should reject payment that exceeds remaining amount', async () => {
      const request = {
        ...mockExpenseRequest,
        totalAmount: new Decimal(1000),
        paidTotal: new Decimal(800),
      };
      mockPrismaService.expenseRequest.findFirst.mockResolvedValue(request);

      const payment: PaymentInput = {
        amount: 300, // Would make total 1100 > 1000
        paymentDate: new Date(),
        method: 'BANK_TRANSFER',
      };

      await expect(
        service.recordPayment('tenant-1', 'exp-1', payment, 'user-1')
      ).rejects.toThrow('Ödeme tutarı kalan borcu aşıyor');
    });

    it('should accept payment that equals remaining amount', async () => {
      const request = {
        ...mockExpenseRequest,
        totalAmount: new Decimal(1000),
        paidTotal: new Decimal(800),
      };
      mockPrismaService.expenseRequest.findFirst.mockResolvedValue(request);
      mockPrismaService.expenseRequest.update.mockResolvedValue({
        ...request,
        paidTotal: new Decimal(1000),
        status: 'PAID',
      });

      const payment: PaymentInput = {
        amount: 200, // Exactly remaining
        paymentDate: new Date(),
        method: 'BANK_TRANSFER',
      };

      const result = await service.recordPayment('tenant-1', 'exp-1', payment, 'user-1');
      expect(result).toBeDefined();
    });
  });
});

describe('ExpenseGateService - Property Tests', () => {
  let gateService: ExpenseGateService;
  // ROLL-002: Prisma @prisma/client import aninda .env'i process.env'e yukler (bkz test/test-db-env.ts) -
  // gercek .env'de EXPENSE_REMAINING_GATE_ENABLED=true olabilir (owner activation rollout). beforeEach her
  // testi deterministik/temiz baslatir (flag-off, mevcut count-bazli testlerin varsaydigi durum); flag-ON
  // gereken testler kendi ihtiyaclarini beforeEach'ten SONRA set eder.
  const ORIGINAL_GATE_FLAG = process.env.EXPENSE_REMAINING_GATE_ENABLED;

  beforeEach(async () => {
    jest.clearAllMocks();
    delete process.env.EXPENSE_REMAINING_GATE_ENABLED;
    // Kapı büro kapsamlıdır: dosya çağıranın bürosunda bulunur (büro sınırı testleri: __tests__/expense-gate-tenant-scope.spec.ts)
    mockPrismaService.case.findFirst.mockResolvedValue({ id: 'case-1' });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExpenseGateService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: ClientSettlementReadService, useValue: mockClientSettlementReadService },
      ],
    }).compile();

    gateService = module.get<ExpenseGateService>(ExpenseGateService);
  });

  afterEach(() => {
    if (ORIGINAL_GATE_FLAG === undefined) delete process.env.EXPENSE_REMAINING_GATE_ENABLED;
    else process.env.EXPENSE_REMAINING_GATE_ENABLED = ORIGINAL_GATE_FLAG;
  });

  describe('Property 5: Gate Mechanism Consistency', () => {
    /**
     * Property: For any Case, if there exists at least one ExpenseRequest
     * with gateType=BLOCKING and status in (PENDING, PARTIAL),
     * then isUyapBlocked should return true.
     */
    it('should return blocked=true when BLOCKING expense is PENDING', async () => {
      mockPrismaService.expenseRequest.findMany.mockResolvedValue([
        {
          id: 'exp-1',
          stageCode: 'OPENING',
          gateType: 'BLOCKING',
          totalAmount: new Decimal(1000),
          paidTotal: new Decimal(0),
          status: 'PENDING',
        },
      ]);

      const result = await gateService.checkGate('case-1', 'tenant-1');

      expect(result.isBlocked).toBe(true);
      expect(result.blockingExpenses).toHaveLength(1);
      expect(result.totalPending).toBe(1000);
    });

    it('should return blocked=true when BLOCKING expense is PARTIAL', async () => {
      mockPrismaService.expenseRequest.findMany.mockResolvedValue([
        {
          id: 'exp-1',
          stageCode: 'OPENING',
          gateType: 'BLOCKING',
          totalAmount: new Decimal(1000),
          paidTotal: new Decimal(500),
          status: 'PARTIAL',
        },
      ]);

      const result = await gateService.checkGate('case-1', 'tenant-1');

      expect(result.isBlocked).toBe(true);
      expect(result.totalPending).toBe(500);
    });

    /**
     * Property: If all BLOCKING expenses are PAID, isUyapBlocked should return false.
     */
    it('should return blocked=false when all BLOCKING expenses are PAID', async () => {
      mockPrismaService.expenseRequest.findMany.mockResolvedValue([]);

      const result = await gateService.checkGate('case-1', 'tenant-1');

      expect(result.isBlocked).toBe(false);
      expect(result.blockingExpenses).toHaveLength(0);
      expect(result.totalPending).toBe(0);
    });

    it('should return blocked=false when no BLOCKING expenses exist', async () => {
      mockPrismaService.expenseRequest.findMany.mockResolvedValue([]);

      const result = await gateService.checkGate('case-1', 'tenant-1');

      expect(result.isBlocked).toBe(false);
    });
  });

  describe('isUyapBlocked', () => {
    it('should return true when blocking expenses exist', async () => {
      mockPrismaService.expenseRequest.count.mockResolvedValue(1);

      const result = await gateService.isUyapBlocked('case-1', 'tenant-1');

      expect(result).toBe(true);
    });

    it('should return false when no blocking expenses exist', async () => {
      mockPrismaService.expenseRequest.count.mockResolvedValue(0);

      const result = await gateService.isUyapBlocked('case-1', 'tenant-1');

      expect(result).toBe(false);
    });
  });

  describe('canPerformUyapAction', () => {
    it('should allow VIEW actions regardless of gate status', async () => {
      mockPrismaService.expenseRequest.count.mockResolvedValue(1);

      const result = await gateService.canPerformUyapAction('case-1', 'VIEW', 'tenant-1');

      expect(result).toBe(true);
    });

    it('should block SUBMIT actions when gate is blocked', async () => {
      mockPrismaService.expenseRequest.count.mockResolvedValue(1);

      const result = await gateService.canPerformUyapAction('case-1', 'SUBMIT', 'tenant-1');

      expect(result).toBe(false);
    });

    it('should allow SUBMIT actions when gate is clear', async () => {
      mockPrismaService.expenseRequest.count.mockResolvedValue(0);

      const result = await gateService.canPerformUyapAction('case-1', 'SUBMIT', 'tenant-1');

      expect(result).toBe(true);
    });
  });

  describe('ROLL-002: isUyapBlockedLegacy flag reconcile (canPerformUyapAction/isUyapBlocked <-> checkGate)', () => {
    it('flag OFF (default): count-bazli path korunur, computeExpenseRemaining HIC cagrilmaz', async () => {
      mockPrismaService.expenseRequest.count.mockResolvedValue(1);

      const blocked = await gateService.isUyapBlocked('case-1', 'tenant-1');
      const canPerform = await gateService.canPerformUyapAction('case-1', 'SUBMIT', 'tenant-1');

      expect(blocked).toBe(true);
      expect(canPerform).toBe(false);
      expect(mockPrismaService.expenseRequest.findMany).not.toHaveBeenCalled();
      expect(mockClientSettlementReadService.computeExpenseRemaining).not.toHaveBeenCalled();
    });

    it('flag ON: status PENDING ama computeExpenseRemaining=0 (offset/reimbursement ile kapanmis) -> isUyapBlocked=false (ONCEDEN her zaman true olurdu)', async () => {
      process.env.EXPENSE_REMAINING_GATE_ENABLED = 'true';
      mockPrismaService.expenseRequest.findMany.mockResolvedValue([
        { id: 'exp-1', tenantId: 't1', stageCode: 'OPENING', totalAmount: new Decimal(1000), paidTotal: new Decimal(0), status: 'PENDING' },
      ]);
      mockClientSettlementReadService.computeExpenseRemaining.mockResolvedValue(new Decimal(0));

      const blocked = await gateService.isUyapBlocked('case-1', 'tenant-1');
      const canPerform = await gateService.canPerformUyapAction('case-1', 'SUBMIT', 'tenant-1');

      expect(blocked).toBe(false);
      expect(canPerform).toBe(true);
      expect(mockPrismaService.expenseRequest.count).not.toHaveBeenCalled();
    });

    it('flag ON: computeExpenseRemaining>0 (gercek borc) -> isUyapBlocked=true (regresyon yok)', async () => {
      process.env.EXPENSE_REMAINING_GATE_ENABLED = 'true';
      mockPrismaService.expenseRequest.findMany.mockResolvedValue([
        { id: 'exp-1', tenantId: 't1', stageCode: 'OPENING', totalAmount: new Decimal(1000), paidTotal: new Decimal(0), status: 'PENDING' },
      ]);
      mockClientSettlementReadService.computeExpenseRemaining.mockResolvedValue(new Decimal(1000));

      const blocked = await gateService.isUyapBlocked('case-1', 'tenant-1');
      const canPerform = await gateService.canPerformUyapAction('case-1', 'SUBMIT', 'tenant-1');

      expect(blocked).toBe(true);
      expect(canPerform).toBe(false);
    });

    it('flag ON: canPerformUyapAction SUBMIT ile checkGate/getGateSummary AYNI karari verir (tutarlilik)', async () => {
      process.env.EXPENSE_REMAINING_GATE_ENABLED = 'true';
      mockPrismaService.expenseRequest.findMany.mockResolvedValue([
        { id: 'exp-1', tenantId: 't1', stageCode: 'OPENING', totalAmount: new Decimal(500), paidTotal: new Decimal(0), status: 'PENDING' },
      ]);
      mockClientSettlementReadService.computeExpenseRemaining.mockResolvedValue(new Decimal(0));

      const summary = await gateService.getGateSummary('case-1', 'tenant-1');
      const canPerform = await gateService.canPerformUyapAction('case-1', 'SUBMIT', 'tenant-1');

      expect(summary.canSubmitToUyap).toBe(true);
      expect(canPerform).toBe(true);
      expect(canPerform).toBe(summary.canSubmitToUyap);
    });
  });
});


// ==================== ExpenseNotificationService Tests ====================
import { ExpenseNotificationService, ExpenseEmailData, EmailContent } from './expense-notification.service';
import { EmailProviderService } from '@/modules/notification/email-provider.service';
import { ConfigService } from '@nestjs/config';

const mockEmailProviderService = {
  send: jest.fn().mockResolvedValue({
    success: true,
    messageId: 'msg-123',
    provider: 'smtp',
  }),
};

// ExpenseNotificationService ConfigService'ten banka bilgisi okuyor (BANK_*); test sağlamıyordu.
// get→undefined: servis e-posta verisindeki değerlere düşer (content testleri veriyi kullanır).
const mockConfigService = {
  get: jest.fn().mockReturnValue(undefined),
};

describe('ExpenseNotificationService - Property Tests', () => {
  let notificationService: ExpenseNotificationService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExpenseNotificationService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: ClientSettlementReadService, useValue: mockClientSettlementReadService },
        { provide: EmailProviderService, useValue: mockEmailProviderService },
        { provide: ConfigService, useValue: mockConfigService },
        // C1-B05-A: sendExpenseRequest artık kanonik NotificationDispatcherService kullanıyor;
        // render testleri saf renderExpenseEmail'i sınar ama servisin instantiate olması için gerekli.
        { provide: NotificationDispatcherService, useValue: mockDispatcher },
      ],
    }).compile();

    notificationService = module.get<ExpenseNotificationService>(ExpenseNotificationService);
  });

  describe('Property 7: Email Content Completeness', () => {
    /**
     * Property: For any ExpenseRequest email, the rendered content must include:
     * - Client name
     * - Case file number
     * - All expense items with amounts
     * - Total amount
     * - Due date (if set)
     * - IBAN (if available)
     * - Payment description
     */
    const baseEmailData: ExpenseEmailData = {
      clientName: 'Ahmet Yılmaz',
      clientEmail: 'ahmet@example.com',
      caseFileNumber: '2024/12345',
      executionFileNumber: '2024/67890',
      executionOfficeName: 'İstanbul 5. İcra Dairesi',
      items: [
        { label: 'Başvurma Harcı', amount: 738.50 },
        { label: 'Peşin Harç', amount: 500.00 },
        { label: 'Vekalet Pulu', amount: 105.00 },
        { label: 'Tebligat Gideri', amount: 252.00 },
        { label: 'Dosya Gideri', amount: 50.00 },
        { label: 'Baro Pulu', amount: 165.60 },
      ],
      totalAmount: 1811.10,
      dueDate: new Date('2024-12-31'),
      iban: 'TR12 3456 7890 1234 5678 9012 34',
      paymentDescription: '2024/12345 - Masraf',
      lawyerName: 'Av. Mehmet Demir',
      officePhone: '0212 555 1234',
      officeEmail: 'info@hukukburosu.com',
    };

    it('should include client name in email content', () => {
      const result = notificationService.renderExpenseEmail(baseEmailData);

      expect(result.text).toContain('Ahmet Yılmaz');
      expect(result.html).toContain('Ahmet Yılmaz');
    });

    it('should include case file number in subject and body', () => {
      const result = notificationService.renderExpenseEmail(baseEmailData);

      expect(result.subject).toContain('2024/12345');
      expect(result.text).toContain('2024/12345');
      expect(result.html).toContain('2024/12345');
    });

    it('should include execution file number when available', () => {
      const result = notificationService.renderExpenseEmail(baseEmailData);

      expect(result.subject).toContain('2024/67890');
      expect(result.html).toContain('2024/67890');
    });

    it('should include all expense items with amounts', () => {
      const result = notificationService.renderExpenseEmail(baseEmailData);

      // Check all items are present
      expect(result.text).toContain('Başvurma Harcı');
      expect(result.text).toContain('Peşin Harç');
      expect(result.text).toContain('Vekalet Pulu');
      expect(result.text).toContain('Tebligat Gideri');
      expect(result.text).toContain('Dosya Gideri');
      expect(result.text).toContain('Baro Pulu');

      // Check amounts are formatted
      expect(result.text).toContain('738,50');
      expect(result.text).toContain('500,00');
    });

    it('should include total amount formatted in Turkish locale', () => {
      const result = notificationService.renderExpenseEmail(baseEmailData);

      expect(result.text).toContain('1.811,10');
      expect(result.html).toContain('1.811,10');
    });

    it('should include due date when set', () => {
      const result = notificationService.renderExpenseEmail(baseEmailData);

      // Turkish date format: 31 Aralık 2024
      expect(result.text).toContain('Son Ödeme Tarihi');
      expect(result.html).toContain('Son Ödeme Tarihi');
    });

    it('should include IBAN when available', () => {
      const result = notificationService.renderExpenseEmail(baseEmailData);

      expect(result.text).toContain('TR12 3456 7890 1234 5678 9012 34');
      expect(result.html).toContain('TR12 3456 7890 1234 5678 9012 34');
    });

    it('should include payment description', () => {
      const result = notificationService.renderExpenseEmail(baseEmailData);

      expect(result.text).toContain('2024/12345 - Masraf');
    });

    it('should include lawyer name and contact info', () => {
      const result = notificationService.renderExpenseEmail(baseEmailData);

      expect(result.text).toContain('Av. Mehmet Demir');
      expect(result.text).toContain('0212 555 1234');
    });

    it('should handle missing optional fields gracefully', () => {
      const minimalData: ExpenseEmailData = {
        clientName: 'Test Client',
        clientEmail: 'test@example.com',
        caseFileNumber: '2024/99999',
        items: [{ label: 'Test Item', amount: 100 }],
        totalAmount: 100,
      };

      const result = notificationService.renderExpenseEmail(minimalData);

      expect(result.subject).toBeDefined();
      expect(result.text).toContain('Test Client');
      expect(result.text).toContain('2024/99999');
      expect(result.text).toContain('100,00');
      // Should not throw for missing optional fields
      expect(result.text).not.toContain('undefined');
      expect(result.html).not.toContain('undefined');
    });

    it('should not include execution file number in subject when not available', () => {
      const dataWithoutExecution: ExpenseEmailData = {
        ...baseEmailData,
        executionFileNumber: undefined,
      };

      const result = notificationService.renderExpenseEmail(dataWithoutExecution);

      expect(result.subject).toBe('Masraf Talebi - 2024/12345');
      expect(result.subject).not.toContain('()');
    });
  });

  describe('Email Structure Validation', () => {
    it('should return valid EmailContent structure', () => {
      const result = notificationService.renderExpenseEmail({
        clientName: 'Test',
        clientEmail: 'test@test.com',
        caseFileNumber: '2024/1',
        items: [{ label: 'Item', amount: 100 }],
        totalAmount: 100,
      });

      expect(result).toHaveProperty('subject');
      expect(result).toHaveProperty('text');
      expect(result).toHaveProperty('html');
      expect(typeof result.subject).toBe('string');
      expect(typeof result.text).toBe('string');
      expect(typeof result.html).toBe('string');
    });

    it('should generate valid HTML structure', () => {
      const result = notificationService.renderExpenseEmail({
        clientName: 'Test',
        clientEmail: 'test@test.com',
        caseFileNumber: '2024/1',
        items: [{ label: 'Item', amount: 100 }],
        totalAmount: 100,
      });

      expect(result.html).toContain('<!DOCTYPE html>');
      expect(result.html).toContain('<html>');
      expect(result.html).toContain('</html>');
      expect(result.html).toContain('<body>');
      expect(result.html).toContain('</body>');
    });

    it('should include proper table structure for items', () => {
      const result = notificationService.renderExpenseEmail({
        clientName: 'Test',
        clientEmail: 'test@test.com',
        caseFileNumber: '2024/1',
        items: [
          { label: 'Item 1', amount: 100 },
          { label: 'Item 2', amount: 200 },
        ],
        totalAmount: 300,
      });

      expect(result.html).toContain('<table');
      expect(result.html).toContain('<thead>');
      expect(result.html).toContain('<tbody>');
      expect(result.html).toContain('<tfoot>');
    });
  });

  describe('Amount Formatting', () => {
    it('should format amounts with Turkish locale (comma as decimal separator)', () => {
      const result = notificationService.renderExpenseEmail({
        clientName: 'Test',
        clientEmail: 'test@test.com',
        caseFileNumber: '2024/1',
        items: [{ label: 'Item', amount: 1234.56 }],
        totalAmount: 1234.56,
      });

      // Turkish format: 1.234,56
      expect(result.text).toContain('1.234,56');
    });

    it('should handle zero amounts', () => {
      const result = notificationService.renderExpenseEmail({
        clientName: 'Test',
        clientEmail: 'test@test.com',
        caseFileNumber: '2024/1',
        items: [{ label: 'Free Item', amount: 0 }],
        totalAmount: 0,
      });

      expect(result.text).toContain('0,00');
    });

    it('should handle large amounts', () => {
      const result = notificationService.renderExpenseEmail({
        clientName: 'Test',
        clientEmail: 'test@test.com',
        caseFileNumber: '2024/1',
        items: [{ label: 'Large Item', amount: 1000000.99 }],
        totalAmount: 1000000.99,
      });

      // Turkish format: 1.000.000,99
      expect(result.text).toContain('1.000.000,99');
    });
  });
});


// ==================== ExpenseViewService Tests ====================
import { ExpenseViewService, ExpenseTaskView, ExpenseFinanceView, ExpenseClientRequestView } from './expense-view.service';

describe('ExpenseViewService - Property Tests', () => {
  let viewService: ExpenseViewService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExpenseViewService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: ClientSettlementReadService, useValue: mockClientSettlementReadService },
      ],
    }).compile();

    viewService = module.get<ExpenseViewService>(ExpenseViewService);
  });

  // Mock expense data
  const mockExpenseData = {
    id: 'exp-1',
    status: 'PENDING',
    gateType: 'BLOCKING',
    stageCode: 'OPENING',
    totalAmount: new Decimal(1500),
    paidTotal: new Decimal(500),
    dueDate: new Date('2024-12-31'),
    paidAt: null,
    createdAt: new Date('2024-12-01'),
    requestItems: [
      { itemCode: 'BASVURMA_HARCI', label: 'Başvurma Harcı', suggestedAmount: new Decimal(738.50), finalAmount: new Decimal(738.50), wasOverridden: false },
      { itemCode: 'PESIN_HARC', label: 'Peşin Harç', suggestedAmount: new Decimal(500), finalAmount: new Decimal(500), wasOverridden: false },
      { itemCode: 'TEBLIGAT_GIDERI', label: 'Tebligat Gideri', suggestedAmount: new Decimal(261.50), finalAmount: new Decimal(261.50), wasOverridden: false },
    ],
    payments: [
      { id: 'pay-1', amount: new Decimal(500), paymentDate: new Date('2024-12-15'), method: 'BANK_TRANSFER', reference: 'REF-001' },
    ],
    case: { fileNumber: '2024/12345', executionFileNumber: '2024/67890' },
    client: { displayName: 'Ahmet Yılmaz', name: 'Ahmet Yılmaz' },
  };

  describe('Property 2: Three-View Consistency', () => {
    /**
     * Property: For any ExpenseRequest, it should appear simultaneously in
     * Tasks panel, Finance panel, and Client Requests panel with consistent data.
     */
    it('should have consistent ID across all three views', () => {
      const task = viewService.expenseToTask(mockExpenseData);
      const finance = viewService.expenseToFinanceItem(mockExpenseData);
      const clientRequest = viewService.expenseToClientRequest(mockExpenseData);

      expect(task.id).toBe(mockExpenseData.id);
      expect(finance.id).toBe(mockExpenseData.id);
      expect(clientRequest.id).toBe(mockExpenseData.id);
    });

    it('should have consistent total amount across all three views', () => {
      const task = viewService.expenseToTask(mockExpenseData);
      const finance = viewService.expenseToFinanceItem(mockExpenseData);
      const clientRequest = viewService.expenseToClientRequest(mockExpenseData);

      expect(task.metadata.totalAmount).toBe(1500);
      expect(finance.totalAmount).toBe(1500);
      expect(clientRequest.amount).toBe(1500);
    });

    it('should have consistent paid amount across task and finance views', () => {
      const task = viewService.expenseToTask(mockExpenseData);
      const finance = viewService.expenseToFinanceItem(mockExpenseData);

      expect(task.metadata.paidAmount).toBe(500);
      expect(finance.paidAmount).toBe(500);
    });

    it('should have consistent remaining amount across task and finance views', () => {
      const task = viewService.expenseToTask(mockExpenseData);
      const finance = viewService.expenseToFinanceItem(mockExpenseData);

      expect(task.metadata.remainingAmount).toBe(1000);
      expect(finance.remainingAmount).toBe(1000);
    });

    it('should have consistent item count in finance and client request views', () => {
      const finance = viewService.expenseToFinanceItem(mockExpenseData);
      const clientRequest = viewService.expenseToClientRequest(mockExpenseData);

      expect(finance.items.length).toBe(3);
      expect(clientRequest.items.length).toBe(3);
    });
  });

  describe('Task View Transformation', () => {
    it('should map PENDING status to BEKLIYOR', () => {
      const task = viewService.expenseToTask({ ...mockExpenseData, status: 'PENDING' });
      expect(task.status).toBe('BEKLIYOR');
    });

    it('should map PAID status to YAPILDI', () => {
      const task = viewService.expenseToTask({ ...mockExpenseData, status: 'PAID' });
      expect(task.status).toBe('YAPILDI');
    });

    it('should map CANCELLED status to IPTAL', () => {
      const task = viewService.expenseToTask({ ...mockExpenseData, status: 'CANCELLED' });
      expect(task.status).toBe('IPTAL');
    });

    it('should set HIGH priority for BLOCKING expenses', () => {
      const task = viewService.expenseToTask({ ...mockExpenseData, gateType: 'BLOCKING', status: 'PENDING' });
      expect(task.priority).toBe('HIGH');
    });

    it('should set URGENT priority for OVERDUE expenses', () => {
      const task = viewService.expenseToTask({ ...mockExpenseData, status: 'OVERDUE' });
      expect(task.priority).toBe('URGENT');
    });

    it('should include stage code in metadata', () => {
      const task = viewService.expenseToTask(mockExpenseData);
      expect(task.metadata.stageCode).toBe('OPENING');
    });

    it('should format title based on stage code', () => {
      const task = viewService.expenseToTask(mockExpenseData);
      expect(task.title).toContain('Takip açılış masrafları');
    });
  });

  describe('Finance View Transformation', () => {
    it('should include all expense items with amounts', () => {
      const finance = viewService.expenseToFinanceItem(mockExpenseData);

      expect(finance.items).toHaveLength(3);
      expect(finance.items[0].code).toBe('BASVURMA_HARCI');
      expect(finance.items[0].finalAmount).toBe(738.50);
    });

    it('should include all payments', () => {
      const finance = viewService.expenseToFinanceItem(mockExpenseData);

      expect(finance.payments).toHaveLength(1);
      expect(finance.payments[0].amount).toBe(500);
      expect(finance.payments[0].method).toBe('BANK_TRANSFER');
    });

    it('should calculate remaining amount correctly', () => {
      const finance = viewService.expenseToFinanceItem(mockExpenseData);
      expect(finance.remainingAmount).toBe(finance.totalAmount - finance.paidAmount);
    });
  });

  describe('Client Request View Transformation', () => {
    it('should map PAID status to TAMAMLANDI', () => {
      const clientRequest = viewService.expenseToClientRequest({ ...mockExpenseData, status: 'PAID' });
      expect(clientRequest.status).toBe('TAMAMLANDI');
    });

    it('should map PARTIAL status to KISMI', () => {
      const clientRequest = viewService.expenseToClientRequest({ ...mockExpenseData, status: 'PARTIAL' });
      expect(clientRequest.status).toBe('KISMI');
    });

    it('should include payment info with IBAN', () => {
      const clientRequest = viewService.expenseToClientRequest(mockExpenseData, 'TR12 3456 7890');
      expect(clientRequest.paymentInfo.iban).toBe('TR12 3456 7890');
    });

    it('should include case file number in payment description', () => {
      const clientRequest = viewService.expenseToClientRequest(mockExpenseData);
      expect(clientRequest.paymentInfo.description).toContain('2024/12345');
    });

    it('should show remaining amount in content when partially paid', () => {
      const clientRequest = viewService.expenseToClientRequest(mockExpenseData);
      expect(clientRequest.content).toContain('Kalan');
    });
  });

  describe('Edge Cases', () => {
    it('should handle expense with no items', () => {
      const expenseNoItems = { ...mockExpenseData, requestItems: [], payments: [] };
      
      const task = viewService.expenseToTask(expenseNoItems);
      const finance = viewService.expenseToFinanceItem(expenseNoItems);
      const clientRequest = viewService.expenseToClientRequest(expenseNoItems);

      expect(task).toBeDefined();
      expect(finance.items).toHaveLength(0);
      expect(clientRequest.items).toHaveLength(0);
    });

    it('should handle expense with no stage code', () => {
      const expenseNoStage = { ...mockExpenseData, stageCode: null };
      
      const task = viewService.expenseToTask(expenseNoStage);
      expect(task.title).toContain('Masraf talebi');
    });

    it('should handle fully paid expense', () => {
      const fullyPaid = { 
        ...mockExpenseData, 
        status: 'PAID', 
        paidTotal: new Decimal(1500),
        paidAt: new Date(),
      };
      
      const task = viewService.expenseToTask(fullyPaid);
      const clientRequest = viewService.expenseToClientRequest(fullyPaid);

      expect(task.status).toBe('YAPILDI');
      expect(task.metadata.remainingAmount).toBe(0);
      expect(clientRequest.status).toBe('TAMAMLANDI');
    });
  });
});


describe('Property 6: Task Completion on Payment', () => {
  let service: ExpenseRequestService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockJournalWriter.write.mockReset();
    mockJournalWriter.write.mockResolvedValue(defaultJournalWriteResult);
    mockPrismaService.expensePayment.create.mockResolvedValue({ id: 'pay-default', createdAt: PAYMENT_CREATED_AT });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExpenseRequestService,
        ExpenseGateService,
        ExpenseCalculatorService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: ClientSettlementReadService, useValue: mockClientSettlementReadService },
        { provide: CaseBalanceService, useValue: mockCaseBalanceService },
        { provide: AccountingJournalWriterService, useValue: mockJournalWriter },
        { provide: TariffService, useValue: mockTariffService },
        { provide: ExpenseNotificationService, useValue: mockExpenseNotificationService },
        { provide: NotificationDispatcherService, useValue: mockDispatcher },
        { provide: OfficeService, useValue: mockOffice },
      ],
    }).compile();

    service = module.get<ExpenseRequestService>(ExpenseRequestService);
  });

  /**
   * Property: For any ExpenseRequest that transitions to PAID status,
   * the associated task should automatically be marked as completed.
   */
  it('should complete associated task when expense is fully paid', async () => {
    const requestWithTask = {
      ...mockExpenseRequest,
      totalAmount: new Decimal(1000),
      paidTotal: new Decimal(500),
      taskId: 'task-123',
    };
    
    mockPrismaService.expenseRequest.findFirst.mockResolvedValue(requestWithTask);
    mockPrismaService.expenseRequest.update.mockResolvedValue({
      ...requestWithTask,
      paidTotal: new Decimal(1000),
      status: 'PAID',
    });
    mockPrismaService.task = {
      update: jest.fn().mockResolvedValue({ id: 'task-123', status: 'COMPLETED' }),
    };

    const payment: PaymentInput = {
      amount: 500,
      paymentDate: new Date(),
      method: 'BANK_TRANSFER',
    };

    await service.recordPayment('tenant-1', 'exp-1', payment, 'user-1');

    // Task should be updated to COMPLETED
    expect(mockPrismaService.task.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'task-123' },
        data: expect.objectContaining({
          status: 'COMPLETED',
        }),
      })
    );
  });

  it('should not complete task when expense is partially paid', async () => {
    const requestWithTask = {
      ...mockExpenseRequest,
      totalAmount: new Decimal(1000),
      paidTotal: new Decimal(0),
      taskId: 'task-123',
    };
    
    mockPrismaService.expenseRequest.findFirst.mockResolvedValue(requestWithTask);
    mockPrismaService.expenseRequest.update.mockResolvedValue({
      ...requestWithTask,
      paidTotal: new Decimal(300),
      status: 'PARTIAL',
    });
    mockPrismaService.task = {
      update: jest.fn(),
    };

    const payment: PaymentInput = {
      amount: 300,
      paymentDate: new Date(),
      method: 'BANK_TRANSFER',
    };

    await service.recordPayment('tenant-1', 'exp-1', payment, 'user-1');

    // Task should NOT be updated
    expect(mockPrismaService.task.update).not.toHaveBeenCalled();
  });

  it('should handle expense without associated task gracefully', async () => {
    const requestWithoutTask = {
      ...mockExpenseRequest,
      totalAmount: new Decimal(1000),
      paidTotal: new Decimal(500),
      taskId: null, // No associated task
    };
    
    mockPrismaService.expenseRequest.findFirst.mockResolvedValue(requestWithoutTask);
    mockPrismaService.expenseRequest.update.mockResolvedValue({
      ...requestWithoutTask,
      paidTotal: new Decimal(1000),
      status: 'PAID',
    });
    mockPrismaService.task = {
      update: jest.fn(),
    };

    const payment: PaymentInput = {
      amount: 500,
      paymentDate: new Date(),
      method: 'BANK_TRANSFER',
    };

    // Should not throw
    await expect(
      service.recordPayment('tenant-1', 'exp-1', payment, 'user-1')
    ).resolves.toBeDefined();

    // Task update should not be called
    expect(mockPrismaService.task.update).not.toHaveBeenCalled();
  });
});


describe('getExpenseSummaryForCase - clientId filtresi (TM3 Faz7-V)', () => {
  let service: ExpenseRequestService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExpenseRequestService,
        ExpenseGateService,
        ExpenseCalculatorService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: ClientSettlementReadService, useValue: mockClientSettlementReadService },
        { provide: CaseBalanceService, useValue: mockCaseBalanceService },
        { provide: AccountingJournalWriterService, useValue: mockJournalWriter },
        { provide: TariffService, useValue: mockTariffService },
        { provide: ExpenseNotificationService, useValue: mockExpenseNotificationService },
        { provide: NotificationDispatcherService, useValue: mockDispatcher },
        { provide: OfficeService, useValue: mockOffice },
      ],
    }).compile();
    service = module.get<ExpenseRequestService>(ExpenseRequestService);
  });

  it('clientId verilince where.clientId ile filtreler (seçili müvekkil masrafı)', async () => {
    mockPrismaService.expenseRequest.findMany.mockResolvedValue([
      { totalAmount: new Decimal(1431.1), paidTotal: new Decimal(0), status: 'PENDING', gateType: 'BLOCKING' },
    ]);

    const res = await service.getExpenseSummaryForCase('t1', 'case-1', 'client-1');

    expect(mockPrismaService.expenseRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: 't1', caseId: 'case-1', clientId: 'client-1', status: { not: 'CANCELLED' } }),
      }),
    );
    expect(res.totalRequested).toBeCloseTo(1431.1, 2);
    expect(res.totalPaid).toBe(0);
    expect(res.totalPending).toBeCloseTo(1431.1, 2);
  });

  it('clientId verilmeyince where.clientId YOK (dosya-geneli, geri uyumlu)', async () => {
    mockPrismaService.expenseRequest.findMany.mockResolvedValue([]);

    await service.getExpenseSummaryForCase('t1', 'case-1');

    const where = mockPrismaService.expenseRequest.findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({ tenantId: 't1', caseId: 'case-1' });
    expect(where.clientId).toBeUndefined();
  });
});
