import { ActionHandlerService } from '../action-handler.service';
import {
  DEFAULT_ICRABOT_OUTBOX_MAX_ATTEMPTS,
  getIcrabotOutboxMaxAttempts,
} from '../outbox.constants';
import { OutboxCronService } from '../outbox-cron.service';
import { OutboxService } from '../outbox.service';

describe('Icrabot v28 platform outbox cron + retry contract', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.useFakeTimers();
    process.env = { ...originalEnv };
    delete process.env.ICRABOT_OUTBOX_CRON_ENABLED;
    delete process.env.ICRABOT_OUTBOX_BATCH_SIZE;
    delete process.env.ICRABOT_OUTBOX_MAX_ATTEMPTS;
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
    process.env = originalEnv;
    jest.clearAllMocks();
  });

  describe('OutboxService retry lifecycle', () => {
    it('retryable sorgu failed + due + attempts < shared max sözleşmesini kullanır', async () => {
      const findMany = jest.fn().mockResolvedValue([]);
      const prisma = { icrabotOutboxAction: { findMany } };
      const service = new OutboxService(prisma as any);

      await service.getRetryableActions(25);

      expect(findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: 'failed',
            nextRetryAt: expect.objectContaining({ lte: expect.any(Date) }),
            attemptCount: { lt: DEFAULT_ICRABOT_OUTBOX_MAX_ATTEMPTS },
          }),
          take: 25,
        }),
      );
    });

    it('markFailed shared max attempt altında failed + nextRetryAt yazar', async () => {
      const update = jest.fn().mockResolvedValue({});
      const prisma = {
        icrabotOutboxAction: {
          findUnique: jest.fn().mockResolvedValue({ attemptCount: 6 }),
          update,
        },
      };
      const service = new OutboxService(prisma as any);

      const result = await service.markFailed('a1', 'boom', 1000);

      expect(result.status).toBe('failed');
      expect(result.attemptCount).toBe(7);
      expect(result.nextRetryAt).toBeInstanceOf(Date);
      expect(update.mock.calls[0][0].data.status).toBe('failed');
    });

    it('markFailed shared max attempt eşiğinde dead terminal durumuna alır', async () => {
      const update = jest.fn().mockResolvedValue({});
      const prisma = {
        icrabotOutboxAction: {
          findUnique: jest.fn().mockResolvedValue({
            attemptCount: DEFAULT_ICRABOT_OUTBOX_MAX_ATTEMPTS - 1,
          }),
          update,
        },
      };
      const service = new OutboxService(prisma as any);

      const result = await service.markFailed('a1', 'boom', 1000);

      expect(result.status).toBe('dead');
      expect(result.nextRetryAt).toBeNull();
      expect(update.mock.calls[0][0].data.status).toBe('dead');
      expect(update.mock.calls[0][0].data.nextRetryAt).toBeNull();
      expect(getIcrabotOutboxMaxAttempts()).toBe(DEFAULT_ICRABOT_OUTBOX_MAX_ATTEMPTS);
    });
  });

  describe('ActionHandlerService dispatch contract', () => {
    const buildDispatchService = (actionRow: any, outboxOverrides: Record<string, any> = {}) => {
      const prisma = {
        icrabotOutboxAction: {
          findUnique: jest.fn().mockResolvedValue(actionRow),
        },
      };
      const outbox = {
        getPendingActions: jest.fn(),
        getRetryableActions: jest.fn(),
        claimForProcessing: jest.fn().mockResolvedValue(true),
        markSent: jest.fn(),
        markDone: jest.fn(),
        markFailed: jest.fn(),
        markDeadLetter: jest.fn(),
        ...outboxOverrides,
      };
      const timeline = { addEntry: jest.fn().mockResolvedValue('timeline-1') };
      const factStore = { write: jest.fn().mockResolvedValue(undefined) };
      const service = new ActionHandlerService(
        prisma as any,
        outbox as any,
        timeline as any,
        factStore as any,
      );
      return { service, prisma, outbox, timeline, factStore };
    };

    it('processRetryableActions failed actionları OutboxService üzerinden dispatch eder', async () => {
      const actionRow = {
        id: 'a-retry',
        caseId: 'c1',
        tenantId: 't1',
        actionType: 'unit_retry',
        payload: { ok: true },
        runId: null,
        attemptCount: 1,
      };
      const handler = jest.fn().mockResolvedValue({ done: true });
      const { service, outbox } = buildDispatchService(actionRow, {
        getRetryableActions: jest.fn().mockResolvedValue([{ id: 'a-retry' }]),
      });
      service.register('unit_retry', handler);

      const results = await service.processRetryableActions(5);

      expect(outbox.getRetryableActions).toHaveBeenCalledWith(5);
      expect(outbox.claimForProcessing).toHaveBeenCalledWith('a-retry');
      expect(handler).toHaveBeenCalledWith(
        actionRow.payload,
        actionRow.caseId,
        expect.objectContaining({ tenantId: 't1', actionId: 'a-retry' }),
      );
      expect(outbox.markDone).toHaveBeenCalledWith('a-retry');
      expect(results[0].success).toBe(true);
    });

    it('paralel process cagrisi ayni action icin handleri tek kez dispatch eder', async () => {
      const actionRow = {
        id: 'a-parallel',
        caseId: 'c1',
        tenantId: 't1',
        actionType: 'unit_parallel_claim',
        payload: { ok: true },
        runId: null,
        attemptCount: 0,
      };
      const handler = jest.fn().mockResolvedValue({ done: true });
      const { service, outbox } = buildDispatchService(actionRow, {
        getPendingActions: jest
          .fn()
          .mockResolvedValueOnce([{ id: 'a-parallel' }])
          .mockResolvedValueOnce([{ id: 'a-parallel' }]),
        claimForProcessing: jest
          .fn()
          .mockResolvedValueOnce(true)
          .mockResolvedValueOnce(false),
      });
      service.register('unit_parallel_claim', handler);

      const results = await Promise.all([
        service.processPendingActions(1),
        service.processPendingActions(1),
      ]);

      expect(outbox.getPendingActions).toHaveBeenCalledTimes(2);
      expect(outbox.claimForProcessing).toHaveBeenCalledTimes(2);
      expect(handler).toHaveBeenCalledTimes(1);
      expect(outbox.markDone).toHaveBeenCalledTimes(1);
      expect(results.flat()).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ success: true, actionId: 'a-parallel' }),
          expect.objectContaining({ success: false, actionId: 'a-parallel', skipped: true }),
        ]),
      );
    });
    it('tenantId eksik action için fallback yapmaz; handler çağırmadan dead-letter yazar', async () => {
      const handler = jest.fn().mockResolvedValue({ done: true });
      const { service, outbox, timeline, factStore } = buildDispatchService({
        id: 'a-null-tenant',
        caseId: 'c1',
        tenantId: null,
        actionType: 'unit_missing_tenant',
        payload: {},
        runId: null,
        attemptCount: 0,
      });
      service.register('unit_missing_tenant', handler);

      const result = await service.dispatch('a-null-tenant');

      expect(outbox.claimForProcessing).toHaveBeenCalledWith('a-null-tenant');
      expect(outbox.markDeadLetter).toHaveBeenCalledWith(
        'a-null-tenant',
        expect.objectContaining({ error: 'MISSING_TENANT_ID' }),
      );
      expect(handler).not.toHaveBeenCalled();
      expect(timeline.addEntry).not.toHaveBeenCalled();
      expect(factStore.write).not.toHaveBeenCalled();
      expect(result.deadLettered).toBe(true);
    });

    it('claim başarısızsa handler çalıştırmadan skipped döner', async () => {
      const handler = jest.fn().mockResolvedValue({ done: true });
      const { service, outbox } = buildDispatchService(
        {
          id: 'a-already-claimed',
          caseId: 'c1',
          tenantId: 't1',
          actionType: 'unit_claim',
          payload: {},
          runId: null,
          attemptCount: 0,
        },
        { claimForProcessing: jest.fn().mockResolvedValue(false) },
      );
      service.register('unit_claim', handler);

      const result = await service.dispatch('a-already-claimed');

      expect(outbox.claimForProcessing).toHaveBeenCalledWith('a-already-claimed');
      expect(handler).not.toHaveBeenCalled();
      expect(result.skipped).toBe(true);
    });
  });

  describe('OutboxCronService', () => {
    it('env kapalıyken hiçbir işlem yapmaz', async () => {
      process.env.ICRABOT_OUTBOX_CRON_ENABLED = 'false';
      const actionHandler = {
        processPendingActions: jest.fn(),
        processRetryableActions: jest.fn(),
      };
      const service = new OutboxCronService(actionHandler as any);

      await service.processOutboxActions();

      expect(actionHandler.processPendingActions).not.toHaveBeenCalled();
      expect(actionHandler.processRetryableActions).not.toHaveBeenCalled();
    });

    it('env açıkken pending ve retryable batchlerini aynı limit ile işler', async () => {
      process.env.ICRABOT_OUTBOX_CRON_ENABLED = 'true';
      process.env.ICRABOT_OUTBOX_BATCH_SIZE = '3';
      const actionHandler = {
        processPendingActions: jest.fn().mockResolvedValue([{ actionId: 'p1' }]),
        processRetryableActions: jest.fn().mockResolvedValue([{ actionId: 'r1' }]),
      };
      const service = new OutboxCronService(actionHandler as any);

      await service.processOutboxActions();

      expect(actionHandler.processPendingActions).toHaveBeenCalledWith(3);
      expect(actionHandler.processRetryableActions).toHaveBeenCalledWith(3);
    });

    it('önceki run bitmeden ikinci run başlamaz', async () => {
      process.env.ICRABOT_OUTBOX_CRON_ENABLED = 'true';
      let releasePending!: (value: any[]) => void;
      const pendingRun = new Promise<any[]>((resolve) => {
        releasePending = resolve;
      });
      const actionHandler = {
        processPendingActions: jest.fn().mockReturnValue(pendingRun),
        processRetryableActions: jest.fn().mockResolvedValue([]),
      };
      const service = new OutboxCronService(actionHandler as any);

      const firstRun = service.processOutboxActions();
      await Promise.resolve();
      await service.processOutboxActions();

      expect(actionHandler.processPendingActions).toHaveBeenCalledTimes(1);
      expect(actionHandler.processRetryableActions).not.toHaveBeenCalled();

      releasePending([]);
      await firstRun;

      expect(actionHandler.processRetryableActions).toHaveBeenCalledTimes(1);
    });
  });
});
