// K1-7: passwordHash nullable sonrası login/validate davranışı (null-guard + isActive).
import { UnauthorizedException } from "@nestjs/common";
import * as bcrypt from "bcrypt";
import { AuthService } from "../auth.service";

function make(userRow: any) {
  const prisma = {
    user: {
      findFirst: jest.fn().mockResolvedValue(userRow),
      findUnique: jest.fn().mockResolvedValue(userRow),
    },
  } as any;
  const jwt = { sign: jest.fn().mockReturnValue("jwt-token") } as any;
  return { svc: new AuthService(prisma, jwt) };
}

const HASH = bcrypt.hashSync("correct-horse", 10);

describe("AuthService — K1-7 passwordHash nullable guard", () => {
  it("[1] mevcut (passwordHash dolu + aktif) kullanıcı login olur", async () => {
    const { svc } = make({ id: "u1", tenantId: "t1", email: "a@x.com", passwordHash: HASH, role: "ADMIN", isActive: true, tenant: {} });
    const r = await svc.login({ email: "a@x.com", password: "correct-horse" } as any);
    expect(r.token).toBe("jwt-token");
    expect((r.user as any).passwordHash).toBeUndefined(); // sanitize korunur
  });

  it("[2] passwordHash=null kullanıcı login OLAMAZ (bcrypt crash YOK → Unauthorized)", async () => {
    // isActive=true seçilir ki YALNIZ null-guard tetiklensin (guard isActive'den önce çalışır)
    const { svc } = make({ id: "u1", tenantId: "t1", email: "a@x.com", passwordHash: null, role: "USER", isActive: true, tenant: {} });
    await expect(svc.login({ email: "a@x.com", password: "anything" } as any)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("[3] isActive=false kullanıcı login OLAMAZ", async () => {
    const { svc } = make({ id: "u1", tenantId: "t1", email: "a@x.com", passwordHash: HASH, role: "USER", isActive: false, tenant: {} });
    await expect(svc.login({ email: "a@x.com", password: "correct-horse" } as any)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("[4] validateUser (JWT validate yolu) isActive=false kullanıcıyı reddeder", async () => {
    const { svc } = make({ id: "u1", tenantId: "t1", email: "a@x.com", passwordHash: HASH, role: "USER", isActive: false, tenant: {} });
    await expect(svc.validateUser("u1")).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("[24] yanlış parola yine reddedilir (mevcut davranış korunur)", async () => {
    const { svc } = make({ id: "u1", tenantId: "t1", email: "a@x.com", passwordHash: HASH, role: "USER", isActive: true, tenant: {} });
    await expect(svc.login({ email: "a@x.com", password: "wrong" } as any)).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
