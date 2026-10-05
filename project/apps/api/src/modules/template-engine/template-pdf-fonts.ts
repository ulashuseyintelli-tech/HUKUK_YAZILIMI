import type { TFontDictionary } from 'pdfmake/interfaces';

/**
 * Belge şablonu PDF'lerinin yazı tipi ailesi adı (TemplateEngineService PDF üreticilerinde `font:` değeri).
 *
 * NEDEN: pdfkit'in standart PDF yazı tipleri (Courier / Helvetica) WinAnsi kodlamalıdır; WinAnsi'de olmayan Türkçe harfler
 * (ı İ ş Ş ğ Ğ) için kodlayıcı (`AFMFont.encodeText`) `char.toString(16)` ile bayta sığmayan 3 haneli jeton yazar
 * (ı → "131", ş → "15f"); hex dizesi yarım bayt kayar ve o metin parçasının geri kalanı da bozulur. 500 YOK, sessiz bozulma.
 * Gömülü (TrueType) yazı tipi bu yolu hiç kullanmaz.
 *
 * Yazı tipi: pdfmake'in kendi paketindeki gömülü Roboto (`pdfmake/build/vfs_fonts`; owner kararı 2026-10-04 "mevcut gömülü
 * Roboto") — yeni yazı tipi dosyası / lisans / yayın paketi yolu YOK. `client-statement-pdf.service.ts` ve
 * `ai-document.service.ts` aynı kaynağı kullanır. Kalın = Roboto-Medium (pdfmake'in varsayılan eşlemesi).
 */
export const TEMPLATE_PDF_FONT = 'Roboto';

let cached: TFontDictionary | null = null;

/**
 * Sunucu tarafı `PdfPrinter` için yazı tipi sözlüğü (Buffer tanımlayıcılı; dosya yolu yok → release ağacı salt okunur kalır).
 *
 * FAIL-CLOSED: gömülü yazı tipi bulunamazsa standart yazı tipine SESSİZCE düşülmez (düşmek tam da bozulan Türkçe çıktıdır);
 * hata fırlatılır, çağıran belge üretimi başarısız olur.
 *
 * /// <remarks>
 * /// Çağrıldığı yerler:
 * ///  - TemplateEngineService.generateTakipTalebiPdfFormatted() → takip talebi PDF'i (taslak + dosya yolu)
 * ///  - TemplateEngineService.textToPdf() → ödeme emri / icra emri PDF'i (dosya yolu)
 * /// </remarks>
 */
export function getTemplatePdfFonts(): TFontDictionary {
  if (cached) return cached;
  // Ağır paket (~0,8 MB base64) yalnız ilk PDF'te yüklenir; ai-document / client-statement ile aynı require deseni.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const vfsModule = require('pdfmake/build/vfs_fonts');
  // pdfmake@0.2.20: modül haritayı DOĞRUDAN dışa aktarır (`module.exports = vfs`); eski / tarayıcı derlemeleri `.pdfMake.vfs`
  // ya da `.vfs` altında verir — üçü de denenir, gerçek anahtar `file()` içinde doğrulanır.
  const vfs: Record<string, string> | undefined = vfsModule?.pdfMake?.vfs || vfsModule?.vfs || vfsModule;
  const file = (name: string): Buffer => {
    const b64 = vfs?.[name];
    if (typeof b64 !== 'string' || b64.length === 0) {
      throw new Error(`Gömülü PDF yazı tipi bulunamadı: ${name} (pdfmake/build/vfs_fonts)`);
    }
    return Buffer.from(b64, 'base64');
  };
  cached = {
    [TEMPLATE_PDF_FONT]: {
      normal: file('Roboto-Regular.ttf'),
      bold: file('Roboto-Medium.ttf'),
      italics: file('Roboto-Italic.ttf'),
      bolditalics: file('Roboto-MediumItalic.ttf'),
    },
  };
  return cached;
}

/** Yalnız test: önbelleği sıfırlar (gömülü yazı tipi yokluğu senaryosu için). */
export function resetTemplatePdfFontsCacheForTest(): void {
  cached = null;
}
