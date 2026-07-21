/**
 * CLIENT-P2-U02 — PortalAuthGuard DB-backed fail-closed tokenVersion doğrulaması.
 *
 * AS-IS (U01 ve öncesi): guard yalnız imza/expiry/type kontrolü yapıyordu, sıfır DB
 * sorgusu — password reset/change/disable sonrası eski JWT'ler 7 gün boyunca geçerli
 * kalıyordu. Bu dosya yeni davranışı doğrular: imza doğrulamasından sonra portal user
 * PK ile yüklenir; not-found/disabled/clientId-mismatch/tenantId-mismatch/stale-version/
 * geçersiz-version-tipi/DB-hatası → hepsi AYNI genel "Geçersiz token" mesajıyla reddedilir
 * (ret nedeni response'ta ayrıştırılmaz).
 */
import { UnauthorizedException, ExecutionContext } from "@nestjs/common";
import { PortalAuthGuard } from "../portal-auth.guard";

function buildContext(token?: string): { ctx: ExecutionContext; request: any } {
  const request: any = { headers: token ? { authorization: `Bearer ${token}` } : {} };
  const ctx = { switchToHttp: () => ({ getRequest: () => request }) } as any;
  return { ctx, request };
}

function buildGuard(over: { verify?: jest.Mock; findUnique?: jest.Mock }) {
  const jwtService: any = { verifyAsync: over.verify ?? jest.fn() };
  const prisma: any = { clientPortalUser: { findUnique: over.findUnique ?? jest.fn() } };
  const guard = new PortalAuthGuard(jwtService, prisma);
  return { guard, jwtService, prisma };
}

const dbRow = (over: any = {}) => ({
  id: "PU1",
  clientId: "C1",
  isActive: true,
  tokenVersion: 0,
  client: { tenantId: "T1" },
  ...over,
});

const payload = (over: any = {}) => ({
  sub: "PU1",
  clientId: "C1",
  tenantId: "T1",
  type: "portal",
  tokenVersion: 0,
  ...over,
});

describe("PortalAuthGuard — CLIENT-P2-U02 DB-backed fail-closed doğrulama", () => {
  it("[1] geçerli imza + güncel version → ALLOW, req.portalUser yalnız DB-doğrulanmış alanlarla yazılır", async () => {
    const findUnique = jest.fn().mockResolvedValue(dbRow());
    const { guard, prisma } = buildGuard({ verify: jest.fn().mockResolvedValue(payload()), findUnique });
    const { ctx, request } = buildContext("tok");

    await expect(guard.canActivate(ctx)).resolves.toBe(true);

    expect(request.portalUser).toEqual({ id: "PU1", sub: "PU1", clientId: "C1", tenantId: "T1", tokenVersion: 0 });
    expect(prisma.clientPortalUser.findUnique).toHaveBeenCalledWith({
      where: { id: "PU1" },
      select: { id: true, clientId: true, isActive: true, tokenVersion: true, client: { select: { tenantId: true } } },
    });
  });

  it("[2] legacy claim yok (tokenVersion absent) + DB version 0 → ALLOW (claim yoksa 0 kabul edilir)", async () => {
    const p: any = payload();
    delete p.tokenVersion;
    const { guard } = buildGuard({
      verify: jest.fn().mockResolvedValue(p),
      findUnique: jest.fn().mockResolvedValue(dbRow({ tokenVersion: 0 })),
    });
    await expect(guard.canActivate(buildContext("tok").ctx)).resolves.toBe(true);
  });

  it("[3] legacy claim yok + DB version >0 → DENY (0'a normalize edilen claim artık DB ile eşleşmez)", async () => {
    const p: any = payload();
    delete p.tokenVersion;
    const { guard } = buildGuard({
      verify: jest.fn().mockResolvedValue(p),
      findUnique: jest.fn().mockResolvedValue(dbRow({ tokenVersion: 2 })),
    });
    await expect(guard.canActivate(buildContext("tok").ctx)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("[4] stale version (payload 0, DB 1 — reset/change sonrası eski token) → DENY", async () => {
    const { guard } = buildGuard({
      verify: jest.fn().mockResolvedValue(payload({ tokenVersion: 0 })),
      findUnique: jest.fn().mockResolvedValue(dbRow({ tokenVersion: 1 })),
    });
    await expect(guard.canActivate(buildContext("tok").ctx)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("[5] future/mismatched version (payload 5, DB 1) → DENY", async () => {
    const { guard } = buildGuard({
      verify: jest.fn().mockResolvedValue(payload({ tokenVersion: 5 })),
      findUnique: jest.fn().mockResolvedValue(dbRow({ tokenVersion: 1 })),
    });
    await expect(guard.canActivate(buildContext("tok").ctx)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("[6] disabled portal user (isActive=false) → DENY (immediate, tokenVersion eşleşse bile)", async () => {
    const { guard } = buildGuard({
      verify: jest.fn().mockResolvedValue(payload()),
      findUnique: jest.fn().mockResolvedValue(dbRow({ isActive: false })),
    });
    await expect(guard.canActivate(buildContext("tok").ctx)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("[7] portal user bulunamadı (findUnique null) → DENY", async () => {
    const { guard } = buildGuard({
      verify: jest.fn().mockResolvedValue(payload()),
      findUnique: jest.fn().mockResolvedValue(null),
    });
    await expect(guard.canActivate(buildContext("tok").ctx)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("[8] payload.clientId ≠ DB clientId → DENY", async () => {
    const { guard } = buildGuard({
      verify: jest.fn().mockResolvedValue(payload({ clientId: "OTHER-CLIENT" })),
      findUnique: jest.fn().mockResolvedValue(dbRow({ clientId: "C1" })),
    });
    await expect(guard.canActivate(buildContext("tok").ctx)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("[9] payload.tenantId ≠ DB (client.tenantId) → DENY", async () => {
    const { guard } = buildGuard({
      verify: jest.fn().mockResolvedValue(payload({ tenantId: "OTHER-TENANT" })),
      findUnique: jest.fn().mockResolvedValue(dbRow({ client: { tenantId: "T1" } })),
    });
    await expect(guard.canActivate(buildContext("tok").ctx)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("[10a] tokenVersion claim string → DENY (tip geçersiz)", async () => {
    const { guard } = buildGuard({ verify: jest.fn().mockResolvedValue(payload({ tokenVersion: "3" })), findUnique: jest.fn() });
    await expect(guard.canActivate(buildContext("tok").ctx)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("[10b] tokenVersion claim negatif → DENY", async () => {
    const { guard } = buildGuard({ verify: jest.fn().mockResolvedValue(payload({ tokenVersion: -1 })), findUnique: jest.fn() });
    await expect(guard.canActivate(buildContext("tok").ctx)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("[10c] tokenVersion claim tam sayı değil (float) → DENY", async () => {
    const { guard } = buildGuard({ verify: jest.fn().mockResolvedValue(payload({ tokenVersion: 1.5 })), findUnique: jest.fn() });
    await expect(guard.canActivate(buildContext("tok").ctx)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("[10d] tokenVersion claim null → DENY", async () => {
    const { guard } = buildGuard({ verify: jest.fn().mockResolvedValue(payload({ tokenVersion: null })), findUnique: jest.fn() });
    await expect(guard.canActivate(buildContext("tok").ctx)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("[11] DB lookup hatası (connection refused) → DENY (fail-closed, DB detayı response'a sızmaz)", async () => {
    const { guard } = buildGuard({
      verify: jest.fn().mockResolvedValue(payload()),
      findUnique: jest.fn().mockRejectedValue(new Error("connection refused")),
    });
    const result = guard.canActivate(buildContext("tok").ctx);
    await expect(result).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(result).rejects.not.toThrow(/connection refused/);
  });

  it("[12] malformed/geçersiz imzalı JWT (verifyAsync throw) → DENY", async () => {
    const { guard } = buildGuard({ verify: jest.fn().mockRejectedValue(new Error("invalid signature")), findUnique: jest.fn() });
    await expect(guard.canActivate(buildContext("tok").ctx)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("token yok (Authorization header eksik) → DENY (\"Token bulunamadı\")", async () => {
    const { guard } = buildGuard({ verify: jest.fn(), findUnique: jest.fn() });
    await expect(guard.canActivate(buildContext(undefined).ctx)).rejects.toThrow("Token bulunamadı");
  });

  it("payload.type !== \"portal\" (ör. staff token) → DENY", async () => {
    const { guard } = buildGuard({ verify: jest.fn().mockResolvedValue(payload({ type: "staff" })), findUnique: jest.fn() });
    await expect(guard.canActivate(buildContext("tok").ctx)).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
