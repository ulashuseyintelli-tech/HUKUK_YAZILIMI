// AUTH-01: tenant-aware login (tenantSlug ZORUNLU) + global findFirst(email) kaldırılması
// + Account/Tenant Recovery (findTenantsForEmail) enumeration-safe davranışı.
import { UnauthorizedException } from "@nestjs/common";
import * as bcrypt from "bcrypt";
import { AuthService } from "../auth.service";

function makeSvc(findFirstImpl: (args: any) => any, findManyImpl?: (args: any) => any) {
  const prisma = {
    user: {
      findFirst: jest.fn().mockImplementation(findFirstImpl),
      findMany: jest.fn().mockImplementation(findManyImpl ?? (() => [])),
      findUnique: jest.fn(),
    },
  } as any;
  const jwt = { sign: jest.fn().mockReturnValue("jwt-token") } as any;
  return { svc: new AuthService(prisma, jwt), prisma };
}

const HASH = bcrypt.hashSync("correct-horse", 10);

const USER_T1 = {
  id: "u1",
  tenantId: "t1",
  email: "shared@x.com",
  passwordHash: HASH,
  role: "ADMIN",
  isActive: true,
  tenant: { id: "t1", slug: "tenant-one", name: "Tenant One" },
};

const USER_T2 = {
  id: "u2",
  tenantId: "t2",
  email: "shared@x.com",
  passwordHash: bcrypt.hashSync("other-pass", 10),
  role: "USER",
  isActive: true,
  tenant: { id: "t2", slug: "tenant-two", name: "Tenant Two" },
};

describe("AuthService — AUTH-01 tenant-aware login", () => {
  it("[1] doğru tenantSlug + email + parola → JWT (findFirst where'de tenant.slug kullanılır)", async () => {
    const { svc, prisma } = makeSvc((args) => {
      if (args.where.email === "shared@x.com" && args.where.tenant?.slug === "tenant-one") return USER_T1;
      return null;
    });
    const r = await svc.login({ email: "shared@x.com", password: "correct-horse", tenantSlug: "tenant-one" } as any);
    expect(r.token).toBe("jwt-token");
    expect(prisma.user.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { email: "shared@x.com", tenant: { slug: "tenant-one" } } })
    );
  });

  it("[2] AYNI email, farklı tenantSlug → DOĞRU kullanıcıyla eşleşir (cross-tenant email çakışması senaryosu)", async () => {
    const { svc } = makeSvc((args) => {
      if (args.where.tenant?.slug === "tenant-one") return USER_T1;
      if (args.where.tenant?.slug === "tenant-two") return USER_T2;
      return null;
    });
    const r1 = await svc.login({ email: "shared@x.com", password: "correct-horse", tenantSlug: "tenant-one" } as any);
    expect((r1.user as any).id).toBe("u1");

    const r2 = await svc.login({ email: "shared@x.com", password: "other-pass", tenantSlug: "tenant-two" } as any);
    expect((r2.user as any).id).toBe("u2");
  });

  it("[3] doğru email ama YANLIŞ tenantSlug → generic Unauthorized (kullanıcının başka tenant'ta var olduğu sızmaz)", async () => {
    const { svc } = makeSvc((args) => {
      if (args.where.tenant?.slug === "tenant-one") return USER_T1;
      return null; // tenant-two için USER_T1 bulunamaz
    });
    await expect(
      svc.login({ email: "shared@x.com", password: "correct-horse", tenantSlug: "tenant-two" } as any)
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("[4] tenantSlug hiç eşleşmiyor (kurum yok) → aynı generic mesaj (email-yok ile ayırt edilemez)", async () => {
    const { svc } = makeSvc(() => null);
    await expect(
      svc.login({ email: "nope@x.com", password: "anything", tenantSlug: "no-such-tenant" } as any)
    ).rejects.toMatchObject({ message: "Geçersiz e-posta veya şifre" });
  });
});

describe("AuthService — AUTH-01 findTenantsForEmail (Account Recovery, login akışının PARÇASI DEĞİL)", () => {
  it("[5] email hiçbir aktif kullanıcıda yok → NONE", async () => {
    const { svc } = makeSvc(() => null, () => []);
    const r = await svc.findTenantsForEmail("nobody@x.com");
    expect(r).toEqual({ status: "NONE" });
  });

  it("[6] email tam 1 aktif tenant'ta var → SINGLE + yalnız slug/name döner (PII yok)", async () => {
    const { svc } = makeSvc(() => null, () => [USER_T1]);
    const r = await svc.findTenantsForEmail("shared@x.com");
    expect(r).toEqual({ status: "SINGLE", tenantSlug: "tenant-one", tenantName: "Tenant One" });
  });

  it("[7] email >1 aktif tenant'ta var → MULTIPLE + yalnız slug/name listesi (email/kullanıcı detayı YOK)", async () => {
    const { svc } = makeSvc(() => null, () => [USER_T1, USER_T2]);
    const r = await svc.findTenantsForEmail("shared@x.com");
    expect(r).toEqual({
      status: "MULTIPLE",
      tenants: [
        { tenantSlug: "tenant-one", tenantName: "Tenant One" },
        { tenantSlug: "tenant-two", tenantName: "Tenant Two" },
      ],
    });
  });

  it("[8] yalnız isActive:true filtrelenir (findMany where'i doğrulanır — pending/deaktif hesap sızmaz)", async () => {
    const { svc, prisma } = makeSvc(() => null, () => []);
    await svc.findTenantsForEmail("x@x.com");
    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { email: "x@x.com", isActive: true } })
    );
  });
});
