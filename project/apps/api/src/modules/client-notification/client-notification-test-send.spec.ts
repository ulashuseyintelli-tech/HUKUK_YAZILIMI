import { ClientNotificationService } from "./client-notification.service";

/**
 * PR-N3 testSend — birim testi.
 * Doğrular: mevcut sendEmail/sendSms yolu type="TEST" + [TEST] nötr içerikle yeniden kullanılır;
 * başarı SENT + maskelenmiş alıcı döner; fırlatılan hata dürüst FAILED'e çevrilir ve sır sızmaz.
 */
describe("ClientNotificationService.testSend (PR-N3)", () => {
  // prisma.client.findFirst: testSend önce müvekkilin tenant'ta var olduğunu doğrular (404 guard)
  const svc = (clientExists = true) => {
    const prisma: any = {
      client: { findFirst: jest.fn().mockResolvedValue(clientExists ? { id: "c1" } : null) },
    };
    return new ClientNotificationService(prisma, {} as any);
  };

  it("EMAIL: sendEmail'i type=TEST + [TEST] içerikle çağırır, SENT + maskeli alıcı döner", async () => {
    const s = svc();
    const spy = jest
      .spyOn(s, "sendEmail")
      .mockResolvedValue({ success: true, notificationId: "n1", recipient: "sukru@example.com" } as any);

    const out = await s.testSend("t1", "u1", { clientId: "c1", channel: "EMAIL" });

    expect(spy).toHaveBeenCalledTimes(1);
    const [tid, uid, dto] = spy.mock.calls[0] as any[];
    expect(tid).toBe("t1");
    expect(uid).toBe("u1");
    expect(dto.clientId).toBe("c1");
    expect(dto.type).toBe("TEST");
    expect(dto.subject).toMatch(/\[TEST\]/);
    expect(dto.body).toMatch(/test bildirimidir/i);

    expect(out).toMatchObject({ success: true, channel: "EMAIL", status: "SENT", notificationId: "n1" });
    expect(out.recipient).toBeTruthy();
    expect(out.recipient).not.toBe("sukru@example.com"); // maskelenmiş
  });

  it("SMS: sendSms'i type=TEST + [TEST] SMS metniyle çağırır, SENT + maskeli telefon döner", async () => {
    const s = svc();
    const spy = jest
      .spyOn(s, "sendSms")
      .mockResolvedValue({ success: true, notificationId: "n2", recipient: "905551112233" } as any);

    const out = await s.testSend("t1", "u1", { clientId: "c1", channel: "SMS" });

    const [, , dto] = spy.mock.calls[0] as any[];
    expect(dto.type).toBe("TEST");
    expect(dto.body).toMatch(/\[TEST\]/);
    expect(out).toMatchObject({ success: true, channel: "SMS", status: "SENT", notificationId: "n2" });
    expect(out.recipient).toBeTruthy();
    expect(out.recipient).not.toBe("905551112233"); // maskelenmiş
  });

  it("Hata: fırlatılan BadRequest'i FAILED'e çevirir ve sırrı redakte eder", async () => {
    const s = svc();
    jest
      .spyOn(s, "sendEmail")
      .mockRejectedValue(new Error("E-posta gönderilemedi: Invalid login password=topsecret123"));

    const out = await s.testSend("t1", "u1", { clientId: "c1", channel: "EMAIL" });

    expect(out.success).toBe(false);
    expect(out.status).toBe("FAILED");
    expect(out.channel).toBe("EMAIL");
    expect(out.errorMessage).toBeTruthy();
    expect(out.errorMessage).not.toContain("topsecret123");
  });

  it("Hata mesajı yoksa güvenli varsayılan döner", async () => {
    const s = svc();
    jest.spyOn(s, "sendSms").mockRejectedValue(new Error(""));
    const out = await s.testSend("t1", "u1", { clientId: "c1", channel: "SMS" });
    expect(out.success).toBe(false);
    expect(out.errorMessage).toBe("Gönderim başarısız");
  });

  it("geçersiz/cross-tenant clientId → NotFoundException, gönderim DENENMEZ", async () => {
    const s = svc(false); // müvekkil bu tenant'ta yok
    const emailSpy = jest.spyOn(s, "sendEmail");
    const smsSpy = jest.spyOn(s, "sendSms");
    await expect(
      s.testSend("t1", "u1", { clientId: "nope", channel: "EMAIL" })
    ).rejects.toThrow(/bulunamadı/i);
    expect(emailSpy).not.toHaveBeenCalled();
    expect(smsSpy).not.toHaveBeenCalled();
  });
});
