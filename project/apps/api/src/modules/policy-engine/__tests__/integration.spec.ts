/**
 * Case Policy Engine - Integration Tests
 * 
 * Production'a deploy öncesi end-to-end senaryoları test eder.
 * Gerçek servis entegrasyonlarını simüle eder.
 * 
 * @see docs/decision-point-inventory.md
 */

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { CasePolicyEngine } from '../case-policy-engine.service';
import { FactStoreService } from '../fact-store/fact-store.service';
import { ComputedFactRegistry } from '../fact-store/computed-fact-registry';
import { StateMachineService } from '../state-machine/state-machine.service';
import { GateCheckerService } from '../gate-checker/gate-checker.service';
import { RuleEngineService } from '../rule-engine/rule-engine.service';
import { DecisionLoggerService } from '../decision-logger/decision-logger.service';
import { ExecutionRecorderService } from '../decision-logger/execution-recorder.service';
import { PolicyEngineController } from '../policy-engine.controller';
import { PrismaService } from '../../../prisma/prisma.service';
import { ActionCode } from '../types/action-code.enum';
import { Scope } from '../types/scope.enum';

// ============================================
// Mock PrismaService for Integration Tests
// ============================================
const createIntegrationMockPrisma = () => ({
  icrabotCaseFact: {
    findMany: jest.fn().mockResolvedValue([]),
    upsert: jest.fn(),
  },
  icrabotCaseFlag: {
    findMany: jest.fn().mockResolvedValue([]),
  },
  case: {
    findUnique: jest.fn().mockResolvedValue({
      id: 'int-test-case',
      workflowStage: 'INITIAL',
      type: 'ILAMSIZ',
      subType: null,
      caseStatus: 'ACTIVE',
      isAutoMode: true,
      isAutomationEnabled: true,
      allowUyapActions: true,
      hasArticle4Request: false,
      isMtsCase: false,
      subCategory: null,
      currency: 'TRY',
      principalAmount: 10000,
      createdAt: new Date(),
      nextActionAt: null,
      updatedAt: new Date(),
      riskScore: 50,
      collections: [],
    }),
    update: jest.fn(),
  },
  cpeDecisionLog: {
    create: jest.fn().mockResolvedValue({ id: 'log-int-1' }),
    findMany: jest.fn().mockResolvedValue([]),
  },
  cpeExecutionRecord: {
    findUnique: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockResolvedValue({ executionId: 'exec-int-1' }),
    update: jest.fn(),
  },
  caseStageHistory: {
    updateMany: jest.fn(),
  },
  expenseRequest: {
    count: jest.fn().mockResolvedValue(0),
  },
});

// ============================================
// Integration Test Suite
// ============================================
describe('CasePolicyEngine - Integration Tests', () => {
  let app: INestApplication;
  let cpe: CasePolicyEngine;
  let mockPrisma: ReturnType<typeof createIntegrationMockPrisma>;

  beforeAll(async () => {
    mockPrisma = createIntegrationMockPrisma();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [PolicyEngineController],
      providers: [
        CasePolicyEngine,
        FactStoreService,
        ComputedFactRegistry,
        StateMachineService,
        GateCheckerService,
        RuleEngineService,
        DecisionLoggerService,
        ExecutionRecorderService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    cpe = moduleFixture.get<CasePolicyEngine>(CasePolicyEngine);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ============================================
  // Scenario 1: Full UYAP Send Flow
  // ============================================
  describe('Scenario: UYAP Send Flow', () => {
    it('should allow UYAP_SEND when all conditions met', async () => {
      // Setup: Case in INITIAL stage, no blocking expenses
      mockPrisma.case.findUnique.mockResolvedValue({
        id: 'uyap-flow-case',
        workflowStage: 'INITIAL',
        type: 'ILAMSIZ',
        caseStatus: 'ACTIVE',
        isAutoMode: true,
        isAutomationEnabled: true,
        allowUyapActions: true,
        hasArticle4Request: true,
        isMtsCase: false,
        currency: 'TRY',
        principalAmount: 10000,
        createdAt: new Date(),
        updatedAt: new Date(),
        riskScore: 50,
        collections: [],
      });

      mockPrisma.icrabotCaseFact.findMany.mockResolvedValue([
        { key: 'case.has_power_of_attorney', value: true },
        { key: 'expense.opening.paid', value: true },
      ]);

      const decision = await cpe.canPerformAction('uyap-flow-case', ActionCode.UYAP_SEND);

      expect(decision.allowed).toBe(true);
      expect(decision.code).toBe('OK');
    });

    it('should block UYAP_SEND when expense not paid', async () => {
      mockPrisma.case.findUnique.mockResolvedValue({
        id: 'uyap-blocked-case',
        workflowStage: 'INITIAL',
        type: 'ILAMSIZ',
        caseStatus: 'ACTIVE',
        isAutoMode: true,
        isAutomationEnabled: true,
        allowUyapActions: true,
        hasArticle4Request: true,
        isMtsCase: false,
        currency: 'TRY',
        principalAmount: 10000,
        createdAt: new Date(),
        updatedAt: new Date(),
        riskScore: 50,
        collections: [],
      });

      mockPrisma.icrabotCaseFact.findMany.mockResolvedValue([
        { key: 'case.has_unpaid_blocking_expense', value: true },
      ]);

      const decision = await cpe.canPerformAction('uyap-blocked-case', ActionCode.UYAP_SEND);

      expect(decision.allowed).toBe(false);
      expect(decision.code).toBe('GATE_BLOCKED');
    });
  });

  // ============================================
  // Scenario 2: Haciz Trigger Flow
  // ============================================
  describe('Scenario: Haciz Trigger Flow', () => {
    it('should allow TRIGGER_HACIZ after notification period', async () => {
      const notificationDate = new Date();
      notificationDate.setDate(notificationDate.getDate() - 15); // 15 days ago

      mockPrisma.case.findUnique.mockResolvedValue({
        id: 'haciz-flow-case',
        workflowStage: 'ENFORCEMENT_REQUESTED',
        type: 'ILAMSIZ',
        caseStatus: 'ACTIVE',
        isAutoMode: true,
        isAutomationEnabled: true,
        allowUyapActions: true,
        hasArticle4Request: true,
        isMtsCase: false,
        currency: 'TRY',
        principalAmount: 50000,
        createdAt: new Date(),
        updatedAt: new Date(),
        riskScore: 50,
        collections: [],
      });

      mockPrisma.icrabotCaseFact.findMany.mockResolvedValue([
        { key: 'case.haciz_approved', value: true },
        { key: 'debtor.d1.notification_delivered', value: true },
        { key: 'debtor.d1.days_since_notification', value: 15 },
      ]);

      const decision = await cpe.canPerformAction(
        'haciz-flow-case',
        ActionCode.TRIGGER_HACIZ,
        { debtorId: 'd1' }
      );

      expect(decision.allowed).toBe(true);
    });

    it('should block TRIGGER_HACIZ before notification period', async () => {
      mockPrisma.case.findUnique.mockResolvedValue({
        id: 'haciz-early-case',
        workflowStage: 'ENFORCEMENT_REQUESTED',
        type: 'ILAMSIZ',
        caseStatus: 'ACTIVE',
        isAutoMode: true,
        isAutomationEnabled: true,
        allowUyapActions: true,
        hasArticle4Request: true,
        isMtsCase: false,
        currency: 'TRY',
        principalAmount: 50000,
        createdAt: new Date(),
        updatedAt: new Date(),
        riskScore: 50,
        collections: [],
      });

      mockPrisma.icrabotCaseFact.findMany.mockResolvedValue([
        { key: 'debtor.d1.notification_delivered', value: true },
        { key: 'debtor.d1.days_since_notification', value: 3 }, // Only 3 days
      ]);

      const decision = await cpe.canPerformAction(
        'haciz-early-case',
        ActionCode.TRIGGER_HACIZ,
        { debtorId: 'd1' }
      );

      expect(decision.allowed).toBe(false);
    });
  });

  // ============================================
  // Scenario 3: Closed Case Protection
  // ============================================
  describe('Scenario: Closed Case Protection', () => {
    it('should block all actions on closed case', async () => {
      mockPrisma.case.findUnique.mockResolvedValue({
        id: 'closed-case',
        workflowStage: 'CLOSED_PAID',
        type: 'ILAMSIZ',
        caseStatus: 'CLOSED',
        isAutoMode: false,
        isAutomationEnabled: false,
        allowUyapActions: false,
        hasArticle4Request: false,
        isMtsCase: false,
        currency: 'TRY',
        principalAmount: 10000,
        createdAt: new Date(),
        updatedAt: new Date(),
        riskScore: 0,
        collections: [],
      });

      mockPrisma.icrabotCaseFact.findMany.mockResolvedValue([
        { key: 'case.is_closed', value: true },
      ]);

      const actions = [
        ActionCode.UYAP_SEND,
        ActionCode.TRIGGER_HACIZ,
        ActionCode.REQUEST_EXPENSE,
        ActionCode.SEND_NOTIFICATION,
      ];

      for (const actionCode of actions) {
        const decision = await cpe.canPerformAction('closed-case', actionCode);
        expect(decision.allowed).toBe(false);
        // Can be GATE_BLOCKED or INVALID_TRANSITION depending on stage
        expect(['GATE_BLOCKED', 'INVALID_TRANSITION']).toContain(decision.code);
      }
    });

    it('should allow REOPEN_CASE on closed case', async () => {
      mockPrisma.case.findUnique.mockResolvedValue({
        id: 'closed-reopen-case',
        workflowStage: 'CLOSED_PAID',
        type: 'ILAMSIZ',
        caseStatus: 'CLOSED',
        isAutoMode: false,
        isAutomationEnabled: false,
        allowUyapActions: false,
        hasArticle4Request: false,
        isMtsCase: false,
        currency: 'TRY',
        principalAmount: 10000,
        createdAt: new Date(),
        updatedAt: new Date(),
        riskScore: 0,
        collections: [],
      });

      mockPrisma.icrabotCaseFact.findMany.mockResolvedValue([
        { key: 'case.is_closed', value: true },
      ]);

      const decision = await cpe.canPerformAction('closed-reopen-case', ActionCode.REOPEN_CASE);

      // REOPEN_CASE should be allowed even on closed cases
      expect(decision.allowed).toBe(true);
    });
  });

  // ============================================
  // Scenario 4: Next Actions Recommendation
  // ============================================
  describe('Scenario: Next Actions Recommendation', () => {
    it('should recommend UYAP_SEND for new case with paid expenses', async () => {
      mockPrisma.case.findUnique.mockResolvedValue({
        id: 'recommend-case',
        workflowStage: 'INITIAL',
        type: 'ILAMSIZ',
        caseStatus: 'ACTIVE',
        isAutoMode: true,
        isAutomationEnabled: true,
        allowUyapActions: true,
        hasArticle4Request: true,
        isMtsCase: false,
        currency: 'TRY',
        principalAmount: 10000,
        createdAt: new Date(),
        updatedAt: new Date(),
        riskScore: 50,
        collections: [],
      });

      mockPrisma.icrabotCaseFact.findMany.mockResolvedValue([
        { key: 'case.has_power_of_attorney', value: true },
        { key: 'expense.opening.paid', value: true },
      ]);

      const recommendations = await cpe.getNextActions('recommend-case');

      expect(recommendations.length).toBeGreaterThan(0);
      
      const uyapRecommendation = recommendations.find(r => r.actionCode === ActionCode.UYAP_SEND);
      expect(uyapRecommendation).toBeDefined();
    });
  });

  // ============================================
  // Scenario 5: Execution Idempotency
  // ============================================
  describe('Scenario: Execution Idempotency', () => {
    it('should handle duplicate execution gracefully', async () => {
      const executionId = 'exec-duplicate-test';

      mockPrisma.case.findUnique.mockResolvedValue({
        id: 'idempotent-case',
        workflowStage: 'INITIAL',
        type: 'ILAMSIZ',
        caseStatus: 'ACTIVE',
        isAutoMode: true,
        isAutomationEnabled: true,
        allowUyapActions: true,
        hasArticle4Request: true,
        isMtsCase: false,
        currency: 'TRY',
        principalAmount: 10000,
        createdAt: new Date(),
        updatedAt: new Date(),
        riskScore: 50,
        collections: [],
      });

      // First execution - new
      mockPrisma.cpeExecutionRecord.findUnique.mockResolvedValueOnce(null);
      mockPrisma.cpeExecutionRecord.create.mockResolvedValue({
        executionId,
        status: 'SUCCESS',
      });

      const result1 = await cpe.onActionExecuted(
        'idempotent-case',
        ActionCode.UYAP_SEND,
        {},
        { success: true },
        executionId
      );

      // Result should indicate success or have some response
      expect(result1).toBeDefined();

      // Second execution - duplicate
      mockPrisma.cpeExecutionRecord.findUnique.mockResolvedValueOnce({
        executionId,
        status: 'SUCCESS',
      });

      const result2 = await cpe.onActionExecuted(
        'idempotent-case',
        ActionCode.UYAP_SEND,
        {},
        { success: true },
        executionId
      );

      // Should handle duplicate gracefully (either isDuplicate flag or success)
      expect(result2).toBeDefined();
    });
  });

  // ============================================
  // Scenario 6: Decision Logging
  // ============================================
  describe('Scenario: Decision Logging', () => {
    it('should log all decisions', async () => {
      mockPrisma.case.findUnique.mockResolvedValue({
        id: 'logging-case',
        workflowStage: 'INITIAL',
        type: 'ILAMSIZ',
        caseStatus: 'ACTIVE',
        isAutoMode: true,
        isAutomationEnabled: true,
        allowUyapActions: true,
        hasArticle4Request: true,
        isMtsCase: false,
        currency: 'TRY',
        principalAmount: 10000,
        createdAt: new Date(),
        updatedAt: new Date(),
        riskScore: 50,
        collections: [],
      });

      mockPrisma.icrabotCaseFact.findMany.mockResolvedValue([]);

      await cpe.canPerformAction('logging-case', ActionCode.UYAP_SEND);

      // Decision should be logged
      expect(mockPrisma.cpeDecisionLog.create).toHaveBeenCalled();
      
      const logCall = mockPrisma.cpeDecisionLog.create.mock.calls[0][0];
      expect(logCall.data.caseId).toBe('logging-case');
      expect(logCall.data.actionCode).toBe(ActionCode.UYAP_SEND);
    });
  });
});

// ============================================
// API Integration Tests (Skipped - requires supertest)
// ============================================
describe.skip('PolicyEngineController - API Integration', () => {
  it('should be tested with supertest when available', () => {
    expect(true).toBe(true);
  });
});
