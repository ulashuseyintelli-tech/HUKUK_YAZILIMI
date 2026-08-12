// PR-2A1 — `FileReader` callback zincirini AWAIT EDİLEBİLİR hâle getirir.
//
// BULGU (doğrulanmış, UyapPanel.handleDocumentSubmit): mutation `reader.onload` içindeydi.
// Dış `try/catch` o callback'i YAKALAYAMAZ — geç çalışır. Sonuç:
//   1. UYAP belge gönderimi başarısız olursa hata HİÇBİR YERDE görünmez
//      (unhandled rejection; kullanıcı belgeyi gönderildi sanır),
//   2. `finally` reader daha bitmeden çalıştığı için düğme ANINDA yeniden etkinleşir —
//      kullanıcı tekrar basar, çift gönderim riski doğar.
//
// Bu yardımcı okumayı Promise'e çevirir; böylece okuma → mutation → refresh zinciri tek
// bir `await` akışında kalır ve loading gerçek bitişe kadar sürer.
//
// `onerror` VE `onabort` ayrı ayrı reddedilir: iptal edilen okuma "başarılı boş içerik"
// değildir. Reddedildiğinde mutation HİÇ BAŞLAMAZ.

export const FILE_READ_FAILED = 'FILE_READ_FAILED' as const;
export const FILE_READ_ABORTED = 'FILE_READ_ABORTED' as const;

/** Okuma hatasını API hatasından ayırt edilebilir kılan typed hata. */
export class FileReadError extends Error {
  readonly code: typeof FILE_READ_FAILED | typeof FILE_READ_ABORTED;

  constructor(code: typeof FILE_READ_FAILED | typeof FILE_READ_ABORTED, message: string) {
    super(message);
    this.name = 'FileReadError';
    this.code = code;
  }
}

/**
 * Dosyayı base64 gövdesine çevirir (data-URI öneki ÇIKARILIR).
 *
 * Reddetme hâlinde çağıran mutation'ı başlatmamalıdır; okuma hatası ile API hatası
 * kullanıcıya AYRI mesajlarla gösterilir.
 */
export function readFileAsBase64(file: File): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();

    reader.onerror = () => {
      reject(new FileReadError(FILE_READ_FAILED, 'Dosya okunamadı.'));
    };
    reader.onabort = () => {
      reject(new FileReadError(FILE_READ_ABORTED, 'Dosya okuma iptal edildi.'));
    };
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== 'string') {
        reject(new FileReadError(FILE_READ_FAILED, 'Dosya içeriği çözümlenemedi.'));
        return;
      }
      // `data:<mime>;base64,<payload>` → yalnız payload. Önek yoksa içerik geçersizdir.
      const comma = result.indexOf(',');
      if (comma < 0) {
        reject(new FileReadError(FILE_READ_FAILED, 'Dosya içeriği çözümlenemedi.'));
        return;
      }
      const payload = result.slice(comma + 1);
      if (!payload) {
        reject(new FileReadError(FILE_READ_FAILED, 'Dosya içeriği boş.'));
        return;
      }
      resolve(payload);
    };

    try {
      reader.readAsDataURL(file);
    } catch (e) {
      reject(new FileReadError(FILE_READ_FAILED, 'Dosya okuma başlatılamadı.'));
    }
  });
}
