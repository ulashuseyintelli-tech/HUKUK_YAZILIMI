/**
 * OD-3 tenant guard — çağıran zincirinin tenantId aktarımı.
 *
 * WorkflowEngine.buildContext/processCase artık tenantId zorunlu alıyor (bkz.
 * workflow-engine-build-context-tenant-guard.spec.ts). Bu dosya, imza değişikliğinin tüm
 * çağıranlarda (controller endpoint'leri + cron job'ları + manuel tetikleme) doğru tenantId
 * ile tamamlandığını kanıtlar — guard'ın kendisi doğru olsa da çağıran yanlış/eksik tenantId
 * geçerse etkisiz kalır.
 */

import { AutomationController } from '../automation.controller';
import { AutomationService } from '../automation.service';

describe('AutomationController tenant guard propagation (OD-3)', () => {
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
