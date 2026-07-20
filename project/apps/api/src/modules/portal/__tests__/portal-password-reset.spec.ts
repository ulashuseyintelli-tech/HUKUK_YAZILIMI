/**
 * CLIENT-P2-U01 — Portal credential-recovery hardening (unit, mock prisma).
 *
 * Kapsam: hash-only token storage, delivery başarı/başarısızlık semantiği, atomic tek-kullanımlık
 * reset, account-enumeration korunması, DTO validasyon sözleşmesi.
 * Tenant/client cross-account izolasyonu GERÇEK Postgres üzerinde ayrı db-gated integration
 * spec'inde doğrulanır (portal-password-reset-tenant-scope.db-gated.integration.spec.ts).
 */
import { BadRequestException } from "@nestjs/common";
import { validate } from "class-validator";
import { plainToInstance } from "class-transformer";
import * as crypto from "crypto";
import { PortalService } from "../portal.service";
import { ForgotPasswordDto } from "../dto/forgot-password.dto";
import { ResetPasswordDto } from "../dto/reset-password.dto";

function sha256(raw: string): string {
  return crypto.createHash("sha256").update(raw, "utf8").digest("hex");
}

/** emailProvider.send(...) çağrısına geçirilen text/html gövdesinden ham token'ı çıkarır. */
function extractRawTokenFromEmail(sendMock: jest.Mock): string {
  const call = sendMock.mock.calls[0][0];
  const match = /token=([0-9a-f]{64})/.exec(call.text);
  if (!match) throw new Error("reset URL içinde token bulunamadı");
  return match[1];
}

function build(over: { portalUser?: any; sendResult?: any } = {}) {
  const foundPortalUser =
    over.portalUser === undefined
      ? { id: "PU1", email: "musteri@ornek.com", client: { tenantId: "TEN1" } }
      : over.portalUser;

  const prisma = {
    clientPortalUser: {
      findFirst: jest.fn().mockResolvedValue(foundPortalUser),
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    $transaction: jest.fn(),
  };
  const audit = { log: jest.fn().mockResolvedValue(undefined), logInTransaction: jest.fn() };
  const officeApproval = { isApproverEligible: jest.fn() };
  const config = {
    get: jest.fn((key: string) => (key === "WEB_BASE_URL" ? "https://portal.example.test" : undefined)),
  };
  const emailProvider = {
    send: jest.fn().mockResolvedValue(
      over.sendResult ?? { success: true, provider: "mock", messageId: "MOCK-1" }
    ),
  };

  const svc = new PortalService(
    prisma as any,
    {} as any,
    audit as any,
    officeApproval as any,
    config as any,
    emailProvider as any
  );

  return { svc, prisma, audit, config, emailProvider };
}

describe("CLIENT-P2-U01 — createResetToken (forgot-password)", () => {
  it("[1] kayıtlı hesap: e-posta gönderilir, DB'ye YALNIZ SHA-256 digest yazılır (ham token DEĞİL)", async () => {
    const { svc, prisma, emailProvider } = build();
    const res = await svc.createResetToken("musteri@ornek.com");

    expect(res).toEqual({ success: true });
    expect(emailProvider.send).toHaveBeenCalledTimes(1);
    const rawToken = extractRawTokenFromEmail(emailProvider.send);

    const updateCall = prisma.clientPortalUser.update.mock.calls[0][0];
    expect(updateCall.where).toEqual({ id: "PU1" });
    expect(updateCall.data.resetToken).toBe(sha256(rawToken));
    expect(updateCall.data.resetToken).not.toBe(rawToken);
    expect(updateCall.data.resetTokenExp).toBeInstanceOf(Date);
  });

  it("[2] bilinmeyen hesap: generic {success:true}, update/send ÇAĞRILMAZ (account enumeration engeli)", async () => {
    const { svc, prisma, emailProvider } = build({ portalUser: null });
    const res = await svc.createResetToken("yok@ornek.com");

    expect(res).toEqual({ success: true });
    expect(prisma.clientPortalUser.update).not.toHaveBeenCalled();
    expect(emailProvider.send).not.toHaveBeenCalled();
  });

  it("[3] e-posta normalize edilir (trim + lowercase) — lookup normalize edilmiş değerle yapılır", async () => {
    const { svc, prisma } = build();
    await svc.createResetToken("  Musteri@Ornek.com  ");
    expect(prisma.clientPortalUser.findFirst.mock.calls[0][0].where.email).toBe("musteri@ornek.com");
  });

  it("[4] delivery başarısız: generic {success:true} KORUNUR, digest conditional temizlenir, secret-free audit", async () => {
    const { svc, prisma, audit, emailProvider } = build({
      sendResult: { success: false, errorCode: "SMTP_ERROR", provider: "smtp" },
    });
    const res = await svc.createResetToken("musteri@ornek.com");

    expect(res).toEqual({ success: true }); // delivery failure ≠ account enumeration, ≠ farklı response
    const rawToken = extractRawTokenFromEmail(emailProvider.send);

    const cleanupCall = prisma.clientPortalUser.updateMany.mock.calls[0][0];
    expect(cleanupCall.where).toEqual({ id: "PU1", resetToken: sha256(rawToken) });
    expect(cleanupCall.data).toEqual({ resetToken: null, resetTokenExp: null });

    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "TEN1",
        action: "PORTAL_RESET_DELIVERY_FAILED",
        entityId: "PU1",
      })
    );
    const auditPayload = JSON.stringify(audit.log.mock.calls[0][0]);
    expect(auditPayload).not.toContain(rawToken);
  });

  it("[5] yeni talep önceki token'ı geçersiz kılar: iki ardışık çağrı FARKLI digest yazar", async () => {
    const { svc, prisma } = build();
    await svc.createResetToken("musteri@ornek.com");
    await svc.createResetToken("musteri@ornek.com");

    const first = prisma.clientPortalUser.update.mock.calls[0][0].data.resetToken;
    const second = prisma.clientPortalUser.update.mock.calls[1][0].data.resetToken;
    expect(first).not.toBe(second);
    expect(first).toMatch(/^[0-9a-f]{64}$/);
    expect(second).toMatch(/^[0-9a-f]{64}$/);
  });

  it("[6] ham token hiçbir audit/log çağrısında GÖRÜNMEZ (başarılı akış)", async () => {
    const { svc, audit, emailProvider } = build();
    await svc.createResetToken("musteri@ornek.com");
    const rawToken = extractRawTokenFromEmail(emailProvider.send);

    for (const call of audit.log.mock.calls) {
      expect(JSON.stringify(call[0])).not.toContain(rawToken);
    }
  });
});

describe("CLIENT-P2-U01 — resetPassword (atomic tek-kullanımlık)", () => {
  function buildTxMock(candidate: any, updateManyResult: { count: number }) {
    const tx = {
      clientPortalUser: {
        findFirst: jest.fn().mockResolvedValue(candidate),
        updateMany: jest.fn().mockResolvedValue(updateManyResult),
      },
    };
    return tx;
  }

  it("[7] doğru token: şifre günceller, resetToken/Exp temizler, PASSWORD_RESET_SUCCEEDED audit", async () => {
    const { svc, prisma, audit } = build();
    const candidate = { id: "PU1", client: { tenantId: "TEN1" } };
    const tx = buildTxMock(candidate, { count: 1 });
    prisma.$transaction.mockImplementation(async (cb: any) => cb(tx));

    const res = await svc.resetPassword("a".repeat(64), "YeniSifre123");

    expect(res).toEqual({ success: true });
    const updateCall = tx.clientPortalUser.updateMany.mock.calls[0][0];
    expect(updateCall.where).toMatchObject({ id: "PU1" });
    expect(updateCall.data.resetToken).toBeNull();
    expect(updateCall.data.resetTokenExp).toBeNull();
    expect(typeof updateCall.data.passwordHash).toBe("string");
    expect(updateCall.data.passwordHash).not.toBe("YeniSifre123");

    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: "TEN1", action: "PORTAL_PASSWORD_RESET_SUCCEEDED", entityId: "PU1" })
    );
  });

  it("[8] yanlış/malformed/süresi dolmuş token: candidate bulunamaz → generic red, audit YAZILMAZ (tenant bilinmiyor)", async () => {
    const { svc, prisma, audit } = build();
    const tx = buildTxMock(null, { count: 0 });
    prisma.$transaction.mockImplementation(async (cb: any) => cb(tx));

    await expect(svc.resetPassword("b".repeat(64), "YeniSifre123")).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.clientPortalUser.updateMany).not.toHaveBeenCalled();
    expect(audit.log).not.toHaveBeenCalled();
  });

  it("[9] replay (ikinci kullanım): ilk çağrı sonrası aynı token artık candidate bulamaz → red", async () => {
    const { svc, prisma } = build();
    const candidate = { id: "PU1", client: { tenantId: "TEN1" } };

    const firstTx = buildTxMock(candidate, { count: 1 });
    prisma.$transaction.mockImplementationOnce(async (cb: any) => cb(firstTx));
    await expect(svc.resetPassword("c".repeat(64), "YeniSifre123")).resolves.toEqual({ success: true });

    const secondTx = buildTxMock(null, { count: 0 }); // token artık temizlendi → bulunamaz
    prisma.$transaction.mockImplementationOnce(async (cb: any) => cb(secondTx));
    await expect(svc.resetPassword("c".repeat(64), "BaskaSifre456")).rejects.toBeInstanceOf(BadRequestException);
  });

  it("[10] concurrent replay: candidate bulunur ama updateMany.count=0 (rakip istek kazandı) → red + audit REJECTED", async () => {
    const { svc, prisma, audit } = build();
    const candidate = { id: "PU1", client: { tenantId: "TEN1" } };
    const tx = buildTxMock(candidate, { count: 0 });
    prisma.$transaction.mockImplementation(async (cb: any) => cb(tx));

    await expect(svc.resetPassword("d".repeat(64), "YeniSifre123")).rejects.toBeInstanceOf(BadRequestException);
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "TEN1",
        action: "PORTAL_PASSWORD_RESET_REJECTED",
        entityId: "PU1",
        metadata: { reasonCode: "CONCURRENT_OR_EXPIRED" },
      })
    );
  });

  it("[11] hata mesajı jenerik: token yanlış/expired/reused ayrımı client'a SIZMAZ", async () => {
    const { svc, prisma } = build();
    const tx = buildTxMock(null, { count: 0 });
    prisma.$transaction.mockImplementation(async (cb: any) => cb(tx));

    await expect(svc.resetPassword("e".repeat(64), "YeniSifre123")).rejects.toThrow(
      "Geçersiz veya süresi dolmuş token"
    );
  });
});

describe("CLIENT-P2-U01 — DTO validasyon sözleşmesi", () => {
  it("[12] ForgotPasswordDto: geçersiz e-posta reddedilir", async () => {
    const dto = plainToInstance(ForgotPasswordDto, { email: "not-an-email" });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it("[13] ForgotPasswordDto: geçerli e-posta kabul edilir", async () => {
    const dto = plainToInstance(ForgotPasswordDto, { email: "musteri@ornek.com" });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it("[14] ResetPasswordDto: token 64-hex biçiminde değilse reddedilir", async () => {
    const dto = plainToInstance(ResetPasswordDto, { token: "kisa-token", newPassword: "YeniSifre123" });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === "token")).toBe(true);
  });

  it("[15] ResetPasswordDto: newPassword 8 karakterden kısaysa reddedilir (şifre politikası)", async () => {
    const dto = plainToInstance(ResetPasswordDto, { token: "a".repeat(64), newPassword: "short" });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === "newPassword")).toBe(true);
  });

  it("[16] ResetPasswordDto: geçerli token + parola kabul edilir", async () => {
    const dto = plainToInstance(ResetPasswordDto, { token: "a".repeat(64), newPassword: "YeniSifre123" });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });
});
