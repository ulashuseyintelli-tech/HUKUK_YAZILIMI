/**
 * BUG-2a — buildWizardDebtorPayload saf testleri (frontend-only, UI YOK).
 *
 * KRİTİK: backend whitelist + forbidNonWhitelisted. Payload `name`/`identityNo`/`type:"WORK"`/
 * `fullAddress` İÇERMEMELİ (yoksa 400). INDIVIDUAL'da ad+soyad zorunlu (validateDebtorByType);
 * ayrıştırılamazsa { ok:false } → caller POST ETMEZ, sahte soyad yazmaz.
 */
import { describe, it, expect, vi } from 'vitest';

// DebtorStep "use client" bileşeni; import zincirinde @/lib/api var → side-effect'i nötrle.
vi.mock('@/lib/api', () => ({ api: { get: vi.fn(), post: vi.fn() } }));

import { buildWizardDebtorPayload } from '../components/debtor/DebtorStep';

const party = (over: any = {}) => ({
  name: 'Şükrü Akdoğan',
  type: 'INDIVIDUAL',
  role: 'BORCLU',
  confidence: 90,
  ...over,
});

describe('BUG-2a buildWizardDebtorPayload', () => {
  it('INDIVIDUAL: name → firstName/lastName; bare name/identityNo GÖNDERİLMEZ', () => {
    const r = buildWizardDebtorPayload(party());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.payload.firstName).toBe('Şükrü');
    expect(r.payload.lastName).toBe('Akdoğan');
    expect('name' in r.payload).toBe(false);
    expect('identityNo' in r.payload).toBe(false);
    expect(r.payload.type).toBe('INDIVIDUAL');
  });

  it('forceCreate:true daima gönderilir (kimlik yok → 409 SIMILAR_NAME_REVIEW bypass)', () => {
    const r = buildWizardDebtorPayload(party());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.payload.forceCreate).toBe(true);
  });

  it('çok kelimeli isim: son token soyad, gerisi ad', () => {
    const r = buildWizardDebtorPayload(party({ name: 'Ahmet Mehmet Yılmaz' }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.payload.firstName).toBe('Ahmet Mehmet');
    expect(r.payload.lastName).toBe('Yılmaz');
  });

  it('TEK KELİME INDIVIDUAL → { ok:false } (POST yok, sahte soyad yok)', () => {
    const r = buildWizardDebtorPayload(party({ name: 'Şükrü' }));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain('ad ve soyad');
  });

  it('boş/whitespace isim INDIVIDUAL → { ok:false }', () => {
    const r = buildWizardDebtorPayload(party({ name: '   ' }));
    expect(r.ok).toBe(false);
  });

  it('11 haneli kimlik → tckn; vkn yok', () => {
    const r = buildWizardDebtorPayload(party({ identityNo: '12345678901' }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.payload.tckn).toBe('12345678901');
    expect('vkn' in r.payload).toBe(false);
  });

  it('INDIVIDUAL + 10 haneli kimlik → ne tckn ne vkn (yanlış uzunluk)', () => {
    const r = buildWizardDebtorPayload(party({ identityNo: '1234567890' }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect('tckn' in r.payload).toBe(false);
    expect('vkn' in r.payload).toBe(false);
  });

  it('COMPANY: companyName set, firstName yok; 10 hane → vkn', () => {
    const r = buildWizardDebtorPayload(
      party({ name: 'ABC Tekstil Ltd', type: 'COMPANY', identityNo: '1234567890' }),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.payload.companyName).toBe('ABC Tekstil Ltd');
    expect('firstName' in r.payload).toBe(false);
    expect(r.payload.vkn).toBe('1234567890');
  });

  it('PUBLIC_INSTITUTION: institutionName set', () => {
    const r = buildWizardDebtorPayload(party({ name: 'X Belediyesi', type: 'PUBLIC_INSTITUTION' }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.payload.institutionName).toBe('X Belediyesi');
  });

  it('adres+şehir → addressType "IS" (WORK DEĞİL), street; type/fullAddress alanı YOK', () => {
    const r = buildWizardDebtorPayload(
      party({ address: 'Atatürk Cad. 5', city: 'İstanbul', district: 'Kadıköy' }),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const addrs = r.payload.addresses as any[];
    expect(addrs).toHaveLength(1);
    expect(addrs[0].addressType).toBe('IS');
    expect(addrs[0].street).toBe('Atatürk Cad. 5');
    expect(addrs[0].city).toBe('İstanbul');
    expect('type' in addrs[0]).toBe(false);
    expect('fullAddress' in addrs[0]).toBe(false);
  });

  it('adres var ama şehir YOK → addresses boş (city DTO zorunlu → 400 önlenir)', () => {
    const r = buildWizardDebtorPayload(party({ address: 'Atatürk Cad. 5' }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.payload.addresses).toEqual([]);
  });

  it('whitelist dışı alan yok (name/identityNo/fullAddress/role/confidence)', () => {
    const r = buildWizardDebtorPayload(party({ address: 'X', city: 'Y' }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    for (const k of ['name', 'identityNo', 'fullAddress', 'role', 'confidence']) {
      expect(k in r.payload).toBe(false);
    }
  });
});
