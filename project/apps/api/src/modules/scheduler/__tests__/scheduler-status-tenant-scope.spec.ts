/**
 * KI-049 / F02-D — `GET /scheduler/status` sayımlarının KİRACI kapsamı (saf; DB yok).
 *
 * Kanıtlanan sözleşme:
 *  1. `getStatus({ tenantId })` yedi sayımın HER BİRİNİ `where.tenantId = <aktörün kiracısı>` ile yapar;
 *     kiracısız (global) sayım yoktur.
 *  2. Controller: tenantId'siz aktör 403 (servis çağrılmaz); tenantId'li aktör servisi kendi kiracısıyla çağırır.
 */
import { ForbiddenException } from '@nestjs/common';
import { SchedulerController } from '../scheduler.controller';
import { SchedulerService } from '../scheduler.service';

const DELEGATES = ['case', 'uyapRequestLog', 'task', 'thirdParty', 'externalCase', 'tebligat'] as const;

const buildPrisma = () =>
  Object.fromEntries(DELEGATES.map((d) => [d, { count: jest.fn().mockResolvedValue(0) }])) as Record<
    (typeof DELEGATES)[number],
    { count: jest.Mock }
  >;

describe('KI-049 — SchedulerService.getStatus kiracı kapsamı', () => {
  it('yedi sayımın hepsi where.tenantId = aktörün kiracısı; kiracısız sayım YOK', async () => {
    const prisma = buildPrisma();
    const svc = new SchedulerService(prisma as any, {} as any, {} as any, {} as any, {} as any, {} as any);
    const status = await svc.getStatus({ tenantId: 'tenant-A' });

    const calls = DELEGATES.flatMap((d) => prisma[d].count.mock.calls.map((c) => ({ delegate: d, where: c[0]?.where })));
    expect(calls).toHaveLength(7); // case×2, uyapRequestLog, task, thirdParty, externalCase, tebligat
    for (const c of calls) {
      expect(c.where).toBeDefined();
      expect(c.where.tenantId).toBe('tenant-A');
    }
    expect(status).toMatchObject({
      pendingPaymentOrders: 0, activeMtsCases: 0, failedUyapRequests: 0, upcomingTasks: 0,
      expiredIhbarnames: 0, pendingExternalCases: 0, pendingTebligat: 0,
    });
    expect(typeof status.lastCheck).toBe('string');
  });
});

describe('KI-049 — SchedulerController.getStatus', () => {
  it('tenantId yoksa 403 SCHEDULER_STATUS_DENIED_NO_TENANT; servis ÇAĞRILMAZ', async () => {
    const service = { getStatus: jest.fn() };
    const ctrl = new SchedulerController(service as any);
    await expect(ctrl.getStatus({ user: { id: 'u1', role: 'ADMIN' } })).rejects.toBeInstanceOf(ForbiddenException);
    await expect(ctrl.getStatus({})).rejects.toMatchObject({ response: { reasonCode: 'SCHEDULER_STATUS_DENIED_NO_TENANT' } });
    expect(service.getStatus).not.toHaveBeenCalled();
  });

  it('tenantId varsa servis YALNIZ aktörün kiracısıyla çağrılır', async () => {
    const service = { getStatus: jest.fn().mockResolvedValue({ ok: true }) };
    const ctrl = new SchedulerController(service as any);
    await ctrl.getStatus({ user: { id: 'u1', tenantId: 'tenant-B', role: 'VIEWER' } });
    expect(service.getStatus).toHaveBeenCalledWith({ tenantId: 'tenant-B' });
  });
});
