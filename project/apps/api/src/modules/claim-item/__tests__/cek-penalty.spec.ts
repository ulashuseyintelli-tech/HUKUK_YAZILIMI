import { computeCheckPenaltyMinor } from '../formation-cek/cek-penalty';

describe('K3 çek tazminatı hesabı (%10, kuruşa yarıdan yukarı; tam sayı aritmetiği)', () => {
  it.each([
    [1000000n, 100000n], // 10.000,00 → 1.000,00
    [1234567n, 123457n], // 12.345,67 → 1.234,567 → 1.234,57
    [1234565n, 123457n], // 12.345,65 → 1.234,565 → yarı → 1.234,57
    [1234564n, 123456n], // 12.345,64 → 1.234,564 → 1.234,56
    [5n, 1n], // 0,05 → 0,005 → 0,01
  ])('bedel %s kuruş → tazminat %s kuruş', (principal, expected) => {
    expect(computeCheckPenaltyMinor(principal, 1000)).toBe(expected);
  });

  it.each([
    [0n, 1000],
    [-1n, 1000],
    [1000n, 0],
    [1000n, 10001],
    [1000n, 12.5],
  ])('geçersiz girdi reddedilir (bedel %s, bp %s)', (principal, bp) => {
    expect(() => computeCheckPenaltyMinor(principal, bp)).toThrow(RangeError);
  });

  it('sıfıra yuvarlanan tazminat reddedilir', () => {
    expect(() => computeCheckPenaltyMinor(4n, 1000)).toThrow('rounds to zero');
  });
});
