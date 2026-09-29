import {
  PayerLiabilityScopeError,
  allocationHoldReason,
  hasRestrictedLiability,
  isItemLiableForDebtor,
  scopeItemsToPayer,
} from '../payer-liability-scope';

const all = (id: string) => ({ id, isAllDebtorsLiable: true, liableDebtorIds: [] as string[] });
const only = (id: string, debtors: string[]) => ({ id, isAllDebtorsLiable: false, liableDebtorIds: debtors });

const codeOf = (fn: () => unknown) => {
  try {
    fn();
  } catch (error) {
    return error instanceof PayerLiabilityScopeError ? error.code : 'OTHER';
  }
  return 'NO_ERROR';
};

describe('K3-L hesabına ödeme yapılan borçluya göre mahsup kapsamı (owner kararları 2026-09-28/29)', () => {
  const items = [all('principal'), only('penalty', ['kesideci'])];

  it('kısıtlı kalem yoksa girdi aynen döner ve ödeyen yok sayılır (bugünkü davranış)', () => {
    expect(scopeItemsToPayer([all('a'), all('b')], undefined).map((i) => i.id)).toEqual(['a', 'b']);
    expect(scopeItemsToPayer([all('a')], 'herhangi').map((i) => i.id)).toEqual(['a']);
    expect(hasRestrictedLiability([all('a')])).toBe(false);
  });

  it('ciranta ödemesi keşideciye ait tazminata ulaşmaz; keşideci ödemesi iki kaleme de ulaşır', () => {
    expect(scopeItemsToPayer(items, 'ciranta').map((i) => i.id)).toEqual(['principal']);
    expect(scopeItemsToPayer(items, 'kesideci').map((i) => i.id)).toEqual(['principal', 'penalty']);
  });

  it('mahsup motoru (savunma katmanı): borçlu belirsizse mahsup etmez', () => {
    expect(codeOf(() => scopeItemsToPayer(items, null))).toBe('ON_BEHALF_DEBTOR_REQUIRED');
    expect(codeOf(() => scopeItemsToPayer(items, ''))).toBe('ON_BEHALF_DEBTOR_REQUIRED');
    expect(codeOf(() => scopeItemsToPayer([only('penalty', ['kesideci'])], 'ciranta'))).toBe('ON_BEHALF_DEBTOR_NOT_LIABLE');
  });

  it('bekletme kararı: kısıtlı kalem yoksa asla; belirsiz / sorumsuz borçluda bekletme sebebi', () => {
    expect(allocationHoldReason([all('a')], null)).toBeNull();
    expect(allocationHoldReason(items, undefined)).toBe('ON_BEHALF_DEBTOR_REQUIRED');
    expect(allocationHoldReason([only('penalty', ['kesideci'])], 'ciranta')).toBe('ON_BEHALF_DEBTOR_NOT_LIABLE');
    expect(allocationHoldReason(items, 'ciranta')).toBeNull();
  });

  it('sorumlusu olmayan kısıtlı kalem hiçbir ödemeye açılmaz', () => {
    expect(isItemLiableForDebtor(only('x', []), 'kesideci')).toBe(false);
    expect(isItemLiableForDebtor({ isAllDebtorsLiable: false, liableDebtorIds: null }, 'kesideci')).toBe(false);
  });
});
