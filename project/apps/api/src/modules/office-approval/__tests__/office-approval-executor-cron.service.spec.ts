/** @jest-environment node */
import 'reflect-metadata';
import { ConflictException } from '@nestjs/common';
import { OfficeApprovalExecutorCronService } from '../office-approval-executor-cron.service';

/**
 * P4-5B — OfficeApprovalExecutorCronService (config-gated automation cron) birim testleri.
 * KESİN (Ulaş kilidi): config-gated default-OFF · EVERY_30_MINUTES · PASS-1 reconcile(RUNNING)→PASS-2 scan(NOT_RUN) ·
 *  cross-tenant · SIRALI · per-row try/catch (tick düşmez) · FAILED RETRY YOK (scan yalnız NOT_RUN) · summary-log · route YOK.
 */

const ORIG = process.env.OFFICE_APPROVAL_EXECUTOR_ENABLED;
const ORIG_BATCH = process.env.OFFICE_APPROVAL_EXECUTOR_BATCH_SIZE;
afterEach(() => {
  if (ORIG === undefined) delete process.env.OFFICE_APPROVAL_EXECUTOR_ENABLED;
  else process.env.OFFICE_APPROVAL_EXECUTOR_ENABLED = ORIG;
  if (ORIG_BATCH === undefined) delete process.env.OFFICE_APPROVAL_EXECUTOR_BATCH_SIZE;
  else process.env.OFFICE_APPROVAL_EXECUTOR_BATCH_SIZE = ORIG_BATCH;
});
const enable = () => { process.env.OFFICE_APPROVAL_EXECUTOR_ENABLED = 'true'; };
const disable = () => { delete process.env.OFFICE_APPROVAL_EXECUTOR_ENABLED; };

const mk = (over: any = {}) => {
  const executor: any = {
    execute: jest.fn().mockResolvedValue({ executionStatus: 'SUCCEEDED' }),
    executeRetry: jest.fn().mockResolvedValue({ executionStatus: 'SUCCEEDED' }),
    reconcileStuckRunning: jest.fn().mockResolvedValue({ executionStatus: 'STALE' }),
    ...(over.executor || {}),
  };
  const prisma: any = {
    officeApprovalRequest: { findMany: jest.fn().mockResolvedValue([]) },
    ...(over.prisma || {}),
  };
  const svc = new OfficeApprovalExecutorCronService(prisma, executor);
  return { svc, executor, prisma };
};
// findMany'i 3 pass için ayrı döndüren yardımcı (1=RUNNING reconcile, 2=NOT_RUN scan, 3=FAILED retry).
const threePass = (runningRows: any[], pendingRows: any[], failedRows: any[] = []) => ({
  prisma: {
    officeApprovalRequest: {
      findMany: jest.fn().mockResolvedValueOnce(runningRows).mockResolvedValueOnce(pendingRows).mockResolvedValueOnce(failedRows),
    },
  },
});
// Geriye dönük: PASS-FAILED boş (eski 2-pass testleri için).
const twoPass = (runningRows: any[], pendingRows: any[]) => threePass(runningRows, pendingRows, []);

describe('P4-5B cron — config gate (default OFF)', () => {
  it("flag-off (default) → no-op: prisma'ya HİÇ dokunmaz, enabled:false sıfırlar", async () => {
    disable();
    const { svc, executor, prisma } = mk();
    const res = await svc.runSweep();
    expect(res).toEqual({ enabled: false, scanned: 0, applied: 0, failed: 0, stale: 0, reconciled: 0, retried: 0 });
    expect(prisma.officeApprovalRequest.findMany).not.toHaveBeenCalled();
    expect(executor.execute).not.toHaveBeenCalled();
    expect(executor.executeRetry).not.toHaveBeenCalled();
    expect(executor.reconcileStuckRunning).not.toHaveBeenCalled();
  });

  it('handleCron → runSweep delegasyonu', async () => {
    disable();
    const { svc } = mk();
    const spy = jest.spyOn(svc, 'runSweep');
    await svc.handleCron();
    expect(spy).toHaveBeenCalledTimes(1);
  });
});

describe('P4-5B cron — scanner + pass ordering (flag ON)', () => {
  it('PASS-1 RUNNING reconcile → PASS-2 NOT_RUN scan; WHERE doğru; FAILED ENUMERATE EDİLMEZ; batch take=50; cross-tenant', async () => {
    enable();
    const { svc, prisma, executor } = mk(twoPass([{ id: 'run1', tenantId: 'tA' }], [{ id: 'pen1', tenantId: 'tB' }]));
    await svc.runSweep();
    const calls = prisma.officeApprovalRequest.findMany.mock.calls;
    // PASS-1 = RUNNING
    expect(calls[0][0].where).toMatchObject({
      status: { in: ['APPROVED', 'APPROVED_WITH_CHANGES'] },
      executionStatus: 'RUNNING',
      actionCode: 'CHANGE_STATUS',
      targetType: 'LegalCase',
    });
    expect(calls[0][0].take).toBe(50);
    expect(calls[0][0].select).toEqual({ id: true, tenantId: true }); // yalnız id+tenantId forward
    // P4-5C-1 precise age-gate: yalnız stuck (runningStartedAt<=cutoff) veya pre-migration orphan (null)
    expect(calls[0][0].where.OR).toEqual([
      { runningStartedAt: { lte: expect.any(Date) } },
      { runningStartedAt: null },
    ]);
    // PASS-2 = NOT_RUN (FAILED DEĞİL → R1=A)
    expect(calls[1][0].where.executionStatus).toBe('NOT_RUN');
    expect(calls[1][0].where.executionStatus).not.toBe('FAILED');
    // reconcile PASS-1, scan'den ÖNCE
    const reconcileOrder = executor.reconcileStuckRunning.mock.invocationCallOrder[0];
    const executeOrder = executor.execute.mock.invocationCallOrder[0];
    expect(reconcileOrder).toBeLessThan(executeOrder);
    // her satır KENDİ tenantId'siyle (cross-tenant) + stuckCutoff (Date); cron-actor SYSTEM_CRON
    expect(executor.reconcileStuckRunning).toHaveBeenCalledWith('run1', 'tA', expect.any(Date));
    expect(executor.execute).toHaveBeenCalledWith('pen1', 'tB', 'SYSTEM_CRON');
  });

  it('counts: applied(SUCCEEDED) / failed(FAILED) / stale(STALE) / reconciled + summary döner', async () => {
    enable();
    const { svc, executor } = mk({
      ...twoPass([{ id: 'run1', tenantId: 't' }], [
        { id: 'a', tenantId: 't' }, { id: 'b', tenantId: 't' }, { id: 'c', tenantId: 't' },
      ]),
      executor: {
        reconcileStuckRunning: jest.fn().mockResolvedValue({ executionStatus: 'STALE' }),
        execute: jest.fn()
          .mockResolvedValueOnce({ executionStatus: 'SUCCEEDED' })
          .mockResolvedValueOnce({ executionStatus: 'FAILED' })
          .mockResolvedValueOnce({ executionStatus: 'STALE' }),
      },
    });
    const res = await svc.runSweep();
    expect(res).toEqual({ enabled: true, scanned: 3, applied: 1, failed: 1, stale: 1, reconciled: 1, retried: 0 });
    expect(executor.executeRetry).not.toHaveBeenCalled(); // FAILED pass boş → retry yok
  });

  it('PASS-FAILED: FAILED + retryCount<MAX + backoff-elapsed → executeRetry; exhausted/backoff-bekleyen ENUMERATE/atla', async () => {
    enable();
    const old = new Date(Date.now() - 90 * 60_000); // 90dk önce → her retryCount için backoff dolmuş
    const fresh = new Date(Date.now() - 1 * 60_000); // 1dk önce → backoff dolmamış (base 15dk)
    const { svc, prisma, executor } = mk({
      ...threePass([], [], [
        { id: 'f1', tenantId: 'tA', retryCount: 1, lastRetryAt: old }, // eligible
        { id: 'f2', tenantId: 'tB', retryCount: 1, lastRetryAt: fresh }, // backoff dolmadı → atla
      ]),
      executor: {
        execute: jest.fn(),
        reconcileStuckRunning: jest.fn(),
        executeRetry: jest.fn().mockResolvedValue({ executionStatus: 'SUCCEEDED' }),
      },
    });
    const res = await svc.runSweep();
    // PASS-FAILED query: FAILED + retryCount<MAX(3) + (lastRetryAt<=now-base ∨ null) — exhausted (>=MAX) ENUMERATE EDİLMEZ
    const failedCall = prisma.officeApprovalRequest.findMany.mock.calls[2][0];
    expect(failedCall.where.executionStatus).toBe('FAILED');
    expect(failedCall.where.retryCount).toEqual({ lt: 3 });
    expect(failedCall.where.OR).toEqual([{ lastRetryAt: { lte: expect.any(Date) } }, { lastRetryAt: null }]);
    // yalnız f1 (backoff dolmuş) retry edildi; f2 (taze) atlandı
    expect(executor.executeRetry).toHaveBeenCalledTimes(1);
    expect(executor.executeRetry).toHaveBeenCalledWith('f1', 'tA', 'SYSTEM_CRON', 3);
    expect(res.retried).toBe(1);
    expect(res.applied).toBe(1); // retry SUCCEEDED → applied'e katılır
  });

  it('PASS-FAILED per-row isolation: bir executeRetry throw → diğeri devam, tick DÜŞMEZ', async () => {
    enable();
    const old = new Date(Date.now() - 90 * 60_000);
    const { svc, executor } = mk({
      ...threePass([], [], [
        { id: 'f1', tenantId: 't', retryCount: 1, lastRetryAt: old },
        { id: 'f2', tenantId: 't', retryCount: 2, lastRetryAt: old },
      ]),
      executor: {
        execute: jest.fn(),
        reconcileStuckRunning: jest.fn(),
        executeRetry: jest.fn()
          .mockRejectedValueOnce(new ConflictException('yarış'))
          .mockResolvedValueOnce({ executionStatus: 'SUCCEEDED' }),
      },
    });
    const res = await svc.runSweep(); // throw etmemeli
    expect(res.retried).toBe(2); // ikisi de denendi
    expect(res.applied).toBe(1); // f2 başarılı (f1 atlandı)
  });
});

describe('P4-5B cron — per-row isolation (tick ASLA düşmez; Ulaş ek-kilidi)', () => {
  it('scan: bir execute() throw → diğer satırlar işlenir, runSweep throw ETMEZ', async () => {
    enable();
    const { svc, executor } = mk({
      ...twoPass([], [
        { id: 'a', tenantId: 't' }, { id: 'b', tenantId: 't' }, { id: 'c', tenantId: 't' },
      ]),
      executor: {
        reconcileStuckRunning: jest.fn(),
        execute: jest.fn()
          .mockResolvedValueOnce({ executionStatus: 'SUCCEEDED' })
          .mockRejectedValueOnce(new ConflictException('race: NOT_RUN değil'))
          .mockResolvedValueOnce({ executionStatus: 'SUCCEEDED' }),
      },
    });
    const res = await svc.runSweep(); // throw etmemeli
    expect(res.scanned).toBe(3);
    expect(res.applied).toBe(2); // a + c (b atlandı)
    expect(executor.execute).toHaveBeenCalledTimes(3);
  });

  it('reconcile: bir reconcile() throw (idempotent CAS conflict) → diğerleri devam, runSweep throw ETMEZ', async () => {
    enable();
    const { svc } = mk({
      ...twoPass([{ id: 'r1', tenantId: 't' }, { id: 'r2', tenantId: 't' }], []),
      executor: {
        execute: jest.fn(),
        reconcileStuckRunning: jest.fn()
          .mockRejectedValueOnce(new ConflictException('count=0 (canlı executor kazandı)'))
          .mockResolvedValueOnce({ executionStatus: 'SUCCEEDED' }),
      },
    });
    const res = await svc.runSweep();
    expect(res.reconciled).toBe(1); // yalnız r2 (r1 atlandı)
  });
});

describe('P4-5B cron — schedule metadata + route-yok', () => {
  it('handleCron @Cron-decorated (schedule metadata var) + cron service @Controller route DEĞİL', () => {
    const keys = (Reflect.getMetadataKeys(OfficeApprovalExecutorCronService.prototype.handleCron) || []).map(String);
    expect(keys.some((k) => k.toUpperCase().includes('SCHEDULE') || k.toUpperCase().includes('CRON'))).toBe(true);
    expect(Reflect.getMetadata('path', OfficeApprovalExecutorCronService)).toBeUndefined();
  });
});
