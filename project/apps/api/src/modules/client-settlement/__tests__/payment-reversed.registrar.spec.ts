/**
 * TM3 M1R — PaymentReversedRegistrar testleri.
 * - 'EVENT_PUBLISHED:PAYMENT_REVERSED' EXACT key ile register edilir.
 * - PAYMENT_RECEIVED ve PAYMENT_REVERSED AYRI exact key'lerdir → çakışma YOK, biri diğerini
 *   overwrite ETMEZ (registry collision testi).
 * - Register edilen handler reverseFromPaymentReversed'e delege eder (payload/caseId/context geçişi).
 */
import { PaymentReversedRegistrar } from '../payment-reversed.registrar';
import { PaymentReceivedRegistrar } from '../payment-received.registrar';

/** ActionHandlerService.register/getRegisteredHandlers davranışını taklit eden hafif sahte registry. */
function buildFakeActionHandler() {
  const handlers = new Map<string, any>();
  return {
    register: jest.fn((actionType: string, handler: any) => handlers.set(actionType, handler)),
    getRegisteredHandlers: () => Array.from(handlers.keys()),
    get: (k: string) => handlers.get(k),
    handlers,
  } as any;
}

describe('PaymentReversedRegistrar', () => {
  it("EXACT key 'EVENT_PUBLISHED:PAYMENT_REVERSED' register eder", () => {
    const ah = buildFakeActionHandler();
    const reversalService = { reverseFromPaymentReversed: jest.fn() } as any;

    new PaymentReversedRegistrar(ah, reversalService).onModuleInit();

    expect(ah.register).toHaveBeenCalledTimes(1);
    expect(ah.register).toHaveBeenCalledWith('EVENT_PUBLISHED:PAYMENT_REVERSED', expect.any(Function));
    expect(ah.getRegisteredHandlers()).toContain('EVENT_PUBLISHED:PAYMENT_REVERSED');
  });

  it('register edilen handler reverseFromPaymentReversed(payload, caseId, context) çağırır', async () => {
    const ah = buildFakeActionHandler();
    const reversalService = { reverseFromPaymentReversed: jest.fn().mockResolvedValue({ outcome: 'reversed' }) } as any;

    new PaymentReversedRegistrar(ah, reversalService).onModuleInit();
    const handler = ah.get('EVENT_PUBLISHED:PAYMENT_REVERSED');
    const ctx = { actionId: 'a1', tenantId: 't1', actionType: 'EVENT_PUBLISHED:PAYMENT_REVERSED' };
    const out = await handler({ collectionId: 'col1' }, 'case1', ctx);

    expect(reversalService.reverseFromPaymentReversed).toHaveBeenCalledWith({ collectionId: 'col1' }, 'case1', ctx);
    expect(out).toEqual({ outcome: 'reversed' });
  });

  it('registry collision YOK: PAYMENT_RECEIVED ve PAYMENT_REVERSED ayrı exact key, biri diğerini ezmez', () => {
    const ah = buildFakeActionHandler();
    const dispositionService = { createDraftFromPaymentReceived: jest.fn() } as any;
    const reversalService = { reverseFromPaymentReversed: jest.fn() } as any;

    // M1 + M1R aynı registry'ye register olur (gerçek modül davranışı).
    new PaymentReceivedRegistrar(ah, dispositionService).onModuleInit();
    new PaymentReversedRegistrar(ah, reversalService).onModuleInit();

    const keys = ah.getRegisteredHandlers();
    expect(keys).toContain('EVENT_PUBLISHED:PAYMENT_RECEIVED');
    expect(keys).toContain('EVENT_PUBLISHED:PAYMENT_REVERSED');
    // İki AYRI key — handler'lar farklı referanslar (overwrite yok).
    expect(ah.get('EVENT_PUBLISHED:PAYMENT_RECEIVED')).not.toBe(ah.get('EVENT_PUBLISHED:PAYMENT_REVERSED'));
  });
});
