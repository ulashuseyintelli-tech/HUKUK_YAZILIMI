import { Test, TestingModule } from '@nestjs/testing';
import { ExpenseRequestService, PaymentInput } from './expense-request.service';
import { ExpenseGateService, GateCheckResult } from './expense-gate.service';
import { ExpenseCalculatorService } from './expense-calculator.service';
import { PrismaService } from '@/prisma/prisma.service';
import { CaseBalanceService } from '@/modules/case-balance/case-balance.service';
import { NotificationDispatcherService } from '@/modules/client-notification/notification-dispatcher.service';
import { OfficeService } from '@/modules/office/office.service';
import { TariffService } from '@/modules/tariff/tariff.service';
import { Decimal } from '@prisma/client/runtime/library';

// Mock data
const mockExpenseRequest = {
  id: 'exp-1',
  tenantId: 'tenant-1',
  caseId: 'case-1',
  clientId: 'client-1',
  stageCode: 'OPENING',
  gateType: 'BLOCKING',
  totalAmount: new Decimal(1500),
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
  $transaction: jest.fn((fn: any) => fn(mockPrismaService)),
};

const mockCaseBalanceService = {
  credit: jest.fn(),
};

// Faz 3.5: ödeme maili tetiği — best-effort dispatcher + office (mail finansal state'i etkilemez).
const mockDispatcher = {
  dispatch: jest.fn().mockResolvedValue({ status: 'sent' }),
};
const mockOffice = {
  getOrCreate: jest.fn().mockResolvedValue({ name: 'Test Büro' }),
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

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExpenseRequestService,
        ExpenseGateService,
        ExpenseCalculatorService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: CaseBalanceService, useValue: mockCaseBalanceService },
        { provide: TariffService, useValue: mockTariffService },
        { provide: ExpenseNotificationService, useValue: mockExpenseNotificationService },
        { provide: NotificationDispatcherService, useValue: mockDispatcher },
        { provide: OfficeService, useValue: mockOffice },
      ],
    }).compile();

    service = module.get<ExpenseRequestService>(ExpenseRequestService);
    gateService = module.get<ExpenseGateService>(ExpenseGateService);
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
      mockPrismaService.expenseRequest.update.mockResolvedValue({
        ...partialRequest,
        paidTotal: new Decimal(500),
        status: 'PARTIAL',
      });

      const payment: PaymentInput = {
        amount: 500,
        paymentDate: new Date(),
        method: 'BANK_TRANSFER',
      };

      const result = await service.recordPayment('tenant-1', 'exp-1', payment, 'user-1');

      expect(mockPrismaService.expenseRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'PARTIAL',
            paidTotal: 500,
          }),
        })
      );
    });

    it('should set status to PAID when payment equals total', async () => {
      const request = {
        ...mockExpenseRequest,
        totalAmount: new Decimal(1000),
        paidTotal: new Decimal(500),
      };
      mockPrismaService.expenseRequest.findFirst.mockResolvedValue(request);
      mockPrismaService.expenseRequest.update.mockResolvedValue({
        ...request,
        paidTotal: new Decimal(1000),
        status: 'PAID',
      });

      const payment: PaymentInput = {
        amount: 500,
        paymentDate: new Date(),
        method: 'BANK_TRANSFER',
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

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExpenseGateService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    gateService = module.get<ExpenseGateService>(ExpenseGateService);
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

      const result = await gateService.checkGate('case-1');

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

      const result = await gateService.checkGate('case-1');

      expect(result.isBlocked).toBe(true);
      expect(result.totalPending).toBe(500);
    });

    /**
     * Property: If all BLOCKING expenses are PAID, isUyapBlocked should return false.
     */
    it('should return blocked=false when all BLOCKING expenses are PAID', async () => {
      mockPrismaService.expenseRequest.findMany.mockResolvedValue([]);

      const result = await gateService.checkGate('case-1');

      expect(result.isBlocked).toBe(false);
      expect(result.blockingExpenses).toHaveLength(0);
      expect(result.totalPending).toBe(0);
    });

    it('should return blocked=false when no BLOCKING expenses exist', async () => {
      mockPrismaService.expenseRequest.findMany.mockResolvedValue([]);

      const result = await gateService.checkGate('case-1');

      expect(result.isBlocked).toBe(false);
    });
  });

  describe('isUyapBlocked', () => {
    it('should return true when blocking expenses exist', async () => {
      mockPrismaService.expenseRequest.count.mockResolvedValue(1);

      const result = await gateService.isUyapBlocked('case-1');

      expect(result).toBe(true);
    });

    it('should return false when no blocking expenses exist', async () => {
      mockPrismaService.expenseRequest.count.mockResolvedValue(0);

      const result = await gateService.isUyapBlocked('case-1');

      expect(result).toBe(false);
    });
  });

  describe('canPerformUyapAction', () => {
    it('should allow VIEW actions regardless of gate status', async () => {
      mockPrismaService.expenseRequest.count.mockResolvedValue(1);

      const result = await gateService.canPerformUyapAction('case-1', 'VIEW');

      expect(result).toBe(true);
    });

    it('should block SUBMIT actions when gate is blocked', async () => {
      mockPrismaService.expenseRequest.count.mockResolvedValue(1);

      const result = await gateService.canPerformUyapAction('case-1', 'SUBMIT');

      expect(result).toBe(false);
    });

    it('should allow SUBMIT actions when gate is clear', async () => {
      mockPrismaService.expenseRequest.count.mockResolvedValue(0);

      const result = await gateService.canPerformUyapAction('case-1', 'SUBMIT');

      expect(result).toBe(true);
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
        { provide: EmailProviderService, useValue: mockEmailProviderService },
        { provide: ConfigService, useValue: mockConfigService },
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

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExpenseRequestService,
        ExpenseGateService,
        ExpenseCalculatorService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: CaseBalanceService, useValue: mockCaseBalanceService },
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
