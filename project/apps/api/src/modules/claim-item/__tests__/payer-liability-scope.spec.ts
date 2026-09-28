import {
  PayerLiabilityScopeError,
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

describe('K3-L ödeyen borçlu mahsup kapsamı (owner kararları 2026-09-28)', () => {
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

  it('kısıtlı kalemli dosyada ödeyensiz tahsilat reddedilir', () => {
    expect(codeOf(() => scopeItemsToPayer(items, null))).toBe('PAYER_DEBTOR_REQUIRED');
    expect(codeOf(() => scopeItemsToPayer(items, ''))).toBe('PAYER_DEBTOR_REQUIRED');
  });

  it('ödeyenin sorumlu olduğu kalem yoksa reddedilir', () => {
    expect(codeOf(() => scopeItemsToPayer([only('penalty', ['kesideci'])], 'ciranta'))).toBe('PAYER_NOT_LIABLE_FOR_ANY_ITEM');
  });

  it('sorumlusu olmayan kısıtlı kalem hiçbir ödemeye açılmaz', () => {
    expect(isItemLiableForDebtor(only('x', []), 'kesideci')).toBe(false);
    expect(isItemLiableForDebtor({ isAllDebtorsLiable: false, liableDebtorIds: null }, 'kesideci')).toBe(false);
  });
});
