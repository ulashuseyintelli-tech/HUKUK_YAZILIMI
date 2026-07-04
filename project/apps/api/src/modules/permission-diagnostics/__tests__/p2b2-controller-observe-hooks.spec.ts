// P2b-2 — controller observe-hook wiring (unit).
// KESİN KURAL (#503 / p2-guided-open-observe-mode-scope.md):
//   "P2 hiçbir kullanıcı aksiyonunu engellemez." → hook diagnostic-only; business akış korunur.
// GİZLİLİK invariant'ı: observe input YALNIZ {actorUserId, tenantId, caseId?, actionCode} taşır;
//   gövde/alıcı/IBAN/tutar/credential/XML observe'a ASLA geçmez.

import { NotificationController } from "../../notification/notification.controller";
import { BankController } from "../../bank/bank.controller";
import { UyapController } from "../../uyap/uyap.controller";
import { ActionCode } from "../../policy-engine/types/action-code.enum";

// observe input'ta İZİN VERİLEN anahtarlar (alt-küme invariant'ı → gövde/gizli alan yapısal olarak imkânsız).
// NOT: EffectivePermissionInput.context? alanı şemada VAR ama hook'lar GEÇMEZ; bu yüzden beyaz-listeye
// ALINMADI → ileride biri context (serbest payload) geçirirse bu test KIRMIZIYA döner (sıkı privacy guard).
const ALLOWED_OBSERVE_KEYS = ["actorUserId", "tenantId", "caseId", "actionCode"];

function assertObserveKeysAllowed(arg: any) {
  for (const k of Object.keys(arg)) {
    expect(ALLOWED_OBSERVE_KEYS).toContain(k);
  }
}

describe("P2b-2 NotificationController — SEND_NOTIFICATION observe hook", () => {
  const make = () => {
    const observe = jest.fn().mockResolvedValue(undefined);
    const svc = {
      sendSMS: jest.fn().mockResolvedValue({ id: "n1" }),
      sendEmail: jest.fn().mockResolvedValue({ id: "n2" }),
    };
    const ctrl = new NotificationController(svc as any, { observe } as any);
    return { ctrl, observe, svc };
  };

  it("sendSMS: observe SEND_NOTIFICATION (truthful actor+tenant+caseId) + business akış korunur (ALLOW)", async () => {
    const { ctrl, observe, svc } = make();
    await ctrl.sendSMS("u1", "t1", "c1", { phone: "5550001122", message: "gizli içerik" });

    expect(observe).toHaveBeenCalledTimes(1);
    const arg = observe.mock.calls[0][0];
    expect(arg.actorUserId).toBe("u1");
    expect(arg.tenantId).toBe("t1");
    expect(arg.caseId).toBe("c1");
    expect(arg.actionCode).toBe(ActionCode.SEND_NOTIFICATION);
    // GİZLİLİK: gövde observe'a GEÇMEZ
    assertObserveKeysAllowed(arg);
    expect(arg.phone).toBeUndefined();
    expect(arg.message).toBeUndefined();
    // ALLOW: business çağrısı eksiksiz yapıldı, engellenmedi
    expect(svc.sendSMS).toHaveBeenCalledWith("c1", "5550001122", "gizli içerik");
  });

  it("sendEmail: observe SEND_NOTIFICATION; email/subject/content observe'a GEÇMEZ; ALLOW", async () => {
    const { ctrl, observe, svc } = make();
    await ctrl.sendEmail("u1", "t1", "c1", { email: "a@b.c", subject: "S", content: "C" });

    expect(observe).toHaveBeenCalledTimes(1);
    const arg = observe.mock.calls[0][0];
    expect(arg.actionCode).toBe(ActionCode.SEND_NOTIFICATION);
    assertObserveKeysAllowed(arg);
    expect(arg.email).toBeUndefined();
    expect(arg.subject).toBeUndefined();
    expect(arg.content).toBeUndefined();
    expect(svc.sendEmail).toHaveBeenCalledWith("c1", "a@b.c", "S", "C");
  });

  it("catch-boundary: business exception observe try/catch tarafından YUTULMAZ (propagate)", async () => {
    const { ctrl, observe, svc } = make();
    svc.sendSMS.mockRejectedValue(new Error("biz failure"));
    await expect(ctrl.sendSMS("u1", "t1", "c1", { phone: "x", message: "y" })).rejects.toThrow("biz failure");
    // observe yine de (business'tan önce) çağrıldı
    expect(observe).toHaveBeenCalledTimes(1);
  });
});

describe("P2b-2 BankController — BANK_TRANSFER observe hook (Codex finans domeni; observe-only)", () => {
  const make = () => {
    const observe = jest.fn().mockResolvedValue(undefined);
    const svc = { sendTransfer: jest.fn().mockResolvedValue({ success: true, transactionId: "x" }) };
    const ctrl = new BankController(svc as any, { observe } as any);
    return { ctrl, observe, svc };
  };

  it("sendTransfer: observe BANK_TRANSFER (caseId YOK); IBAN/tutar/alıcı observe'a GEÇMEZ; ALLOW", async () => {
    const { ctrl, observe, svc } = make();
    const body = {
      fromIban: "TR000000000000000000000001",
      toIban: "TR000000000000000000000002",
      amount: 125000,
      currency: "TRY",
      description: "müvekkil ödemesi",
      referenceNo: "REF-9",
    };
    await ctrl.sendTransfer("t1", "u1", body);

    expect(observe).toHaveBeenCalledTimes(1);
    const arg = observe.mock.calls[0][0];
    expect(arg.actorUserId).toBe("u1");
    expect(arg.tenantId).toBe("t1");
    expect(arg.actionCode).toBe(ActionCode.BANK_TRANSFER);
    // account-scoped → caseId YOK
    expect(arg.caseId).toBeUndefined();
    // GİZLİLİK: hiçbir transfer payload alanı observe'a GEÇMEZ
    assertObserveKeysAllowed(arg);
    expect(arg.fromIban).toBeUndefined();
    expect(arg.toIban).toBeUndefined();
    expect(arg.amount).toBeUndefined();
    expect(arg.currency).toBeUndefined();
    expect(arg.description).toBeUndefined();
    expect(arg.referenceNo).toBeUndefined();
    // ALLOW: business transfer engellenmedi, eksiksiz delege edildi
    expect(svc.sendTransfer).toHaveBeenCalledTimes(1);
    expect(svc.sendTransfer.mock.calls[0][0]).toBe("t1");
    expect(svc.sendTransfer.mock.calls[0][1]).toMatchObject({ fromIban: body.fromIban, toIban: body.toIban, amount: body.amount });
  });

  it("catch-boundary: transfer servisi hata verirse observe YUTMAZ (propagate)", async () => {
    const { ctrl, observe, svc } = make();
    svc.sendTransfer.mockRejectedValue(new Error("provider down"));
    await expect(
      ctrl.sendTransfer("t1", "u1", { fromIban: "a", toIban: "b", amount: 1 }),
    ).rejects.toThrow("provider down");
    expect(observe).toHaveBeenCalledTimes(1);
  });
});

describe("P2b-2 UyapController — UYAP_SEND observe hook", () => {
  const make = (poaValid = true) => {
    const observe = jest.fn().mockResolvedValue(undefined);
    const uyapSvc = {
      validateCasePoaForUyap: jest.fn().mockResolvedValue({ isValid: poaValid, errors: poaValid ? [] : ["POA"] }),
      submitDocument: jest.fn().mockResolvedValue({ success: true, evkNo: "DOC-1" }),
    };
    const uyapXmlSvc = {
      generateFromCase: jest.fn().mockResolvedValue("<eTakip/>"),
      validateXml: jest.fn().mockReturnValue({ isValid: true, errors: [] }),
    };
    const ctrl = new UyapController(uyapSvc as any, uyapXmlSvc as any, { observe } as any);
    return { ctrl, observe, uyapSvc, uyapXmlSvc };
  };

  it("submitXmlToUyap: observe UYAP_SEND (truthful actor=req.user.id); credential/XML observe'a GEÇMEZ; ALLOW", async () => {
    const { ctrl, observe, uyapSvc } = make(true);
    await ctrl.submitXmlToUyap("c1", { user: { id: "u1", tenantId: "t1" } } as any);

    expect(observe).toHaveBeenCalledTimes(1);
    const arg = observe.mock.calls[0][0];
    expect(arg.actorUserId).toBe("u1");
    expect(arg.tenantId).toBe("t1");
    expect(arg.caseId).toBe("c1");
    expect(arg.actionCode).toBe(ActionCode.UYAP_SEND);
    // GÜVENLİK: e-imza/UYAP credential ve XML observe'a GEÇMEZ
    assertObserveKeysAllowed(arg);
    expect(arg.xml).toBeUndefined();
    expect(arg.credential).toBeUndefined();
    // ALLOW: business gönderim engellenmedi
    expect(uyapSvc.submitDocument).toHaveBeenCalledTimes(1);
  });

  it("observe POA gate'inden SONRA: POA geçersizse erken döner, observe ÇAĞRILMAZ", async () => {
    const { ctrl, observe, uyapSvc } = make(false);
    const res = await ctrl.submitXmlToUyap("c1", { user: { id: "u1", tenantId: "t1" } } as any);
    expect(res).toMatchObject({ success: false, error: "POA_VALIDATION_FAILED" });
    expect(observe).not.toHaveBeenCalled();
    expect(uyapSvc.submitDocument).not.toHaveBeenCalled();
  });
});
