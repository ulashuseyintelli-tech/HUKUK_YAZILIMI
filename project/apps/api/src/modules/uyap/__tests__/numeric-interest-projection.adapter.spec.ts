import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { InterestAccrualStatus, InterestTypeCode } from '@prisma/client';

import {
  NumericInterestProjectionInput,
  resolveDormantNumericInterestProjection,
} from '../numeric-interest-projection.adapter';

const START = new Date('2025-01-15T00:00:00.000Z');

function input(
  patch: Partial<NumericInterestProjectionInput> = {},
): NumericInterestProjectionInput {
  return {
    claimItemId: 'claim-1',
    interestAccrualStatus: InterestAccrualStatus.ACCRUES,
    interestTypeCode: InterestTypeCode.LEGAL_3095,
    legacyInterestType: null,
    interestRate: null,
    interestStartDate: START,
    interestStartDateProvenance: 'MANUAL_LAWYER_CONFIRMED',
    ...patch,
  };
}

describe('PR-A4-N1 dormant numeric projection adapter', () => {
  it('projects owner-accepted rich variable identity without a fallback', () => {
    expect(resolveDormantNumericInterestProjection(input())).toEqual({
      ok: true,
      status: 'PROJECTED',
      claimItemId: 'claim-1',
      sourceAuthority: 'RICH',
      canonicalCode: InterestTypeCode.LEGAL_3095,
      numericCode: '1',
      verification: 'OWNER_LEGAL_ACCEPTED',
      evidence: { kind: 'OWNER_DECISION', reference: 'PR-A4-3_D1_D9' },
      interestRate: null,
      interestStartDate: '2025-01-15',
    });
  });

  it('projects CONTRACTUAL only with a positive finite owner-supplied rate', () => {
    expect(resolveDormantNumericInterestProjection(input({
      interestTypeCode: InterestTypeCode.CONTRACTUAL,
      interestRate: '18.50',
    }))).toMatchObject({
      ok: true,
      status: 'PROJECTED',
      canonicalCode: InterestTypeCode.CONTRACTUAL,
      numericCode: '6',
      interestRate: 18.5,
    });
  });

  it.each([null, 0, -1, Number.NaN, Number.POSITIVE_INFINITY, 'not-a-rate'])(
    'rejects invalid fixed rate %p',
    (interestRate) => {
      expect(resolveDormantNumericInterestProjection(input({
        interestTypeCode: InterestTypeCode.CONTRACTUAL,
        interestRate,
      }))).toMatchObject({ ok: false, status: 'INVALID_RATE' });
    },
  );

  it('rejects a stray persisted rate on a variable code', () => {
    expect(resolveDormantNumericInterestProjection(input({ interestRate: 12 }))).toMatchObject({
      ok: false,
      status: 'INVALID_RATE',
      detail: 'VARIABLE_RATE_MUST_BE_NULL',
    });
  });

  it.each([
    InterestTypeCode.COMMERCIAL_FIXED,
    InterestTypeCode.MEVDUAT_TL_BANKALARCA,
    InterestTypeCode.MEVDUAT_USD_KAMU,
  ])('keeps unverified numeric cell %s fail-closed', (interestTypeCode) => {
    const fixed = interestTypeCode === InterestTypeCode.COMMERCIAL_FIXED;
    expect(resolveDormantNumericInterestProjection(input({
      interestTypeCode,
      legacyInterestType: fixed ? 'SABIT' : null,
      interestRate: fixed ? 20 : null,
    }))).toMatchObject({
      ok: false,
      status: 'UNVERIFIED',
      detail: 'PROJECTION_NOT_OWNER_ACCEPTED',
    });
  });

  it('rejects unknown rich identity without projecting 99', () => {
    expect(resolveDormantNumericInterestProjection(input({
      interestTypeCode: 'UNKNOWN_RICH_CODE',
    }))).toMatchObject({
      ok: false,
      status: 'UNKNOWN_CANONICAL_CODE',
      canonicalCode: 'UNKNOWN_RICH_CODE',
    });
  });

  it('requires an explicit valid start date and never accepts a due-date fallback', () => {
    expect(resolveDormantNumericInterestProjection(input({ interestStartDate: null })))
      .toMatchObject({ ok: false, status: 'MISSING_START_DATE' });
    expect(resolveDormantNumericInterestProjection(input({ interestStartDate: '2025-02-30' })))
      .toMatchObject({ ok: false, status: 'MISSING_START_DATE' });
  });

  it('emits NO_INTEREST omission only for a coherent explicit state', () => {
    expect(resolveDormantNumericInterestProjection(input({
      interestAccrualStatus: InterestAccrualStatus.NO_INTEREST,
      interestTypeCode: null,
      interestStartDate: null,
      interestStartDateProvenance: null,
    }))).toEqual({
      ok: true,
      status: 'NO_INTEREST',
      claimItemId: 'claim-1',
      omitInterestElement: true,
    });
  });

  it('rejects NO_INTEREST carrying any interest configuration', () => {
    expect(resolveDormantNumericInterestProjection(input({
      interestAccrualStatus: InterestAccrualStatus.NO_INTEREST,
    }))).toMatchObject({
      ok: false,
      status: 'INVALID_INTEREST_STATE',
      detail: 'NO_INTEREST_CONFIGURATION_CONFLICT',
    });
  });

  it('does not treat UNKNOWN accrual status as NO_INTEREST or ACCRUES', () => {
    expect(resolveDormantNumericInterestProjection(input({
      interestAccrualStatus: InterestAccrualStatus.UNKNOWN,
    }))).toMatchObject({
      ok: false,
      status: 'INVALID_INTEREST_STATE',
      detail: 'ACCRUAL_STATUS_NOT_RESOLVED',
    });
  });

  it('accepts an exact rich/legacy mirror but rejects mirror drift', () => {
    expect(resolveDormantNumericInterestProjection(input({ legacyInterestType: 'YASAL' })))
      .toMatchObject({ ok: true, status: 'PROJECTED', numericCode: '1' });

    expect(resolveDormantNumericInterestProjection(input({
      interestTypeCode: InterestTypeCode.CONTRACTUAL,
      legacyInterestType: 'YASAL',
      interestRate: 18,
    }))).toMatchObject({
      ok: false,
      status: 'RICH_LEGACY_MISMATCH',
      detail: 'RICH_LEGACY_MIRROR_CONFLICT',
    });
  });

  it('allows only lossless YASAL legacy-only compatibility', () => {
    expect(resolveDormantNumericInterestProjection(input({
      interestTypeCode: null,
      legacyInterestType: 'YASAL',
    }))).toMatchObject({
      ok: true,
      status: 'PROJECTED',
      sourceAuthority: 'STRICT_LEGACY_COMPATIBILITY',
      canonicalCode: InterestTypeCode.LEGAL_3095,
      numericCode: '1',
    });
  });

  it.each(['TICARI', 'SABIT', 'AVANS', 'TEMERRUT', 'YOKSUN', 'AKIT', 'OTHER'])(
    'rejects ambiguous legacy-only identity %s',
    (legacyInterestType) => {
      expect(resolveDormantNumericInterestProjection(input({
        interestTypeCode: null,
        legacyInterestType,
      }))).toMatchObject({
        ok: false,
        status: 'LEGACY_AMBIGUOUS',
        detail: 'LEGACY_IDENTITY_NOT_LOSSLESS',
      });
    },
  );

  it('rejects ACCRUES without ClaimItem interest authority', () => {
    expect(resolveDormantNumericInterestProjection(input({
      interestTypeCode: null,
      legacyInterestType: null,
    }))).toMatchObject({
      ok: false,
      status: 'INVALID_INTEREST_STATE',
      detail: 'INTEREST_AUTHORITY_MISSING',
    });
  });

  it('has exactly one authorized production consumer and no controller/FAIZT/submit import', () => {
    const sourceRoot = resolve(__dirname, '..');
    const numericXmlConsumer = resolve(sourceRoot, 'uyap-xml.service.ts');
    const consumers = [
      resolve(sourceRoot, 'uyap.controller.ts'),
      resolve(sourceRoot, 'uyap.service.ts'),
      resolve(sourceRoot, '..', 'uyap-export', 'uyap-case-mapper.service.ts'),
      resolve(sourceRoot, '..', 'uyap-export', 'uyap-export.service.ts'),
      resolve(sourceRoot, '..', 'uyap-export', 'uyap-xml-builder.service.ts'),
    ];

    const numericXmlSource = readFileSync(numericXmlConsumer, 'utf8');
    expect(numericXmlSource).toContain('numeric-interest-projection.adapter');
    expect(numericXmlSource.match(/resolveDormantNumericInterestProjection/g)).toHaveLength(2);

    for (const consumer of consumers) {
      const source = readFileSync(consumer, 'utf8');
      expect(source).not.toContain('numeric-interest-projection.adapter');
      expect(source).not.toContain('uyap-interest-crosswalk');
    }
  });
});
