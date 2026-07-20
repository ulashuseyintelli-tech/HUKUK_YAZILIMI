/**
 * OD-3 tenant guard — çağıran zincirinin tenantId aktarımı.
 *
 * WorkflowEngine.buildContext/processCase artık tenantId zorunlu alıyor (bkz.
 * workflow-engine-build-context-tenant-guard.spec.ts). Bu dosya, imza değişikliğinin tüm
 * çağıranlarda (controller endpoint'leri + cron job'ları + manuel tetikleme) doğru tenantId
 * ile tamamlandığını kanıtlar — guard'ın kendisi doğru olsa da çağıran yanlış/eksik tenantId
 * geçerse etkisiz kalır.
 */

import { ForbiddenException, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { AutomationController } from '../automation.controller';
import { AutomationService } from '../automation.service';

describe('AutomationController tenant guard propagation (OD-3)', () => {
  it('GET /automation/stats — JWT kullanıcısının tenantId\'si getAutomationStats\'a aktarılır (SEC-XTEN-AUTOMATION-STATS-01)', async () => {
    const automationService: any = {
      getAutomationStats: jest.fn().mockResolvedValue({ totalAutoCases: 0, totalAutoActions: 0, recentActions: [] }),
    };
    const controller = new AutomationController(automationService, {} as any);

    await controller.getStats({ tenantId: 'tenant1' });

    expect(automationService.getAutomationStats).toHaveBeenCalledWith('tenant1');
  });

  it('POST /automation/cases/:id/process — JWT kullanıcısının tenantId\'si processCaseManually\'e aktarılır', async () => {
    const automationService: any = {
      processCaseManually: jest.fn().mockResolvedValue(undefined),
    };
    const controller = new AutomationController(automationService, {} as any);

    await controller.processCase({ tenantId: 'tenant1' }, 'case1');

    expect(automationService.processCaseManually).toHaveBeenCalledWith('case1', 'tenant1');
  });

  it('GET /automation/cases/:id/context — JWT kullanıcısının tenantId\'si buildContext\'e aktarılır', async () => {
    const workflowEngine: any = { buildContext: jest.fn().mockResolvedValue({}) };
    const controller = new AutomationController({} as any, workflowEngine);

    await controller.getCaseContext({ tenantId: 'tenant1' }, 'case1');

    expect(workflowEngine.buildContext).toHaveBeenCalledWith('case1', 'tenant1');
  });

  it('GET /automation/cases/:id/next-action — JWT kullanıcısının tenantId\'si calculateNextActionTime\'a aktarılır', async () => {
    const workflowEngine: any = { calculateNextActionTime: jest.fn().mockResolvedValue(null) };
    const controller = new AutomationController({} as any, workflowEngine);

    await controller.getNextAction({ tenantId: 'tenant1' }, 'case1');

    expect(workflowEngine.calculateNextActionTime).toHaveBeenCalledWith('case1', 'tenant1');
  });
});

describe('AutomationController.toggleAutoMode tenant guard propagation (AUTOMATION-TOGGLE-TENANT-GUARD-R01)', () => {
  it('POST /automation/cases/:id/toggle-auto (enabled=true) — JWT tenantId\'si service\'e aktarılır, caseId/enabled değişmeden geçer, body\'den tenantId ALINMAZ', async () => {
    const automationService: any = {
      toggleAutoMode: jest.fn().mockResolvedValue(undefined),
    };
    const controller = new AutomationController(automationService, {} as any);

    const result = await controller.toggleAutoMode('tenant-from-jwt', 'case1', { enabled: true });

    expect(automationService.toggleAutoMode).toHaveBeenCalledWith('case1', true, 'tenant-from-jwt');
    expect(result).toEqual({ success: true, isAutoMode: true });
  });

  it('POST /automation/cases/:id/toggle-auto (enabled=false) — aynı propagation, ters yön', async () => {
    const automationService: any = {
      toggleAutoMode: jest.fn().mockResolvedValue(undefined),
    };
    const controller = new AutomationController(automationService, {} as any);

    const result = await controller.toggleAutoMode('tenant-from-jwt', 'case2', { enabled: false });

    expect(automationService.toggleAutoMode).toHaveBeenCalledWith('case2', false, 'tenant-from-jwt');
    expect(result).toEqual({ success: true, isAutoMode: false });
  });
});

describe('AutomationService.toggleAutoMode tenant isolation (AUTOMATION-TOGGLE-TENANT-GUARD-R01)', () => {
  const FIXED_NOW = new Date('2026-07-20T12:00:00.000Z');

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(FIXED_NOW);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('tenantId eksikse (falsy) ForbiddenException fırlatır, hiçbir prisma sorgusu ÇALIŞTIRILMAZ', async () => {
    const prisma: any = {
      case: { updateMany: jest.fn(), update: jest.fn() },
    };
    const svc = new AutomationService(prisma, {} as any, {} as any, {} as any);

    await expect(svc.toggleAutoMode('case1', true, undefined as any)).rejects.toThrow(ForbiddenException);

    expect(prisma.case.updateMany).not.toHaveBeenCalled();
    expect(prisma.case.update).not.toHaveBeenCalled();
  });

  it('enabled=true: updateMany doğru {id,tenantId} where + isAutoMode:true + nextActionAt:Date ile çağrılır (case.update KULLANILMAZ)', async () => {
    const prisma: any = {
      case: { updateMany: jest.fn().mockResolvedValue({ count: 1 }), update: jest.fn() },
    };
    const svc = new AutomationService(prisma, {} as any, {} as any, {} as any);

    await svc.toggleAutoMode('case1', true, 'tenantA');

    expect(prisma.case.updateMany).toHaveBeenCalledWith({
      where: { id: 'case1', tenantId: 'tenantA' },
      data: { isAutoMode: true, nextActionAt: FIXED_NOW },
    });
    expect(prisma.case.update).not.toHaveBeenCalled();
  });

  it('enabled=false: nextActionAt null olarak set edilir', async () => {
    const prisma: any = {
      case: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    };
    const svc = new AutomationService(prisma, {} as any, {} as any, {} as any);

    await svc.toggleAutoMode('case1', false, 'tenantA');

    expect(prisma.case.updateMany).toHaveBeenCalledWith({
      where: { id: 'case1', tenantId: 'tenantA' },
      data: { isAutoMode: false, nextActionAt: null },
    });
  });

  it('updateMany count=0 (var olmayan VEYA başka tenant\'a ait dosya) → generic NotFoundException, ayrım yapılmaz', async () => {
    const prisma: any = {
      case: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
    };
    const svc = new AutomationService(prisma, {} as any, {} as any, {} as any);

    await expect(svc.toggleAutoMode('foreign-or-missing-case', true, 'tenantA')).rejects.toThrow(NotFoundException);
  });

  it('updateMany count=1 → başarıyla resolve olur (hata fırlatmaz)', async () => {
    const prisma: any = {
      case: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    };
    const svc = new AutomationService(prisma, {} as any, {} as any, {} as any);

    await expect(svc.toggleAutoMode('case1', true, 'tenantA')).resolves.toBeUndefined();
  });

  it('updateMany count>1 (id primary key olduğundan yapısal olarak imkansız) → hard invariant hatası, sessizce başarı sayılmaz', async () => {
    const prisma: any = {
      case: { updateMany: jest.fn().mockResolvedValue({ count: 2 }) },
    };
    const svc = new AutomationService(prisma, {} as any, {} as any, {} as any);

    await expect(svc.toggleAutoMode('case1', true, 'tenantA')).rejects.toThrow(InternalServerErrorException);
  });
});

describe('AutomationService.getAutomationStats tenant scope (SEC-XTEN-AUTOMATION-STATS-01)', () => {
  it('tenantId verildiğinde her root sorgu tenantId ile filtrelenir', async () => {
    const prisma: any = {
      case: { count: jest.fn().mockResolvedValue(3) },
      decisionLog: {
        count: jest.fn().mockResolvedValue(7),
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    const svc = new AutomationService(prisma, {} as any, {} as any, {} as any);

    const result = await svc.getAutomationStats('tenantA');

    expect(prisma.case.count).toHaveBeenCalledWith({ where: { isAutoMode: true, tenantId: 'tenantA' } });
    expect(prisma.decisionLog.count).toHaveBeenCalledWith({
      where: { isAutomatic: true, case: { tenantId: 'tenantA' } },
    });
    expect(prisma.decisionLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { isAutomatic: true, case: { tenantId: 'tenantA' } },
      }),
    );
    expect(result).toEqual({ totalAutoCases: 3, totalAutoActions: 7, recentActions: [] });
  });

  it('tenantId eksikse (falsy) fail-closed: sıfır sonuç döner, hiçbir prisma sorgusu ÇALIŞTIRILMAZ', async () => {
    const prisma: any = {
      case: { count: jest.fn() },
      decisionLog: { count: jest.fn(), findMany: jest.fn() },
    };
    const svc = new AutomationService(prisma, {} as any, {} as any, {} as any);

    const result = await svc.getAutomationStats(undefined as any);

    expect(result).toEqual({ totalAutoCases: 0, totalAutoActions: 0, recentActions: [] });
    expect(prisma.case.count).not.toHaveBeenCalled();
    expect(prisma.decisionLog.count).not.toHaveBeenCalled();
    expect(prisma.decisionLog.findMany).not.toHaveBeenCalled();
  });
});

describe('AutomationService tenant guard propagation (OD-3)', () => {
  it('processCaseManually, tenantId parametresini processCase\'e aynen aktarır', async () => {
    const workflowEngine: any = { processCase: jest.fn().mockResolvedValue(undefined) };
    const svc = new AutomationService({} as any, workflowEngine, {} as any, {} as any);

    await svc.processCaseManually('case1', 'tenant1');

    expect(workflowEngine.processCase).toHaveBeenCalledWith('case1', 'tenant1');
  });

  it('processPendingCases (cron), her case için KENDİ satırından okunan tenantId\'yi aktarır', async () => {
    const prisma: any = {
      case: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'case1',
            tenantId: 'tenantA',
            allowUyapActions: true,
            hasArticle4Request: true,
            workflowStage: 'ENFORCEMENT',
          },
          {
            id: 'case2',
            tenantId: 'tenantB',
            allowUyapActions: true,
            hasArticle4Request: true,
            workflowStage: 'ENFORCEMENT',
          },
        ]),
        update: jest.fn(),
      },
      decisionLog: { create: jest.fn() },
    };
    const workflowEngine: any = {
      processCase: jest.fn().mockResolvedValue(undefined),
      calculateNextActionTime: jest.fn().mockResolvedValue(null),
    };
    const svc = new AutomationService(prisma, workflowEngine, {} as any, {} as any);

    await svc.processPendingCases();

    expect(workflowEngine.processCase).toHaveBeenNthCalledWith(1, 'case1', 'tenantA');
    expect(workflowEngine.processCase).toHaveBeenNthCalledWith(2, 'case2', 'tenantB');
    expect(workflowEngine.calculateNextActionTime).toHaveBeenNthCalledWith(1, 'case1', 'tenantA');
    expect(workflowEngine.calculateNextActionTime).toHaveBeenNthCalledWith(2, 'case2', 'tenantB');
  });

  it('checkNotificationExpiries (cron), notification.case.tenantId\'yi aktarır', async () => {
    const prisma: any = {
      notificationQueue: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'n1',
            caseId: 'case1',
            case: { isAutoMode: true, tenantId: 'tenantA' },
          },
        ]),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    const workflowEngine: any = { processCase: jest.fn().mockResolvedValue(undefined) };
    const svc = new AutomationService(prisma, workflowEngine, {} as any, {} as any);

    await svc.checkNotificationExpiries();

    expect(workflowEngine.processCase).toHaveBeenCalledWith('case1', 'tenantA');
  });

  it('checkNotificationExpiries, isAutoMode=false ise processCase\'i hiç çağırmaz (mevcut davranış korunur)', async () => {
    const prisma: any = {
      notificationQueue: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'n1',
            caseId: 'case1',
            case: { isAutoMode: false, tenantId: 'tenantA' },
          },
        ]),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    const workflowEngine: any = { processCase: jest.fn().mockResolvedValue(undefined) };
    const svc = new AutomationService(prisma, workflowEngine, {} as any, {} as any);

    await svc.checkNotificationExpiries();

    expect(workflowEngine.processCase).not.toHaveBeenCalled();
  });
});
