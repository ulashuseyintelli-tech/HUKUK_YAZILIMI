import { GuidedOpenObserveService } from "../guided-open-observe.service";
import { ActionCode } from "../../policy-engine/types/action-code.enum";
import {
  GuidedOpenDecision,
  DecisionSource,
  ActionClass,
} from "../../policy-engine/types/effective-permission.types";

/**
 * P2b-1 — GuidedOpenObserveService testleri.
 * KESİN KURAL: hiçbir aksiyonu engellemez (ALLOW + diagnostic only; best-effort).
 */

const sampleDecision = {
  mode: "observe" as const,
  enforced: false as const,
  decision: GuidedOpenDecision.CONFIRM_REQUIRED,
  decisionSource: DecisionSource.CONFIRM_REQUIRED,
  actionClass: ActionClass.L3,
  capacity: "LAWYER" as const,
  hasCaseMembership: true,
  caseGrantPresent: false,
  fullAuthority: false,
  wouldRequireConfirm: true,
  wouldRequireRoute: false,
  wouldRequireApproval: false,
  wouldRequireHardware: false,
  wouldDenyTenantBoundary: false,
  reason: "x",
};

describe("GuidedOpenObserveService — observe-mode (P2b-1)", () => {
  const prev = process.env.GUIDED_OPEN_AUTHZ_MODE;
  afterEach(() => {
    if (prev === undefined) delete process.env.GUIDED_OPEN_AUTHZ_MODE;
    else process.env.GUIDED_OPEN_AUTHZ_MODE = prev;
    jest.clearAllMocks();
  });

  const make = () => {
    const resolver = { resolve: jest.fn().mockResolvedValue(sampleDecision) };
    const audit = { log: jest.fn().mockResolvedValue(undefined) };
    const svc = new GuidedOpenObserveService(resolver as any, audit as any);
    return { svc, resolver, audit };
  };

  it("flag OFF (varsayılan) → resolver ÇAĞRILMAZ, audit YAZILMAZ (davranış değişmez)", async () => {
    delete process.env.GUIDED_OPEN_AUTHZ_MODE;
    const { svc, resolver, audit } = make();
    await svc.observe({ actorUserId: "u1", tenantId: "t1", caseId: "c1", actionCode: ActionCode.DELETE_CASE });
    expect(resolver.resolve).not.toHaveBeenCalled();
    expect(audit.log).not.toHaveBeenCalled();
  });

  it("flag 'off' açıkça → no-op", async () => {
    process.env.GUIDED_OPEN_AUTHZ_MODE = "off";
    const { svc, resolver, audit } = make();
    await svc.observe({ actorUserId: "u1", tenantId: "t1", caseId: "c1", actionCode: ActionCode.DELETE_CASE });
    expect(resolver.resolve).not.toHaveBeenCalled();
    expect(audit.log).not.toHaveBeenCalled();
  });

  it("flag 'observe' → resolver çağrılır + PERMISSION_OBSERVED audit (enforced=false, truthful actor)", async () => {
    process.env.GUIDED_OPEN_AUTHZ_MODE = "observe";
    const { svc, resolver, audit } = make();
    await svc.observe({ actorUserId: "u7", tenantId: "t1", caseId: "c1", actionCode: ActionCode.DELETE_CASE });
    expect(resolver.resolve).toHaveBeenCalledTimes(1);
    expect(audit.log).toHaveBeenCalledTimes(1);
    const arg = audit.log.mock.calls[0][0];
    expect(arg.action).toBe("PERMISSION_OBSERVED");
    expect(arg.entityType).toBe("PERMISSION");
    expect(arg.userId).toBe("u7");
    expect(arg.metadata.enforced).toBe(false);
    expect(arg.metadata.mode).toBe("observe");
    expect(arg.metadata.observePhase).toBe("pre_action");
    // domain success bayrakları OLMAMALI (observe ≠ business audit)
    expect(arg.metadata.success).toBeUndefined();
    expect(arg.metadata.completed).toBeUndefined();
    expect(arg.metadata.deleted).toBeUndefined();
    expect(arg.metadata.actorUserId).toBe("u7");
    expect(arg.metadata.actionCode).toBe(ActionCode.DELETE_CASE);
    expect(arg.metadata.decision).toBe(GuidedOpenDecision.CONFIRM_REQUIRED);
    expect(arg.metadata.wouldRequireConfirm).toBe(true);
  });

  it("P2b-2b-1: opts.targetRef verilince audit metadata.targetRef + entityId=targetRef (caseId YOKKEN)", async () => {
    process.env.GUIDED_OPEN_AUTHZ_MODE = "observe";
    const { svc, audit } = make();
    await svc.observe({ actorUserId: "u1", tenantId: "t1", actionCode: ActionCode.EDIT_PARTIES }, { targetRef: "cd-9" });
    const arg = audit.log.mock.calls[0][0];
    expect(arg.entityId).toBe("cd-9"); // caseId yok → targetRef
    expect(arg.metadata.targetRef).toBe("cd-9");
    expect(arg.metadata.caseId).toBeNull();
    expect(arg.metadata.actionCode).toBe(ActionCode.EDIT_PARTIES);
  });

  it("P2b-2b-1: opts geçilmezse targetRef metadata'da YOK + entityId=caseId (mevcut pilot audit şekli korunur)", async () => {
    process.env.GUIDED_OPEN_AUTHZ_MODE = "observe";
    const { svc, audit } = make();
    await svc.observe({ actorUserId: "u1", tenantId: "t1", caseId: "c1", actionCode: ActionCode.DELETE_CASE });
    const arg = audit.log.mock.calls[0][0];
    expect(arg.entityId).toBe("c1");
    expect("targetRef" in arg.metadata).toBe(false); // additive alan eklenmedi → geriye uyumlu
  });

  it("best-effort: audit.log THROW etse bile observe THROW ETMEZ", async () => {
    process.env.GUIDED_OPEN_AUTHZ_MODE = "observe";
    const resolver = { resolve: jest.fn().mockResolvedValue(sampleDecision) };
    const audit = { log: jest.fn().mockRejectedValue(new Error("db down")) };
    const svc = new GuidedOpenObserveService(resolver as any, audit as any);
    await expect(
      svc.observe({ actorUserId: "u1", tenantId: "t1", actionCode: ActionCode.DELETE_CASE }),
    ).resolves.toBeUndefined();
  });

  it("best-effort: resolver THROW etse bile observe THROW ETMEZ", async () => {
    process.env.GUIDED_OPEN_AUTHZ_MODE = "observe";
    const resolver = { resolve: jest.fn().mockRejectedValue(new Error("boom")) };
    const audit = { log: jest.fn() };
    const svc = new GuidedOpenObserveService(resolver as any, audit as any);
    await expect(
      svc.observe({ actorUserId: "u1", tenantId: "t1", actionCode: ActionCode.ASSIGN_LEGAL_RESPONSIBLE }),
    ).resolves.toBeUndefined();
    expect(audit.log).not.toHaveBeenCalled();
  });

  it("mode() default 'off'", () => {
    delete process.env.GUIDED_OPEN_AUTHZ_MODE;
    const { svc } = make();
    expect(svc.mode()).toBe("off");
  });
});
