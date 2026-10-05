/**
 * Metin tabanlı belge (ödeme / icra emri) PDF yerleşimi — Courier ızgarasının Roboto'da korunması (saf; DB / ağ yok).
 *
 * Şablonlar boşlukla hizalıdır; orantılı yazı tipinde boşluk genişliği değişir. buildGridLine her satırı ESKİ ızgaradaki aynı
 * sütun konumlarına (sütun = 0,6 × yazı boyutu) oturtur; metin değişmez, yalnız boşluk sayısı konuma çevrilir.
 */
import { MAX_GRID_START_FRACTION, MONOSPACE_CELL_EM, TEXT_PDF_USABLE_WIDTH, buildGridLine, parseGridLine } from '../template-pdf-text-grid';

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

  it('çok segmentli satır: ara sütun sabit genişlik (KIRILABİLİR), son sütun kalan genişlik; sol boşluk = offset', () => {
    expect(buildGridLine('DOSYA NO        : 2026/123', SIZE, 'content')).toEqual({
      columns: [
        { text: 'DOSYA NO', style: 'content', width: 16 * CELL },
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
  describe('dinamik uzun veri: ızgara sığmıyorsa tek paragraf (sayfa dışına taşma yok, metin eksilmez)', () => {
    const MAX_COLS = Math.floor((TEXT_PDF_USABLE_WIDTH * MAX_GRID_START_FRACTION) / CELL);

    it('son segment kullanılabilir genişliğin yarısından SONRA başlıyorsa: columns DEĞİL, segmentler tek boşlukla birleşen paragraf', () => {
      const satir = `  3. ${'x'.repeat(80)}  ek: 1.250,50 TL`;
      const node: any = buildGridLine(satir, SIZE, 'content');

      expect(node.columns).toBeUndefined();
      expect(node.text).toBe(`3. ${'x'.repeat(80)} ek: 1.250,50 TL`);
      expect(node.margin).toEqual([2 * CELL, 0, 0, 0]);
    });

    it('ızgara sınırında: son segment tam MAX sütunda başlarsa sütun, bir sonrakinde paragraf', () => {
      const sutun = (c: number): any => buildGridLine(`${'a'.repeat(c - 2)}  son`, SIZE, 'content');

      expect(sutun(MAX_COLS).columns).toHaveLength(2);
      expect(sutun(MAX_COLS + 1).columns).toBeUndefined();
      expect(sutun(MAX_COLS + 1).text).toBe(`${'a'.repeat(MAX_COLS - 1)} son`);
    });

    it('satır başı boşluk kullanılabilir genişliğin yarısıyla sınırlanır (yüzlerce boşluk kâğıt dışına itmez)', () => {
      const node: any = buildGridLine(`${' '.repeat(300)}girintili`, SIZE, 'content');

      expect(node.margin[0]).toBe(MAX_COLS * CELL);
      expect(node.margin[0]).toBeLessThanOrEqual(TEXT_PDF_USABLE_WIDTH / 2);
    });

    it('sınırı aşan girintiyle çok segmentli satır da paragrafa düşer (sütunlar kaydığı için ızgara kullanılmaz)', () => {
      const node: any = buildGridLine(`${' '.repeat(MAX_COLS + 5)}etiket  değer`, SIZE, 'content');

      expect(node.columns).toBeUndefined();
      expect(node.text).toBe('etiket değer');
    });

    it('ara sütunlar noWrap DEĞİL: uzun ara segment kendi sütununda sarar (kâğıt dışına çıkmaz)', () => {
      const node: any = buildGridLine(`${'k'.repeat(30)}  değer`, SIZE, 'content');

      expect(node.columns[0].noWrap).toBeUndefined();
      expect(node.columns[0].width).toBe(32 * CELL);
    });
  });
});
