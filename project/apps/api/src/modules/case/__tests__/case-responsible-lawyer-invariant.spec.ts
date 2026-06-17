/**
 * B5/D — createCase "≥1 sorumlu avukat" invariant'ı.
 *
 * createCase, avukat kayıtları oluştuktan sonra hiç RESPONSIBLE yoksa önceliğe göre BİR
 * avukatı sorumlu yapar; explicit isResponsible (ve PARTNER/MANAGER kaynaklı RESPONSIBLE)
 * varsa ASLA ezmez/demote etmez. Karar mantığı saf `resolveResponsiblePromotion` +
 * öncelik `pickResponsibleFallbackIndex` fonksiyonlarına çıkarıldı → tam izole test edilir.
 *
 * NOT: Yükseltmenin DB yazımı (tx.caseLawyer.update ile isResponsible=true VE role='RESPONSIBLE'
 * birlikte) tek satırlık wiring'dir; canlı doğrulaması e2e/DB-count ile yapılır (rfa016 deseni).
 * Buradaki testlerin değeri: "ezme YOK" + "doğru fallback" kararını kanıtlamak.
 */

import { pickResponsibleFallbackIndex, resolveResponsiblePromotion } from '../case.service';

type CL = { id: string; lawyerRank: string | null; isResponsible: boolean };

describe('B5/D — resolveResponsiblePromotion (≥1 sorumlu invariant kararı)', () => {
  it('explicit seçim korunur: bir satır isResponsible=true ise → null (yükseltme YOK, ezme YOK)', () => {
    const created: CL[] = [
      { id: 'a', lawyerRank: 'LAWYER', isResponsible: false },
      { id: 'b', lawyerRank: 'LAWYER', isResponsible: true }, // kullanıcı seçimi
    ];
    expect(resolveResponsiblePromotion(created)).toBeNull();
  });

  it('hiç seçim yoksa fallback promote eder → en yüksek öncelikli satırın id’si', () => {
    const created: CL[] = [
      { id: 'a', lawyerRank: 'LAWYER', isResponsible: false },
      { id: 'b', lawyerRank: 'AUTHORIZED', isResponsible: false },
    ];
    expect(resolveResponsiblePromotion(created)).toBe('b'); // AUTHORIZED > LAWYER
  });

  it('AUTHORIZED, LAWYER/INTERN üstünde seçilir', () => {
    const created: CL[] = [
      { id: 'law', lawyerRank: 'LAWYER', isResponsible: false },
      { id: 'int', lawyerRank: 'INTERN', isResponsible: false },
      { id: 'aut', lawyerRank: 'AUTHORIZED', isResponsible: false },
    ];
    expect(resolveResponsiblePromotion(created)).toBe('aut');
  });

  it('tek avukat seçimsizse sorumlu yapılır', () => {
    const created: CL[] = [{ id: 'solo', lawyerRank: 'LAWYER', isResponsible: false }];
    expect(resolveResponsiblePromotion(created)).toBe('solo');
  });

  it('PARTNER/MANAGER mevcutsa mevcut davranış bozulmaz (zaten RESPONSIBLE → null)', () => {
    // Loop, PARTNER/MANAGER'ı RESPONSIBLE üretir → listede isResponsible=true gelir
    const created: CL[] = [
      { id: 'p', lawyerRank: 'PARTNER', isResponsible: true },
      { id: 'l', lawyerRank: 'LAWYER', isResponsible: false },
    ];
    expect(resolveResponsiblePromotion(created)).toBeNull(); // no-op, ezme yok
  });

  it('hiç avukat yoksa no-op → null', () => {
    expect(resolveResponsiblePromotion([])).toBeNull();
  });

  it('eş rank’te İLK kayıt seçilir', () => {
    const created: CL[] = [
      { id: 'first', lawyerRank: 'LAWYER', isResponsible: false },
      { id: 'second', lawyerRank: 'LAWYER', isResponsible: false },
    ];
    expect(resolveResponsiblePromotion(created)).toBe('first');
  });

  it('rank’siz (null) avukatlar da promote edilebilir (son çare)', () => {
    const created: CL[] = [
      { id: 'x', lawyerRank: null, isResponsible: false },
      { id: 'y', lawyerRank: null, isResponsible: false },
    ];
    expect(resolveResponsiblePromotion(created)).toBe('x'); // eşit (rank'siz) → ilk
  });
});

describe('B5/D — pickResponsibleFallbackIndex (öncelik sırası, saf)', () => {
  it('tam öncelik: PARTNER < MANAGER < AUTHORIZED < LAWYER < INTERN < rank’siz', () => {
    expect(pickResponsibleFallbackIndex(['INTERN', 'LAWYER', 'AUTHORIZED', 'MANAGER', 'PARTNER'])).toBe(4);
    expect(pickResponsibleFallbackIndex(['LAWYER', 'INTERN', 'AUTHORIZED'])).toBe(2);
    expect(pickResponsibleFallbackIndex(['INTERN', 'LAWYER'])).toBe(1);
  });

  it('rank’siz yalnız başka aday yoksa seçilir', () => {
    expect(pickResponsibleFallbackIndex([null, 'INTERN'])).toBe(1); // INTERN > rank'siz
    expect(pickResponsibleFallbackIndex([null, null])).toBe(0); // hepsi rank'siz → ilk
    expect(pickResponsibleFallbackIndex(['FOO_BILINMEYEN', 'LAWYER'])).toBe(1); // bilinmeyen=rank'siz
  });

  it('eş öncelikte İLK kayıt (strict <)', () => {
    expect(pickResponsibleFallbackIndex(['AUTHORIZED', 'AUTHORIZED'])).toBe(0);
  });

  it('boş liste → -1', () => {
    expect(pickResponsibleFallbackIndex([])).toBe(-1);
  });
});
