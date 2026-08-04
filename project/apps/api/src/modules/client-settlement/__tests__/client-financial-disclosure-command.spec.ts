import { ForbiddenException } from '@nestjs/common';
import {
  CLIENT_FINANCIAL_DISCLOSURE_WRITE_FLAG,
} from '../../client-financial-disclosure/client-financial-disclosure-activation';
import { ClientFinancialDisclosureCommandService } from '../client-financial-disclosure-command.service';

const WRITE_DISABLED_RESPONSE = {
  statusCode: 403,
  error: 'Client Financial Disclosure Write Disabled',
  code: 'DISCLOSURE_WRITE_NOT_ENABLED',
  message: 'Client financial disclosure creation is not enabled.',
};

function buildSubject() {
  const prisma = {
    collectionDisposition: { findFirst: jest.fn() },
  };
  const writer = {
    createDisclosureVersion: jest.fn(),
  };
  const posting = {
    isPrepareEligible: jest.fn(),
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

async function captureForbidden(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(ForbiddenException);
    return (error as ForbiddenException).getResponse();
  }
  throw new Error('Expected ForbiddenException');
}

describe('CODEX-CLIENT-X2-B03 — disclosure write flag boundary', () => {
  const originalWriteFlag = process.env[CLIENT_FINANCIAL_DISCLOSURE_WRITE_FLAG];

  afterEach(() => {
    if (originalWriteFlag === undefined) {
      delete process.env[CLIENT_FINANCIAL_DISCLOSURE_WRITE_FLAG];
    } else {
      process.env[CLIENT_FINANCIAL_DISCLOSURE_WRITE_FLAG] = originalWriteFlag;
    }
  });

  it('[1] flag yokken exact 403, herhangi bir downstream erişimden önce döner', async () => {
    delete process.env[CLIENT_FINANCIAL_DISCLOSURE_WRITE_FLAG];
    const { subject, prisma, writer, posting } = buildSubject();

    await expect(
      captureForbidden(
        subject.createFromDisposition('tenant-a', 'opaque-disposition-a', {
          userId: 'actor-a',
        }),
      ),
    ).resolves.toEqual(WRITE_DISABLED_RESPONSE);
    expect(posting.isPrepareEligible).not.toHaveBeenCalled();
    expect(prisma.collectionDisposition.findFirst).not.toHaveBeenCalled();
    expect(writer.createDisclosureVersion).not.toHaveBeenCalled();
  });

  it.each(['TRUE', '1', ' true '])(
    '[2] yanıltıcı %p değeri fail-closed kalır ve varlık bilgisi sızdırmaz',
    async (value) => {
      process.env[CLIENT_FINANCIAL_DISCLOSURE_WRITE_FLAG] = value;
      const { subject, prisma, writer, posting } = buildSubject();

      const responses = await Promise.all(
        ['existing-looking-id', 'missing-looking-id'].map((dispositionId) =>
          captureForbidden(
            subject.createFromDisposition('tenant-a', dispositionId, {
              userId: 'actor-a',
            }),
          ),
        ),
      );

      expect(responses).toEqual([WRITE_DISABLED_RESPONSE, WRITE_DISABLED_RESPONSE]);
      expect(posting.isPrepareEligible).not.toHaveBeenCalled();
      expect(prisma.collectionDisposition.findFirst).not.toHaveBeenCalled();
      expect(writer.createDisclosureVersion).not.toHaveBeenCalled();
    },
  );

  it('[3] yalnız exact true gate’i geçer ve mevcut authorization zincirine devreder', async () => {
    process.env[CLIENT_FINANCIAL_DISCLOSURE_WRITE_FLAG] = 'true';
    const { subject, prisma, writer, posting } = buildSubject();
    posting.isPrepareEligible.mockResolvedValue(false);

    await expect(
      subject.createFromDisposition('tenant-a', 'opaque-disposition-a', {
        userId: 'actor-a',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(posting.isPrepareEligible).toHaveBeenCalledWith('actor-a', 'tenant-a');
    expect(prisma.collectionDisposition.findFirst).not.toHaveBeenCalled();
    expect(writer.createDisclosureVersion).not.toHaveBeenCalled();
  });
});
