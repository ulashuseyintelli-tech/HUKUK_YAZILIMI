import { CanActivate, ExecutionContext, INestApplication, ModuleMetadata, UnauthorizedException, ValidationPipe } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AuthGuard } from "@nestjs/passport";
import { Test } from "@nestjs/testing";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import * as request from "supertest";
import { StorageModule } from "../src/common/storage/storage.module";
import { JwtAuthGuard } from "../src/modules/auth/guards/jwt-auth.guard";
import { CASE_VIEW_ALL_KEY, CASE_VIEW_SCOPE_FLAG } from "../src/modules/case/case-view-scope";
import { ErrorLogModule } from "../src/modules/error-log/error-log.module";
import { MetricsRegistryModule } from "../src/modules/metrics-registry/metrics-registry.module";

/**
 * F02 P3 tarama dilimleri (owner kararları 09.11.2026) — gerçek HTTP + tek kullanımlık PostgreSQL testlerinin ORTAK dünyası.
 * Yalnız test yardımcısıdır (spec değil; `src` dışında → üretim derlemesine girmez). Yeni kural TANIMLAMAZ: D1 dosya görünüm
 * kapsamının dallarını (aktif Dosya Sorumlusu ∪ oluşturan ∪ CaseLawyer ∪ CaseStaff canView; `office.cases.view_all`
 * ALLOW / DENY) iki büroda kurar. Önceki P3 spec'leri kendi kurulumlarını taşır ve DEĞİŞMEDİ; bu dosyayı yeni dilimler kullanır.
 *
 * Büro A dosyaları:
 *  c1 Dosya Sorumlusu = resp · c3 oluşturan = creator · c4 CaseLawyer = link, deny, viewer · c5 CaseStaff canView = staff ·
 *  c6 ilişkisiz (noView: CaseStaff canView=false).
 * Büro B: b1 (oluşturan = v.allow); ilişki–dosya uyuşmazlığı: büro A'nın `link` kartı b1'de CaseLawyer satırı taşır.
 * İzinler: allow = ALLOW; deny = ALLOW + DENY (DENY baskın, c4 ilişkisi kalır); admin = ADMIN rolü, ilişki / izin yok.
 */
export class DbUserIdentityGuard implements CanActivate {
  constructor(private readonly db: () => PrismaClient) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const id = req.headers["x-test-user-id"];
    if (typeof id !== "string" || !id) throw new UnauthorizedException();
    const user = await this.db().user.findUnique({ where: { id }, include: { tenant: true } });
    if (!user || !user.isActive) throw new UnauthorizedException();
    req.user = user;
    return true;
  }
}

export const A_CASE_KEYS = ["c1", "c3", "c4", "c5", "c6"] as const;
export type ACaseKey = (typeof A_CASE_KEYS)[number];
export type CaseKey = ACaseKey | "b1";

export interface ScopeWorld {
  suffix: string;
  tA: string;
  tB: string;
  /** Var olmayan kimlik (bu koşuya özgü). */
  missing: string;
  u: { admin: string; resp: string; creator: string; link: string; staff: string; noView: string; allow: string; deny: string; nobody: string; viewer: string };
  v: { allow: string; nobody: string };
  lawyer: { resp: string; link: string; deny: string; viewer: string };
  staff: { staff: string; noView: string };
  c: Record<CaseKey, string>;
  fileNo: (k: CaseKey) => string;
  /** D1 dalları: [etiket, aktör, görünür dosyalar]. */
  visibility: Array<[string, string, ACaseKey[]]>;
  cleanup: (extra?: (tenantIds: string[]) => Promise<void>) => Promise<void>;
}

export async function createScopeWorld(db: PrismaClient, label: string): Promise<ScopeWorld> {
  const suffix = randomUUID().slice(0, 8);
  const tA = `test-${label}-a-${suffix}`;
  const tB = `test-${label}-b-${suffix}`;
  for (const id of [tA, tB]) await db.tenant.create({ data: { id, name: id, slug: id } });

  const mkUser = async (tenantId: string, key: string, role: "ADMIN" | "USER" | "VIEWER" = "USER") =>
    (await db.user.create({ data: { tenantId, email: `${label}-${key}-${suffix}@example.test`, name: key, surname: "P3", role } })).id;
  const u = {
    admin: await mkUser(tA, "admin", "ADMIN"),
    resp: await mkUser(tA, "resp"),
    creator: await mkUser(tA, "creator"),
    link: await mkUser(tA, "link"),
    staff: await mkUser(tA, "staff"),
    noView: await mkUser(tA, "noview"),
    allow: await mkUser(tA, "allow"),
    deny: await mkUser(tA, "deny"),
    nobody: await mkUser(tA, "nobody"),
    viewer: await mkUser(tA, "viewer", "VIEWER"),
  };
  const v = { allow: await mkUser(tB, "b-allow"), nobody: await mkUser(tB, "b-nobody") };

  const mkLawyer = async (userId: string) => (await db.lawyer.create({ data: { tenantId: tA, userId, name: "Av", surname: "P3", isActive: true } })).id;
  const lawyer = { resp: await mkLawyer(u.resp), link: await mkLawyer(u.link), deny: await mkLawyer(u.deny), viewer: await mkLawyer(u.viewer) };
  const mkStaff = async (userId: string) =>
    (await db.staffMember.create({ data: { tenantId: tA, userId, firstName: "Per", lastName: "P3", staffType: "DIGER" } })).id;
  const staff = { staff: await mkStaff(u.staff), noView: await mkStaff(u.noView) };

  const fileNo = (k: CaseKey) => `P3-${k}-${suffix}`;
  const c = {} as Record<CaseKey, string>;
  const mkCase = async (key: CaseKey, tenantId: string, data: Record<string, unknown> = {}) => {
    c[key] = (await db.case.create({ data: { tenantId, fileNumber: fileNo(key), type: "GENERAL_EXECUTION", ...data } as never })).id;
  };
  await mkCase("c1", tA, { responsibleLawyerId: lawyer.resp });
  await mkCase("c3", tA, { createdById: u.creator });
  await mkCase("c4", tA);
  await mkCase("c5", tA);
  await mkCase("c6", tA);
  await mkCase("b1", tB, { createdById: v.allow });
  for (const lawyerId of [lawyer.link, lawyer.deny, lawyer.viewer]) await db.caseLawyer.create({ data: { caseId: c.c4, lawyerId } });
  await db.caseLawyer.create({ data: { caseId: c.b1, lawyerId: lawyer.link } }); // ilişki–dosya uyuşmazlığı
  await db.caseStaff.create({ data: { caseId: c.c5, staffMemberId: staff.staff, roleOnCase: "KONTROL", canView: true } });
  await db.caseStaff.create({ data: { caseId: c.c6, staffMemberId: staff.noView, roleOnCase: "KONTROL", canView: false } });

  const grant = (tenantId: string, subjectUserId: string, effect: "ALLOW" | "DENY") =>
    db.permissionGrant.create({ data: { tenantId, subjectUserId, permissionKey: CASE_VIEW_ALL_KEY, effect, scope: "GLOBAL" } });
  await grant(tA, u.allow, "ALLOW");
  await grant(tA, u.deny, "ALLOW");
  await grant(tA, u.deny, "DENY");
  await grant(tB, v.allow, "ALLOW");

  const visibility: ScopeWorld["visibility"] = [
    ["Dosya Sorumlusu", u.resp, ["c1"]],
    ["oluşturan", u.creator, ["c3"]],
    ["CaseLawyer", u.link, ["c4"]],
    ["CaseStaff canView", u.staff, ["c5"]],
    ["CaseStaff canView=false", u.noView, []],
    ["ilişkisiz", u.nobody, []],
    ["ADMIN rolü (ilişki / izin yok)", u.admin, []],
    ["ALLOW + DENY (ilişki kalır)", u.deny, ["c4"]],
    ["ALLOW (büro geneli)", u.allow, [...A_CASE_KEYS]],
  ];

  const cleanup: ScopeWorld["cleanup"] = async (extra) => {
    const tenants = [tA, tB];
    if (extra) await extra(tenants);
    for (const tenantId of tenants) {
      await db.permissionGrant.deleteMany({ where: { tenantId } }).catch(() => undefined);
      await db.caseStaff.deleteMany({ where: { case: { tenantId } } }).catch(() => undefined);
      await db.caseLawyer.deleteMany({ where: { case: { tenantId } } }).catch(() => undefined);
      await db.case.deleteMany({ where: { tenantId } }).catch(() => undefined);
      await db.staffMember.deleteMany({ where: { tenantId } }).catch(() => undefined);
      await db.lawyer.deleteMany({ where: { tenantId } }).catch(() => undefined);
      await db.auditLog.deleteMany({ where: { tenantId } }).catch(() => undefined);
      await db.user.deleteMany({ where: { tenantId } }).catch(() => undefined);
      await db.tenant.deleteMany({ where: { id: tenantId } }).catch(() => undefined);
    }
  };

  return { suffix, tA, tB, missing: `yok-${suffix}`, u, v, lawyer, staff, c, fileNo, visibility, cleanup };
}

/** Gerçek HTTP uygulaması: verilen modüller + kök küresel modüller; JWT kapıları DB kimliğiyle değiştirilir. */
export async function buildScopeApp(db: () => PrismaClient, imports: NonNullable<ModuleMetadata["imports"]>): Promise<INestApplication> {
  const identity = new DbUserIdentityGuard(db);
  const moduleRef = await Test.createTestingModule({
    imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }), StorageModule, ErrorLogModule, MetricsRegistryModule, ...imports],
  })
    .overrideGuard(JwtAuthGuard)
    .useValue(identity)
    .overrideGuard(AuthGuard("jwt"))
    .useValue(identity)
    .compile();
  const app = moduleRef.createNestApplication();
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  await app.init();
  return app;
}

export function scopeHttp(app: () => INestApplication) {
  const http = () => request(app().getHttpServer());
  return {
    get: (actor: string, path: string) => http().get(path).set("x-test-user-id", actor),
    post: (actor: string, path: string, body: object = {}) => http().post(path).set("x-test-user-id", actor).send(body),
    anonymous: (path: string) => http().get(path),
  };
}

/** Bayrak anahtarı: testler arasında sızmayı önlemek için özgün değeri geri yükler. */
export function scopeFlag(name: string = CASE_VIEW_SCOPE_FLAG) {
  const original = process.env[name];
  return {
    on: () => void (process.env[name] = "true"),
    off: () => void delete process.env[name],
    restore: () => {
      if (original === undefined) delete process.env[name];
      else process.env[name] = original;
    },
  };
}

export const CASE_NOT_FOUND = { statusCode: 404, message: "Dosya bulunamadı", error: "Not Found" } as const;

/** Kapsam reddi: yalnız üç alanlı 404 gövdesi; verilen işaretlerin hiçbiri yanıtta yok. */
export function expectHiddenResponse(res: request.Response, body: { statusCode: number; message: string; error: string }, leaks: string[]): void {
  expect([res.status, res.body]).toEqual([body.statusCode, body]);
  expect(Object.keys(res.body).sort()).toEqual(["error", "message", "statusCode"]);
  expect(res.headers["content-disposition"]).toBeUndefined();
  const text = JSON.stringify(res.body ?? {}) + String(res.text ?? "");
  for (const leak of leaks) expect(text).not.toContain(leak);
}
