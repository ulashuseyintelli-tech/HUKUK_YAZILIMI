/**
 * CLIENT-P2-U02 — PortalAuthGuard DB-backed fail-closed tokenVersion doğrulaması.
 *
 * AS-IS (U01 ve öncesi): guard yalnız imza/expiry/type kontrolü yapıyordu, sıfır DB
 * sorgusu — password reset/change/disable sonrası eski JWT'ler 7 gün boyunca geçerli
 * kalıyordu. Bu dosya yeni davranışı doğrular: imza doğrulamasından sonra portal user
 * PK ile yüklenir; not-found/disabled/clientId-mismatch/tenantId-mismatch/stale-version/
 * geçersiz-version-tipi → hepsi AYNI genel "Geçersiz token" mesajıyla reddedilir
 * (ret nedeni response'ta ayrıştırılmaz).
 *
 * Altyapı hatası ayrımı (owner kararı 2026-10-10): oturum doğrulaması TANINAN bir veritabanı
 * erişim hatası yüzünden tamamlanamazsa yanıt 503'tür (genel metin) — bu bir oturum reddi
 * değildir. Erişim yine kapalıdır: korunan işlem çalışmaz. Tanınmayan (beklenmeyen) hata önceki
 * kapalı davranışta kalır (401). Dosyanın sonundaki iki `describe` bunu ölçer.
 */
import {
  Controller,
  ExecutionContext,
  Get,
  INestApplication,
  Logger,
  Module,
  Post,
  ServiceUnavailableException,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { ExpressAdapter } from "@nestjs/platform-express";
import { JwtService } from "@nestjs/jwt";
import { Prisma } from "@prisma/client";
import * as http from "http";
import { PrismaService } from "../../../prisma/prisma.service";
import { PORTAL_AUTH_UNAVAILABLE_MESSAGE, PortalAuthGuard, classifyPortalAuthFailure } from "../portal-auth.guard";

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
  client: { tenantId: "T1", tenant: { lifecycle: "ACTIVE" } },
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
      select: { id: true, clientId: true, isActive: true, tokenVersion: true, client: { select: { tenantId: true, tenant: { select: { lifecycle: true } } } } },
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
      findUnique: jest.fn().mockResolvedValue(dbRow({ client: { tenantId: "T1", tenant: { lifecycle: "ACTIVE" } } })),
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

  it("[11] TANINMAYAN (beklenmeyen) lookup hatası → DENY 401 (fail-closed, hata detayı response'a sızmaz)", async () => {
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

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Altyapı hatası oturum reddinden AYRILIR (owner kararı 2026-10-10)
// ─────────────────────────────────────────────────────────────────────────────────────────────

/** Prisma'nın veritabanına ulaşamadığında fırlattığı hata; iletisi bilerek bağlantı ayrıntısı taşır. */
const dbUnavailable = (code: string) =>
  new Prisma.PrismaClientKnownRequestError("Can't reach database server at `db-internal-host:5432`", { code, clientVersion: "test" });

const SIZINTI = /db-internal-host|5432|P\d{4}|Prisma|database server|Can't reach/i;
/** Günlükte hata SINIFI ve kodu bulunabilir; ileti metni (bağlantı ayrıntısı) bulunamaz. */
const GUNLUK_SIZINTI = /db-internal-host|5432|database server|Can't reach|connection refused/i;

describe("PortalAuthGuard — veritabanı erişim hatası 503'tür, oturum reddi DEĞİLDİR", () => {
  it.each(["P1000", "P1001", "P1002", "P1003", "P1008", "P1010", "P1011", "P1017", "P2024", "P2037"])(
    "[13] tanınan veritabanı erişim hatası %s → 503 (genel metin); 401 DEĞİL; request.portalUser YAZILMAZ; ayrıntı sızmaz",
    async (code) => {
      const { guard } = buildGuard({ verify: jest.fn().mockResolvedValue(payload()), findUnique: jest.fn().mockRejectedValue(dbUnavailable(code)) });
      const { ctx, request } = buildContext("tok");
      const err = await guard.canActivate(ctx).then(
        () => { throw new Error("ret bekleniyordu ama kapı izin verdi"); },
        (e) => e,
      );
      expect(err).toBeInstanceOf(ServiceUnavailableException);
      expect(err).not.toBeInstanceOf(UnauthorizedException);
      expect(err.getStatus()).toBe(503);
      expect(err.message).toBe(PORTAL_AUTH_UNAVAILABLE_MESSAGE);
      expect(JSON.stringify(err.getResponse())).not.toMatch(SIZINTI);
      expect(request.portalUser).toBeUndefined();
    },
  );

  it("[14] veritabanına hiç bağlanılamadı (PrismaClientInitializationError) → 503; ayrıntı sızmaz", async () => {
    const init = new Prisma.PrismaClientInitializationError("Can't reach database server at `db-internal-host:5432`", "test", "P1001");
    const { guard } = buildGuard({ verify: jest.fn().mockResolvedValue(payload()), findUnique: jest.fn().mockRejectedValue(init) });
    const { ctx, request } = buildContext("tok");
    const err = await guard.canActivate(ctx).catch((e) => e);
    expect(err).toBeInstanceOf(ServiceUnavailableException);
    expect(JSON.stringify(err.getResponse())).not.toMatch(SIZINTI);
    expect(request.portalUser).toBeUndefined();
  });

  it.each(["P1009", "P1012", "P2002", "P2021", "P2025", "P2028", "P2034"])(
    "[15] bağlantı DIŞI Prisma hatası %s altyapı hatası SAYILMAZ → önceki kapalı davranış (401); 503 DEĞİL",
    async (code) => {
      const other = new Prisma.PrismaClientKnownRequestError("sorgu hatası", { code, clientVersion: "test" });
      const { guard } = buildGuard({ verify: jest.fn().mockResolvedValue(payload()), findUnique: jest.fn().mockRejectedValue(other) });
      const { ctx, request } = buildContext("tok");
      const err = await guard.canActivate(ctx).catch((e) => e);
      expect(err).toBeInstanceOf(UnauthorizedException);
      expect(err.message).toBe("Geçersiz token");
      expect(request.portalUser).toBeUndefined();
    },
  );

  it.each([
    ["TokenExpiredError", Object.assign(new Error("jwt expired"), { name: "TokenExpiredError" })],
    ["JsonWebTokenError", Object.assign(new Error("invalid signature"), { name: "JsonWebTokenError" })],
    ["NotBeforeError", Object.assign(new Error("jwt not active"), { name: "NotBeforeError" })],
    ["ham SyntaxError (çözülemeyen gövde)", new SyntaxError("Unexpected token")],
    ["adsız düz hata", new Error("x")],
    ["Prisma bağlantı hatası KILIĞINDA bir doğrulama hatası", dbUnavailable("P1001")],
  ])(
    "[16] işaret doğrulama adımı %s fırlatır → 401 (oturum reddi); 503 DEĞİL; veritabanı SORGULANMAZ; uyarı / hata günlüğü yok",
    async (_ad, verifyError) => {
      const warn = jest.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
      const error = jest.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);
      try {
        const findUnique = jest.fn();
        const { guard } = buildGuard({ verify: jest.fn().mockRejectedValue(verifyError), findUnique });
        const err = await guard.canActivate(buildContext("tok").ctx).catch((e) => e);
        expect(err).toBeInstanceOf(UnauthorizedException);
        expect(err.message).toBe("Geçersiz token");
        expect(findUnique).not.toHaveBeenCalled();
        expect(warn).not.toHaveBeenCalled();
        expect(error).not.toHaveBeenCalled();
      } finally {
        warn.mockRestore();
        error.mockRestore();
      }
    },
  );

  it.each([
    ["kapatılmış hesap", dbRow({ isActive: false })],
    ["sürümü uyuşmayan oturum", dbRow({ tokenVersion: 7 })],
    ["bulunamayan kullanıcı", null],
    ["askıya alınmış büro", dbRow({ client: { tenantId: "T1", tenant: { lifecycle: "SUSPENDED" } } })],
  ])("[17] %s → 401 KALIR (503 DEĞİL)", async (_ad, row) => {
    const { guard } = buildGuard({ verify: jest.fn().mockResolvedValue(payload()), findUnique: jest.fn().mockResolvedValue(row) });
    const err = await guard.canActivate(buildContext("tok").ctx).catch((e) => e);
    expect(err).toBeInstanceOf(UnauthorizedException);
    expect(err.message).toBe("Geçersiz token");
  });

  it("[18] sınıflandırma: kimlik doğrulama / tanınan veritabanı erişim hatası / beklenmeyen", () => {
    expect(classifyPortalAuthFailure(new UnauthorizedException("x"))).toBe("AUTH");
    // ad benzerliğine güvenilmez: işaret doğrulama hataları kapıda 401'e çevrilir ([16], [20]); sınıflandırıcı adı tanımaz
    expect(classifyPortalAuthFailure(Object.assign(new Error("jwt expired"), { name: "TokenExpiredError" }))).toBe("UNEXPECTED");
    expect(classifyPortalAuthFailure(dbUnavailable("P1001"))).toBe("DATABASE_UNAVAILABLE");
    expect(classifyPortalAuthFailure(new Prisma.PrismaClientInitializationError("x", "test"))).toBe("DATABASE_UNAVAILABLE");
    // "bütün istisnalar 503" DEĞİL: aşağıdakilerin hiçbiri altyapı hatası sayılmaz
    expect(classifyPortalAuthFailure(new Prisma.PrismaClientKnownRequestError("x", { code: "P2025", clientVersion: "test" }))).toBe("UNEXPECTED");
    expect(classifyPortalAuthFailure(new Prisma.PrismaClientUnknownRequestError("x", { clientVersion: "test" }))).toBe("UNEXPECTED");
    expect(classifyPortalAuthFailure(new Prisma.PrismaClientRustPanicError("x", "test"))).toBe("UNEXPECTED");
    expect(classifyPortalAuthFailure(new Prisma.PrismaClientValidationError("x", { clientVersion: "test" }))).toBe("UNEXPECTED");
    expect(classifyPortalAuthFailure(new Error("connection refused"))).toBe("UNEXPECTED");
    expect(classifyPortalAuthFailure(new TypeError("x"))).toBe("UNEXPECTED");
    expect(classifyPortalAuthFailure({ code: "P1001" })).toBe("UNEXPECTED"); // Prisma sınıfı değil: yalnız kod benzerliği yetmez
    expect(classifyPortalAuthFailure(undefined)).toBe("UNEXPECTED");
    expect(classifyPortalAuthFailure(null)).toBe("UNEXPECTED");
  });
});

describe("PortalAuthGuard — günlük: yalnız hata sınıfı / kodu; ileti metni ve bağlantı ayrıntısı YOK", () => {
  let warn: jest.SpyInstance;
  let error: jest.SpyInstance;
  beforeEach(() => {
    warn = jest.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
    error = jest.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);
  });
  afterEach(() => { warn.mockRestore(); error.mockRestore(); });
  const logged = () => JSON.stringify([...warn.mock.calls, ...error.mock.calls]);

  it("[19a] veritabanı erişim hatası → BİR uyarı satırı (sınıf + kod); hata düzeyi yok; ileti metni günlüğe yazılmaz", async () => {
    const { guard } = buildGuard({ verify: jest.fn().mockResolvedValue(payload()), findUnique: jest.fn().mockRejectedValue(dbUnavailable("P1001")) });
    await expect(guard.canActivate(buildContext("tok").ctx)).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(error).not.toHaveBeenCalled();
    expect(String(warn.mock.calls[0][0])).toContain("PrismaClientKnownRequestError P1001");
    expect(logged()).not.toMatch(GUNLUK_SIZINTI);
  });

  it("[19b] beklenmeyen hata → BİR hata satırı (yalnız sınıf adı); ileti metni günlüğe yazılmaz", async () => {
    const { guard } = buildGuard({
      verify: jest.fn().mockResolvedValue(payload()),
      findUnique: jest.fn().mockRejectedValue(new Error("connection refused db-internal-host:5432")),
    });
    await expect(guard.canActivate(buildContext("tok").ctx)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(error).toHaveBeenCalledTimes(1);
    expect(warn).not.toHaveBeenCalled();
    expect(String(error.mock.calls[0][0])).toContain("(Error)");
    expect(logged()).not.toMatch(GUNLUK_SIZINTI);
  });

  it("[19d] veritabanına hiç bağlanılamadı (başlatma hatası) → BİR uyarı satırı (sınıf + kod); ileti metni günlüğe yazılmaz", async () => {
    const init = new Prisma.PrismaClientInitializationError("Can't reach database server at `db-internal-host:5432`", "test", "P1001");
    const { guard } = buildGuard({ verify: jest.fn().mockResolvedValue(payload()), findUnique: jest.fn().mockRejectedValue(init) });
    await expect(guard.canActivate(buildContext("tok").ctx)).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(error).not.toHaveBeenCalled();
    expect(String(warn.mock.calls[0][0])).toContain("PrismaClientInitializationError P1001");
    expect(logged()).not.toMatch(GUNLUK_SIZINTI);
  });

  it("[19c] oturum reddi (kapatılmış hesap) → uyarı / hata satırı YOK", async () => {
    const { guard } = buildGuard({ verify: jest.fn().mockResolvedValue(payload()), findUnique: jest.fn().mockResolvedValue(dbRow({ isActive: false })) });
    await expect(guard.canActivate(buildContext("tok").ctx)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(warn).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });

  // Gerçek JwtService: sahte "verifyAsync" yerine kitaplığın GERÇEKTEN fırlattığı hatalar sınıflandırılır.
  const realJwt = new JwtService({ secret: "yalniz-test-icin-gizli-deger" });
  const b64 = (v: string) => Buffer.from(v, "utf8").toString("base64url");
  const BOZUK_GOVDE = `${b64(JSON.stringify({ alg: "HS256", typ: "JWT" }))}.${b64("{bozuk-govde")}.imza`;

  it.each([
    ["rastgele metin", () => "bu-bir-isaret-degil"],
    ["başlığı geçerli, gövdesi çözülemeyen işaret", () => BOZUK_GOVDE],
    ["başka anahtarla imzalanmış işaret", () => new JwtService({ secret: "baska-anahtar" }).sign(payload())],
    ["süresi dolmuş işaret", () => realJwt.sign({ ...payload(), exp: Math.floor(Date.now() / 1000) - 60 })],
  ])("[20] gerçek JwtService — %s → 401; veritabanı SORGULANMAZ; uyarı / hata düzeyinde günlük ÜRETİLMEZ", async (_ad, make) => {
    const findUnique = jest.fn();
    const guard = new PortalAuthGuard(realJwt, { clientPortalUser: { findUnique } } as unknown as PrismaService);
    const { ctx, request } = buildContext(make());
    const err = await guard.canActivate(ctx).catch((e) => e);
    expect(err).toBeInstanceOf(UnauthorizedException);
    expect(err.message).toBe("Geçersiz token");
    expect(findUnique).not.toHaveBeenCalled();
    expect(request.portalUser).toBeUndefined();
    expect(warn).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });

  it("[20k] pozitif kontrol: gerçek JwtService ile imzalanmış geçerli işaret → izin; günlük yok", async () => {
    const findUnique = jest.fn().mockResolvedValue(dbRow());
    const guard = new PortalAuthGuard(realJwt, { clientPortalUser: { findUnique } } as unknown as PrismaService);
    const { ctx, request } = buildContext(realJwt.sign(payload()));
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(request.portalUser).toBeDefined();
    expect(warn).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Gerçek HTTP: doğrulama tamamlanamazsa korunan işlem ÇALIŞMAZ (okuma da yazma da)
// ─────────────────────────────────────────────────────────────────────────────────────────────

const probeRead = jest.fn();
const probeWrite = jest.fn();
const probeJwt = { verifyAsync: jest.fn() };
const probePrisma = { clientPortalUser: { findUnique: jest.fn() } };

@Controller("probe")
class GuardProbeController {
  @Get() @UseGuards(PortalAuthGuard) read() { probeRead(); return { veri: "KORUNAN-VERI" }; }
  @Post() @UseGuards(PortalAuthGuard) write() { probeWrite(); return { yazildi: true }; }
}
@Module({
  controllers: [GuardProbeController],
  providers: [PortalAuthGuard, { provide: JwtService, useValue: probeJwt }, { provide: PrismaService, useValue: probePrisma }],
})
class GuardProbeModule {}

describe("PortalAuthGuard — gerçek HTTP: 503'te korunan okuma ve yazma ÇALIŞMAZ", () => {
  let app: INestApplication;
  let port: number;

  beforeAll(async () => {
    app = await NestFactory.create(GuardProbeModule, new ExpressAdapter(), { logger: false, abortOnError: false });
    await app.listen(0, "127.0.0.1");
    port = (app.getHttpServer().address() as { port: number }).port;
  });
  afterAll(async () => { await app.close(); });
  beforeEach(() => {
    probeRead.mockClear(); probeWrite.mockClear();
    probeJwt.verifyAsync.mockReset().mockResolvedValue(payload());
    probePrisma.clientPortalUser.findUnique.mockReset();
  });

  const call = (method: "GET" | "POST") => new Promise<{ status: number; body: string }>((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port, path: "/probe", method, headers: { authorization: "Bearer tok" } }, (res) => {
      let body = ""; res.setEncoding("utf8"); res.on("data", (c) => (body += c)); res.on("end", () => resolve({ status: res.statusCode || 0, body }));
    });
    req.on("error", reject); req.end();
  });

  it("[H1] veritabanına erişilemiyor → GET ve POST 503; işleyiciler ÇAĞRILMAZ; yanıtta korunan veri / altyapı ayrıntısı YOK", async () => {
    probePrisma.clientPortalUser.findUnique.mockRejectedValue(dbUnavailable("P1001"));
    const read = await call("GET");
    const write = await call("POST");
    for (const r of [read, write]) {
      expect(r.status).toBe(503);
      expect(JSON.parse(r.body)).toEqual({ statusCode: 503, message: PORTAL_AUTH_UNAVAILABLE_MESSAGE, error: "Service Unavailable" });
      expect(r.body).not.toMatch(SIZINTI);
      expect(r.body).not.toContain("KORUNAN-VERI");
    }
    expect(probeRead).not.toHaveBeenCalled();
    expect(probeWrite).not.toHaveBeenCalled();
  });

  it("[H2] kapatılmış oturum → GET ve POST 401 \"Geçersiz token\" (mevcut davranış); işleyiciler ÇAĞRILMAZ", async () => {
    probePrisma.clientPortalUser.findUnique.mockResolvedValue(dbRow({ isActive: false }));
    const read = await call("GET");
    const write = await call("POST");
    for (const r of [read, write]) {
      expect(r.status).toBe(401);
      expect(JSON.parse(r.body).message).toBe("Geçersiz token");
    }
    expect(probeRead).not.toHaveBeenCalled();
    expect(probeWrite).not.toHaveBeenCalled();
  });

  it("[H3] beklenmeyen hata → 401 (önceki kapalı davranış); işleyiciler ÇAĞRILMAZ; ayrıntı sızmaz", async () => {
    probePrisma.clientPortalUser.findUnique.mockRejectedValue(new Error("connection refused db-internal-host:5432"));
    const read = await call("GET");
    expect(read.status).toBe(401);
    expect(read.body).not.toMatch(SIZINTI);
    expect(probeRead).not.toHaveBeenCalled();
  });

  it("[H4] pozitif kontrol: geçerli oturum → GET 200 + veri, POST 201; işleyiciler birer kez çağrılır", async () => {
    probePrisma.clientPortalUser.findUnique.mockResolvedValue(dbRow());
    const read = await call("GET");
    const write = await call("POST");
    expect(read.status).toBe(200);
    expect(JSON.parse(read.body)).toEqual({ veri: "KORUNAN-VERI" });
    expect(write.status).toBe(201);
    expect(probeRead).toHaveBeenCalledTimes(1);
    expect(probeWrite).toHaveBeenCalledTimes(1);
  });
});
