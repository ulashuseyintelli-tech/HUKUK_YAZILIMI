/**
 * RFA-007 — createEnforcementAction status-bazlı duplicate guard.
 *
 * Cron (EVERY_5_MINUTES) zaman-temelli kuralları tetikleyince aynı caseId+type için PENDING action
 * her döngüde yeniden açılıyordu (guard yok, unique yok). Fix: AÇIK statü (PENDING/REQUESTED/
 * IN_PROGRESS/PARTIAL) varsa yeni açma; terminal (COMPLETED/FAILED/CANCELLED) → yeni serbest.
 * @@unique([caseId,type]) bilinçli YOK (meşru tekrarı kırardı).
 */

import { EnforcementStatus, EnforcementType } from '@prisma/client';
import { WorkflowEngine } from '../workflow-engine.service';

function build(findFirstResult: any) {
  const prisma = {
    enforcementAction: {
      findFirst: jest.fn().mockResolvedValue(findFirstResult),
      create: jest.fn().mockResolvedValue({ id: 'EA1' }),
    },
  };
  const svc = new WorkflowEngine(prisma as any, {} as any, {} as any);
  return { svc, prisma };
}

describe('RFA-007 createEnforcementAction status-guard', () => {
  it('açık action (PENDING) varsa → create ÇAĞRILMAZ (no-op)', async () => {
    const { svc, prisma } = build({ id: 'OPEN1', status: EnforcementStatus.PENDING });
    await svc.createEnforcementAction('case1', EnforcementType.BANK_INQUIRY);
    expect(prisma.enforcementAction.create).not.toHaveBeenCalled();
  });

  it('açık action yoksa (findFirst null) → create ÇAĞRILIR, status=PENDING', async () => {
    const { svc, prisma } = build(null);
    await svc.createEnforcementAction('case1', EnforcementType.BANK_INQUIRY);
    expect(prisma.enforcementAction.create).toHaveBeenCalledTimes(1);
    const data = prisma.enforcementAction.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ caseId: 'case1', type: EnforcementType.BANK_INQUIRY, status: EnforcementStatus.PENDING });
    expect(data.requestDate).toBeInstanceOf(Date);
  });

  it('guard predicate: findFirst caseId+type + status IN [PENDING,REQUESTED,IN_PROGRESS,PARTIAL]', async () => {
    const { svc, prisma } = build(null);
    await svc.createEnforcementAction('case1', EnforcementType.SALARY_SEIZURE);
    const where = prisma.enforcementAction.findFirst.mock.calls[0][0].where;
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
