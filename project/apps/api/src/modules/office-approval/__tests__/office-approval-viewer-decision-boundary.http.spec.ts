/**
 * VIEWER ONAY KARARI SINIRI (owner GO 2026-09-10, AK-1a eki) — GERÇEK Nest HTTP pipeline (DB YOK).
 *
 * ÖLÇÜLEN (değişmemiş kod, main `ebb869be`): karar yüklemleri (`isApproverEligible`, `PayoutApprovalPolicy`,
 *   `ClientFinancialDisclosureApprovalPolicy`, FD `isDisclosureApproverEligible`) kullanıcı ROLÜNÜ okumaz; VIEWER,
 *   bağlı avukatı PARTNER/MANAGER ya da delege (`canApproveOfficeActions`) ise onay kararı veriyordu.
 * KURAL: karar anında DB'den okunan rol VIEWER ise karar YOK — 403; karar kaydı, domain senkronu ve audit YAZILMAZ.
 *   Okuma (inbox, detay) ve diğer rollerin karar yetkisi DEĞİŞMEZ.
 * CLF-O0-01 (owner GO 2026-09-10): PR-1.3 domain-owned kapısı genel kutunun DÖRT karar rotasında da çalışır → FD
 *   talebi genel kutudan HİÇBİR karar almaz (request-revision dahil; herkes 409 DOMAIN_ACTION_REQUIRED, kapı rol
 *   denetiminden ÖNCE). Bu yüzden FD satırı VIEWER_REACH'ten çıktı; VIEWER sınırı FD dışı türlerde ve FD domain
 *   yollarında (ofis / içerik onayı) DEĞİŞMEDİ.
 * FD İPTAL SINIRI (owner GO 2026-09-10, ikinci GO): genel kutu `cancel` da kapıyı çağırır — talep sahibi 409
 *   DOMAIN_ACTION_REQUIRED, talep sahibi olmayan bugünkü gibi 403 (kimlik denetimi kapıdan ÖNCE); FD dışı iptal
 *   DEĞİŞMEDİ. Genel kutu rotaları controller metadata'sından KEŞFEDİLİR: yeni bir yazma rotası FD kapısı kanıtlanmadan
 *   geçemez. Önceden TÜKETİLMİŞ FD taleplerinin kurtarılması bu işin DIŞINDADIR (aşağıdaki karakterizasyon açık kalemi
 *   belgeler; yeni geri çekme akışı / veri değişikliği YOK).
 *
 * Giriş yolları (gerçek controller + gerçek servis, sahte prisma):
 *   - POST /office-approvals/:id/{approve, reject, request-revision, approve-with-changes, cancel} + GET inbox/mine/:id
 *   - POST /collection-dispositions/:id/approve (DispositionPostingService → OfficeApprovalService.approve)
 *   - POST /client-financial-disclosures/:id/complete-office-approval (FD servisi talebi DOĞRUDAN APPROVED yapar)
 *   - POST /client-financial-disclosures/:id/complete-content-approval (FD dört-göz içerik onayı)
 *   - POST /client-financial-disclosures/:id/{reconcile-consumed-office-approval, request-office-approval} (FD kurtarma /
 *     yeniden talep — yalnız karakterizasyon)
 *
 * Kanıt sınıfı: TEST (kontrollü Nest app, sahte kullanıcı/talep satırları). PRODUCTION DAVRANIŞ KANITI DEĞİLDİR.
 */
import {
  CanActivate,
  ExecutionContext,
  INestApplication,
  Injectable,
  RequestMethod,
  UnauthorizedException,
} from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { Test } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import * as request from 'supertest';

jest.mock('../../client-financial-disclosure/client-financial-disclosure-writer.service', () => ({
  ...jest.requireActual('../../client-financial-disclosure/client-financial-disclosure-writer.service'),
  // Snapshot tazeliği bu testin konusu değil: kalıcı snapshot doğrulaması MATCH kabul edilir.
  verifyPersistedDisclosureSnapshot: jest.fn().mockResolvedValue({ verdict: 'MATCH' }),
}));

import { OfficeApprovalController } from '../office-approval.controller';
import { OfficeApprovalService } from '../office-approval.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PrismaService } from '../../../prisma/prisma.service';
import { DispositionController } from '../../client-settlement/disposition.controller';
import { DispositionPostingService } from '../../client-settlement/disposition-posting.service';
import { ClientSettlementReadService } from '../../client-settlement/client-settlement-read.service';
import { DistributionRecommendationService } from '../../client-settlement/distribution-recommendation.service';
import { ClientFinancialDisclosureCommandService } from '../../client-settlement/client-financial-disclosure-command.service';
import { ClientFinancialDisclosureController } from '../../client-financial-disclosure/client-financial-disclosure.controller';
import { ClientFinancialDisclosureApprovalService } from '../../client-financial-disclosure/client-financial-disclosure-approval.service';
import { ClientFinancialDisclosurePublicationService } from '../../client-financial-disclosure/client-financial-disclosure-publication.service';
import { ClientFinancialDisclosureOfficeService } from '../../client-financial-disclosure/client-financial-disclosure-office-service';
import {
  CLIENT_FINANCIAL_DISCLOSURE_APPROVAL_INTENT_CONTRACT_VERSION,
  CLIENT_FINANCIAL_DISCLOSURE_APPROVAL_TARGET_TYPE,
  CLIENT_FINANCIAL_DISCLOSURE_APPROVE_ACTION_CODE,
} from '../../client-financial-disclosure/client-financial-disclosure-approval.contract';
import { stableJsonHash } from '../../permission-diagnostics/guided-edge/canonical-json';

const TENANT = 'tenant-A';
const REQUESTER = 'u-req';
const RECIPIENT = 'alici@example.test'; // TEST-ONLY; içerik onayı gönderim YAPMAZ
const DENIED = 'OFFICE_APPROVAL_DECISION_DENIED_VIEWER';
const FD_DENIED = 'DISCLOSURE_APPROVAL_NOT_ELIGIBLE';
const WRITE_FLAG = 'CLIENT_FINANCIAL_DISCLOSURE_WRITE_ENABLED';

type Role = 'ADMIN' | 'USER' | 'VIEWER';
type Lawyer = { lawyerRank: string; canApproveOfficeActions: boolean };
type ActorRow = { id: string; role: Role; tokenRole?: Role; lawyer: Lawyer | null };
type Row = Record<string, any>;

const PARTNER: Lawyer = { lawyerRank: 'PARTNER', canApproveOfficeActions: false };
const MANAGER: Lawyer = { lawyerRank: 'MANAGER', canApproveOfficeActions: false };
const DELEGATE: Lawyer = { lawyerRank: 'AUTHORIZED', canApproveOfficeActions: true };

/** TEST-ONLY aktörler. `role` = DB rolü (karar kaynağı); `tokenRole` yalnız istek üzerindeki rolü taklit eder. */
const ACTORS: Record<string, ActorRow> = {
  'viewer-partner': { id: 'u-vp', role: 'VIEWER', lawyer: PARTNER },
  'viewer-manager': { id: 'u-vm', role: 'VIEWER', lawyer: MANAGER },
  'viewer-delegate': { id: 'u-vd', role: 'VIEWER', lawyer: DELEGATE },
  // İstekte rolü USER görünen, DB rolü VIEWER olan kullanıcı: kararı DB rolü belirler.
  'token-user-db-viewer': { id: 'u-tv', role: 'VIEWER', tokenRole: 'USER', lawyer: PARTNER },
  viewer: { id: 'u-v', role: 'VIEWER', lawyer: null },
  partner: { id: 'u-p', role: 'USER', lawyer: PARTNER },
  manager: { id: 'u-m', role: 'USER', lawyer: MANAGER },
  delegate: { id: 'u-d', role: 'USER', lawyer: DELEGATE },
  'admin-partner': { id: 'u-ap', role: 'ADMIN', lawyer: PARTNER },
  requester: { id: REQUESTER, role: 'USER', lawyer: null },
};

/** TEST-ONLY JWT yerine geçen guard: `x-test-actor` başlığı → `request.user`. */
@Injectable()
class TestActorGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const actor = ACTORS[req.headers['x-test-actor'] as string];
    if (!actor) throw new UnauthorizedException();
    req.user = { id: actor.id, tenantId: TENANT, role: actor.tokenRole ?? actor.role };
    return true;
  }
}

// ── Bellek içi kayıtlar (her testte yeniden kurulur) ─────────────────────────────────────────────
const db = { requests: new Map<string, Row>(), versions: new Map<string, Row>() };

const matches = (row: Row, where: Row): boolean =>
  Object.entries(where).every(([key, expected]) => {
    if (expected && typeof expected === 'object' && !(expected instanceof Date) && 'not' in expected) {
      return row[key] !== expected.not;
    }
    return row[key] === expected;
  });

const pendingRequest = (id: string, actionCode: string, over: Row = {}): Row => {
  const savedIntent = { kind: actionCode, ref: id };
  return {
    id,
    tenantId: TENANT,
    actionCode,
    targetType: 'LegalCase',
    targetRef: `case-${id}`,
    requesterUserId: REQUESTER,
    approverUserId: null,
    status: 'PENDING_APPROVAL',
    executionStatus: 'NOT_RUN',
    savedIntent,
    payloadHash: stableJsonHash(savedIntent),
    replacementSavedIntent: null,
    replacementPayloadHash: null,
    reason: null,
    decisionNote: null,
    idempotencyKey: null,
    createdAt: new Date('2026-09-10T08:00:00.000Z'),
    decidedAt: null,
    executedAt: null,
    expiresAt: null,
    ...over,
  };
};

const VERSION_OFFICE = 'fdv-office'; // OFFICE_APPROVAL_PENDING — ofis onayı bekliyor
const VERSION_CONTENT = 'fdv-content'; // CONTENT_APPROVAL_PENDING — ofis onayı (manager) verilmiş, içerik onayı bekliyor
const FD_REQ_OFFICE = 'oar-fd-office';
const FD_REQ_DONE = 'oar-fd-done';
const OFFICE_APPROVED_AT = new Date('2026-09-10T09:00:00.000Z');

const fdIntent = (versionId: string) => ({
  contractVersion: CLIENT_FINANCIAL_DISCLOSURE_APPROVAL_INTENT_CONTRACT_VERSION,
  tenantId: TENANT,
  disclosureId: 'fd-root',
  disclosureVersionId: versionId,
  version: 1,
  snapshotHash: 'snap-1',
});

const fdRequest = (id: string, versionId: string, over: Row = {}): Row =>
  pendingRequest(id, CLIENT_FINANCIAL_DISCLOSURE_APPROVE_ACTION_CODE, {
    targetType: CLIENT_FINANCIAL_DISCLOSURE_APPROVAL_TARGET_TYPE,
    targetRef: versionId,
    savedIntent: fdIntent(versionId),
    payloadHash: stableJsonHash(fdIntent(versionId)),
    ...over,
  });

const fdVersion = (id: string, over: Row = {}): Row => ({
  id,
  tenantId: TENANT,
  disclosureId: 'fd-root',
  version: 1,
  status: 'OFFICE_APPROVAL_PENDING',
  snapshotHash: 'snap-1',
  currency: 'TRY',
  totalCollected: new Prisma.Decimal('1234.56'),
  clientNetAmount: new Prisma.Decimal('1000.00'),
  officeApprovalRequestId: null,
  officeApprovedById: null,
  officeApprovedAt: null,
  contentApprovedById: null,
  contentApprovedAt: null,
  notificationContent: null,
  notificationContentHash: null,
  approvedRecipientEmail: null,
  approvedRecipientPortalUserId: null,
  publishedAt: null,
  supersedesVersionId: null,
  supersededAt: null,
  cancelledAt: null,
  reversedAt: null,
  correctionReason: null,
  supersededByVersion: null,
  lines: [
    { type: 'CONTRACTUAL_FEE_WITHHELD', amount: new Prisma.Decimal('234.56'), sortOrder: 1 },
    { type: 'CLIENT_PAYABLE', amount: new Prisma.Decimal('1000.00'), sortOrder: 2 },
  ],
  disclosure: { currentVersionId: null, case: { fileNumber: '2026/42' } },
  ...over,
});

const DISPOSITION = {
  id: 'disp-1',
  collectionId: 'col-1',
  caseId: 'case-1',
  beneficiaryScope: 'SINGLE_CASE_CLIENT',
  caseClientId: 'cc-1',
  totalAmount: new Prisma.Decimal('100.00'),
  currency: 'TRY',
  status: 'DISTRIBUTION_RECOMMENDED',
  approvalRequestId: 'oar-disp',
  approvedById: null,
  manualReversalRequiredAt: null,
};

/** Sahte prisma — yalnız bu yolların okuduğu/yazdığı şekiller; yazmalar bellek içi kayda uygulanır. */
const fakePrisma: any = {
  user: {
    findUnique: jest.fn(async ({ where }: { where: { id: string } }) => {
      const actor = Object.values(ACTORS).find((a) => a.id === where.id);
      if (!actor) return null;
      return {
        id: actor.id,
        role: actor.role,
        isActive: true,
        tenantId: TENANT,
        staffMember: null,
        lawyer: actor.lawyer ? { ...actor.lawyer, tenantId: TENANT, tckn: null, officeId: 'office-A' } : null,
      };
    }),
  },
  officeApprovalRequest: {
    findUnique: jest.fn(async ({ where }: { where: { id: string } }) =>
      db.requests.has(where.id) ? { ...db.requests.get(where.id) } : null,
    ),
    findFirst: jest.fn(async ({ where }: { where: Row }) => {
      const row = [...db.requests.values()].find((r) => matches(r, where));
      return row ? { ...row } : null;
    }),
    findMany: jest.fn(async ({ where }: { where: Row }) =>
      [...db.requests.values()].filter((r) => matches(r, where)).map((r) => ({ ...r })),
    ),
    updateMany: jest.fn(async ({ where, data }: { where: Row; data: Row }) => {
      const hit = [...db.requests.values()].filter((r) => matches(r, where));
      hit.forEach((r) => Object.assign(r, data));
      return { count: hit.length };
    }),
    // FD yeniden talep karakterizasyonu: yeni talep üretimi (yapılmamalı) kayda geçer, test çökmez.
    create: jest.fn(async ({ data }: { data: Row }) => ({ id: 'oar-yeni', ...data })),
  },
  collectionDisposition: {
    findFirst: jest.fn(async () => ({ ...DISPOSITION })),
    updateMany: jest.fn(async () => ({ count: 1 })),
  },
  clientFinancialDisclosureVersion: {
    findFirst: jest.fn(async ({ where }: { where: Row }) => {
      const row = [...db.versions.values()].find((v) => matches(v, where));
      return row ? { ...row } : null;
    }),
    updateMany: jest.fn(async ({ where, data }: { where: Row; data: Row }) => {
      const hit = [...db.versions.values()].filter((v) => matches(v, where));
      hit.forEach((v) => Object.assign(v, data));
      return { count: hit.length };
    }),
  },
  $executeRaw: jest.fn(async () => 1), // pg_advisory_xact_lock
};
fakePrisma.$transaction = jest.fn(async (fn: (tx: unknown) => unknown) => fn(fakePrisma));

const audit = { log: jest.fn(async (_entry: Record<string, unknown>) => undefined) };
const domainSync = { syncAfterDecision: jest.fn(async (_tx: unknown, _updated: unknown) => undefined) };

/** İçerik onayı fikstürü: içerik + hash servisin KENDİ `requestContentApproval` üreticisiyle üretilir (elle kopya YOK). */
async function produceSealedContent(): Promise<{ notificationContent: string; notificationContentHash: string }> {
  const officeApproved = fdVersion(VERSION_CONTENT, {
    status: 'OFFICE_APPROVED',
    officeApprovalRequestId: FD_REQ_DONE,
    officeApprovedById: ACTORS.manager.id,
    officeApprovedAt: OFFICE_APPROVED_AT,
  });
  const updateMany = jest.fn(async (_args: { data: Row }) => ({ count: 1 }));
  const tx = {
    $executeRaw: jest.fn(async () => 1),
    clientFinancialDisclosureVersion: { findFirst: jest.fn(async () => officeApproved), updateMany },
    user: { findUnique: jest.fn(async () => ({ id: REQUESTER, isActive: true, tenantId: TENANT })) },
  };
  const producer = new ClientFinancialDisclosureApprovalService({
    $transaction: (fn: (t: unknown) => unknown) => fn(tx),
  } as never);
  await producer.requestContentApproval({
    tenantId: TENANT,
    disclosureVersionId: VERSION_CONTENT,
    requesterUserId: REQUESTER,
    approvedRecipientEmail: RECIPIENT,
    approvedRecipientPortalUserId: null,
  } as never);
  const data = updateMany.mock.calls[0][0].data;
  return { notificationContent: data.notificationContent, notificationContentHash: data.notificationContentHash };
}

function seed(sealed: { notificationContent: string; notificationContentHash: string }): void {
  db.requests.clear();
  db.versions.clear();
  for (const r of [
    pendingRequest('oar-generic', 'CHANGE_STATUS'),
    pendingRequest('oar-payout', 'CLIENT_PAYOUT_POST', { targetType: 'ClientPayoutRequest', targetRef: 'payout-1' }),
    pendingRequest('oar-disp', 'COLLECTION_DISPOSITION_POST', { targetType: 'CollectionDisposition', targetRef: 'disp-1' }),
    fdRequest('oar-fd-generic', 'fdv-generic'),
    fdRequest(FD_REQ_OFFICE, VERSION_OFFICE),
    fdRequest(FD_REQ_DONE, VERSION_CONTENT, {
      status: 'APPROVED',
      approverUserId: ACTORS.manager.id,
      decidedAt: OFFICE_APPROVED_AT,
    }),
  ]) {
    db.requests.set(r.id, r);
  }
  db.versions.set(VERSION_OFFICE, fdVersion(VERSION_OFFICE, { officeApprovalRequestId: FD_REQ_OFFICE }));
  db.versions.set(
    VERSION_CONTENT,
    fdVersion(VERSION_CONTENT, {
      status: 'CONTENT_APPROVAL_PENDING',
      officeApprovalRequestId: FD_REQ_DONE,
      officeApprovedById: ACTORS.manager.id,
      officeApprovedAt: OFFICE_APPROVED_AT,
      notificationContent: sealed.notificationContent,
      notificationContentHash: sealed.notificationContentHash,
      approvedRecipientEmail: RECIPIENT,
      approvedRecipientPortalUserId: null,
    }),
  );
}

const DECISIONS = [
  { name: 'approve', body: { note: 'uygun' }, status: 'APPROVED', audit: 'OFFICE_APPROVAL_APPROVED' },
  { name: 'reject', body: { note: 'gerekce' }, status: 'REJECTED', audit: 'OFFICE_APPROVAL_REJECTED' },
  { name: 'request-revision', body: { note: 'duzeltme' }, status: 'REVISION_REQUESTED', audit: 'OFFICE_APPROVAL_REVISION_REQUESTED' },
  {
    name: 'approve-with-changes',
    body: { replacementSavedIntent: { kind: 'degistirilmis' }, note: 'degisiklikle' },
    status: 'APPROVED_WITH_CHANGES',
    audit: 'OFFICE_APPROVAL_APPROVED_WITH_CHANGES',
  },
];
const ALL_DECISIONS = DECISIONS.map((d) => d.name);

/** Değişmemiş kodda karar yüklemini GEÇEN bağlı VIEWER'lar — her talep türünün ölçülen yüklem kuralına göre. */
const VIEWER_REACH = [
  {
    requestId: 'oar-generic',
    title: 'CHANGE_STATUS — isApproverEligible (PARTNER ∨ delege)',
    viewers: ['viewer-partner', 'viewer-delegate', 'token-user-db-viewer'],
    decisions: ALL_DECISIONS,
  },
  {
    requestId: 'oar-payout',
    title: 'CLIENT_PAYOUT_POST — PayoutApprovalPolicy (PARTNER ∨ MANAGER ∨ delege)',
    viewers: ['viewer-partner', 'viewer-manager', 'viewer-delegate'],
    decisions: ALL_DECISIONS,
  },
  // CLF-O0-01: FD talebi (oar-fd-generic) hiçbir genel karar rotasında karar yüklemine ULAŞMAZ — bkz. FD_GENERIC_ACTORS.
];

const PERMITTED = [
  { requestId: 'oar-generic', title: 'CHANGE_STATUS', actors: ['partner', 'delegate', 'admin-partner'] },
  { requestId: 'oar-payout', title: 'CLIENT_PAYOUT_POST', actors: ['manager', 'partner'] },
];

/** CLF-O0-01: FD talebinde genel kutu karar VERDİRMEZ — FD politikasınca uygun, talep sahibi ve bağlı VIEWER aynı yanıtı alır. */
const FD_GENERIC_ACTORS = [
  'manager',
  'partner',
  'delegate',
  'admin-partner',
  'requester',
  'viewer-partner',
  'viewer-manager',
  'viewer-delegate',
];

describe('VIEWER ONAY KARARI SINIRI — gerçek HTTP giriş yolları', () => {
  let app: INestApplication;
  let previousFlag: string | undefined;
  let sealed: { notificationContent: string; notificationContentHash: string };

  const approvalService = new OfficeApprovalService(fakePrisma, audit as never, domainSync as never);
  const postingService = new DispositionPostingService(fakePrisma, approvalService, {} as never);
  const fdApprovalService = new ClientFinancialDisclosureApprovalService(fakePrisma);

  beforeAll(async () => {
    previousFlag = process.env[WRITE_FLAG];
    process.env[WRITE_FLAG] = 'true';
    sealed = await produceSealedContent();
    const moduleRef = await Test.createTestingModule({
      controllers: [OfficeApprovalController, DispositionController, ClientFinancialDisclosureController],
      providers: [
        { provide: OfficeApprovalService, useValue: approvalService },
        { provide: DispositionPostingService, useValue: postingService },
        { provide: PrismaService, useValue: fakePrisma },
        { provide: ClientSettlementReadService, useValue: {} },
        { provide: DistributionRecommendationService, useValue: {} },
        { provide: ClientFinancialDisclosureCommandService, useValue: {} },
        { provide: ClientFinancialDisclosureApprovalService, useValue: fdApprovalService },
        { provide: ClientFinancialDisclosurePublicationService, useValue: {} },
        { provide: ClientFinancialDisclosureOfficeService, useValue: {} },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useClass(TestActorGuard)
      .compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    if (previousFlag === undefined) delete process.env[WRITE_FLAG];
    else process.env[WRITE_FLAG] = previousFlag;
  });

  beforeEach(() => {
    seed(sealed);
    jest.clearAllMocks();
  });

  const post = (path: string, actor: string, body: object) =>
    request(app.getHttpServer()).post(path).set('x-test-actor', actor).send(body);
  const get = (path: string, actor: string) => request(app.getHttpServer()).get(path).set('x-test-actor', actor);

  /** Genel karar yolu: ret halinde karar transaction'ı AÇILMAZ; talep satırı, domain senkronu ve audit dokunulmaz. */
  const expectNoDecisionWrites = (requestId: string) => {
    expect(fakePrisma.$transaction).not.toHaveBeenCalled();
    expect(fakePrisma.officeApprovalRequest.updateMany).not.toHaveBeenCalled();
    expect(domainSync.syncAfterDecision).not.toHaveBeenCalled();
    expect(audit.log).not.toHaveBeenCalled();
    expect(db.requests.get(requestId)).toMatchObject({
      status: 'PENDING_APPROVAL',
      approverUserId: null,
      decidedAt: null,
      decisionNote: null,
    });
  };

  describe.each(VIEWER_REACH)('POST /office-approvals/:id/* — $title', ({ requestId, viewers, decisions }) => {
    describe.each(DECISIONS.filter((d) => decisions.includes(d.name)))('$name', (d) => {
      it.each(viewers)(`bağlı VIEWER %s → 403 ${DENIED}; karar kaydı / domain senkronu / audit YOK`, async (actor) => {
        const res = await post(`/office-approvals/${requestId}/${d.name}`, actor, d.body);
        expect(res.status).toBe(403);
        expect(res.body.code).toBe(DENIED);
        expectNoDecisionWrites(requestId);
      });
    });
  });

  describe.each(PERMITTED)('izinli aktörler DEĞİŞMEDİ — $title', ({ requestId, actors }) => {
    describe.each(DECISIONS)('$name', (d) => {
      it.each(actors)(`%s → 201 ${d.status}; karar kaydı + domain senkronu + audit birer kez`, async (actor) => {
        const res = await post(`/office-approvals/${requestId}/${d.name}`, actor, d.body);
        expect(res.status).toBe(201);
        expect(res.body.data).toMatchObject({ id: requestId, status: d.status });
        expect(db.requests.get(requestId)).toMatchObject({ status: d.status, approverUserId: ACTORS[actor].id });
        expect(fakePrisma.officeApprovalRequest.updateMany).toHaveBeenCalledTimes(1);
        expect(domainSync.syncAfterDecision).toHaveBeenCalledTimes(1);
        expect(audit.log).toHaveBeenCalledTimes(1);
        expect(audit.log.mock.calls[0][0]).toMatchObject({ action: d.audit, userId: ACTORS[actor].id });
      });
    });
  });

  describe('değişmeyen retler (kontrol)', () => {
    it('bağsız VIEWER → 403; yazma YOK', async () => {
      const res = await post('/office-approvals/oar-generic/approve', 'viewer', { note: 'uygun' });
      expect(res.status).toBe(403);
      expectNoDecisionWrites('oar-generic');
    });

    it('USER + MANAGER genel talebi (CHANGE_STATUS) onaylayamaz → 403 (rütbe kuralı DEĞİŞMEDİ)', async () => {
      const res = await post('/office-approvals/oar-generic/approve', 'manager', { note: 'uygun' });
      expect(res.status).toBe(403);
      expectNoDecisionWrites('oar-generic');
    });

    it('FD talebi genel kutudan onaylanamaz → 409 DOMAIN_ACTION_REQUIRED (PR-1.3 DEĞİŞMEDİ)', async () => {
      const res = await post('/office-approvals/oar-fd-generic/approve', 'manager', { note: 'uygun' });
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('DOMAIN_ACTION_REQUIRED');
      expectNoDecisionWrites('oar-fd-generic');
    });
  });

  describe.each(DECISIONS)(
    'PR-1.3 + CLF-O0-01 — FD talebi genel kutudan HİÇBİR karar almaz: POST /office-approvals/:id/$name',
    (d) => {
      it.each(FD_GENERIC_ACTORS)('%s → 409 DOMAIN_ACTION_REQUIRED; karar kaydı / domain senkronu / audit YOK', async (actor) => {
        const res = await post(`/office-approvals/oar-fd-generic/${d.name}`, actor, d.body);
        expect(res.status).toBe(409);
        expect(res.body.code).toBe('DOMAIN_ACTION_REQUIRED');
        expectNoDecisionWrites('oar-fd-generic');
      });
    },
  );

  // ── FD İPTAL SINIRI (owner GO 2026-09-10, ikinci GO) ───────────────────────────────────────────────────────────
  describe('FD İPTAL SINIRI — POST /office-approvals/:id/cancel', () => {
    const FD_NON_REQUESTERS = FD_GENERIC_ACTORS.filter((a) => a !== 'requester');

    it('talep sahibi → 409 DOMAIN_ACTION_REQUIRED; iptal / domain senkronu / audit YOK, talep PENDING kalır', async () => {
      const res = await post('/office-approvals/oar-fd-generic/cancel', 'requester', {});
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('DOMAIN_ACTION_REQUIRED');
      expectNoDecisionWrites('oar-fd-generic');
    });

    it.each(FD_NON_REQUESTERS)(
      'talep sahibi OLMAYAN %s → bugünkü gibi 403 (kimlik denetimi kapıdan ÖNCE; 409 değil); yazma YOK',
      async (actor) => {
        const res = await post('/office-approvals/oar-fd-generic/cancel', actor, {});
        expect(res.status).toBe(403);
        expect(res.body.code).not.toBe('DOMAIN_ACTION_REQUIRED');
        expectNoDecisionWrites('oar-fd-generic');
      },
    );

    it('FD DIŞI (CHANGE_STATUS) talep sahibi → 201 CANCELLED; iptal + domain senkronu + audit birer kez (DEĞİŞMEDİ)', async () => {
      const res = await post('/office-approvals/oar-generic/cancel', 'requester', {});
      expect(res.status).toBe(201);
      expect(res.body.data).toMatchObject({ id: 'oar-generic', status: 'CANCELLED' });
      expect(fakePrisma.officeApprovalRequest.updateMany).toHaveBeenCalledTimes(1);
      expect(domainSync.syncAfterDecision).toHaveBeenCalledTimes(1);
      expect(audit.log).toHaveBeenCalledTimes(1);
      expect(audit.log.mock.calls[0][0]).toMatchObject({ action: 'OFFICE_APPROVAL_CANCELLED', userId: REQUESTER });
    });

    it('FD DIŞI (CHANGE_STATUS) talep sahibi olmayan → 403 (DEĞİŞMEDİ); yazma YOK', async () => {
      const res = await post('/office-approvals/oar-generic/cancel', 'partner', {});
      expect(res.status).toBe(403);
      expectNoDecisionWrites('oar-generic');
    });

    it('uçtan uca: geri çekme denemesi 409; talep PENDING kalır ve FD domain yolu sürümü ilerletir (kilit YOK)', async () => {
      const cancel = await post(`/office-approvals/${FD_REQ_OFFICE}/cancel`, 'requester', {});
      const complete = await post(`/client-financial-disclosures/${VERSION_OFFICE}/complete-office-approval`, 'manager', {
        approvalRequestId: FD_REQ_OFFICE,
      });
      expect({
        cancel: [cancel.status, cancel.body.code ?? cancel.body.data?.status],
        complete: [complete.status, complete.body.status ?? complete.body.code],
        request: db.requests.get(FD_REQ_OFFICE)?.status,
        version: db.versions.get(VERSION_OFFICE)?.status,
      }).toEqual({
        cancel: [409, 'DOMAIN_ACTION_REQUIRED'],
        complete: [201, 'OFFICE_APPROVED'],
        request: 'APPROVED',
        version: 'OFFICE_APPROVED',
      });
      expect(audit.log).not.toHaveBeenCalledWith(expect.objectContaining({ action: 'OFFICE_APPROVAL_CANCELLED' }));
    });
  });

  describe('önceden TÜKETİLMİŞ FD talebi (ör. bu sınırdan önce genel kutudan iptal) — AÇIK KALEM; bu iş kurtarmaz, veri değiştirmez', () => {
    it('CANCELLED talebe bağlı sürüm FD yollarıyla ilerlemez: complete → REQUEST_CONSUMED, reconcile → UNSUPPORTED_CONSUMED_DECISION, yeniden talep → yeni kayıt YOK', async () => {
      Object.assign(db.requests.get(FD_REQ_OFFICE) as Row, { status: 'CANCELLED', decidedAt: new Date('2026-09-01T10:00:00.000Z') });
      const complete = await post(`/client-financial-disclosures/${VERSION_OFFICE}/complete-office-approval`, 'manager', {
        approvalRequestId: FD_REQ_OFFICE,
      });
      const reconcile = await post(`/client-financial-disclosures/${VERSION_OFFICE}/reconcile-consumed-office-approval`, 'manager', {});
      await post(`/client-financial-disclosures/${VERSION_OFFICE}/request-office-approval`, 'requester', {});
      expect({ complete: [complete.status, complete.body.code], reconcile: [reconcile.status, reconcile.body.code] }).toEqual({
        complete: [409, 'DISCLOSURE_APPROVAL_REQUEST_CONSUMED'],
        reconcile: [409, 'DISCLOSURE_APPROVAL_UNSUPPORTED_CONSUMED_DECISION'],
      });
      expect(fakePrisma.officeApprovalRequest.create).not.toHaveBeenCalled();
      expect(db.versions.get(VERSION_OFFICE)).toMatchObject({
        status: 'OFFICE_APPROVAL_PENDING',
        officeApprovalRequestId: FD_REQ_OFFICE,
        officeApprovedById: null,
      });
      expect(db.requests.get(FD_REQ_OFFICE)).toMatchObject({ status: 'CANCELLED' });
    });
  });

  describe("genel kutu × FD — TÜM rotalar controller metadata'sından keşfedilir (yeni kardeş uç sessizce geçemez)", () => {
    /** Bilinen yazma rotaları ve geçerli gövdeleri. Yeni bir rota bu tabloya eklenmeden (ve FD kapısı kanıtlanmadan) geçemez. */
    const WRITE_ROUTE_BODIES: Record<string, object> = {
      ':id/approve': { note: 'uygun' },
      ':id/reject': { note: 'gerekce' },
      ':id/request-revision': { note: 'duzeltme' },
      ':id/approve-with-changes': { replacementSavedIntent: { kind: 'degistirilmis' }, note: 'degisiklikle' },
      ':id/cancel': {},
    };
    const routes = Object.getOwnPropertyNames(OfficeApprovalController.prototype)
      .filter((name) => name !== 'constructor')
      .map((name) => {
        const handler = (OfficeApprovalController.prototype as unknown as Record<string, object>)[name];
        return {
          name,
          method: Reflect.getMetadata(METHOD_METADATA, handler) as RequestMethod | undefined,
          path: Reflect.getMetadata(PATH_METADATA, handler) as string | undefined,
        };
      })
      .filter((r) => r.method !== undefined);
    const writeRoutes = routes.filter((r) => r.method !== RequestMethod.GET);
    const readRoutes = routes.filter((r) => r.method === RequestMethod.GET);

    it('yazma rotası kümesi = bilinen beş rota; okuma rotaları = inbox / mine / :id (yeni rota → FD kapısını kanıtla, tabloya ekle)', () => {
      expect(writeRoutes.map((r) => r.path).sort()).toEqual(Object.keys(WRITE_ROUTE_BODIES).sort());
      expect(writeRoutes.every((r) => r.method === RequestMethod.POST)).toBe(true);
      expect(readRoutes.map((r) => r.path).sort()).toEqual([':id', 'inbox', 'mine']);
    });

    it.each(Object.keys(WRITE_ROUTE_BODIES))(
      'POST %s — FD talebinde HİÇBİR aktör yazma üretemez (409 domain kapısı / 403 kimlik)',
      async (routePath) => {
        for (const actor of FD_GENERIC_ACTORS) {
          seed(sealed);
          jest.clearAllMocks();
          const res = await post(`/office-approvals/${routePath.replace(':id', 'oar-fd-generic')}`, actor, WRITE_ROUTE_BODIES[routePath]);
          expect({ actor, status: res.status, allowed: [403, 409].includes(res.status) }).toMatchObject({ actor, allowed: true });
          expectNoDecisionWrites('oar-fd-generic');
        }
      },
    );

    it.each(['inbox', 'mine', ':id'])('GET %s — FD talebi okunurken yazma YOK', async (routePath) => {
      for (const actor of FD_GENERIC_ACTORS) {
        jest.clearAllMocks();
        await get(`/office-approvals/${routePath.replace(':id', 'oar-fd-generic')}`, actor);
        expect(fakePrisma.$transaction).not.toHaveBeenCalled();
        expect(fakePrisma.officeApprovalRequest.updateMany).not.toHaveBeenCalled();
        expect(audit.log).not.toHaveBeenCalled();
      }
    });
  });

  describe('OKUMA DEĞİŞMEDİ — bağlı VIEWER inbox ve detayı bugünkü gibi görür', () => {
    it.each(['viewer-partner', 'viewer-delegate'])('GET /office-approvals/inbox (%s) → 200, bekleyen talepler listelenir', async (actor) => {
      const res = await get('/office-approvals/inbox', actor);
      expect(res.status).toBe(200);
      expect(res.body.data.map((r: { id: string }) => r.id)).toEqual(expect.arrayContaining(['oar-generic', 'oar-payout']));
    });

    it.each(['viewer-partner', 'viewer-delegate'])('GET /office-approvals/oar-generic (%s) → 200 detay', async (actor) => {
      const res = await get('/office-approvals/oar-generic', actor);
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ id: 'oar-generic', status: 'PENDING_APPROVAL' });
    });

    it('bağsız VIEWER inbox → boş liste (değişmedi)', async () => {
      const res = await get('/office-approvals/inbox', 'viewer');
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
    });
  });

  describe('POST /collection-dispositions/:id/approve — dağıtım onayı OfficeApprovalService.approve üzerinden', () => {
    it.each(['viewer-partner', 'viewer-delegate'])(
      `bağlı VIEWER %s → 403 ${DENIED}; onay talebi PENDING kalır, dağıtım/karar yazılmaz`,
      async (actor) => {
        const res = await post('/collection-dispositions/disp-1/approve', actor, { note: 'uygun' });
        expect(res.status).toBe(403);
        expect(res.body.code).toBe(DENIED);
        expectNoDecisionWrites('oar-disp');
        expect(fakePrisma.collectionDisposition.updateMany).not.toHaveBeenCalled();
      },
    );

    it('partner (USER) → 201; karar kaydı + domain senkronu + audit (değişmedi)', async () => {
      const res = await post('/collection-dispositions/disp-1/approve', 'partner', { note: 'uygun' });
      expect(res.status).toBe(201);
      expect(res.body.data).toMatchObject({ approved: true, approvalRequestId: 'oar-disp' });
      expect(db.requests.get('oar-disp')).toMatchObject({ status: 'APPROVED', approverUserId: ACTORS.partner.id });
      expect(domainSync.syncAfterDecision).toHaveBeenCalledTimes(1);
      expect(audit.log).toHaveBeenCalledTimes(1);
    });
  });

  describe('POST /client-financial-disclosures/:id/complete-office-approval — FD servisi talebi DOĞRUDAN karara bağlar', () => {
    const path = `/client-financial-disclosures/${VERSION_OFFICE}/complete-office-approval`;

    it.each(['viewer-partner', 'viewer-manager', 'viewer-delegate'])(
      `bağlı VIEWER %s → 403 ${FD_DENIED}; sürüm ve talep yazılmaz`,
      async (actor) => {
        const res = await post(path, actor, { approvalRequestId: FD_REQ_OFFICE });
        expect(res.status).toBe(403);
        expect(res.body.code).toBe(FD_DENIED);
        expect(fakePrisma.clientFinancialDisclosureVersion.updateMany).not.toHaveBeenCalled();
        expect(fakePrisma.officeApprovalRequest.updateMany).not.toHaveBeenCalled();
        expect(db.versions.get(VERSION_OFFICE)).toMatchObject({ status: 'OFFICE_APPROVAL_PENDING', officeApprovedById: null });
        expect(db.requests.get(FD_REQ_OFFICE)).toMatchObject({ status: 'PENDING_APPROVAL', approverUserId: null });
      },
    );

    it('manager (USER) → 201 OFFICE_APPROVED; sürüm + talep aynı transaction içinde (değişmedi)', async () => {
      const res = await post(path, 'manager', { approvalRequestId: FD_REQ_OFFICE });
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ status: 'OFFICE_APPROVED', replayed: false });
      expect(db.versions.get(VERSION_OFFICE)).toMatchObject({ status: 'OFFICE_APPROVED', officeApprovedById: ACTORS.manager.id });
      expect(db.requests.get(FD_REQ_OFFICE)).toMatchObject({ status: 'APPROVED', approverUserId: ACTORS.manager.id });
    });
  });

  describe('POST /client-financial-disclosures/:id/complete-content-approval — FD dört-göz içerik onayı', () => {
    const path = `/client-financial-disclosures/${VERSION_CONTENT}/complete-content-approval`;

    it.each(['viewer-partner', 'viewer-manager', 'viewer-delegate'])(
      `bağlı VIEWER %s → 403 ${FD_DENIED}; sürüm yazılmaz`,
      async (actor) => {
        const res = await post(path, actor, {});
        expect(res.status).toBe(403);
        expect(res.body.code).toBe(FD_DENIED);
        expect(fakePrisma.clientFinancialDisclosureVersion.updateMany).not.toHaveBeenCalled();
        expect(db.versions.get(VERSION_CONTENT)).toMatchObject({ status: 'CONTENT_APPROVAL_PENDING', contentApprovedById: null });
      },
    );

    it('delegate (USER; talep sahibinden ve ofis onaylayıcısından farklı) → 201 CONTENT_APPROVED (değişmedi)', async () => {
      const res = await post(path, 'delegate', {});
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ status: 'CONTENT_APPROVED', replayed: false });
      expect(db.versions.get(VERSION_CONTENT)).toMatchObject({ status: 'CONTENT_APPROVED', contentApprovedById: ACTORS.delegate.id });
    });
  });
});
