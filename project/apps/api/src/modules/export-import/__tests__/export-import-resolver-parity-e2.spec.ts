/**
 * C2-I08 E2 — buildShortAddress KANONİK resolver'a bağlandı (parity kanıtı).
 * Legacy format `address / district / city` AYNEN korunur; yapısal satır varsa
 * onun bileşenleri kazanır (resolver seçim kuralı: isPrimary önce, sonra ilk satır).
 */
import { buildShortAddress } from '../export-import.service';

describe('C2-I08 E2 — buildShortAddress resolver parity', () => {
  it('[1] legacy flat-only: mevcut format AYNEN (`address / district / city`)', () => {
    expect(buildShortAddress({ address: 'Eski Cad. 1', district: 'Kadıköy', city: 'İstanbul' }))
      .toBe('Eski Cad. 1 / Kadıköy / İstanbul');
  });

  it('[2] yapısal satır varsa STRUCTURED kazanır (flat girdiler yok sayılır)', () => {
    expect(buildShortAddress({
      address: 'Eski Cad. 1', district: 'Kadıköy', city: 'İstanbul',
      addresses: [{ street: 'Yeni Sok. 2', district: 'Konak', city: 'İzmir', isPrimary: true }],
    })).toBe('Yeni Sok. 2 / Konak / İzmir');
  });

  it('[3] hiçbir kaynak yoksa boş string (mevcut davranış)', () => {
    expect(buildShortAddress({})).toBe('');
  });

  it('[4] maxLen kısaltması korunur', () => {
    const long = 'X'.repeat(100);
    expect(buildShortAddress({ address: long }).endsWith('...')).toBe(true);
  });
});
