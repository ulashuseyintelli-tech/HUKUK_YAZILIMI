// OFFICE-AUTH-P01: parola değişince eski JWT'lerin tokenVersion karşılaştırmasıyla
// reddedilmesi (session revocation foundation) + generateToken payload'ına tokenVersion eklenmesi.
import { UnauthorizedException } from "@nestjs/common";
import { AuthService } from "../auth.service";

function makeSvc(findUniqueImpl: (args: any) => any) {
  const prisma = {
    user: {
      findUnique: jest.fn().mockImplementation(findUniqueImpl),
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
  } as any;
  const jwt = { sign: jest.fn().mockReturnValue("jwt-token") } as any;
  return { svc: new AuthService(prisma, jwt), prisma, jwt };
}

const ACTIVE_USER = (tokenVersion: number) => ({
  id: "u1",
  tenantId: "t1",
  email: "a@x.com",
  role: "ADMIN",
  isActive: true,
  tokenVersion,
  tenant: { id: "t1", slug: "tenant-one" },
});

describe("AuthService — OFFICE-AUTH-P01 tokenVersion revocation", () => {
  it("[1] payload.tokenVersion DB ile eşleşir (0=0) → geçerli, user döner", async () => {
    const { svc } = makeSvc(() => ACTIVE_USER(0));
    const user = await svc.validateUser("u1", 0);
    expect(user.id).toBe("u1");
  });

  it("[2] claim İÇERMEYEN (eski) token — payload.tokenVersion undefined, DB=0 → backward-compat, geçerli", async () => {
    const { svc } = makeSvc(() => ACTIVE_USER(0));
    const user = await svc.validateUser("u1", undefined);
    expect(user.id).toBe("u1");
  });

  it("[3] parola değişmiş (DB tokenVersion=1) + eski/claimsiz token (0 kabul edilir) → reddedilir", async () => {
    const { svc } = makeSvc(() => ACTIVE_USER(1));
    await expect(svc.validateUser("u1", undefined)).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(svc.validateUser("u1", 0)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("[4] payload.tokenVersion DB'den farklı (ör. 1 vs 2) → reddedilir", async () => {
    const { svc } = makeSvc(() => ACTIVE_USER(2));
    await expect(svc.validateUser("u1", 1)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("[5] parola değişimi sonrası GÜNCEL tokenVersion ile gelen token → geçerli (yeni login çalışır)", async () => {
    const { svc } = makeSvc(() => ACTIVE_USER(1));
    const user = await svc.validateUser("u1", 1);
    expect(user.id).toBe("u1");
  });

  it("[6] user bulunamazsa tokenVersion'dan bağımsız reddedilir (mevcut davranış korunur)", async () => {
    const { svc } = makeSvc(() => null);
    await expect(svc.validateUser("nope", 0)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("[7] generateToken (login/register üzerinden dolaylı) JWT payload'ına tokenVersion ekler", async () => {
    const { svc, prisma, jwt } = makeSvc(() => null);
    prisma.user.findFirst.mockImplementation((args: any) =>
      args.where.tenant?.slug === "tenant-one" ? { ...ACTIVE_USER(3), passwordHash: "$2b$10$abcxyzabcxyzabcxyzabcuFqzWK8j8y8y8y8y8y8y8y8y8y8y8y8y" } : null
    );
    const bcrypt = require("bcrypt");
    jest.spyOn(bcrypt, "compare").mockResolvedValue(true);
    await svc.login({ email: "a@x.com", password: "whatever", tenantSlug: "tenant-one" } as any);
    expect(jwt.sign).toHaveBeenCalledWith(
      expect.objectContaining({ sub: "u1", tokenVersion: 3 })
    );
    jest.restoreAllMocks();
  });
});
