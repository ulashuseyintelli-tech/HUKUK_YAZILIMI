// WSMR-A3g — DOĞRULANMIŞ İNDİRME: "indi" ile "gerçekten dosya geldi" ayrımı.
//
// BULGU AİLESİ: export yolları `new Blob([res.data])` ile indirmeyi DOĞRULAMADAN
// tetikliyordu. `api.get(..., { responseType: 'blob' })` yalnız `response.ok`
// denetler; sunucu **200 ile JSON hata gövdesi** veya boş gövde döndüğünde bu
// bir Blob olarak geçer, tarayıcı 0 baytlık ya da içi hata mesajı olan bir
// "rapor.pdf" indirir ve kullanıcı işlemi başarılı sanır.
//
// KURAL: doğrulama bitmeden HİÇBİR başarı yan etkisi çalışmaz — object URL
// üretilmez, link tıklanmaz, toast/callback/close/reset olmaz.

/** İndirme sonucu; çağıran başarı yan etkisini YALNIZ `ok` iken çalıştırır. */
export type DownloadOutcome =
  | { ok: true; bytes: number; fileName: string }
  | { ok: false; reason: DownloadFailureReason; message: string };

export type DownloadFailureReason =
  /** Gövde yok (undefined/null) veya Blob/ArrayBuffer değil. */
  | 'EMPTY_BODY'
  /** Gövde var ama sıfır bayt. */
  | 'ZERO_BYTES'
  /** Beklenen ikili içerik yerine JSON (tipik: HTTP 200 + hata gövdesi). */
  | 'JSON_ERROR_BODY'
  /** Content-Type beklenen MIME ile uyuşmuyor. */
  | 'UNEXPECTED_TYPE';

const FAILURE_TEXT: Record<DownloadFailureReason, string> = {
  EMPTY_BODY: 'Sunucudan dosya alınamadı.',
  ZERO_BYTES: 'Sunucudan boş dosya geldi; indirme yapılmadı.',
  JSON_ERROR_BODY: 'Sunucu dosya yerine hata döndürdü; indirme yapılmadı.',
  UNEXPECTED_TYPE: 'Sunucudan beklenmeyen içerik türü geldi; indirme yapılmadı.',
};

/**
 * Sunucudan gelen dosya adını GÜVENLİ hale getirir.
 *
 * `case-attachments` dosya adını SUNUCUDAN alır (`attachment.fileName`); dizin
 * ayırıcı ve kontrol karakterleri temizlenmezse `download` özniteliği üzerinden
 * yol/kontrol-karakteri enjeksiyonu mümkün olur.
 */
export function safeFileName(raw: unknown, fallback: string): string {
  if (typeof raw !== 'string') return fallback;
  const cleaned = raw
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001F\u007F]/g, '') // kontrol karakterleri (C0 + DEL)
    .replace(/[\\/]/g, '_') // dizin ayırıcıları
    .replace(/^\.+/, '') // baştaki noktalar (gizli dosya / ".." kaçışı)
    .trim();
  return cleaned.length > 0 ? cleaned.slice(0, 200) : fallback;
}

function sizeOf(body: unknown): number | undefined {
  if (typeof Blob !== 'undefined' && body instanceof Blob) return body.size;
  if (body instanceof ArrayBuffer) return body.byteLength;
  return undefined;
}

function typeOf(body: unknown): string {
  return typeof Blob !== 'undefined' && body instanceof Blob ? body.type : '';
}

/**
 * Gövdeyi doğrular. Başarısızsa hiçbir yan etki üretmez.
 *
 * @param expectedType beklenen MIME öneki (ör. `application/pdf`). Sunucu tür
 *   bildirmiyorsa (boş `type`) tür denetimi ATLANIR — yanlış negatif üretmemek
 *   için; boyut ve JSON denetimleri yine uygulanır.
 */
export function validateDownloadBody(
  body: unknown,
  expectedType?: string,
): { ok: true; bytes: number } | { ok: false; reason: DownloadFailureReason } {
  const bytes = sizeOf(body);
  if (bytes === undefined) return { ok: false, reason: 'EMPTY_BODY' };
  if (bytes === 0) return { ok: false, reason: 'ZERO_BYTES' };

  const type = typeOf(body).toLowerCase();
  // HTTP 200 + JSON hata gövdesi: ikili dosya beklenirken JSON geldiyse indirme YOK.
  if (type.includes('application/json')) return { ok: false, reason: 'JSON_ERROR_BODY' };
  if (expectedType && type && !type.includes(expectedType.toLowerCase())) {
    return { ok: false, reason: 'UNEXPECTED_TYPE' };
  }
  return { ok: true, bytes };
}

/**
 * Doğrular ve YALNIZ doğrulama geçerse indirmeyi tetikler.
 * Object URL her durumda revoke edilir (hata yolunda da sızıntı bırakılmaz).
 */
export function downloadVerified(
  body: unknown,
  opts: { fileName: string; fallbackFileName: string; expectedType?: string },
): DownloadOutcome {
  const verdict = validateDownloadBody(body, opts.expectedType);
  if (!verdict.ok) {
    return { ok: false, reason: verdict.reason, message: FAILURE_TEXT[verdict.reason] };
  }

  const fileName = safeFileName(opts.fileName, opts.fallbackFileName);
  const blob = body instanceof Blob ? body : new Blob([body as ArrayBuffer]);
  const url = window.URL.createObjectURL(blob);
  try {
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', fileName);
    document.body.appendChild(link);
    link.click();
    link.remove();
  } finally {
    window.URL.revokeObjectURL(url);
  }
  return { ok: true, bytes: verdict.bytes, fileName };
}
