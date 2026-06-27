import { describe, it, expect, vi } from "vitest";
import {
  isGuardedEdgeOutcomeEnvelope,
  isConfirmRequiredEnvelope,
  extractConfirmation,
  runGuarded,
  type GuardedEdgeOutcomeEnvelope,
} from "../guarded-edge";

const confirmEnv: GuardedEdgeOutcomeEnvelope = {
  axis: "GUIDED_OPEN_PERMISSION",
  outcome: "CONFIRM_REQUIRED",
  actionCode: "CHANGE_STATUS",
  target: { resourceType: "CASE", caseId: "c1" },
  message: "Bu statü değişikliği için onay gerekiyor.",
  confirmation: { token: "go.confirm.v1.x.y", expiresAt: "2026-01-01T00:00:00Z", bindingHash: "abc" },
};

describe("guarded-edge detectors", () => {
  it("normal {success,data,message} yanıtını ENVELOPE SANMAZ (yanlış pozitif yok)", () => {
    expect(isGuardedEdgeOutcomeEnvelope({ success: true, data: { id: "c1" }, message: "ok" })).toBe(false);
    expect(isGuardedEdgeOutcomeEnvelope({ id: "c1", caseStatus: "DERDEST" })).toBe(false);
    expect(isGuardedEdgeOutcomeEnvelope(null)).toBe(false);
    expect(isGuardedEdgeOutcomeEnvelope("CONFIRM_REQUIRED")).toBe(false);
  });

  it("geçerli zarfı tanır; axis/outcome/actionCode/target eksikse tanımaz", () => {
    expect(isGuardedEdgeOutcomeEnvelope(confirmEnv)).toBe(true);
    expect(isGuardedEdgeOutcomeEnvelope({ ...confirmEnv, axis: "VALIDITY" })).toBe(false);
    expect(isGuardedEdgeOutcomeEnvelope({ ...confirmEnv, outcome: "NOPE" })).toBe(false);
    expect(isGuardedEdgeOutcomeEnvelope({ ...confirmEnv, target: undefined })).toBe(false);
  });

  it("isConfirmRequiredEnvelope yalnız CONFIRM_REQUIRED'da true", () => {
    expect(isConfirmRequiredEnvelope(confirmEnv)).toBe(true);
    expect(isConfirmRequiredEnvelope({ ...confirmEnv, outcome: "ALLOW" })).toBe(false);
  });

  it("extractConfirmation: var→bloğu döner, yok→null", () => {
    expect(extractConfirmation(confirmEnv)?.token).toBe("go.confirm.v1.x.y");
    expect(extractConfirmation({ ...confirmEnv, confirmation: undefined })).toBeNull();
  });
});

describe("runGuarded orchestration", () => {
  it("normal data (zarf değil) → {ok,data}; askConfirm ÇAĞRILMAZ; requestFn 1 kez", async () => {
    const data = { success: true, data: { id: "c1" } };
    const requestFn = vi.fn(async () => data);
    const askConfirm = vi.fn(async () => true);
    const res = await runGuarded(requestFn, askConfirm);
    expect(res).toEqual({ status: "ok", data });
    expect(askConfirm).not.toHaveBeenCalled();
    expect(requestFn).toHaveBeenCalledTimes(1);
  });

  it("CONFIRM_REQUIRED + vazgeç → {cancelled}; RETRY YOK (requestFn 1 kez)", async () => {
    const requestFn = vi.fn(async () => confirmEnv);
    const askConfirm = vi.fn(async () => false);
    const res = await runGuarded(requestFn, askConfirm);
    expect(res).toEqual({ status: "cancelled" });
    expect(askConfirm).toHaveBeenCalledTimes(1);
    expect(requestFn).toHaveBeenCalledTimes(1);
  });

  it("CONFIRM_REQUIRED + onayla → retry; requestFn 2 kez; 2. çağrı confirmation alır", async () => {
    const final = { success: true, data: { id: "c1", caseStatus: "HITAM" } };
    const requestFn = vi.fn(async (c?: unknown) => (c ? final : confirmEnv));
    const askConfirm = vi.fn(async () => true);
    const res = await runGuarded(requestFn, askConfirm);
    expect(res).toEqual({ status: "ok", data: final });
    expect(requestFn).toHaveBeenCalledTimes(2);
    expect(requestFn.mock.calls[1][0]).toEqual(confirmEnv.confirmation); // retry confirmation ile çağrıldı
  });
});
