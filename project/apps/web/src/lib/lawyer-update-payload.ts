// PR-1.5 — Avukat GÜNCELLEME payload'ı: yalnız GERÇEKTEN DEĞİŞEN alanlar gönderilir.
//
// BULGU (doğrulanmış, veri kaybı üretmişti): Avukat Düzenle formu state'ini
// `email: lawyer?.email || ""` kalıbıyla kuruyor ve kaydederken TÜM alanları geri
// gönderiyordu. Sunucu yanıtı bazı alanları kapsama (F01) nedeniyle taşımadığı için
// bu alanlar formda BOŞ başlıyor, backend ise `...writeData` ile geleni doğrudan
// yazıyordu (lawyer.service.ts) → her kaydetme telefon/adres/TCKN/banka/vergi
// bilgisini SESSİZCE SİLİYORDU. Ekranda hata görünmüyordu: istek 200 dönüyordu.
//
// PR-1 aynı sınıfı `iban` için çözmüştü, ama oradaki koruma backend'in boş IBAN'ı
// reddetmesine dayanıyordu; diğer alanlarda böyle bir guard YOK.
//
// ÇÖZÜM: Prisma'nın `undefined`-skip semantiği zaten kısmi güncellemeyi destekliyor.
// Bu yüzden güncellemede gönderilecek gövde, formun YÜKLENDİĞİ HÂLİ ile MEVCUT hâli
// arasındaki farktır. Dokunulmayan alan gövdeye HİÇ girmez → mevcut değer korunur.
// Backend sözleşmesi DEĞİŞMEZ.
//
// Yan fayda: `defaultPermissions`/`lawyerRank` gibi ayrıcalıklı alanlar da yalnız
// gerçekten değiştiğinde gönderilir; sıradan bir iletişim düzeltmesi artık gereksiz
// yere ADMIN/PARTNER kapısını tetiklemez.

/** İki değeri sipariş-duyarsız biçimde karşılaştırır (nesne/dizi dahil). */
function isEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null || a === undefined || b === undefined) return false;
  if (typeof a !== "object" || typeof b !== "object") return false;
  return stableStringify(a) === stableStringify(b);
}

/** Anahtar sırasından bağımsız deterministik serileştirme. */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([x], [y]) => (x < y ? -1 : x > y ? 1 : 0))
    .map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`);
  return `{${entries.join(",")}}`;
}

/**
 * Güncelleme gövdesi = `current` içinde `initial`'dan FARKLI olan alanlar.
 *
 * - Değişmemiş alan gövdeye GİRMEZ (mevcut sunucu değeri korunur).
 * - Kullanıcının gerçekten boşalttığı GÖRÜNÜR alan gövdeye girer (temizleme çalışır).
 * - Sunucudan hiç gelmemiş (formda boş başlamış) alan, kullanıcı dokunmadıysa
 *   gövdeye giremez → görünmeyen veri EZİLEMEZ.
 * - `initial` yoksa (yeni kayıt) tüm alanlar döner; oluşturma yolu DEĞİŞMEZ.
 */
export function buildLawyerUpdatePayload<T extends Record<string, unknown>>(
  initial: T | null | undefined,
  current: T,
): Partial<T> {
  if (!initial) return { ...current };

  const out: Record<string, unknown> = {};
  for (const key of Object.keys(current)) {
    if (!isEqual(initial[key], current[key])) {
      out[key] = current[key];
    }
  }
  return out as Partial<T>;
}
