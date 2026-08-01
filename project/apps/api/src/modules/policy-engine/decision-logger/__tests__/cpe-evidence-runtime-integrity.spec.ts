/**
 * UYAP-EVIDENCE-RUNTIME-INTEGRITY-R02 — CPE evidence bütünlüğü birim testleri
 *
 * Kapsam (owner §4 idempotency + §11 tenant invariants + §12 legal hold):
 *
 *  1. `CpeExecutionRecord` idempotency namespace'i TENANT BAŞINADIR.
 *     Önceki hâl: `executionId` GLOBAL `@unique` ve arama `findUnique({ executionId })`.
 *     `executionId` istemci gövdesinden gelir (`ActionExecutedDto`), dolayısıyla bir
 *     tenant başka bir tenant'ın execution kaydını okuyabiliyor ve kendi state
 *     transition'ı sessizce "duplicate" sayılıp ATLANABİLİYORDU.
 *
 *  2. Check-then-create yarışı: eşzamanlı aynı anahtar → ham Prisma P2002 sızmaz,
 *     kazananın kaydı okunup deterministik duplicate cevabı üretilir.
 *
 *  3. Retention yıkıcı yolu KAPALIDIR: "arşivler" diyip `deleteMany` çağıran ve
 *     `CpeDecisionLogArchive` modeli hiç var olmayan cron artık hiçbir kaydı silmez.
 *
 * Test seviyesi: saf birim (mock Prisma; DB/Nest container yok).
 */
import { Prisma } from '@prisma/client';
import { ExecutionRecorderService } from '../execution-recorder.service';
import {
  CPE_DECISION_LOG_DESTRUCTIVE_RETENTION_DISABLED,
  DecisionLogRetentionService,
} from '../decision-log-retention.service';
import { ActionCode } from '../../types/action-code.enum';

const TENANT_A = 'tenant-a';
const TENANT_B = 'tenant-b';
const EXEC_ID = 'exec-shared-1';

const uniqueViolation = () =>
  new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: 'test',
  });

const buildPrisma = () => ({
  cpeExecutionRecord: {
    findUnique: jest.fn().mockResolvedValue(null),
    create: jest.fn(),
    update: jest.fn().mockResolvedValue({}),
    findMany: jest.fn().mockResolvedValue([]),
    updateMany: jest.fn().mockResolvedValue({ count: 0 }),
  },
});

describe('UYAP-EVIDENCE-RUNTIME-INTEGRITY-R02 — CpeExecutionRecord idempotency', () => {
  let prisma: ReturnType<typeof buildPrisma>;
  let recorder: ExecutionRecorderService;

  beforeEach(() => {
    prisma = buildPrisma();
    recorder = new ExecutionRecorderService(prisma as any);
  });

  describe('tenant-scoped namespace', () => {
    it('duplicate araması composite (tenantId, executionId) ile yapılır — global DEĞİL', async () => {
      prisma.cpeExecutionRecord.create.mockResolvedValue({ id: 'r1' });

      await recorder.startExecution(TENANT_A, EXEC_ID, 'case-1', ActionCode.UYAP_SEND);

      expect(prisma.cpeExecutionRecord.findUnique).toHaveBeenCalledWith({
        where: { tenantId_executionId: { tenantId: TENANT_A, executionId: EXEC_ID } },
      });
      // Global arama deseni ARTIK KULLANILMAZ (cross-tenant okuma yolu).
      expect(prisma.cpeExecutionRecord.findUnique).not.toHaveBeenCalledWith({
        where: { executionId: EXEC_ID },
      });
    });

    it('tenant B, tenant A ile AYNI executionId kullanabilir (bağımsız namespace)', async () => {
      // Tenant A'nın kaydı mevcut; tenant B için composite arama NULL döner.
      prisma.cpeExecutionRecord.findUnique.mockImplementation(async (args: any) =>
        args.where.tenantId_executionId.tenantId === TENANT_A
          ? { id: 'r-a', tenantId: TENANT_A, status: 'SUCCESS' }
          : null,
      );
      prisma.cpeExecutionRecord.create.mockResolvedValue({ id: 'r-b', tenantId: TENANT_B });

      const a = await recorder.startExecution(TENANT_A, EXEC_ID, 'case-a', ActionCode.UYAP_SEND);
      const b = await recorder.startExecution(TENANT_B, EXEC_ID, 'case-b', ActionCode.UYAP_SEND);

      expect(a.isNew).toBe(false); // A için gerçek duplicate
      expect(b.isNew).toBe(true); // B için YENİ — state transition ATLANMAZ
      expect(b.record.tenantId).toBe(TENANT_B);
    });

    it('aynı tenant içinde aynı executionId duplicate sayılır', async () => {
      prisma.cpeExecutionRecord.findUnique.mockResolvedValue({
        id: 'r-a',
        tenantId: TENANT_A,
        status: 'SUCCESS',
      });

      const result = await recorder.startExecution(TENANT_A, EXEC_ID, 'case-a', ActionCode.UYAP_SEND);

      expect(result.isNew).toBe(false);
      expect(prisma.cpeExecutionRecord.create).not.toHaveBeenCalled();
    });
  });

  describe('fail-closed bağlam kontrolleri', () => {
    it.each(['', null, undefined])('tenantId=%p → atar, Prisma\'ya ULAŞILMAZ', async (bad) => {
      await expect(
        recorder.startExecution(bad as any, EXEC_ID, 'case-1', ActionCode.UYAP_SEND),
      ).rejects.toThrow(/cpe_execution_tenant_required/);
      expect(prisma.cpeExecutionRecord.findUnique).not.toHaveBeenCalled();
    });

    it.each(['', null, undefined])('executionId=%p → atar, Prisma\'ya ULAŞILMAZ', async (bad) => {
      await expect(
        recorder.startExecution(TENANT_A, bad as any, 'case-1', ActionCode.UYAP_SEND),
      ).rejects.toThrow(/cpe_execution_id_required/);
      expect(prisma.cpeExecutionRecord.findUnique).not.toHaveBeenCalled();
    });

    it.each([
      ['completeExecution', () => recorder.completeExecution('', EXEC_ID, { success: true } as any)],
      ['markAsNoop', () => recorder.markAsNoop('', EXEC_ID)],
      ['getExecution', () => recorder.getExecution('', EXEC_ID)],
      ['getExecutionHistory', () => recorder.getExecutionHistory('', 'case-1')],
      ['getPendingExecutions', () => recorder.getPendingExecutions('')],
      ['cleanupStaleExecutions', () => recorder.cleanupStaleExecutions('')],
    ])('%s tenantId olmadan çalışmaz', async (_name, call) => {
      await expect(call()).rejects.toThrow(/cpe_execution_tenant_required/);
    });

    it('mutasyonlar composite anahtarla hedeflenir (tenant-safe update)', async () => {
      await recorder.completeExecution(TENANT_A, EXEC_ID, { success: true } as any);
      await recorder.markAsNoop(TENANT_A, EXEC_ID);

      for (const call of prisma.cpeExecutionRecord.update.mock.calls) {
        expect(call[0].where).toEqual({
          tenantId_executionId: { tenantId: TENANT_A, executionId: EXEC_ID },
        });
      }
    });

    it('okuma yolları tenant filtresi TAŞIR (global tarama yok)', async () => {
      await recorder.getExecutionHistory(TENANT_A, 'case-1');
      await recorder.getPendingExecutions(TENANT_A);
      await recorder.cleanupStaleExecutions(TENANT_A);

      for (const call of prisma.cpeExecutionRecord.findMany.mock.calls) {
        expect(call[0].where.tenantId).toBe(TENANT_A);
      }
      expect(prisma.cpeExecutionRecord.updateMany.mock.calls[0][0].where.tenantId).toBe(TENANT_A);
    });
  });

  describe('check-then-create yarışı', () => {
    it('eşzamanlı duplicate → ham P2002 SIZMAZ, kazananın kaydı döner', async () => {
      prisma.cpeExecutionRecord.findUnique
        .mockResolvedValueOnce(null) // ilk kontrol: kayıt yok
        .mockResolvedValueOnce({ id: 'winner', tenantId: TENANT_A, status: 'PENDING' });
      prisma.cpeExecutionRecord.create.mockRejectedValue(uniqueViolation());

      const result = await recorder.startExecution(TENANT_A, EXEC_ID, 'case-1', ActionCode.UYAP_SEND);

      expect(result.isNew).toBe(false);
      expect(result.record.id).toBe('winner');
    });

    it('P2002 var ama kazanan okunamıyorsa SESSİZ GEÇİŞ YOK — hata yükselir', async () => {
      prisma.cpeExecutionRecord.findUnique.mockResolvedValue(null);
      prisma.cpeExecutionRecord.create.mockRejectedValue(uniqueViolation());

      await expect(
        recorder.startExecution(TENANT_A, EXEC_ID, 'case-1', ActionCode.UYAP_SEND),
      ).rejects.toMatchObject({ code: 'P2002' });
    });

    it('P2002 DIŞINDAKİ hatalar duplicate olarak yutulmaz', async () => {
      prisma.cpeExecutionRecord.create.mockRejectedValue(new Error('connection lost'));

      await expect(
        recorder.startExecution(TENANT_A, EXEC_ID, 'case-1', ActionCode.UYAP_SEND),
      ).rejects.toThrow('connection lost');
    });
  });
});

describe('UYAP-EVIDENCE-RUNTIME-INTEGRITY-R02 — legal-hold: yıkıcı retention kapalı', () => {
  const buildRetentionPrisma = () => ({
    cpeDecisionLog: {
      count: jest.fn().mockResolvedValue(7),
      findFirst: jest.fn().mockResolvedValue({ createdAt: new Date('2026-01-01') }),
      findMany: jest.fn(),
      deleteMany: jest.fn(),
    },
    $transaction: jest.fn(),
  });

  let prisma: ReturnType<typeof buildRetentionPrisma>;
  let service: DecisionLogRetentionService;

  beforeEach(() => {
    prisma = buildRetentionPrisma();
    service = new DecisionLogRetentionService(prisma as any, { report: jest.fn().mockResolvedValue(undefined) } as any);
  });

  it('cron HİÇBİR silme çağrısı yapmaz', async () => {
    await service.archiveOldRecords();

    expect(prisma.cpeDecisionLog.deleteMany).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('sweep yalnız SAYAR; deleted her zaman 0 ve yıkıcı yol kapalı raporlanır', async () => {
    const result = await service.sweep();

    expect(result.deleted).toBe(0);
    expect(result.destructiveDisabled).toBe(true);
    expect(result.eligibleCandidates).toBe(7);
    expect(prisma.cpeDecisionLog.deleteMany).not.toHaveBeenCalled();
  });

  it('aday sayımı legal-hold (bağlı link) kayıtlarını DIŞLAR', async () => {
    await service.sweep();

    const where = prisma.cpeDecisionLog.count.mock.calls[0][0].where;
    expect(where.uyapAttemptLinks).toEqual({ none: {} });
    expect(where.createdAt.lt).toBeInstanceOf(Date);
  });

  it('manualArchive sessiz no-op DEĞİL — açık hata atar', async () => {
    await expect(service.manualArchive(1)).rejects.toThrow(/CPE_DECISION_LOG_RETENTION_DISABLED/);
    expect(prisma.cpeDecisionLog.deleteMany).not.toHaveBeenCalled();
  });

  it('getRetentionStats yıkıcı yolun kapalı olduğunu bildirir', async () => {
    const stats = await service.getRetentionStats();

    expect(stats.destructiveRetentionDisabled).toBe(true);
    expect(CPE_DECISION_LOG_DESTRUCTIVE_RETENTION_DISABLED).toBe(true);
  });

  it('cron hata yutmaz gibi davranmaz: sayım hatası loglanır, süreç patlamaz', async () => {
    prisma.cpeDecisionLog.count.mockRejectedValue(new Error('db down'));

    await expect(service.archiveOldRecords()).resolves.toBeUndefined();
    expect(prisma.cpeDecisionLog.deleteMany).not.toHaveBeenCalled();
  });
});
