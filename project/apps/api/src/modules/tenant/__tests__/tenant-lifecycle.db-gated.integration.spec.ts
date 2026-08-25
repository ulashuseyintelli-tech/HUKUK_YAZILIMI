import { describeDb } from "../../../../test/describe-db";
import { PrismaService } from "@/prisma/prisma.service";
import { TENANT_LIFECYCLE_STATES } from "../tenant-lifecycle";

/**
 * C15-S1-MODIFIED · PR-1 — lifecycle şema temeli (GERÇEK Postgres 16).
 *
 * GATE: describeDb → DATABASE_URL yoksa SKIP.
 *
 * KAPSAM: yalnız ADDITIVE şema sözleşmesi ve geriye dönük uyumluluk.
 * Auth/worker/quiesce yaptırımı bu PR'da YOK; bu suite hiçbir çağrı yerini test etmez.
 * Kendi yarattığı tenant'ları temizler; başka tenant'lara DOKUNMAZ.
 */
describeDb("C15-S1-MODIFIED PR-1 — Tenant lifecycle şema temeli (integration)", () => {
  let prisma: PrismaService;
  const createdTenantIds: string[] = [];

  const yeniSlug = (ek: string): string =>
    `c15-pr1-${ek}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
  });

  afterAll(async () => {
    if (createdTenantIds.length > 0) {
      await prisma.tenant.deleteMany({ where: { id: { in: createdTenantIds } } });
    }
    await prisma.$disconnect();
  });

  it("DB enum değerleri TypeScript sabitiyle BİREBİR aynıdır", async () => {
    const rows = await prisma.$queryRawUnsafe<Array<{ enumlabel: string }>>(
      `SELECT e.enumlabel FROM pg_enum e
         JOIN pg_type t ON t.oid = e.enumtypid
        WHERE t.typname = 'TenantLifecycle'
        ORDER BY e.enumsortorder`,
    );
    expect(rows.map((r) => r.enumlabel)).toEqual([...TENANT_LIFECYCLE_STATES]);
  });

  it("lifecycle kolonu NOT NULL ve varsayılanı ACTIVE'dir", async () => {
    const rows = await prisma.$queryRawUnsafe<
      Array<{ is_nullable: string; column_default: string | null }>
    >(
      `SELECT is_nullable, column_default FROM information_schema.columns
        WHERE table_name = 'Tenant' AND column_name = 'lifecycle'`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].is_nullable).toBe("NO");
    expect(rows[0].column_default).toContain("ACTIVE");
  });

  it("lifecycle üzerinde index vardır (PR-2 worker yüklemi için)", async () => {
    const rows = await prisma.$queryRawUnsafe<Array<{ indexname: string }>>(
      `SELECT indexname FROM pg_indexes
        WHERE tablename = 'Tenant' AND indexname = 'Tenant_lifecycle_idx'`,
    );
    expect(rows).toHaveLength(1);
  });

  it("GERİYE DÖNÜK UYUMLULUK: lifecycle yazılmadan yaratılan tenant ACTIVE doğar", async () => {
    const t = await prisma.tenant.create({
      data: { name: "C15 PR1 Legacy", slug: yeniSlug("legacy") },
    });
    createdTenantIds.push(t.id);

    expect(t.lifecycle).toBe("ACTIVE");
    expect(t.lifecycleTarget).toBeNull();
    expect(t.lifecycleChangedAt).toBeNull();
    expect(t.lifecycleReason).toBeNull();
    expect(t.quiesceToken).toBeNull();
  });

  it("veritabanında lifecycle'ı NULL olan tenant BULUNMAZ", async () => {
    const rows = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
      `SELECT count(*)::bigint AS count FROM "Tenant" WHERE lifecycle IS NULL`,
    );
    expect(Number(rows[0].count)).toBe(0);
  });

  it("TENANT İZOLASYONU: bir tenant'ın lifecycle'ı diğerini etkilemez", async () => {
    const a = await prisma.tenant.create({
      data: { name: "C15 PR1 A", slug: yeniSlug("izolasyon-a") },
    });
    const b = await prisma.tenant.create({
      data: { name: "C15 PR1 B", slug: yeniSlug("izolasyon-b") },
    });
    createdTenantIds.push(a.id, b.id);

    await prisma.tenant.update({
      where: { id: a.id },
      data: {
        lifecycle: "QUIESCING",
        lifecycleTarget: "RETIRED",
        lifecycleChangedAt: new Date(),
        lifecycleReason: "pr1-izolasyon-testi",
      },
    });

    const [sonA, sonB] = await Promise.all([
      prisma.tenant.findUniqueOrThrow({ where: { id: a.id } }),
      prisma.tenant.findUniqueOrThrow({ where: { id: b.id } }),
    ]);

    expect(sonA.lifecycle).toBe("QUIESCING");
    expect(sonA.lifecycleTarget).toBe("RETIRED");
    expect(sonB.lifecycle).toBe("ACTIVE");
    expect(sonB.lifecycleTarget).toBeNull();
  });

  it("beş lifecycle değerinin tamamı yazılabilir ve geri okunabilir", async () => {
    for (const state of TENANT_LIFECYCLE_STATES) {
      const t = await prisma.tenant.create({
        data: {
          name: `C15 PR1 ${state}`,
          slug: yeniSlug(`durum-${state.toLowerCase()}`),
          lifecycle: state,
        },
      });
      createdTenantIds.push(t.id);
      expect(t.lifecycle).toBe(state);
    }
  });

  it("lifecycle ile filtreleme çalışır (PR-2 worker yükleminin DB tarafı)", async () => {
    const slug = yeniSlug("filtre");
    const t = await prisma.tenant.create({
      data: { name: "C15 PR1 Filtre", slug, lifecycle: "SUSPENDED" },
    });
    createdTenantIds.push(t.id);

    const aktifEslesme = await prisma.tenant.findMany({
      where: { slug, lifecycle: "ACTIVE" },
      select: { id: true },
    });
    const askidaEslesme = await prisma.tenant.findMany({
      where: { slug, lifecycle: "SUSPENDED" },
      select: { id: true },
    });

    expect(aktifEslesme).toHaveLength(0);
    expect(askidaEslesme).toHaveLength(1);
    expect(askidaEslesme[0].id).toBe(t.id);
  });
});
