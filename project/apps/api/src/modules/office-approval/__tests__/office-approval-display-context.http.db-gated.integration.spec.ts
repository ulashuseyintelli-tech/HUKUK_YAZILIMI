import { CanActivate, ExecutionContext, INestApplication, UnauthorizedException, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { OfficeApprovalStatus, PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import * as request from 'supertest';
import { resolveTestDatabaseUrl } from '../../../../test/test-db-env';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CASE_VIEW_SCOPE_FLAG } from '../../case/case-view-scope';
import { ClaimItemModule } from '../../claim-item/claim-item.module';
import { ClaimLiabilityModule } from '../../claim-liability/claim-liability.module';
import { OfficeApprovalService } from '../office-approval.service';

/**
 * Onay Kutusu görünüm bağlamı — kişi adları + GÜNCEL dosya (GERÇEK HTTP + disposable PostgreSQL). Tutarlar ve adlar SENTETİKTİR.
 *
 * Kanıtlananlar: talep eden / onaylayan adları yalnız talebin kiracısından; dosya numarası ve kalem adı yalnız aktörün dosya
 * görme kapsamındaysa (F02 P3 kuralı; bayrak açık ve kapalı); kapsam dışı → numara / ad / kimlik YOK; başka kiracıdaki hedef →
 * NOT_FOUND; başka kiracının kullanıcısı → ad null; başka kiracıdan detay → 404 (mevcut); liste satırlarında talep eden adı;
 * kayıtlı niyet (savedIntent) bağlamdan bağımsız ve değişmeden döner; karar yanıtı da bağlamı taşır.
 */
const TEST_DB_URL = resolveTestDatabaseUrl(process.env);
if (process.env.CI && !TEST_DB_URL) {
  throw new Error('Office approval display context DB gate requires TEST_DATABASE_URL in CI.');
}
const describeWithDisposableDb = TEST_DB_URL ? describe : describe.skip;
const PRODUCTION_VALIDATION_OPTIONS = { whitelist: true, forbidNonWhitelisted: true, transform: true } as const;
const SELECTION_FLAG = 'CLAIM_LIABILITY_SELECTION_ENABLED';

class DbUserIdentityGuard implements CanActivate {
  constructor(private readonly db: () => PrismaClient) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const user = await this.db().user.findUnique({ where: { id: String(req.headers['x-test-user-id']) }, include: { tenant: true } });
    if (!user || !user.isActive) throw new UnauthorizedException();
    req.user = user;
    return true;
  }
}

describeWithDisposableDb('Onay Kutusu görünüm bağlamı — adlar ve güncel dosya (HTTP + disposable PostgreSQL)', () => {
  jest.setTimeout(180_000);

  let prisma: PrismaClient;
  let app: INestApplication;
  let approvals: OfficeApprovalService;
  const previous = { selection: process.env[SELECTION_FLAG], scope: process.env[CASE_VIEW_SCOPE_FLAG] };

  beforeAll(async () => {
    process.env[SELECTION_FLAG] = 'true';
    prisma = new PrismaClient({ datasources: { db: { url: TEST_DB_URL } } });
    await prisma.$connect();
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }), ClaimItemModule, ClaimLiabilityModule],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(new DbUserIdentityGuard(() => prisma))
      .compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe(PRODUCTION_VALIDATION_OPTIONS));
    await app.init();
    approvals = app.get(OfficeApprovalService);
  });

  beforeEach(() => {
    process.env[SELECTION_FLAG] = 'true';
    process.env[CASE_VIEW_SCOPE_FLAG] = 'true';
  });

  afterAll(async () => {
    await app?.close();
    await prisma.$disconnect();
    for (const [key, value] of [
      [SELECTION_FLAG, previous.selection],
      [CASE_VIEW_SCOPE_FLAG, previous.scope],
    ] as const) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  type Fixture = Awaited<ReturnType<typeof fixture>>;

  async function fixture(label: string, itemCount = 1) {
    const suffix = randomUUID().slice(0, 8);
    const tenantId = `test-appr-ctx-${label}-${suffix}`;
    await prisma.tenant.create({ data: { id: tenantId, name: `APPR CTX ${label}`, slug: tenantId } });
    const office = await prisma.office.create({ data: { tenantId, name: `APPR CTX office ${label}` } });
    const requesterUser = await prisma.user.create({
      data: { tenantId, email: `ctx-req-${suffix}@example.test`, name: 'Sentetik', surname: 'Talepçi', role: 'USER' },
    });
    const requesterLawyer = await prisma.lawyer.create({
      data: { tenantId, officeId: office.id, userId: requesterUser.id, name: 'Sentetik', surname: 'Talepçi', lawyerRank: 'LAWYER' },
    });
    const approverUser = await prisma.user.create({
      data: { tenantId, email: `ctx-appr-${suffix}@example.test`, name: 'Sentetik', surname: 'Onaycı', role: 'ADMIN' },
    });
    const approverLawyer = await prisma.lawyer.create({
      data: { tenantId, officeId: office.id, userId: approverUser.id, name: 'Sentetik', surname: 'Onaycı', lawyerRank: 'PARTNER' },
    });
    const fileNumber = `CTX-${label}-${suffix}`;
    const legalCase = await prisma.case.create({
      data: { tenantId, fileNumber, type: 'GENERAL_EXECUTION', caseStatus: 'DERDEST', status: 'ACTIVE', currency: 'TRY' } as never,
    });
    // Talep eden dosyanın avukatıdır (mali düzenleme izniyle); onaylayan dosyaya BAĞLI DEĞİL (kapsam dışı başlar).
    await prisma.caseLawyer.create({ data: { caseId: legalCase.id, lawyerId: requesterLawyer.id, casePermissions: { canEditFinance: true } } });
    const debtor = await prisma.debtor.create({ data: { tenantId, type: 'INDIVIDUAL', name: 'Sentetik Borçlu' } as never });
    const caseDebtor = await prisma.caseDebtor.create({ data: { caseId: legalCase.id, debtorId: debtor.id, role: 'ASIL_BORCLU' } });
    const itemIds: string[] = [];
    for (let index = 0; index < itemCount; index += 1) {
      const item = await prisma.claimItem.create({
        data: {
          tenantId,
          caseId: legalCase.id,
          itemType: 'PRINCIPAL',
          description: `Sentetik asıl alacak ${index + 1}`,
          originalAmount: 1000,
          demandedAmount: 1000,
          amount: 1000,
          currency: 'TRY',
          interestAccrualStatus: 'NO_INTEREST',
          liableDebtorIds: [],
          sortOrder: index + 1,
        },
      });
      itemIds.push(item.id);
    }
    return {
      tenantId,
      officeId: office.id,
      caseId: legalCase.id,
      fileNumber,
      requesterUserId: requesterUser.id,
      approverUserId: approverUser.id,
      approverLawyerId: approverLawyer.id,
      caseDebtorId: caseDebtor.id,
      itemIds,
    };
  }

  const http = () => request(app.getHttpServer());
  const capped = (f: Fixture, claimItemId: string) => ({
    claimItemId,
    mode: 'CAPPED',
    basis: 'LAWYER_ASSESSMENT',
    basisNote: 'Sentetik açıklama',
    parties: [{ caseDebtorId: f.caseDebtorId, limitAmount: '400.00' }],
  });

  async function ask(f: Fixture, selections: unknown[]): Promise<string> {
    const previewed = await http().post(`/cases/${f.caseId}/claim-liability/preview`).set('x-test-user-id', f.requesterUserId).send({ selections });
    expect(previewed.status).toBe(201);
    const requested = await http()
      .post(`/cases/${f.caseId}/claim-liability/request`)
      .set('x-test-user-id', f.requesterUserId)
      .send({ selections, onizlemeOzeti: previewed.body.onizlemeOzeti });
    expect(requested.status).toBe(201);
    return requested.body.approvalRequestId as string;
  }
  const detail = (id: string, userId: string) => http().get(`/office-approvals/${id}`).set('x-test-user-id', userId);

  it('kapsam dışı onaylayan: adlar görünür, dosya numarası / kalem adı / dosya kimliği VERİLMEZ; savedIntent aynen döner', async () => {
    const f = await fixture('scope-out');
    const id = await ask(f, [capped(f, f.itemIds[0])]);
    const res = await detail(id, f.approverUserId);
    expect(res.status).toBe(200);
    expect(res.body.data.displayContext).toEqual({
      requesterName: 'Sentetik Talepçi',
      approverName: null,
      case: { status: 'NOT_VISIBLE', caseId: null, fileNumber: null, claimItemLabel: null, intentCaseMatches: true },
    });
    expect(JSON.stringify(res.body.data.displayContext)).not.toContain(f.fileNumber);
    const stored = await prisma.officeApprovalRequest.findUniqueOrThrow({ where: { id } });
    expect(res.body.data.savedIntent).toEqual(JSON.parse(JSON.stringify(stored.savedIntent)));
  });

  it('dosyaya bağlanan onaylayan ve talep eden: dosya numarası + kalemin GÜNCEL adı; kalem adı değişince güncel ad gelir, niyet değişmez', async () => {
    const f = await fixture('scope-in');
    const id = await ask(f, [capped(f, f.itemIds[0])]);
    await prisma.caseLawyer.create({ data: { caseId: f.caseId, lawyerId: f.approverLawyerId, casePermissions: {} } });
    const asApprover = await detail(id, f.approverUserId);
    expect(asApprover.body.data.displayContext.case).toEqual({
      status: 'VISIBLE',
      caseId: f.caseId,
      fileNumber: f.fileNumber,
      claimItemLabel: 'Sentetik asıl alacak 1',
      intentCaseMatches: true,
    });
    const asRequester = await detail(id, f.requesterUserId);
    expect(asRequester.body.data.displayContext.case.status).toBe('VISIBLE');

    const savedDisplayBefore = asApprover.body.data.savedIntent.selections[0].display;
    await prisma.claimItem.update({ where: { id: f.itemIds[0] }, data: { description: 'Sentetik güncel ad' } });
    const after = await detail(id, f.approverUserId);
    expect(after.body.data.displayContext.case.claimItemLabel).toBe('Sentetik güncel ad');
    expect(after.body.data.savedIntent.selections[0].display).toEqual(savedDisplayBefore);
  });

  it('dosya görme kapsamı bayrağı kapalı: bugünkü kiracı geneli kural → dosya bilgisi görünür', async () => {
    const f = await fixture('scope-off');
    const id = await ask(f, [capped(f, f.itemIds[0])]);
    process.env[CASE_VIEW_SCOPE_FLAG] = 'false';
    const res = await detail(id, f.approverUserId);
    expect(res.body.data.displayContext.case).toMatchObject({ status: 'VISIBLE', fileNumber: f.fileNumber });
  });

  it('karar yanıtı ve sonraki detay onaylayan adını taşır; liste satırları talep eden adını taşır', async () => {
    const f = await fixture('decided');
    const id = await ask(f, [capped(f, f.itemIds[0])]);
    const inbox = await http().get('/office-approvals/inbox').set('x-test-user-id', f.approverUserId);
    expect(inbox.status).toBe(200);
    const row = inbox.body.data.find((entry: { id: string }) => entry.id === id);
    expect(row).toMatchObject({ requesterUserId: f.requesterUserId, requesterName: 'Sentetik Talepçi' });
    const mine = await http().get('/office-approvals/mine').set('x-test-user-id', f.requesterUserId);
    expect(mine.body.data.find((entry: { id: string }) => entry.id === id)).toMatchObject({ requesterName: 'Sentetik Talepçi' });

    const approved = await http().post(`/office-approvals/${id}/approve`).set('x-test-user-id', f.approverUserId).send({});
    expect(approved.status).toBe(201);
    expect(approved.body.data.displayContext).toMatchObject({ requesterName: 'Sentetik Talepçi', approverName: 'Sentetik Onaycı' });
    const after = await detail(id, f.requesterUserId);
    expect(after.body.data.status).toBe(OfficeApprovalStatus.APPROVED);
    expect(after.body.data.displayContext.approverName).toBe('Sentetik Onaycı');
  });

  it('toplu talep (dosya hedefi): dosya numarası görünür, tek kalem adı verilmez', async () => {
    const f = await fixture('bulk', 2);
    const id = await ask(f, [capped(f, f.itemIds[0]), capped(f, f.itemIds[1])]);
    await prisma.caseLawyer.create({ data: { caseId: f.caseId, lawyerId: f.approverLawyerId, casePermissions: {} } });
    const res = await detail(id, f.approverUserId);
    expect(res.body.data.targetType).toBe('CLAIM_ITEM_CASE');
    expect(res.body.data.displayContext.case).toEqual({
      status: 'VISIBLE',
      caseId: f.caseId,
      fileNumber: f.fileNumber,
      claimItemLabel: null,
      intentCaseMatches: true,
    });
  });

  it('kiracı sınırı: başka kiracının kalemi → NOT_FOUND, başka kiracının kullanıcısı → ad null, başka kiracıdan detay → 404', async () => {
    const a = await fixture('tenant-a');
    const b = await fixture('tenant-b');
    // Bozuk / elle girilmiş kayıt benzetimi: A kiracısındaki talep, B kiracısının kalemine ve kullanıcısına işaret eder.
    const crafted = await prisma.officeApprovalRequest.create({
      data: {
        tenantId: a.tenantId,
        actionCode: 'CLAIM_ITEM_HIGH_IMPACT_CHANGE',
        targetType: 'CLAIM_ITEM',
        targetRef: b.itemIds[0],
        requesterUserId: b.requesterUserId,
        savedIntent: { caseId: b.caseId },
        payloadHash: `sha256:${randomUUID()}`,
        idempotencyKey: `ctx-crafted-${randomUUID()}`,
        status: OfficeApprovalStatus.PENDING_APPROVAL,
      } as never,
    });
    const res = await detail(crafted.id, a.approverUserId);
    expect(res.status).toBe(200);
    expect(res.body.data.displayContext).toEqual({
      requesterName: null,
      approverName: null,
      case: { status: 'NOT_FOUND', caseId: null, fileNumber: null, claimItemLabel: null, intentCaseMatches: null },
    });
    expect(JSON.stringify(res.body.data.displayContext)).not.toContain(b.fileNumber);

    const ownRequest = await ask(a, [capped(a, a.itemIds[0])]);
    const foreign = await detail(ownRequest, b.approverUserId);
    expect(foreign.status).toBe(404);
    expect(JSON.stringify(foreign.body)).not.toContain(a.fileNumber);
  });

  it('dosya çözülmeyen hedef türü: bağlam NOT_APPLICABLE, adlar yine kiracıdan', async () => {
    const f = await fixture('na');
    const crafted = await approvals.createPendingRequest({
      tenantId: f.tenantId,
      actionCode: 'COLLECTION_DISPOSITION_POST',
      targetType: 'COLLECTION_DISPOSITION',
      targetRef: `disp-${randomUUID()}`,
      requesterUserId: f.requesterUserId,
      savedIntent: { version: 'synthetic' },
      idempotencyKey: `ctx-na-${randomUUID()}`,
      reason: 'Sentetik',
    } as never);
    const res = await detail(crafted.id, f.approverUserId);
    expect(res.body.data.displayContext).toEqual({
      requesterName: 'Sentetik Talepçi',
      approverName: null,
      case: { status: 'NOT_APPLICABLE', caseId: null, fileNumber: null, claimItemLabel: null, intentCaseMatches: null },
    });
  });
});
