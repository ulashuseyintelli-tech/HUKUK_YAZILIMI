/**
 * W3-F05-OUTBOX-NO-HANDLER-POISON-DISPOSITION-R01.
 *
 * W3-D09: kayitli handler'i olmayan bir action tipi, claim hic alinmadigi icin
 * "pending" durumunda kalir ve dispatch() sonraki HER cron turunda ayni action'i
 * tekrar tekrar bulur — attemptCount hic artmaz, terminal disposition hic olusmaz.
 * Bu dosya, dispatch()'in artik bunu MISSING_TENANT_ID ile ayni desende (once claim,
 * sonra markDeadLetter) terminal kapattigini DB-free olarak kanitlar:
 *
 *   [1] Bilinmeyen action tipi: handler HICBIR SEKILDE cagrilmaz, tek seferde
 *       terminal dead-letter olur (NO_REGISTERED_HANDLER).
 *   [2] Idempotent terminalization: ayni action IKINCI KEZ dispatch edilirse
 *       (concurrent/duplicate delivery) claim BASARISIZ olur (satir artik
 *       'pending'/'failed' degil) — markDeadLetter TEKRAR cagrilmaz.
 *   [3] Stale-claim recovery, zaten 'dead' olan bir poison satiri YENIDEN ACMAZ
 *       (recoverStaleProcessingActions sadece 'sent' satirlari hedefler).
 *   [4] Replay: dead-letter sonrasi manuel pending-reset (retryDeadAction'in
 *       yaptigi), handler registry'yi YENIDEN kontrol eder — hala yoksa AYNI
 *       sekilde tekrar reddedilir.
 *   [5] Desteklenen (kayitli) action tipleri ETKILENMEDI — regresyon.
 */
import { ActionHandlerService } from '../action-handler.service';
import { OutboxService } from '../outbox.service';

function buildRow(overrides: Partial<Record<string, any>> = {}) {
  return {
    id: 'a1',
    caseId: 'case-1',
    tenantId: 'tenant-1',
    runId: null,
    actionType: 'completely_unknown_action_type',
    idempotencyKey: 'idem-1',
    payload: {},
    status: 'pending',
    attemptCount: 0,
    lastError: null,
    nextRetryAt: null,
    ...overrides,
  };
}

describe('W3-F05 — handler bulunamayan action terminal kapatilir (poison disposition)', () => {
  it('[1] bilinmeyen action tipi: handler cagrilmaz, TEK seferde NO_REGISTERED_HANDLER dead-letter olur', async () => {
    const row = buildRow();
    const prisma: any = {
      icrabotOutboxAction: {
        findUnique: jest.fn(async () => row),
      },
    };
    const outbox: any = {
      claimForProcessing: jest.fn(async () => true),
      markDeadLetter: jest.fn(async () => undefined),
    };
    const timeline: any = { addEntry: jest.fn() };
    const factStore: any = {};

    const svc = new ActionHandlerService(prisma, outbox, timeline, factStore);
    const result = await svc.dispatch('a1', { kind: 'platform' } as const);

    expect(outbox.claimForProcessing).toHaveBeenCalledWith('a1');
    expect(outbox.markDeadLetter).toHaveBeenCalledTimes(1);
    expect(outbox.markDeadLetter).toHaveBeenCalledWith(
      'a1',
      expect.objectContaining({
        reasonCode: 'NO_REGISTERED_HANDLER',
        failureClass: 'NON_RETRYABLE',
        actionType: 'completely_unknown_action_type',
        tenantId: 'tenant-1',
        attempt: 0,
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({ success: false, deadLettered: true, error: 'NO_REGISTERED_HANDLER' }),
    );
    // Timeline'a HICBIR sey yazilmadi (MISSING_TENANT_ID/TENANT_MISMATCH ile ayni desen).
    expect(timeline.addEntry).not.toHaveBeenCalled();
  });

  it('[2] ayni action IKINCI kez dispatch edilirse (duplicate/concurrent) claim basarisiz olur; markDeadLetter TEKRAR cagrilmaz', async () => {
    // Once claim edilebilir satir; ikinci dispatch cagrisinda satir artik 'dead' —
    // claimForProcessing'in gercek sozlesmesi (status IN ['pending','failed']) bunu
    // otomatik reddeder. Burada bunu dogrudan simule ediyoruz.
    const row = buildRow();
    const prisma: any = {
      icrabotOutboxAction: {
        findUnique: jest.fn(async () => row),
      },
    };
    const outbox: any = {
      claimForProcessing: jest.fn(async () => false), // ikinci worker kaybeder
      markDeadLetter: jest.fn(async () => undefined),
    };
    const timeline: any = { addEntry: jest.fn() };
    const svc = new ActionHandlerService(prisma, outbox, timeline, {} as any);

    const result = await svc.dispatch('a1', { kind: 'platform' } as const);

    expect(outbox.markDeadLetter).not.toHaveBeenCalled();
    expect(result).toEqual(
      expect.objectContaining({ success: false, skipped: true, error: 'Action not claimable: a1' }),
    );
  });

  it('[3] stale-claim recovery, zaten dead olan bir poison satirini YENIDEN ACMAZ (sadece sent satirlari hedefler)', async () => {
    const updateMany = jest.fn(async (_args: any) => ({ count: 0 }));
    const prisma: any = {
      icrabotOutboxAction: { updateMany },
    };
    const svc = new OutboxService(prisma);

    await svc.recoverStaleProcessingActions(new Date('2026-01-01T00:10:00.000Z'));

    // Her iki recovery sorgusu da (dead + failed yolu) YALNIZ status:'sent' hedefler;
    // zaten 'dead' olan bir satir bu where'e asla girmez.
    expect(updateMany).toHaveBeenCalledTimes(2);
    for (const call of updateMany.mock.calls) {
      expect(call[0].where.status).toBe('sent');
    }
  });

  it('[4] replay (manuel pending-reset sonrasi) handler registry’yi YENIDEN kontrol eder; hala yoksa ayni sekilde reddedilir', async () => {
    // retryDeadAction() dead->pending gecisini yapar; dispatch() SONRAKI cagrida
    // handler kontrolunu YENIDEN calistirir (ayri bir "already validated" bypass
    // bayragi YOKTUR) — bu test dogrudan o ikinci dispatch cagrisini kanitlar.
    const replayedRow = buildRow({ status: 'pending', attemptCount: 0, lastError: null });
    const prisma: any = {
      icrabotOutboxAction: { findUnique: jest.fn(async () => replayedRow) },
    };
    const outbox: any = {
      claimForProcessing: jest.fn(async () => true),
      markDeadLetter: jest.fn(async () => undefined),
    };
    const svc = new ActionHandlerService(prisma, outbox, { addEntry: jest.fn() } as any, {} as any);

    const result = await svc.dispatch('a1', { kind: 'platform' } as const);

    expect(outbox.markDeadLetter).toHaveBeenCalledWith(
      'a1',
      expect.objectContaining({ reasonCode: 'NO_REGISTERED_HANDLER' }),
    );
    expect(result.deadLettered).toBe(true);
  });

  it('[5] desteklenen (kayitli) action tipleri ETKILENMEDI — regresyon', async () => {
    const row = buildRow({ actionType: 'enqueue', payload: { queue: 'x', case_id: 'case-1' } });
    const prisma: any = {
      icrabotOutboxAction: {
        findUnique: jest.fn(async () => row),
        update: jest.fn(async () => ({})),
      },
      icrabotQueueItem: { create: jest.fn(async () => ({ id: 'q1' })) },
      // W3-F02: dispatch handler'dan once Case sahipligini dogrular (resolveOutboxActionOwnership).
      case: { findUnique: jest.fn(async () => ({ id: 'case-1', tenantId: 'tenant-1' })) },
    };
    const outbox: any = {
      claimForProcessing: jest.fn(async () => true),
      markDeadLetter: jest.fn(async () => undefined),
      markDone: jest.fn(async () => undefined),
    };
    const timeline: any = { addEntry: jest.fn() };
    const factStore: any = {};
    const svc = new ActionHandlerService(prisma, outbox, timeline, factStore);

    const result = await svc.dispatch('a1', { kind: 'platform' } as const);

    expect(outbox.markDeadLetter).not.toHaveBeenCalled();
    expect(result.success).toBe(true);
  });
});
