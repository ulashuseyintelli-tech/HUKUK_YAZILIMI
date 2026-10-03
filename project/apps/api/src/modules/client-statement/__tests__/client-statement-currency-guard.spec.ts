import { BadRequestException } from '@nestjs/common';
import {
  CLIENT_STATEMENT_SUPPORTED_CURRENCY,
  CLIENT_STATEMENT_UNSUPPORTED_CURRENCY_CODE,
  assertClientStatementCurrencySupported,
  assessClientStatementCurrencies,
  buildUnsupportedCurrencyMessage,
  type ClientStatementCurrencyObservation,
} from '../client-statement-currency-guard';

/**
 * E1 — ekstre para birimi sınırı: saf sınıflandırma ve hata sözleşmesi.
 * Yardımcı hesap yapmaz, çevirmez, veritabanına dokunmaz.
 */
const obs = (
  source: ClientStatementCurrencyObservation['source'],
  currency: string | null | undefined,
  count = 1,
): ClientStatementCurrencyObservation => ({ source, currency, count });

describe('assessClientStatementCurrencies (E1)', () => {
  it('desteklenen para birimi yalnız TRY', () => {
    expect(CLIENT_STATEMENT_SUPPORTED_CURRENCY).toBe('TRY');
  });

  it('gözlem yok → desteklenir (TL kaynaklı ekstre ya da hareketsiz dönem)', () => {
    expect(assessClientStatementCurrencies([])).toEqual({
      supported: true,
      reasonCode: null,
      currencies: [],
      undeterminedCount: 0,
      sources: [],
    });
  });

  it('tüm kaynaklar TRY → desteklenir', () => {
    const result = assessClientStatementCurrencies([
      obs('BalanceLedger', 'TRY', 4),
      obs('ExpenseRequest', 'TRY'),
      obs('ClientPayout', 'TRY', 2),
    ]);
    expect(result.supported).toBe(true);
    expect(result.reasonCode).toBeNull();
  });

  it('tek bir USD kaynak → desteklenmez; para birimi ve kaynak bildirilir', () => {
    const result = assessClientStatementCurrencies([obs('BalanceLedger', 'TRY', 3), obs('ClientPayout', 'USD')]);
    expect(result).toEqual({
      supported: false,
      reasonCode: 'NON_TRY_SOURCE',
      currencies: ['USD'],
      undeterminedCount: 0,
      sources: ['ClientPayout'],
    });
  });

  it('birden çok döviz → sıralı ve tekil (EUR, USD)', () => {
    const result = assessClientStatementCurrencies([
      obs('ClientPayout', 'USD'),
      obs('ClientOffset', 'EUR'),
      obs('CollectionDisposition', 'USD', 5),
    ]);
    expect(result.currencies).toEqual(['EUR', 'USD']);
    expect(result.sources).toEqual(['ClientOffset', 'ClientPayout', 'CollectionDisposition']);
  });

  it.each([null, undefined, '', '   '])('para birimi %j → BELİRLENEMEDİ; TL ya da sıfır varsayılmaz', (currency) => {
    const result = assessClientStatementCurrencies([obs('BalanceLedger', currency as any, 2)]);
    expect(result.supported).toBe(false);
    expect(result.reasonCode).toBe('CURRENCY_UNDETERMINED');
    expect(result.undeterminedCount).toBe(2);
    expect(result.currencies).toEqual([]);
  });

  it('küçük harf / dolgulu "try" TL sayılmaz (yalnız tam "TRY" desteklenir)', () => {
    expect(assessClientStatementCurrencies([obs('BalanceLedger', 'try')]).supported).toBe(false);
    expect(assessClientStatementCurrencies([obs('BalanceLedger', ' TRY ')]).supported).toBe(false);
  });

  it('döviz + belirsiz birlikte → NON_TRY_SOURCE öncelikli; belirsiz sayısı da bildirilir', () => {
    const result = assessClientStatementCurrencies([obs('ClientPayout', 'USD'), obs('BalanceLedger', '', 3)]);
    expect(result.reasonCode).toBe('NON_TRY_SOURCE');
    expect(result.undeterminedCount).toBe(3);
    expect(result.sources).toEqual(['BalanceLedger', 'ClientPayout']);
  });

  it('kayıt sayısı 0 olan gözlem kaynak değildir (ekstreye girecek satır yok)', () => {
    expect(assessClientStatementCurrencies([obs('ClientPayout', 'USD', 0)]).supported).toBe(true);
  });
});

describe('assertClientStatementCurrencySupported (E1)', () => {
  it('desteklenen küme → hata atmaz', () => {
    expect(() => assertClientStatementCurrencySupported(assessClientStatementCurrencies([obs('BalanceLedger', 'TRY')]))).not.toThrow();
  });

  it('desteklenmeyen küme → HTTP 400, açık kod + gerekçe; 409 değildir (aylık koşu 409\'u mükerrer sayar)', () => {
    let error: any;
    try {
      assertClientStatementCurrencySupported(
        assessClientStatementCurrencies([obs('ClientPayout', 'USD'), obs('BalanceLedger', 'TRY')]),
      );
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(BadRequestException);
    expect(error.getStatus()).toBe(400);
    const body = error.getResponse();
    expect(body.code).toBe(CLIENT_STATEMENT_UNSUPPORTED_CURRENCY_CODE);
    expect(body.code).toBe('CLIENT_STATEMENT_UNSUPPORTED_CURRENCY');
    expect(body.reasonCode).toBe('NON_TRY_SOURCE');
    expect(body.currencies).toEqual(['USD']);
    expect(body.sources).toEqual(['ClientPayout']);
    expect(body.supportedCurrency).toBe('TRY');
    // web `message`i olduğu gibi gösterir
    expect(body.message).toContain('USD');
    expect(body.message).toContain('müvekkile ödeme');
    expect(body.message).toContain('hiçbir ekstre kaydı oluşturulmadı');
  });

  it('belirsiz para birimi → CURRENCY_UNDETERMINED ve anlaşılır gerekçe', () => {
    const assessment = assessClientStatementCurrencies([obs('BalanceLedger', '', 1)]);
    expect(buildUnsupportedCurrencyMessage(assessment)).toContain('para birimi belirlenemeyen kayıt var');
    expect(() => assertClientStatementCurrencySupported(assessment)).toThrow(BadRequestException);
  });

  it('gerekçe tutar ya da kayıt kimliği taşımaz', () => {
    const message = buildUnsupportedCurrencyMessage(
      assessClientStatementCurrencies([obs('ClientPayout', 'USD', 7)]),
    );
    expect(message).not.toMatch(/\d/);
  });
});
