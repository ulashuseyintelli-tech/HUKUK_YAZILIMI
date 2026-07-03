import { BadRequestException } from '@nestjs/common';
import { defaultInterestAccrualStatusForItemType, validateInterestAccrualState } from '../interest-accrual-policy';

describe('TBK100 Interest Accrual Contract v1 — defaultInterestAccrualStatusForItemType', () => {
  it.each(['EXPENSE', 'FEE', 'ATTORNEY_FEE', 'CHECK_PENALTY', 'PENALTY', 'CONTRACTUAL_PENALTY', 'OTHER', 'TAX_KDV', 'TAX_BSMV', 'TAX_KKDF'])(
    '%s → NO_INTEREST (mekanik itemType sınıflaması)',
    (itemType) => {
      expect(defaultInterestAccrualStatusForItemType(itemType)).toBe('NO_INTEREST');
    },
  );

  it.each(['PRINCIPAL', 'INTEREST', 'PRE_INTEREST', 'POST_INTEREST'])('%s → UNKNOWN (DB default ile aynı)', (itemType) => {
    expect(defaultInterestAccrualStatusForItemType(itemType)).toBe('UNKNOWN');
  });

  it('COMMISSION gerçek ClaimItemType enum üyesi DEĞİL — ClaimItem hiç bu değerle saklanmaz (mapItemType EXPENSE\'e çevirir), listede yok', () => {
    expect(defaultInterestAccrualStatusForItemType('COMMISSION')).toBe('UNKNOWN');
  });
});

describe('TBK100 Interest Accrual Contract v1 — validateInterestAccrualState', () => {
  describe('ACCRUES', () => {
    it('interestType + interestStartDate + provenance hepsi varsa geçer', () => {
      expect(() =>
        validateInterestAccrualState(
          {
            interestAccrualStatus: 'ACCRUES',
            interestType: 'YASAL',
            interestStartDate: '2026-01-01',
            interestStartDateProvenance: 'DOCUMENT_DUE_DATE',
          },
          false,
        ),
      ).not.toThrow();
    });

    it('interestType eksikse reddeder', () => {
      expect(() =>
        validateInterestAccrualState(
          { interestAccrualStatus: 'ACCRUES', interestStartDate: '2026-01-01', interestStartDateProvenance: 'DOCUMENT_DUE_DATE' },
          false,
        ),
      ).toThrow(BadRequestException);
    });

    it('provenance eksikse reddeder', () => {
      expect(() =>
        validateInterestAccrualState(
          { interestAccrualStatus: 'ACCRUES', interestType: 'YASAL', interestStartDate: '2026-01-01' },
          false,
        ),
      ).toThrow(BadRequestException);
    });

    it('interestStartDate eksikse VE provenance ENFORCEMENT_PROCEEDING_DATE DEĞİLSE reddeder (sessiz fallback yasak)', () => {
      expect(() =>
        validateInterestAccrualState(
          { interestAccrualStatus: 'ACCRUES', interestType: 'YASAL', interestStartDateProvenance: 'DOCUMENT_DUE_DATE' },
          false,
        ),
      ).toThrow(BadRequestException);
    });

    it('interestStartDate eksik AMA provenance ENFORCEMENT_PROCEEDING_DATE ise geçer (motor Case.caseDate\'ten çözer)', () => {
      expect(() =>
        validateInterestAccrualState(
          { interestAccrualStatus: 'ACCRUES', interestType: 'YASAL', interestStartDateProvenance: 'ENFORCEMENT_PROCEEDING_DATE' },
          false,
        ),
      ).not.toThrow();
    });
  });

  describe('NO_INTEREST', () => {
    it('interestType/interestStartDate/provenance hepsi boşsa, audit istenmemişse geçer', () => {
      expect(() => validateInterestAccrualState({ interestAccrualStatus: 'NO_INTEREST' }, false)).not.toThrow();
    });

    it('interestType dolu bırakılmışsa reddeder (NO_INTEREST + faiz konfigi çelişkili)', () => {
      expect(() =>
        validateInterestAccrualState({ interestAccrualStatus: 'NO_INTEREST', interestType: 'YASAL' }, false),
      ).toThrow(BadRequestException);
    });

    it('açıkça istenmişse (caller dto\'da NO_INTEREST yazdıysa) audit alanları zorunlu', () => {
      expect(() => validateInterestAccrualState({ interestAccrualStatus: 'NO_INTEREST' }, true)).toThrow(BadRequestException);
    });

    it('açıkça istenmiş + audit alanları doluysa geçer', () => {
      expect(() =>
        validateInterestAccrualState(
          { interestAccrualStatus: 'NO_INTEREST', noInterestReason: 'sözleşme faizsiz', noInterestConfirmedById: 'user-1' },
          true,
        ),
      ).not.toThrow();
    });

    it('mekanik itemType-varsayımı (explicitlyRequested=false) audit İSTEMEZ — migration backfill senaryosu', () => {
      expect(() => validateInterestAccrualState({ interestAccrualStatus: 'NO_INTEREST' }, false)).not.toThrow();
    });
  });

  describe('UNKNOWN', () => {
    it('hiçbir kısıt yok — serbest', () => {
      expect(() => validateInterestAccrualState({ interestAccrualStatus: 'UNKNOWN' }, false)).not.toThrow();
    });
  });
});
