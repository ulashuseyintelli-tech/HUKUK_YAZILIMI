/**
 * Case Policy Engine - Golden Scenario Tests
 * 
 * Bu test suite, CPE'nin temel senaryolarda doğru çalıştığını doğrular.
 * Her senaryo gerçek case snapshot'larından türetilmiştir.
 * 
 * @see docs/decision-point-inventory.md
 * @see docs/high-risk-action-matrix.md
 */

import { Test, TestingModule } from '@nestjs/testing';
import { CasePolicyEngine } from '../case-policy-engine.service';
import { FactStoreService } from '../fact-store/fact-store.service';
import { ComputedFactRegistry } from '../fact-store/computed-fact-registry';
import { StateMachineService } from '../state-machine/state-machine.service';
import { GateCheckerService } from '../gate-checker/gate-checker.service';
import { RuleEngineService } from '../rule-engine/rule-engine.service';
import { DecisionLoggerService } from '../decision-logger/decision-logger.service';
import { ExecutionRecorderService } from '../decision-logger/execution-recorder.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { ActionCode } from '../types/action-code.enum';
import { Scope } from '../types/scope.enum';

// ============================================
// Mock PrismaService
// ============================================
const mockPrismaService = {
  icrabotCaseFact: {
    findMany: jest.fn(),
    upsert: jest.fn(),
  },
  icrabotCaseFlag: {
    findMany: jest.fn(),
  },
  case: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  expenseRequest: {
    count: jest.fn(),
  },
  cpeDecisionLog: {
    create: jest.fn(),
    findMany: jest.fn(),
  },
  cpeExecutionRecord: {
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
};

// ============================================
// Golden Scenario Fixtures
// ============================================

/**
 * Scenario 1: Yeni açılmış dosya - UYAP gönderimi
 * - Dosya yeni açılmış (DRAFT stage)
 * - Masraf ödenmemiş (BLOCKING expense var)
 * - Beklenen: UYAP_SEND engellenmeli
 */
const SCENARIO_1_NEW_CASE_BLOCKED = {
  name: 'Yeni dosya - masraf ödenmemiş - UYAP engelli',
  caseId: 'case-001',
  facts: {
    'case.workflow_stage': 'DRAFT',
    'case.icra_type': 'ILAMSIZ_GENEL',
    'case.status': 'ACTIVE',
    'case.has_unpaid_blocking_expense': true,
  } as Record<string, unknown>,
  actionCode: ActionCode.UYAP_SEND,
  expectedAllowed: false,
  expectedCode: 'GATE_BLOCKED',
  expectedBlockedBy: 'EXPENSE_BLOCKING',
};

/**
 * Scenario 2: Masraf ödenmiş dosya - UYAP gönderimi
 * - Dosya DRAFT stage'de
 * - Masraf ödenmiş
 * - Beklenen: UYAP_SEND izin verilmeli
 */
const SCENARIO_2_READY_FOR_UYAP = {
  name: 'Masraf ödenmiş - UYAP hazır',
  caseId: 'case-002',
  facts: {
    'case.workflow_stage': 'DRAFT',
    'case.icra_type': 'ILAMSIZ_GENEL',
    'case.status': 'ACTIVE',
    'case.has_unpaid_blocking_expense': false,
    'case.uyap_enabled': true,
  } as Record<string, unknown>,
  actionCode: ActionCode.UYAP_SEND,
  expectedAllowed: true,
  expectedCode: 'ALLOWED',
};

/**
 * Scenario 3: Kapalı dosya - herhangi bir işlem
 * - Dosya kapalı (CLOSED status)
 * - Beklenen: Tüm işlemler engellenmeli
 */
const SCENARIO_3_CLOSED_CASE = {
  name: 'Kapalı dosya - tüm işlemler engelli',
  caseId: 'case-003',
  facts: {
    'case.workflow_stage': 'CLOSED',
    'case.icra_type': 'ILAMSIZ_GENEL',
    'case.status': 'CLOSED',
  } as Record<string, unknown>,
  actionCode: ActionCode.TRIGGER_HACIZ,
  expectedAllowed: false,
  expectedCode: 'GATE_BLOCKED',
  expectedBlockedBy: 'CASE_CLOSED',
};

/**
 * Scenario 4: Tebligat sonrası haciz talebi
 * - Tebligat yapılmış, 10 gün geçmiş
 * - İtiraz yok
 * - Beklenen: TRIGGER_HACIZ izin verilmeli
 */
const SCENARIO_4_READY_FOR_HACIZ = {
  name: 'Tebligat sonrası - haciz hazır',
  caseId: 'case-004',
  facts: {
    'case.workflow_stage': 'WAITING_RESPONSE',
    'case.icra_type': 'ILAMSIZ_GENEL',
    'case.status': 'ACTIVE',
    'case.has_unpaid_blocking_expense': false,
    'debtor.d1.notification_date': new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString(), // 15 gün önce
    'debtor.d1.has_objection': false,
  } as Record<string, unknown>,
  context: { debtorId: 'd1' },
  actionCode: ActionCode.TRIGGER_HACIZ,
  expectedAllowed: true,
  expectedCode: 'ALLOWED',
};

/**
 * Scenario 5: Tebligat süresi dolmamış - haciz engelli
 * - Tebligat yapılmış, 5 gün geçmiş (10 gün dolmamış)
 * - Beklenen: TRIGGER_HACIZ engellenmeli
 */
const SCENARIO_5_HACIZ_TOO_EARLY = {
  name: 'Tebligat süresi dolmamış - haciz engelli',
  caseId: 'case-005',
  facts: {
    'case.workflow_stage': 'WAITING_RESPONSE',
    'case.icra_type': 'ILAMSIZ_GENEL',
    'case.status': 'ACTIVE',
    'case.has_unpaid_blocking_expense': false,
    'debtor.d1.notification_date': new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(), // 5 gün önce
    'debtor.d1.has_objection': false,
  } as Record<string, unknown>,
  context: { debtorId: 'd1' },
  actionCode: ActionCode.TRIGGER_HACIZ,
  expectedAllowed: false,
  expectedCode: 'GATE_BLOCKED',
  expectedBlockedBy: 'NOTIFICATION_PERIOD_NOT_EXPIRED',
};

/**
 * Scenario 6: Kambiyo takibi - 5 gün yeterli
 * - Kambiyo takibi (ILAMSIZ_KAMBIYO)
 * - Tebligat yapılmış, 5 gün geçmiş
 * - Beklenen: TRIGGER_HACIZ izin verilmeli (kambiyo'da 5 gün yeterli)
 */
const SCENARIO_6_KAMBIYO_5_DAYS = {
  name: 'Kambiyo takibi - 5 gün yeterli',
  caseId: 'case-006',
  facts: {
    'case.workflow_stage': 'WAITING_RESPONSE',
    'case.icra_type': 'ILAMSIZ_KAMBIYO',
    'case.status': 'ACTIVE',
    'case.has_unpaid_blocking_expense': false,
    'debtor.d1.notification_date': new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString(), // 6 gün önce
    'debtor.d1.has_objection': false,
  } as Record<string, unknown>,
  context: { debtorId: 'd1' },
  actionCode: ActionCode.TRIGGER_HACIZ,
  expectedAllowed: true,
  expectedCode: 'ALLOWED',
};

/**
 * Scenario 7: UYAP devre dışı - soft warning
 * - UYAP sistemi geçici olarak devre dışı
 * - Beklenen: İşlem izin verilmeli ama warning olmalı
 */
const SCENARIO_7_UYAP_DISABLED_WARNING = {
  name: 'UYAP devre dışı - soft warning',
  caseId: 'case-007',
  facts: {
    'case.workflow_stage': 'DRAFT',
    'case.icra_type': 'ILAMSIZ_GENEL',
    'case.status': 'ACTIVE',
    'case.has_unpaid_blocking_expense': false,
    'case.uyap_enabled': false, // UYAP devre dışı
  } as Record<string, unknown>,
  actionCode: ActionCode.UYAP_QUERY,
  expectedAllowed: true,
  expectedCode: 'ALLOWED',
  expectedWarnings: ['UYAP sistemi geçici olarak devre dışı'],
};

/**
 * Scenario 8: Masraf onaylama - dosya kapalı değil
 * - Dosya aktif
 * - Beklenen: APPROVE_EXPENSE izin verilmeli
 */
const SCENARIO_8_APPROVE_EXPENSE = {
  name: 'Masraf onaylama - aktif dosya',
  caseId: 'case-008',
  facts: {
    'case.workflow_stage': 'DRAFT',
    'case.icra_type': 'ILAMSIZ_GENEL',
    'case.status': 'ACTIVE',
  } as Record<string, unknown>,
  actionCode: ActionCode.APPROVE_EXPENSE,
  expectedAllowed: true,
  expectedCode: 'ALLOWED',
};

const ALL_SCENARIOS = [
  SCENARIO_1_NEW_CASE_BLOCKED,
  SCENARIO_2_READY_FOR_UYAP,
  SCENARIO_3_CLOSED_CASE,
  SCENARIO_4_READY_FOR_HACIZ,
  SCENARIO_5_HACIZ_TOO_EARLY,
  SCENARIO_6_KAMBIYO_5_DAYS,
  SCENARIO_7_UYAP_DISABLED_WARNING,
  SCENARIO_8_APPROVE_EXPENSE,
];

// ============================================
// Case Row Helper
// ============================================

/**
 * 'case.icra_type' fact değerini gerçek case satırının type/subType alanlarına ayrıştırır.
 * Servisteki mapCaseTypeToIcraType(type, subType) ile uyumludur:
 *   'ILAMSIZ_KAMBIYO' -> { type: 'ILAMSIZ', subType: 'KAMBIYO' }
 *   'ILAMSIZ_GENEL'   -> { type: 'ILAMSIZ', subType: null }
 */
function parseIcraType(icraType?: unknown): { type: string; subType: string | null } {
  if (icraType === 'ILAMSIZ_KAMBIYO') return { type: 'ILAMSIZ', subType: 'KAMBIYO' };
  if (icraType === 'ILAMSIZ_GENEL') return { type: 'ILAMSIZ', subType: null };
  if (typeof icraType === 'string' && icraType.startsWith('ILAMSIZ')) {
    return { type: 'ILAMSIZ', subType: null };
  }
  return { type: typeof icraType === 'string' ? icraType : 'ILAMSIZ', subType: null };
}

/**
 * Senaryo fact'lerinden gerçek `case` satırını türetir.
 *
 * Neden gerekli: CPE.evaluateDecision (adım 1, case var mı kontrolü) ve
 * StateMachineService.getCurrentState doğrudan prisma.case.findUnique okur.
 * Fact-store mock'u (icrabotCaseFact) tek başına yeterli değildir; case satırı
 * stub edilmezse her senaryo gate'e ulaşamadan CASE_NOT_FOUND ile kısa devre yapar.
 */
function buildCaseRow(opts: {
  caseId: string;
  status?: unknown;
  workflowStage?: unknown;
  icraType?: unknown;
}) {
  const { type, subType } = parseIcraType(opts.icraType);
  return {
    id: opts.caseId,
    caseStatus: (opts.status as string) ?? 'ACTIVE',
    workflowStage: (opts.workflowStage as string) ?? 'DRAFT',
    type,
    subType,
    // State-machine version'u updatedAt.getTime()'ten türetiyor
    updatedAt: new Date(),
  };
}

// ============================================
// Test Suite
// ============================================

describe('CasePolicyEngine - Golden Scenarios', () => {
  let module: TestingModule;
  let cpe: CasePolicyEngine;
  let factStore: FactStoreService;

  beforeEach(async () => {
    module = await Test.createTestingModule({
      providers: [
        CasePolicyEngine,
        FactStoreService,
        ComputedFactRegistry,
        StateMachineService,
        GateCheckerService,
        RuleEngineService,
        DecisionLoggerService,
        ExecutionRecorderService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    cpe = module.get<CasePolicyEngine>(CasePolicyEngine);
    factStore = module.get<FactStoreService>(FactStoreService);

    // Reset mocks
    jest.clearAllMocks();
  });

  afterEach(async () => {
    await module.close();
  });

  // ============================================
  // Golden Scenario Tests
  // ============================================

  describe('Golden Scenarios', () => {
    ALL_SCENARIOS.forEach((scenario) => {
      it(`should handle: ${scenario.name}`, async () => {
        // Setup: Mock fact store to return scenario facts
        mockPrismaService.icrabotCaseFact.findMany.mockResolvedValue(
          Object.entries(scenario.facts).map(([key, value]) => ({
            caseId: scenario.caseId,
            key,
            value,
          }))
        );
        mockPrismaService.icrabotCaseFlag.findMany.mockResolvedValue([]);
        mockPrismaService.expenseRequest.count.mockResolvedValue(
          scenario.facts['case.has_unpaid_blocking_expense'] ? 1 : 0
        );
        mockPrismaService.cpeDecisionLog.create.mockResolvedValue({ id: 'log-1' });
        // Gerçek case satırını fact'lerden türet (CPE + StateMachine bunu okur)
        mockPrismaService.case.findUnique.mockResolvedValue(
          buildCaseRow({
            caseId: scenario.caseId,
            status: scenario.facts['case.status'],
            workflowStage: scenario.facts['case.workflow_stage'],
            icraType: scenario.facts['case.icra_type'],
          })
        );

        // Act
        const decision = await cpe.canPerformAction(
          scenario.caseId,
          scenario.actionCode,
          (scenario as any).context
        );

        // Assert
        expect(decision.allowed).toBe(scenario.expectedAllowed);
        expect(decision.code).toBe(scenario.expectedCode);

        if ((scenario as any).expectedBlockedBy) {
          // PolicyDecision.blockedBy artık { gateCode, severity } objesi (bkz. policy-decision.interface.ts)
          expect(decision.blockedBy?.gateCode).toBe((scenario as any).expectedBlockedBy);
        }

        if ((scenario as any).expectedWarnings) {
          expect(decision.warnings).toBeDefined();
          expect(decision.warnings?.length).toBeGreaterThan(0);
        }
      });
    });
  });

  // ============================================
  // Decision Determinism Tests
  // ============================================

  describe('Decision Determinism', () => {
    it('should return same decision for same inputs', async () => {
      const scenario = SCENARIO_1_NEW_CASE_BLOCKED;

      mockPrismaService.icrabotCaseFact.findMany.mockResolvedValue(
        Object.entries(scenario.facts).map(([key, value]) => ({
          caseId: scenario.caseId,
          key,
          value,
        }))
      );
      mockPrismaService.icrabotCaseFlag.findMany.mockResolvedValue([]);
      mockPrismaService.expenseRequest.count.mockResolvedValue(1);
      mockPrismaService.cpeDecisionLog.create.mockResolvedValue({ id: 'log-1' });
      mockPrismaService.case.findUnique.mockResolvedValue(
        buildCaseRow({
          caseId: scenario.caseId,
          status: scenario.facts['case.status'],
          workflowStage: scenario.facts['case.workflow_stage'],
          icraType: scenario.facts['case.icra_type'],
        })
      );

      // Call multiple times
      const decision1 = await cpe.canPerformAction(scenario.caseId, scenario.actionCode);
      const decision2 = await cpe.canPerformAction(scenario.caseId, scenario.actionCode);
      const decision3 = await cpe.canPerformAction(scenario.caseId, scenario.actionCode);

      // All should be identical
      expect(decision1.allowed).toBe(decision2.allowed);
      expect(decision2.allowed).toBe(decision3.allowed);
      expect(decision1.code).toBe(decision2.code);
      expect(decision2.code).toBe(decision3.code);
    });
  });

  // ============================================
  // Idempotency Tests
  // ============================================

  describe('Idempotency', () => {
    it('should return same result for duplicate executionId', async () => {
      const executionId = 'exec-123';
      const caseId = 'case-001';
      const actionCode = ActionCode.UYAP_SEND;

      // First call - execution doesn't exist (startExecution PENDING kayıt oluşturur)
      mockPrismaService.cpeExecutionRecord.findUnique.mockResolvedValueOnce(null);
      mockPrismaService.cpeExecutionRecord.create.mockResolvedValue({
        executionId,
        caseId,
        actionCode,
        status: 'PENDING',
      });
      mockPrismaService.icrabotCaseFact.findMany.mockResolvedValue([]);
      mockPrismaService.icrabotCaseFlag.findMany.mockResolvedValue([]);

      const result1 = await cpe.onActionExecuted(caseId, actionCode, {}, { success: true }, executionId);

      // Second call - execution exists (duplicate). NOOP = canonical duplicate marker (markAsNoop)
      mockPrismaService.cpeExecutionRecord.findUnique.mockResolvedValueOnce({
        executionId,
        caseId,
        actionCode,
        status: 'NOOP',
      });

      const result2 = await cpe.onActionExecuted(caseId, actionCode, {}, { success: true }, executionId);

      // Servis sözleşmesi: duplicate dönüşü { success, code } (isDuplicate alanı yok).
      // NOOP kayıt -> success:false, code:'DUPLICATE'
      expect(result2.success).toBe(false);
      expect(result2.code).toBe('DUPLICATE');
      // Idempotency: duplicate çağrı YENİ kayıt oluşturmaz (re-execute yok) - sadece ilk çağrı create eder
      expect(mockPrismaService.cpeExecutionRecord.create).toHaveBeenCalledTimes(1);
    });
  });

  // ============================================
  // Gate Priority Tests
  // ============================================

  describe('Gate Priority', () => {
    it('should check CASE_CLOSED before other gates', async () => {
      // Case is closed AND has unpaid expense
      // CASE_CLOSED should be the blocking reason, not EXPENSE_BLOCKING
      mockPrismaService.icrabotCaseFact.findMany.mockResolvedValue([
        { caseId: 'case-x', key: 'case.status', value: 'CLOSED' },
        { caseId: 'case-x', key: 'case.has_unpaid_blocking_expense', value: true },
      ]);
      mockPrismaService.icrabotCaseFlag.findMany.mockResolvedValue([]);
      mockPrismaService.expenseRequest.count.mockResolvedValue(1);
      mockPrismaService.cpeDecisionLog.create.mockResolvedValue({ id: 'log-1' });
      mockPrismaService.case.findUnique.mockResolvedValue(
        buildCaseRow({ caseId: 'case-x', status: 'CLOSED', workflowStage: 'CLOSED' })
      );

      const decision = await cpe.canPerformAction('case-x', ActionCode.UYAP_SEND);

      expect(decision.allowed).toBe(false);
      expect(decision.blockedBy?.gateCode).toBe('CASE_CLOSED');
    });
  });
});

// ============================================
// Performance Tests
// ============================================

describe('CasePolicyEngine - Performance', () => {
  let module: TestingModule;
  let cpe: CasePolicyEngine;

  beforeEach(async () => {
    module = await Test.createTestingModule({
      providers: [
        CasePolicyEngine,
        FactStoreService,
        ComputedFactRegistry,
        StateMachineService,
        GateCheckerService,
        RuleEngineService,
        DecisionLoggerService,
        ExecutionRecorderService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    cpe = module.get<CasePolicyEngine>(CasePolicyEngine);
  });

  afterEach(async () => {
    await module.close();
  });

  it('should complete canPerformAction within 150ms (with cache)', async () => {
    mockPrismaService.icrabotCaseFact.findMany.mockResolvedValue([]);
    mockPrismaService.icrabotCaseFlag.findMany.mockResolvedValue([]);
    mockPrismaService.expenseRequest.count.mockResolvedValue(0);
    mockPrismaService.cpeDecisionLog.create.mockResolvedValue({ id: 'log-1' });
    mockPrismaService.case.findUnique.mockResolvedValue(
      buildCaseRow({ caseId: 'case-perf', status: 'ACTIVE', workflowStage: 'DRAFT' })
    );

    const iterations = 10;
    const times: number[] = [];

    for (let i = 0; i < iterations; i++) {
      const start = performance.now();
      await cpe.canPerformAction('case-perf', ActionCode.UYAP_QUERY);
      const end = performance.now();
      times.push(end - start);
    }

    // Calculate p95
    times.sort((a, b) => a - b);
    const p95Index = Math.floor(times.length * 0.95);
    const p95 = times[p95Index];

    console.log(`Performance: p95=${p95.toFixed(2)}ms, avg=${(times.reduce((a, b) => a + b, 0) / times.length).toFixed(2)}ms`);

    // With mocked DB, should be very fast
    expect(p95).toBeLessThan(150);
  });
});
