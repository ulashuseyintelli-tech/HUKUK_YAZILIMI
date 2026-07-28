import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { PrismaClient } from '@prisma/client';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';
import * as request from 'supertest';

import { resolveTestDatabaseUrl } from '../../../../test/test-db-env';
import { AccountingJournalWriterService } from '../../accounting-journal/accounting-journal.writer';
import { AuditService } from '../../audit/audit.service';
import { CaseDebtorLifecycleGuardService } from '../../case-debtor-lifecycle-guard/case-debtor-lifecycle-guard.service';
import { ClaimItemController } from '../../claim-item/claim-item.controller';
import { ClaimItemService } from '../../claim-item/claim-item.service';
import { ClaimItemWriteGateService } from '../../claim-item/claim-item-write-gate.service';
import { ClaimItemWriterRouterService } from '../../claim-item/claim-item-writer-router.service';
import { ClientController } from '../../client/client.controller';
import { ClientService } from '../../client/client.service';
import { ClientIntakeLinkService } from '../../client-intake-link/client-intake-link.service';
import { CollectionController } from '../../collection/collection.controller';
import { CollectionService } from '../../collection/collection.service';
import { ReceiptObjectScopeAuthorizationService } from '../../collection/receipt-object-scope-authorization.service';
import { CollectionChannel, CollectionSource, CollectionType } from '../../collection/dto/collection.dto';
import { DebtorController } from '../../debtor/debtor.controller';
import { DebtorService } from '../../debtor/debtor.service';
import { CaseDebtorService } from '../../debtor/case-debtor.service';
import { DebtorCrossCaseNotificationService } from '../../debtor/debtor-cross-case-notification.service';
import { DebtorCrossCaseNotificationTaskLinkService } from '../../debtor/debtor-cross-case-notification-task-link.service';
import { DomainEventIngestService } from '../../icrabot/domain-event-ingest';
import { GuidedOpenObserveService } from '../../permission-diagnostics/guided-open-observe.service';
import { PoaService } from '../../poa/poa.service';
import { OfficeController } from '../../office/office.controller';
import { OfficeService } from '../../office/office.service';
import { SummaryEngineService } from '../../summary-engine/summary-engine.service';
import { TBK100AllocatorService } from '../../interest-engine/allocation/tbk100-allocator.service';
import { AuthService } from '../auth.service';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { JwtStrategy } from '../strategies/jwt.strategy';

const TEST_SECRET = 'w2-controlled-runtime-test-secret-at-least-32-bytes';
const TEST_DB_URL = resolveTestDatabaseUrl(process.env);
if (process.env.CI && !TEST_DB_URL) {
  throw new Error('R01 W2 DB gate blocked: CI requires an approved TEST_DATABASE_URL.');
}
const describeWithDisposableDb = TEST_DB_URL ? describe : describe.skip;

const projectRoot = path.resolve(__dirname, '../../../../../..');
const repositoryRoot = path.resolve(projectRoot, '..');
const auditBaseSha = '9cd51295db434b437bf240a26a4421c6c8e7a211';
const artifactDirectory = path.join(
  projectRoot,
  'docs',
  'audit',
  'runtime-operability-certification-r01',
  'w2-core-user-journeys',
);
const runtimeSpecPath =
  'project/apps/api/src/modules/auth/__tests__/core-user-journeys-runtime-certification.db-gated.integration.spec.ts';
const manifestPath = path.join(projectRoot, 'apps', 'api', 'ci-manifests', 'db', 'domain-integration.txt');
const generatorPath = path.join(projectRoot, 'scripts', 'runtime-core-user-journeys-certification-r01.cjs');
const w1ArtifactDirectory =
  'project/docs/audit/runtime-operability-certification-r01/w1-security-tenant-certification';
const w1DecisionLogPath = `${w1ArtifactDirectory}/decision-log.md`;
const expectedW1DecisionLogBlob = '97258db18a61cd418b60af170b1eafe1292f6bbc';
const outputFiles = [
  'journey-inventory.json',
  'journey-certification-matrix.csv',
  'core-user-journeys-certification.md',
  'negative-boundary-validation.md',
  'remediation-register.md',
  'methodology-validation-report.md',
  'decision-log.md',
];

function git(...args: string[]): string {
  const result = spawnSync('git', args, {
    cwd: repositoryRoot,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });
  expect(result.status).toBe(0);
  return result.stdout.trim();
}

interface RuntimeFixture {
  tenantA: string;
  tenantB: string;
  userA: string;
  userB: string;
  officeA: string;
  officeB: string;
  seededClientId: string;
  seededDebtorId: string;
  caseId: string;
  caseDebtorId: string;
  claimItemId: string;
}

describeWithDisposableDb('R01 W2 core user journeys - controlled Nest runtime and disposable PostgreSQL', () => {
  jest.setTimeout(120_000);

  let app: INestApplication;
  let jwt: JwtService;
  let prisma: PrismaClient;
  let fixture: RuntimeFixture;
  let auditService: AuditService;
  let clientService: ClientService;
  let debtorService: DebtorService;
  let claimItemService: ClaimItemService;
  let collectionService: CollectionService;
  let officeService: OfficeService;
  let domainEvents: DomainEventIngestService;
  let summaryEngine: SummaryEngineService;
  let journalWriter: AccountingJournalWriterService;
  const tenantIdsToClean = new Set<string>();

  const auth = {
    validateUser: jest.fn(async (userId: string | undefined) => {
      if (!userId || !prisma) return null;
      return prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          tenantId: true,
          email: true,
          name: true,
          surname: true,
          role: true,
          isActive: true,
          tokenVersion: true,
        },
      });
    }),
  };

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url: TEST_DB_URL } } });
    await prisma.$connect();

    auditService = new AuditService(prisma as never);
    const officeApproval = { isApproverEligible: jest.fn().mockResolvedValue(false) };
    clientService = new ClientService(prisma as never, auditService, officeApproval as never);
    debtorService = new DebtorService(prisma as never, auditService, officeApproval as never);

    domainEvents = new DomainEventIngestService();
    const claimWriteGate = new ClaimItemWriteGateService(prisma as never);
    const claimWriterRouter = new ClaimItemWriterRouterService(
      prisma as never,
      claimWriteGate,
      domainEvents,
    );
    claimItemService = new ClaimItemService(
      prisma as never,
      undefined,
      auditService,
      officeApproval as never,
      claimWriterRouter,
      domainEvents,
    );

    summaryEngine = new SummaryEngineService(prisma as never, new TBK100AllocatorService());
    await summaryEngine.onModuleInit();
    journalWriter = new AccountingJournalWriterService(prisma as never);
    collectionService = new CollectionService(
      prisma as never,
      domainEvents,
      new CaseDebtorLifecycleGuardService(prisma as never),
      summaryEngine,
      journalWriter,
      undefined,
      auditService,
    );
    officeService = new OfficeService(prisma as never, auditService);

    const receiptAuthorization = new ReceiptObjectScopeAuthorizationService(
      prisma as never,
      { isSecretConfigured: () => false } as never,
    );

    const module: TestingModule = await Test.createTestingModule({
      imports: [
        PassportModule.register({ defaultStrategy: 'jwt' }),
        JwtModule.register({ secret: TEST_SECRET, signOptions: { expiresIn: '5m' } }),
      ],
      controllers: [
        ClientController,
        DebtorController,
        ClaimItemController,
        CollectionController,
        OfficeController,
      ],
      providers: [
        JwtStrategy,
        JwtAuthGuard,
        { provide: AuthService, useValue: auth },
        { provide: ClientService, useValue: clientService },
        { provide: ClientIntakeLinkService, useValue: {} },
        { provide: PoaService, useValue: {} },
        { provide: DebtorService, useValue: debtorService },
        { provide: DebtorCrossCaseNotificationService, useValue: {} },
        { provide: CaseDebtorService, useValue: {} },
        { provide: DebtorCrossCaseNotificationTaskLinkService, useValue: {} },
        { provide: ClaimItemService, useValue: claimItemService },
        { provide: CollectionService, useValue: collectionService },
        { provide: ReceiptObjectScopeAuthorizationService, useValue: receiptAuthorization },
        { provide: OfficeService, useValue: officeService },
        { provide: GuidedOpenObserveService, useValue: {} },
        {
          provide: ConfigService,
          useValue: {
            get: (key: string, defaultValue?: unknown) =>
              key === 'JWT_SECRET' ? TEST_SECRET : defaultValue,
          },
        },
      ],
    }).compile();

    app = module.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    app.useLogger(false);
    app.setGlobalPrefix('api');
    await app.init();
    jwt = module.get(JwtService);
    fixture = await createFixture();
  });

  afterAll(async () => {
    if (app) await app.close();
    for (const tenantId of [...tenantIdsToClean]) await cleanupTenant(tenantId);
    if (prisma) await prisma.$disconnect();
  });

  function bearer(userId: string, tenantId: string, overrides: Record<string, unknown> = {}): string {
    return `Bearer ${jwt.sign({
      sub: userId,
      tenantId,
      email: `${userId}@example.test`,
      role: 'USER',
      tokenVersion: 0,
      ...overrides,
    })}`;
  }

  async function createFixture(): Promise<RuntimeFixture> {
    const suffix = randomUUID();
    const tenantA = `w2-a-${suffix}`;
    const tenantB = `w2-b-${suffix}`;
    tenantIdsToClean.add(tenantA);
    tenantIdsToClean.add(tenantB);

    await prisma.tenant.createMany({
      data: [
        { id: tenantA, name: 'W2 Tenant A', slug: tenantA },
        { id: tenantB, name: 'W2 Tenant B', slug: tenantB },
      ],
    });
    const userA = await prisma.user.create({
      data: { tenantId: tenantA, email: `w2-a-${suffix}@example.test`, name: 'W2', surname: 'Actor A' },
    });
    const userB = await prisma.user.create({
      data: { tenantId: tenantB, email: `w2-b-${suffix}@example.test`, name: 'W2', surname: 'Actor B' },
    });
    const officeA = await prisma.office.create({ data: { tenantId: tenantA, name: 'W2 Office A' } });
    const officeB = await prisma.office.create({ data: { tenantId: tenantB, name: 'W2 Office B' } });
    const lawyerA = await prisma.lawyer.create({
      data: {
        tenantId: tenantA,
        officeId: officeA.id,
        userId: userA.id,
        name: 'W2',
        surname: 'Lawyer',
      },
    });
    const seededClient = await prisma.client.create({
      data: { tenantId: tenantA, displayName: 'W2 Seed Client', type: 'INDIVIDUAL' },
    });
    const seededDebtor = await prisma.debtor.create({
      data: { tenantId: tenantA, name: 'W2 Seed Debtor', type: 'INDIVIDUAL' },
    });
    const legalCase = await prisma.case.create({
      data: {
        tenantId: tenantA,
        clientId: seededClient.id,
        fileNumber: `W2-${suffix}`,
        type: 'GENERAL_EXECUTION',
        caseStatus: 'DERDEST',
        status: 'ACTIVE',
        currency: 'TRY',
        interestType: 'YASAL',
      },
    });
    await prisma.caseLawyer.create({
      data: {
        caseId: legalCase.id,
        lawyerId: lawyerA.id,
        casePermissions: { canEditFinance: true },
      },
    });
    const caseDebtor = await prisma.caseDebtor.create({
      data: { caseId: legalCase.id, debtorId: seededDebtor.id, role: 'ASIL_BORCLU' },
    });
    const claimItem = await prisma.claimItem.create({
      data: {
        tenantId: tenantA,
        caseId: legalCase.id,
        itemType: 'PRINCIPAL',
        originalAmount: 10_000,
        demandedAmount: 10_000,
        amount: 10_000,
        currency: 'TRY',
        interestType: 'YASAL',
        interestStartDate: new Date('2026-06-01T00:00:00.000Z'),
        interestAccrualStatus: 'ACCRUES',
        interestStartDateProvenance: 'MANUAL_LAWYER_CONFIRMED',
        liableDebtorIds: [],
      },
    });

    return {
      tenantA,
      tenantB,
      userA: userA.id,
      userB: userB.id,
      officeA: officeA.id,
      officeB: officeB.id,
      seededClientId: seededClient.id,
      seededDebtorId: seededDebtor.id,
      caseId: legalCase.id,
      caseDebtorId: caseDebtor.id,
      claimItemId: claimItem.id,
    };
  }

  async function cleanupTenant(tenantId: string): Promise<void> {
    await prisma.auditLog.deleteMany({ where: { tenantId } });
    await prisma.icrabotOutboxAction.deleteMany({ where: { tenantId } });
    await prisma.accountingJournalEntry.deleteMany({ where: { tenantId } });
    await prisma.collectionOverpayment.deleteMany({ where: { tenantId } });
    await prisma.ledgerEntry.deleteMany({ where: { tenantId } });
    await prisma.collection.deleteMany({ where: { tenantId } });
    await prisma.claimItem.deleteMany({ where: { tenantId } });
    await prisma.task.deleteMany({ where: { tenantId } });
    await prisma.caseLawyer.deleteMany({ where: { case: { tenantId } } });
    await prisma.caseDebtor.deleteMany({ where: { case: { tenantId } } });
    await prisma.case.deleteMany({ where: { tenantId } });
    await prisma.debtor.deleteMany({ where: { tenantId } });
    await prisma.client.deleteMany({ where: { tenantId } });
    await prisma.lawyer.deleteMany({ where: { tenantId } });
    await prisma.office.deleteMany({ where: { tenantId } });
    await prisma.user.deleteMany({ where: { tenantId } });
    await prisma.tenant.deleteMany({ where: { id: tenantId } });
    tenantIdsToClean.delete(tenantId);
    // IcrabotTimelineEntry is append-only. Random tenant/case identities isolate the
    // residue, and the disposable PostgreSQL service is destroyed after the test job.
  }

  it.each([
    ['CLIENT', () => `/api/clients/${fixture.seededClientId}`],
    ['DEBTOR', () => `/api/debtors/${fixture.seededDebtorId}`],
    ['RECEIVABLE', () => `/api/claim-items/${fixture.claimItemId}`],
    ['COLLECTION', () => '/api/collections/unauthorized-probe'],
    ['OFFICE', () => '/api/office'],
  ])('%s protected entry point rejects an unauthorized actor', async (_module, url) => {
    await request(app.getHttpServer()).get(url()).expect(401);
  });

  it('missing or unknown subject identity fails closed and a tenant claim cannot replace trusted persisted identity', async () => {
    const missingSubject = `Bearer ${jwt.sign({ tenantId: fixture.tenantA, role: 'USER' })}`;
    await request(app.getHttpServer()).get('/api/office').set('Authorization', missingSubject).expect(401);
    await request(app.getHttpServer())
      .get('/api/office')
      .set('Authorization', bearer(`missing-${randomUUID()}`, fixture.tenantA))
      .expect(401);

    const response = await request(app.getHttpServer())
      .get(`/api/clients/${fixture.seededClientId}`)
      .set('Authorization', bearer(fixture.userA, fixture.tenantB))
      .expect(200);
    expect(response.body.data.id).toBe(fixture.seededClientId);
    expect(response.body.data.tenantId).toBe(fixture.tenantA);
  });

  it('CLIENT: actual create/read persists tenant-scoped client and audit; forced audit failure rolls both back', async () => {
    const tokenA = bearer(fixture.userA, fixture.tenantA);
    const created = await request(app.getHttpServer())
      .post('/api/clients')
      .set('Authorization', tokenA)
      .send({ firstName: 'Controlled', lastName: 'Client', email: 'client@example.test', phone: '+900000000001' })
      .expect(201);
    const clientId = created.body.data.id as string;

    const read = await request(app.getHttpServer())
      .get(`/api/clients/${clientId}`)
      .set('Authorization', tokenA)
      .expect(200);
    expect(read.body.data).toMatchObject({ id: clientId, tenantId: fixture.tenantA, displayName: 'Controlled Client' });
    await expect(prisma.client.findFirst({ where: { id: clientId, tenantId: fixture.tenantA } }))
      .resolves.toMatchObject({ displayName: 'Controlled Client' });
    await expect(prisma.auditLog.findFirst({
      where: { tenantId: fixture.tenantA, entityId: clientId, action: 'CLIENT_CREATE' },
    })).resolves.toMatchObject({ userId: fixture.userA });
    await request(app.getHttpServer())
      .get(`/api/clients/${clientId}`)
      .set('Authorization', bearer(fixture.userB, fixture.tenantB))
      .expect(404);

    const clientCountBefore = await prisma.client.count({ where: { tenantId: fixture.tenantA } });
    const auditCountBefore = await prisma.auditLog.count({ where: { tenantId: fixture.tenantA } });
    const failingService = new ClientService(
      prisma as never,
      { logInTransaction: jest.fn().mockRejectedValue(new Error('FORCED_W2_CLIENT_AUDIT_FAILURE')) } as never,
      { isApproverEligible: jest.fn().mockResolvedValue(false) } as never,
    );
    await expect(failingService.create(
      fixture.tenantA,
      { firstName: 'Rollback', lastName: 'Client', email: 'rollback@example.test', phone: '+900000000002' },
      { userId: fixture.userA },
    )).rejects.toThrow('FORCED_W2_CLIENT_AUDIT_FAILURE');
    await expect(prisma.client.count({ where: { tenantId: fixture.tenantA } })).resolves.toBe(clientCountBefore);
    await expect(prisma.auditLog.count({ where: { tenantId: fixture.tenantA } })).resolves.toBe(auditCountBefore);
  });

  it('DEBTOR: actual create/read is tenant isolated and duplicate failure leaves no partial state', async () => {
    const tokenA = bearer(fixture.userA, fixture.tenantA);
    const body = {
      type: 'INDIVIDUAL',
      firstName: 'Controlled',
      lastName: 'Debtor',
      tckn: '10000000146',
      forceCreate: true,
    };
    const created = await request(app.getHttpServer())
      .post('/api/debtors')
      .set('Authorization', tokenA)
      .send(body)
      .expect(201);
    const debtorId = created.body.id as string;

    const read = await request(app.getHttpServer())
      .get(`/api/debtors/${debtorId}`)
      .set('Authorization', tokenA)
      .expect(200);
    expect(read.body).toMatchObject({ id: debtorId, tenantId: fixture.tenantA, name: 'Controlled Debtor' });
    await expect(prisma.debtor.findFirst({ where: { id: debtorId, tenantId: fixture.tenantA } }))
      .resolves.toMatchObject({ identityNo: '10000000146' });
    await expect(prisma.auditLog.findFirst({
      where: { tenantId: fixture.tenantA, entityId: debtorId, action: 'DEBTOR_CREATE' },
    })).resolves.toMatchObject({ userId: fixture.userA });
    await request(app.getHttpServer())
      .get(`/api/debtors/${debtorId}`)
      .set('Authorization', bearer(fixture.userB, fixture.tenantB))
      .expect(404);

    const countBefore = await prisma.debtor.count({ where: { tenantId: fixture.tenantA } });
    await request(app.getHttpServer())
      .post('/api/debtors')
      .set('Authorization', tokenA)
      .send(body)
      .expect(409);
    await expect(prisma.debtor.count({ where: { tenantId: fixture.tenantA } })).resolves.toBe(countBefore);
  });

  it('RECEIVABLE: active ClaimItem read-back works and contained human create leaves no state', async () => {
    const tokenA = bearer(fixture.userA, fixture.tenantA);
    const list = await request(app.getHttpServer())
      .get(`/api/claim-items/case/${fixture.caseId}`)
      .set('Authorization', tokenA)
      .expect(200);
    expect(list.body.data.map((item: { id: string }) => item.id)).toContain(fixture.claimItemId);

    const detail = await request(app.getHttpServer())
      .get(`/api/claim-items/${fixture.claimItemId}`)
      .set('Authorization', tokenA)
      .expect(200);
    expect(detail.body.data).toMatchObject({ id: fixture.claimItemId, tenantId: fixture.tenantA, caseId: fixture.caseId });
    await expect(prisma.claimItem.findFirst({
      where: { id: fixture.claimItemId, tenantId: fixture.tenantA, caseId: fixture.caseId },
    })).resolves.toMatchObject({ status: 'ACTIVE' });

    const foreignList = await request(app.getHttpServer())
      .get(`/api/claim-items/case/${fixture.caseId}`)
      .set('Authorization', bearer(fixture.userB, fixture.tenantB))
      .expect(200);
    expect(foreignList.body.data).toEqual([]);
    await request(app.getHttpServer())
      .get(`/api/claim-items/${fixture.claimItemId}`)
      .set('Authorization', bearer(fixture.userB, fixture.tenantB))
      .expect(404);

    const countBefore = await prisma.claimItem.count({ where: { tenantId: fixture.tenantA } });
    const rejected = await request(app.getHttpServer())
      .post('/api/claim-items')
      .set('Authorization', tokenA)
      .send({ caseId: fixture.caseId, itemType: 'EXPENSE', amount: 125, currency: 'TRY' })
      .expect(400);
    expect(rejected.body).toMatchObject({
      code: 'FORMATION_CONTEXT_REQUIRED',
      message: 'Complete claim formation context is required.',
    });
    await expect(prisma.claimItem.count({ where: { tenantId: fixture.tenantA } })).resolves.toBe(countBefore);
  });

  it('COLLECTION: actual receipt dispatch writes/read-backs every side effect, replays idempotently, and rolls back on audit failure', async () => {
    const tokenA = bearer(fixture.userA, fixture.tenantA);
    const body = {
      caseId: fixture.caseId,
      caseDebtorId: fixture.caseDebtorId,
      idempotencyKey: randomUUID(),
      amount: 500,
      currency: 'TRY',
      type: CollectionType.BANK_TRANSFER,
      channel: CollectionChannel.BANKA,
      date: '2026-07-20T00:00:00.000Z',
      sourceType: CollectionSource.MANUAL,
      receiptNo: `W2-${randomUUID()}`,
      autoAllocate: false,
    };
    const created = await request(app.getHttpServer())
      .post('/api/collections')
      .set('Authorization', tokenA)
      .send(body)
      .expect(201);
    const collectionId = created.body.id as string;

    const read = await request(app.getHttpServer())
      .get(`/api/collections/${collectionId}`)
      .set('Authorization', tokenA)
      .expect(200);
    expect(read.body).toMatchObject({ id: collectionId, tenantId: fixture.tenantA, status: 'CONFIRMED' });
    await expect(prisma.collection.findFirst({ where: { id: collectionId, tenantId: fixture.tenantA } }))
      .resolves.toMatchObject({ caseId: fixture.caseId });
    await expect(prisma.ledgerEntry.findFirst({
      where: { tenantId: fixture.tenantA, collectionId, entryType: 'PAYMENT' },
    })).resolves.toMatchObject({ caseId: fixture.caseId, status: 'CONFIRMED' });
    await expect(prisma.accountingJournalEntry.findFirst({
      where: { tenantId: fixture.tenantA, sourceId: collectionId, sourceAction: 'recorded' },
    })).resolves.toBeTruthy();
    await expect(prisma.auditLog.findFirst({
      where: { tenantId: fixture.tenantA, entityId: collectionId, action: 'COLLECTION_CREATE' },
    })).resolves.toMatchObject({ userId: fixture.userA });
    const event = await prisma.icrabotTimelineEntry.findFirstOrThrow({
      where: { tenantId: fixture.tenantA, caseId: fixture.caseId, type: 'PAYMENT_RECEIVED' },
      orderBy: { createdAt: 'desc' },
    });
    const eventId = (event.body as any).header.eventId as string;
    await expect(prisma.icrabotOutboxAction.findUnique({ where: { idempotencyKey: `evt:${eventId}` } }))
      .resolves.toBeTruthy();
    await request(app.getHttpServer())
      .get(`/api/collections/${collectionId}`)
      .set('Authorization', bearer(fixture.userB, fixture.tenantB))
      .expect(404);

    const replay = await request(app.getHttpServer())
      .post('/api/collections')
      .set('Authorization', tokenA)
      .send(body)
      .expect(201);
    expect(replay.body.id).toBe(collectionId);
    await expect(prisma.collection.count({ where: { tenantId: fixture.tenantA, idempotencyKey: body.idempotencyKey } }))
      .resolves.toBe(1);

    const countsBefore = await Promise.all([
      prisma.collection.count({ where: { tenantId: fixture.tenantA } }),
      prisma.ledgerEntry.count({ where: { tenantId: fixture.tenantA } }),
      prisma.accountingJournalEntry.count({ where: { tenantId: fixture.tenantA } }),
      prisma.auditLog.count({ where: { tenantId: fixture.tenantA } }),
      prisma.icrabotTimelineEntry.count({ where: { tenantId: fixture.tenantA } }),
      prisma.icrabotOutboxAction.count({ where: { tenantId: fixture.tenantA } }),
    ]);
    const failingService = new CollectionService(
      prisma as never,
      domainEvents,
      new CaseDebtorLifecycleGuardService(prisma as never),
      summaryEngine,
      journalWriter,
      undefined,
      { logInTransaction: jest.fn().mockRejectedValue(new Error('FORCED_W2_COLLECTION_AUDIT_FAILURE')) } as never,
    );
    await expect(failingService.create(
      fixture.tenantA,
      { ...body, idempotencyKey: randomUUID(), receiptNo: `W2-ROLLBACK-${randomUUID()}` },
      fixture.userA,
      { correlationId: `w2-rollback-${randomUUID()}` },
    )).rejects.toThrow('FORCED_W2_COLLECTION_AUDIT_FAILURE');
    const countsAfter = await Promise.all([
      prisma.collection.count({ where: { tenantId: fixture.tenantA } }),
      prisma.ledgerEntry.count({ where: { tenantId: fixture.tenantA } }),
      prisma.accountingJournalEntry.count({ where: { tenantId: fixture.tenantA } }),
      prisma.auditLog.count({ where: { tenantId: fixture.tenantA } }),
      prisma.icrabotTimelineEntry.count({ where: { tenantId: fixture.tenantA } }),
      prisma.icrabotOutboxAction.count({ where: { tenantId: fixture.tenantA } }),
    ]);
    expect(countsAfter).toEqual(countsBefore);
  });

  it('OFFICE: actual non-secret update/read is tenant isolated and rejected update preserves prior state', async () => {
    const tokenA = bearer(fixture.userA, fixture.tenantA);
    const updated = await request(app.getHttpServer())
      .put('/api/office')
      .set('Authorization', tokenA)
      .send({ name: 'W2 Certified Office', address: 'Controlled Local', city: 'Ankara' })
      .expect(200);
    expect(updated.body).toMatchObject({ id: fixture.officeA, tenantId: fixture.tenantA, name: 'W2 Certified Office' });

    const read = await request(app.getHttpServer())
      .get('/api/office')
      .set('Authorization', tokenA)
      .expect(200);
    expect(read.body).toMatchObject({ id: fixture.officeA, tenantId: fixture.tenantA, name: 'W2 Certified Office' });
    await expect(prisma.office.findUnique({ where: { tenantId: fixture.tenantA } }))
      .resolves.toMatchObject({ name: 'W2 Certified Office', city: 'Ankara' });
    await expect(prisma.auditLog.findFirst({
      where: { tenantId: fixture.tenantA, entityId: fixture.officeA, entityType: 'OFFICE_SETTINGS', action: 'UPDATE' },
    })).resolves.toMatchObject({ userId: fixture.userA });

    const foreign = await request(app.getHttpServer())
      .get('/api/office')
      .set('Authorization', bearer(fixture.userB, fixture.tenantB))
      .expect(200);
    expect(foreign.body).toMatchObject({ id: fixture.officeB, tenantId: fixture.tenantB, name: 'W2 Office B' });
    expect(foreign.body.id).not.toBe(fixture.officeA);

    await request(app.getHttpServer())
      .put('/api/office')
      .set('Authorization', tokenA)
      .send({ name: null })
      .expect(500);
    await expect(prisma.office.findUnique({ where: { tenantId: fixture.tenantA } }))
      .resolves.toMatchObject({ name: 'W2 Certified Office', city: 'Ankara' });
  });
});

describe('R01 W2 certification artifact, static composition and boundary integrity', () => {
  const readModel = () => JSON.parse(fs.readFileSync(path.join(artifactDirectory, 'journey-inventory.json'), 'utf8'));

  it('binds exactly five module journeys with J0-J7 PASS and separate deployment axes', () => {
    const model = readModel();
    expect(model.schemaVersion).toBe(1);
    expect(model.program).toBe('RUNTIME-OPERABILITY-CERTIFICATION-R01');
    expect(model.task).toBe('W2-CORE-USER-JOURNEYS');
    expect(model.journeys).toHaveLength(5);
    expect(model.journeys.map((item: any) => item.module).sort())
      .toEqual(['CLIENT', 'COLLECTION', 'DEBTOR', 'OFFICE', 'RECEIVABLE']);
    expect(model.journeys.every((item: any) =>
      Object.values(item.certificationLevels).every((status) => status === 'PASS') &&
      item.finalStatus === 'CONTROLLED_LOCAL_CERTIFIED')).toBe(true);
    expect(model.statusAxes).toMatchObject({
      codeDeploymentStatus: 'NOT PERFORMED',
      controlledLocalRuntimeStatus: 'CONTROLLED_LOCAL_CERTIFIED',
      deployedEnvironmentRuntimeStatus: 'NOT ASSESSED',
    });
  });

  it('verifies production AppModule composition for all five selected controllers/services', () => {
    const appModule = fs.readFileSync(path.join(projectRoot, 'apps', 'api', 'src', 'app.module.ts'), 'utf8');
    for (const moduleName of ['ClientModule', 'DebtorModule', 'ClaimItemModule', 'CollectionModule', 'OfficeModule']) {
      expect(appModule).toMatch(new RegExp(`\\b${moduleName}\\b`));
    }
    const bindings = [
      ['client/client.module.ts', 'ClientController', 'ClientService'],
      ['debtor/debtor.module.ts', 'DebtorController', 'DebtorService'],
      ['claim-item/claim-item.module.ts', 'ClaimItemController', 'ClaimItemService'],
      ['collection/collection.module.ts', 'CollectionController', 'CollectionService'],
      ['office/office.module.ts', 'OfficeController', 'OfficeService'],
    ];
    for (const [relative, controller, service] of bindings) {
      const source = fs.readFileSync(path.join(projectRoot, 'apps', 'api', 'src', 'modules', relative), 'utf8');
      expect(source).toContain(controller);
      expect(source).toContain(service);
    }
  });

  it('regenerates all seven artifacts byte-for-byte deterministically', () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'roc-w2-'));
    try {
      const result = spawnSync(process.execPath, [
        generatorPath,
        '--audit-base-sha',
        auditBaseSha,
        '--out-dir',
        tempRoot,
      ], { cwd: repositoryRoot, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
      expect(result.status).toBe(0);
      for (const file of outputFiles) {
        expect(fs.readFileSync(path.join(tempRoot, file)))
          .toEqual(fs.readFileSync(path.join(artifactDirectory, file)));
      }
    } finally {
      const resolved = path.resolve(tempRoot);
      expect(resolved.startsWith(path.resolve(os.tmpdir()))).toBe(true);
      fs.rmSync(resolved, { recursive: true, force: true });
    }
  });

  it('pins W0/W1 seals and binds the runtime spec exactly once to required DB CI', () => {
    const model = readModel();
    for (const [file, expectedBlob] of Object.entries(model.metadata.w0ArtifactBlobs)) {
      expect(git('hash-object', file)).toBe(expectedBlob);
    }
    expect(git('hash-object', w1DecisionLogPath)).toBe(expectedW1DecisionLogBlob);
    expect(git('rev-parse', `HEAD:${w1ArtifactDirectory}`))
      .toBe(model.metadata.w1ArtifactTreeSha);
    expect(git(
      'status',
      '--porcelain',
      '--',
      ...Object.keys(model.metadata.w0ArtifactBlobs),
      w1ArtifactDirectory,
    )).toBe('');
    const manifestLines = fs.readFileSync(manifestPath, 'utf8').split(/\r?\n/).map((line) => line.trim());
    expect(manifestLines.filter((line) => line === runtimeSpecPath.replace('project/apps/api/', ''))).toHaveLength(1);
  });

  it('enforces the exact W2 changed-file allowlist and prohibited activation boundary', () => {
    const expected = [
      runtimeSpecPath,
      'project/apps/api/ci-manifests/db/domain-integration.txt',
      'project/scripts/runtime-core-user-journeys-certification-r01.cjs',
      ...outputFiles.map((file) =>
        `project/docs/audit/runtime-operability-certification-r01/w2-core-user-journeys/${file}`),
    ].sort();
    const parentProbe = spawnSync('git', ['cat-file', '-e', 'HEAD^'], {
      cwd: repositoryRoot,
      encoding: 'utf8',
    });
    let tracked: string[];
    if (parentProbe.status === 0) {
      tracked = git('diff', '--name-only', 'HEAD^', 'HEAD', '--').split(/\r?\n/).filter(Boolean);
    } else {
      expect(process.env.GITHUB_EVENT_PATH).toBeTruthy();
      const event = JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH!, 'utf8'));
      expect(event.pull_request?.changed_files).toBe(expected.length);
      tracked = git('ls-files', '--error-unmatch', '--', ...expected).split(/\r?\n/).filter(Boolean);
    }
    const untracked = git('ls-files', '--others', '--exclude-standard').split(/\r?\n/).filter(Boolean);
    expect([...new Set([...tracked, ...untracked])].sort()).toEqual(expected);
    expect(expected.some((file) =>
      /schema\.prisma|\/migrations\/|\.github\/workflows|playbook|manifest-admin|break-glass/i.test(file)))
      .toBe(false);
  });
});
