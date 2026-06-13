/**
 * İtiraz süresi - icra türüne göre (P2)
 *
 * Kambiyo senetlerine özgü takipte (İİK m.168) 5 gün, ilamsız genelde (İİK m.62) 7 gün.
 * Tek kaynak: computed fact `case.objection_period_days`. Gate (OBJECTION_PERIOD_NOT_PASSED)
 * ve öneri-rule bu fact'i kullanır.
 */
import { ComputedFactRegistry } from '../fact-store/computed-fact-registry';
import { UyapAvailabilityService } from '../fact-store/uyap-availability.service';
import { GateCheckerService } from '../gate-checker/gate-checker.service';
import { ActionCode } from '../types/action-code.enum';
import type { FactMap, FactValue } from '../fact-store';

describe('İtiraz süresi - case.objection_period_days (P2)', () => {
  describe('ComputedFactRegistry: objection_period_days', () => {
    let registry: ComputedFactRegistry;

    beforeEach(() => {
      registry = new ComputedFactRegistry(new UyapAvailabilityService());
      registry.onModuleInit(); // built-in provider'ları kaydet
    });

    it('kambiyo (ILAMSIZ + KAMBIYO) → 5 gün', async () => {
      const base: FactMap = new Map<string, FactValue>([
        ['case.type', 'ILAMSIZ'],
        ['case.sub_type', 'KAMBIYO'],
      ]);
      const facts = await registry.computeAll('case-1', undefined, base);
      expect(facts.get('case.objection_period_days')).toBe(5);
    });

    it('ilamsız genel (ILAMSIZ + GENEL) → 7 gün', async () => {
      const base: FactMap = new Map<string, FactValue>([
        ['case.type', 'ILAMSIZ'],
        ['case.sub_type', 'GENEL'],
      ]);
      const facts = await registry.computeAll('case-1', undefined, base);
      expect(facts.get('case.objection_period_days')).toBe(7);
    });

    it('tür bilgisi yok → default 7 gün', async () => {
      const facts = await registry.computeAll('case-1', undefined, new Map());
      expect(facts.get('case.objection_period_days')).toBe(7);
    });
  });

  describe('OBJECTION_PERIOD_NOT_PASSED gate (GateCheckerService)', () => {
    const gc = new GateCheckerService();

    // Diğer HARD gate'leri (NOTIFICATION_NOT_DELIVERED vb.) geçecek temel fact'ler
    const baseFacts = (extra: Record<string, FactValue>): FactMap =>
      new Map<string, FactValue>([
        ['case.any_notification_delivered', true],
        ...Object.entries(extra),
      ]);

    it('kambiyo (period=5): 5 gün → bloklanmaz', async () => {
      const r = await gc.checkGates(
        'case-1',
        ActionCode.TRIGGER_HACIZ,
        baseFacts({ 'case.objection_period_days': 5, 'case.min_days_since_notification': 5 }),
      );
      expect(r.blocked).toBe(false);
    });

    it('kambiyo (period=5): 6 gün → bloklanmaz', async () => {
      const r = await gc.checkGates(
        'case-1',
        ActionCode.TRIGGER_HACIZ,
        baseFacts({ 'case.objection_period_days': 5, 'case.min_days_since_notification': 6 }),
      );
      expect(r.blocked).toBe(false);
    });

    it('kambiyo (period=5): 4 gün → OBJECTION_PERIOD_NOT_PASSED ile bloklanır', async () => {
      const r = await gc.checkGates(
        'case-1',
        ActionCode.TRIGGER_HACIZ,
        baseFacts({ 'case.objection_period_days': 5, 'case.min_days_since_notification': 4 }),
      );
      expect(r.blocked).toBe(true);
      expect(r.gateCode).toBe('OBJECTION_PERIOD_NOT_PASSED');
    });

    it('default (fact yok → period=7): 6 gün → bloklanır', async () => {
      const r = await gc.checkGates(
        'case-1',
        ActionCode.TRIGGER_HACIZ,
        baseFacts({ 'case.min_days_since_notification': 6 }),
      );
      expect(r.blocked).toBe(true);
      expect(r.gateCode).toBe('OBJECTION_PERIOD_NOT_PASSED');
    });

    it('default (period=7): 7 gün → bloklanmaz', async () => {
      const r = await gc.checkGates(
        'case-1',
        ActionCode.TRIGGER_HACIZ,
        baseFacts({ 'case.min_days_since_notification': 7 }),
      );
      expect(r.blocked).toBe(false);
    });
  });
});
