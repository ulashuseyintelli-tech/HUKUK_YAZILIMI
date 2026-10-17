import { describe, it, expect } from 'vitest';
import {
  classifyUyapSubmitResult,
  UYAP_GENERAL_DOCUMENT_DEFAULT,
  UYAP_GENERAL_DOCUMENT_TYPES,
} from '../uyap-submit-result';

/** DV-198/e (owner Ek 94) — ortak yardımcının sözleşmesi. */
describe('uyap-submit-result', () => {
  it('genel evrak türleri Haciz Talebi / Takip Talebi içermez; varsayılan listenin ilk geçerli türüdür', () => {
    const values = UYAP_GENERAL_DOCUMENT_TYPES.map((t) => t.value as string);
    expect(values).toEqual(['DILEKCE', 'BEYAN', 'ITIRAZ', 'DIGER']);
    expect(values).not.toContain('HACIZ_TALEBI');
    expect(values).not.toContain('TAKIP_TALEBI');
    expect(UYAP_GENERAL_DOCUMENT_DEFAULT).toBe(values[0]);
  });

  it.each([
    ['simülasyon', { success: true, data: { simulated: true, dispatched: false } }, 'SIMULATED'],
    ['iletim beyanı', { success: true, data: { simulated: false, dispatched: true } }, 'DISPATCHED'],
    ['iletim beyanı (simulated alanı yok)', { success: true, data: { dispatched: true } }, 'DISPATCHED'],
    ['gövdede ret', { success: false, errorMessage: 'x' }, 'REJECTED'],
    ['dispatched yok', { success: true, data: { simulated: true } }, 'UNVERIFIED'],
    ['data yok', { success: true }, 'UNVERIFIED'],
    ['data dizgi', { success: true, data: 'ok' }, 'UNVERIFIED'],
    ['dispatched dizgi', { success: true, data: { dispatched: 'true' } }, 'UNVERIFIED'],
    ['çelişkili beyan', { success: true, data: { simulated: true, dispatched: true } }, 'UNVERIFIED'],
    ['success dizgi', { success: 'true', data: { simulated: true, dispatched: false } }, 'UNVERIFIED'],
    ['success yok', { data: { simulated: true, dispatched: false } }, 'UNVERIFIED'],
    ['null', null, 'UNVERIFIED'],
    ['undefined', undefined, 'UNVERIFIED'],
    ['dizi', [{ success: true }], 'UNVERIFIED'],
  ])('%s → %s', (_label, response, expected) => {
    expect(classifyUyapSubmitResult(response)).toBe(expected);
  });
});
