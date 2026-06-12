/**
 * StateMachine - APPROVE_EXPENSE allowedAction (P1a)
 *
 * APPROVE_EXPENSE, REQUEST_EXPENSE gibi non-transitioning bir allowedAction olmalı:
 * masraf talebinin yapılabildiği (terminal olmayan) stage'lerde izinli, workflow stage'i
 * DEĞİŞTİRMEZ. Bu test, state-flows.compiled.ts'e eklenen kapsamı doğrular.
 *
 * canTransition saf bir fonksiyondur (prisma kullanmaz) → servis null prisma ile kurulur.
 */
import { StateMachineService } from '../state-machine.service';
import { ActionCode } from '../../types/action-code.enum';
import { Scope } from '../../types/scope.enum';
import { StateInfo } from '../../types/policy-decision.interface';
import { IcraType } from '../state-machine.types';

describe('StateMachineService - APPROVE_EXPENSE allowedAction (P1a)', () => {
  const sm = new StateMachineService(null as any);

  const state = (stage: string): StateInfo => ({
    scope: Scope.CASE,
    currentState: stage,
    version: 1,
  });

  // REQUEST_EXPENSE ile birebir aynı (mirror) stage'ler
  const GENEL_STAGES = [
    'INITIAL',
    'UYAP_SENT',
    'PAYMENT_ORDER_SENT',
    'NOTIFICATION_DELIVERED',
    'ENFORCEMENT_REQUESTED',
    'HACIZ_APPLIED',
    'SALE_REQUESTED',
  ];
  const KAMBIYO_STAGES = ['INITIAL', 'UYAP_SENT'];

  describe.each(GENEL_STAGES)('ILAMSIZ_GENEL @ %s', (stage) => {
    it('APPROVE_EXPENSE izinli ve state değişmez', () => {
      const r = sm.canTransition(state(stage), ActionCode.APPROVE_EXPENSE, IcraType.ILAMSIZ_GENEL);
      expect(r.allowed).toBe(true);
      expect(r.targetState).toBe(stage); // non-transitioning: hedef = mevcut state
    });
  });

  describe.each(KAMBIYO_STAGES)('ILAMSIZ_KAMBIYO @ %s', (stage) => {
    it('APPROVE_EXPENSE izinli ve state değişmez', () => {
      const r = sm.canTransition(state(stage), ActionCode.APPROVE_EXPENSE, IcraType.ILAMSIZ_KAMBIYO);
      expect(r.allowed).toBe(true);
      expect(r.targetState).toBe(stage);
    });
  });

  it('terminal stage (CLOSED_PAID) APPROVE_EXPENSE bloklanır', () => {
    const r = sm.canTransition(state('CLOSED_PAID'), ActionCode.APPROVE_EXPENSE, IcraType.ILAMSIZ_GENEL);
    expect(r.allowed).toBe(false);
  });

  it('mirror dışı non-terminal (COLLECTION_PENDING) hâlâ izinli değil (P1a kapsamı dışı)', () => {
    // Bu stage'de REQUEST_EXPENSE de yok; mirror gereği APPROVE_EXPENSE de eklenmedi.
    const r = sm.canTransition(state('COLLECTION_PENDING'), ActionCode.APPROVE_EXPENSE, IcraType.ILAMSIZ_GENEL);
    expect(r.allowed).toBe(false);
  });
});
