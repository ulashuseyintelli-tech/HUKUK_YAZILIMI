import { ActionCode } from '../../policy-engine/types/action-code.enum';
import {
  OFFICE_WORK_APPROVAL_POLICIES,
  OfficeWorkApprovalPolicy,
  OfficeWorkApprovalPolicySpec,
  isOfficeWorkApprovalPolicy,
} from '../office-work-routing.contract';
import {
  OFFICE_WORK_ACTION_CATEGORIES,
  OFFICE_WORK_ACTION_CATEGORY,
  OfficeWorkActionCategory,
  getOfficeWorkActionCategory,
} from '../office-work-routing-taxonomy';

/**
 * OFFICE-WR01-B01 — CONTRACT + TAXONOMY KILIDI.
 *
 * Bu spec sozlesmenin **sekline** bakar, runtime davranisi calistirmaz.
 * Iki kilit vardir:
 *  1) D-WR-3 politika sozlugu kapali ve tekildir.
 *  2) D-WR-4 siniflandirmasi `ActionCode` enum'una gore EKSIKSIZ ve TEKILDIR;
 *     enum buyudugunde bu spec (typecheck'e ek olarak) runtime'da da kirilir.
 */

/** Derleyicinin urettigi `__esModule` bayragini eleyip gercek export adlarini dondurur. */
function runtimeExportNames(moduleObject: Record<string, unknown>): string[] {
  return Object.keys(moduleObject)
    .filter((name) => name !== '__esModule')
    .sort();
}

describe('OFFICE-WR01-B01 — D-WR-3 politika sozlugu (contract)', () => {
  it('kanonik bes politikayi tam olarak icerir', () => {
    expect([...OFFICE_WORK_APPROVAL_POLICIES].sort()).toEqual(
      ['ALL', 'ANY_ONE', 'PARALLEL', 'QUORUM', 'SEQUENTIAL'].sort(),
    );
  });

  it('sozluk tekildir (duplicate politika yok)', () => {
    const unique = new Set<string>(OFFICE_WORK_APPROVAL_POLICIES);
    expect(unique.size).toBe(OFFICE_WORK_APPROVAL_POLICIES.length);
  });

  it('predikat yalniz sozluk uyelerini kabul eder', () => {
    for (const policy of OFFICE_WORK_APPROVAL_POLICIES) {
      expect(isOfficeWorkApprovalPolicy(policy)).toBe(true);
    }
    expect(isOfficeWorkApprovalPolicy('MAJORITY')).toBe(false);
    expect(isOfficeWorkApprovalPolicy('any_one')).toBe(false);
    expect(isOfficeWorkApprovalPolicy(null)).toBe(false);
    expect(isOfficeWorkApprovalPolicy(undefined)).toBe(false);
    expect(isOfficeWorkApprovalPolicy(1)).toBe(false);
  });

  it('QUORUM disindaki varyantlar karar sayisi alani TASIMAZ (tip kiliti)', () => {
    // Derleme zamani kiliti: asagidaki varyantlara `requiredDecisionCount` eklemek
    // TypeScript hatasi uretir. Runtime tarafinda da alanin bulunmadigi dogrulanir.
    const anyOne: OfficeWorkApprovalPolicySpec = { policy: 'ANY_ONE' };
    const all: OfficeWorkApprovalPolicySpec = { policy: 'ALL' };
    const sequential: OfficeWorkApprovalPolicySpec = { policy: 'SEQUENTIAL' };
    const parallel: OfficeWorkApprovalPolicySpec = { policy: 'PARALLEL' };
    const quorum: OfficeWorkApprovalPolicySpec = { policy: 'QUORUM', requiredDecisionCount: 2 };

    for (const spec of [anyOne, all, sequential, parallel]) {
      expect(Object.prototype.hasOwnProperty.call(spec, 'requiredDecisionCount')).toBe(false);
    }
    expect(quorum).toEqual({ policy: 'QUORUM', requiredDecisionCount: 2 });
  });

  it('sozlesme B01 sinirini asan bir yuzey EXPORT ETMEZ (D-WR-7 / B06 sizintisi yok)', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const contract = require('../office-work-routing.contract');
    expect(runtimeExportNames(contract)).toEqual(
      ['OFFICE_WORK_APPROVAL_POLICIES', 'isOfficeWorkApprovalPolicy'].sort(),
    );
  });
});

describe('OFFICE-WR01-B01 — D-WR-4 actionCode taksonomisi', () => {
  const allActionCodes = Object.values(ActionCode) as ActionCode[];

  it('her ActionCode tabloda YER ALIR (eksiksizlik kiliti)', () => {
    const missing = allActionCodes.filter(
      (code) => !Object.prototype.hasOwnProperty.call(OFFICE_WORK_ACTION_CATEGORY, code),
    );
    expect(missing).toEqual([]);
  });

  it('tabloda ActionCode olmayan anahtar BULUNMAZ (fazlalik kiliti)', () => {
    const known = new Set<string>(allActionCodes);
    const extra = Object.keys(OFFICE_WORK_ACTION_CATEGORY).filter((key) => !known.has(key));
    expect(extra).toEqual([]);
  });

  it('her deger kanonik kategori kumesindendir (ortulu fallback yok)', () => {
    const valid = new Set<string>(OFFICE_WORK_ACTION_CATEGORIES);
    const invalid = Object.entries(OFFICE_WORK_ACTION_CATEGORY).filter(
      ([, category]) => !valid.has(category),
    );
    expect(invalid).toEqual([]);
  });

  it('her kod TAM BIR kategoriye baglanir (coklu atama imkansiz)', () => {
    for (const code of allActionCodes) {
      const matches = OFFICE_WORK_ACTION_CATEGORIES.filter(
        (category) => OFFICE_WORK_ACTION_CATEGORY[code] === category,
      );
      expect(matches).toHaveLength(1);
    }
  });

  it('owner ratifiye kategori dagilimini korur', () => {
    const distribution = allActionCodes.reduce<Record<OfficeWorkActionCategory, number>>(
      (acc, code) => {
        acc[OFFICE_WORK_ACTION_CATEGORY[code]] += 1;
        return acc;
      },
      { FINANCIAL: 0, JUDICIAL: 0, ADMIN: 0 },
    );

    expect(allActionCodes).toHaveLength(48);
    expect(distribution).toEqual({ FINANCIAL: 21, JUDICIAL: 21, ADMIN: 6 });
  });

  it('owner kararinin exact mapping kalemlerini birebir uygular', () => {
    // Salt-okuma grubu — konu alanina gore (owner karari §2).
    expect(getOfficeWorkActionCategory(ActionCode.UYAP_QUERY)).toBe('JUDICIAL');
    expect(getOfficeWorkActionCategory(ActionCode.SYNC_UYAP)).toBe('JUDICIAL');
    expect(getOfficeWorkActionCategory(ActionCode.QUERY_ASSETS)).toBe('JUDICIAL');
    expect(getOfficeWorkActionCategory(ActionCode.QUERY_BANK_ACCOUNTS)).toBe('JUDICIAL');
    expect(getOfficeWorkActionCategory(ActionCode.QUERY_VEHICLES)).toBe('JUDICIAL');
    expect(getOfficeWorkActionCategory(ActionCode.VIEW_FINANCE)).toBe('FINANCIAL');

    // Karma etkili grup — baskin etkiye gore (owner karari §3).
    expect(getOfficeWorkActionCategory(ActionCode.FINALIZE_CASE)).toBe('FINANCIAL');
    expect(getOfficeWorkActionCategory(ActionCode.REOPEN_CASE)).toBe('JUDICIAL');
    expect(getOfficeWorkActionCategory(ActionCode.EDIT_CASE)).toBe('ADMIN');
    expect(getOfficeWorkActionCategory(ActionCode.ADD_NAFAKA_PERIOD)).toBe('FINANCIAL');
    expect(getOfficeWorkActionCategory(ActionCode.GENERATE_DOC)).toBe('JUDICIAL');
    expect(getOfficeWorkActionCategory(ActionCode.SEND_DEBTOR_MSG)).toBe('JUDICIAL');
  });

  it('kategori kumesi kapalidir ve tekildir', () => {
    expect([...OFFICE_WORK_ACTION_CATEGORIES].sort()).toEqual(['ADMIN', 'FINANCIAL', 'JUDICIAL']);
    const unique = new Set<string>(OFFICE_WORK_ACTION_CATEGORIES);
    expect(unique.size).toBe(OFFICE_WORK_ACTION_CATEGORIES.length);
  });
});

describe('OFFICE-WR01-B01 — kapsam siniri', () => {
  it('taksonomi ile politika sozlugu AYRI eksenlerdir (birbirine turemez)', () => {
    const policyValues = new Set<string>(OFFICE_WORK_APPROVAL_POLICIES);
    const categoryValues = new Set<string>(OFFICE_WORK_ACTION_CATEGORIES);
    for (const category of categoryValues) {
      expect(policyValues.has(category)).toBe(false);
    }
  });

  it('kategori tek basina politika URETMEZ (D-WR-7 cevaplanmadi)', () => {
    // B01 hicbir kategori→politika esleme fonksiyonu saglamaz. Boyle bir yuzeyin
    // eklenmesi D-WR-7'yi ortulu bicimde cevaplamak olurdu.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const taxonomy = require('../office-work-routing-taxonomy');
    expect(runtimeExportNames(taxonomy)).toEqual(
      [
        'OFFICE_WORK_ACTION_CATEGORIES',
        'OFFICE_WORK_ACTION_CATEGORY',
        'getOfficeWorkActionCategory',
      ].sort(),
    );

    // Tip duzeyinde de karisim yok: politika tipi kategori degeri kabul etmez.
    const policy: OfficeWorkApprovalPolicy = 'ANY_ONE';
    expect(isOfficeWorkApprovalPolicy(policy)).toBe(true);
  });
});
