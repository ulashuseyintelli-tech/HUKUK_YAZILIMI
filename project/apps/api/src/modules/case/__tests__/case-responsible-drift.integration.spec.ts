import { describeDb } from "../../../../test/describe-db";
import { Test, TestingModule } from "@nestjs/testing";
import { PrismaService } from "@/prisma/prisma.service";
import { CaseType, CaseStatus, CaseLawyerRole, LawyerRank, Prisma } from "@prisma/client";
import { runDriftRepair } from "../case-responsible-drift.core";

/**
 * ASSIGN-4b drift onarımı — APPLY yolu (integration / canlı DB).
 *
 * Saf karar (planCaseDriftFix) unit'te kanıtlandı; burada `runDriftRepair --apply`'in GERÇEK
 * Prisma yazımı + atomik tek-$transaction'ı sentetik drift ile empirik doğrulanır:
 *   MULTI (2 sorumlu) → #235 kısmi unique indeksi ile DB'de KURULAMAZ: 2. sorumlu P2002 ile
 *                       reddedilir, ilk kayıt korunur (planlama mantığı core.spec birim testinde)
 *   ZERO (0 sorumlu)  → öncelikli 1 promote
 *   OK   (1 sorumlu)  → DOKUNULMAZ
 *   DRY-RUN (ZERO)    → tespit eder ama DB'ye YAZMAZ (önce/sonra satırlar birebir)
 *
 * describeDb gate'i: DATABASE_URL yoksa SKIP → CI'da kırmızı yapmaz (bkz test/describe-db.ts).
 */
describeDb("runDriftRepair --apply — sorumlu-avukat drift onarımı (canlı DB)", () => {
  let module: TestingModule;
  let prisma: PrismaService;

  const tenantId = "test-tenant-resp-drift";

  beforeAll(async () => {
    module = await Test.createTestingModule({ providers: [PrismaService] }).compile();
    prisma = module.get<PrismaService>(PrismaService);
  });

  beforeEach(async () => {
    await cleanup();
  });

  afterAll(async () => {
    await cleanup();
    await module.close();
  });

  async function cleanup() {
    await prisma.caseLawyer.deleteMany({ where: { case: { tenantId } } });
    await prisma.case.deleteMany({ where: { tenantId } });
    await prisma.lawyer.deleteMany({ where: { tenantId } });
    await prisma.client.deleteMany({ where: { tenantId } });
    await prisma.tenant.deleteMany({ where: { id: tenantId } });
  }

  async function seedBase(suffix: number) {
    await prisma.tenant.upsert({
      where: { id: tenantId },
      update: {},
      create: { id: tenantId, name: "Drift Test Tenant", slug: `tt-drift-${suffix}` },
    });
    const client = await prisma.client.create({
      data: { tenantId, displayName: "Drift Müvekkil", type: "INDIVIDUAL" },
    });
    return client;
  }

  const mkLawyer = (rank: string, suffix: number, tag: string) =>
    prisma.lawyer.create({
      data: { tenantId, name: `Av-${tag}`, surname: `S-${suffix}`, lawyerRank: rank as LawyerRank },
    });

  const mkCase = (clientId: string, suffix: number, tag: string) =>
    prisma.case.create({
      data: {
        tenantId,
        fileNumber: `DRIFT-${tag}-${suffix}`,
        type: CaseType.GENERAL_EXECUTION,
        status: CaseStatus.ACTIVE,
        clientId,
      },
    });

  const mkCaseLawyer = (caseId: string, lawyerId: string, isResponsible: boolean) =>
    prisma.caseLawyer.create({
      data: {
        caseId,
        lawyerId,
        isResponsible,
        role: isResponsible ? CaseLawyerRole.RESPONSIBLE : CaseLawyerRole.ASSIGNED,
      },
    });

  const applyOpts = { apply: true, tenantId, allTenants: false, confirmProd: false };

  // MULTI (>1 sorumlu) drift'i #235 (`case_lawyer_one_responsible_per_case` kısmi unique indeksi)
  // sonrasında DB'de KURULAMAZ. Bu test eski MULTI kurulumunun DB tarafından reddedildiğini ve ilk
  // sorumlunun korunduğunu doğrular; MULTI planlama mantığı (öncelik → 1 koru, gerisi demote)
  // case-responsible-drift.core.spec.ts birim testinde doğrulanmaya devam eder.
  it("MULTI kurulumu (2. sorumlu) → unique kısıtla reddedilir, ilk sorumlu korunur, drift oluşmaz", async () => {
    const suffix = Date.now();
    const client = await seedBase(suffix);
    const partner = await mkLawyer("PARTNER", suffix, "partner");
    const lawyer = await mkLawyer("LAWYER", suffix, "lawyer");
    const c = await mkCase(client.id, suffix, "multi");
    const clPartner = await mkCaseLawyer(c.id, partner.id, true);

    const err = await mkCaseLawyer(c.id, lawyer.id, true).then(
      () => null,
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
    expect((err as Prisma.PrismaClientKnownRequestError).code).toBe("P2002");
    expect((err as Prisma.PrismaClientKnownRequestError).meta?.target).toEqual(["caseId"]);

    const rows = await prisma.caseLawyer.findMany({ where: { caseId: c.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(clPartner.id);
    expect(rows[0].isResponsible).toBe(true);
    expect(rows[0].role).toBe("RESPONSIBLE");

    const report = await runDriftRepair(prisma as never, { ...applyOpts, apply: false }, {});
    expect(report.driftCases).toBe(0);
    expect(report.multiResponsibleCases).toBe(0);
  });

  it("ZERO (0 sorumlu, avukat var) → öncelikli 1 promote, tam 1 sorumlu", async () => {
    const suffix = Date.now() + 1;
    const client = await seedBase(suffix);
    const lawyer = await mkLawyer("LAWYER", suffix, "lawyer");
    const authorized = await mkLawyer("AUTHORIZED", suffix, "auth");
    const c = await mkCase(client.id, suffix, "zero");
    await mkCaseLawyer(c.id, lawyer.id, false);
    const clAuth = await mkCaseLawyer(c.id, authorized.id, false);

    const report = await runDriftRepair(prisma as never, applyOpts, {});
    expect(report.driftCases).toBe(1);
    expect(report.zeroResponsibleCases).toBe(1);
    expect(report.appliedPromotes).toBe(1);
    expect(report.appliedDemotes).toBe(0);

    const rows = await prisma.caseLawyer.findMany({ where: { caseId: c.id } });
    expect(rows.filter((r) => r.isResponsible)).toHaveLength(1);
    const kept = rows.find((r) => r.isResponsible)!;
    expect(kept.id).toBe(clAuth.id); // AUTHORIZED > LAWYER
    expect(kept.role).toBe("RESPONSIBLE");
  });

  it("OK (tam 1 sorumlu) → DOKUNULMAZ (drift=0, yazma yok)", async () => {
    const suffix = Date.now() + 2;
    const client = await seedBase(suffix);
    const partner = await mkLawyer("PARTNER", suffix, "partner");
    const lawyer = await mkLawyer("LAWYER", suffix, "lawyer");
    const c = await mkCase(client.id, suffix, "ok");
    const clResp = await mkCaseLawyer(c.id, partner.id, true);
    await mkCaseLawyer(c.id, lawyer.id, false);

    const report = await runDriftRepair(prisma as never, applyOpts, {});
    expect(report.driftCases).toBe(0);
    expect(report.appliedPromotes).toBe(0);
    expect(report.appliedDemotes).toBe(0);

    const rows = await prisma.caseLawyer.findMany({ where: { caseId: c.id } });
    expect(rows.filter((r) => r.isResponsible)).toHaveLength(1);
    expect(rows.find((r) => r.isResponsible)!.id).toBe(clResp.id); // aynı sorumlu, değişmedi
  });

  it("DRY-RUN (ZERO drift) → drift tespit edilir ama DB'ye YAZILMAZ (önce/sonra birebir)", async () => {
    const suffix = Date.now() + 3;
    const client = await seedBase(suffix);
    const partner = await mkLawyer("PARTNER", suffix, "partner");
    const lawyer = await mkLawyer("LAWYER", suffix, "lawyer");
    const c = await mkCase(client.id, suffix, "dry");
    await mkCaseLawyer(c.id, partner.id, false);
    await mkCaseLawyer(c.id, lawyer.id, false);

    const snapshot = () =>
      prisma.caseLawyer.findMany({ where: { case: { tenantId } }, orderBy: { id: "asc" } });
    const before = await snapshot();

    const report = await runDriftRepair(prisma as never, { ...applyOpts, apply: false }, {});
    expect(report.mode).toBe("DRY-RUN");
    expect(report.driftCases).toBe(1);
    expect(report.zeroResponsibleCases).toBe(1);
    expect(report.appliedPromotes).toBe(0); // yazma yok
    expect(report.appliedDemotes).toBe(0);

    const after = await snapshot();
    expect(after).toEqual(before); // tenant'ın tüm CaseLawyer satırları (updatedAt dahil) DEĞİŞMEDİ
    expect(after.filter((r) => r.caseId === c.id && r.isResponsible)).toHaveLength(0);
  });
});
