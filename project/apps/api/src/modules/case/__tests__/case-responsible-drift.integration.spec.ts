import { describeDb } from "../../../../test/describe-db";
import { Test, TestingModule } from "@nestjs/testing";
import { PrismaService } from "@/prisma/prisma.service";
import { CaseType, CaseStatus, CaseLawyerRole, LawyerRank } from "@prisma/client";
import { runDriftRepair, DRIFT_AUDIT_SOURCE } from "../case-responsible-drift.core";

/**
 * ASSIGN-4b drift onarımı — APPLY yolu (integration / canlı DB).
 *
 * Saf karar (planCaseDriftFix) unit'te kanıtlandı; burada `runDriftRepair --apply`'in GERÇEK
 * Prisma yazımı + atomik tek-$transaction'ı sentetik drift ile empirik doğrulanır:
 *   MULTI (2 sorumlu) → 1 koru (öncelik) + gerisi isResponsible=false & role=ASSIGNED
 *   ZERO (0 sorumlu)  → öncelikli 1 promote
 *   OK   (1 sorumlu)  → DOKUNULMAZ
 *   DRY-RUN           → tespit eder ama DB'ye YAZMAZ
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
    await prisma.auditLog.deleteMany({ where: { tenantId } });
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

  it("MULTI (2 sorumlu) → öncelikli 1 kalır, diğeri isResponsible=false + role=ASSIGNED, tam 1 sorumlu", async () => {
    const suffix = Date.now();
    const client = await seedBase(suffix);
    const partner = await mkLawyer("PARTNER", suffix, "partner");
    const lawyer = await mkLawyer("LAWYER", suffix, "lawyer");
    const c = await mkCase(client.id, suffix, "multi");
    const clPartner = await mkCaseLawyer(c.id, partner.id, true);
    const clLawyer = await mkCaseLawyer(c.id, lawyer.id, true);

    const report = await runDriftRepair(prisma as never, applyOpts, {});
    expect(report.driftCases).toBe(1);
    expect(report.multiResponsibleCases).toBe(1);
    expect(report.appliedDemotes).toBe(1);

    const rows = await prisma.caseLawyer.findMany({ where: { caseId: c.id } });
    expect(rows.filter((r) => r.isResponsible)).toHaveLength(1);
    const kept = rows.find((r) => r.isResponsible)!;
    expect(kept.id).toBe(clPartner.id); // PARTNER > LAWYER → korunur
    expect(kept.role).toBe("RESPONSIBLE");
    const demoted = rows.find((r) => r.id === clLawyer.id)!;
    expect(demoted.isResponsible).toBe(false);
    expect(demoted.role).toBe("ASSIGNED");

    // D2: MULTI'de yalnız demote audit'lenir (keepId zaten sorumluydu → keep-audit yok)
    const audits = await prisma.auditLog.findMany({ where: { tenantId, entityType: "CASE_LAWYER" } });
    expect(audits).toHaveLength(1);
    expect(audits[0].entityId).toBe(clLawyer.id);
    expect((audits[0].newValues as any).reason).toBe("DRIFT_REPAIR_DEMOTE");
    expect((audits[0].metadata as any).source).toBe(DRIFT_AUDIT_SOURCE);
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

    // D2: ZERO'da keepId false→true yükseltildi → tek PROMOTE audit
    const audits = await prisma.auditLog.findMany({ where: { tenantId, entityType: "CASE_LAWYER" } });
    expect(audits).toHaveLength(1);
    expect(audits[0].entityId).toBe(clAuth.id);
    expect((audits[0].newValues as any).reason).toBe("DRIFT_REPAIR_PROMOTE");
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

    // D2: değişiklik yok → audit yok
    expect(await prisma.auditLog.count({ where: { tenantId } })).toBe(0);
  });

  it("DRY-RUN → drift tespit edilir ama DB'ye YAZILMAZ", async () => {
    const suffix = Date.now() + 3;
    const client = await seedBase(suffix);
    const partner = await mkLawyer("PARTNER", suffix, "partner");
    const lawyer = await mkLawyer("LAWYER", suffix, "lawyer");
    const c = await mkCase(client.id, suffix, "dry");
    await mkCaseLawyer(c.id, partner.id, true);
    await mkCaseLawyer(c.id, lawyer.id, true);

    const report = await runDriftRepair(prisma as never, { ...applyOpts, apply: false }, {});
    expect(report.mode).toBe("DRY-RUN");
    expect(report.driftCases).toBe(1);
    expect(report.appliedDemotes).toBe(0); // yazma yok

    const rows = await prisma.caseLawyer.findMany({ where: { caseId: c.id } });
    expect(rows.filter((r) => r.isResponsible)).toHaveLength(2); // DEĞİŞMEDİ

    // D2: dry-run → yazma yok → audit yok
    expect(await prisma.auditLog.count({ where: { tenantId } })).toBe(0);
  });
});
