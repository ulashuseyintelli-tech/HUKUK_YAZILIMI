/**
 * W3-F02-OUTBOX-CONSUMER-TENANT-OWNERSHIP-R01
 *
 * W3-D02 bulgusu: outbox consumer, `action.tenantId`in gercek Case sahipligiyle
 * eslestigini hic dogrulamiyordu; 6 handler (send_email/send_sms/send_notification/
 * uyap_submit/create_task/enqueue) + update_case_status dogrudan `caseId` ile DB'ye
 * yaziyordu. Fix: `ActionHandlerService.dispatch()` icine merkezi bir ownership gate
 * (`resolveOutboxActionOwnership`), claim SONRASI / handler cagrisindan ONCE.
 *
 * Bu dosya dogrular:
 *  1. `resolveOutboxActionOwnership` — saf fonksiyon: match/not-found/mismatch.
 *  2. `dispatch()` happy path: same-tenant action+case -> handler 1 kez, ownership
 *     lookup 1 kez, markDone.
 *  3. `dispatch()` TENANT_MISMATCH: handler ASLA cagrilmaz, sifir side effect
 *     (timeline:0, factStore:0), markDeadLetter(securityRelevant:true), guvenli log.
 *  4. `dispatch()` RESOURCE_NOT_FOUND: ayni sekilde sifir side effect, ama
 *     securityRelevant:false (ayri reasonCode).
 *  5. Ownership lookup'un KENDISI basarisiz olursa (transient DB hatasi): markFailed/
 *     retry yoluna gider, markDeadLetter DEGIL — TENANT_MISMATCH ile ayni kategoriye
 *     KONMAZ (brief §9/§16-G).
 *  6. Idempotency/replay: mismatch nedeniyle dead-lettered action'in ikinci dispatch'i
 *     handler'i TEKRAR CAGIRMAZ (claim CAS zaten 'dead' status'u claim etmez).
 *  7. KAPSAMLI COVERAGE: TUM 7 gercek handler ayni merkezi gate ile korunur — tek bir
 *     temsilci handler'a bakip sistemi kapatmak YASAK (brief §4).
 *  8. STRUCTURAL GUARD: ownership gate `dispatch()` govdesinden, handler cagrisindan
 *     ONCE cikarilirsa bu test KIRMIZI olur (merkezi kontrolun kaldirilmasini yakalar).
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { ActionHandlerService } from '../action-handler.service';
import {
  resolveOutboxActionOwnership,
  CaseOwnershipReader,
} from '../outbox-action-ownership';

describe('resolveOutboxActionOwnership (saf fonksiyon)', () => {
  function reader(result: { id: string; tenantId: string } | null): CaseOwnershipReader {
    return { case: { findUnique: jest.fn(async () => result) } };
  }

  it('Case bulunur ve tenantId eslesir -> ok:true', async () => {
    const result = await resolveOutboxActionOwnership(reader({ id: 'c1', tenantId: 't1' }), 'c1', 't1');
    expect(result).toEqual({ ok: true, tenantId: 't1', resourceType: 'Case', resourceId: 'c1' });
  });

  it('Case bulunamaz -> ok:false, RESOURCE_NOT_FOUND', async () => {
    const result = await resolveOutboxActionOwnership(reader(null), 'c-yok', 't1');
    expect(result).toEqual({ ok: false, reason: 'RESOURCE_NOT_FOUND', resourceType: 'Case', resourceId: 'c-yok' });
  });

  it('Case bulunur ama tenantId eslesmez -> ok:false, TENANT_MISMATCH', async () => {
    const result = await resolveOutboxActionOwnership(reader({ id: 'c1', tenantId: 't2' }), 'c1', 't1');
    expect(result).toEqual({ ok: false, reason: 'TENANT_MISMATCH', resourceType: 'Case', resourceId: 'c1' });
  });

  it('sorgu tam olarak id ile findUnique cagirir (select: id+tenantId)', async () => {
    const findUnique = jest.fn(async () => ({ id: 'c1', tenantId: 't1' }));
    await resolveOutboxActionOwnership({ case: { findUnique } }, 'c1', 't1');
    expect(findUnique).toHaveBeenCalledWith({ where: { id: 'c1' }, select: { id: true, tenantId: true } });
  });
});

describe('W3-F02 — dispatch() tenant ownership gate', () => {
  beforeAll(() => jest.useFakeTimers());
  afterAll(() => jest.useRealTimers());

  function buildRow(over: Record<string, any> = {}) {
    return {
      id: 'a1',
      caseId: 'case-1',
      tenantId: 'tenant-a',
      actionType: 'unit_owned_action',
      payload: { x: 1 },
      runId: 'run-1',
      idempotencyKey: 'k1',
      attemptCount: 0,
      ...over,
    };
  }

  function buildHarness(row: Record<string, any>, caseRecord: { id: string; tenantId: string } | null) {
    const state = { status: 'pending', attemptCount: row.attemptCount ?? 0 };
    const prisma = {
      icrabotOutboxAction: {
        findUnique: jest.fn(async () => ({ ...row, status: state.status, attemptCount: state.attemptCount })),
      },
      case: {
        findUnique: jest.fn(async () => caseRecord),
      },
    };
    const outbox = {
      claimForProcessing: jest.fn(async () => {
        const claimable = state.status === 'pending' || state.status === 'failed';
        if (claimable) state.status = 'sent';
        return claimable;
      }),
      markSent: jest.fn(),
      markDone: jest.fn(async () => {
        state.status = 'done';
      }),
      markFailed: jest.fn(async (_id: string, _msg: string, retryDelayMs: number) => {
        state.attemptCount += 1;
        const isDead = state.attemptCount >= 8;
        state.status = isDead ? 'dead' : 'failed';
        return { status: state.status as 'dead' | 'failed', attemptCount: state.attemptCount, nextRetryAt: isDead ? null : new Date(Date.now() + retryDelayMs) };
      }),
      markDeadLetter: jest.fn(async () => {
        state.status = 'dead';
      }),
    };
    const timeline = { addEntry: jest.fn().mockResolvedValue('tid') };
    const factStore = { write: jest.fn().mockResolvedValue(undefined) };
    const svc = new ActionHandlerService(prisma as any, outbox as any, timeline as any, factStore as any);
    return { svc, prisma, outbox, timeline, factStore, state };
  }

  it('SAME-TENANT happy path: handler 1 kez, ownership lookup 1 kez, action done', async () => {
    const row = buildRow();
    const { svc, prisma, outbox, timeline } = buildHarness(row, { id: 'case-1', tenantId: 'tenant-a' });
    const handler = jest.fn().mockResolvedValue({ ok: true });
    svc.register('unit_owned_action', handler);

    const result = await svc.dispatch('a1', { kind: 'platform' } as const);

    expect(prisma.case.findUnique).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(row.payload, row.caseId, expect.objectContaining({ tenantId: 'tenant-a' }));
    expect(outbox.markDone).toHaveBeenCalledTimes(1);
    expect(outbox.markDeadLetter).not.toHaveBeenCalled();
    expect(timeline.addEntry).toHaveBeenCalled(); // OUTCOME success + feedback FACT_WRITE
    expect(result.success).toBe(true);
  });

  it('TENANT_MISMATCH: handler ASLA cagrilmaz, sifir side effect (timeline:0, factStore:0)', async () => {
    const row = buildRow();
    // Case gercekte BASKA bir tenant'a ait.
    const { svc, outbox, timeline, factStore } = buildHarness(row, { id: 'case-1', tenantId: 'tenant-B-FOREIGN' });
    const handler = jest.fn().mockResolvedValue({ ok: true });
    svc.register('unit_owned_action', handler);

    const result = await svc.dispatch('a1', { kind: 'platform' } as const);

    expect(handler).not.toHaveBeenCalled();
    expect(timeline.addEntry).not.toHaveBeenCalled();
    expect(factStore.write).not.toHaveBeenCalled();
    expect(outbox.markDeadLetter).toHaveBeenCalledWith(
      'a1',
      expect.objectContaining({
        reasonCode: 'TENANT_MISMATCH',
        securityRelevant: true,
        declaredTenantId: 'tenant-a',
        resourceType: 'Case',
        resourceId: 'case-1',
        actionType: 'unit_owned_action',
      }),
    );
    expect(result.success).toBe(false);
    expect(result.deadLettered).toBe(true);
    expect(result.error).toBe('TENANT_MISMATCH');
  });

  it('RESOURCE_NOT_FOUND: sifir side effect, securityRelevant:false (ayri reasonCode)', async () => {
    const row = buildRow();
    const { svc, outbox, timeline } = buildHarness(row, null); // Case hic yok
    const handler = jest.fn().mockResolvedValue({ ok: true });
    svc.register('unit_owned_action', handler);

    const result = await svc.dispatch('a1', { kind: 'platform' } as const);

    expect(handler).not.toHaveBeenCalled();
    expect(timeline.addEntry).not.toHaveBeenCalled();
    expect(outbox.markDeadLetter).toHaveBeenCalledWith(
      'a1',
      expect.objectContaining({ reasonCode: 'RESOURCE_NOT_FOUND', securityRelevant: false }),
    );
    expect(result.deadLettered).toBe(true);
    expect(result.error).toBe('RESOURCE_NOT_FOUND');
  });

  it('ownership lookup TRANSIENT hata: markFailed/retry yoluna gider, markDeadLetter DEGIL', async () => {
    const row = buildRow();
    const { svc, outbox, timeline } = buildHarness(row, { id: 'case-1', tenantId: 'tenant-a' });
    const handler = jest.fn().mockResolvedValue({ ok: true });
    svc.register('unit_owned_action', handler);

    // Case lookup'un KENDISI reddedilir (transient DB hatasi simulasyonu).
    const prisma = (svc as any).prisma;
    prisma.case.findUnique = jest.fn().mockRejectedValue(new Error('connection reset'));

    const result = await svc.dispatch('a1', { kind: 'platform' } as const);

    expect(handler).not.toHaveBeenCalled();
    expect(timeline.addEntry).not.toHaveBeenCalled();
    expect(outbox.markDeadLetter).not.toHaveBeenCalled();
    expect(outbox.markFailed).toHaveBeenCalledWith('a1', 'connection reset', expect.any(Number));
    expect(result.retryScheduled).toBe(true);
    expect(result.deadLettered).toBe(false);
  });

  it('IDEMPOTENCY: mismatch nedeniyle dead-lettered action ikinci dispatch te handler TEKRAR CAGIRMAZ', async () => {
    const row = buildRow();
    const { svc, prisma, outbox } = buildHarness(row, { id: 'case-1', tenantId: 'tenant-B-FOREIGN' });
    const handler = jest.fn().mockResolvedValue({ ok: true });
    svc.register('unit_owned_action', handler);

    const first = await svc.dispatch('a1', { kind: 'platform' } as const);
    const second = await svc.dispatch('a1', { kind: 'platform' } as const);

    expect(first.deadLettered).toBe(true);
    expect(second.skipped).toBe(true); // claim basarisiz — status zaten 'dead'
    expect(handler).not.toHaveBeenCalled();
    expect(outbox.markDeadLetter).toHaveBeenCalledTimes(1);
    expect(prisma.case.findUnique).toHaveBeenCalledTimes(1); // ikinci dispatch ownership'e HIC ULASMAZ
  });

  it('REPLAY/DLQ: dead-letter sonrasi manuel retry (claim tekrar acilir) mismatch AYNI sekilde reddedilir', async () => {
    const row = buildRow();
    const { svc, state, outbox } = buildHarness(row, { id: 'case-1', tenantId: 'tenant-B-FOREIGN' });
    const handler = jest.fn().mockResolvedValue({ ok: true });
    svc.register('unit_owned_action', handler);

    await svc.dispatch('a1', { kind: 'platform' } as const);
    expect(state.status).toBe('dead');

    // DLQ/manuel replay: satir 'pending'e geri alinir (retryDeadAction benzeri operasyon).
    state.status = 'pending';
    const replayed = await svc.dispatch('a1', { kind: 'platform' } as const);

    expect(handler).not.toHaveBeenCalled(); // replay de HANDLER'a ULASMAZ
    expect(replayed.deadLettered).toBe(true);
    expect(outbox.markDeadLetter).toHaveBeenCalledTimes(2); // ownership HER dispatch'te yeniden dogrulanir
  });

  describe('KAPSAMLI COVERAGE: her gercek handler ayni merkezi gate ile korunur', () => {
    // Bu 7 actionType, action-handler.service.ts registerDefaultHandlers()'da caseId ile
    // dogrudan Prisma'ya yazan GERCEK handler'lardir (send_email/send_sms/send_notification/
    // uyap_submit/create_task/enqueue -> 6 tablo tenantId TASIMAZ; update_case_status ->
    // Case.tenantId VAR ama consumer onceden karsilastirmiyordu). set_fact/set_flag/
    // batch_set_facts KAPSAM DISI: FactStoreService.write() zaten assertCaseInScope() ile
    // ayni transaction'da korunuyor (bkz. factstore.service.ts).
    const REAL_HANDLERS = [
      'send_email',
      'send_sms',
      'send_notification',
      'uyap_submit',
      'create_task',
      'enqueue',
      'update_case_status',
    ];

    it.each(REAL_HANDLERS)('%s: mismatch durumunda GERCEK handler bile cagrilmaz, DB yazisi 0', async (actionType) => {
      const row = buildRow({ actionType, payload: samplePayloadFor(actionType) });
      const emailCreate = jest.fn();
      const smsCreate = jest.fn();
      const notificationCreate = jest.fn();
      const uyapCreate = jest.fn();
      const taskCreate = jest.fn();
      const queueCreate = jest.fn();
      const caseUpdate = jest.fn();
      const lifecycleCreate = jest.fn();

      const state = { status: 'pending', attemptCount: 0 };
      const prisma = {
        icrabotOutboxAction: {
          findUnique: jest.fn(async () => ({ ...row, status: state.status, attemptCount: state.attemptCount })),
        },
        case: {
          findUnique: jest.fn(async () => ({ id: 'case-1', tenantId: 'tenant-B-FOREIGN' })),
          update: caseUpdate,
        },
        caseLifecycle: { create: lifecycleCreate },
        icrabotEmailLog: { create: emailCreate },
        icrabotSmsLog: { create: smsCreate },
        icrabotNotification: { create: notificationCreate },
        icrabotUyapSubmission: { create: uyapCreate },
        icrabotTask: { create: taskCreate },
        icrabotQueueItem: { create: queueCreate },
      };
      const outbox = {
        claimForProcessing: jest.fn(async () => {
          const claimable = state.status === 'pending';
          if (claimable) state.status = 'sent';
          return claimable;
        }),
        markDeadLetter: jest.fn(async () => {
          state.status = 'dead';
        }),
        markDone: jest.fn(),
        markFailed: jest.fn(),
      };
      const timeline = { addEntry: jest.fn() };
      const factStore = { write: jest.fn() };
      // GERCEK ActionHandlerService — registerDefaultHandlers() constructor'da calisir,
      // yani GERCEK send_email/send_sms/... handler govdeleri kullanilir (sahte degil).
      const svc = new ActionHandlerService(prisma as any, outbox as any, timeline as any, factStore as any);

      const result = await svc.dispatch('a1', { kind: 'platform' } as const);

      expect(result.deadLettered).toBe(true);
      expect(result.error).toBe('TENANT_MISMATCH');
      expect(emailCreate).not.toHaveBeenCalled();
      expect(smsCreate).not.toHaveBeenCalled();
      expect(notificationCreate).not.toHaveBeenCalled();
      expect(uyapCreate).not.toHaveBeenCalled();
      expect(taskCreate).not.toHaveBeenCalled();
      expect(queueCreate).not.toHaveBeenCalled();
      expect(caseUpdate).not.toHaveBeenCalled();
      expect(lifecycleCreate).not.toHaveBeenCalled();
      expect(timeline.addEntry).not.toHaveBeenCalled();
    });

    function samplePayloadFor(actionType: string): Record<string, any> {
      switch (actionType) {
        case 'send_email':
          return { to: 'x@example.invalid', subject: 's', body: 'b' };
        case 'send_sms':
          return { phone: '+905551112233', message: 'm' };
        case 'send_notification':
          return { type: 'info', recipient: 'all', title: 't', message: 'm' };
        case 'uyap_submit':
          return { document_type: 'DILEKCE', document_id: 'd1' };
        case 'create_task':
          return { title: 't', description: 'd' };
        case 'enqueue':
          return { queue: 'manual_review' };
        case 'update_case_status':
          return { status: 'CLOSED', reason: 'test' };
        default:
          return {};
      }
    }
  });

  describe('STRUCTURAL GUARD: merkezi ownership gate dispatch() kaynak metninde var olmali', () => {
    it('dispatch() govdesi, handler cagrisindan ONCE resolveOutboxActionOwnership cagirir', () => {
      const source = fs.readFileSync(
        path.join(__dirname, '..', 'action-handler.service.ts'),
        'utf8',
      );
      const dispatchStart = source.indexOf('async dispatch(actionId: string, scope: OutboxScope)');
      expect(dispatchStart).toBeGreaterThan(-1);
      // dispatch()'ten SONRAKI ilk metot bildirimine kadar olan govdeyi al (kaba ama
      // yeterli sinir: bir sonraki `async ` metot bildirimi veya `registerDefaultHandlers`).
      const nextMethodMarker = source.indexOf('async processPendingActions', dispatchStart);
      expect(nextMethodMarker).toBeGreaterThan(dispatchStart);
      const dispatchBody = source.slice(dispatchStart, nextMethodMarker);

      const ownershipCallIndex = dispatchBody.indexOf('resolveOutboxActionOwnership(');
      const handlerInvocationIndex = dispatchBody.indexOf('await handler(');

      expect(ownershipCallIndex).toBeGreaterThan(-1);
      expect(handlerInvocationIndex).toBeGreaterThan(-1);
      expect(ownershipCallIndex).toBeLessThan(handlerInvocationIndex);
    });
  });
});
