import { BadRequestException } from '@nestjs/common';
import { InterestTypeCode } from '@prisma/client';
import { normalizeInterestWriteIntent } from '../interest-write-admission';

describe('PR-A2 rich interest write admission', () => {
  it.each([
    ['LEGAL_3095', 'YASAL'],
    ['COMMERCIAL_AVANS_3095_2_2', 'TICARI'],
    ['MEVDUAT_TL_BANKALARCA', null],
    ['MEVDUAT_TL_KAMU', null],
  ] as const)('%s variable kodunu null oranla normalize eder', (interestTypeCode, legacyInterestType) => {
    expect(normalizeInterestWriteIntent({ interestTypeCode, interestRate: 99 })).toEqual({
      mode: 'VARIABLE',
      interestTypeCode,
      legacyInterestType,
      interestRate: null,
    });
  });

  it.each([
    [InterestTypeCode.COMMERCIAL_FIXED, 'SABIT'],
    [InterestTypeCode.CONTRACTUAL, null],
  ] as const)('%s fixed kodu pozitif yüzdeyle kabul eder', (interestTypeCode, legacyInterestType) => {
    expect(normalizeInterestWriteIntent({ interestTypeCode, interestRate: 12.5 })).toEqual({
      mode: 'FIXED', interestTypeCode, legacyInterestType, interestRate: 12.5,
    });
  });

  it.each([undefined, null, 0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    'geçersiz fixed rate %s değerini reddeder',
    (interestRate) => {
      expect(() => normalizeInterestWriteIntent({ interestTypeCode: 'CONTRACTUAL', interestRate }))
        .toThrow(BadRequestException);
    },
  );

  it('YOK niyetini zorunlu, trim edilmiş reason ile explicit NO_INTEREST yapar', () => {
    expect(normalizeInterestWriteIntent({ explicitNoInterest: true, noInterestReason: '  sözleşmede faiz yok  ', interestRate: null }))
      .toEqual({
        mode: 'NO_INTEREST', interestTypeCode: null, legacyInterestType: null,
        interestRate: null, noInterestReason: 'sözleşmede faiz yok',
      });
  });

  it('reason olmayan NO_INTEREST ve unknown kodu fail-closed reddeder', () => {
    expect(() => normalizeInterestWriteIntent({ explicitNoInterest: true, noInterestReason: ' ' }))
      .toThrow(BadRequestException);
    expect(() => normalizeInterestWriteIntent({ interestTypeCode: 'UNKNOWN' }))
      .toThrow(BadRequestException);
  });

  it('bounded legacy compatibility uygular; belirsiz legacy değeri reddeder', () => {
    expect(normalizeInterestWriteIntent({ legacyInterestType: 'YASAL' })).toMatchObject({
      interestTypeCode: InterestTypeCode.LEGAL_3095,
    });
    expect(() => normalizeInterestWriteIntent({ legacyInterestType: 'TEMERRUT' }))
      .toThrow(BadRequestException);
  });
});
