import { DebtorRole } from '@prisma/client';

import { UyapCaseMapperService } from '../uyap-case-mapper.service';

type RoleMappingHarness = {
  mapDebtorRole(role: DebtorRole): 'ALACAKLI' | 'BORCLU' | 'KEFIL' | 'UCUNCU_SAHIS' | 'REHIN_ALACAKLISI' | 'IPOTEK_ALACAKLISI';
};

describe('DBP-P2-SEC-P02 (second UYAP mapper): mapDebtorRole behavior-lock', () => {
  const mapper = new UyapCaseMapperService({} as any);
  const harness = mapper as unknown as RoleMappingHarness;

  describe('12/12 mevcut DebtorRole sonucu AS-IS korunuyor (sifir davranis degisikligi)', () => {
    it.each([
      [DebtorRole.ASIL_BORCLU, 'BORCLU'],
      [DebtorRole.MUSETEREK_BORCLU, 'BORCLU'],
      [DebtorRole.ADI_KEFIL, 'KEFIL'],
      [DebtorRole.MUTESELSIL_KEFIL, 'KEFIL'],
      [DebtorRole.MIRASCI, 'BORCLU'],
      [DebtorRole.AVAL, 'BORCLU'],
      [DebtorRole.CIRANTA, 'BORCLU'],
      [DebtorRole.KESIDECI, 'BORCLU'],
      [DebtorRole.LEHDAR, 'BORCLU'],
      [DebtorRole.MUHATAP, 'BORCLU'],
      [DebtorRole.TASFIYE_MEMURU, 'BORCLU'],
      [DebtorRole.IFLAS_MASASI, 'BORCLU'],
    ] as const)('%s -> %s (degismedi)', (role, expected) => {
      expect(harness.mapDebtorRole(role)).toBe(expected);
    });
  });

  describe('exhaustiveness guard: DebtorRole enum genelinde hata firlatmaz', () => {
    it('12 gercek deger de tanimli, non-throwing bir sonuc doner', () => {
      for (const role of Object.values(DebtorRole)) {
        expect(() => harness.mapDebtorRole(role)).not.toThrow();
        expect(typeof harness.mapDebtorRole(role)).toBe('string');
      }
    });
  });

  describe('AS-IS istisnalar (TASFIYE_MEMURU / IFLAS_MASASI) - owner/LDO karari bekliyor', () => {
    it.each([DebtorRole.TASFIYE_MEMURU, DebtorRole.IFLAS_MASASI])(
      '%s: explicit branch ile ele alinir, mapping tablosu disinda kalir',
      (role) => {
        expect(harness.mapDebtorRole(role)).toBe('BORCLU');
      },
    );
  });
});
