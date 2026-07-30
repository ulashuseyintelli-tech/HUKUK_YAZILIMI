/**
 * Phase 2 PR1 — boundary tenant hardening (DB-free unit)
 *
 * Doğrular (Adım C: action-handler outbox-fallback KALDIRILDI; boundary resolve KORUNUR):
 *  - resolveTenantIdOrThrow: valid case → tenant; case yok / tenant null → throw (boundary'lerde kullanılır).
 *  - action-handler.dispatch: action.tenantId'yi DOĞRUDAN kullanır (outbox.tenantId DB-NOT NULL); FALLBACK-resolve YOK.
 *  - action-feedback.processCallback: invalid case_id → throw, timeline yazmaz.
 *  - uyap-event-ingest.ingestEvent: invalid caseId → throw, timeline yazmaz.
 *
 * W3-F02-OUTBOX-CONSUMER-TENANT-OWNERSHIP-R01 notu: "Adım C"nin kaldırdığı şey EKSİK
 * bir tenantId'yi caseId'den TÜRETEN fallback-resolution'dı (bkz. tenant-resolver.ts
 * `resolveTenantIdOrThrow`, YALNIZ tenantId eksikken çağrılır). W3-F02 bunun YERİNE
 * GEÇMEZ — HALİHAZIRDA VAR olan `action.tenantId`'nin GERÇEK Case sahipliğiyle
 * eşleştiğini dogrular (outbox-action-ownership.ts `resolveOutboxActionOwnership`).
 * Bu yüzden `prisma.case.findUnique` ARTIK dispatch içinde çağrılır — ama bir DEĞER
 * ÇÖZMEK için değil, VAR OLAN değerin doğruluğunu KANITLAMAK için. Aşağıdaki
 * "resolve YOK" testi bu ayrımı yansıtacak şekilde güncellenmiştir.
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

    it('action.tenantId varsa onu DOĞRUDAN kullanır (fallback-resolve YOK); Case ownership AYRICA doğrulanır', async () => {
      const { svc, prisma, timeline } = build(
        { id: 'a1', caseId: 'c1', tenantId: 'row-tenant', actionType: 'e2e', payload: {}, runId: null, attemptCount: 0 },
        { tenantId: 'row-tenant' }, // W3-F02: Case sahipliği action.tenantId ile EŞLEŞİR
      );
      await svc.dispatch('a1', { kind: 'platform' } as const);
      // W3-F02: case lookup ARTIK gerçekleşir — ama action.tenantId'yi DEĞİŞTİRMEK için
      // değil (timeline hâlâ satırın KENDİ tenantId'sini taşır, aşağıda doğrulanır),
      // GERÇEK Case sahipliğiyle eşleştiğini KANITLAMAK için (ownership invariant).
      expect(prisma.case.findUnique).toHaveBeenCalledTimes(1);
      for (const call of timeline.addEntry.mock.calls) expect(call[0].tenantId).toBe('row-tenant');
    });

    // (Adım C) "action.tenantId null → caseId resolve" ve "null + invalid caseId → throw"
    // testleri KALDIRILDI: outbox.tenantId DB-NOT NULL (Adım B) → null tenant satırı DB'de imkânsız;
    // action-handler caseId→tenant FALLBACK'i de kaldırıldı (bridge full removal). Yukarıdaki test
    // artık dispatch'in case.findUnique'i tam olarak BİR KEZ, ownership doğrulaması için
    // çağırdığını doğrular (bkz. outbox-consumer-tenant-ownership.spec.ts — mismatch/not-found
    // senaryoları orada).
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
