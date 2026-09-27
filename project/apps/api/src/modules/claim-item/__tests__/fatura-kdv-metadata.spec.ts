import { BadRequestException } from '@nestjs/common';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ClaimItemService } from '../claim-item.service';
import { DocumentSourceType } from '../dto/claim-item.dto';

describe('VER-05 PR-1C invoice KDV write-path convergence', () => {
  function makeService() {
    const auditWrite = jest.fn();
    const eventWrite = jest.fn();
    const outboxWrite = jest.fn();
    const claimItem = {
      create: jest.fn(async ({ data }: any) => ({ id: 'created', ...data })),
    };
    const writerRouter = {
      createSystemClaimItem: jest.fn(async ({ data }: any) => {
        const createdItem = await claimItem.create({ data });
        auditWrite();
        eventWrite();
        outboxWrite();
        return createdItem;
      }),
    };
    return {
      service: new ClaimItemService(
        { claimItem } as any, undefined, undefined, undefined, writerRouter as any,
      ),
      auditWrite,
      claimItem,
      eventWrite,
      outboxWrite,
      writerRouter,
    };
  }

  async function expectUnsupportedDocument(promise: Promise<unknown>) {
    try {
      await promise;
      throw new Error('Expected UNSUPPORTED_COMPONENT');
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).getResponse()).toEqual({
        code: 'UNSUPPORTED_COMPONENT',
        message: 'Document component is not supported.',
      });
    }
  }

  function expectNoWrites(surface: ReturnType<typeof makeService>) {
    expect(surface.writerRouter.createSystemClaimItem).not.toHaveBeenCalled();
    expect(surface.claimItem.create).not.toHaveBeenCalled();
    expect(surface.auditWrite).not.toHaveBeenCalled();
    expect(surface.eventWrite).not.toHaveBeenCalled();
    expect(surface.outboxWrite).not.toHaveBeenCalled();
  }

  it('rejects FATURA auto-generate before any ClaimItem write', async () => {
    const surface = makeService();

    await expect(surface.service.autoGenerateFromDocument('t1', 'requester-1', {
      documentType: DocumentSourceType.FATURA,
      caseId: 'c1',
      documentId: 'doc-1',
      totalAmount: 1180,
      kdvAmount: 180,
      currency: 'TRY',
    })).rejects.toThrow(BadRequestException);

    expectNoWrites(surface);
  });

  it.each([
    [DocumentSourceType.CEK, 2],
    [DocumentSourceType.SENET, 1],
    [DocumentSourceType.KIRA, 1],
    [DocumentSourceType.ILAM, 1],
    [DocumentSourceType.KARAR, 1],
  ])('preserves %s auto-generate behavior', async (documentType, expectedCount) => {
    const { service, claimItem } = makeService();

    await service.autoGenerateFromDocument('t1', 'requester-1', {
      documentType,
      caseId: 'c1',
      documentId: 'doc-1',
      totalAmount: 1000,
      currency: 'TRY',
    });

    expect(claimItem.create).toHaveBeenCalledTimes(expectedCount);
  });

  it.each([
    DocumentSourceType.SOZLESME,
    DocumentSourceType.BORC_SENEDI,
    DocumentSourceType.KREDI,
    DocumentSourceType.DIGER,
  ])('rejects unsupported %s before the first writer call', async (documentType) => {
    const surface = makeService();

    await expectUnsupportedDocument(
      surface.service.autoGenerateFromDocument('t1', 'requester-1', {
        documentType,
        caseId: 'c1',
        documentId: 'doc-1',
        totalAmount: 1000,
        currency: 'TRY',
      }),
    );

    expectNoWrites(surface);
  });

  it('returns the same error contract for repeated unsupported admission', async () => {
    const surface = makeService();
    const request = {
      documentType: DocumentSourceType.DIGER,
      caseId: 'c1',
      documentId: 'doc-1',
      totalAmount: 1000,
      currency: 'TRY',
    };

    await expectUnsupportedDocument(
      surface.service.autoGenerateFromDocument('t1', 'requester-1', request),
    );
    await expectUnsupportedDocument(
      surface.service.autoGenerateFromDocument('t1', 'requester-1', request),
    );

    expectNoWrites(surface);
  });

  it('contains no silent PRINCIPAL or OTHER fallback in document admission', () => {
    const claimItemService = readFileSync(
      join(__dirname, '..', 'claim-item.service.ts'),
      'utf8',
    );
    const start = claimItemService.indexOf('async autoGenerateFromDocument(');
    const end = claimItemService.indexOf('private generateFromCek(', start);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    const documentAdmission = claimItemService.slice(start, end);

    expect(documentAdmission).toContain("code: 'UNSUPPORTED_COMPONENT'");
    expect(documentAdmission).not.toContain('generateDefault');
    expect(documentAdmission).not.toMatch(
      /default:[\s\S]*?ClaimItemType\.(PRINCIPAL|OTHER)/,
    );
    // K3 (2026-09-28): kalem hazırlama `buildDocumentGeneratedItems`'a taşındı. Güvence aynı: desteklenmeyen
    // bileşen reddi hazırlamada, sistem yazıcısında hazırlama İLK routed write'tan ÖNCE.
    const builder = documentAdmission.slice(documentAdmission.indexOf('private buildDocumentGeneratedItems('));
    expect(builder).toContain("code: 'UNSUPPORTED_COMPONENT'");
    const systemWriter = documentAdmission.slice(0, documentAdmission.indexOf('async autoGenerateFromUser('));
    expect(systemWriter.indexOf('this.buildDocumentGeneratedItems('))
      .toBeGreaterThanOrEqual(0);
    expect(systemWriter.indexOf('this.buildDocumentGeneratedItems('))
      .toBeLessThan(systemWriter.indexOf('createSystemClaimItem'));
    // K3: insan yolu HİÇ doğrudan yazmaz.
    const humanPath = documentAdmission.slice(
      documentAdmission.indexOf('async autoGenerateFromUser('),
      documentAdmission.indexOf('private buildDocumentGeneratedItems('),
    );
    expect(humanPath).not.toContain('createSystemClaimItem');
    expect(humanPath).toContain('assertHumanGeneratedCreatesAdmissible');
  });
});
