import { Logger } from '@nestjs/common';
import { DebtorRole } from '@prisma/client';

import { PrismaService } from '../../../prisma/prisma.service';
import { UyapXmlService, UYAP_ROL_TURLERI } from '../uyap-xml.service';

type RoleMappingHarness = {
  mapDebtorRoleToUyapKod(role: DebtorRole): string;
};

describe('DBP-P2-SEC-P01 (LRV-02): mapDebtorRoleToUyapKod', () => {
  const service = new UyapXmlService({} as PrismaService);
  const harness = service as unknown as RoleMappingHarness;

  describe('correctly-mapped roles (UYAP exchange.dtd kodu mevcut)', () => {
    it.each([
      [DebtorRole.ASIL_BORCLU, UYAP_ROL_TURLERI.BORCLU.kod],
      [DebtorRole.MUSETEREK_BORCLU, UYAP_ROL_TURLERI.MUSTEREN_BORCLU.kod],
      [DebtorRole.ADI_KEFIL, UYAP_ROL_TURLERI.KEFIL.kod],
      [DebtorRole.MUTESELSIL_KEFIL, UYAP_ROL_TURLERI.KEFIL.kod],
      [DebtorRole.AVAL, UYAP_ROL_TURLERI.AVALCI.kod],
      [DebtorRole.CIRANTA, UYAP_ROL_TURLERI.CIRANTA.kod],
      [DebtorRole.LEHDAR, UYAP_ROL_TURLERI.LEHTAR.kod],
      [DebtorRole.KESIDECI, UYAP_ROL_TURLERI.KESIDECI.kod],
      [DebtorRole.MUHATAP, UYAP_ROL_TURLERI.MUHATAP.kod],
      [DebtorRole.MIRASCI, UYAP_ROL_TURLERI.MIRASCI.kod],
    ])('%s -> UYAP kod %s', (role, expectedKod) => {
      expect(harness.mapDebtorRoleToUyapKod(role)).toBe(expectedKod);
    });

    it.each([
      DebtorRole.MUSETEREK_BORCLU,
      DebtorRole.ADI_KEFIL,
      DebtorRole.MUTESELSIL_KEFIL,
      DebtorRole.AVAL,
      DebtorRole.LEHDAR,
      DebtorRole.MUHATAP,
    ])(
      'regression guard: %s no longer silently falls back to BORCLU (LRV-02 pre-patch behavior)',
      (role) => {
        expect(harness.mapDebtorRoleToUyapKod(role)).not.toBe(UYAP_ROL_TURLERI.BORCLU.kod);
      },
    );
  });

  describe('deferred roles (UYAP exchange.dtd kodu YOK - AS-IS, DBP-P2-SEC-P01 kapsam disi)', () => {
    let warnSpy: jest.SpyInstance;

    beforeEach(() => {
      warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    });

    afterEach(() => {
      warnSpy.mockRestore();
    });

    it.each([DebtorRole.TASFIYE_MEMURU, DebtorRole.IFLAS_MASASI])(
      '%s: davranis degismedi, hala BORCLU fallback doner (AS-IS)',
      (role) => {
        expect(harness.mapDebtorRoleToUyapKod(role)).toBe(UYAP_ROL_TURLERI.BORCLU.kod);
      },
    );

    it.each([DebtorRole.TASFIYE_MEMURU, DebtorRole.IFLAS_MASASI])(
      '%s: fallback artik logger.warn ile gozlemlenebilir',
      (role) => {
        harness.mapDebtorRoleToUyapKod(role);
        expect(warnSpy).toHaveBeenCalledTimes(1);
        expect(warnSpy.mock.calls[0][0]).toContain(role);
      },
    );

    it('correctly-mapped bir rol icin logger.warn tetiklenmez', () => {
      harness.mapDebtorRoleToUyapKod(DebtorRole.ASIL_BORCLU);
      expect(warnSpy).not.toHaveBeenCalled();
    });
  });

  it('exhaustiveness: DebtorRole enum + UYAP_ROL_TURLERI arasindaki 12 gercek deger de hata firlatmadan bir string doner', () => {
    for (const role of Object.values(DebtorRole)) {
      expect(() => harness.mapDebtorRoleToUyapKod(role)).not.toThrow();
      expect(typeof harness.mapDebtorRoleToUyapKod(role)).toBe('string');
    }
  });
});
