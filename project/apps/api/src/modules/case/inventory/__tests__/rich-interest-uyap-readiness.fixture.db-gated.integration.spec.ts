import * as fs from 'node:fs';
import * as path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { resolveTestDatabaseUrl } from '../../../../../test/test-db-env';
import {
  classifyRichInterestUyapReadiness,
  runReadOnlyRichInterestUyapInventory,
  type RichInterestUyapFinding,
} from '../rich-interest-uyap-readiness.core';
import {
  CLASSIFIER_ONLY_FIXTURES,
  FIXTURE_TENANT_ID,
  PERSISTED_FIXTURES,
  RICH_INTEREST_FIXTURE_MANIFEST,
  SENTINEL_TENANT_ID,
} from './fixtures/rich-interest-uyap/manifest';
import {
  cleanupSentinelFixture,
  cleanupTargetFixture,
  countFixtureResidue,
  seedDiagnosticFixture,
  sentinelExists,
} from './fixtures/rich-interest-uyap/fixture-builder';
import { evidenceRow, serializeDetailedGolden, serializeSummaryGolden } from './fixtures/rich-interest-uyap/golden-serializer';

const TEST_DB_URL = resolveTestDatabaseUrl();
if (process.env.CI && !TEST_DB_URL) {
  throw new Error('PR-A4-2 DB gate blocked: CI requires an approved TEST_DATABASE_URL.');
}
const describeDb = TEST_DB_URL ? describe : describe.skip;
const ZERO = { tenants: 0, cases: 0, claimItems: 0, dues: 0 };
const goldenDir = path.resolve(__dirname, 'fixtures/rich-interest-uyap/golden');
const sorted = (values: readonly string[]) => [...new Set(values)].sort();

function classifierOnlyFinding(entry: (typeof CLASSIFIER_ONLY_FIXTURES)[number]): RichInterestUyapFinding {
  const claim = entry.claimItemInput;
  const due = entry.dueProjection;
  return classifyRichInterestUyapReadiness({
    tenantId: FIXTURE_TENANT_ID, caseTenantId: FIXTURE_TENANT_ID,
    caseId: `${entry.fixtureId}-case`, claimItemId: `${entry.fixtureId}-claim`,
    itemType: claim.itemType, status: claim.status, currency: claim.currency,
    richCode: claim.richInterestTypeCode, legacyType: claim.legacyInterestType,
    interestRate: entry.classifierOnlyRate!, accrualStatus: claim.interestAccrualStatus,
    interestStartDate: claim.interestStartDate, interestEndDate: null,
    interestStartDateProvenance: claim.interestStartDateProvenance,
    noInterestReasonPresent: Boolean(claim.noInterestAudit?.reason),
    noInterestActorPresent: Boolean(claim.noInterestAudit?.confirmedById),
    noInterestTimePresent: Boolean(claim.noInterestAudit?.confirmedAt),
    caseLegacyType: entry.caseInput.legacyInterestType, linkedDueId: `${entry.fixtureId}-due`,
    dueRichCode: due?.richInterestTypeCode ?? null, dueLegacyType: due?.legacyInterestType ?? null,
    dueInterestStartDate: due?.interestStartDate ?? null,
    depositTermEvidence: claim.depositTermProvenance, maturityPresent: false,
    termDurationPresent: false, rateScheduleSourcePresent: false, legacyUyapCodeProvenance: null,
  });
}

describeDb('PR-A4-2 disposable DB canonical diagnostic fixture', () => {
  let prisma: PrismaClient;

  beforeAll(() => {
    prisma = new PrismaClient({ datasources: { db: { url: TEST_DB_URL } } });
  });

  afterAll(async () => {
    if (prisma) await prisma.$disconnect();
  });

  it('safe DB, tenant isolation, page-size=7, exact manifest/golden ve zero-residue sözleşmesini doğrular', async () => {
    expect(new URL(TEST_DB_URL).pathname).toMatch(/(test|gate|spec|ci|jest)/i);
    expect(await countFixtureResidue(prisma)).toEqual(ZERO);
    let primaryError: unknown;
    let seeded = false;
    try {
      await seedDiagnosticFixture(prisma);
      seeded = true;
      expect(await sentinelExists(prisma)).toBe(true);

      const findings: RichInterestUyapFinding[] = [];
      const summary = await runReadOnlyRichInterestUyapInventory(prisma as never, {
        tenantId: FIXTURE_TENANT_ID, pageSize: 7,
        onFinding: (finding) => { findings.push(finding); },
      });
      expect(summary.processedRecordCount).toBe(PERSISTED_FIXTURES.length);
      expect(findings.map((finding) => finding.claimItemId))
        .toEqual(PERSISTED_FIXTURES.map((entry) => `${entry.fixtureId}-claim`));
      expect(findings.every((finding) => finding.tenantId === FIXTURE_TENANT_ID)).toBe(true);
      expect(findings.some((finding) => finding.tenantId === SENTINEL_TENANT_ID)).toBe(false);

      const findingByFixture = new Map(findings.map((finding) => [finding.claimItemId.replace(/-claim$/, ''), finding]));
      for (const entry of PERSISTED_FIXTURES) {
        const finding = findingByFixture.get(entry.fixtureId);
        expect(finding).toBeDefined();
        expect(sorted(finding!.integrityClasses)).toEqual(entry.expectedIntegrityClasses);
        expect(sorted(finding!.uyapReadinessClasses)).toEqual(entry.expectedUyapReadinessClasses);
        expect(sorted(finding!.diagnosticReasons)).toEqual(entry.expectedDiagnosticReasons);
      }

      const allFindings = new Map(findingByFixture);
      for (const entry of CLASSIFIER_ONLY_FIXTURES) allFindings.set(entry.fixtureId, classifierOnlyFinding(entry));
      const rows = RICH_INTEREST_FIXTURE_MANIFEST.map((entry) => evidenceRow(entry, allFindings.get(entry.fixtureId)));
      const actualSummary = serializeSummaryGolden(summary, rows);
      const actualDetailed = serializeDetailedGolden(rows);
      const expectedSummary = fs.readFileSync(path.join(goldenDir, 'rich-interest-summary.golden.json'), 'utf8');
      const expectedDetailed = fs.readFileSync(path.join(goldenDir, 'rich-interest-detailed.golden.ndjson'), 'utf8');
      expect(actualSummary).toBe(expectedSummary);
      expect(actualDetailed).toBe(expectedDetailed);
    } catch (error) {
      primaryError = error;
      throw error;
    } finally {
      let cleanupError: unknown;
      try {
        await cleanupTargetFixture(prisma);
        if (seeded) expect(await sentinelExists(prisma)).toBe(true);
        await cleanupSentinelFixture(prisma);
        expect(await countFixtureResidue(prisma)).toEqual(ZERO);
      } catch (error) {
        cleanupError = error;
      }
      if (cleanupError && !primaryError) throw cleanupError;
      if (cleanupError && primaryError) {
        const detail = (error: unknown) => error instanceof Error ? `${error.name}: ${error.message}` : String(error);
        throw new Error(`PR-A4-2 assertion failed (${detail(primaryError)}); cleanup failed (${detail(cleanupError)}).`);
      }
    }
  }, 60_000);
});

describe('PR-A4-2 unsafe DB fail-closed guard', () => {
  it.each([
    'postgresql://postgres:postgres@localhost:5432/hukuk_db',
    'postgresql://postgres:postgres@localhost:5432/production',
  ])('unsafe target %s reddedilir', (url) => {
    expect(() => resolveTestDatabaseUrl({ TEST_DATABASE_URL: url })).toThrow();
  });
});
