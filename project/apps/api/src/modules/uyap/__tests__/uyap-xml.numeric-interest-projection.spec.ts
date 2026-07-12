import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { BadRequestException } from '@nestjs/common';
import { InterestAccrualStatus, InterestTypeCode } from '@prisma/client';

import { PrismaService } from '../../../prisma/prisma.service';
import { UyapController } from '../uyap.controller';
import { UyapAlacakKalemi, UyapXmlService } from '../uyap-xml.service';

type ProjectionHarness = {
  buildAlacakKalemleri(caseRecord: unknown): UyapAlacakKalemi[];
};

const START = new Date('2026-01-15T00:00:00.000Z');

function claimItem(overrides: Record<string, unknown> = {}) {
  return {
    id: 'claim-1',
    amount: 1000,
    currency: 'TRY',
    description: 'Asıl Alacak',
    dueDate: new Date('2026-01-01T00:00:00.000Z'),
    interestAccrualStatus: InterestAccrualStatus.ACCRUES,
    interestTypeCode: InterestTypeCode.LEGAL_3095,
    interestType: null,
    interestRate: null,
    interestStartDate: START,
    interestStartDateProvenance: 'DEFAULT_NOTICE_DATE',
    interestAmount: null,
    ...overrides,
  };
}

function failureBody(error: unknown): Record<string, unknown> {
  expect(error).toBeInstanceOf(BadRequestException);
  return (error as BadRequestException).getResponse() as Record<string, unknown>;
}

describe('PR-A4-N2 shared numeric XML projection', () => {
  const service = new UyapXmlService({} as PrismaService);
  const harness = service as unknown as ProjectionHarness;

  it.each([
    [InterestTypeCode.LEGAL_3095, null, null, '1'],
    [InterestTypeCode.COMMERCIAL_AVANS_3095_2_2, 'TICARI', null, '4'],
    [InterestTypeCode.TTK_1530, null, null, '2'],
    [InterestTypeCode.CONTRACTUAL, null, 18.5, '6'],
  ])('projects %s through the canonical adapter to numeric %s', (
    interestTypeCode,
    interestType,
    interestRate,
    expectedCode,
  ) => {
    const [item] = harness.buildAlacakKalemleri({
      claimItems: [claimItem({ interestTypeCode, interestType, interestRate })],
    });

    expect(item.faiz).toEqual({
      faizTuru: expectedCode,
      faizOrani: interestRate ?? undefined,
      baslangicTarihi: '2026-01-15',
      islemisFaiz: undefined,
    });
  });

  it('omits the complete interest element for explicit NO_INTEREST', () => {
    const [item] = harness.buildAlacakKalemleri({
      claimItems: [claimItem({
        interestAccrualStatus: InterestAccrualStatus.NO_INTEREST,
        interestTypeCode: null,
        interestType: null,
        interestRate: null,
        interestStartDate: null,
        interestStartDateProvenance: null,
      })],
    });

    expect(item.faiz).toBeUndefined();
  });

  it.each([
    ['unverified', { interestTypeCode: InterestTypeCode.COMMERCIAL_FIXED, interestType: 'SABIT', interestRate: 18 }, 'UNVERIFIED'],
    ['deposit', { interestTypeCode: InterestTypeCode.MEVDUAT_TL_BANKALARCA }, 'UNVERIFIED'],
    ['unknown rich', { interestTypeCode: 'UNKNOWN_RICH' }, 'UNKNOWN_CANONICAL_CODE'],
    ['missing fixed rate', { interestTypeCode: InterestTypeCode.CONTRACTUAL }, 'INVALID_RATE'],
    ['zero fixed rate', { interestTypeCode: InterestTypeCode.CONTRACTUAL, interestRate: 0 }, 'INVALID_RATE'],
    ['negative fixed rate', { interestTypeCode: InterestTypeCode.CONTRACTUAL, interestRate: -1 }, 'INVALID_RATE'],
    ['NaN fixed rate', { interestTypeCode: InterestTypeCode.CONTRACTUAL, interestRate: Number.NaN }, 'INVALID_RATE'],
    ['infinite fixed rate', { interestTypeCode: InterestTypeCode.CONTRACTUAL, interestRate: Number.POSITIVE_INFINITY }, 'INVALID_RATE'],
    ['missing start date', { interestStartDate: null }, 'MISSING_START_DATE'],
    ['invalid start date', { interestStartDate: '2026-02-30' }, 'MISSING_START_DATE'],
    ['rich legacy mismatch', { interestType: 'TICARI' }, 'RICH_LEGACY_MISMATCH'],
    ['missing authority', { interestTypeCode: null, interestType: null }, 'INVALID_INTEREST_STATE'],
  ])('fails closed for %s', (_label, overrides, expectedStatus) => {
    try {
      harness.buildAlacakKalemleri({ claimItems: [claimItem(overrides)] });
      throw new Error('expected projection failure');
    } catch (error) {
      expect(failureBody(error)).toMatchObject({
        error: 'UYAP_NUMERIC_INTEREST_PROJECTION_FAILED',
        claimItemId: 'claim-1',
        projectionStatus: expectedStatus,
      });
    }
  });

  it('never falls back from missing interestStartDate to dueDate', () => {
    try {
      harness.buildAlacakKalemleri({
        claimItems: [claimItem({ interestStartDate: null, dueDate: START })],
      });
      throw new Error('expected projection failure');
    } catch (error) {
      expect(failureBody(error)).toMatchObject({ projectionStatus: 'MISSING_START_DATE' });
    }
  });

  it('allows only adapter-authorized lossless YASAL legacy compatibility', () => {
    const [item] = harness.buildAlacakKalemleri({
      claimItems: [claimItem({ interestTypeCode: null, interestType: 'YASAL' })],
    });
    expect(item.faiz?.faizTuru).toBe('1');
  });

  it.each(['TICARI', 'AKIT', 'TEMERRUT', 'MEVDUAT', 'REESKONT', 'AVANS', 'UNKNOWN']) (
    'rejects ambiguous legacy-only %s without numeric 99',
    (interestType) => {
      try {
        harness.buildAlacakKalemleri({
          claimItems: [claimItem({ interestTypeCode: null, interestType })],
        });
        throw new Error('expected projection failure');
      } catch (error) {
        expect(failureBody(error)).toMatchObject({
          projectionStatus: 'LEGACY_AMBIGUOUS',
          legacyInterestType: interestType,
        });
      }
    },
  );

  it('fails closed for case-level interest fallback without a canonical ClaimItem', () => {
    try {
      harness.buildAlacakKalemleri({
        id: 'case-1',
        claimItems: [],
        principalAmount: 1000,
        currency: 'TRY',
        interestType: 'YASAL',
      });
      throw new Error('expected projection failure');
    } catch (error) {
      expect(failureBody(error)).toMatchObject({
        claimItemId: 'case:case-1',
        projectionStatus: 'INVALID_INTEREST_STATE',
        reason: 'INTEREST_AUTHORITY_MISSING',
      });
    }
  });

  it('keeps a non-interest case-level principal fallback structurally unchanged', () => {
    expect(harness.buildAlacakKalemleri({
      id: 'case-1', claimItems: [], principalAmount: 1000, currency: 'TRY',
    })).toEqual([{
      siraNo: 1,
      aciklama: 'Asıl Alacak',
      tutar: 1000,
      paraBirimi: 'TL',
      vadeTarihi: undefined,
    }]);
  });

  it('serializes PROJECTED interest and omits NO_INTEREST without a placeholder', () => {
    const projected = service.generateExchangeXml({
      dosyaTipi: '1', takipTuru: '1', takipYolu: '1', takipSekli: '1',
      mahiyetKodu: '1007', birimKodu: '1', takipTarihi: '2026-01-01',
      paraBirimi: 'TL', taraflar: [],
      alacakKalemleri: harness.buildAlacakKalemleri({ claimItems: [claimItem()] }),
    });
    const noInterest = service.generateExchangeXml({
      dosyaTipi: '1', takipTuru: '1', takipYolu: '1', takipSekli: '1',
      mahiyetKodu: '1007', birimKodu: '1', takipTarihi: '2026-01-01',
      paraBirimi: 'TL', taraflar: [],
      alacakKalemleri: harness.buildAlacakKalemleri({ claimItems: [claimItem({
        interestAccrualStatus: InterestAccrualStatus.NO_INTEREST,
        interestTypeCode: null, interestType: null, interestStartDate: null,
        interestStartDateProvenance: null,
      })] }),
    });

    expect(projected).toContain('<faizTuru>1</faizTuru>');
    expect(projected).toContain('<baslangicTarihi>2026-01-15</baslangicTarihi>');
    expect(noInterest).not.toContain('<faiz>');
    expect(noInterest).not.toContain('<faizTuru>');
    expect(noInterest).not.toContain('99');
  });

  it('keeps preview, download and submit on the same generateFromCase path', () => {
    const controllerSource = readFileSync(resolve(__dirname, '..', 'uyap.controller.ts'), 'utf8');
    const sharedCalls = controllerSource.match(/uyapXmlService\.generateFromCase\(caseId, tenantId\)/g) ?? [];
    expect(sharedCalls).toHaveLength(3);

    const submitStart = controllerSource.indexOf('async submitXmlToUyap');
    const submitSource = controllerSource.slice(submitStart, controllerSource.indexOf('/**', submitStart + 10));
    expect(submitSource.indexOf('generateFromCase(caseId, tenantId)'))
      .toBeLessThan(submitSource.indexOf('submitDocument({'));
  });

  it('contains no duplicate numeric mapper, 99 fallback, dueDate interest fallback or FAIZT import', () => {
    const serviceSource = readFileSync(resolve(__dirname, '..', 'uyap-xml.service.ts'), 'utf8');
    expect(serviceSource).not.toContain('mapInterestTypeToUyapKod');
    expect(serviceSource).not.toContain("kod: '99'");
    expect(serviceSource).not.toContain('interestStartDate?.toISOString().split');
    expect(serviceSource).not.toContain('uyap-export');
    expect(serviceSource).not.toContain('FAIZT');
  });
});

describe('PR-A4-N2 preview/download/submit runtime parity', () => {
  const generatedXml = '<exchangeData><canonical-interest /></exchangeData>';

  function controllerHarness() {
    const uyapService = {
      queryCaseStatus: jest.fn().mockResolvedValue({ data: { localStatus: 'TEST' } }),
      validateCasePoaForUyap: jest.fn().mockResolvedValue({ isValid: true, errors: [] }),
      submitDocument: jest.fn().mockResolvedValue({ success: true, evkNo: 'EVK-1' }),
    };
    const xmlService = {
      generateFromCase: jest.fn().mockResolvedValue(generatedXml),
      validateXml: jest.fn().mockReturnValue({ isValid: true, errors: [] }),
    };
    const guidedObserve = { observe: jest.fn().mockResolvedValue(undefined) };
    const controller = new UyapController(
      uyapService as never,
      xmlService as never,
      guidedObserve as never,
    );
    return { controller, uyapService, xmlService, guidedObserve };
  }

  it('uses the identical shared XML result for preview, download and submit payload', async () => {
    const { controller, uyapService, xmlService } = controllerHarness();
    const response = {
      setHeader: jest.fn(),
      send: jest.fn(),
    };

    const preview = await controller.generateXmlFromCase('case-1', 'tenant-1');
    await controller.downloadXmlFromCase('case-1', 'tenant-1', response as never);
    await controller.submitXmlToUyap('case-1', {
      user: { id: 'user-1', tenantId: 'tenant-1' },
    });

    expect(xmlService.generateFromCase).toHaveBeenNthCalledWith(1, 'case-1', 'tenant-1');
    expect(xmlService.generateFromCase).toHaveBeenNthCalledWith(2, 'case-1', 'tenant-1');
    expect(xmlService.generateFromCase).toHaveBeenNthCalledWith(3, 'case-1', 'tenant-1');
    expect(preview.xml).toBe(generatedXml);
    expect(response.send).toHaveBeenCalledWith(generatedXml);
    expect(uyapService.submitDocument).toHaveBeenCalledWith(expect.objectContaining({
      documentContent: Buffer.from(generatedXml).toString('base64'),
      tenantId: 'tenant-1',
    }));
  });

  it('propagates projection failure before submitDocument without changing the pre-existing observe order', async () => {
    const { controller, uyapService, xmlService, guidedObserve } = controllerHarness();
    const failure = new BadRequestException({
      error: 'UYAP_NUMERIC_INTEREST_PROJECTION_FAILED',
      claimItemId: 'claim-1',
      projectionStatus: 'UNVERIFIED',
    });
    xmlService.generateFromCase.mockRejectedValue(failure);

    await expect(controller.submitXmlToUyap('case-1', {
      user: { id: 'user-1', tenantId: 'tenant-1' },
    })).rejects.toBe(failure);

    expect(guidedObserve.observe).toHaveBeenCalledTimes(1);
    expect(uyapService.submitDocument).not.toHaveBeenCalled();
  });
});
