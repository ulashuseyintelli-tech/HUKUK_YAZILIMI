/**
 * PR-2a-1 — Deterministik gruplama motoru testleri (AI YOK, saf fixture'lar).
 *
 * Asıl soru: "N sayfa → kaç fiziksel evrak?" — deterministik kanıtlanır.
 * Kritik ilke: yanlışlıkla 2 evrak üretmek, review istemekten daha kötü.
 */

import { groupPageCandidatesIntoInstruments } from '../debt-instrument-grouping';
import { PageCandidate } from '../debt-instrument.types';

function pc(over: Partial<PageCandidate> & { pageIndex: number }): PageCandidate {
  return { currency: 'TRY', ...over };
}
// Çek yüzü: documentNo + amount + dueDate (güçlü)
const faceCheque = (pageIndex: number, documentNo: string, amount = 400000, dueDate = '2025-12-01') =>
  pc({ pageIndex, documentType: 'CEK', documentNo, amount, dueDate, bankName: 'X Bank' });
// Senet yüzü: documentNo YOK; amount + dueDate + drawer (güçlü/orta)
const faceSenet = (pageIndex: number, amount = 100000, dueDate = '2025-11-01', drawerName = 'Borçlu A') =>
  pc({ pageIndex, documentType: 'SENET', amount, dueDate, drawerName });
// Arka/ciro sayfası: amount YOK, back + ciro işareti
const back = (pageIndex: number, documentNo?: string) =>
  pc({ pageIndex, documentNo, back: true, endorsementMarkers: true });
// Yalnız tutar (vade/taraf/docNo yok) — RULE-1 zayıf sinyal
const amountOnly = (pageIndex: number, amount = 50000, documentType: PageCandidate['documentType'] = 'CEK') =>
  pc({ pageIndex, documentType, amount });
// Boş/belirsiz sayfa
const blank = (pageIndex: number) => pc({ pageIndex });

describe('PR-2a-1 — "kaç fiziksel evrak?" temel sayım', () => {
  it('4 çek ön/arka (8 sayfa, interleaved) → 4 enstrüman', () => {
    const pages = [
      faceCheque(0, '0265895'), back(1),
      faceCheque(2, '0265896'), back(3),
      faceCheque(4, '0265897'), back(5),
      faceCheque(6, '0265898'), back(7),
    ];
    const out = groupPageCandidatesIntoInstruments(pages);
    expect(out).toHaveLength(4);
    expect(out.map(i => i.documentNo)).toEqual(['0265895', '0265896', '0265897', '0265898']);
    expect(out[0].sourcePages).toEqual([0, 1]);
    expect(out[0].pageRange).toEqual([0, 1]);
  });

  it('5 senet ön/arka (10 sayfa, documentNo YOK) → 5 enstrüman', () => {
    const pages: PageCandidate[] = [];
    for (let k = 0; k < 5; k++) {
      pages.push(faceSenet(k * 2, 100000 + k), back(k * 2 + 1));
    }
    const out = groupPageCandidatesIntoInstruments(pages);
    expect(out).toHaveLength(5);
    expect(out.every(i => i.type === 'SENET')).toBe(true);
  });

  it('TEK çek (1 ön + 1 arka) → 1 enstrüman (çift-sayma YOK)', () => {
    const out = groupPageCandidatesIntoInstruments([faceCheque(0, '0265895'), back(1)]);
    expect(out).toHaveLength(1);
    expect(out[0].sourcePages).toEqual([0, 1]);
  });

  it('eksik arka (yalnız yüz) → 1 enstrüman', () => {
    const out = groupPageCandidatesIntoInstruments([faceCheque(0, '0265895')]);
    expect(out).toHaveLength(1);
    expect(out[0].sourcePages).toEqual([0]);
  });

  it('karışık çek + senet → 4 enstrüman, tipler doğru', () => {
    const out = groupPageCandidatesIntoInstruments([
      faceCheque(0, '0265895'), back(1),
      faceCheque(2, '0265896'), back(3),
      faceSenet(4), back(5),
      faceSenet(6), back(7),
    ]);
    expect(out).toHaveLength(4);
    expect(out.map(i => i.type)).toEqual(['CEK', 'CEK', 'SENET', 'SENET']);
  });
});

describe('PR-2a-1 — RULE-1: yalnız amount yeni belge saymaz', () => {
  it('çek yüzü + sonra yalnız-tutar sayfası → 1 enstrüman (bağlanır, needsReview)', () => {
    const out = groupPageCandidatesIntoInstruments([faceCheque(0, '0265895'), amountOnly(1, 99999)]);
    expect(out).toHaveLength(1); // 2 DEĞİL
    expect(out[0].sourcePages).toEqual([0, 1]);
    expect(out[0].needsReview).toBe(true);
    expect(out[0].duplicateCandidateReason).toMatch(/yalnız tutar/i);
  });

  it('amount + dueDate (güçlü yüz) iki ayrı sayfa → 2 enstrüman', () => {
    const out = groupPageCandidatesIntoInstruments([
      pc({ pageIndex: 0, documentType: 'CEK', amount: 100, dueDate: '2025-01-01' }),
      pc({ pageIndex: 1, documentType: 'CEK', amount: 200, dueDate: '2025-02-01' }),
    ]);
    expect(out).toHaveLength(2);
    expect(out[0].groupingMethod).toBe('FACE_SIGNAL');
  });

  it('amount + taraf (vade YOK) → yeni belge ama needsReview (orta)', () => {
    const out = groupPageCandidatesIntoInstruments([
      faceCheque(0, '0265895'),
      pc({ pageIndex: 1, documentType: 'CEK', amount: 200, drawerName: 'Borçlu B' }),
    ]);
    expect(out).toHaveLength(2);
    expect(out[1].groupingMethod).toBe('FACE_SIGNAL');
    expect(out[1].needsReview).toBe(true);
    expect(out[1].groupConfidence).toBeLessThanOrEqual(0.6);
  });

  it('baştan yalnız-tutar (açık belge yok) → 1 belirsiz enstrüman + needsReview', () => {
    const out = groupPageCandidatesIntoInstruments([amountOnly(0, 50000)]);
    expect(out).toHaveLength(1);
    expect(out[0].groupingMethod).toBe('WEAK_AMOUNT_ONLY');
    expect(out[0].needsReview).toBe(true);
  });
});

describe('PR-2a-1 — RULE-2: tip sınırı kesin bölme değil', () => {
  it('senet yüzü + çek yüzü (docNo YOK) → 2 enstrüman, 2.si TYPE_BOUNDARY + düşük güven + review', () => {
    const out = groupPageCandidatesIntoInstruments([
      faceSenet(0),
      pc({ pageIndex: 1, documentType: 'CEK', amount: 300, dueDate: '2025-03-01' }), // docNo YOK
    ]);
    expect(out).toHaveLength(2);
    expect(out[1].groupingMethod).toBe('TYPE_BOUNDARY');
    expect(out[1].needsReview).toBe(true);
    expect(out[1].groupConfidence).toBeLessThanOrEqual(0.6);
    expect(out[1].duplicateCandidateReason).toMatch(/tip değişimi/i);
  });
});

describe('PR-2a-1 — documentNo eşleşmesi (merge / mükerrer)', () => {
  it('ardışık AYNI documentNo → 1 enstrüman (DOCUMENT_NO_MATCH, yüksek güven)', () => {
    const out = groupPageCandidatesIntoInstruments([faceCheque(0, '0265895'), faceCheque(1, '0265895')]);
    expect(out).toHaveLength(1);
    expect(out[0].groupingMethod).toBe('DOCUMENT_NO_MATCH');
    expect(out[0].groupConfidence).toBeGreaterThanOrEqual(0.95);
    expect(out[0].duplicateCandidateReason).toMatch(/aynı|mükerrer/i);
  });

  it('yeni documentNo → yeni enstrüman (güçlü)', () => {
    const out = groupPageCandidatesIntoInstruments([faceCheque(0, '0265895'), faceCheque(1, '0265896')]);
    expect(out).toHaveLength(2);
    expect(out[1].groupingMethod).toBe('DOCUMENT_NO_MATCH');
  });
});

describe('PR-2a-1 — belirsiz/öksüz: sessizce atma yok', () => {
  it('baştan arka sayfa (öncesinde yüz yok) → 1 AMBIGUOUS + needsReview', () => {
    const out = groupPageCandidatesIntoInstruments([back(0)]);
    expect(out).toHaveLength(1);
    expect(out[0].groupingMethod).toBe('AMBIGUOUS');
    expect(out[0].needsReview).toBe(true);
  });

  it('ortada boş/belirsiz sayfa → bağlanır (atılmaz) + needsReview, sayı değişmez', () => {
    const out = groupPageCandidatesIntoInstruments([faceCheque(0, '0265895'), blank(1)]);
    expect(out).toHaveLength(1);
    expect(out[0].sourcePages).toEqual([0, 1]);
    expect(out[0].needsReview).toBe(true);
  });

  it('boş girdi → boş dizi', () => {
    expect(groupPageCandidatesIntoInstruments([])).toEqual([]);
  });
});

describe('PR-2a-1 — senet (documentNo zayıf)', () => {
  it('senet yüzü (docNo YOK) + arka ciro → 1 senet (2 DEĞİL)', () => {
    const out = groupPageCandidatesIntoInstruments([faceSenet(0), back(1)]);
    expect(out).toHaveLength(1);
    expect(out[0].type).toBe('SENET');
    expect(out[0].sourcePages).toEqual([0, 1]);
  });

  it('2 senet yüzü (her biri amount+dueDate, docNo YOK) → 2 senet', () => {
    const out = groupPageCandidatesIntoInstruments([faceSenet(0, 100), faceSenet(1, 200)]);
    expect(out).toHaveLength(2);
  });

  it('senet yüzü + yalnız-aval/teminat tutarı (vade yok) → 1 senet, needsReview (yeni senet DEĞİL)', () => {
    const out = groupPageCandidatesIntoInstruments([faceSenet(0), amountOnly(1, 25000, 'SENET')]);
    expect(out).toHaveLength(1);
    expect(out[0].needsReview).toBe(true);
  });
});

describe('PR-2a-1 — sourcePages / pageRange bütünlüğü', () => {
  it('her sayfa tam bir enstrümana atanır (kayıp/çift yok)', () => {
    const pages = [faceCheque(0, 'A'), back(1), faceCheque(2, 'B'), back(3), blank(4)];
    const out = groupPageCandidatesIntoInstruments(pages);
    const allPages = out.flatMap(i => i.sourcePages ?? []).sort((a, b) => a - b);
    expect(allPages).toEqual([0, 1, 2, 3, 4]); // 5 sayfa, hepsi bir yerde, tekrar yok
  });

  it('pageRange sourcePages min/max ile tutarlı', () => {
    const out = groupPageCandidatesIntoInstruments([faceCheque(0, 'A'), back(1), back(2)]);
    expect(out).toHaveLength(1);
    expect(out[0].pageRange).toEqual([0, 2]);
  });
});
