import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { GuardedEdgeOutcomeEnvelope } from "@/lib/guarded-edge";

// PR-1 — CollectionModal guarded-edge tüketimi.
//
// KAPATILAN HATA: backend receipt-authorization CONFIRM_REQUIRED zarfını HTTP 200/201 ile döner
// (bir hata DEĞİL, ara durum). Modal yanıtı hiç incelemeden onSuccess()+onClose() çağırıyordu →
// operatör tahsilatın kaydedildiğini sanıyor, sistemde hiçbir kayıt yok, uyarı da yok.
//
// Bu testler "yalancı başarı" nın geri gelmesini kilitler.

const createCollection = vi.fn();
const updateCollection = vi.fn();

vi.mock("@/lib/api", () => ({
  api: {
    createCollection: (...a: unknown[]) => createCollection(...a),
    updateCollection: (...a: unknown[]) => updateCollection(...a),
    previewCollectionPayment: vi.fn().mockResolvedValue(null),
    cancelCollection: vi.fn(),
  },
}));

import { CollectionModal } from "../CollectionModal";

const CONFIRM_ENVELOPE: GuardedEdgeOutcomeEnvelope = {
  axis: "GUIDED_OPEN_PERMISSION",
  outcome: "CONFIRM_REQUIRED",
  actionCode: "RECORD_COLLECTION",
  target: { resourceType: "CASE", caseId: "case-1" },
  message: "Bu dosya kapsamındaki tahsilat kaydı için kullanıcı doğrulaması gereklidir.",
  confirmation: {
    token: "go.confirm.v1.TOKEN",
    expiresAt: "2026-12-31T00:00:00Z",
    bindingHash: "binding-hash-1",
  },
};

const APPROVAL_ENVELOPE: GuardedEdgeOutcomeEnvelope = {
  axis: "GUIDED_OPEN_PERMISSION",
  outcome: "APPROVAL_REQUIRED",
  actionCode: "RECORD_COLLECTION",
  target: { resourceType: "CASE", caseId: "case-1" },
  message: "İşlem onay talebine yönlendirildi.",
  approval: { requestId: "req-1", status: "PENDING_APPROVAL" },
};

function renderModal(onSuccess = vi.fn(), onClose = vi.fn()) {
  render(
    <CollectionModal isOpen onClose={onClose} caseId="case-1" onSuccess={onSuccess} />,
  );
  return { onSuccess, onClose };
}

async function fillAndSubmit() {
  const amount = screen.getByPlaceholderText("0.00");
  fireEvent.change(amount, { target: { value: "1.00" } });
  fireEvent.click(screen.getByRole("button", { name: "Ekle" }));
}

let alertSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  createCollection.mockReset();
  updateCollection.mockReset();
  alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});
});
afterEach(() => alertSpy.mockRestore());

describe("CollectionModal — guarded envelope", () => {
  it("ALLOW (zarf yok): tek çağrı, başarı işlenir, modal kapanır", async () => {
    createCollection.mockResolvedValue({ id: "col-1" });
    const { onSuccess, onClose } = renderModal();

    await fillAndSubmit();

    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(createCollection).toHaveBeenCalledTimes(1);
    // ilk denemede token GÖNDERİLMEZ
    expect(createCollection.mock.calls[0][1].confirmationToken).toBeUndefined();
  });

  it("CONFIRM_REQUIRED: onay modalı açılır, BAŞARI İŞLENMEZ (yalancı başarı yok)", async () => {
    createCollection.mockResolvedValue(CONFIRM_ENVELOPE);
    const { onSuccess, onClose } = renderModal();

    await fillAndSubmit();

    await screen.findByText("İşlem onayı gerekiyor");
    expect(onSuccess).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("onay sonrası TEK retry: token gider, idempotencyKey AYNI kalır (çift tahsilat yok)", async () => {
    createCollection
      .mockResolvedValueOnce(CONFIRM_ENVELOPE)
      .mockResolvedValueOnce({ id: "col-1" });
    const { onSuccess } = renderModal();

    await fillAndSubmit();
    fireEvent.click(await screen.findByRole("button", { name: "Onayla" }));

    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
    expect(createCollection).toHaveBeenCalledTimes(2);

    const first = createCollection.mock.calls[0][1];
    const second = createCollection.mock.calls[1][1];
    expect(first.confirmationToken).toBeUndefined();
    expect(second.confirmationToken).toBe("go.confirm.v1.TOKEN");
    // ÇİFT TAHSİLAT KİLİDİ: retry aynı idempotencyKey ile gider
    expect(second.idempotencyKey).toBe(first.idempotencyKey);
    expect(second.idempotencyKey).toBeTruthy();
  });

  it("cancel: ikinci çağrı YOK, başarı YOK, modal kapanmaz", async () => {
    createCollection.mockResolvedValue(CONFIRM_ENVELOPE);
    const { onSuccess, onClose } = renderModal();

    await fillAndSubmit();
    fireEvent.click(await screen.findByRole("button", { name: "Vazgeç" }));

    await waitFor(() => expect(createCollection).toHaveBeenCalledTimes(1));
    expect(onSuccess).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("APPROVAL_REQUIRED: TERMİNAL — retry yok, başarı yok, kullanıcı bilgilendirilir", async () => {
    createCollection.mockResolvedValue(APPROVAL_ENVELOPE);
    const { onSuccess, onClose } = renderModal();

    await fillAndSubmit();

    await waitFor(() => expect(alertSpy).toHaveBeenCalled());
    expect(String(alertSpy.mock.calls[0][0])).toContain("onay talebine");
    expect(createCollection).toHaveBeenCalledTimes(1);
    expect(onSuccess).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("expired token / bindingHash mismatch: retry backend'de reddedilirse başarı İŞLENMEZ", async () => {
    createCollection
      .mockResolvedValueOnce(CONFIRM_ENVELOPE)
      .mockRejectedValueOnce(new Error("CONFIRMATION_TOKEN_EXPIRED"));
    const { onSuccess, onClose } = renderModal();

    await fillAndSubmit();
    fireEvent.click(await screen.findByRole("button", { name: "Onayla" }));

    await waitFor(() => expect(alertSpy).toHaveBeenCalled());
    expect(String(alertSpy.mock.calls[0][0])).toContain("CONFIRMATION_TOKEN_EXPIRED");
    expect(onSuccess).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("backend exception: kullanıcıya gösterilir, başarı İŞLENMEZ", async () => {
    createCollection.mockRejectedValue(new Error("BINDING_HASH_MISMATCH"));
    const { onSuccess, onClose } = renderModal();

    await fillAndSubmit();

    await waitFor(() => expect(alertSpy).toHaveBeenCalled());
    expect(String(alertSpy.mock.calls[0][0])).toContain("BINDING_HASH_MISMATCH");
    expect(onSuccess).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });
});
