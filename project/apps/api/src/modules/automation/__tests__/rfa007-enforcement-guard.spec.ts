/**
 * RFA-007 — createEnforcementAction status-bazlı duplicate guard.
 *
 * Cron (EVERY_5_MINUTES) zaman-temelli kuralları tetikleyince aynı caseId+type için PENDING action
 * her döngüde yeniden açılıyordu (guard yok, unique yok). Fix: AÇIK statü (PENDING/REQUESTED/
 * IN_PROGRESS/PARTIAL) varsa yeni açma; terminal (COMPLETED/FAILED/CANCELLED) → yeni serbest.
 * @@unique([caseId,type]) bilinçli YOK (meşru tekrarı kırardı).
 *
 * PR-EA-4: guarded write-path — input contract'ı tenantId zorunlu hale getirdi; guard tenant-scoped
 * oldu (semantik değişmedi, yalnız tenantId filtreye eklendi).
 */

import { EnforcementStatus, EnforcementType } from '@prisma/client';
import { WorkflowEngine } from '../workflow-engine.service';

function build(opts: { findFirstResult: any; caseRow?: any }) {
  const { findFirstResult, caseRow = { id: 'case1' } } = opts;
  const prisma: any = {
    case: {
      findFirst: jest.fn().mockResolvedValue(caseRow),
    },
    caseDebtor: {
      findFirst: jest.fn(),
    },
    enforcementAction: {
      findFirst: jest.fn().mockResolvedValue(findFirstResult),
      create: jest.fn().mockResolvedValue({ id: 'EA1' }),
    },
  };
  prisma.$transaction = jest.fn((cb: any) => cb(prisma));
  const svc = new WorkflowEngine(prisma as any, {} as any, {} as any);
  return { svc, prisma };
}

describe('RFA-007 createEnforcementAction status-guard', () => {
  it('açık action (PENDING) varsa → create ÇAĞRILMAZ (no-op)', async () => {
    const { svc, prisma } = build({ findFirstResult: { id: 'OPEN1', status: EnforcementStatus.PENDING } });
    await svc.createEnforcementAction({ tenantId: 'tenant1', caseId: 'case1', type: EnforcementType.BANK_INQUIRY });
    expect(prisma.enforcementAction.create).not.toHaveBeenCalled();
  });

  it('açık action yoksa (findFirst null) → create ÇAĞRILIR, status=PENDING', async () => {
    const { svc, prisma } = build({ findFirstResult: null });
    await svc.createEnforcementAction({ tenantId: 'tenant1', caseId: 'case1', type: EnforcementType.BANK_INQUIRY });
    expect(prisma.enforcementAction.create).toHaveBeenCalledTimes(1);
    const data = prisma.enforcementAction.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      tenantId: 'tenant1',
      caseId: 'case1',
      caseDebtorId: null,
      type: EnforcementType.BANK_INQUIRY,
      status: EnforcementStatus.PENDING,
    });
    expect(data.requestDate).toBeInstanceOf(Date);
  });

  it('guard predicate: findFirst tenantId+caseId+type + status IN [PENDING,REQUESTED,IN_PROGRESS,PARTIAL]', async () => {
    const { svc, prisma } = build({ findFirstResult: null });
    await svc.createEnforcementAction({ tenantId: 'tenant1', caseId: 'case1', type: EnforcementType.SALARY_SEIZURE });
    const where = prisma.enforcementAction.findFirst.mock.calls[0][0].where;
    expect(where.tenantId).toBe('tenant1');
    expect(where.caseId).toBe('case1');
    expect(where.type).toBe(EnforcementType.SALARY_SEIZURE);
    expect(where.status.in).toEqual([
      EnforcementStatus.PENDING,
      EnforcementStatus.REQUESTED,
      EnforcementStatus.IN_PROGRESS,
      EnforcementStatus.PARTIAL,
    ]);
    // terminal statüler (COMPLETED/FAILED/CANCELLED) açık-sette DEĞİL → yeni create'i bloklamaz
    expect(where.status.in).not.toContain(EnforcementStatus.COMPLETED);
    expect(where.status.in).not.toContain(EnforcementStatus.FAILED);
    expect(where.status.in).not.toContain(EnforcementStatus.CANCELLED);
  });
});
