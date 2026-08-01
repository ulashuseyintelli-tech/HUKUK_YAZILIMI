import { DebtorRole } from '@prisma/client';
import {
  UYAP_M01_LEGAL_BASIS_FAILURE_CODES,
  type UyapM01LegalBasisConsumerProjection,
} from '../../legal-basis/uyap-m01-legal-basis-consumer.service';
import {
  UyapOfficialAlacakKalemiStructuredEmissionService,
  type UyapOfficialStructuredEmissionResult,
  type UyapStructuredEmissionClaimEvidenceReaderPort,
  type UyapStructuredEmissionM01ConsumerPort,
} from '../official-alacakkalemi-structured-emission.service';
import { resolveOfficialTakipTuru } from '../official-codelist-registry';
import { resolveOfficialRole } from '../official-role-translator';

const ENABLE_FLAG = 'UYAP_OFFICIAL_ALACAKKALEMI_STRUCTURED_EMISSION_ENABLED';

const projection = (
  over: Partial<UyapM01LegalBasisConsumerProjection> = {},
): UyapM01LegalBasisConsumerProjection => ({
  tenantId: 'tenant-1',
  caseId: 'case-1',
  claimItemId: 'claim-1',
  snapshotId: 'snapshot-1',
  snapshotHash: 'a'.repeat(64),
  releaseId: 'RCV-LB-R1',
  releaseVersion: '1',
  releaseChecksum: 'b'.repeat(64),
  legalBasisCode: 'TBK_120',
  legalBasisVersion: '1',
  legalBasisChecksum: 'c'.repeat(64),
  effectiveAt: '2026-08-01T00:00:00.000Z',
  componentCategory: 'PRINCIPAL',
  componentSubtypeCode: 'PRINCIPAL',
  componentSubtypeVersion: '1',
  sourceType: 'CEK',
  evidenceClasses: Object.freeze(['DOCUMENT']),
  liabilityContextHash: 'd'.repeat(64),
  legalBasisResolutionHash: 'e'.repeat(64),
  ...over,
});

const request = (relations: readonly unknown[] = [{ relation: 'opaque' }]) => ({
  dosya: {
    dosyaTipi: '1',
    takipTuruResolution: resolveOfficialTakipTuru({ proceedingType: 'GENERAL_EXECUTION' }),
  },
  taraflar: [
    {
      id: 'T1',
      roleResolution: resolveOfficialRole(DebtorRole.ASIL_BORCLU),
      kisi: { adi: 'Çağrı', soyadi: 'Şahin' },
    },
  ],
  claimRelations: [...relations],
});

function claim(over: Record<string, unknown> = {}) {
  return {
    tenantId: 'tenant-1',
    caseId: 'case-1',
    claimItemId: 'claim-1',
    snapshotId: 'snapshot-1',
    snapshotHash: 'a'.repeat(64),
    itemType: 'PRINCIPAL',
    demandedAmount: '1000.00',
    currency: 'TRY',
    label: 'Asıl alacak',
    description: null,
    wrapperContext: {
      instrumentType: 'CEK',
      proceedingType: 'GENERAL_ENFORCEMENT',
      sourceDocumentType: 'CEK',
      caseHasJudgmentRecord: false,
    },
    ...over,
  };
}

function harness() {
  const reader = {
    readExactClaimEvidence: jest.fn().mockResolvedValue(claim()),
  };
  const m01 = {
    resolveClaimRelation: jest.fn().mockResolvedValue({ ok: true, value: projection() }),
  };
  return {
    reader,
    m01,
    service: new UyapOfficialAlacakKalemiStructuredEmissionService(
      m01 as unknown as UyapStructuredEmissionM01ConsumerPort,
      reader as unknown as UyapStructuredEmissionClaimEvidenceReaderPort,
    ),
  };
}

function expectNoEmission(result: UyapOfficialStructuredEmissionResult): void {
  expect(result.status).toBe('REJECTED');
  expect(result).not.toHaveProperty('xml');
  expect(result).not.toHaveProperty('bytes');
}

describe('UYAP official alacakKalemi structured emission', () => {
  beforeEach(() => {
    process.env[ENABLE_FLAG] = 'true';
  });

  afterEach(() => {
    delete process.env[ENABLE_FLAG];
    jest.restoreAllMocks();
  });

  it('default-OFF iken M01 ve DB çağrısı yapmadan fail-closed durur', async () => {
    delete process.env[ENABLE_FLAG];
    const h = harness();
    const result = await h.service.emit(request());
    expectNoEmission(result);
    expect(result).toEqual({ status: 'REJECTED', failure: { code: 'FEATURE_DISABLED' } });
    expect(h.m01.resolveClaimRelation).not.toHaveBeenCalled();
    expect(h.reader.readExactClaimEvidence).not.toHaveBeenCalled();
  });

  it.each(UYAP_M01_LEGAL_BASIS_FAILURE_CODES)(
    'M01 %s sonucu exact aktarılır ve wrapper/ClaimItem read yapılmaz',
    async (code) => {
      const h = harness();
      h.m01.resolveClaimRelation.mockResolvedValue({ ok: false, failure: { code } });
      const result = await h.service.emit(request());
      expectNoEmission(result);
      expect(result).toEqual({ status: 'REJECTED', failure: { code, claimIndex: 0 } });
      expect(h.reader.readExactClaimEvidence).not.toHaveBeenCalled();
    },
  );

  it('batch içindeki tek M01 reddi bütün emisyonu DB read öncesi durdurur', async () => {
    const h = harness();
    h.m01.resolveClaimRelation
      .mockResolvedValueOnce({ ok: true, value: projection() })
      .mockResolvedValueOnce({ ok: false, failure: { code: 'CHECKSUM_MISMATCH' } });
    const result = await h.service.emit(request([{ r: 1 }, { r: 2 }]));
    expectNoEmission(result);
    expect(result).toEqual({
      status: 'REJECTED',
      failure: { code: 'CHECKSUM_MISMATCH', claimIndex: 1 },
    });
    expect(h.reader.readExactClaimEvidence).not.toHaveBeenCalled();
  });

  it.each([
    ['ES-01', 'CEK', 'cek'],
    ['ES-02', 'SENET', 'senet'],
    ['ES-02b', 'BONO', 'senet'],
    ['ES-03', 'POLICE', 'police'],
  ] as const)('%s: %s server-side sinyali <%s> altında deterministik emit edilir', async (_scenario, instrumentType, wrapper) => {
    const h = harness();
    h.reader.readExactClaimEvidence.mockResolvedValue(
      claim({
        wrapperContext: {
          instrumentType,
          proceedingType: 'GENERAL_ENFORCEMENT',
          sourceDocumentType: instrumentType === 'POLICE' ? null : instrumentType,
          caseHasJudgmentRecord: false,
        },
      }),
    );
    const result = await h.service.emit(request());
    expect(result.status).toBe('CANONICAL_BYTES');
    if (result.status !== 'CANONICAL_BYTES') throw new Error('CANONICAL_BYTES bekleniyordu');
    expect(result.xml).toMatch(new RegExp(`<${wrapper}>\\s*<alacakKalemi`));
    expect(result.xml).not.toContain('<digerAlacak');
    expect(result.xml).not.toContain('<kontrat');
    expect(result.evidence.wrapperSequence).toEqual([wrapper]);
    expect(result.evidence.officialDtdValidated).toBe(false);
  });

  it('ES-04: W-05 ilam üç canonical server-side sinyal birlikteyken emit edilir', async () => {
    const h = harness();
    h.reader.readExactClaimEvidence.mockResolvedValue(
      claim({
        wrapperContext: {
          instrumentType: null,
          sourceDocumentType: 'ILAM',
          proceedingType: 'JUDGMENT_ENFORCEMENT',
          caseHasJudgmentRecord: true,
        },
      }),
    );
    const result = await h.service.emit(request());
    expect(result.status).toBe('CANONICAL_BYTES');
    if (result.status === 'CANONICAL_BYTES') expect(result.xml).toMatch(/<ilam>\s*<alacakKalemi/);
  });

  it.each([
    [
      'ES-05 AUTHORITY_REQUIRED',
      claim({
        wrapperContext: {
          instrumentType: null,
          sourceDocumentType: null,
          proceedingType: 'GENERAL_ENFORCEMENT',
          caseHasJudgmentRecord: false,
        },
      }),
    ],
    [
      'ES-06 AMBIGUOUS',
      claim({
        wrapperContext: {
          instrumentType: 'CEK',
          sourceDocumentType: 'ILAM',
          proceedingType: 'JUDGMENT_ENFORCEMENT',
          caseHasJudgmentRecord: true,
        },
      }),
    ],
  ])('%s wrapper sinyali fail-closed ve byte-sızdır', async (scenario, record) => {
    const h = harness();
    h.reader.readExactClaimEvidence.mockResolvedValue(record);
    const result = await h.service.emit(request());
    expectNoEmission(result);
    expect(result).toEqual({
      status: 'REJECTED',
      failure: {
        code: scenario.includes('AMBIGUOUS') ? 'WRAPPER_AMBIGUOUS' : 'WRAPPER_AUTHORITY_REQUIRED',
        claimIndex: 0,
      },
    });
  });

  it.each(['INTEREST', 'PRE_INTEREST', 'POST_INTEREST'])(
    'ES-07: %s ClaimItem faiz emisyonuna dönüşmez',
    async (itemType) => {
      const h = harness();
      h.reader.readExactClaimEvidence.mockResolvedValue(claim({ itemType }));
      const result = await h.service.emit(request());
      expectNoEmission(result);
      expect(result).toEqual({
        status: 'REJECTED',
        failure: { code: 'INTEREST_NOT_SUPPORTED', claimIndex: 0 },
      });
    },
  );

  it('M01 componentCategory=INTEREST ise principal DB kaydı dahi emit edilmez', async () => {
    const h = harness();
    h.m01.resolveClaimRelation.mockResolvedValue({
      ok: true,
      value: projection({ componentCategory: 'INTEREST' }),
    });
    const result = await h.service.emit(request());
    expectNoEmission(result);
    expect(result).toEqual({
      status: 'REJECTED',
      failure: { code: 'INTEREST_NOT_SUPPORTED', claimIndex: 0 },
    });
  });

  it('iki haneden daha hassas Decimal sessiz yuvarlanmaz', async () => {
    const h = harness();
    h.reader.readExactClaimEvidence.mockResolvedValue(
      claim({ demandedAmount: '1000.001' }),
    );
    const result = await h.service.emit(request());
    expectNoEmission(result);
    expect(result).toEqual({
      status: 'REJECTED',
      failure: { code: 'MONEY_NOT_EXACT_MINOR_UNIT', claimIndex: 0 },
    });
  });

  it('caller wrapper/legal-basis alanı ekleyemez; strict üst seviye kontrat reddeder', async () => {
    const h = harness();
    const result = await h.service.emit({ ...request(), wrapperResolution: { kind: 'RESOLVED', wrapper: 'cek' } });
    expectNoEmission(result);
    expect(result).toEqual({ status: 'REJECTED', failure: { code: 'INVALID_INPUT' } });
    expect(h.m01.resolveClaimRelation).not.toHaveBeenCalled();
  });

  it('cross-case M01 projection ve duplicate relation fail-closed', async () => {
    const h = harness();
    h.m01.resolveClaimRelation
      .mockResolvedValueOnce({ ok: true, value: projection() })
      .mockResolvedValueOnce({ ok: true, value: projection({ claimItemId: 'claim-2', caseId: 'case-2' }) });
    const crossScope = await h.service.emit(request([{ r: 1 }, { r: 2 }]));
    expect(crossScope).toEqual({ status: 'REJECTED', failure: { code: 'SCOPE_MISMATCH', claimIndex: 1 } });
    expect(h.reader.readExactClaimEvidence).not.toHaveBeenCalled();

    h.m01.resolveClaimRelation.mockReset().mockResolvedValue({ ok: true, value: projection() });
    const duplicate = await h.service.emit(request([{ r: 1 }, { r: 2 }]));
    expect(duplicate).toEqual({
      status: 'REJECTED',
      failure: { code: 'DUPLICATE_CLAIM_RELATION', claimIndex: 1 },
    });
  });

  it('evidence reader sonucu exact tenant/case/claim/snapshot binding taşımıyorsa emit edilmez', async () => {
    const h = harness();
    h.reader.readExactClaimEvidence.mockResolvedValue(claim({ snapshotId: 'snapshot-forged' }));
    const result = await h.service.emit(request());
    expectNoEmission(result);
    expect(result).toEqual({
      status: 'REJECTED',
      failure: { code: 'EVIDENCE_SCOPE_MISMATCH', claimIndex: 0 },
    });
  });

  it('ES-08: iki kalemden biri çözümsüzse bütün emisyon XML/byte üretmeden reddedilir', async () => {
    const h = harness();
    h.m01.resolveClaimRelation
      .mockResolvedValueOnce({ ok: true, value: projection() })
      .mockResolvedValueOnce({ ok: true, value: projection({ claimItemId: 'claim-2' }) });
    h.reader.readExactClaimEvidence
      .mockResolvedValueOnce(claim())
      .mockResolvedValueOnce(
        claim({
          claimItemId: 'claim-2',
          wrapperContext: {
            instrumentType: null,
            sourceDocumentType: null,
            proceedingType: 'GENERAL_ENFORCEMENT',
            caseHasJudgmentRecord: false,
          },
        }),
      );
    const result = await h.service.emit(request([{ r: 1 }, { r: 2 }]));
    expectNoEmission(result);
    expect(result).toEqual({
      status: 'REJECTED',
      failure: { code: 'WRAPPER_AUTHORITY_REQUIRED', claimIndex: 1 },
    });
  });

  it('ES-09: aynı M01 + DB girdisi bit-aynı ISO-8859-9 byte ve sıra üretir', async () => {
    const h = harness();
    h.m01.resolveClaimRelation
      .mockResolvedValueOnce({ ok: true, value: projection() })
      .mockResolvedValueOnce({ ok: true, value: projection({ claimItemId: 'claim-2' }) })
      .mockResolvedValueOnce({ ok: true, value: projection() })
      .mockResolvedValueOnce({ ok: true, value: projection({ claimItemId: 'claim-2' }) });
    h.reader.readExactClaimEvidence
      .mockResolvedValueOnce(claim())
      .mockResolvedValueOnce(claim({ claimItemId: 'claim-2', label: 'İkinci alacak' }))
      .mockResolvedValueOnce(claim())
      .mockResolvedValueOnce(claim({ claimItemId: 'claim-2', label: 'İkinci alacak' }));
    const first = await h.service.emit(request([{ r: 1 }, { r: 2 }]));
    const second = await h.service.emit(request([{ r: 1 }, { r: 2 }]));
    expect(first.status).toBe('CANONICAL_BYTES');
    expect(second.status).toBe('CANONICAL_BYTES');
    if (first.status !== 'CANONICAL_BYTES' || second.status !== 'CANONICAL_BYTES') return;
    expect(first.bytes.equals(second.bytes)).toBe(true);
    expect(first.evidence.encodedBytesSha256).toBe(second.evidence.encodedBytesSha256);
    expect(first.evidence.roundTripVerified).toBe(true);
    expect(first.xml.indexOf('claim-1')).toBeLessThan(first.xml.indexOf('claim-2'));
    expect(first.evidence.legalBasisResolutionHashes).toEqual(['e'.repeat(64), 'e'.repeat(64)]);
  });

  it('ES-10: strict DTD iddia edilmez ve fallback wrapper üretilmez', async () => {
    const h = harness();
    const result = await h.service.emit(request());
    expect(result.status).toBe('CANONICAL_BYTES');
    if (result.status !== 'CANONICAL_BYTES') return;
    expect(result.evidence.officialDtdValidated).toBe(false);
    expect(result.xml).not.toContain('<digerAlacak');
    expect(result.xml).not.toContain('<kontrat');
    expect(result.xml).not.toContain('<faiz');
  });
});
