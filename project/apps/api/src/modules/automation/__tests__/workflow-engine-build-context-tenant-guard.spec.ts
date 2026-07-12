/**
 * OD-3 tenant guard — WorkflowEngine.buildContext / processCase.
 *
 * PR-EA-1 design doc'unun (enforcement-action-tenant-case-debtor-migration.md) OD-3 bulgusu:
 * buildContext(caseId) tenant'sız `Case.findUnique({id})` kullanıyordu; `GET /automation/cases/:id/context`
 * bu yolu doğrudan çağırıyordu (cross-tenant IDOR riski). Fix: PR-EA-4'te kurulan desenle aynı —
 * `Case.findFirst({id, tenantId})` + generic NotFoundException (enumeration yok).
 */

import { NotFoundException } from '@nestjs/common';
import { WorkflowEngine } from '../workflow-engine.service';

const validCaseRow = {
  id: 'case1',
  tenantId: 'tenant1',
  workflowStage: 'PAYMENT_ORDER',
  principalAmount: 1000,
  isAutoMode: false,
  formType: null,
  collections: [],
  debtors: [],
  lifecycleEvents: [],
  enforcementActions: [],
};

function buildEngine(caseFindFirstResult: any) {
  const prisma: any = {
    case: {
      findFirst: jest.fn().mockResolvedValue(caseFindFirstResult),
    },
  };
  const svc = new WorkflowEngine(prisma, {} as any, {} as any);
  return { svc, prisma };
}

describe('WorkflowEngine.buildContext tenant guard (OD-3)', () => {
  it('doğru tenant + doğru caseId ile context başarıyla oluşur', async () => {
    const { svc, prisma } = buildEngine(validCaseRow);

    const context = await svc.buildContext('case1', 'tenant1');

    expect(context.caseId).toBe('case1');
    expect(context.tenantId).toBe('tenant1');
    expect(prisma.case.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'case1', tenantId: 'tenant1' } }),
    );
  });

  it('başka tenanta ait caseId için generic NotFoundException fırlatılır (enumeration yok)', async () => {
    const { svc } = buildEngine(null); // findFirst({id, tenantId}) hiçbir şey bulamaz

    await expect(svc.buildContext('case1', 'other-tenant')).rejects.toThrow(
      NotFoundException,
    );
    await expect(svc.buildContext('case1', 'other-tenant')).rejects.toThrow(
      'Dosya bulunamadı',
    );
  });

  it('var olmayan caseId için de aynı generic NotFoundException fırlatılır (case var/yok ayrımı yapılmaz)', async () => {
    const { svc } = buildEngine(null);

    await expect(svc.buildContext('nonexistent', 'tenant1')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('caseId ile ARANMAZ; sorgu her zaman id+tenantId ikilisiyle (composite) yapılır', async () => {
    const { svc, prisma } = buildEngine(validCaseRow);

    await svc.buildContext('case1', 'tenant1');

    const call = prisma.case.findFirst.mock.calls[0][0];
    expect(call.where).toEqual({ id: 'case1', tenantId: 'tenant1' });
    expect(Object.keys(call.where)).toHaveLength(2);
  });
});

describe('WorkflowEngine.processCase tenant guard propagation (OD-3)', () => {
  it('processCase, tenantId parametresini buildContext ve ikinci Case sorgusuna aynen aktarır', async () => {
    const { svc, prisma } = buildEngine(validCaseRow); // isAutoMode=false → erken döner, ruleEngine'e gerek yok

    await svc.processCase('case1', 'tenant1');

    expect(prisma.case.findFirst).toHaveBeenCalledTimes(2);
    for (const call of prisma.case.findFirst.mock.calls) {
      expect(call[0].where).toEqual({ id: 'case1', tenantId: 'tenant1' });
    }
  });

  it('başka tenanta ait caseId ile processCase çağrılırsa istisna dışarı sızmaz (mevcut try/catch davranışı korunur)', async () => {
    const { svc } = buildEngine(null);

    await expect(svc.processCase('case1', 'other-tenant')).resolves.toBeUndefined();
  });
});
