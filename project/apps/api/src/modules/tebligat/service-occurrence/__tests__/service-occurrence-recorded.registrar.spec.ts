/**
 * DEBTOR-OF01-HISTORY-P04-C-I01 — ServiceOccurrenceRecordedRegistrar testleri.
 * PaymentReversedRegistrar testleri (client-settlement) emsali: EXACT key register + delegasyon.
 */
import { ServiceOccurrenceRecordedRegistrar } from "../service-occurrence-recorded.registrar";

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

describe("ServiceOccurrenceRecordedRegistrar", () => {
  it("EXACT key 'EVENT_PUBLISHED:SERVICE_OCCURRENCE_RECORDED' register eder", () => {
    const ah = buildFakeActionHandler();
    const consumerService = { handle: jest.fn() } as any;

    new ServiceOccurrenceRecordedRegistrar(ah, consumerService).onModuleInit();

    expect(ah.register).toHaveBeenCalledTimes(1);
    expect(ah.register).toHaveBeenCalledWith("EVENT_PUBLISHED:SERVICE_OCCURRENCE_RECORDED", expect.any(Function));
    expect(ah.getRegisteredHandlers()).toContain("EVENT_PUBLISHED:SERVICE_OCCURRENCE_RECORDED");
  });

  it("register edilen handler consumerService.handle(payload, caseId, context) çağırır", async () => {
    const ah = buildFakeActionHandler();
    const consumerService = { handle: jest.fn().mockResolvedValue(undefined) } as any;

    new ServiceOccurrenceRecordedRegistrar(ah, consumerService).onModuleInit();
    const handler = ah.get("EVENT_PUBLISHED:SERVICE_OCCURRENCE_RECORDED");
    const ctx = { actionId: "a1", tenantId: "t1", actionType: "EVENT_PUBLISHED:SERVICE_OCCURRENCE_RECORDED" };
    const out = await handler({ timelineEntryId: "tl-1" }, "case1", ctx);

    expect(consumerService.handle).toHaveBeenCalledWith({ timelineEntryId: "tl-1" }, "case1", ctx);
    expect(out).toBeUndefined();
  });
});
