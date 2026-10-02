import { describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { usePreSubmitValidation } from '../useValidation';

/**
 * Sihirbazın gönderim öncesi "Döviz cinsi" bilgisi — sistemin yapmadığı şey vaat edilmez.
 *
 * Sistem kur hesabı / çevirmesi yapmaz (RECEIVABLE-GOVERNANCE REC-FX-002); bilgi satırı eskiden "Kur hesaplaması otomatik
 * yapılacak" diyordu. Satır yalnız dosya para birimini ve çevirme yapılmadığını söyler. TL dosyada satır çıkmaz.
 */

vi.mock('@/lib/api', () => ({ api: {} }));

const READY = {
  takipTuruId: 'tt-1',
  sorumluPersonelId: 'l1',
  lawyers: [{ name: 'Bir', surname: 'Avukat', isResponsible: true }],
  creditors: [{ name: 'Müvekkil A.Ş.' }],
  caseDebtors: [{ debtorId: 'd1' }],
  dues: [{ amount: '10000' }],
};

function validate(currency: string | undefined) {
  const { result } = renderHook(() => usePreSubmitValidation());
  let outcome!: ReturnType<typeof result.current.validateCaseCreation>;
  act(() => {
    outcome = result.current.validateCaseCreation({ ...READY, currency });
  });
  return { outcome, state: result.current };
}

describe('usePreSubmitValidation — döviz bilgisi', () => {
  for (const currency of ['USD', 'EUR', 'GBP', 'CHF']) {
    it(`${currency} dosya: bilgi satırı kur hesabı vaat etmez; çevirme yapılmadığını söyler`, () => {
      const { outcome, state } = validate(currency);

      expect(outcome.valid).toBe(true);
      expect(outcome.errors).toEqual([]);
      expect(outcome.warnings).toEqual([
        {
          code: 'FOREIGN_CURRENCY_NOTICE',
          message: `Döviz cinsi: ${currency} - Sistem kur çevirmesi yapmaz; tutarlar ${currency} olarak kaydedilir`,
          severity: 'info',
        },
      ]);
      expect(outcome.warnings[0].message).not.toMatch(/otomatik|yapılacak|hesaplanacak/);
      // Panel bu durumdan beslenir
      expect(state.warnings).toEqual(outcome.warnings);
    });
  }

  it('TL dosya: döviz bilgisi satırı yok', () => {
    expect(validate('TRY').outcome.warnings).toEqual([]);
  });

  it('para birimi verilmemişse döviz bilgisi satırı yok', () => {
    expect(validate(undefined).outcome.warnings).toEqual([]);
  });
});
