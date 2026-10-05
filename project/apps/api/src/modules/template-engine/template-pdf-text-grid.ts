import type { Content } from 'pdfmake/interfaces';

/**
 * Metin tabanlı belgelerin (ödeme emri / icra emri; `renderTemplate` çıktısı) PDF yerleşimi.
 *
 * Bu şablonlar tek aralıklı yazı tipine göre BOŞLUKLARLA hizalanmıştır: başlıkları ortalayan 30 boşluk,
 * `DOSYA NO        : ...` sütunları, 42. sütundaki imza bloğu. Orantılı (Roboto) yazı tipinde boşluk 0,25 em'dir
 * (Courier'da 0,6 em) → aynı metin sola kayar, sütunlar hizasını yitirir. Burada her satır, ESKİ Courier ızgarasındaki
 * AYNI konumlara oturtulur: satır başı boşluk = sol boşluk, 2+ boşluklu aralıklar = sabit genişlikli sütun sınırı.
 * Metin (kelimeler, tutarlar, noktalama) DEĞİŞMEZ; yalnız boşluk sayısı konuma çevrilir.
 *
 * /// <remarks>
 * /// Çağrıldığı yerler:
 * ///  - TemplateEngineService.textToPdf() → her metin satırı (ödeme emri / icra emri PDF'i)
 * ///  - template-engine-pdf-text-grid.spec.ts → birim test
 * /// </remarks>
 */

/** Önceki standart Courier yazı tipinin karakter hücresi genişliği (yazı tipi boyutunun katı). */
export const MONOSPACE_CELL_EM = 0.6;

/** textToPdf kullanılabilir satır genişliği: A4 (595,28 pt) − sol / sağ 40 pt kenar boşluğu. */
export const TEXT_PDF_USABLE_WIDTH = 595.28 - 80;

/**
 * Izgaranın kullanabileceği en uzak sütun = kullanılabilir genişliğin bu oranı. Şablon sütunları (etiket : değer, imza bloğu)
 * bunun çok içindedir; DİNAMİK veri (kullanıcının yazdığı uzun ad / adres / kalem açıklaması, kazara çift boşluk) bunu
 * aşarsa ızgara KULLANILMAZ: aksi hâlde son sütunun kalan genişliği ≤ 0 olur ve metin / tutar sayfa dışına düşer.
 */
export const MAX_GRID_START_FRACTION = 0.5;

export interface GridSegment {
  /** Segmentin ızgara sütunu (0 tabanlı; satır başı boşluklar dahil) */
  col: number;
  text: string;
}

export interface GridLine {
  /** Satır başı boşluk sayısı (sütun) */
  offset: number;
  segments: GridSegment[];
}

/** Satırı (sağdaki boşluklar atılarak) ızgara segmentlerine böler; boş / yalnız boşluk satırı → null. */
export function parseGridLine(line: string): GridLine | null {
  const body = line.replace(/\s+$/u, '');
  if (body.length === 0) return null;
  const offset = body.length - body.replace(/^ +/u, '').length;
  const segments: GridSegment[] = [];
  let col = offset;
  for (const piece of body.slice(offset).split(/( {2,})/u)) {
    if (piece.length === 0) continue;
    if (/^ {2,}$/u.test(piece)) {
      col += piece.length;
      continue;
    }
    segments.push({ col, text: piece });
    col += piece.length;
  }
  // BÜYÜK HARF etiket + TEK boşluk + ":" ("ALACAGIN TUTARI :" — etiket 15 harf, sütun 16): 2+ boşluk kuralı bunu bölmez, ama
  // eski ızgarada ":" öteki etiketlerle aynı sütundaydı → ":" kendi sütununda ayrı segment olur.
  const first = segments[0];
  const label = first && /^(\p{Lu}[\p{Lu} ]*\p{Lu}) (:.*)$/u.exec(first.text);
  if (label) segments.splice(0, 1, { col: first.col, text: label[1] }, { col: first.col + label[1].length + 1, text: label[2] });
  return { offset, segments };
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

/**
 * Tek metin satırı → pdfmake içeriği.
 *
 * - Tek segmentli satır: sol boşluklu paragraf (uzun satır doğal kırılır).
 * - Çok segmentli satır, ızgara sığıyorsa (son segment kullanılabilir genişliğin yarısından önce başlıyor): sabit genişlikli
 *   sütunlar; ara sütunlar KIRILABİLİR (kendi sütununda sarar, sayfa dışına çıkamaz), son sütun kalan genişlik.
 * - Izgara sığmıyorsa (dinamik uzun veri): segmentler TEK boşlukla birleşen tek paragraf — metin eksilmez, sayfa dışına çıkmaz.
 * - Satır başı boşluk kullanılabilir genişliğin yarısıyla sınırlanır.
 */
export function buildGridLine(line: string, fontSize: number, style: string, usableWidth: number = TEXT_PDF_USABLE_WIDTH): Content {
  const parsed = parseGridLine(line);
  if (!parsed) return { text: ' ', style };
  const cell = fontSize * MONOSPACE_CELL_EM;
  const maxCols = Math.floor((usableWidth * MAX_GRID_START_FRACTION) / cell);
  const marginLeft = round2(Math.min(parsed.offset, maxCols) * cell);
  const { segments } = parsed;
  const margin: [number, number, number, number] = [marginLeft, 0, 0, 0];
  if (segments.length === 1) {
    return marginLeft > 0 ? { text: segments[0].text, style, margin } : { text: segments[0].text, style };
  }
  const gridFits = parsed.offset <= maxCols && segments[segments.length - 1].col <= maxCols;
  if (!gridFits) {
    return { text: segments.map((s) => s.text).join(' '), style, ...(marginLeft > 0 ? { margin } : {}) };
  }
  return {
    columns: segments.map((s, i) =>
      i < segments.length - 1
        ? { text: s.text, style, width: round2((segments[i + 1].col - s.col) * cell) }
        : { text: s.text, style, width: '*' as const },
    ),
    columnGap: 0,
    margin,
  };
}
