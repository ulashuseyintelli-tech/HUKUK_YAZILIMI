/** @jest-environment node */
import "reflect-metadata";
import { BadRequestException, ServiceUnavailableException } from "@nestjs/common";
import { GuidedEdgeGateService } from "../guided-edge-gate.service";
import { GuidedOpenDecision } from "../../../policy-engine/types/effective-permission.types";
import { ActionCode } from "../../../policy-engine/types/action-code.enum";

/**
 * P3-2C — Guided-Edge confirm GATE testleri.
 * KESİN: VARSAYILAN OFF → her zaman PROCEED (resolver/token HİÇ çağrılmaz). Flag açıkken yalnız CONFIRM_REQUIRED
 * zarflanır (issue + structured envelope); retry token consume → proceed/400; ham payload zarfa SIZMAZ.
 */

const ISSUED = {
  token: "go.confirm.v1.PAYLOAD.SIG",
  expiresAt: "2030-01-01T00:00:00.000Z",
  bindingHash: "bh-deadbeef",
  nonce: "nonce-1",
  auditRef: "nonce-1",
};

const make = (opts: {
  flag?: string;
  decision?: GuidedOpenDecision;
  consume?: { ok: boolean; result: string };
  secret?: boolean; // P3-2D-0: isSecretConfigured() dönüşü (varsayılan true = secret yapılandırılmış)
}) => {
  const config = {
    get: jest.fn().mockImplementation((k: string) => (k === "GUIDED_OPEN_CONFIRM_GATE" ? opts.flag : undefined)),
  };
  const resolver = {
    resolve: jest.fn().mockResolvedValue({
      decision: opts.decision ?? GuidedOpenDecision.ALLOW,
      decisionSource: "BASELINE_OPEN",
    }),
  };
  const tokens = {
    issue: jest.fn().mockResolvedValue(ISSUED),
    consume: jest.fn().mockResolvedValue(opts.consume ?? { ok: true, result: "CONSUMED" }),
    isSecretConfigured: jest.fn().mockReturnValue(opts.secret ?? true),
  };
  const svc = new GuidedEdgeGateService(config as never, resolver as never, tokens as never);
  return { svc, config, resolver, tokens };
};

const baseInput = {
  actorUserId: "u1",
  tenantId: "t1",
  actionCode: ActionCode.CHANGE_STATUS,
  caseId: "c1",
  surface: "POST /case-status/:caseId/change",
  payload: { status: "HITAM", reason: null as string | null },
};

describe("P3-2C — GuidedEdgeGateService.gateEnabled (flag semantiği)", () => {
  it("flag yok / 'off' / boş → kapalı; 'on' → açık; tam aksiyon-adı (case-insensitive) → açık; başka aksiyon → kapalı", () => {
    expect(make({ flag: undefined }).svc.gateEnabled("CHANGE_STATUS")).toBe(false);
    expect(make({ flag: "off" }).svc.gateEnabled("CHANGE_STATUS")).toBe(false);
    expect(make({ flag: "  " }).svc.gateEnabled("CHANGE_STATUS")).toBe(false);
    expect(make({ flag: "on" }).svc.gateEnabled("CHANGE_STATUS")).toBe(true);
    expect(make({ flag: "CHANGE_STATUS" }).svc.gateEnabled("CHANGE_STATUS")).toBe(true);
    expect(make({ flag: "change_status" }).svc.gateEnabled("CHANGE_STATUS")).toBe(true);
    expect(make({ flag: "CHANGE_STATUS" }).svc.gateEnabled("DELETE_CASE")).toBe(false);
  });
});

describe("P3-2C — GuidedEdgeGateService.evaluate VARSAYILAN OFF", () => {
  it("flag kapalı → PROCEED; resolver ve token HİÇ çağrılmaz (sıfır yan-etki/latency)", async () => {
    const { svc, resolver, tokens } = make({ flag: undefined });
    const res = await svc.evaluate(baseInput);
    expect(res).toEqual({ kind: "PROCEED" });
    expect(resolver.resolve).not.toHaveBeenCalled();
    expect(tokens.issue).not.toHaveBeenCalled();
    expect(tokens.consume).not.toHaveBeenCalled();
  });

  it("flag kapalı + confirmationToken verilse bile → PROCEED, consume çağrılmaz", async () => {
    const { svc, tokens } = make({ flag: "off" });
    const res = await svc.evaluate({ ...baseInput, confirmationToken: "tok" });
    expect(res).toEqual({ kind: "PROCEED" });
    expect(tokens.consume).not.toHaveBeenCalled();
  });
});

describe("P3-2C — GuidedEdgeGateService.evaluate ISSUE yolu (flag açık)", () => {
  it("karar ALLOW → PROCEED (issue ÇAĞRILMAZ; hard-deny yok, default-open korunur)", async () => {
    const { svc, resolver, tokens } = make({ flag: "on", decision: GuidedOpenDecision.ALLOW });
    const res = await svc.evaluate(baseInput);
    expect(res).toEqual({ kind: "PROCEED" });
    expect(resolver.resolve).toHaveBeenCalledTimes(1);
    expect(tokens.issue).not.toHaveBeenCalled();
  });

  it("karar CONFIRM_REQUIRED → ENVELOPE + issue; zarf FE detektör kontratına uyar", async () => {
    const { svc, tokens } = make({ flag: "on", decision: GuidedOpenDecision.CONFIRM_REQUIRED });
    const res = await svc.evaluate(baseInput);
    expect(res.kind).toBe("ENVELOPE");
    expect(tokens.issue).toHaveBeenCalledTimes(1);
    if (res.kind !== "ENVELOPE") throw new Error("envelope bekleniyordu");
    const e = res.envelope;
    expect(e.axis).toBe("GUIDED_OPEN_PERMISSION"); // FE isGuardedEdgeOutcomeEnvelope ayırt edici
    expect(e.outcome).toBe(GuidedOpenDecision.CONFIRM_REQUIRED); // FE isConfirmRequiredEnvelope
    expect(e.actionCode).toBe(ActionCode.CHANGE_STATUS);
    expect(e.target).toEqual({ resourceType: "LegalCase", caseId: "c1" });
    expect(e.confirmation).toEqual({ token: ISSUED.token, expiresAt: ISSUED.expiresAt, bindingHash: ISSUED.bindingHash });
    expect(typeof e.message).toBe("string");
  });

  it("issue binding: surface/targetRef/actionCode + payloadHash (64-hex, deterministik) doğru bağlanır", async () => {
    const { svc, tokens } = make({ flag: "on", decision: GuidedOpenDecision.CONFIRM_REQUIRED });
    await svc.evaluate(baseInput);
    const binding = tokens.issue.mock.calls[0][0];
    expect(binding.surface).toBe("POST /case-status/:caseId/change");
    expect(binding.targetRef).toBe("c1");
    expect(binding.actionCode).toBe(ActionCode.CHANGE_STATUS);
    expect(binding.tenantId).toBe("t1");
    expect(binding.actorUserId).toBe("u1");
    expect(binding.payloadHash).toMatch(/^[0-9a-f]{64}$/);
    // aynı payload → aynı hash (issue↔consume eşleşmesi)
    const { svc: svc2, tokens: tokens2 } = make({ flag: "on", decision: GuidedOpenDecision.CONFIRM_REQUIRED });
    await svc2.evaluate(baseInput);
    expect(tokens2.issue.mock.calls[0][0].payloadHash).toBe(binding.payloadHash);
  });

  it("GİZLİLİK: zarf + issue binding ham status/reason değerini İÇERMEZ (yalnız hash)", async () => {
    const { svc, tokens } = make({ flag: "on", decision: GuidedOpenDecision.CONFIRM_REQUIRED });
    const res = await svc.evaluate({ ...baseInput, payload: { status: "HITAM", reason: "GIZLI_GEREKCE" } });
    if (res.kind !== "ENVELOPE") throw new Error("envelope bekleniyordu");
    const blob = JSON.stringify(res.envelope) + JSON.stringify(tokens.issue.mock.calls[0][0]);
    expect(blob).not.toContain("GIZLI_GEREKCE");
    expect(blob).not.toContain("HITAM");
  });

  it("diğer outcome (ROUTE_REQUIRED/APPROVAL_REQUIRED/DENY_TENANT_BOUNDARY) → PROCEED (yalnız CONFIRM_REQUIRED zarflanır)", async () => {
    for (const d of [GuidedOpenDecision.ROUTE_REQUIRED, GuidedOpenDecision.APPROVAL_REQUIRED, GuidedOpenDecision.DENY_TENANT_BOUNDARY]) {
      const { svc, tokens } = make({ flag: "on", decision: d });
      const res = await svc.evaluate(baseInput);
      expect(res).toEqual({ kind: "PROCEED" });
      expect(tokens.issue).not.toHaveBeenCalled();
    }
  });
});

describe("P3-2C — GuidedEdgeGateService.evaluate CONSUME yolu (retry)", () => {
  it("geçerli token (CONSUMED) → PROCEED; resolver/issue ÇAĞRILMAZ", async () => {
    const { svc, resolver, tokens } = make({ flag: "on", consume: { ok: true, result: "CONSUMED" } });
    const res = await svc.evaluate({ ...baseInput, confirmationToken: "go.confirm.v1.A.B" });
    expect(res).toEqual({ kind: "PROCEED" });
    expect(tokens.consume).toHaveBeenCalledTimes(1);
    expect(resolver.resolve).not.toHaveBeenCalled();
    expect(tokens.issue).not.toHaveBeenCalled();
  });

  it("consume binding token ile aynı surface/target/payloadHash'e bağlanır", async () => {
    const { svc, tokens } = make({ flag: "on", consume: { ok: true, result: "CONSUMED" } });
    await svc.evaluate({ ...baseInput, confirmationToken: "go.confirm.v1.A.B" });
    const [token, binding] = tokens.consume.mock.calls[0];
    expect(token).toBe("go.confirm.v1.A.B");
    expect(binding.surface).toBe("POST /case-status/:caseId/change");
    expect(binding.targetRef).toBe("c1");
    expect(binding.payloadHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it.each(["EXPIRED", "MISMATCH", "FORGED", "REPLAY"])(
    "geçersiz token (%s) → BadRequestException (400, NO 500); statü değişmez",
    async (result) => {
      const { svc } = make({ flag: "on", consume: { ok: false, result } });
      await expect(svc.evaluate({ ...baseInput, confirmationToken: "bad" })).rejects.toBeInstanceOf(BadRequestException);
    },
  );

  it("geçersiz token mesajı sonuç kodunu taşır (teşhis edilebilir 400)", async () => {
    const { svc } = make({ flag: "on", consume: { ok: false, result: "EXPIRED" } });
    await expect(svc.evaluate({ ...baseInput, confirmationToken: "bad" })).rejects.toThrow(/EXPIRED/);
  });
});

describe("P3-2D-0 — missing-secret typed guard (enable preflight)", () => {
  it("gate OFF + secret YOK → PROCEED; isSecretConfigured HİÇ çağrılmaz (off davranışı değişmez)", async () => {
    const { svc, tokens } = make({ flag: undefined, secret: false });
    const res = await svc.evaluate(baseInput);
    expect(res).toEqual({ kind: "PROCEED" });
    expect(tokens.isSecretConfigured).not.toHaveBeenCalled();
  });

  it("gate ON + ALLOW + secret YOK → PROCEED; token üretilmez, secret kontrolü ÇAĞRILMAZ (gereksiz 503 yok)", async () => {
    const { svc, tokens } = make({ flag: "on", decision: GuidedOpenDecision.ALLOW, secret: false });
    const res = await svc.evaluate(baseInput);
    expect(res).toEqual({ kind: "PROCEED" });
    expect(tokens.isSecretConfigured).not.toHaveBeenCalled();
    expect(tokens.issue).not.toHaveBeenCalled();
  });

  it("gate ON + CONFIRM_REQUIRED + secret YOK → ServiceUnavailableException (503); issue ÇAĞRILMAZ (plain 500 yok)", async () => {
    const { svc, tokens } = make({ flag: "on", decision: GuidedOpenDecision.CONFIRM_REQUIRED, secret: false });
    await expect(svc.evaluate(baseInput)).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(tokens.issue).not.toHaveBeenCalled();
  });

  it("gate ON + consume (token) + secret YOK → ServiceUnavailableException (503); consume ÇAĞRILMAZ", async () => {
    const { svc, tokens } = make({ flag: "on", secret: false });
    await expect(
      svc.evaluate({ ...baseInput, confirmationToken: "go.confirm.v1.A.B" }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(tokens.consume).not.toHaveBeenCalled();
  });

  it("503 mesajı güvenli/sabit; secret değeri SIZMAZ", async () => {
    const { svc } = make({ flag: "on", decision: GuidedOpenDecision.CONFIRM_REQUIRED, secret: false });
    await expect(svc.evaluate(baseInput)).rejects.toThrow("Confirmation token secret is not configured");
  });

  it("gate ON + CONFIRM_REQUIRED + secret VAR → ENVELOPE (mevcut davranış bozulmaz); isSecretConfigured çağrılır", async () => {
    const { svc, tokens } = make({ flag: "on", decision: GuidedOpenDecision.CONFIRM_REQUIRED, secret: true });
    const res = await svc.evaluate(baseInput);
    expect(res.kind).toBe("ENVELOPE");
    expect(tokens.isSecretConfigured).toHaveBeenCalled();
    expect(tokens.issue).toHaveBeenCalledTimes(1);
  });

  it("gate ON + consume + secret VAR → PROCEED (mevcut consume davranışı bozulmaz)", async () => {
    const { svc, tokens } = make({ flag: "on", secret: true, consume: { ok: true, result: "CONSUMED" } });
    const res = await svc.evaluate({ ...baseInput, confirmationToken: "go.confirm.v1.A.B" });
    expect(res).toEqual({ kind: "PROCEED" });
    expect(tokens.consume).toHaveBeenCalledTimes(1);
  });
});
