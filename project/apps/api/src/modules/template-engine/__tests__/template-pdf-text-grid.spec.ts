/**
 * Metin tabanlı belge (ödeme / icra emri) PDF yerleşimi — Courier ızgarasının Roboto'da korunması (saf; DB / ağ yok).
 *
 * Şablonlar boşlukla hizalıdır; orantılı yazı tipinde boşluk genişliği değişir. buildGridLine her satırı ESKİ ızgaradaki aynı
 * sütun konumlarına (sütun = 0,6 × yazı boyutu) oturtur; metin değişmez, yalnız boşluk sayısı konuma çevrilir.
 */
import { MONOSPACE_CELL_EM, buildGridLine, parseGridLine } from '../template-pdf-text-grid';

const SIZE = 10;
const CELL = SIZE * MONOSPACE_CELL_EM; // 6 pt

describe('parseGridLine', () => {
  it('boş / yalnız boşluk satırı → null', () => {
    expect(parseGridLine('')).toBeNull();
    expect(parseGridLine('     ')).toBeNull();
  });

  it('satır başı boşluk = offset; tek boşluklu metin tek segment', () => {
    expect(parseGridLine('     Adres: Gökçeler Mah. No:7/3')).toEqual({ offset: 5, segments: [{ col: 5, text: 'Adres: Gökçeler Mah. No:7/3' }] });
  });

  it('"ETİKET   : değer" → iki segment; ikinci segment ESKİ sütununda', () => {
    expect(parseGridLine('DOSYA NO        : 2026/123')).toEqual({
      offset: 0,
      segments: [{ col: 0, text: 'DOSYA NO' }, { col: 16, text: ': 2026/123' }],
    });
  });

  it('metin içindeki 2+ boşluk sütun sınırıdır (T.C. Kimlik No  Vergi No)', () => {
    expect(parseGridLine('     T.C. Kimlik No: 10000000146  Vergi No: 123')).toEqual({
      offset: 5,
      segments: [{ col: 5, text: 'T.C. Kimlik No: 10000000146' }, { col: 34, text: 'Vergi No: 123' }],
    });
  });

  it('BÜYÜK HARF etiket + tek boşluk + ":" ayrı sütundur ("ALACAGIN TUTARI :" 16. sütunda, ötekilerle aynı hizada)', () => {
    expect(parseGridLine('ALACAGIN TUTARI :')).toEqual({ offset: 0, segments: [{ col: 0, text: 'ALACAGIN TUTARI' }, { col: 16, text: ':' }] });
    expect(parseGridLine('TOPLAM : 18.250,50 TL')?.segments).toEqual([{ col: 0, text: 'TOPLAM' }, { col: 7, text: ': 18.250,50 TL' }]);
    // küçük harfli / sayılı ilk segment ya da iki nokta üst üste bitişik ise bölünmez
    expect(parseGridLine('Teblig Tarihi : 1')?.segments).toHaveLength(1);
    expect(parseGridLine('(ORNEK NO: 7)')?.segments).toHaveLength(1);
    expect(parseGridLine('T.C. Kimlik No: 1')?.segments).toHaveLength(1);
  });

  it('sağdaki boşluklar atılır; tek boşluk korunur', () => {
    expect(parseGridLine('BORCLU          :   ')).toEqual({ offset: 0, segments: [{ col: 0, text: 'BORCLU' }, { col: 16, text: ':' }] });
    expect(parseGridLine('Teblig Tarihi: ....../....../..........')?.segments).toEqual([{ col: 0, text: 'Teblig Tarihi: ....../....../..........' }]);
  });

  it('metin bütünlüğü: segment metinleri (tek boşlukla birleşmiş) satırın kelimelerini sırayla aynen taşır', () => {
    const satir = '  1. Işleyen faiz ve ödeme şekli: 1.250,50 TL    (Ödenmiş)';
    const p = parseGridLine(satir)!;
    expect(p.segments.map((s) => s.text).join(' ').split(/\s+/u)).toEqual(satir.trim().split(/\s+/u));
  });
});

describe('buildGridLine', () => {
  it('boş satır → tek boşluklu paragraf (satır yüksekliği korunur)', () => {
    expect(buildGridLine('', SIZE, 'content')).toEqual({ text: ' ', style: 'content' });
  });

  it('sütun 0, tek segment: kenar boşluğu YOK (uzun paragraf doğal kırılır)', () => {
    expect(buildGridLine('Yukarda yazili borcun ve takip giderlerinin', SIZE, 'content')).toEqual({
      text: 'Yukarda yazili borcun ve takip giderlerinin',
      style: 'content',
    });
  });

  it('girintili tek segment: sol boşluk = offset × hücre', () => {
    expect(buildGridLine(`${' '.repeat(42)}Icra Muduru`, SIZE, 'content')).toEqual({
      text: 'Icra Muduru',
      style: 'content',
      margin: [42 * CELL, 0, 0, 0],
    });
  });

  it('çok segmentli satır: ara sütun sabit genişlik + noWrap, son sütun kalan genişlik; sol boşluk = offset', () => {
    expect(buildGridLine('DOSYA NO        : 2026/123', SIZE, 'content')).toEqual({
      columns: [
        { text: 'DOSYA NO', style: 'content', width: 16 * CELL, noWrap: true },
        { text: ': 2026/123', style: 'content', width: '*' },
      ],
      columnGap: 0,
      margin: [0, 0, 0, 0],
    });
    expect(buildGridLine('     T.C. Kimlik No: 1  Vergi No: 2', SIZE, 'content')).toMatchObject({
      columns: [{ width: (5 + 'T.C. Kimlik No: 1'.length + 2 - 5) * CELL }, { width: '*' }],
      margin: [5 * CELL, 0, 0, 0],
    });
  });

  it('yazı boyutu hücreyi ölçekler (10 → 6 pt, 8 → 4,8 pt)', () => {
    expect(buildGridLine(`${' '.repeat(10)}X`, 8, 's')).toMatchObject({ margin: [10 * 8 * MONOSPACE_CELL_EM, 0, 0, 0] });
  });

  it('metin değişmez: üretilen düğümlerin metinleri satırın kelimeleriyle aynı', () => {
    const satir = 'ALACAKLI        : ÖRNEK GIDA SANAYİ VE TİCARET A.Ş.';
    const node: any = buildGridLine(satir, SIZE, 'content');
    const metin = node.columns.map((c: { text: string }) => c.text).join(' ');
    expect(metin.split(/\s+/u)).toEqual(satir.split(/\s+/u));
  });
});
