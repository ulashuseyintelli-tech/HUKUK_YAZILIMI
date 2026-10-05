import { describe, expect, it } from "vitest";
import { expenseSendRequestFailed, interpretExpenseSendResponse } from "../expense-send-result";

describe("interpretExpenseSendResponse", () => {
  it("başarı: sağlayıcı kabulü; teslim doğrulanmaz", () => {
    const state = interpretExpenseSendResponse({ success: true, status: "EMAIL_ACCEPTED", deliveryConfirmed: false, message: "kabul" });
    expect(state).toEqual({ kind: "accepted", message: "kabul" });
  });

  it("başarı, mesajsız eski yanıt: teslim doğrulanmadığı varsayılan metinle söylenir", () => {
    const state = interpretExpenseSendResponse({ success: true });
    expect(state.kind).toBe("accepted");
    expect(state.message).toContain("Alıcıya teslim edildiği doğrulanmaz");
  });

  it("kesin başarısızlık: neden + gereken bilgi taşınır; yeniden denenebilir", () => {
    const state = interpretExpenseSendResponse({
      success: false,
      reasonCode: "RECIPIENT_MISSING",
      message: "Müvekkilin e-posta adresi kayıtlı değil.",
      requiredInfo: ["Müvekkilin e-posta adresi", 7, ""],
      retryable: true,
    });
    expect(state).toEqual({ kind: "not-sent", message: "Müvekkilin e-posta adresi kayıtlı değil.", requiredInfo: ["Müvekkilin e-posta adresi"], retryable: true });
  });

  it("kalemler e-posta için geçersiz (retryable:false, kesin başarısızlık): \"belirsiz\" DİYE gösterilmez, yeniden denenmez", () => {
    const state = interpretExpenseSendResponse({ success: false, reasonCode: "REQUEST_ITEMS_INVALID", message: "geçerli kalem yok", requiredInfo: ["Masraf talebinin kalemleri ve tutarları"], retryable: false });
    expect(state).toEqual({ kind: "not-sent", message: "geçerli kalem yok", requiredInfo: ["Masraf talebinin kalemleri ve tutarları"], retryable: false });
  });

  it("retryable:false (belirsiz sonuç): başarı sayılmaz, yeniden denenmez", () => {
    const state = interpretExpenseSendResponse({ success: false, reasonCode: "DELIVERY_UNCERTAIN", message: "belirsiz", requiredInfo: [], retryable: false });
    expect(state.kind).toBe("uncertain");
    expect(state.kind === "uncertain" && state.retryable).toBe(false);
  });

  it.each([[undefined], [null], [{}], [{ success: false }], [{ success: false, reasonCode: "X" }], ["metin"]])(
    "yapılandırılmamış yanıt %j: tahmin edilmez, belirsiz sayılır",
    (response) => {
      const state = interpretExpenseSendResponse(response);
      expect(state.kind).toBe("uncertain");
    },
  );

  it("yanıt alınamadı: başarı değil, aynı talepte yeniden denenebilir", () => {
    const state = expenseSendRequestFailed(new Error("Failed to fetch"));
    expect(state.kind).toBe("error");
    expect(state.message).toContain("Failed to fetch");
    expect(state.message).toContain("bilinmiyor");
    expect(state.kind === "error" && state.retryable).toBe(true);
  });
});
