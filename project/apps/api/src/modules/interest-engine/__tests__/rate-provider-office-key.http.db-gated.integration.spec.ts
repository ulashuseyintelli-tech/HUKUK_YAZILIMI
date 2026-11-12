// Belge modülleri grafiği pdf-poppler'a uzanabilir; paket Linux'ta yükleme anında process.exit(1) verir (CI emsali).
jest.mock("pdf-poppler", () => ({
  convert: async () => {
    throw new Error("pdf-poppler is stubbed in unit tests");
  },
}));

import { INestApplication } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { buildScopeApp, scopeHttp } from "../../../../test/p3-scope-world";
import { resolveTestDatabaseUrl } from "../../../../test/test-db-env";
import { CaseModule } from "../../case/case.module";
import { InterestEngineModule } from "../interest-engine.module";

/**
 * Oran deposu kimlik sınırı (MEŞE / P02 pilotu, 12.11.2026).
 * `rate_schedule.tenantId` yabancı anahtarı `Office.id`'ye bağlıdır (oran senkronu ve yükleme betiği büro kimliğiyle yazar);
 * bakiye yolu (`GET /interest-engine/case/:caseId/balance`) kimlik bağlamındaki `Tenant.id` ile okur. Kiracının tek bürosu
 * `Office.tenantId @unique` ile çözülür. Fikstürde büro kimliği kiracı kimliğinden FARKLIDIR (canlı veride 9/9 büro böyle);
 * kimlikleri eşitleyen köprü kurulmaz.
 * Gerçek HTTP (InterestEngineModule + ValidationPipe) + tek kullanımlık PostgreSQL; JWT yerine DB kimliği. Değerler sentetiktir.
 */
const TEST_DB_URL = resolveTestDatabaseUrl(process.env);
if (process.env.CI && !TEST_DB_URL) throw new Error("Rate provider office key spec requires TEST_DATABASE_URL in CI.");
const describeDb = TEST_DB_URL ? describe : describe.skip;

type Seg = { rate: number; rateId: string; claimBucketId: string };
type CurrencyResult = { currency: string; result: { segments: Seg[]; totalInterest: number } | null; skippedReason?: string };
type Balance = { currencyResults: CurrencyResult[]; diagnostics: { perCurrency: Array<{ code: string }>; fatal: Array<{ code: string }> } };

describeDb("Oran deposu kimlik sınırı — Office.id ≠ Tenant.id (gerçek HTTP + tek kullanımlık PostgreSQL)", () => {
  jest.setTimeout(300_000);
  const AS_OF = "2026-09-30";
  let db: PrismaClient;
  let app: INestApplication;
  const http = scopeHttp(() => app);
  const suffix = randomUUID().slice(0, 8);
  const t = { a: `test-rk-a-${suffix}`, b: `test-rk-b-${suffix}`, c: `test-rk-c-${suffix}` };
  const office = {} as Record<keyof typeof t, string>;
  const admin = {} as Record<keyof typeof t, string>;
  const rateIds = { a: [] as string[], b: [] as string[] };
  const kase = {} as Record<"a1" | "a2" | "b1" | "c1", string>;

  const mkRate = async (officeId: string, annualRate: number, validFrom: string, validTo: string | null) =>
    (
      await db.rateSchedule.create({
        data: {
          tenantId: officeId,
          interestType: "LEGAL_3095",
          validFrom: new Date(`${validFrom}T00:00:00.000Z`),
          validTo: validTo ? new Date(`${validTo}T00:00:00.000Z`) : null,
          annualRate,
          source: "MANUAL",
          sourceRef: "sentetik test orani",
          versionHash: `rk-${suffix}-${officeId.slice(-6)}-${validFrom}`,
        },
      })
    ).id;

  const mkCase = async (tenantId: string, key: string, interestStartDate: string) => {
    const created = await db.case.create({
      data: { tenantId, fileNumber: `RK-${key}-${suffix}`, type: "GENERAL_EXECUTION", currency: "TRY", caseDate: new Date("2026-09-01T00:00:00.000Z") } as never,
    });
    await db.claimItem.create({
      data: {
        tenantId,
        caseId: created.id,
        itemType: "PRINCIPAL",
        originalAmount: 36500,
        demandedAmount: 36500,
        amount: 36500,
        currency: "TRY",
        interestType: "YASAL",
        interestTypeCode: "LEGAL_3095",
        interestStartDate: new Date(`${interestStartDate}T00:00:00.000Z`),
        interestStartDateProvenance: "MANUAL_LAWYER_CONFIRMED",
        interestAccrualStatus: "ACCRUES",
      } as never,
    });
    return created.id;
  };

  const balance = async (actor: string, caseId: string): Promise<Balance> => {
    const res = await http.get(actor, `/interest-engine/case/${caseId}/balance?asOfDate=${AS_OF}`);
    expect(res.status).toBe(200);
    return res.body as Balance;
  };
  const tryResult = (b: Balance) => {
    const rows = b.currencyResults.filter((r) => r.currency === "TRY");
    expect(rows).toHaveLength(1);
    return rows[0];
  };

  beforeAll(async () => {
    db = new PrismaClient({ datasources: { db: { url: TEST_DB_URL } } });
    await db.$connect();
    app = await buildScopeApp(() => db, [CaseModule, InterestEngineModule]);
    for (const k of ["a", "b", "c"] as const) {
      await db.tenant.create({ data: { id: t[k], name: t[k], slug: t[k] } });
      office[k] = (await db.office.create({ data: { tenantId: t[k], name: `RK ofis ${k}` } })).id; // kimlik: varsayılan cuid
      admin[k] = (await db.user.create({ data: { tenantId: t[k], email: `rk-${k}-${suffix}@example.test`, name: "RK", surname: k, role: "ADMIN" } })).id;
    }
    // Büro A: iki dönem (kapsam 2024-06-01'de başlar). Büro B: her dönemi kapsayan tek açık oran (sızarsa A'nın eksik dönemi "kapsanır").
    rateIds.a.push(await mkRate(office.a, 0.24, "2024-06-01", "2026-07-30"));
    rateIds.a.push(await mkRate(office.a, 0.31, "2026-07-31", null));
    rateIds.b.push(await mkRate(office.b, 0.5, "2020-01-01", null));
    kase.a1 = await mkCase(t.a, "a1", "2026-06-01");
    kase.a2 = await mkCase(t.a, "a2", "2024-01-01"); // 2024-01-01 – 2024-05-31 büro A'da oransız
    kase.b1 = await mkCase(t.b, "b1", "2026-06-01");
    kase.c1 = await mkCase(t.c, "c1", "2026-06-01"); // büro C'nin oranı yok
  });

  afterAll(async () => {
    const tenantIds = Object.values(t);
    if (db) {
      await db.claimItem.deleteMany({ where: { tenantId: { in: tenantIds } } }).catch(() => undefined);
      await db.case.deleteMany({ where: { tenantId: { in: tenantIds } } }).catch(() => undefined);
      await db.rateSchedule.deleteMany({ where: { tenantId: { in: Object.values(office) } } }).catch(() => undefined);
      await db.auditLog.deleteMany({ where: { tenantId: { in: tenantIds } } }).catch(() => undefined);
      await db.user.deleteMany({ where: { tenantId: { in: tenantIds } } }).catch(() => undefined);
      await db.office.deleteMany({ where: { tenantId: { in: tenantIds } } }).catch(() => undefined);
      await db.tenant.deleteMany({ where: { id: { in: tenantIds } } }).catch(() => undefined);
    }
    await app?.close();
    await db?.$disconnect();
  });

  it("fikstür kimlikleri eşitlemez: her büronun kimliği kiracı kimliğinden farklı", () => {
    for (const k of ["a", "b", "c"] as const) expect(office[k]).not.toBe(t[k]);
  });

  it("Office.id ≠ Tenant.id iken kiracının kendi bürosunun oranları okunur (iki dönem, yalnız büro A satırları)", async () => {
    const r = tryResult(await balance(admin.a, kase.a1));
    expect(r.skippedReason).toBeUndefined();
    expect(r.result).not.toBeNull();
    const segs = r.result!.segments;
    expect(segs.length).toBeGreaterThan(0);
    expect(new Set(segs.map((s) => s.rateId))).toEqual(new Set(rateIds.a));
    expect([...new Set(segs.map((s) => s.rate))].sort()).toEqual([0.24, 0.31]);
    expect(r.result!.totalInterest).toBeGreaterThan(0);
  });

  it("başka kiracının oranı okunmaz: büro B yalnız kendi oranını kullanır", async () => {
    const r = tryResult(await balance(admin.b, kase.b1));
    expect(r.result).not.toBeNull();
    const segs = r.result!.segments;
    expect(segs.length).toBeGreaterThan(0);
    expect(new Set(segs.map((s) => s.rateId))).toEqual(new Set(rateIds.b));
    expect(segs.every((s) => s.rate === 0.5)).toBe(true);
  });

  it("oranı olmayan büro C: diğer büroların oranları okunmaz → RATE_COVERAGE_MISSING", async () => {
    const b = await balance(admin.c, kase.c1);
    const r = tryResult(b);
    expect(r.result).toBeNull();
    expect(r.skippedReason).toBe("INTEREST_UNRESOLVED");
    expect(b.diagnostics.perCurrency.map((d) => d.code)).toContain("RATE_COVERAGE_MISSING");
  });

  it("kapsamı eksik dönem RATE_COVERAGE_MISSING ile durur; başka büronun kapsayan oranı boşluğu doldurmaz", async () => {
    const b = await balance(admin.a, kase.a2);
    const r = tryResult(b);
    expect(r.result).toBeNull();
    expect(r.skippedReason).toBe("INTEREST_UNRESOLVED");
    expect(b.diagnostics.perCurrency.map((d) => d.code)).toContain("RATE_COVERAGE_MISSING");
    expect(b.diagnostics.fatal.map((d) => d.code)).toContain("INTEREST_UNRESOLVED");
  });
});
