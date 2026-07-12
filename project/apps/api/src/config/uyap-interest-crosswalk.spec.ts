import { InterestTypeCode } from '@prisma/client';
import {
  UYAP_INTEREST_CROSSWALK,
  resolveUyapInterestProjection,
  type UyapInterestProjection,
} from './uyap-interest-crosswalk';

describe('PR-A4-R1 canonical UYAP interest crosswalk', () => {
  const accepted = [
    [InterestTypeCode.LEGAL_3095, 'NUMERIC', '1'],
    [InterestTypeCode.LEGAL_3095, 'FAIZT', 'FAIZT00002'],
    [InterestTypeCode.COMMERCIAL_AVANS_3095_2_2, 'NUMERIC', '4'],
    [InterestTypeCode.COMMERCIAL_AVANS_3095_2_2, 'FAIZT', 'FAIZT00007'],
    [InterestTypeCode.TTK_1530, 'NUMERIC', '2'],
    [InterestTypeCode.TTK_1530, 'FAIZT', 'FAIZT00017'],
    [InterestTypeCode.CONTRACTUAL, 'NUMERIC', '6'],
  ] as const;

  it('all 11 canonical rich codes are represented exactly once', () => {
    expect(Object.keys(UYAP_INTEREST_CROSSWALK).sort())
      .toEqual([...Object.values(InterestTypeCode)].sort());
  });

  it.each(accepted)('%s %s projection is owner/legal accepted as %s', (canonicalCode, projection, code) => {
    const cell = projection === 'NUMERIC'
      ? UYAP_INTEREST_CROSSWALK[canonicalCode].numeric
      : UYAP_INTEREST_CROSSWALK[canonicalCode].faizt;

    expect(cell).toMatchObject({
      verification: 'OWNER_LEGAL_ACCEPTED',
      code,
      evidence: { kind: 'OWNER_DECISION', reference: 'PR-A4-3_D1_D9' },
    });
  });

  it('every non-accepted cell remains code-less and unverified', () => {
    const acceptedKeys = new Set(accepted.map(([canonicalCode, projection]) => `${canonicalCode}:${projection}`));

    for (const canonicalCode of Object.values(InterestTypeCode)) {
      for (const projection of ['NUMERIC', 'FAIZT'] as const) {
        if (acceptedKeys.has(`${canonicalCode}:${projection}`)) continue;
        const cell = projection === 'NUMERIC'
          ? UYAP_INTEREST_CROSSWALK[canonicalCode].numeric
          : UYAP_INTEREST_CROSSWALK[canonicalCode].faizt;
        expect(cell).toMatchObject({ verification: 'UNVERIFIED', code: null });
      }
    }
  });

  it('contains no VERIFIED_OFFICIAL projection', () => {
    const cells = Object.values(UYAP_INTEREST_CROSSWALK)
      .flatMap((crosswalk) => [crosswalk.numeric, crosswalk.faizt]);
    expect(cells.some((cell) => cell.verification === 'VERIFIED_OFFICIAL')).toBe(false);
  });

  it.each(accepted.filter(([canonicalCode]) => canonicalCode !== InterestTypeCode.CONTRACTUAL))(
    'resolves %s %s without cross-projecting the other code space',
    (canonicalCode, projection, code) => {
      expect(resolveUyapInterestProjection({ interestTypeCode: canonicalCode, projection })).toEqual({
        ok: true,
        status: 'PROJECTED',
        canonicalCode,
        projection,
        verification: 'OWNER_LEGAL_ACCEPTED',
        evidence: { kind: 'OWNER_DECISION', reference: 'PR-A4-3_D1_D9' },
        code,
        interestRate: null,
      });
    },
  );

  it('resolves CONTRACTUAL only for numeric projection with a positive user-supplied rate', () => {
    expect(resolveUyapInterestProjection({
      interestTypeCode: InterestTypeCode.CONTRACTUAL,
      projection: 'NUMERIC',
      interestRate: 18.5,
    })).toEqual({
      ok: true,
      status: 'PROJECTED',
      canonicalCode: InterestTypeCode.CONTRACTUAL,
      projection: 'NUMERIC',
      verification: 'OWNER_LEGAL_ACCEPTED',
      evidence: { kind: 'OWNER_DECISION', reference: 'PR-A4-3_D1_D9' },
      code: '6',
      interestRate: 18.5,
    });
  });

  it.each([undefined, null, 0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    'fails closed for CONTRACTUAL numeric projection when rate is %s',
    (interestRate) => {
      expect(resolveUyapInterestProjection({
        interestTypeCode: InterestTypeCode.CONTRACTUAL,
        projection: 'NUMERIC',
        interestRate,
      })).toMatchObject({
        ok: false,
        status: 'REQUIRED_CONTEXT_MISSING',
        requiredContext: ['POSITIVE_USER_SUPPLIED_RATE'],
      });
    },
  );

  it('keeps CONTRACTUAL FAIZT independent and fail-closed', () => {
    expect(resolveUyapInterestProjection({
      interestTypeCode: InterestTypeCode.CONTRACTUAL,
      projection: 'FAIZT',
      interestRate: 18.5,
    })).toMatchObject({
      ok: false,
      status: 'UNVERIFIED_PROJECTION',
      requiredContext: ['POSITIVE_USER_SUPPLIED_RATE', 'EXACT_MAPPING_ACCEPTANCE'],
    });
  });

  it.each(['NUMERIC', 'FAIZT'] as const)(
    'keeps COMMERCIAL_FIXED %s projection fail-closed',
    (projection: UyapInterestProjection) => {
      expect(resolveUyapInterestProjection({
        interestTypeCode: InterestTypeCode.COMMERCIAL_FIXED,
        projection,
        interestRate: 12,
      })).toMatchObject({
        ok: false,
        status: 'UNVERIFIED_PROJECTION',
      });
    },
  );

  it('does not assign numeric 5 to deposit codes and requires explicit FAIZT context', () => {
    const depositCodes = Object.values(InterestTypeCode)
      .filter((code) => code.startsWith('MEVDUAT_'));

    for (const canonicalCode of depositCodes) {
      expect(UYAP_INTEREST_CROSSWALK[canonicalCode].numeric).toEqual(expect.objectContaining({
        verification: 'UNVERIFIED',
        code: null,
        requiredContext: ['EXACT_MAPPING_ACCEPTANCE'],
      }));
      expect(UYAP_INTEREST_CROSSWALK[canonicalCode].faizt).toEqual(expect.objectContaining({
        verification: 'UNVERIFIED',
        code: null,
        requiredContext: [
          'EXACT_MAPPING_ACCEPTANCE',
          'EXPLICIT_LEGAL_BASIS',
          'EXPLICIT_DEPOSIT_TERM',
        ],
      }));
    }
  });

  it('rejects unknown canonical identity without a fallback code', () => {
    expect(resolveUyapInterestProjection({
      interestTypeCode: 'UNKNOWN_RICH_CODE',
      projection: 'NUMERIC',
    })).toEqual({
      ok: false,
      status: 'UNKNOWN_CANONICAL_CODE',
      canonicalCode: 'UNKNOWN_RICH_CODE',
      projection: 'NUMERIC',
      requiredContext: [],
    });
  });

  it('is deeply frozen against runtime crosswalk mutation', () => {
    expect(Object.isFrozen(UYAP_INTEREST_CROSSWALK)).toBe(true);
    for (const crosswalk of Object.values(UYAP_INTEREST_CROSSWALK)) {
      expect(Object.isFrozen(crosswalk)).toBe(true);
      expect(Object.isFrozen(crosswalk.numeric)).toBe(true);
      if (crosswalk.numeric.evidence) expect(Object.isFrozen(crosswalk.numeric.evidence)).toBe(true);
      expect(Object.isFrozen(crosswalk.numeric.requiredContext)).toBe(true);
      expect(Object.isFrozen(crosswalk.faizt)).toBe(true);
      if (crosswalk.faizt.evidence) expect(Object.isFrozen(crosswalk.faizt.evidence)).toBe(true);
      expect(Object.isFrozen(crosswalk.faizt.requiredContext)).toBe(true);
    }
  });
});
