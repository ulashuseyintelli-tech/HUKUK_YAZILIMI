import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runGuarded, type GuardedEdgeOutcomeEnvelope } from "@/lib/guarded-edge";
import { api } from "@/lib/api";

/**
 * P3-2C-FE — CHANGE_STATUS frontend call-site'larının guarded-edge consumer'a bağlanması.
 * KESİN: backend flag OFF (default) → zarf dönmez → mevcut davranış değişmez (modal açılmaz, retry yok).
 * Bu testler: (A) api helper confirmationToken body mapping, (B) runGuarded retry akışı + token taşıma,
 * (C) 3 call-site'ın kaynak-düzeyi wiring'i (mevcut collection-summary-refresh source-grep deseniyle aynı).
 */

// ─────────── A) api.changeCaseStatus confirmationToken body mapping (gerçek ApiClient + fetch mock) ───────────
describe("P3-2C-FE — api.changeCaseStatus confirmationToken body mapping", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: { id: "c1", caseStatus: "ISLEMDE" }, message: "ok" }),
    });
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  const lastBody = () => JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);

  it("confirmationToken VERİLMEZSE body yalnız {status, reason} (token anahtarı YOK) + POST kanonik route", async () => {
    await api.changeCaseStatus("c1", "ISLEMDE", "Statü güncellendi");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain("/case-status/c1/change");
    expect((fetchMock.mock.calls[0][1] as RequestInit).method).toBe("POST");
    const body = lastBody();
    expect(body).toEqual({ status: "ISLEMDE", reason: "Statü güncellendi" });
    expect("confirmationToken" in body).toBe(false);
  });

  it("confirmationToken VERİLİRSE body'ye eklenir (retry yolu)", async () => {
    await api.changeCaseStatus("c1", "ISLEMDE", "Statü güncellendi", "go.confirm.v1.TOK.SIG");
    const body = lastBody();
    expect(body).toEqual({ status: "ISLEMDE", reason: "Statü güncellendi", confirmationToken: "go.confirm.v1.TOK.SIG" });
  });

  it("boş/undefined confirmationToken → token anahtarı eklenmez (falsy guard)", async () => {
    await api.changeCaseStatus("c1", "ISLEMDE", "Statü güncellendi", "");
    expect("confirmationToken" in lastBody()).toBe(false);
  });
});

// ─────────── B) runGuarded retry akışı + token taşıma (changeCaseStatus imza şekliyle) ───────────
describe("P3-2C-FE — guarded retry: confirmation.token → confirmationToken", () => {
  const envelope: GuardedEdgeOutcomeEnvelope = {
    axis: "GUIDED_OPEN_PERMISSION",
    outcome: "CONFIRM_REQUIRED",
    actionCode: "CHANGE_STATUS",
    target: { resourceType: "LegalCase", caseId: "c1" },
    message: "Bu statü değişikliği için onay gerekiyor.",
    confirmation: { token: "go.confirm.v1.TOK.SIG", expiresAt: "2030-01-01T00:00:00.000Z", bindingHash: "bh" },
  };

  it("CONFIRM_REQUIRED → onayla → 2. çağrı confirmation.token ile, {ok} döner", async () => {
    const tokensSeen: (string | undefined)[] = [];
    const requestFn = vi.fn(async (confirmation?: { token: string }) => {
      tokensSeen.push(confirmation?.token);
      return confirmation ? { success: true, data: { id: "c1" } } : envelope;
    });
    const askConfirm = vi.fn().mockResolvedValue(true);
    const res = await runGuarded(requestFn, askConfirm);
    expect(res.status).toBe("ok");
    expect(requestFn).toHaveBeenCalledTimes(2);
    expect(tokensSeen).toEqual([undefined, "go.confirm.v1.TOK.SIG"]); // retry'de token taşındı
    expect(askConfirm).toHaveBeenCalledTimes(1);
  });

  it("CONFIRM_REQUIRED → vazgeç → retry YOK, {cancelled}", async () => {
    const requestFn = vi.fn(async (c?: { token: string }) => (c ? { success: true } : envelope));
    const res = await runGuarded(requestFn, vi.fn().mockResolvedValue(false));
    expect(res.status).toBe("cancelled");
    expect(requestFn).toHaveBeenCalledTimes(1);
  });

  it("normal yanıt (zarf değil) → askConfirm ÇAĞRILMAZ (modal açılmaz), {ok}", async () => {
    const requestFn = vi.fn(async () => ({ success: true, data: { id: "c1" }, message: "ok" }));
    const askConfirm = vi.fn();
    const res = await runGuarded(requestFn, askConfirm);
    expect(res.status).toBe("ok");
    expect(askConfirm).not.toHaveBeenCalled();
    expect(requestFn).toHaveBeenCalledTimes(1);
  });

  it("requestFn exception → runGuarded reject eder (ilk-hata-durur: bulk döngüsü dışarı fırlatır)", async () => {
    const requestFn = vi.fn(async () => {
      throw new Error("boom");
    });
    await expect(runGuarded(requestFn, vi.fn())).rejects.toThrow("boom");
  });
});

// ─────────── C) call-site kaynak wiring (3 sayfa) ───────────
const read = (rel: string) => readFileSync(rel, "utf8");

describe("P3-2C-FE — call-site guarded wiring (kaynak)", () => {
  it("detail cases/[id]/page.tsx: handleSaveCaseStatus guarded + token + cancel-return + modal + import", () => {
    const src = read("src/app/(dashboard)/cases/[id]/page.tsx");
    const block = src.slice(src.indexOf("const handleSaveCaseStatus"), src.indexOf("// Fetch case debtors"));
    expect(block).toContain("await runGuardedStatus(");
    expect(block).toContain('api.changeCaseStatus(params.id as string, caseStatusValue, "Statü güncellendi", confirmation?.token)');
    expect(block).toContain('result.status === "cancelled"');
    expect(block).toContain("await fetchCase();");
    expect(src).toContain('import { useGuardedAction } from "@/components/guarded-edge/use-guarded-action"');
    expect(src).toContain("{guardedStatusModal}");
  });

  it("bulk cases/page.tsx: handleBulkStatusChange guarded + token + cancel-break + tek catch (ilk-hata-durur) + modal", () => {
    const src = read("src/app/(dashboard)/cases/page.tsx");
    const block = src.slice(src.indexOf("const handleBulkStatusChange"), src.indexOf("const handleBulkAssign"));
    expect(block).toContain("for (const caseId of selectedCases)");
    expect(block).toContain("await runGuardedStatus(");
    expect(block).toContain('api.changeCaseStatus(caseId, bulkStatus, "Toplu statü güncelleme", confirmation?.token)');
    expect(block).toContain('result.status === "cancelled"');
    expect(block).toContain("break;");
    // ilk-hata-durur korunur: döngü içine ek try EKLENMEDİ → yalnız fonksiyon-seviyesi tek "try {"
    // (exception loop'tan dışarı fırlar → fonksiyon catch'ine düşer → kalan case'ler işlenmez)
    expect((block.match(/try \{/g) || []).length).toBe(1);
    expect(src).toContain("{guardedStatusModal}");
  });

  it("edit cases/[id]/edit/page.tsx: statü bloğu guarded + token + cancel-return + modal + PUT önce", () => {
    const src = read("src/app/(dashboard)/cases/[id]/edit/page.tsx");
    const block = src.slice(src.indexOf("if (statusChanged && caseData.caseStatus)"), src.indexOf("setSuccess(true)"));
    expect(block).toContain("await runGuardedStatus(");
    expect(block).toContain('api.changeCaseStatus(caseId, statusToSet, "Dosya düzenleme formundan statü güncellendi", confirmation?.token)');
    expect(block).toContain('result.status === "cancelled"');
    // PUT (api.put) statü değişiminden ÖNCE çağrılır (split davranışı korunur)
    expect(src.indexOf("await api.put(`/cases/${caseId}`")).toBeLessThan(src.indexOf("await runGuardedStatus("));
    expect(src).toContain("{guardedStatusModal}");
  });
});
