// OFFICE-AUTH-P01: self-service parola değiştirme — mevcut parola doğrulama, politika
// sınırları (min 12 / max 72 bayt / eski-yeni aynı olamaz / confirmation), tenant-scope,
// atomik update (passwordHash+passwordChangedAt+tokenVersion++), audit redaction.
import { BadRequestException, UnauthorizedException } from "@nestjs/common";
import * as bcrypt from "bcrypt";
import { UserService } from "../user.service";

const CURRENT_PASSWORD = "current-pass-12345";
const CURRENT_HASH = bcrypt.hashSync(CURRENT_PASSWORD, 10);

function makeSvc(userOverrides: Partial<{ id: string; tenantId: string; passwordHash: string | null }> = {}) {
  const user = {
    id: "u1",
    tenantId: "t1",
    passwordHash: CURRENT_HASH,
    ...userOverrides,
  };
  const prisma = {
    user: {
      findFirst: jest.fn().mockImplementation((args: any) =>
        args.where.id === user.id && args.where.tenantId === user.tenantId ? user : null
      ),
      update: jest.fn().mockImplementation((args: any) => ({ ...user, ...args.data })),
    },
  } as any;
  const audit = { log: jest.fn().mockResolvedValue(undefined) } as any;
  return { svc: new UserService(prisma, audit), prisma, audit, user };
}

const VALID_NEW = "brand-new-password-2026";

describe("UserService — OFFICE-AUTH-P01 changeOwnPassword", () => {
  it("[1] doğru mevcut parola + geçerli yeni parola → başarılı, passwordHash/passwordChangedAt/tokenVersion güncellenir", async () => {
    const { svc, prisma } = makeSvc();
    const result = await svc.changeOwnPassword("u1", "t1", {
      currentPassword: CURRENT_PASSWORD,
      newPassword: VALID_NEW,
      newPasswordConfirmation: VALID_NEW,
    });
    expect(result).toEqual({ ok: true });
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "u1" },
        data: expect.objectContaining({
          passwordChangedAt: expect.any(Date),
          tokenVersion: { increment: 1 },
        }),
      })
    );
  });

  it("[2] yanlış mevcut parola → BadRequestException, generic mesaj (hangi alanın yanlış olduğu detaylandırılmaz)", async () => {
    const { svc } = makeSvc();
    await expect(
      svc.changeOwnPassword("u1", "t1", {
        currentPassword: "wrong-password",
        newPassword: VALID_NEW,
        newPasswordConfirmation: VALID_NEW,
      })
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("[3] yeni parola confirmation ile eşleşmiyor → BadRequestException", async () => {
    const { svc } = makeSvc();
    await expect(
      svc.changeOwnPassword("u1", "t1", {
        currentPassword: CURRENT_PASSWORD,
        newPassword: VALID_NEW,
        newPasswordConfirmation: "different-confirmation",
      })
    ).rejects.toThrow("eşleşmiyor");
  });

  it("[4] yeni parola mevcut parolayla AYNI → BadRequestException", async () => {
    const { svc } = makeSvc();
    await expect(
      svc.changeOwnPassword("u1", "t1", {
        currentPassword: CURRENT_PASSWORD,
        newPassword: CURRENT_PASSWORD,
        newPasswordConfirmation: CURRENT_PASSWORD,
      })
    ).rejects.toThrow("aynı olamaz");
  });

  it("[5] yeni parola 72 bayttan uzun (UTF-8) → BadRequestException (bcrypt truncation belirsizliğine izin verilmez)", async () => {
    const { svc } = makeSvc();
    const tooLong = "a".repeat(73);
    await expect(
      svc.changeOwnPassword("u1", "t1", {
        currentPassword: CURRENT_PASSWORD,
        newPassword: tooLong,
        newPasswordConfirmation: tooLong,
      })
    ).rejects.toThrow("72 bayt");
  });

  it("[5b] çok baytlı (Türkçe) karakterlerle 72 bayt sınırı BYTE bazında hesaplanır (char-count değil)", async () => {
    const { svc } = makeSvc();
    // 'ğ' UTF-8'de 2 bayt: 40 karakter * 2 bayt = 80 bayt > 72, ama char.length=40 < 72.
    const multiByte = "ğ".repeat(40);
    await expect(
      svc.changeOwnPassword("u1", "t1", {
        currentPassword: CURRENT_PASSWORD,
        newPassword: multiByte,
        newPasswordConfirmation: multiByte,
      })
    ).rejects.toThrow("72 bayt");
  });

  it("[6] başka tenant'ın kullanıcısı hedeflenemez — findFirst {id,tenantId} eşleşmezse Unauthorized", async () => {
    const { svc } = makeSvc({ tenantId: "t1" });
    await expect(
      svc.changeOwnPassword("u1", "t2-YANLIS-TENANT", {
        currentPassword: CURRENT_PASSWORD,
        newPassword: VALID_NEW,
        newPasswordConfirmation: VALID_NEW,
      })
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("[7] passwordHash null (pending/davetli kullanıcı) → Unauthorized, crash etmez", async () => {
    const { svc } = makeSvc({ passwordHash: null });
    await expect(
      svc.changeOwnPassword("u1", "t1", {
        currentPassword: "anything",
        newPassword: VALID_NEW,
        newPasswordConfirmation: VALID_NEW,
      })
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("[8] audit PASSWORD_CHANGED yazılır, metadata parola/hash İÇERMEZ", async () => {
    const { svc, audit } = makeSvc();
    await svc.changeOwnPassword("u1", "t1", {
      currentPassword: CURRENT_PASSWORD,
      newPassword: VALID_NEW,
      newPasswordConfirmation: VALID_NEW,
    });
    expect(audit.log).toHaveBeenCalledTimes(1);
    const call = audit.log.mock.calls[0][0];
    expect(call.action).toBe("PASSWORD_CHANGED");
    expect(call.tenantId).toBe("t1");
    expect(call.userId).toBe("u1");
    const serialized = JSON.stringify(call);
    expect(serialized).not.toContain(VALID_NEW);
    expect(serialized).not.toContain(CURRENT_PASSWORD);
    expect(serialized).not.toContain(CURRENT_HASH);
  });
});
