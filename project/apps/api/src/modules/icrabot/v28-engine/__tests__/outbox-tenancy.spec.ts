/**
 * outbox-tenancy Phase 1 — DB-free unit (decision C / hibrit)
 *
 * Doğrular:
 *  1. PRODUCER (OutboxService.createAction): tenantId write-time ZORUNLU yazılır (verilmezse throw — Adım A).
 *  2. CONSUMER (ActionHandlerService.dispatch): outbox satırındaki tenantId timeline yazımlarına thread'lenir.
 *  3. EXTERNAL CALLBACK (ActionFeedbackService.processCallback): tenantId case_id boundary lookup ile çözülüp thread'lenir.
 *
 * Bridge fallback HENÜZ kaldırılmadı (Phase 2). Canlı PG davranışı bu seviyede koşulmaz.
 */
import { OutboxService } from '../outbox.service';
import { ActionHandlerService } from '../action-handler.service';
import { ActionFeedbackService } from '../action-feedback.service';

describe('outbox-tenancy Phase 1 (decision C)', () => {
  // ── 1. PRODUCER: write-time capture ──────────────────────────────────────
  describe('OutboxService.createAction — write-time tenant capture', () => {
    const makePrisma = () => {
      const create = jest.fn().mockResolvedValue({ id: 'a1' });
      return {
        prisma: {
          icrabotOutboxAction: {
            findUnique: jest.fn().mockResolvedValue(null), // idempotency: yok
            create,
          },
        },
        create,
      };
    };

    it('tenantId verilince satıra yazar', async () => {
      const { prisma, create } = makePrisma();
      const svc = new OutboxService(prisma as any);
      await svc.createAction({ caseId: 'c1', tenantId: 't1', actionType: 'x', idempotencyKey: 'k1', payload: {} });
      expect(create.mock.calls[0][0].data.tenantId).toBe('t1');
    });

    it('tenantId verilmezse throw (Adım A: fail-closed, NULL yazmaz)', async () => {
      const { prisma, create } = makePrisma();
      const svc = new OutboxService(prisma as any);
      await expect(
        svc.createAction({ caseId: 'c1', actionType: 'x', idempotencyKey: 'k2', payload: {} } as any),
      ).rejects.toThrow(/outbox_tenant_required/);
      expect(create).not.toHaveBeenCalled();
    });
  });

  // ── 2. CONSUMER: satırdan thread ─────────────────────────────────────────
  describe('ActionHandlerService.dispatch — satırdaki tenantId timeline yazımlarına thread', () => {
    beforeAll(() => jest.useFakeTimers());
    afterAll(() => jest.useRealTimers());

    it('action.tenantId tüm timeline.addEntry çağrılarına geçer (success path)', async () => {
      const handler = jest.fn().mockResolvedValue({ ok: true });
      const prisma = {
        icrabotOutboxAction: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'a1', caseId: 'c1', tenantId: 't1', actionType: 'unit_test_action',
            payload: {}, runId: 'r1', attemptCount: 0,
          }),
        },
      };
      const outbox = { markSent: jest.fn(), markDone: jest.fn(), markFailed: jest.fn() };
      const timeline = { addEntry: jest.fn().mockResolvedValue('tid') };
      const factStore = { write: jest.fn().mockResolvedValue(undefined) };

      const svc = new ActionHandlerService(prisma as any, outbox as any, timeline as any, factStore as any);
      svc.register('unit_test_action', handler);

      await svc.dispatch('a1');

      expect(timeline.addEntry).toHaveBeenCalled();
      // OUTCOME(done) + feedback FACT_WRITE — hepsi tenantId taşımalı
      for (const call of timeline.addEntry.mock.calls) {
        expect(call[0].tenantId).toBe('t1');
      }
    });
  });

  // ── 3. EXTERNAL CALLBACK: boundary lookup ────────────────────────────────
  describe('ActionFeedbackService.processCallback — case_id boundary lookup', () => {
    it("tenantId case satırından çözülüp addEntry'ye thread edilir", async () => {
      const findUnique = jest.fn().mockResolvedValue({ tenantId: 't-callback' });
      const prisma = { case: { findUnique } };
      const timeline = { addEntry: jest.fn().mockResolvedValue('tid') };
      const factStore = { write: jest.fn().mockResolvedValue(undefined) };

      const svc = new ActionFeedbackService(factStore as any, timeline as any, prisma as any);
      await svc.processCallback({ case_id: 'c9', kind: 'payment_ok', data: {} });

      expect(findUnique).toHaveBeenCalledWith({ where: { id: 'c9' }, select: { tenantId: true } });
      expect(timeline.addEntry).toHaveBeenCalledTimes(1);
      expect(timeline.addEntry.mock.calls[0][0].tenantId).toBe('t-callback');
      expect(timeline.addEntry.mock.calls[0][0].caseId).toBe('c9');
    });
  });
});
