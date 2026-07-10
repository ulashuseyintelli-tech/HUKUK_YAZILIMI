import { BadRequestException } from '@nestjs/common';
import { ClaimItemService } from '../claim-item.service';
import { DocumentSourceType } from '../dto/claim-item.dto';

describe('VER-05 PR-1C invoice KDV write-path convergence', () => {
  function makeService() {
    const claimItem = {
      create: jest.fn(async ({ data }: any) => ({ id: 'created', ...data })),
    };
    return {
      service: new ClaimItemService({ claimItem } as any),
      claimItem,
    };
  }

  it('rejects FATURA auto-generate before any ClaimItem write', async () => {
    const { service, claimItem } = makeService();

    await expect(service.autoGenerateFromDocument('t1', {
      documentType: DocumentSourceType.FATURA,
      caseId: 'c1',
      documentId: 'doc-1',
      totalAmount: 1180,
      kdvAmount: 180,
      currency: 'TRY',
    })).rejects.toThrow(BadRequestException);

    expect(claimItem.create).not.toHaveBeenCalled();
  });

  it.each([
    [DocumentSourceType.CEK, 2],
    [DocumentSourceType.SENET, 1],
    [DocumentSourceType.KIRA, 1],
  ])('preserves %s auto-generate behavior', async (documentType, expectedCount) => {
    const { service, claimItem } = makeService();

    await service.autoGenerateFromDocument('t1', {
      documentType,
      caseId: 'c1',
      documentId: 'doc-1',
      totalAmount: 1000,
      currency: 'TRY',
    });

    expect(claimItem.create).toHaveBeenCalledTimes(expectedCount);
  });
});
