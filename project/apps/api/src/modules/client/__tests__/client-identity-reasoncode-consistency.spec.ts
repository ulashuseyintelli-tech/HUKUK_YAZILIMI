/**
 * CLIENT-IDENTITY-REASONCODE-CONSISTENCY (owner GO 2026-09-08)
 *
 * KUSUR (düzeltme öncesi): aynı TCKN/VKN checksum reddi iki farklı hata sözleşmesiyle çıkıyordu.
 *   - `assertCreateIdentityChecksum` (create + DEĞİŞEN değer update yolu)
 *       → `new BadRequestException("Geçersiz TCKN ...")` — DÜZ METİN; `reasonCode` YOK,
 *         `offendingFields` YOK. İstemci bu reddi makinece ayırt EDEMİYORDU.
 *   - `assertReactivationIdentityChecksum` (reaktivasyon)
 *       → `{ message, reasonCode: 'CLIENT_IDENTITY_CHECKSUM_INVALID', offendingFields }`
 *
 * BU SUITE DÜZELTME ÖNCESİ KIRMIZIDIR: aşağıdaki `reasonCode`/`offendingFields` beklentileri
 * eski düz-metin gövdede `undefined` döner.
 *
 * KORUNAN SÖZLEŞMELER (regresyon kilidi): HTTP 400, kullanıcı mesajlarının METNİ, boş kimlik ve
 * `identityNo` serbestliği, reaktivasyon gövdesi. **`offendingFields` yalnız ALAN ADI taşır —
 * kimlik DEĞERİ hiçbir yere (yanıt/log/audit) girmez.**
 *
 * Kimlik değerleri SENTETİKTİR (validator ile doğrulanır); gerçek kişi verisi KULLANILMAZ.
 */
import { BadRequestException } from '@nestjs/common';
import {
  CLIENT_IDENTITY_CHECKSUM_INVALID,
  assertChangedIdentityChecksum,
  assertCreateIdentityChecksum,
  assertReactivationIdentityChecksum,
} from '../client-identity-checksum.util';
import { isValidTckn, isValidVkn } from '../../../common/identity-validation.util';

const VALID_TCKN = '10000000146';
const INVALID_TCKN = '12345678901';
const VALID_VKN = '4540536920';
const INVALID_VKN = '1234567891'; // d1b spec ile ayni kanitli deger ('1234567890' GECERLIDIR)

/** Gövdeyi yakalar; `response` NestJS'in ham hata gövdesidir. */
function capture(fn: () => void): { status: number; body: any; message: string } {
  try {
    fn();
  } catch (e: any) {
    expect(e).toBeInstanceOf(BadRequestException);
    return { status: e.getStatus(), body: e.getResponse(), message: e.message };
  }
  throw new Error('beklenen BadRequestException FIRLATILMADI');
}

describe('kimlik checksum hata sözleşmesi — fixture bütünlüğü', () => {
  it('sentetik değerler gerçek validator ile uyuşur (gerçek kişi verisi DEĞİL)', () => {
    expect(isValidTckn(VALID_TCKN)).toBe(true);
    expect(isValidTckn(INVALID_TCKN)).toBe(false);
    expect(isValidVkn(VALID_VKN)).toBe(true);
    expect(isValidVkn(INVALID_VKN)).toBe(false);
  });
});

describe('CREATE yolu — reasonCode ve offendingFields (DÜZELTME ÖNCESİ KIRMIZI)', () => {
  it('geçersiz TCKN: 400 + stabil reasonCode + offendingFields=[tckn]', () => {
    const { status, body } = capture(() => assertCreateIdentityChecksum({ tckn: INVALID_TCKN }));
    expect(status).toBe(400);
    expect(body.reasonCode).toBe(CLIENT_IDENTITY_CHECKSUM_INVALID);
    expect(body.offendingFields).toEqual(['tckn']);
  });

  it('geçersiz VKN: offendingFields=[vkn]', () => {
    const { status, body } = capture(() => assertCreateIdentityChecksum({ vkn: INVALID_VKN }));
    expect(status).toBe(400);
    expect(body.reasonCode).toBe(CLIENT_IDENTITY_CHECKSUM_INVALID);
    expect(body.offendingFields).toEqual(['vkn']);
  });

  it('ikisi de geçersizse HER İKİ alan adı taşınır', () => {
    const { body } = capture(() =>
      assertCreateIdentityChecksum({ tckn: INVALID_TCKN, vkn: INVALID_VKN }));
    expect(body.offendingFields).toEqual(['tckn', 'vkn']);
  });

  it('KULLANICI MESAJI KORUNUR (istemci bu metni gösteriyor)', () => {
    expect(capture(() => assertCreateIdentityChecksum({ tckn: INVALID_TCKN })).body.message)
      .toBe('Geçersiz TCKN (kimlik no doğrulaması başarısız)');
    expect(capture(() => assertCreateIdentityChecksum({ vkn: INVALID_VKN })).body.message)
      .toBe('Geçersiz VKN (vergi kimlik no doğrulaması başarısız)');
    // İkisi de geçersizse eski davranış gibi TCKN metni gösterilir.
    expect(capture(() => assertCreateIdentityChecksum({ tckn: INVALID_TCKN, vkn: INVALID_VKN })).body.message)
      .toBe('Geçersiz TCKN (kimlik no doğrulaması başarısız)');
  });

  it('`error.message` de korunur — `e.message` okuyan tüketiciler (seed log\'u) etkilenmez', () => {
    expect(capture(() => assertCreateIdentityChecksum({ tckn: INVALID_TCKN })).message)
      .toBe('Geçersiz TCKN (kimlik no doğrulaması başarısız)');
  });
});

describe('DEĞİŞEN-DEĞER UPDATE yolu — aynı sözleşme (DÜZELTME ÖNCESİ KIRMIZI)', () => {
  it('değişen geçersiz TCKN: reasonCode + offendingFields', () => {
    const { status, body } = capture(() =>
      assertChangedIdentityChecksum({ tckn: INVALID_TCKN }, { tckn: VALID_TCKN, vkn: null }));
    expect(status).toBe(400);
    expect(body.reasonCode).toBe(CLIENT_IDENTITY_CHECKSUM_INVALID);
    expect(body.offendingFields).toEqual(['tckn']);
    expect(body.message).toBe('Geçersiz TCKN (kimlik no doğrulaması başarısız)');
  });

  it('değişen geçersiz VKN: offendingFields=[vkn]', () => {
    const { body } = capture(() =>
      assertChangedIdentityChecksum({ vkn: INVALID_VKN }, { tckn: null, vkn: VALID_VKN }));
    expect(body.offendingFields).toEqual(['vkn']);
  });
});

describe('ÜÇ YOL AYNI SÖZLEŞMEYİ taşır', () => {
  it('create / değişen-değer / reaktivasyon: reasonCode ve offendingFields alanları AYNI', () => {
    const bodies = [
      capture(() => assertCreateIdentityChecksum({ tckn: INVALID_TCKN })).body,
      capture(() => assertChangedIdentityChecksum({ tckn: INVALID_TCKN }, { tckn: VALID_TCKN, vkn: null })).body,
      capture(() => assertReactivationIdentityChecksum({ tckn: INVALID_TCKN, vkn: null })).body,
    ];
    for (const b of bodies) {
      expect(b.reasonCode).toBe(CLIENT_IDENTITY_CHECKSUM_INVALID);
      expect(b.offendingFields).toEqual(['tckn']);
      expect(typeof b.message).toBe('string');
      expect(b.message.length).toBeGreaterThan(0);
    }
    // Reaktivasyonun KENDİ metni ayrıdır ve korunur (düzeltme yolunu anlatır).
    expect(bodies[2].message).toContain('aktifleştirmek');
  });
});

describe('PII YASAĞI — kimlik DEĞERİ hiçbir alana girmez', () => {
  it('gövde ve mesaj kimlik numarasını İÇERMEZ; offendingFields yalnız alan ADI taşır', () => {
    const { body, message } = capture(() =>
      assertCreateIdentityChecksum({ tckn: INVALID_TCKN, vkn: INVALID_VKN }));
    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain(INVALID_TCKN);
    expect(serialized).not.toContain(INVALID_VKN);
    expect(message).not.toContain(INVALID_TCKN);
    expect(body.offendingFields.every((f: string) => f === 'tckn' || f === 'vkn')).toBe(true);
  });

  it('reaktivasyon gövdesinde de değer YOK', () => {
    const { body } = capture(() =>
      assertReactivationIdentityChecksum({ tckn: INVALID_TCKN, vkn: INVALID_VKN }));
    expect(JSON.stringify(body)).not.toContain(INVALID_TCKN);
    expect(body.offendingFields).toEqual(['tckn', 'vkn']);
  });
});

describe('KORUNAN kabul/red kuralları (davranış değişmedi)', () => {
  it('boş kimlik SERBEST — create ve reaktivasyon', () => {
    expect(() => assertCreateIdentityChecksum({ tckn: null, vkn: null })).not.toThrow();
    expect(() => assertCreateIdentityChecksum({ tckn: '', vkn: '' })).not.toThrow();
    expect(() => assertReactivationIdentityChecksum({ tckn: null, vkn: null })).not.toThrow();
  });

  it('geçerli kimlik GEÇER', () => {
    expect(() => assertCreateIdentityChecksum({ tckn: VALID_TCKN, vkn: VALID_VKN })).not.toThrow();
  });

  it('`identityNo` (serbest/pasaport) DOĞRULANMAZ', () => {
    expect(() => assertCreateIdentityChecksum({ identityNo: 'PASSPORT-XYZ' } as any)).not.toThrow();
  });

  it('DEĞİŞMEYEN legacy geçersiz değer isteği DÜŞÜRMEZ', () => {
    expect(() => assertChangedIdentityChecksum({ tckn: INVALID_TCKN }, { tckn: INVALID_TCKN, vkn: null }))
      .not.toThrow();
    expect(() => assertChangedIdentityChecksum({}, { tckn: INVALID_TCKN, vkn: null })).not.toThrow();
  });

  it('kimliği BOŞALTMA serbesttir', () => {
    expect(() => assertChangedIdentityChecksum({ tckn: '' }, { tckn: INVALID_TCKN, vkn: null })).not.toThrow();
    expect(() => assertChangedIdentityChecksum({ tckn: null }, { tckn: INVALID_TCKN, vkn: null })).not.toThrow();
  });
});
