/**
 * RFA-006 — adres normalize/hash + find-or-create dedup util.
 *
 * Şemadaki @@unique([debtorId, addressHash]) ölüydü (hash hiç hesaplanmıyordu). Bu util adresi
 * normalize edip hash üretir; tüm write yolları (6 adet) ortak kullanır → guard tek-kaynak.
 */

import { normalizeAddress, computeAddressHash, findOrCreateDebtorAddress } from '../address-hash.util';

describe('RFA-006 computeAddressHash / normalizeAddress', () => {
  const base = { street: 'Atatürk Caddesi No 5', district: 'Çankaya', city: 'Ankara', postalCode: '06100', country: 'Türkiye' };

  it('case/boşluk/diakritik farkı → AYNI hash (normalize)', () => {
    const variant = { street: '  ATATÜRK   caddesi no 5 ', district: 'cankaya', city: 'ANKARA', postalCode: '06100', country: 'türkiye' };
    expect(computeAddressHash(base)).toBe(computeAddressHash(variant));
  });

  it('farklı şehir → FARKLI hash', () => {
    expect(computeAddressHash(base)).not.toBe(computeAddressHash({ ...base, city: 'İstanbul' }));
  });

  it('farklı posta kodu → FARKLI hash (postalCode dahil)', () => {
    expect(computeAddressHash(base)).not.toBe(computeAddressHash({ ...base, postalCode: '34000' }));
  });

  it('eksik/kalitesiz adres (street veya city yok) → null (false-positive guard)', () => {
    expect(computeAddressHash({ street: '', city: 'Ankara' })).toBeNull();
    expect(computeAddressHash({ street: 'X', city: '' })).toBeNull();
    expect(computeAddressHash({ district: 'Çankaya' })).toBeNull();
  });

  it('normalizeAddress null/undefined güvenli', () => {
    expect(() => normalizeAddress({ street: undefined, city: null as any })).not.toThrow();
  });
});

describe('RFA-006 findOrCreateDebtorAddress dedup', () => {
  const addr = { debtorId: 'D1', street: 'Test Sok 1', city: 'Ankara' };

  it('mevcut hash eşleşmesi → MEVCUDU döndür, create ÇAĞRILMAZ (created=false)', async () => {
    const db = {
      debtorAddress: {
        findFirst: jest.fn().mockResolvedValue({ id: 'A1', street: 'Test Sok 1', city: 'Ankara' }),
        create: jest.fn(),
      },
    };
    const res = await findOrCreateDebtorAddress(db, addr);
    expect(res.created).toBe(false);
    expect(res.address.id).toBe('A1');
    expect(db.debtorAddress.create).not.toHaveBeenCalled();
  });

  it('eşleşme yok → addressHash set ederek create (created=true)', async () => {
    const db = {
      debtorAddress: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'A2' }),
      },
    };
    const res = await findOrCreateDebtorAddress(db, addr);
    expect(res.created).toBe(true);
    const createArg = db.debtorAddress.create.mock.calls[0][0].data;
    expect(typeof createArg.addressHash).toBe('string');
    expect(createArg.addressHash.length).toBeGreaterThan(0);
  });

  it('kalitesiz adres (hash null) → düz create, dedup yok', async () => {
    const db = {
      debtorAddress: {
        findFirst: jest.fn(),
        create: jest.fn().mockResolvedValue({ id: 'A3' }),
      },
    };
    const res = await findOrCreateDebtorAddress(db, { debtorId: 'D1', city: 'Ankara' }); // street yok
    expect(res.created).toBe(true);
    expect(db.debtorAddress.findFirst).not.toHaveBeenCalled(); // hash null → arama yok
    expect(db.debtorAddress.create.mock.calls[0][0].data.addressHash).toBeUndefined();
  });

  it('race: create P2002 → tekrar findFirst ile mevcut döner (created=false)', async () => {
    const db = {
      debtorAddress: {
        findFirst: jest.fn().mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'A4' }),
        create: jest.fn().mockRejectedValue({ code: 'P2002' }),
      },
    };
    const res = await findOrCreateDebtorAddress(db, addr);
    expect(res.created).toBe(false);
    expect(res.address.id).toBe('A4');
  });
});
