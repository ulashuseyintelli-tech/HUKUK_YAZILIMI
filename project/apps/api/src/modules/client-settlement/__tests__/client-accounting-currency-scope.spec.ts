import {
  buildClientAccountingCurrencyScope,
  type ClientAccountingCurrencyObservation,
} from '../client-accounting-currency-scope';

/**
 * G1 — Genel Cari para birimi kapsamı: saf sınıflandırma (tutar toplamaz, çevirmez, veritabanına dokunmaz).
 */
const obs = (
  caseId: string,
  currency: string | null | undefined,
  count = 1,
  source: ClientAccountingCurrencyObservation['source'] = 'ClientPayout',
): ClientAccountingCurrencyObservation => ({ caseId, source, currency, count });

describe('buildClientAccountingCurrencyScope (G1)', () => {
  it('kapsam dışı hiçbir şey yok → her dosya TAM, durum temiz, açıklama yok', () => {
    const result = buildClientAccountingCurrencyScope({
      requestedCurrency: 'TRY',
      cases: [{ caseId: 'a', caseCurrency: 'TRY' }],
      observations: [],
    });
    expect(result.durum).toEqual({
      istenenParaBirimi: 'TRY',
      kapsamDisiKayitVar: false,
      kapsamDisiParaBirimleri: [],
      kapsamDisiDosyaSayisi: 0,
      kismiKapsamDosyaSayisi: 0,
      belirsizParaBirimiKayitSayisi: 0,
      yalnizIstenenParaBirimi: true,
      mesaj: null,
    });
    expect(result.dosyalar.get('a')).toMatchObject({ kapsam: 'TAM', dosyaParaBirimi: 'TRY', mesaj: null });
  });

  it('dosya para birimi görünümden farklı → DISI (kayıt olmasa bile); dosyanın kendi para birimi kapsam dışı listesine girer', () => {
    const result = buildClientAccountingCurrencyScope({
      requestedCurrency: 'TRY',
      cases: [{ caseId: 'usd', caseCurrency: 'USD' }],
      observations: [],
    });
    expect(result.dosyalar.get('usd')).toMatchObject({ kapsam: 'DISI', kapsamDisiParaBirimleri: ['USD'] });
    expect(result.durum).toMatchObject({ kapsamDisiKayitVar: true, kapsamDisiDosyaSayisi: 1, kapsamDisiParaBirimleri: ['USD'] });
  });

  it('DISI mesajı sıfır anlamına gelmediğini söyler ve tutar / kayıt kimliği taşımaz', () => {
    const { dosyalar } = buildClientAccountingCurrencyScope({
      requestedCurrency: 'TRY',
      cases: [{ caseId: 'usd', caseCurrency: 'USD' }],
      observations: [obs('usd', 'USD', 7)],
    });
    const mesaj = dosyalar.get('usd')!.mesaj!;
    expect(mesaj).toContain('bu para birimi TRY görünümünün toplamına dahil değildir');
    expect(mesaj).toContain('sıfır anlamına gelmez');
    expect(mesaj).not.toMatch(/\d/);
  });

  it('TL dosyada TL dışı kayıt → KISMI; para birimleri sıralı ve tekil', () => {
    const result = buildClientAccountingCurrencyScope({
      requestedCurrency: 'TRY',
      cases: [{ caseId: 'a', caseCurrency: 'TRY' }],
      observations: [obs('a', 'USD', 2), obs('a', 'EUR'), obs('a', 'USD', 1, 'BalanceLedger')],
    });
    expect(result.dosyalar.get('a')).toMatchObject({ kapsam: 'KISMI', kapsamDisiParaBirimleri: ['EUR', 'USD'] });
    expect(result.durum.kismiKapsamDosyaSayisi).toBe(1);
    expect(result.durum.kapsamDisiDosyaSayisi).toBe(0);
  });

  it('istenen para birimindeki gözlem kapsam dışı sayılmaz (savunmacı: çağıran süzmediyse de)', () => {
    const result = buildClientAccountingCurrencyScope({
      requestedCurrency: 'TRY',
      cases: [{ caseId: 'a', caseCurrency: 'TRY' }],
      observations: [obs('a', 'TRY', 5)],
    });
    expect(result.dosyalar.get('a')!.kapsam).toBe('TAM');
  });

  it.each([null, undefined, '', '  '])('para birimi %j → BELİRSİZ kayıt olarak sayılır; sıfır / TL varsayılmaz', (currency) => {
    const result = buildClientAccountingCurrencyScope({
      requestedCurrency: 'TRY',
      cases: [{ caseId: 'a', caseCurrency: 'TRY' }],
      observations: [obs('a', currency as any, 4)],
    });
    expect(result.dosyalar.get('a')).toMatchObject({ kapsam: 'KISMI', belirsizParaBirimiKayitSayisi: 4, kapsamDisiParaBirimleri: [] });
    expect(result.durum).toMatchObject({ kapsamDisiKayitVar: true, belirsizParaBirimiKayitSayisi: 4 });
  });

  it('sayısı 0 olan gözlem kayıt değildir', () => {
    const result = buildClientAccountingCurrencyScope({
      requestedCurrency: 'TRY',
      cases: [{ caseId: 'a', caseCurrency: 'TRY' }],
      observations: [obs('a', 'USD', 0)],
    });
    expect(result.durum.kapsamDisiKayitVar).toBe(false);
  });

  it('istenen para birimi USD ise TL dosya DISI olur (ölçüt para birimine özgü değildir)', () => {
    const result = buildClientAccountingCurrencyScope({
      requestedCurrency: 'USD',
      cases: [
        { caseId: 'try', caseCurrency: 'TRY' },
        { caseId: 'usd', caseCurrency: 'USD' },
      ],
      observations: [],
    });
    expect(result.dosyalar.get('try')!.kapsam).toBe('DISI');
    expect(result.dosyalar.get('usd')!.kapsam).toBe('TAM');
    expect(result.durum.mesaj).toContain('yalnız USD kayıtlarını kapsar');
  });

  it('aynı dosya iki alacaklı bağıyla gelse de bir kez sayılır', () => {
    const result = buildClientAccountingCurrencyScope({
      requestedCurrency: 'TRY',
      cases: [
        { caseId: 'usd', caseCurrency: 'USD' },
        { caseId: 'usd', caseCurrency: 'USD' },
      ],
      observations: [],
    });
    expect(result.durum.kapsamDisiDosyaSayisi).toBe(1);
  });

  it('başka dosyanın gözlemi bu dosyayı etkilemez', () => {
    const result = buildClientAccountingCurrencyScope({
      requestedCurrency: 'TRY',
      cases: [
        { caseId: 'a', caseCurrency: 'TRY' },
        { caseId: 'b', caseCurrency: 'TRY' },
      ],
      observations: [obs('b', 'USD')],
    });
    expect(result.dosyalar.get('a')!.kapsam).toBe('TAM');
    expect(result.dosyalar.get('b')!.kapsam).toBe('KISMI');
  });
});
