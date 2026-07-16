/**
 * SEC-TENANT-HARDEN-P01 (ICRABOT-TID-01) - getQueueStats tenant isolation.
 *
 * TaskOrchestratorService.getQueueStats ve onun sarmalayıcısı IcrabotService.getQueueStats
 * (dashboard'un da içinden çağırdığı) eskiden `tenantId?: string` ile opsiyonel/fail-open'dı
 * (`tenantId ? { tenantId } : {}`). Artık iki katmanda da tenantId zorunlu ve fail-closed.
 */
import { ForbiddenException } from '@nestjs/common';
import { TaskOrchestratorService } from '../task-orchestrator.service';
import { IcrabotService } from '../icrabot.service';

const TENANT = 'tenant-a';

function makeTaskOrchestrator() {
  const prisma = {
    botTask: {
      count: jest.fn().mockResolvedValue(0),
    },
  };
  const svc = new TaskOrchestratorService(prisma as any, {} as any, {} as any);
  return { svc, prisma };
}

describe('TaskOrchestratorService.getQueueStats — tenant-scope + fail-closed', () => {
  it('tenant ile scope eder — her count() çağrısında where.tenantId auth-tenant', async () => {
    const { svc, prisma } = makeTaskOrchestrator();

    await svc.getQueueStats(TENANT);

    expect(prisma.botTask.count).toHaveBeenCalledTimes(6);
    for (const call of prisma.botTask.count.mock.calls) {
      expect(call[0].where).toEqual(expect.objectContaining({ tenantId: TENANT }));
    }
  });

  it('tenantId olmadan (boş string) fail-closed reddeder, hiçbir sorgu çalışmaz', async () => {
    const { svc, prisma } = makeTaskOrchestrator();

    await expect(svc.getQueueStats('')).rejects.toThrow(ForbiddenException);
    expect(prisma.botTask.count).not.toHaveBeenCalled();
  });
});

describe('IcrabotService.getQueueStats — sarmalayıcı katman fail-closed', () => {
  function makeIcrabotService() {
    const taskOrchestrator = { getQueueStats: jest.fn().mockResolvedValue({ pending: 0 }) };
    const svc = new IcrabotService(
      {} as any,
      {} as any,
      taskOrchestrator as any,
      {} as any,
      {} as any,
    );
    return { svc, taskOrchestrator };
  }

  it('geçerli tenantId → alt katmana değişmeden iletir', async () => {
    const { svc, taskOrchestrator } = makeIcrabotService();

    await svc.getQueueStats(TENANT);

    expect(taskOrchestrator.getQueueStats).toHaveBeenCalledWith(TENANT);
  });

  it('tenantId olmadan (boş string) fail-closed reddeder, alt katman hiç çağrılmaz', async () => {
    const { svc, taskOrchestrator } = makeIcrabotService();

    await expect(svc.getQueueStats('')).rejects.toThrow(ForbiddenException);
    expect(taskOrchestrator.getQueueStats).not.toHaveBeenCalled();
  });
});
