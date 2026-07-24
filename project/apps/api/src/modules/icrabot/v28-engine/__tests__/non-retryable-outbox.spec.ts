/**
 * DEBTOR-OF01-HISTORY-P04-C-I02 — NonRetryableOutboxError shared-infrastructure testleri.
 * DB-free unit; ActionHandlerService.dispatch() gerçek sınıfıyla, Prisma/OutboxService/
 * TimelineService/FactStoreService hafif jest.fn() sahteleriyle mock'lanır (bkz.
 * tenant-boundary-hardening.spec.ts / outbox-tenancy.spec.ts emsalleri).
 *
 * Doğrular:
 * 1. marker error (NonRetryableOutboxError) → ilk dispatch'te dead (markDeadLetter, markFailed DEĞİL)
 * 2. marker error ile dead-lettered action → ikinci dispatch'te handler TEKRAR ÇAĞRILMAZ (claimForProcessing
 *    CAS mekanizması zaten 'dead' status'u claim etmez — mevcut, değiştirilmemiş davranış)
 * 3. normal (marker taşımayan) Error → mevcut markFailed/pending-retry davranışı DEĞİŞMEDEN
 * 4. max-attempt davranışı (generic error, maxAttempts'e ulaşınca dead) DEĞİŞMEDEN korunur
 * 5. safe error serialization: NonRetryableOutboxError.cause içindeki hassas/ham detay lastError'a
 *    ASLA yazılmaz, yalnız güvenli .message yazılır
 * 6. tenantId eksik (action.tenantId null) mevcut fail-closed MISSING_TENANT_ID davranışı korunur
 */
import { ActionHandlerService } from '../action-handler.service';
import { NonRetryableOutboxError } from '../non-retryable-outbox.error';

function buildStatefulFakeOutbox(row: { status: string; attemptCount: number }) {
  const maxAttempts = 8;
  const markSent = jest.fn(async () => {
    row.status = 'sent';
  });
  const markDone = jest.fn(async () => {
    row.status = 'done';
    row.attemptCount += 1;
  });
  const markFailed = jest.fn(async (_id: string, _message: string, retryDelayMs: number) => {
    row.attemptCount += 1;
    const isDead = row.attemptCount >= maxAttempts;
    row.status = isDead ? 'dead' : 'failed';
    return {
      status: row.status as 'dead' | 'failed',
      attemptCount: row.attemptCount,
      nextRetryAt: isDead ? null : new Date(Date.now() + retryDelayMs),
    };
  });
  const markDeadLetter = jest.fn(async (_id: string, _error: Record<string, any>, options?: { incrementAttempt?: boolean }) => {
    if (options?.incrementAttempt) {
      row.attemptCount += 1;
    }
    row.status = 'dead';
  });
  const claimForProcessing = jest.fn(async () => {
    const claimable = (row.status === 'pending' || row.status === 'failed') && row.attemptCount < maxAttempts;
    if (claimable) row.status = 'sent';
    return claimable;
  });
  return { markSent, markDone, markFailed, markDeadLetter, claimForProcessing };
}

function buildHarness(initialRow: { status: string; attemptCount: number }) {
  const row = { ...initialRow };
  const actionRow = {
    id: 'a1',
    caseId: 'c1',
    tenantId: 't1',
    actionType: 'unit_test_action',
    payload: {},
    runId: null,
    idempotencyKey: 'k1',
    get status() {
      return row.status;
    },
    get attemptCount() {
      return row.attemptCount;
    },
  };
  const prisma = {
    icrabotOutboxAction: {
      findUnique: jest.fn(async () => ({ ...actionRow, status: row.status, attemptCount: row.attemptCount })),
    },
  };
  const outbox = buildStatefulFakeOutbox(row);
  const timeline = { addEntry: jest.fn().mockResolvedValue('tid') };
  const factStore = { write: jest.fn().mockResolvedValue(undefined) };
  const svc = new ActionHandlerService(prisma as any, outbox as any, timeline as any, factStore as any);
  return { svc, prisma, outbox, timeline, factStore, row };
}

describe('DEBTOR-OF01-HISTORY-P04-C-I02 — NonRetryableOutboxError shared infrastructure', () => {
  beforeAll(() => jest.useFakeTimers());
  afterAll(() => jest.useRealTimers());

  it('marker error → ilk dispatch te dead (markDeadLetter çağrılır, markFailed ÇAĞRILMAZ)', async () => {
    const { svc, outbox } = buildHarness({ status: 'pending', attemptCount: 0 });
    const handler = jest.fn().mockRejectedValue(
      new NonRetryableOutboxError({ reasonCode: 'TEST_REASON', message: 'safe message' }),
    );
    svc.register('unit_test_action', handler);

    const result = await svc.dispatch('a1');

    expect(handler).toHaveBeenCalledTimes(1);
    expect(outbox.markDeadLetter).toHaveBeenCalledTimes(1);
    expect(outbox.markDeadLetter).toHaveBeenCalledWith(
      'a1',
      expect.objectContaining({ error: 'safe message', reasonCode: 'TEST_REASON', securityRelevant: false }),
      { incrementAttempt: true },
    );
    expect(outbox.markFailed).not.toHaveBeenCalled();
    expect(result.deadLettered).toBe(true);
    expect(result.success).toBe(false);
  });

  it('marker error ile dead-lettered action → ikinci dispatch te handler TEKRAR ÇAĞRILMAZ (claimForProcessing dead statusu claim etmez)', async () => {
    const { svc, prisma, outbox } = buildHarness({ status: 'pending', attemptCount: 0 });
    const handler = jest.fn().mockRejectedValue(
      new NonRetryableOutboxError({ reasonCode: 'TEST_REASON', message: 'safe message' }),
    );
    svc.register('unit_test_action', handler);

    const first = await svc.dispatch('a1');
    const second = await svc.dispatch('a1');

    expect(handler).toHaveBeenCalledTimes(1); // ikinci dispatch handler'ı TEKRAR ÇAĞIRMADI
    expect(first.deadLettered).toBe(true);
    expect(second.skipped).toBe(true); // claim başarısız — status zaten 'dead'
    expect(outbox.markDeadLetter).toHaveBeenCalledTimes(1);
    expect(prisma.icrabotOutboxAction.findUnique).toHaveBeenCalled();
  });

  it('normal (marker taşımayan) Error → mevcut markFailed/pending-retry davranışı DEĞİŞMEDEN (retryScheduled)', async () => {
    const { svc, outbox } = buildHarness({ status: 'pending', attemptCount: 0 });
    const handler = jest.fn().mockRejectedValue(new Error('transient db hiccup'));
    svc.register('unit_test_action', handler);

    const result = await svc.dispatch('a1');

    expect(outbox.markFailed).toHaveBeenCalledTimes(1);
    expect(outbox.markDeadLetter).not.toHaveBeenCalled();
    expect(result.retryScheduled).toBe(true);
    expect(result.deadLettered).toBeUndefined();
  });

  it('max-attempt davranışı (generic error, 8. denemede dead) DEĞİŞMEDEN korunur — marker YOK', async () => {
    const { svc, outbox } = buildHarness({ status: 'pending', attemptCount: 7 }); // 8. deneme
    const handler = jest.fn().mockRejectedValue(new Error('still failing'));
    svc.register('unit_test_action', handler);

    const result = await svc.dispatch('a1');

    expect(outbox.markFailed).toHaveBeenCalledTimes(1); // markDeadLetter DEĞİL — mevcut markFailed yolu
    expect(outbox.markDeadLetter).not.toHaveBeenCalled();
    expect(result.deadLettered).toBe(true); // markFailed kendi max-attempt hesabıyla dead döndü
  });

  it('safe error serialization: NonRetryableOutboxError.cause içindeki hassas ham detay lastError/dispatch sonucuna ASLA yazılmaz', async () => {
    const rawSensitiveCause = new Error('raw internal detail: connection string user=admin password=hunter2secret');
    const { svc, outbox } = buildHarness({ status: 'pending', attemptCount: 0 });
    const handler = jest.fn().mockRejectedValue(
      new NonRetryableOutboxError({
        reasonCode: 'OCCURRENCE_TENANT_MISMATCH',
        message: 'Service occurrence tenant mismatch',
        securityRelevant: true,
        cause: rawSensitiveCause,
      }),
    );
    svc.register('unit_test_action', handler);

    const result = await svc.dispatch('a1');

    const markDeadLetterErrorArg = outbox.markDeadLetter.mock.calls[0][1];
    expect(JSON.stringify(markDeadLetterErrorArg)).not.toContain('hunter2secret');
    expect(JSON.stringify(markDeadLetterErrorArg)).not.toContain('password');
    expect(markDeadLetterErrorArg.error).toBe('Service occurrence tenant mismatch');
    expect(result.error).toBe('Service occurrence tenant mismatch');
    expect(JSON.stringify(result)).not.toContain('hunter2secret');
  });

  it('tenantId eksik (action.tenantId null) mevcut fail-closed MISSING_TENANT_ID davranışı korunur — yeni marker yoluna GİRMEZ', async () => {
    const prisma = {
      icrabotOutboxAction: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'a2', caseId: 'c1', tenantId: null, actionType: 'unit_test_action',
          payload: {}, runId: null, attemptCount: 0,
        }),
      },
    };
    const outbox = {
      markSent: jest.fn(),
      markDone: jest.fn(),
      markFailed: jest.fn(),
      markDeadLetter: jest.fn().mockResolvedValue(undefined),
    };
    const timeline = { addEntry: jest.fn().mockResolvedValue('tid') };
    const factStore = { write: jest.fn().mockResolvedValue(undefined) };
    const svc = new ActionHandlerService(prisma as any, outbox as any, timeline as any, factStore as any);
    const handler = jest.fn();
    svc.register('unit_test_action', handler);

    const result = await svc.dispatch('a2');

    expect(handler).not.toHaveBeenCalled(); // tenantId eksikliği handler'a ULAŞMADAN tespit edilir
    expect(outbox.markDeadLetter).toHaveBeenCalledWith('a2', { error: 'MISSING_TENANT_ID' });
    expect(result.error).toBe('MISSING_TENANT_ID');
    expect(result.deadLettered).toBe(true);
  });
});
