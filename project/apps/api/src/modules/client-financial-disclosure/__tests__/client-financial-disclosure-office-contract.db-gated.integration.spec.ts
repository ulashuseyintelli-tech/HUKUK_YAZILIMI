import { PrismaClient } from '@prisma/client';
import { describeDb } from '../../../../test/describe-db';
import {
  CLIENT_FINANCIAL_DISCLOSURE_PUBLICATION_FLAG,
  CLIENT_FINANCIAL_DISCLOSURE_WRITE_FLAG,
} from '../client-financial-disclosure-activation';
import {
  OfficeDisclosureProjectionNotFoundError,
  assertOfficeDisclosureProjectionSafe,
} from '../client-financial-disclosure-office-contract';
import { ClientFinancialDisclosureOfficeService } from '../client-financial-disclosure-office-service';

/**
 * PRE01 gerçek-PostgreSQL suite'i. `TEST_DATABASE_URL` yoksa `describeDb` SKIP eder;
 * production/local development DB üzerinde hiçbir zaman kendiliğinden çalışmaz.
 */
describeDb('CODEX-X1 PRE01 — office contract (disposable PostgreSQL)', () => {
  const prisma = new PrismaClient();
  const service = new ClientFinancialDisclosureOfficeService(prisma);
  const sql = (statement: string) => prisma.$executeRawUnsafe(statement);
  const suffix = Math.random().toString(36).slice(2, 10);

  const tenantA = `pre01-ta-${suffix}`;
  const tenantB = `pre01-tb-${suffix}`;
  const partner = `pre01-partner-${suffix}`;
  const staff = `pre01-staff-${suffix}`;
  const foreignPartner = `pre01-foreign-${suffix}`;
  const clientA = `pre01-client-a-${suffix}`;
  const clientOther = `pre01-client-other-${suffix}`;
  const caseA = `pre01-case-a-${suffix}`;
  const caseOther = `pre01-case-other-${suffix}`;
  const caseClientA = `pre01-cc-a-${suffix}`;
  const caseClientOther = `pre01-cc-other-${suffix}`;
  const rootA = `pre01-root-a-${suffix}`;
  const versionA = `pre01-version-a-${suffix}`;
  const rootOther = `pre01-root-other-${suffix}`;
  const versionOther = `pre01-version-other-${suffix}`;

  const originalWrite = process.env[CLIENT_FINANCIAL_DISCLOSURE_WRITE_FLAG];
  const originalPublication = process.env[CLIENT_FINANCIAL_DISCLOSURE_PUBLICATION_FLAG];

  const seedDisclosure = async (input: {
    key: string;
    tenantId: string;
    clientId: string;
    caseId: string;
    caseClientId: string;
    rootId: string;
    versionId: string;
  }) => {
    const collectionId = `pre01-col-${input.key}-${suffix}`;
    const dispositionId = `pre01-disp-${input.key}-${suffix}`;
    const dispositionLineId = `pre01-dl-${input.key}-${suffix}`;
    await sql(`INSERT INTO "Collection"("id","tenantId","caseId","amount","currency","type","date","status","idempotencyKey","updatedAt")
      VALUES ('${collectionId}','${input.tenantId}','${input.caseId}',2500.75,'TRY','TAHSILAT'::"CollectionType",
        '2026-08-01T09:00:00Z','CONFIRMED'::"CollectionStatus",'pre01-idem-${input.key}-${suffix}',now())`);
    await sql(`INSERT INTO "CollectionDisposition"("id","tenantId","caseId","collectionId","beneficiaryScope","caseClientId","status","totalAmount","currency","postedAt","createdAt","updatedAt")
      VALUES ('${dispositionId}','${input.tenantId}','${input.caseId}','${collectionId}',
        'SINGLE_CASE_CLIENT'::"CollectionDispositionBeneficiaryScope",'${input.caseClientId}',
        'POSTED'::"CollectionDispositionStatus",2500.75,'TRY','2026-08-02T10:00:00Z',now(),now())`);
    await sql(`INSERT INTO "CollectionDispositionLine"("id","dispositionId","type","amount","createdAt")
      VALUES ('${dispositionLineId}','${dispositionId}','CLIENT_PAYABLE'::"CollectionDispositionLineType",2500.75,now())`);
    await sql(`INSERT INTO "ClientFinancialDisclosure"("id","tenantId","caseId","caseClientId","collectionDispositionId","currency","createdAt","updatedAt")
      VALUES ('${input.rootId}','${input.tenantId}','${input.caseId}','${input.caseClientId}',
        '${dispositionId}','TRY',now(),now())`);
    await sql(`INSERT INTO "ClientFinancialDisclosureVersion"
      ("id","tenantId","disclosureId","version","status","sourceCollectionId","sourceCollectionAmount",
       "sourceCollectionDate","dispositionTotalAmount","dispositionPostedAt","currency","totalCollected",
       "clientNetAmount","snapshotHash","sourceFingerprint","sendIdempotencyKey","sendRequestedAt",
       "sendFailureCode","sendFailureDetail","createdAt","updatedAt")
      VALUES ('${input.versionId}','${input.tenantId}','${input.rootId}',1,'SEND_FAILED'::"ClientFinancialDisclosureStatus",
       '${collectionId}',2500.75,'2026-08-01T09:00:00Z',2500.75,'2026-08-02T10:00:00Z','TRY',2500.75,2500.75,
       '${'a'.repeat(64)}','${'b'.repeat(64)}','pre01-send-${input.key}-${suffix}','2026-08-03T10:00:00Z',
       'SMTP_SECRET_CODE','raw provider stack secret',now(),now())`);
    await sql(`INSERT INTO "ClientFinancialDisclosureLine"("id","tenantId","disclosureVersionId","type","amount","sourceDispositionLineId","sortOrder","createdAt")
      VALUES ('pre01-line-${input.key}-${suffix}','${input.tenantId}','${input.versionId}',
       'CLIENT_PAYABLE'::"CollectionDispositionLineType",2500.75,'${dispositionLineId}',0,now())`);
    await sql(`UPDATE "ClientFinancialDisclosure" SET "currentVersionId" = '${input.versionId}' WHERE "id" = '${input.rootId}'`);
    return { dispositionId };
  };

  beforeAll(async () => {
    process.env[CLIENT_FINANCIAL_DISCLOSURE_WRITE_FLAG] = 'true';
    process.env[CLIENT_FINANCIAL_DISCLOSURE_PUBLICATION_FLAG] = 'true';
    await sql(`INSERT INTO "Tenant"("id","name","slug","createdAt","updatedAt") VALUES
      ('${tenantA}','PRE01 A','pre01-ta-${suffix}',now(),now()),
      ('${tenantB}','PRE01 B','pre01-tb-${suffix}',now(),now())`);
    await sql(`INSERT INTO "Client"("id","tenantId","type","displayName","updatedAt") VALUES
      ('${clientA}','${tenantA}','PERSON'::"ClientType",'PRE01 Client A',now()),
      ('${clientOther}','${tenantA}','PERSON'::"ClientType",'PRE01 Other Client',now())`);
    await sql(`INSERT INTO "Case"("id","tenantId","fileNumber","executionFileNumber","type","updatedAt") VALUES
      ('${caseA}','${tenantA}','PRE01-A-${suffix}','2026/101','GENERAL_EXECUTION'::"CaseType",now()),
      ('${caseOther}','${tenantA}','PRE01-O-${suffix}','2026/202','GENERAL_EXECUTION'::"CaseType",now())`);
    await sql(`INSERT INTO "CaseClient"("id","caseId","clientId","updatedAt") VALUES
      ('${caseClientA}','${caseA}','${clientA}',now()),
      ('${caseClientOther}','${caseOther}','${clientOther}',now())`);
    await sql(`INSERT INTO "User"("id","tenantId","email","name","surname","isActive","updatedAt") VALUES
      ('${partner}','${tenantA}','partner-${suffix}@example.test','PRE01','Partner',true,now()),
      ('${staff}','${tenantA}','staff-${suffix}@example.test','PRE01','Staff',true,now()),
      ('${foreignPartner}','${tenantB}','foreign-${suffix}@example.test','PRE01','Foreign',true,now())`);
    await sql(`INSERT INTO "Lawyer"("id","tenantId","userId","name","surname","lawyerRank","canApproveOfficeActions","updatedAt") VALUES
      ('pre01-lw-a-${suffix}','${tenantA}','${partner}','PRE01','Partner','PARTNER'::"LawyerRank",false,now()),
      ('pre01-lw-b-${suffix}','${tenantB}','${foreignPartner}','PRE01','Foreign','PARTNER'::"LawyerRank",false,now())`);
    await seedDisclosure({
      key: 'a',
      tenantId: tenantA,
      clientId: clientA,
      caseId: caseA,
      caseClientId: caseClientA,
      rootId: rootA,
      versionId: versionA,
    });
    await seedDisclosure({
      key: 'other',
      tenantId: tenantA,
      clientId: clientOther,
      caseId: caseOther,
      caseClientId: caseClientOther,
      rootId: rootOther,
      versionId: versionOther,
    });
    await sql(`INSERT INTO "AuditLog"("id","tenantId","action","entityType","entityId","metadata","createdAt")
      VALUES ('pre01-audit-${suffix}','${tenantA}','CLIENT_FINANCIAL_DISCLOSURE_SEND_FAILED',
       'ClientFinancialDisclosureVersion','${versionA}',
       '{"providerMessageId":"SECRET-ID","sendFailureDetail":"raw provider stack secret"}'::jsonb,
       '2026-08-03T10:01:00Z')`);
  });

  afterAll(async () => {
    await sql(`DELETE FROM "AuditLog" WHERE "tenantId" IN ('${tenantA}','${tenantB}')`);
    await sql(`DELETE FROM "ClientFinancialDisclosureLine" WHERE "tenantId" IN ('${tenantA}','${tenantB}')`);
    await sql(`UPDATE "ClientFinancialDisclosure" SET "currentVersionId" = NULL WHERE "tenantId" IN ('${tenantA}','${tenantB}')`);
    await sql(`DELETE FROM "ClientFinancialDisclosureVersion" WHERE "tenantId" IN ('${tenantA}','${tenantB}')`);
    await sql(`DELETE FROM "ClientFinancialDisclosure" WHERE "tenantId" IN ('${tenantA}','${tenantB}')`);
    await sql(`DELETE FROM "CollectionDispositionLine" WHERE "id" LIKE 'pre01-dl-%-${suffix}'`);
    await sql(`DELETE FROM "CollectionDisposition" WHERE "tenantId" IN ('${tenantA}','${tenantB}')`);
    await sql(`DELETE FROM "Collection" WHERE "tenantId" IN ('${tenantA}','${tenantB}')`);
    await sql(`DELETE FROM "Lawyer" WHERE "tenantId" IN ('${tenantA}','${tenantB}')`);
    await sql(`DELETE FROM "User" WHERE "tenantId" IN ('${tenantA}','${tenantB}')`);
    await sql(`DELETE FROM "CaseClient" WHERE "id" IN ('${caseClientA}','${caseClientOther}')`);
    await sql(`DELETE FROM "Case" WHERE "tenantId" IN ('${tenantA}','${tenantB}')`);
    await sql(`DELETE FROM "Client" WHERE "tenantId" IN ('${tenantA}','${tenantB}')`);
    await sql(`DELETE FROM "Tenant" WHERE "id" IN ('${tenantA}','${tenantB}')`);
    await prisma.$disconnect();
    if (originalWrite === undefined) delete process.env[CLIENT_FINANCIAL_DISCLOSURE_WRITE_FLAG];
    else process.env[CLIENT_FINANCIAL_DISCLOSURE_WRITE_FLAG] = originalWrite;
    if (originalPublication === undefined) {
      delete process.env[CLIENT_FINANCIAL_DISCLOSURE_PUBLICATION_FLAG];
    } else {
      process.env[CLIENT_FINANCIAL_DISCLOSURE_PUBLICATION_FLAG] = originalPublication;
    }
  });

  it('tenant+client+case+version object scope gerçek ilişkiler üzerinden doğrulanır', async () => {
    const item = await service.getDetail(
      { tenantId: tenantA, actorUserId: partner, clientId: clientA, caseId: caseA },
      versionA,
    );
    expect(item.versionId).toBe(versionA);
    expect(item.status).toBe('SEND_FAILED');
    expect(item.officeFileNumber).toBe(`PRE01-A-${suffix}`);
    expect(item.actions.canRetryPublication).toBe(true);
    expect(() => assertOfficeDisclosureProjectionSafe(item)).not.toThrow();
  });

  it('cross-client, cross-case, cross-version ve cross-tenant aynı 404 gövdesini üretir', async () => {
    const attempts = [
      () =>
        service.getDetail(
          { tenantId: tenantA, actorUserId: partner, clientId: clientA },
          versionOther,
        ),
      () =>
        service.getDetail(
          { tenantId: tenantA, actorUserId: partner, clientId: clientA, caseId: caseOther },
          versionA,
        ),
      () =>
        service.getDetail(
          { tenantId: tenantA, actorUserId: partner, clientId: clientA },
          'missing-version',
        ),
      () =>
        service.getDetail(
          { tenantId: tenantB, actorUserId: foreignPartner, clientId: clientA },
          versionA,
        ),
    ];
    const responses: string[] = [];
    for (const attempt of attempts) {
      try {
        await attempt();
        throw new Error('unexpected success');
      } catch (error) {
        expect(error).toBeInstanceOf(OfficeDisclosureProjectionNotFoundError);
        responses.push(
          JSON.stringify((error as OfficeDisclosureProjectionNotFoundError).getResponse()),
        );
      }
    }
    expect(new Set(responses).size).toBe(1);
  });

  it('staff okuyabilir fakat final approval/publication capability alamaz', async () => {
    const item = await service.getDetail(
      { tenantId: tenantA, actorUserId: staff, clientId: clientA },
      versionA,
    );
    expect(item.actions.canRetryPublication).toBe(false);
    expect(item.actions.canCompleteOfficeApproval).toBe(false);
    expect(item.actions.canCompleteContentApproval).toBe(false);
  });

  it('POSTED-only preparation kaynağı mevcut disclosure kökünü gösterir, source ID sızdırmaz', async () => {
    const result = await service.getPreparationSources({
      tenantId: tenantA,
      actorUserId: partner,
      clientId: clientA,
    });
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.existingDisclosure?.disclosureId).toBe(rootA);
    expect(result.items[0]?.existingDisclosure?.status).toBe('SEND_FAILED');
    expect(JSON.stringify(result)).not.toContain(`pre01-disp-a-${suffix}`);
  });

  it('audit timeline ve retry durumu raw provider metadata olmadan tüketilir', async () => {
    const detail = await service.getDetail(
      { tenantId: tenantA, actorUserId: partner, clientId: clientA },
      versionA,
    );
    const timeline = await service.getTimeline(
      { tenantId: tenantA, actorUserId: partner, clientId: clientA },
      versionA,
    );
    expect(detail.delivery.state).toBe('FAILED_RETRY_AVAILABLE');
    expect(timeline.events.map((event) => event.type)).toContain('SEND_FAILED');
    const serialized = JSON.stringify({ detail, timeline });
    expect(serialized).not.toContain('SMTP_SECRET_CODE');
    expect(serialized).not.toContain('raw provider stack secret');
    expect(serialized).not.toContain('SECRET-ID');
  });
});
