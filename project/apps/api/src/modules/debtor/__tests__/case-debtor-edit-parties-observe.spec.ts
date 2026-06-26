import { CaseDebtorController } from "../case-debtor.controller";
import { GuidedOpenObserveService } from "../../permission-diagnostics/guided-open-observe.service";
import { ActionCode } from "../../policy-engine/types/action-code.enum";

/**
 * P2b-2b-1 — CaseDebtorController EDIT_PARTIES observe wiring testleri (controller-level, direct instantiation).
 * KESİN: observe-only (enforced=false observe servisinde), best-effort (mutation engellenmez), truthful actor/tenant
 * @CurrentUser'dan (body'den DEĞİL), update/remove hedefi caseDebtorId (targetRef). CHANGE_STATUS DOKUNULMADI.
 */

const makeController = (observe: { observe: jest.Mock }) => {
  const service: any = {
    addDebtorToCase: jest.fn().mockResolvedValue({ ok: "add" }),
    addMultipleDebtorsToCase: jest.fn().mockResolvedValue({ ok: "bulk" }),
    updateCaseDebtor: jest.fn().mockResolvedValue({ ok: "update" }),
    removeCaseDebtor: jest.fn().mockResolvedValue({ ok: "remove" }),
  };
  const controller = new CaseDebtorController(service, observe as unknown as GuidedOpenObserveService);
  return { controller, service };
};
const mockObserve = () => ({ observe: jest.fn().mockResolvedValue(undefined) });

describe("P2b-2b-1 EDIT_PARTIES observe — CaseDebtorController", () => {
  const prevMode = process.env.GUIDED_OPEN_AUTHZ_MODE;
  afterEach(() => {
    // testler arası env sızıntısını önle (sibling service spec ile aynı disiplin)
    if (prevMode === undefined) delete process.env.GUIDED_OPEN_AUTHZ_MODE;
    else process.env.GUIDED_OPEN_AUTHZ_MODE = prevMode;
  });

  it("1. add debtor → EDIT_PARTIES observe (caseId, truthful actor/tenant) + mutation yapılır", async () => {
    const observe = mockObserve();
    const { controller, service } = makeController(observe);
    const res = await controller.addDebtorToCase("u1", "t1", "case-1", { debtorId: "d1" } as any);
    expect(observe.observe).toHaveBeenCalledTimes(1);
    const [input, opts] = observe.observe.mock.calls[0];
    expect(input).toEqual({ actorUserId: "u1", tenantId: "t1", caseId: "case-1", actionCode: ActionCode.EDIT_PARTIES });
    expect(opts).toBeUndefined();
    expect(service.addDebtorToCase).toHaveBeenCalledWith("t1", "case-1", { debtorId: "d1" });
    expect(res).toEqual({ ok: "add" });
  });

  it("2. bulk add → EDIT_PARTIES observe (caseId) + mutation yapılır", async () => {
    const observe = mockObserve();
    const { controller, service } = makeController(observe);
    const res = await controller.addMultipleDebtorsToCase("u1", "t1", "case-1", [{ debtorId: "d1" }] as any);
    expect(observe.observe.mock.calls[0][0]).toEqual({ actorUserId: "u1", tenantId: "t1", caseId: "case-1", actionCode: ActionCode.EDIT_PARTIES });
    expect(service.addMultipleDebtorsToCase).toHaveBeenCalledWith("t1", "case-1", [{ debtorId: "d1" }]);
    expect(res).toEqual({ ok: "bulk" }); // observe return değerini değiştirmez
  });

  it("3. update debtor → EDIT_PARTIES observe (caseId YOK, targetRef=caseDebtorId) + mutation", async () => {
    const observe = mockObserve();
    const { controller, service } = makeController(observe);
    const res = await controller.updateCaseDebtor("u1", "t1", "cd-9", { note: "x" } as any);
    const [input, opts] = observe.observe.mock.calls[0];
    expect(input).toEqual({ actorUserId: "u1", tenantId: "t1", actionCode: ActionCode.EDIT_PARTIES });
    expect(input.caseId).toBeUndefined();
    expect(opts).toEqual({ targetRef: "cd-9" });
    expect(service.updateCaseDebtor).toHaveBeenCalledWith("t1", "cd-9", { note: "x" });
    expect(res).toEqual({ ok: "update" });
  });

  it("4. remove debtor → EDIT_PARTIES observe (targetRef=caseDebtorId) + mutation", async () => {
    const observe = mockObserve();
    const { controller, service } = makeController(observe);
    const res = await controller.removeCaseDebtor("t1", "u1", "cd-9");
    const [input, opts] = observe.observe.mock.calls[0];
    expect(input).toEqual({ actorUserId: "u1", tenantId: "t1", actionCode: ActionCode.EDIT_PARTIES });
    expect(opts).toEqual({ targetRef: "cd-9" });
    expect(service.removeCaseDebtor).toHaveBeenCalledWith("t1", "cd-9", "u1");
    expect(res).toEqual({ ok: "remove" });
  });

  it("5. observe FAILURE asıl mutation'ı ENGELLEMEZ (gerçek observe servisi; resolver+audit throw → best-effort)", async () => {
    process.env.GUIDED_OPEN_AUTHZ_MODE = "observe"; // afterEach geri yükler (try/finally gerekmez)
    const realObserve = new GuidedOpenObserveService(
      { resolve: jest.fn().mockRejectedValue(new Error("resolver boom")) } as any,
      { log: jest.fn().mockRejectedValue(new Error("audit boom")) } as any,
    );
    const { controller, service } = makeController(realObserve as any);
    const res = await controller.addDebtorToCase("u1", "t1", "case-1", { debtorId: "d1" } as any);
    expect(service.addDebtorToCase).toHaveBeenCalledTimes(1); // mutation YAPILDI (engellenmedi)
    expect(res).toEqual({ ok: "add" });
  });

  it("6. remove: truthful actor YOKSA observe edilmez (synthesize YOK), mutation yine yapılır", async () => {
    const observe = mockObserve();
    const { controller, service } = makeController(observe);
    await controller.removeCaseDebtor("t1", undefined, "cd-9");
    expect(observe.observe).not.toHaveBeenCalled();
    expect(service.removeCaseDebtor).toHaveBeenCalledWith("t1", "cd-9", undefined);
  });

  it("7/8. actor + tenant authenticated context'ten gelir (body'den DEĞİL); body/dto observe'a SIZMAZ", async () => {
    const observe = mockObserve();
    const { controller } = makeController(observe);
    // body'de sahte userId olsa bile observe'a yalnız @CurrentUser argümanı gider
    await controller.addDebtorToCase("real-user", "real-tenant", "case-1", { userId: "SPOOF", debtorId: "d1" } as any);
    const [input] = observe.observe.mock.calls[0];
    expect(input.actorUserId).toBe("real-user");
    expect(input.tenantId).toBe("real-tenant");
    expect(JSON.stringify(input)).not.toContain("SPOOF");
    expect(JSON.stringify(input)).not.toContain("d1");
  });
});
