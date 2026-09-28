import {
  CekLiabilityError,
  isCekLiabilityStillValid,
  splitCekLiability,
  type CekCaseDebtorRoleRow,
} from '../formation-cek/cek-liability-roles';

const row = (debtorId: string, role: string, avalForDebtorId: string | null = null, lifecycleStatus = 'ACTIVE'): CekCaseDebtorRoleRow => ({
  debtorId,
  role,
  avalForDebtorId,
  lifecycleStatus,
});

const codeOf = (fn: () => unknown) => {
  try {
    fn();
  } catch (error) {
    return error instanceof CekLiabilityError ? error.code : 'OTHER';
  }
  return 'NO_ERROR';
};

describe('K3-L çek alacağında kalem bazlı borçlu kümeleri (owner kararı: tazminat yalnız keşideci + keşideci lehine aval)', () => {
  it('keşideci + yalnız ciranta: bedel ikisine, tazminat yalnız keşideciye', () => {
    expect(splitCekLiability([row('A', 'KESIDECI'), row('B', 'CIRANTA')], ['B', 'A'])).toEqual({
      principalDebtorIds: ['A', 'B'],
      penaltyDebtorIds: ['A'],
    });
  });

  it('keşideci lehine aval veren tazminattan sorumlu; ciranta lehine aval veren değil', () => {
    const rows = [row('A', 'KESIDECI'), row('B', 'CIRANTA'), row('C', 'AVAL', 'A'), row('D', 'AVAL', 'B')];
    expect(splitCekLiability(rows, ['A', 'B', 'C', 'D'])).toEqual({
      principalDebtorIds: ['A', 'B', 'C', 'D'],
      penaltyDebtorIds: ['A', 'C'],
    });
  });

  it('aynı kişi hem ciranta hem keşideci lehine aval ise tazminata girer', () => {
    const rows = [row('A', 'KESIDECI'), row('B', 'CIRANTA'), row('B', 'AVAL', 'A')];
    expect(splitCekLiability(rows, ['A', 'B']).penaltyDebtorIds).toEqual(['A', 'B']);
  });

  it('keşideci takip edilmese de keşideci lehine aval veren tazminattan sorumlu', () => {
    const rows = [row('A', 'KESIDECI'), row('C', 'AVAL', 'A')];
    expect(splitCekLiability(rows, ['C'])).toEqual({ principalDebtorIds: ['C'], penaltyDebtorIds: ['C'] });
  });

  it.each([
    ['dosyada olmayan borçlu', [row('A', 'KESIDECI')], ['A', 'X'], 'LIABLE_DEBTOR_NOT_IN_CASE'],
    ['pasif borçlu', [row('A', 'KESIDECI'), row('B', 'CIRANTA', null, 'PASSIVE')], ['A', 'B'], 'LIABLE_DEBTOR_NOT_IN_CASE'],
    ['çek borçlusu olmayan rol (ASIL_BORCLU)', [row('A', 'KESIDECI'), row('B', 'ASIL_BORCLU')], ['A', 'B'], 'CHECK_DEBTOR_ROLE_REQUIRED'],
    ['muhatap banka', [row('A', 'KESIDECI'), row('M', 'MUHATAP')], ['A', 'M'], 'CHECK_DEBTOR_ROLE_REQUIRED'],
    ['lehine bilgisi olmayan aval veren', [row('A', 'KESIDECI'), row('C', 'AVAL')], ['A', 'C'], 'AVAL_BENEFICIARY_REQUIRED'],
    ['tazminattan sorumlu kimse yok', [row('A', 'KESIDECI'), row('B', 'CIRANTA')], ['B'], 'CHECK_PENALTY_NO_LIABLE_DEBTOR'],
    ['pasif keşideci lehine aval', [row('A', 'KESIDECI', null, 'PASSIVE'), row('C', 'AVAL', 'A')], ['C'], 'CHECK_PENALTY_NO_LIABLE_DEBTOR'],
  ])('%s → %s', (_name, rows, pursued, code) => {
    expect(codeOf(() => splitCekLiability(rows as CekCaseDebtorRoleRow[], pursued as string[]))).toBe(code);
  });

  it('onay anı yeniden doğrulama: rol değişirse kalem uygulanmaz', () => {
    const before = [row('A', 'KESIDECI'), row('B', 'CIRANTA')];
    expect(isCekLiabilityStillValid(before, 'CHECK_PENALTY', ['A'])).toBe(true);
    expect(isCekLiabilityStillValid(before, 'PRINCIPAL', ['A', 'B'])).toBe(true);
    const roleChanged = [row('A', 'CIRANTA'), row('B', 'CIRANTA')];
    expect(isCekLiabilityStillValid(roleChanged, 'CHECK_PENALTY', ['A'])).toBe(false);
    expect(isCekLiabilityStillValid(roleChanged, 'PRINCIPAL', ['A', 'B'])).toBe(true);
    expect(isCekLiabilityStillValid([row('A', 'KESIDECI')], 'PRINCIPAL', ['A', 'B'])).toBe(false);
    expect(isCekLiabilityStillValid(before, 'CHECK_PENALTY', [])).toBe(false);
  });
});
