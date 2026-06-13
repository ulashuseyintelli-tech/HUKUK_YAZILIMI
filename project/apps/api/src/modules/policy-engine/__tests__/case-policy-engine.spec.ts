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
import { UyapAvailabilityService, MockUyapAvailabilityService } from '../fact-store/uyap-availability.service';
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
 * Scenario 7 (UYAP geçici arıza) artık bu generic loop'ta DEĞİL.
 * Legacy `case.uyap_enabled` modeli terk edildi (P3); outage global `system.uyap_available`
 * computed fact'i + UYAP_TEMPORARILY_UNAVAILABLE(_SEND) gate'leri ile modellenir.
 * Adanmış CPE uçtan uca testi için: dosya sonundaki
 * "P3 — UYAP geçici arıza (CPE uçtan uca)" describe bloğu.
 */

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
  SCENARIO_8_APPROVE_EXPENSE,
];

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
        UyapAvailabilityService,
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
            factKey: key,
            factValue: value,
          }))
        );
        mockPrismaService.icrabotCaseFlag.findMany.mockResolvedValue([]);
        mockPrismaService.expenseRequest.count.mockResolvedValue(
          scenario.facts['case.has_unpaid_blocking_expense'] ? 1 : 0
        );
        mockPrismaService.cpeDecisionLog.create.mockResolvedValue({ id: 'log-1' });

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
          expect(decision.blockedBy).toBe((scenario as any).expectedBlockedBy);
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
          factKey: key,
          factValue: value,
        }))
      );
      mockPrismaService.icrabotCaseFlag.findMany.mockResolvedValue([]);
      mockPrismaService.expenseRequest.count.mockResolvedValue(1);
      mockPrismaService.cpeDecisionLog.create.mockResolvedValue({ id: 'log-1' });

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

      // First call - execution doesn't exist
      mockPrismaService.cpeExecutionRecord.findUnique.mockResolvedValueOnce(null);
      mockPrismaService.cpeExecutionRecord.create.mockResolvedValue({
        executionId,
        caseId,
        actionCode,
        status: 'COMPLETED',
      });
      mockPrismaService.icrabotCaseFact.findMany.mockResolvedValue([]);
      mockPrismaService.icrabotCaseFlag.findMany.mockResolvedValue([]);

      const result1 = await cpe.onActionExecuted(caseId, actionCode, {}, { success: true }, executionId);

      // Second call - execution exists (duplicate)
      mockPrismaService.cpeExecutionRecord.findUnique.mockResolvedValueOnce({
        executionId,
        caseId,
        actionCode,
        status: 'COMPLETED',
      });

      const result2 = await cpe.onActionExecuted(caseId, actionCode, {}, { success: true }, executionId);

      // Both should indicate duplicate
      expect((result2 as any).isDuplicate).toBe(true);
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
        { caseId: 'case-x', factKey: 'case.status', factValue: 'CLOSED' },
        { caseId: 'case-x', factKey: 'case.has_unpaid_blocking_expense', factValue: true },
      ]);
      mockPrismaService.icrabotCaseFlag.findMany.mockResolvedValue([]);
      mockPrismaService.expenseRequest.count.mockResolvedValue(1);
      mockPrismaService.cpeDecisionLog.create.mockResolvedValue({ id: 'log-1' });

      const decision = await cpe.canPerformAction('case-x', ActionCode.UYAP_SEND);

      expect(decision.allowed).toBe(false);
      expect(decision.blockedBy).toBe('CASE_CLOSED');
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
        UyapAvailabilityService,
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

// ============================================
// P3 — UYAP geçici arıza (CPE uçtan uca)
// ============================================
//
// Outage, global `system.uyap_available` computed fact'i ile modellenir; kaynak
// UyapAvailabilityService (burada MockUyapAvailabilityService ile outage'a çekilir).
// StateMachineService stub'lanır (outage davranışı state-flow detayına bağlı olmasın;
// QUERY için state-allow yeter, SEND zaten state'ten önce gate'te bloklanır).
// Legacy `case.uyap_enabled` kullanılmaz. `allow_uyap_actions`'a dokunulmaz.

describe('CasePolicyEngine - P3 UYAP geçici arıza (outage)', () => {
  let module: TestingModule;
  let cpe: CasePolicyEngine;
  let mockUyap: MockUyapAvailabilityService;

  const outageMockPrisma = {
    icrabotCaseFact: { findMany: jest.fn().mockResolvedValue([]) },
    icrabotCaseFlag: { findMany: jest.fn().mockResolvedValue([]) },
    case: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'case-outage',
        caseStatus: 'ACTIVE',
        workflowStage: 'UYAP_SENT',
        type: 'ILAMSIZ',
        subType: null,
        isAutoMode: false,
        isAutomationEnabled: true,
        allowUyapActions: true, // kalıcı kapatma YOK → UYAP_DISABLED tetiklenmesin
        hasArticle4Request: false,
        isMtsCase: false,
        subCategory: null,
        currency: 'TRY',
        principalAmount: 0,
        createdAt: new Date(),
        nextActionAt: null,
      }),
    },
  };

  // StateMachine stub: QUERY'nin state'ten geçmesi için allow döner.
  const stubStateMachine = {
    getRuleVersion: jest.fn().mockReturnValue('state-test-v1'),
    getCurrentState: jest
      .fn()
      .mockResolvedValue({ scope: Scope.CASE, currentState: 'UYAP_SENT', version: 1 }),
    canTransition: jest
      .fn()
      .mockReturnValue({ allowed: true, reason: 'OK', targetState: 'UYAP_SENT' }),
  };

  beforeEach(async () => {
    mockUyap = new MockUyapAvailabilityService();
    mockUyap.setAvailable(false); // OUTAGE

    module = await Test.createTestingModule({
      providers: [
        CasePolicyEngine,
        FactStoreService,
        ComputedFactRegistry,
        GateCheckerService,
        { provide: UyapAvailabilityService, useValue: mockUyap },
        { provide: StateMachineService, useValue: stubStateMachine },
        { provide: DecisionLoggerService, useValue: { log: jest.fn().mockResolvedValue('dec-id') } },
        { provide: ExecutionRecorderService, useValue: {} },
        { provide: RuleEngineService, useValue: {} },
        { provide: PrismaService, useValue: outageMockPrisma },
      ],
    }).compile();

    cpe = module.get<CasePolicyEngine>(CasePolicyEngine);
    // compile() lifecycle hook'ları çağırmaz → computed fact provider'larını elle kaydet
    // (objection-period.spec ile aynı idiom).
    module.get<ComputedFactRegistry>(ComputedFactRegistry).onModuleInit();
  });

  afterEach(async () => {
    await module.close();
  });

  it('UYAP_QUERY → allowed:true + outage warning (code/message birebir)', async () => {
    const decision = await cpe.canPerformAction('case-outage', ActionCode.UYAP_QUERY);

    expect(decision.allowed).toBe(true);
    expect(decision.warnings).toBeDefined();
    const w = decision.warnings?.find((x) => x.code === 'UYAP_TEMPORARILY_UNAVAILABLE');
    expect(w).toBeDefined();
    expect(w?.message).toBe('UYAP sistemi geçici olarak devre dışı');
  });

  it('UYAP_SEND → allowed:false + HARD blok (code/reason birebir)', async () => {
    const decision = await cpe.canPerformAction('case-outage', ActionCode.UYAP_SEND);

    expect(decision.allowed).toBe(false);
    expect(decision.code).toBe('GATE_BLOCKED');
    expect((decision.blockedBy as any)?.gateCode).toBe('UYAP_TEMPORARILY_UNAVAILABLE_SEND');
    expect(decision.reason).toBe('UYAP sistemi geçici olarak devre dışı. Gönderim yapılamaz.');
  });
});
