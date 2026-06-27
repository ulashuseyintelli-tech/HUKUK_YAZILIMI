import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ConfirmActionModal } from "../confirm-action-modal";
import type { GuardedEdgeOutcomeEnvelope } from "@/lib/guarded-edge";

const env: GuardedEdgeOutcomeEnvelope = {
  axis: "GUIDED_OPEN_PERMISSION",
  outcome: "CONFIRM_REQUIRED",
  actionCode: "CHANGE_STATUS",
  target: { resourceType: "CASE", caseId: "c1" },
  message: "Bu statü değişikliği için onay gerekiyor.",
  confirmation: { token: "go.confirm.v1.secret", expiresAt: "2026-01-01T00:00:00Z", bindingHash: "h" },
};

describe("ConfirmActionModal", () => {
  it("zarf message'ını ve sade başlığı gösterir; teknik alanları (token/actionCode) GÖSTERMEZ", () => {
    render(<ConfirmActionModal envelope={env} onConfirm={() => {}} onCancel={() => {}} />);
    screen.getByText("İşlem onayı gerekiyor");
    screen.getByText("Bu statü değişikliği için onay gerekiyor.");
    expect(screen.queryByText(/go\.confirm\.v1\.secret/)).toBeNull(); // token kullanıcıya gösterilmez
    expect(screen.queryByText(/CHANGE_STATUS/)).toBeNull(); // teknik actionCode gösterilmez
  });

  it("message yoksa sade varsayılan açıklama", () => {
    render(<ConfirmActionModal envelope={{ ...env, message: undefined }} onConfirm={() => {}} onCancel={() => {}} />);
    screen.getByText("Bu işlem için ek onay gerekiyor.");
  });

  it("Onayla → onConfirm; Vazgeç → onCancel", () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(<ConfirmActionModal envelope={env} onConfirm={onConfirm} onCancel={onCancel} />);
    fireEvent.click(screen.getByText("Onayla"));
    fireEvent.click(screen.getByText("Vazgeç"));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("busy → her iki buton disabled", () => {
    render(<ConfirmActionModal envelope={env} busy onConfirm={() => {}} onCancel={() => {}} />);
    expect((screen.getByText("Vazgeç") as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByText("Onayla").closest("button") as HTMLButtonElement).disabled).toBe(true);
  });
});
