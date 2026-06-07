/**
 * resolveInitialPolicy — unit tests (INTEREST_POLICY_ASSIGNED payload üretimi, doc 14)
 *
 * Bu, case açılışında emit edilecek INTEREST_POLICY_ASSIGNED event payload'unu
 * takip tipinin faiz stratejisinden türeten saf fonksiyondur.
 */

import { resolveInitialPolicy, CaseType } from '../interest-strategy.config';

describe('resolveInitialPolicy', () => {
  it('KAMBIYO_CEK → ticari avans faizi, ibraz tarihi, dto.startDate', () => {
    expect(resolveInitialPolicy(CaseType.KAMBIYO_CEK, { startDate: '2025-01-15' })).toEqual({
      interestType: 'COMMERCIAL_AVANS_3095_2_2',
      rateSeriesSource: 'TCMB_AVANS',
      startEvent: 'PRESENTATION_DATE',
      startDate: '2025-01-15',
      dayCountBasis: 365,
      compoundingRule: 'NONE',
      interpretationProfileId: 'DEFAULT_TBK100_V1',
      allocationPolicyId: 'TBK100_STANDARD',
      debtNature: 'COMMERCIAL',
      caseTypeClassification: 'KAMBIYO_CEK',
      isDefaultProfile: true,
    });
  });

  it('ILAMSIZ_GENEL → AUTO_BY_DEBT_NATURE çözümü: CIVIL → LEGAL_3095; interestStartDate önceliği', () => {
    expect(
      resolveInitialPolicy(CaseType.ILAMSIZ_GENEL, { interestStartDate: '2025-02-01', startDate: '2025-01-01' }),
    ).toEqual({
      interestType: 'LEGAL_3095',
      rateSeriesSource: 'TCMB_AVANS',
      startEvent: 'DUE_DATE',
      startDate: '2025-02-01', // interestStartDate, startDate'i ezer
      dayCountBasis: 365,
      compoundingRule: 'NONE',
      interpretationProfileId: 'DEFAULT_TBK100_V1',
      allocationPolicyId: 'TBK100_STANDARD',
      debtNature: 'CIVIL',
      caseTypeClassification: 'ILAMSIZ_GENEL',
      isDefaultProfile: true,
    });
  });

  it('TTK_1530_SUPPLY → TTK 1530, TCMB_TTK1530', () => {
    expect(resolveInitialPolicy(CaseType.TTK_1530_SUPPLY, { startDate: '2025-03-03' })).toEqual({
      interestType: 'TTK_1530',
      rateSeriesSource: 'TCMB_TTK1530',
      startEvent: 'DUE_DATE',
      startDate: '2025-03-03',
      dayCountBasis: 365,
      compoundingRule: 'NONE',
      interpretationProfileId: 'DEFAULT_TBK100_V1',
      allocationPolicyId: 'TBK100_STANDARD',
      debtNature: 'COMMERCIAL',
      caseTypeClassification: 'TTK_1530_SUPPLY',
      isDefaultProfile: true,
    });
  });

  describe('startDate önceliği: interestStartDate ?? startDate ?? now()', () => {
    it('yalnız startDate verilirse onu kullanır', () => {
      expect(resolveInitialPolicy(CaseType.KAMBIYO_CEK, { startDate: '2025-05-05' }).startDate).toBe('2025-05-05');
    });

    it('hiç tarih yoksa geçerli ISO8601 (now) üretir', () => {
      const startDate = resolveInitialPolicy(CaseType.KAMBIYO_CEK).startDate;
      expect(typeof startDate).toBe('string');
      expect(startDate).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });
  });

  it('Anayasa D: payload hesaplanmış değer alanları taşımaz', () => {
    const payload = resolveInitialPolicy(CaseType.KAMBIYO_CEK, { startDate: '2025-01-15' });
    expect(payload).not.toHaveProperty('calculatedInterest');
    expect(payload).not.toHaveProperty('currentBalance');
    expect(payload).not.toHaveProperty('segments');
    expect(payload).not.toHaveProperty('rateValues');
  });
});
