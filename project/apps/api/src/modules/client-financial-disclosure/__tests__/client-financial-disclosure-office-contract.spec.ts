/** @jest-environment node */
import { ClientFinancialDisclosureStatus } from '@prisma/client';
import {
  CLIENT_FINANCIAL_DISCLOSURE_PUBLICATION_FLAG,
  CLIENT_FINANCIAL_DISCLOSURE_WRITE_FLAG,
} from '../client-financial-disclosure-activation';
import {
  OFFICE_DISCLOSURE_FORBIDDEN_FIELDS,
  OFFICE_DISCLOSURE_STATUSES,
  OfficeDisclosureProjectionForbiddenError,
  OfficeDisclosureProjectionNotFoundError,
  assertOfficeDisclosureProjectionSafe,
} from '../client-financial-disclosure-office-contract';
import { ClientFinancialDisclosureOfficeService } from '../client-financial-disclosure-office-service';

const T = 'tenant-a';
const U = 'user-a';
const C = 'client-a';
const K = 'case-a';
const CC = 'case-client-a';
const D = 'disclosure-a';
const V = 'version-a';

const partner = {
  id: U,
  isActive: true,
  tenantId: T,
  lawyer: { lawyerRank: 'PARTNER', canApproveOfficeActions: false },
};

const staff = {
  id: U,
  isActive: true,
  tenantId: T,
  lawyer: null,
};

function version(status: ClientFinancialDisclosureStatus = ClientFinancialDisclosureStatus.DRAFT) {
  const instant = new Date('2026-08-08T10:00:00.000Z');
  return {
    id: V,
    disclosureId: D,
    version: 1,
    status,
    currency: 'TRY',
    totalCollected: '2500.75',
    clientNetAmount: '1750.50',
    officeApprovalRequestId: status === 'DRAFT' ? null : 'approval-a',
    officeApprovedAt: status === 'DRAFT' ? null : instant,
    officeApprovedById: status === 'DRAFT' ? null : 'office-approver',
    contentApprovedAt: status === 'CONTENT_APPROVED' ? instant : null,
    contentApprovedById: status === 'CONTENT_APPROVED' ? 'content-approver' : null,
    sendRequestedAt:
      status === 'SEND_PENDING' || status === 'SEND_FAILED' || status === 'PUBLISHED'
        ? instant
        : null,
    providerMessageId: status === 'PUBLISHED' ? 'PROVIDER-SECRET-ID' : null,
    providerAcceptedAt: status === 'PUBLISHED' ? instant : null,
    sendFailureCode: status === 'SEND_FAILED' ? 'SMTP_RAW_FAILURE_CODE' : null,
    sendFailureDetail: status === 'SEND_FAILED' ? 'raw provider stack secret' : null,
    publishedAt: status === 'PUBLISHED' ? instant : null,
    supersedesVersionId: null,
    supersededAt: status === 'SUPERSEDED' ? instant : null,
    supersededByVersion: null,
    reversedAt: status === 'REVERSED' ? instant : null,
    correctionReason: null,
    cancelledAt: status === 'CANCELLED' ? instant : null,
    createdAt: instant,
    updatedAt: instant,
    lines: [
      { type: 'CONTRACTUAL_FEE_WITHHELD', amount: '750.25', sortOrder: 1 },
      { type: 'CLIENT_PAYABLE', amount: '1750.50', sortOrder: 0 },
    ],
    disclosure: {
      id: D,
      currentVersionId: V,
      case: { id: K, fileNumber: 'OFFICE-42' },
      caseClient: {
        client: {
          displayName: 'Example Client',
          firstName: null,
          lastName: null,
          companyName: null,
          name: null,
        },
      },
    },
  };
}

function buildPrisma(overrides?: {
  actor?: typeof partner | typeof staff | null;
  client?: { id: string } | null;
  caseClients?: Array<{ id: string }>;
  versions?: ReturnType<typeof version>[];
}) {
  const actorResult =
    overrides && Object.prototype.hasOwnProperty.call(overrides, 'actor')
      ? overrides.actor
      : partner;
  const clientResult =
    overrides && Object.prototype.hasOwnProperty.call(overrides, 'client')
      ? overrides.client
      : { id: C };
  const prisma = {
    user: { findFirst: jest.fn().mockResolvedValue(actorResult) },
    client: { findFirst: jest.fn().mockResolvedValue(clientResult) },
    caseClient: {
      findMany: jest.fn().mockResolvedValue(overrides?.caseClients ?? [{ id: CC }]),
    },
    clientFinancialDisclosureVersion: {
      findFirst: jest.fn().mockResolvedValue(overrides?.versions?.[0] ?? version()),
      findMany: jest.fn().mockResolvedValue(overrides?.versions ?? [version()]),
    },
    officeApprovalRequest: {
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'approval-a',
          targetRef: V,
          requesterUserId: 'requester-a',
          approverUserId: 'office-approver',
          createdAt: new Date('2026-08-08T10:00:00.000Z'),
          decidedAt: new Date('2026-08-08T10:01:00.000Z'),
        },
      ]),
    },
    collectionDisposition: { findMany: jest.fn().mockResolvedValue([]) },
    case: { findMany: jest.fn().mockResolvedValue([]) },
    auditLog: { findMany: jest.fn().mockResolvedValue([]) },
  };
  return prisma;
}

const originalWrite = process.env[CLIENT_FINANCIAL_DISCLOSURE_WRITE_FLAG];
const originalPublication = process.env[CLIENT_FINANCIAL_DISCLOSURE_PUBLICATION_FLAG];

describe('CODEX-X1 PRE01 — office financial disclosure contract', () => {
  beforeEach(() => {
    process.env[CLIENT_FINANCIAL_DISCLOSURE_WRITE_FLAG] = 'true';
    process.env[CLIENT_FINANCIAL_DISCLOSURE_PUBLICATION_FLAG] = 'true';
  });

  afterAll(() => {
    if (originalWrite === undefined) delete process.env[CLIENT_FINANCIAL_DISCLOSURE_WRITE_FLAG];
    else process.env[CLIENT_FINANCIAL_DISCLOSURE_WRITE_FLAG] = originalWrite;
    if (originalPublication === undefined) {
      delete process.env[CLIENT_FINANCIAL_DISCLOSURE_PUBLICATION_FLAG];
    } else {
      process.env[CLIENT_FINANCIAL_DISCLOSURE_PUBLICATION_FLAG] = originalPublication;
    }
  });

  it('11 canonical statüyü exact taşır; SENT ve FAILED üretmez', () => {
    expect(OFFICE_DISCLOSURE_STATUSES).toEqual([
      'DRAFT',
      'OFFICE_APPROVAL_PENDING',
      'OFFICE_APPROVED',
      'CONTENT_APPROVAL_PENDING',
      'CONTENT_APPROVED',
      'SEND_PENDING',
      'SEND_FAILED',
      'PUBLISHED',
      'CANCELLED',
      'SUPERSEDED',
      'REVERSED',
    ]);
    expect(OFFICE_DISCLOSURE_STATUSES).not.toContain('SENT');
    expect(OFFICE_DISCLOSURE_STATUSES).not.toContain('FAILED');
    expect([...OFFICE_DISCLOSURE_STATUSES].sort()).toEqual(
      Object.values(ClientFinancialDisclosureStatus).sort(),
    );
  });

  it('recursive guard internal/provider/raw alanları ve broad entity spreadini reddeder', () => {
    for (const field of OFFICE_DISCLOSURE_FORBIDDEN_FIELDS) {
      expect(() => assertOfficeDisclosureProjectionSafe({ nested: { [field]: 'secret' } })).toThrow(
        OfficeDisclosureProjectionForbiddenError,
      );
    }
    expect(() =>
      assertOfficeDisclosureProjectionSafe({
        item: { provider: { sendFailureDetail: 'raw provider stack secret' } },
      }),
    ).toThrow(OfficeDisclosureProjectionForbiddenError);
  });

  it('detail tenant+client+caseClient+case zincirini sorguda zorlar ve curated çıktı verir', async () => {
    const prisma = buildPrisma();
    const service = new ClientFinancialDisclosureOfficeService(prisma as any);
    const result = await service.getDetail(
      { tenantId: T, actorUserId: U, clientId: C, caseId: K },
      V,
    );

    expect(prisma.user.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: U, tenantId: T, isActive: true } }),
    );
    expect(prisma.client.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: C, tenantId: T } }),
    );
    expect(prisma.caseClient.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { clientId: C, case: { tenantId: T, id: K } },
      }),
    );
    expect(prisma.clientFinancialDisclosureVersion.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: V,
          tenantId: T,
          disclosure: expect.objectContaining({
            tenantId: T,
            caseClientId: { in: [CC] },
            caseId: K,
            case: { tenantId: T },
          }),
        }),
      }),
    );
    expect(result.lines).toEqual([
      { type: 'CLIENT_PAYABLE', amount: '1750.50' },
      { type: 'CONTRACTUAL_FEE_WITHHELD', amount: '750.25' },
    ]);
    expect(JSON.stringify(result)).not.toContain('PROVIDER-SECRET-ID');
    expect(JSON.stringify(result)).not.toContain('case-client-a');
    expect(() => assertOfficeDisclosureProjectionSafe(result)).not.toThrow();
  });

  it('var olmayan, cross-tenant/client/case/version durumlarını aynı object-scope 404 ile kapatır', async () => {
    const missingClient = buildPrisma({ client: null });
    await expect(
      new ClientFinancialDisclosureOfficeService(missingClient as any).getList({
        tenantId: T,
        actorUserId: U,
        clientId: 'foreign-client',
      }),
    ).rejects.toBeInstanceOf(OfficeDisclosureProjectionNotFoundError);

    const missingCase = buildPrisma({ caseClients: [] });
    await expect(
      new ClientFinancialDisclosureOfficeService(missingCase as any).getList({
        tenantId: T,
        actorUserId: U,
        clientId: C,
        caseId: 'foreign-case',
      }),
    ).rejects.toBeInstanceOf(OfficeDisclosureProjectionNotFoundError);

    const missingVersion = buildPrisma();
    missingVersion.clientFinancialDisclosureVersion.findFirst.mockResolvedValueOnce(null);
    await expect(
      new ClientFinancialDisclosureOfficeService(missingVersion as any).getDetail(
        { tenantId: T, actorUserId: U, clientId: C },
        'foreign-version',
      ),
    ).rejects.toBeInstanceOf(OfficeDisclosureProjectionNotFoundError);

    const inactiveOrForeignActor = buildPrisma({ actor: null });
    await expect(
      new ClientFinancialDisclosureOfficeService(inactiveOrForeignActor as any).getList({
        tenantId: T,
        actorUserId: 'foreign-user',
        clientId: C,
      }),
    ).rejects.toBeInstanceOf(OfficeDisclosureProjectionForbiddenError);
  });

  it('staff final approval/yayın capability alamaz; canonical approver aynı durumda alır', async () => {
    const staffPrisma = buildPrisma({ actor: staff, versions: [version(ClientFinancialDisclosureStatus.CONTENT_APPROVED)] });
    const staffDetail = await new ClientFinancialDisclosureOfficeService(staffPrisma as any).getDetail(
      { tenantId: T, actorUserId: U, clientId: C },
      V,
    );
    expect(staffDetail.actions.canPublish).toBe(false);
    expect(staffDetail.actions.canCompleteOfficeApproval).toBe(false);
    expect(staffDetail.actions.canCompleteContentApproval).toBe(false);

    const partnerPrisma = buildPrisma({
      actor: partner,
      versions: [version(ClientFinancialDisclosureStatus.CONTENT_APPROVED)],
    });
    const partnerDetail = await new ClientFinancialDisclosureOfficeService(
      partnerPrisma as any,
    ).getDetail({ tenantId: T, actorUserId: U, clientId: C }, V);
    expect(partnerDetail.actions.canPublish).toBe(true);
  });

  it('SEND_FAILED retry capability üretir fakat ham provider hata kodu/detayı sızdırmaz', async () => {
    const prisma = buildPrisma({ versions: [version(ClientFinancialDisclosureStatus.SEND_FAILED)] });
    const result = await new ClientFinancialDisclosureOfficeService(prisma as any).getDetail(
      { tenantId: T, actorUserId: U, clientId: C },
      V,
    );
    expect(result.actions.canRetryPublication).toBe(true);
    expect(result.delivery.state).toBe('FAILED_RETRY_AVAILABLE');
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain('SMTP_RAW_FAILURE_CODE');
    expect(serialized).not.toContain('raw provider stack secret');
  });

  it('preparation yüzeyi yalnız POSTED/SINGLE_CASE_CLIENT sorgular ve ham kaynak ID döndürmez', async () => {
    const prisma = buildPrisma();
    prisma.collectionDisposition.findMany.mockResolvedValueOnce([
      {
        id: 'internal-disposition-secret',
        postedAt: new Date('2026-08-08T08:00:00.000Z'),
        currency: 'TRY',
        totalAmount: '2500.75',
        caseId: K,
        clientFinancialDisclosures: [
          {
            id: D,
            currentVersionId: V,
            currentVersion: { id: V, status: ClientFinancialDisclosureStatus.DRAFT },
          },
        ],
      },
    ]);
    prisma.case.findMany.mockResolvedValueOnce([
      { id: K, fileNumber: 'OFFICE-42' },
    ]);
    const result = await new ClientFinancialDisclosureOfficeService(
      prisma as any,
    ).getPreparationSources({ tenantId: T, actorUserId: U, clientId: C });

    expect(prisma.collectionDisposition.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: T,
          status: 'POSTED',
          beneficiaryScope: 'SINGLE_CASE_CLIENT',
          caseClientId: { in: [CC] },
        }),
      }),
    );
    expect(result.items[0]?.existingDisclosure).toEqual({
      disclosureId: D,
      currentVersionId: V,
      status: 'DRAFT',
    });
    expect(result.items[0]?.preparationReference).toHaveLength(43);
    expect(JSON.stringify(result)).not.toContain('internal-disposition-secret');
  });

  it('current-effective liste ve ayrı history yüzeyi birleşmez', async () => {
    const current = version(ClientFinancialDisclosureStatus.PUBLISHED);
    const old = {
      ...version(ClientFinancialDisclosureStatus.SUPERSEDED),
      id: 'version-old',
      version: 0,
    };
    const prisma = buildPrisma({ versions: [current, old] });
    const service = new ClientFinancialDisclosureOfficeService(prisma as any);
    const list = await service.getList({ tenantId: T, actorUserId: U, clientId: C });
    const history = await service.getHistory(
      { tenantId: T, actorUserId: U, clientId: C },
      D,
    );
    expect(list.items).toHaveLength(1);
    expect(list.items[0]?.versionId).toBe(V);
    expect(list.items[0]?.isCurrentEffective).toBe(true);
    expect(history.surface).toBe('OFFICE_HISTORY');
    expect(history.items.map((item) => item.versionId)).toEqual([V, 'version-old']);
    expect(history.currentEffectiveVersionId).toBe(V);
  });

  it('salt-okunur projeksiyon duplicate send veya lifecycle mutation çağrısı üretmez', async () => {
    const prisma = buildPrisma({ versions: [version(ClientFinancialDisclosureStatus.SEND_FAILED)] });
    const service = new ClientFinancialDisclosureOfficeService(prisma as any);
    await service.getDetail({ tenantId: T, actorUserId: U, clientId: C }, V);
    expect((prisma as Record<string, unknown>).$transaction).toBeUndefined();
    expect(Object.keys(prisma)).not.toContain('clientFinancialDisclosurePublication');
  });
});
