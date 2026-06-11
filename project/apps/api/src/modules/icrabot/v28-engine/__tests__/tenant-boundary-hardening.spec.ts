/**
 * Phase 2 PR1 — boundary tenant hardening (DB-free unit)
 *
 * Doğrular (bridge KORUNUYOR; addEntry henüz fail-closed DEĞİL — bu PR1):
 *  - resolveTenantIdOrThrow: valid case → tenant; case yok / tenant null → throw.
 *  - action-handler.dispatch: action.tenantId varsa onu kullanır; null + valid caseId → resolve;
 *    null + invalid caseId → throw, timeline yazmaz, markSent çağrılmaz.
 *  - action-feedback.processCallback: invalid case_id → throw, timeline yazmaz.
 *  - uyap-event-ingest.ingestEvent: invalid caseId → throw, timeline yazmaz.
 */
import { resolveTenantIdOrThrow, TenantResolutionError } from '../tenant-resolver';
import { ActionHandlerService } from '../action-handler.service';
import { ActionFeedbackService } from '../action-feedback.service';
import { UyapEventIngestService } from '../uyap-event-ingest.service';
import { TimelineService } from '../timeline.service';

describe('Phase 2 PR1 — tenant boundary hardening', () => {
  describe('resolveTenantIdOrThrow', () => {
    it('valid case → tenantId döner', async () => {
      const db = { case: { findUnique: jest.fn().mockResolvedValue({ tenantId: 't1' }) } };
      await expect(resolveTenantIdOrThrow(db as any, 'c1')).resolves.toBe('t1');
    });
    it('case yok → TenantResolutionError', async () => {
      const db = { case: { findUnique: jest.fn().mockResolvedValue(null) } };
      await expect(resolveTenantIdOrThrow(db as any, 'cX')).rejects.toBeInstanceOf(TenantResolutionError);
    });
    it('tenantId null → TenantResolutionError (null yazma)', async () => {
      const db = { case: { findUnique: jest.fn().mockResolvedValue({ tenantId: null }) } };
      await expect(resolveTenantIdOrThrow(db as any, 'cZ')).rejects.toBeInstanceOf(TenantResolutionError);
    });
  });

  describe('ActionHandlerService.dispatch', () => {
    beforeAll(() => jest.useFakeTimers());
    afterAll(() => jest.useRealTimers());

    const build = (actionRow: any, caseTenant: { tenantId: string | null } | null) => {
      const prisma = {
        icrabotOutboxAction: { findUnique: jest.fn().mockResolvedValue(actionRow) },
        case: { findUnique: jest.fn().mockResolvedValue(caseTenant) },
      };
      const outbox = { markSent: jest.fn(), markDone: jest.fn(), markFailed: jest.fn() };
      const timeline = { addEntry: jest.fn().mockResolvedValue('tid') };
      const factStore = { write: jest.fn().mockResolvedValue(undefined) };
      const svc = new ActionHandlerService(prisma as any, outbox as any, timeline as any, factStore as any);
      svc.register('e2e', async () => ({ ok: true }));
      return { svc, prisma, outbox, timeline };
    };

    it('action.tenantId varsa onu kullanır (resolve YOK)', async () => {
      const { svc, prisma, timeline } = build(
        { id: 'a1', caseId: 'c1', tenantId: 'row-tenant', actionType: 'e2e', payload: {}, runId: null, attemptCount: 0 },
        null,
      );
      await svc.dispatch('a1');
      expect(prisma.case.findUnique).not.toHaveBeenCalled(); // satırda tenant var → resolve çağrılmaz
      for (const call of timeline.addEntry.mock.calls) expect(call[0].tenantId).toBe('row-tenant');
    });

    it('action.tenantId null + valid caseId → case.tenantId resolve', async () => {
      const { svc, prisma, timeline } = build(
        { id: 'a2', caseId: 'c2', tenantId: null, actionType: 'e2e', payload: {}, runId: null, attemptCount: 0 },
        { tenantId: 'resolved-tenant' },
      );
      await svc.dispatch('a2');
      expect(prisma.case.findUnique).toHaveBeenCalledWith({ where: { id: 'c2' }, select: { tenantId: true } });
      for (const call of timeline.addEntry.mock.calls) expect(call[0].tenantId).toBe('resolved-tenant');
    });

    it('action.tenantId null + invalid caseId → throw, timeline yazmaz, markSent çağrılmaz', async () => {
      const { svc, outbox, timeline } = build(
        { id: 'a3', caseId: 'bad', tenantId: null, actionType: 'e2e', payload: {}, runId: null, attemptCount: 0 },
        null, // case bulunamadı
      );
      await expect(svc.dispatch('a3')).rejects.toBeInstanceOf(TenantResolutionError);
      expect(outbox.markSent).not.toHaveBeenCalled();
      expect(timeline.addEntry).not.toHaveBeenCalled();
    });
  });

  describe('ActionFeedbackService.processCallback', () => {
    it('invalid case_id → throw, timeline yazmaz', async () => {
      const prisma = { case: { findUnique: jest.fn().mockResolvedValue(null) } };
      const timeline = { addEntry: jest.fn() };
      const factStore = { write: jest.fn() };
      const svc = new ActionFeedbackService(factStore as any, timeline as any, prisma as any);
      await expect(svc.processCallback({ case_id: 'bad', kind: 'x' })).rejects.toBeInstanceOf(TenantResolutionError);
      expect(timeline.addEntry).not.toHaveBeenCalled();
    });
  });

  describe('TimelineService.addEntry — fail-closed (PR2 bridge removal)', () => {
    it('tenantId yoksa throw; $transaction yazmaz; case lookup (bridge) yok', async () => {
      const prisma = { $transaction: jest.fn(), case: { findUnique: jest.fn() } };
      const svc = new TimelineService(prisma as any);
      await expect(
        svc.addEntry({ caseId: 'c1', type: 'NOTE', title: 'x' } as any),
      ).rejects.toThrow(/timeline_tenant_required/);
      expect(prisma.$transaction).not.toHaveBeenCalled(); // yazım yok
      expect(prisma.case.findUnique).not.toHaveBeenCalled(); // bridge kaldırıldı
    });
  });

  describe('UyapEventIngestService.ingestEvent', () => {
    it('invalid caseId → throw, timeline yazmaz', async () => {
      const prisma = { case: { findUnique: jest.fn().mockResolvedValue(null) } };
      const factStore = { write: jest.fn() };
      const timeline = { addEntry: jest.fn() };
      const engineRunner = { runRulesForEvent: jest.fn() };
      const ruleLoader = { getActiveRules: jest.fn().mockResolvedValue([]) };
      const svc = new UyapEventIngestService(prisma as any, factStore as any, timeline as any, engineRunner as any, ruleLoader as any);
      await expect(svc.ingestEvent({ event_id: 'e', case_id: 'bad', type: 'X' } as any)).rejects.toBeInstanceOf(TenantResolutionError);
      expect(timeline.addEntry).not.toHaveBeenCalled();
    });
  });
});
