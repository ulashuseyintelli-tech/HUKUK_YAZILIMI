/**
 * WorkflowEngine remaining tenant boundaries — calculateNextActionTime / updateCaseStage.
 *
 * GO-ANALYZE bulgusu: calculateNextActionTime `AutomationController.getNextAction()` üzerinden
 * doğrudan HTTP-erişilebilir bir CONFIRMED CROSS-TENANT IDOR idi (endpoint hiç tenantId almıyordu).
 * updateCaseStage ise bugün yalnız tenant-doğrulanmış `executeRule` zincirinden çağrılıyor
 * (INTERNAL TRUSTED CALL CHAIN), ama method-level guard'ı yoktu (DEFENSE-IN-DEPTH GAP).
 * Fix: her iki metot da buildContext/createEnforcementAction ile aynı desen — `Case.findFirst
 * ({id, tenantId})` + generic NotFoundException (enumeration yok).
 */

import { NotFoundException } from '@nestjs/common';
import { WorkflowEngine } from '../workflow-engine.service';

const validCaseRow = {
  id: 'case1',
  tenantId: 'tenant1',
  workflowStage: 'ENFORCEMENT',
  notifications: [],
};

function buildEngine(caseFindFirstResult: any) {
  const prisma: any = {
    case: {
      findFirst: jest.fn().mockResolvedValue(caseFindFirstResult),
      update: jest.fn(),
    },
    caseLifecycle: {
      create: jest.fn(),
    },
    $transaction: jest.fn().mockResolvedValue([{}, {}]),
  };
  const expenseRequestService: any = {
    createStageExpenseSet: jest.fn().mockResolvedValue(undefined),
  };
  const svc = new WorkflowEngine(prisma, {} as any, expenseRequestService);
  return { svc, prisma, expenseRequestService };
}

describe('WorkflowEngine.calculateNextActionTime tenant guard', () => {
  it('same-tenant: doğru caseId + tenantId ile nextActionAt doğru döner', async () => {
    const { svc, prisma } = buildEngine(validCaseRow); // ENFORCEMENT → +1 gün

    const result = await svc.calculateNextActionTime('case1', 'tenant1');

    expect(result).toBeInstanceOf(Date);
    expect(prisma.case.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'case1', tenantId: 'tenant1' } }),
    );
  });

  it('cross-tenant: başka tenanta ait caseId için generic NotFoundException fırlatılır (enumeration yok)', async () => {
    const { svc } = buildEngine(null); // findFirst({id, tenantId}) hiçbir şey bulamaz

    await expect(svc.calculateNextActionTime('case1', 'other-tenant')).rejects.toThrow(
      NotFoundException,
    );
    await expect(svc.calculateNextActionTime('case1', 'other-tenant')).rejects.toThrow(
      'Dosya bulunamadı',
    );
  });

  it('non-existent: var olmayan caseId için de aynı generic NotFoundException fırlatılır (INV-4)', async () => {
    const { svc } = buildEngine(null);

    await expect(svc.calculateNextActionTime('nonexistent', 'tenant1')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('caseId ile ARANMAZ; sorgu her zaman id+tenantId ikilisiyle (composite) yapılır', async () => {
    const { svc, prisma } = buildEngine(validCaseRow);

    await svc.calculateNextActionTime('case1', 'tenant1');

    const call = prisma.case.findFirst.mock.calls[0][0];
    expect(call.where).toEqual({ id: 'case1', tenantId: 'tenant1' });
    expect(Object.keys(call.where)).toHaveLength(2);
  });

  it('response contract korunur: Case bulunup workflowStage eşleşmezse hâlâ null döner (Exception değil)', async () => {
    const { svc } = buildEngine({ ...validCaseRow, workflowStage: 'OBJECTION' });

    const result = await svc.calculateNextActionTime('case1', 'tenant1');

    expect(result).toBeNull();
  });
});

describe('WorkflowEngine.updateCaseStage tenant guard', () => {
  it('same-tenant: stage update + lifecycle kaydı PASS (tek $transaction içinde)', async () => {
    const { svc, prisma } = buildEngine({ tenantId: 'tenant1', clientId: null });

    await svc.updateCaseStage('case1', 'tenant1', 'ENFORCEMENT' as any, 'test reason');

    expect(prisma.case.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'case1', tenantId: 'tenant1' } }),
    );
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    const txArg = prisma.$transaction.mock.calls[0][0];
    expect(Array.isArray(txArg)).toBe(true);
    expect(txArg).toHaveLength(2); // Case.update + CaseLifecycle.create — atomik davranış korunur
  });

  it('cross-tenant: generic NotFoundException fırlatılır ve mutation GERÇEKLEŞMEZ ($transaction hiç çağrılmaz)', async () => {
    const { svc, prisma } = buildEngine(null); // findFirst({id, tenantId}) hiçbir şey bulamaz

    await expect(
      svc.updateCaseStage('case1', 'other-tenant', 'ENFORCEMENT' as any, 'test reason'),
    ).rejects.toThrow(NotFoundException);
    await expect(
      svc.updateCaseStage('case1', 'other-tenant', 'ENFORCEMENT' as any, 'test reason'),
    ).rejects.toThrow('Dosya bulunamadı');

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.case.update).not.toHaveBeenCalled();
    expect(prisma.caseLifecycle.create).not.toHaveBeenCalled();
  });

  it('non-existent: var olmayan caseId için de aynı generic NotFoundException fırlatılır', async () => {
    const { svc } = buildEngine(null);

    await expect(
      svc.updateCaseStage('nonexistent', 'tenant1', 'ENFORCEMENT' as any, 'test reason'),
    ).rejects.toThrow(NotFoundException);
  });

  it('caseId ile ARANMAZ; sorgu her zaman id+tenantId ikilisiyle (composite) yapılır', async () => {
    const { svc, prisma } = buildEngine({ tenantId: 'tenant1', clientId: null });

    await svc.updateCaseStage('case1', 'tenant1', 'ENFORCEMENT' as any, 'test reason');

    const call = prisma.case.findFirst.mock.calls[0][0];
    expect(call.where).toEqual({ id: 'case1', tenantId: 'tenant1' });
    expect(Object.keys(call.where)).toHaveLength(2);
  });
});

describe('WorkflowEngine.executeRule → updateCaseStage tenant propagation', () => {
  it('executeRule, context.tenantId değerini updateCaseStage çağrısına aktarır', async () => {
    const { prisma } = buildEngine({
      id: 'case1',
      tenantId: 'tenant1',
      workflowStage: 'PAYMENT_ORDER',
      principalAmount: 1000,
      isAutoMode: true,
      formType: null,
      collections: [],
      debtors: [],
      lifecycleEvents: [],
      enforcementActions: [],
      notifications: [],
    });
    prisma.decisionLog = { create: jest.fn().mockResolvedValue({}) };
    const ruleEngine: any = {
      evaluateRules: jest.fn().mockResolvedValue([
        {
          shouldTrigger: true,
          action: 'UPDATE_STAGE',
          reason: 'otomatik geçiş',
          nextStage: 'ENFORCEMENT',
        },
      ]),
      checkNotificationExpiry: jest.fn().mockResolvedValue(null),
    };
    const svcWithRuleEngine = new (WorkflowEngine as any)(
      prisma,
      ruleEngine,
      { createStageExpenseSet: jest.fn().mockResolvedValue(undefined) },
    );

    await svcWithRuleEngine.processCase('case1', 'tenant1');

    // findFirst: buildContext(1) + processCase ikinci sorgu(1) + updateCaseStage(1) = 3
    const updateCaseStageCall = prisma.case.findFirst.mock.calls.find(
      (call: any[]) => call[0].select?.tenantId === true,
    );
    expect(updateCaseStageCall).toBeDefined();
    expect(updateCaseStageCall![0].where).toEqual({ id: 'case1', tenantId: 'tenant1' });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });
});
