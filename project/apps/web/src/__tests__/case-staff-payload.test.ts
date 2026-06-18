/**
 * PR-ASSIGN-2b — buildStaffPayload saf testleri (frontend-only, UI YOK).
 *
 * EN KRİTİK: undefined vs [] ayrımı (ASSIGN-2a kontratı). Frontend bunu yanlış yaparsa
 * ASSIGN-2a'nın anlamı bozulur (kullanıcı default'u sildi → undefined gönderilirse backend
 * default'u YİNE ekler = bug). Karar (Ulaş): /staff yüklenemezse undefined → default fallback.
 */

import { describe, it, expect } from 'vitest';
import { buildStaffPayload } from '../lib/case-staff-payload';

describe('PR-ASSIGN-2b buildStaffPayload — undefined vs [] ayrımı', () => {
  it('/staff yüklenemediyse (loaded=false) → undefined (backend default personele döner)', () => {
    expect(buildStaffPayload([{ id: 's1', staffType: 'PERSONEL' }], false)).toBeUndefined();
  });

  it('yüklendi + seçim var → staffMemberId/roleOnCase dizisi', () => {
    expect(
      buildStaffPayload([{ id: 's1', staffType: 'AVUKAT_KATIBI', roleOnCase: 'AVUKAT_KATIBI' }], true),
    ).toEqual([{ staffMemberId: 's1', roleOnCase: 'AVUKAT_KATIBI' }]);
  });

  it('yüklendi + kullanıcı HEPSİNİ sildi → [] (undefined DEĞİL; deselection korunur)', () => {
    const r = buildStaffPayload([], true);
    expect(r).toEqual([]);
    expect(r).not.toBeUndefined();
  });

  it('roleOnCase yoksa staffType kullanılır', () => {
    expect(buildStaffPayload([{ id: 's1', staffType: 'SEKRETER' }], true)).toEqual([
      { staffMemberId: 's1', roleOnCase: 'SEKRETER' },
    ]);
  });

  it('birden çok personel sırayla map edilir', () => {
    expect(
      buildStaffPayload(
        [
          { id: 'a', staffType: 'PERSONEL' },
          { id: 'b', staffType: 'MUHASEBE', roleOnCase: 'MUHASEBE' },
        ],
        true,
      ),
    ).toEqual([
      { staffMemberId: 'a', roleOnCase: 'PERSONEL' },
      { staffMemberId: 'b', roleOnCase: 'MUHASEBE' },
    ]);
  });

  it('selectedStaff null/undefined ama loaded=true → [] (boş, undefined değil)', () => {
    expect(buildStaffPayload(undefined, true)).toEqual([]);
    expect(buildStaffPayload(null, true)).toEqual([]);
  });
});
