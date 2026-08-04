import { BadRequestException } from '@nestjs/common';
import {
  ClientFinancialDisclosureStatus,
  CollectionDispositionBeneficiaryScope,
  CollectionDispositionStatus,
} from '@prisma/client';
import { CLIENT_FINANCIAL_DISCLOSURE_WRITE_FLAG } from '../../client-financial-disclosure/client-financial-disclosure-activation';
import { ClientFinancialDisclosureProjectionService } from '../../client-financial-disclosure/client-financial-disclosure-projection.service';
import { ClientFinancialDisclosureCommandService } from '../client-financial-disclosure-command.service';

const INVALID_STATE_RESPONSE = {
  statusCode: 400,
  error: 'Client Financial Disclosure Source State Invalid',
  code: 'DISCLOSURE_SOURCE_STATE_INVALID',
  message: 'Only a posted disposition may produce a client financial disclosure.',
};

const UNSUPPORTED_SCOPE_RESPONSE = {
  statusCode: 400,
  error: 'Client Financial Disclosure Unsupported Scope',
  code: 'UNSUPPORTED_SCOPE',
  message: 'This disposition scope is not supported for client financial disclosure.',
};

function buildCommandSubject() {
  const prisma = {
    collectionDisposition: { findFirst: jest.fn() },
  };
  const writer = {
    createDisclosureVersion: jest.fn(),
  };
  const posting = {
    isPrepareEligible: jest.fn().mockResolvedValue(true),
  };

  return {
    prisma,
    writer,
    posting,
    subject: new ClientFinancialDisclosureCommandService(
      prisma as never,
      writer as never,
      posting as never,
    ),
  };
}

async function captureBadRequest(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(BadRequestException);
    return (error as BadRequestException).getResponse();
  }
  throw new Error('Expected BadRequestException');
}

describe('CODEX-CLIENT-X2-B06 — Financial Disclosure fail-closed boundary', () => {
  const originalWriteFlag = process.env[CLIENT_FINANCIAL_DISCLOSURE_WRITE_FLAG];

  beforeEach(() => {
    process.env[CLIENT_FINANCIAL_DISCLOSURE_WRITE_FLAG] = 'true';
  });

  afterEach(() => {
    if (originalWriteFlag === undefined) {
      delete process.env[CLIENT_FINANCIAL_DISCLOSURE_WRITE_FLAG];
    } else {
      process.env[CLIENT_FINANCIAL_DISCLOSURE_WRITE_FLAG] = originalWriteFlag;
    }
  });

  it.each([
    CollectionDispositionStatus.HELD_PENDING_DISTRIBUTION,
    CollectionDispositionStatus.DISTRIBUTION_RECOMMENDED,
    CollectionDispositionStatus.DISTRIBUTION_APPROVED,
    CollectionDispositionStatus.CANCELLED,
    CollectionDispositionStatus.REVERSED,
  ])(
    '[1] POSTED dışındaki %s kaynağı generic sonuçla reddeder ve lifecycle durumunu sızdırmaz',
    async (status) => {
      const { subject, prisma, writer } = buildCommandSubject();
      prisma.collectionDisposition.findFirst.mockResolvedValue({
        id: 'disposition-secret',
        caseId: 'case-secret',
        caseClientId: 'case-client-secret',
        status,
        beneficiaryScope: CollectionDispositionBeneficiaryScope.SINGLE_CASE_CLIENT,
      });

      const response = await captureBadRequest(
        subject.createFromDisposition('tenant-secret', 'disposition-secret', {
          userId: 'actor-a',
        }),
      );

      expect(response).toEqual(INVALID_STATE_RESPONSE);
      expect(JSON.stringify(response)).not.toContain(status);
      expect(JSON.stringify(response)).not.toContain('tenant-secret');
      expect(JSON.stringify(response)).not.toContain('disposition-secret');
      expect(writer.createDisclosureVersion).not.toHaveBeenCalled();
    },
  );

  it('[2] POSTED SINGLE_CASE_CLIENT kaynağını server-derived scope ile writer zincirine devreder', async () => {
    const { subject, prisma, writer } = buildCommandSubject();
    prisma.collectionDisposition.findFirst.mockResolvedValue({
      id: 'disposition-a',
      caseId: 'case-a',
      caseClientId: 'case-client-a',
      status: CollectionDispositionStatus.POSTED,
      beneficiaryScope: CollectionDispositionBeneficiaryScope.SINGLE_CASE_CLIENT,
    });
    writer.createDisclosureVersion.mockResolvedValue({
      disclosureId: 'disclosure-a',
      versionId: 'version-a',
      version: 1,
      replayed: false,
    });

    await expect(
      subject.createFromDisposition('tenant-a', 'disposition-a', { userId: 'actor-a' }),
    ).resolves.toEqual({
      disclosureId: 'disclosure-a',
      disclosureVersionId: 'version-a',
      version: 1,
      status: 'DRAFT',
      replayed: false,
    });
    expect(writer.createDisclosureVersion).toHaveBeenCalledWith({
      tenantId: 'tenant-a',
      caseId: 'case-a',
      caseClientId: 'case-client-a',
      collectionDispositionId: 'disposition-a',
      sendIdempotencyKey: 'client-financial-disclosure:disposition-a',
    });
  });

  it.each([
    CollectionDispositionStatus.POSTED,
    CollectionDispositionStatus.HELD_PENDING_DISTRIBUTION,
  ])(
    '[3] CASE_CREDITOR_CLUSTER / %s için exact UNSUPPORTED_SCOPE üretir; sessiz skip veya write yapmaz',
    async (status) => {
      const { subject, prisma, writer } = buildCommandSubject();
      prisma.collectionDisposition.findFirst.mockResolvedValue({
        id: 'cluster-disposition-secret',
        caseId: 'case-secret',
        caseClientId: null,
        status,
        beneficiaryScope: CollectionDispositionBeneficiaryScope.CASE_CREDITOR_CLUSTER,
      });

      const response = await captureBadRequest(
        subject.createFromDisposition('tenant-secret', 'cluster-disposition-secret', {
          userId: 'actor-a',
        }),
      );

      expect(response).toEqual(UNSUPPORTED_SCOPE_RESPONSE);
      expect(JSON.stringify(response)).not.toContain(status);
      expect(JSON.stringify(response)).not.toContain('tenant-secret');
      expect(JSON.stringify(response)).not.toContain('cluster-disposition-secret');
      expect(writer.createDisclosureVersion).not.toHaveBeenCalled();
    },
  );

  it('[4] client projection sorgusunu yalnız yayınlanmış görünür durumlarla sınırlar', async () => {
    const prisma = {
      clientPortalUser: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'portal-user-a',
          clientId: 'client-a',
          client: { id: 'client-a', tenantId: 'tenant-a' },
        }),
      },
      clientFinancialDisclosureVersion: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    const subject = new ClientFinancialDisclosureProjectionService(prisma as never);

    await expect(
      subject.getCurrentSurface({ tenantId: 'tenant-a', portalUserId: 'portal-user-a' }),
    ).resolves.toEqual({ surface: 'CURRENT', items: [] });
    expect(prisma.clientFinancialDisclosureVersion.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tenantId: 'tenant-a',
          status: {
            in: [
              ClientFinancialDisclosureStatus.PUBLISHED,
              ClientFinancialDisclosureStatus.SUPERSEDED,
              ClientFinancialDisclosureStatus.REVERSED,
            ],
          },
          publishedAt: { not: null },
          disclosure: {
            tenantId: 'tenant-a',
            caseClient: {
              clientId: 'client-a',
              case: { tenantId: 'tenant-a' },
            },
          },
        },
      }),
    );
    expect(
      JSON.stringify(prisma.clientFinancialDisclosureVersion.findMany.mock.calls[0]?.[0]),
    ).not.toContain(CollectionDispositionStatus.HELD_PENDING_DISTRIBUTION);
  });
});
