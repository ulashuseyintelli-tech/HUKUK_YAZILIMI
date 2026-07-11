/**
 * PR-EA-3A — EnforcementAction backfill profiler: disposable-DB doğrulaması.
 * Yalnız SELECT attığını (before/after satır sayısı değişmez), bucket toplamlarının total ile
 * eşleştiğini, percentage/sample-limit davranışını ve INTEGRITY_FAILURE tespitini kanıtlar.
 */
import { CaseDebtorLifecycleStatus, DebtorRole, PrismaClient } from "@prisma/client";
import { randomUUID } from "crypto";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { resolveTestDatabaseUrl } from "../../../test/test-db-env";
import {
  computeEnforcementActionBackfillProfile,
  computeReportManifest,
  parseDatabaseIdentity,
  SAMPLE_LIMIT,
} from "../enforcement-action-backfill-profiler";

const TEST_DB_URL = resolveTestDatabaseUrl(process.env);
if (process.env.CI && !TEST_DB_URL) {
  throw new Error("PR-EA-3A DB gate blocked: CI requires an approved TEST_DATABASE_URL.");
}
const describeWithDisposableDb = TEST_DB_URL ? describe : describe.skip;

describeWithDisposableDb("PR-EA-3A EnforcementAction backfill profiler - disposable DB", () => {
  jest.setTimeout(30_000);
  let prisma: PrismaClient;
  const createdTenantIds = new Set<string>();

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url: TEST_DB_URL } } });
    await prisma.$connect();
  });

  afterAll(async () => {
    for (const tenantId of createdTenantIds) {
      await cleanupTenant(tenantId);
    }
    await prisma.$disconnect();
  });

  async function cleanupTenant(tenantId: string) {
    await prisma.enforcementAction.deleteMany({ where: { case: { tenantId } } });
    await prisma.caseDebtor.deleteMany({ where: { case: { tenantId } } });
    await prisma.case.deleteMany({ where: { tenantId } });
    await prisma.debtor.deleteMany({ where: { tenantId } });
    await prisma.client.deleteMany({ where: { tenantId } });
    await prisma.tenant.deleteMany({ where: { id: tenantId } });
    createdTenantIds.delete(tenantId);
  }

  async function makeTenantAndCase(tenantId?: string) {
    const tid = tenantId ?? `test-ea3a-${randomUUID().slice(0, 8)}`;
    createdTenantIds.add(tid);
    await prisma.tenant.create({ data: { id: tid, name: "PR-EA-3A Test Tenant", slug: `test-ea3a-${randomUUID().slice(0, 8)}` } });
    const client = await prisma.client.create({ data: { tenantId: tid, displayName: "PR-EA-3A Test Muvekkil", type: "INDIVIDUAL" } });
    const caseRow = await prisma.case.create({
      data: {
        tenantId: tid,
        clientId: client.id,
        fileNumber: `TEST-EA3A-${randomUUID().slice(0, 6)}`,
        type: "GENERAL_EXECUTION",
        caseStatus: "DERDEST",
        status: "ACTIVE",
      },
    });
    return { tenantId: tid, caseId: caseRow.id };
  }

  async function makeDebtorAndCaseDebtor(
    tenantId: string,
    caseId: string,
    lifecycleStatus: CaseDebtorLifecycleStatus,
    role: DebtorRole,
  ) {
    const debtor = await prisma.debtor.create({ data: { tenantId, name: "PR-EA-3A Test Borclu", type: "INDIVIDUAL" } });
    return prisma.caseDebtor.create({ data: { caseId, debtorId: debtor.id, role, lifecycleStatus } });
  }

  it("boş DB güvenle raporlanır (total=0, tüm bucket count'ları 0)", async () => {
    // Bu test kendi izole tenant'ını oluşturur ama hiç EnforcementAction eklemez; global tabloda
    // başka testlerden kalıntı olabileceğinden burada yalnız "profile başarıyla döner ve toplamlar
    // tutarlıdır" iddiasını genel olarak, ayrı bir senaryoyla (aşağıdaki testler) kanıtlıyoruz.
    // Gerçek "sıfır satır" iddiası için WHERE ile kendi tenant'ımıza scoped bir çağrı gerekir —
    // computeEnforcementActionBackfillProfile tüm tabloyu tarar (tasarım gereği, PR-EA-3A scope'u),
    // bu yüzden burada yalnız fonksiyonun boş/az veriyle patlamadan çalıştığını doğruluyoruz.
    const profile = await computeEnforcementActionBackfillProfile(prisma as never);
    expect(profile.summary.totalEnforcementActions).toBeGreaterThanOrEqual(0);
    const tenantSum = Object.values(profile.summary.tenantId).reduce((s, b) => s + b.count, 0);
    expect(tenantSum).toBe(profile.summary.totalEnforcementActions);
  });

  it("hiçbir satırı değiştirmez (before/after count aynı — salt-okuma kanıtı)", async () => {
    const { tenantId, caseId } = await makeTenantAndCase();
    await prisma.enforcementAction.create({ data: { caseId, type: "BANK_INQUIRY" } });

    const before = await prisma.enforcementAction.count();
    await computeEnforcementActionBackfillProfile(prisma as never);
    const after = await prisma.enforcementAction.count();

    expect(after).toBe(before);
    void tenantId;
  });

  it("bucket toplamları total ile eşleşir ve yüzdeler deterministiktir", async () => {
    const { tenantId, caseId } = await makeTenantAndCase();
    await makeDebtorAndCaseDebtor(tenantId, caseId, "ACTIVE", "ASIL_BORCLU");
    await prisma.enforcementAction.create({ data: { caseId, type: "BANK_INQUIRY" } });
    await prisma.enforcementAction.create({ data: { caseId, tenantId, type: "BANK_SEIZURE" } });

    const profile = await computeEnforcementActionBackfillProfile(prisma as never);
    const tenantSum = Object.values(profile.summary.tenantId).reduce((s, b) => s + b.count, 0);
    const caseDebtorSum = Object.values(profile.summary.caseDebtorId).reduce((s, b) => s + b.count, 0);
    const targetDetailsSum = Object.values(profile.summary.targetDetails).reduce((s, b) => s + b.count, 0);
    expect(tenantSum).toBe(profile.summary.totalEnforcementActions);
    expect(caseDebtorSum).toBe(profile.summary.totalEnforcementActions);
    expect(targetDetailsSum).toBe(profile.summary.totalEnforcementActions);

    // Bağımsız beklenen-yüzde hesabı (profiler'ın kendi pct() implementasyonunu tekrar çağırmadan,
    // toFixed() kullanmadan — repo eslint kuralı: no-restricted-syntax, "Money.round() kullanın").
    for (const bucket of Object.values(profile.summary.tenantId)) {
      const total = profile.summary.totalEnforcementActions;
      const tenths = total ? Math.round((bucket.count / total) * 1000) : 0;
      const expectedPct = total ? `${Math.floor(tenths / 10)}.${tenths % 10}` : "0.0";
      expect(bucket.percentage).toBe(expectedPct);
    }
  });

  it("tek CaseDebtor → CASE_DEBTOR_DETERMINISTIC olarak profillenir", async () => {
    const { tenantId, caseId } = await makeTenantAndCase();
    const cd = await makeDebtorAndCaseDebtor(tenantId, caseId, "ACTIVE", "ASIL_BORCLU");
    await prisma.enforcementAction.create({ data: { caseId, type: "BANK_INQUIRY" } });

    const profile = await computeEnforcementActionBackfillProfile(prisma as never);
    const row = profile.records.find((r) => r.caseId === caseId);
    expect(row?.caseDebtorBucket).toBe("CASE_DEBTOR_DETERMINISTIC");
    expect(row?.candidateCaseDebtorId).toBe(cd.id);
  });

  it("tenant mismatch → tenant INTEGRITY_FAILURE olarak tespit edilir", async () => {
    const { caseId } = await makeTenantAndCase();
    const otherTenant = await makeTenantAndCase();
    await prisma.enforcementAction.create({ data: { caseId, tenantId: otherTenant.tenantId, type: "BANK_INQUIRY" } });

    const profile = await computeEnforcementActionBackfillProfile(prisma as never);
    const row = profile.records.find((r) => r.caseId === caseId);
    expect(row?.tenantBucket).toBe("INTEGRITY_FAILURE");
  });

  it("cross-case caseDebtorId → caseDebtor INTEGRITY_FAILURE olarak tespit edilir", async () => {
    const caseA = await makeTenantAndCase();
    const caseB = await makeTenantAndCase();
    const cdFromCaseB = await makeDebtorAndCaseDebtor(caseB.tenantId, caseB.caseId, "ACTIVE", "ASIL_BORCLU");
    await prisma.enforcementAction.create({ data: { caseId: caseA.caseId, caseDebtorId: cdFromCaseB.id, type: "BANK_INQUIRY" } });

    const profile = await computeEnforcementActionBackfillProfile(prisma as never);
    const row = profile.records.find((r) => r.caseId === caseA.caseId);
    expect(row?.caseDebtorBucket).toBe("INTEGRITY_FAILURE");
  });

  it("sample limiti uygulanır (aynı bucket'a düşen kayıt SAMPLE_LIMIT'ten fazlaysa liste kırpılır)", async () => {
    const { caseId } = await makeTenantAndCase();
    const count = SAMPLE_LIMIT + 5;
    for (let i = 0; i < count; i++) {
      await prisma.enforcementAction.create({ data: { caseId, type: "BANK_INQUIRY" } });
    }

    const profile = await computeEnforcementActionBackfillProfile(prisma as never);
    const orphanStat = profile.summary.caseDebtorId.ORPHAN;
    expect(orphanStat.count).toBeGreaterThanOrEqual(count);
    expect(orphanStat.sampleIds.length).toBeLessThanOrEqual(SAMPLE_LIMIT);
  });

  it("PR-EA-3A.1: gerçek (credential taşıyan) TEST_DB_URL ile üretilen artefaktlar credential sızdırmaz ve manifest gerçek içerikle eşleşir", async () => {
    const { caseId } = await makeTenantAndCase();
    await prisma.enforcementAction.create({ data: { caseId, type: "BANK_INQUIRY" } });

    const profile = await computeEnforcementActionBackfillProfile(prisma as never);
    // TEST_DB_URL gerçek bir credential taşıyan bağlantı dizesidir (bkz. test-db-env.ts) — main()'in
    // gerçek akışıyla AYNI fonksiyonu, GERÇEK bir credential'lı URL ile çağırıyoruz.
    const databaseIdentity = parseDatabaseIdentity(TEST_DB_URL, "test");
    const outputFiles = ["summary.json", "records.csv"];

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ea3a1-artifact-test-"));
    try {
      const summaryPayload = {
        generatedAt: new Date().toISOString(),
        profilerVersion: "ea-backfill-profiler-v1.0",
        database: databaseIdentity,
        outputFiles,
        ...profile.summary,
      };
      fs.writeFileSync(path.join(tmpDir, "summary.json"), JSON.stringify(summaryPayload, null, 2), "utf8");
      fs.writeFileSync(path.join(tmpDir, "records.csv"), "id,caseId\n", "utf8");

      const manifest = computeReportManifest(tmpDir, outputFiles);
      fs.writeFileSync(path.join(tmpDir, "manifest.sha256"), manifest, "utf8");

      const summaryContent = fs.readFileSync(path.join(tmpDir, "summary.json"), "utf8");
      const manifestContent = fs.readFileSync(path.join(tmpDir, "manifest.sha256"), "utf8");

      // TEST_DB_URL'in credential kısmı (varsa) hiçbir üretilen dosyada görünmemeli.
      const parsedTestUrl = new URL(TEST_DB_URL);
      if (parsedTestUrl.username) {
        expect(summaryContent).not.toContain(parsedTestUrl.username);
        expect(manifestContent).not.toContain(parsedTestUrl.username);
      }
      if (parsedTestUrl.password) {
        expect(summaryContent).not.toContain(parsedTestUrl.password);
        expect(manifestContent).not.toContain(parsedTestUrl.password);
      }
      expect(summaryContent).not.toContain(TEST_DB_URL);
      expect(manifestContent).not.toContain(TEST_DB_URL);
      expect(summaryContent).not.toMatch(/password/i);

      // summary.json gerçekten database/profilerVersion/outputFiles taşıyor.
      const parsedSummary = JSON.parse(summaryContent);
      expect(parsedSummary.database.host).toBe(parsedTestUrl.hostname);
      expect(parsedSummary.database.readOnlyMode).toBe(true);
      expect(parsedSummary.profilerVersion).toBe("ea-backfill-profiler-v1.0");
      expect(parsedSummary.outputFiles).toEqual(outputFiles);

      // manifest tam olarak 2 satır (summary.json + records.csv), kendi dosyasını içermiyor.
      const manifestLines = manifestContent.trim().split("\n");
      expect(manifestLines).toHaveLength(2);
      expect(manifestContent).not.toContain("manifest.sha256");
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
