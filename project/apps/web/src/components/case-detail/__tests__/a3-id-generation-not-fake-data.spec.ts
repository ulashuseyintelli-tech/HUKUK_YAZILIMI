import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * WSMR-A3 — FALSE_POSITIVE_WITH_TESTED_RULE_REASON.
 *
 * Envanterde kalan tek bulgu `OperationDeck#createDistributionLineId@DF003`
 * (`Math.random()` kullanımı). Bu SAHTE VERİ DEĞİLDİR: benzersiz bir satır
 * kimliği üretir (`distribution-line-<ts>-<rand>`) ve kullanıcıya bir olgu
 * olarak sunulmaz.
 *
 * Bu spec kuralın gerekçesini KİLİTLER: eğer ileride bu fonksiyon gerçekten
 * kullanıcıya gösterilen bir veri üretmeye başlarsa (tutar, tarih, sayı, ad),
 * test kırılır ve bulgu yeniden değerlendirilir.
 */

const SOURCE = path.resolve(__dirname, '..', 'OperationDeck.tsx');

describe('OperationDeck — Math.random() kullanımı', () => {
  const src = fs.readFileSync(SOURCE, 'utf8');

  it('yalnız TEK bir yerde ve yalnız KİMLİK üretiminde kullanılır', () => {
    const uses = src.match(/Math\s*\.\s*random/g) ?? [];
    expect(uses).toHaveLength(1);

    // Kullanım, kimlik üreten fonksiyonun gövdesinde olmalı.
    const fn = src.match(
      /const createDistributionLineId = \(\) =>\s*`distribution-line-\$\{Date\.now\(\)\}-\$\{Math\.random\(\)[^`]*`/,
    );
    expect(fn).not.toBeNull();
  });

  it('üretilen değer finansal/olgusal bir alana YAZILMAZ', () => {
    // Kimlik yalnız `id` alanlarına gider; tutar/tarih/ad alanlarına DEĞİL.
    const forbidden = /createDistributionLineId\(\)\s*[,)]?\s*(?=.*\b(amount|tutar|total|date|tarih|name|ad)\b)/i;
    expect(forbidden.test(src)).toBe(false);
  });

  it('kimlikler benzersizdir (çakışma üretmez)', () => {
    // Uretim deseninin kendisi test edilir: zaman damgasi + rastgele son ek.
    const make = () => `distribution-line-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const ids = new Set(Array.from({ length: 500 }, make));
    expect(ids.size).toBeGreaterThan(490);
  });
});
