/**
 * F02 — Manuel scheduler tetikleme: yetki politikasi (saf) + servis kapsam sozlesmesi (mock prisma).
 *
 *  - decideManualSchedulerRun: I02-R3 ile AYNI karar tablosu (VIEWER deny; elevated sart; ADMIN
 *    tek basina YETMEZ).
 *  - SchedulerService.runManual: yetki HERHANGI bir DB okumasi/yazimindan ONCE; ret = 403 +
 *    reasonCode + prisma'ya SIFIR cagri.
 *  - Manuel kapsam: secim where'i aktorun tenantId'sini TASIR; cron yolu (parametresiz) TASIMAZ.
 *  - HTTP global kapsam SECEMEZ: runManual alt metodlara asla `undefined` scope gecirmez.
 */
jest.mock(
  '@nestjs/schedule',
  () => ({
    Cron: () => () => undefined,
    CronExpression: {
      EVERY_DAY_AT_9AM: '0 9 * * *',
      EVERY_DAY_AT_10AM: '0 10 * * *',
      EVERY_DAY_AT_11AM: '0 11 * * *',
      EVERY_DAY_AT_MIDNIGHT: '0 0 * * *',
      EVERY_6_HOURS: '0 */6 * * *',
      EVERY_HOUR: '0 * * * *',
    },
  }),
  { virtual: true },
);

jest.mock(
  '@prisma/client',
  () => ({
    DueType: { PRINCIPAL: 'PRINCIPAL', NAFAKA: 'NAFAKA' },
  }),
  { virtual: true },
);

jest.mock('../../../prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

jest.mock('../../tebligat/tebligat.service', () => ({
  TebligatService: class TebligatService {},
}));

jest.mock('../../office-approval/office-approval.service', () => ({
  OfficeApprovalService: class OfficeApprovalService {},
}));

import { ForbiddenException } from '@nestjs/common';
import { SchedulerService } from '../scheduler.service';
import {
  decideManualSchedulerRun,
  MANUAL_SCHEDULER_OPERATIONS,
  SCHEDULER_MANUAL_RUN_REASON,
} from '../scheduler-manual-run-policy';
import { ACTIVE_TENANT_WHERE } from '../../tenant/tenant-lifecycle';

describe('F02 decideManualSchedulerRun — I02-R3 karar tablosu', () => {
  const R = SCHEDULER_MANUAL_RUN_REASON;
  it.each([
    [{ userId: undefined, role: 'ADMIN', elevatedAuthority: true }, false, R.NO_ACTOR],
    [{ userId: 'u', role: 'GARIP', elevatedAuthority: true }, false, R.UNKNOWN_ROLE],
    [{ userId: 'u', role: 'VIEWER', elevatedAuthority: true }, false, R.VIEWER_DENIED],
    [{ userId: 'u', role: 'USER', elevatedAuthority: false }, false, R.ELEVATED_DENIED],
    [{ userId: 'u', role: 'ADMIN', elevatedAuthority: false }, false, R.ELEVATED_DENIED], // ADMIN tek basina YETMEZ
    [{ userId: 'u', role: 'USER', elevatedAuthority: true }, true, R.ALLOWED],
    [{ userId: 'u', role: 'ADMIN', elevatedAuthority: true }, true, R.ALLOWED],
  ])('%j → allowed=%s reason=%s', (input, allowed, reason) => {
    expect(decideManualSchedulerRun(input as never)).toEqual({ allowed, reasonCode: reason });
  });

  it('manuel islem kumesi controller ile birebir (5 islem)', () => {
    expect([...MANUAL_SCHEDULER_OPERATIONS]).toEqual(['run-all', 'payment-orders', 'nafaka', 'mts', 'uyap-retry']);
  });
});

describe('F02 SchedulerService.runManual — kapsam ve yan-etki sozlesmesi', () => {
  const ACTOR = { userId: 'user-A', tenantId: 'tenant-A', role: 'USER' };

  function build(opts: { eligible: boolean }) {
    const prisma: any = {
      case: { findMany: jest.fn().mockResolvedValue([]), update: jest.fn() },
      task: { count: jest.fn().mockResolvedValue(0) },
      due: { create: jest.fn() },
      decisionLog: { create: jest.fn() },
      caseLifecycle: { create: jest.fn() },
    };
    const officeApproval = { isApproverEligible: jest.fn().mockResolvedValue(opts.eligible) };
    const service = new SchedulerService(
      prisma,
      { record: jest.fn() } as any,
      {} as any,
      { report: jest.fn().mockResolvedValue(undefined) } as any,
      {} as any,
      officeApproval as any,
    );
    return { service, prisma, officeApproval };
  }

  it('yetkisiz aktor: 403 + reasonCode, prisma\'ya SIFIR cagri (yan etki YOK)', async () => {
    const { service, prisma, officeApproval } = build({ eligible: false });
    await expect(service.runManual('nafaka', ACTOR)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.runManual('nafaka', ACTOR)).rejects.toMatchObject({
      response: { reasonCode: SCHEDULER_MANUAL_RUN_REASON.ELEVATED_DENIED },
    });
    expect(officeApproval.isApproverEligible).toHaveBeenCalledWith('user-A', 'tenant-A');
    expect(prisma.case.findMany).not.toHaveBeenCalled();
    expect(prisma.due.create).not.toHaveBeenCalled();
    expect(prisma.case.update).not.toHaveBeenCalled();
  });

  it('VIEWER: elevated olsa bile 403 (coarse gate), prisma\'ya cagri yok', async () => {
    const { service, prisma } = build({ eligible: true });
    await expect(service.runManual('run-all', { ...ACTOR, role: 'VIEWER' })).rejects.toMatchObject({
      response: { reasonCode: SCHEDULER_MANUAL_RUN_REASON.VIEWER_DENIED },
    });
    expect(prisma.case.findMany).not.toHaveBeenCalled();
  });

  it('aktor tenant\'i yoksa 403, isApproverEligible HIC cagrilmaz', async () => {
    const { service, prisma, officeApproval } = build({ eligible: true });
    await expect(service.runManual('nafaka', { ...ACTOR, tenantId: '' })).rejects.toBeInstanceOf(ForbiddenException);
    expect(officeApproval.isApproverEligible).not.toHaveBeenCalled();
    expect(prisma.case.findMany).not.toHaveBeenCalled();
  });

  it('yetkili manuel nafaka: secim where\'i AKTORUN tenantId\'sini tasir (global DEGIL)', async () => {
    const { service, prisma } = build({ eligible: true });
    await service.runManual('nafaka', ACTOR);
    expect(prisma.case.findMany).toHaveBeenCalledTimes(1);
    const where = prisma.case.findMany.mock.calls[0][0].where;
    expect(where.tenantId).toBe('tenant-A');
    expect(where.tenant).toEqual(ACTIVE_TENANT_WHERE); // aktiflik filtresi de KORUNUR
    expect(where.subCategory).toBe('NAFAKA');
  });

  it('yetkili manuel run-all: her alt secim aktorun tenant\'ina daraltilir', async () => {
    const { service, prisma } = build({ eligible: true });
    await service.runManual('run-all', ACTOR);
    // payment-orders + mts secimleri
    for (const call of prisma.case.findMany.mock.calls) {
      expect(call[0].where.tenantId).toBe('tenant-A');
    }
    expect(prisma.case.findMany).toHaveBeenCalledTimes(2);
    // upcoming-tasks sayimi
    expect(prisma.task.count.mock.calls[0][0].where.tenantId).toBe('tenant-A');
  });

  it('cron yolu (parametresiz) GLOBAL kalir: where tenantId TASIMAZ, ACTIVE filtresi durur', async () => {
    const { service, prisma } = build({ eligible: false }); // cron yolu yetki kapisindan GECMEZ
    await service.processNafakaPeriods();
    const where = prisma.case.findMany.mock.calls[0][0].where;
    expect(where).not.toHaveProperty('tenantId');
    expect(where.tenant).toEqual(ACTIVE_TENANT_WHERE);
  });

  it('cron run-all (parametresiz) de GLOBAL: alt secimler tenantId tasimaz', async () => {
    const { service, prisma } = build({ eligible: false });
    await service.runAllChecks();
    for (const call of prisma.case.findMany.mock.calls) {
      expect(call[0].where).not.toHaveProperty('tenantId');
    }
    expect(prisma.task.count.mock.calls[0][0].where).not.toHaveProperty('tenantId');
  });
});
