// PR-2A1 — MUTATION ile SECONDARY REFRESH hatalarının AYRILMASI.
//
// BULGU: ilk onarım turunda `await mutate(); await reload();` tek `try` bloğundaydı.
// `reload()` başarısız olursa kullanıcıya "kaydedilemedi" deniyordu — oysa kayıt YAPILMIŞTI.
// Bu, sessiz mutasyon ailesinin ayna görüntüsü: bu kez BAŞARI sessizce kaybediliyor ve
// kullanıcı işlemi tekrar deneyerek ÇİFT KAYIT üretebiliyor.
//
// KURAL (owner, kilitli): reload başarısızlığı mutation başarısını GERİ ÇEVİRMEZ; görünür
// bir "kaydedildi, liste yenilenemedi" STALE durumu üretir. İki hata ayrı raporlanır.
//
// ── Unmount ──────────────────────────────────────────────────────────────────────────
// Unmount, mutation'ı başarılı saymak veya iptal olmuş göstermek DEĞİLDİR. İstek sürerken
// bileşen kalkarsa sonuç UI'a YAZILMAZ; ama sonuç uydurulmaz da. API istemcisinde
// `AbortSignal` desteği YOK — kural gereği yeni altyapı KURULMAZ, yalnız yazma bastırılır.
// Hata raporlama bastırılmaz: UI yoksa kullanıcı state'i yazılmaz, merkezî gözlemlenebilir
// yol çalışmaya devam eder (bkz. `onObserve`).

import { toActionError, type ActionErrorContract } from './action-error';

/**
 * Gözlemlenebilirlik katmanının KENDİ arızası için kararlı reason code.
 * Kullanıcıya gösterilmez; yalnız son çare kanalına yazılır.
 */
export const REPORTER_FAILURE = 'REPORTER_FAILURE' as const;

/**
 * `REPORTER_FAILURE` kanalına yazılabilecek TEK şekil.
 *
 * Ham hata nesnesi BİLİNÇLİ olarak yoktur: request body, kişisel veri, token, SQL ve stack
 * bu yoldan sızabilirdi. Yalnız teşhis için gereken güvenli metadata taşınır.
 */
export interface ReporterFailurePayload {
  reason: typeof REPORTER_FAILURE;
  phase: 'MUTATION' | 'REFRESH';
  /** Hata sınıfı adı (`TypeError`, `Error`, …) — serbest metin DEĞİL. */
  errorName: string;
  /** Sunucunun kararlı kodu, yalnız güvenli desene uyuyorsa. */
  code?: string;
  /** İzleme kimliği, yalnız güvenli desene uyuyorsa. */
  correlationId?: string;
}

declare global {
  // eslint-disable-next-line no-var
  var __clientErrorFallback__: ((payload: ReporterFailurePayload) => void) | undefined;
}

// ── Değer doğrulaması: ALAN ADI GÜVENİLİR SAYILMAZ ──────────────────────────────────
//
// Genel bir "güvenli karakter" deseni YETMEZ: `12345678901` (TCKN) veya `05551234567`
// (telefon) böyle bir desenden geçer. Hassas değer yanlışlıkla `code`/`correlationId`
// alanına da atanabilir. Bu yüzden her alan KENDİ kesin formatıyla doğrulanır ve
// format bilinmiyorsa alan TAMAMEN ÇIKARILIR.

/** 8+ ardışık rakam → kimlik/telefon/kart/IBAN gövdesi olabilir; hiçbir alanda kabul edilmez. */
const LONG_DIGIT_RUN = /\d{8,}/;

/**
 * Uygulama hata kodu formatı: SCREAMING_SNAKE_CASE, HARFLE başlar.
 * `RATE_LIMITED` geçer; `12345678901`, `05551234567`, `TR3300…` geçmez.
 */
const APP_ERROR_CODE = /^[A-Z][A-Z0-9]*(_[A-Z0-9]+)*$/;

function safeErrorCode(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  if (value.length < 3 || value.length > 64) return undefined;
  if (!APP_ERROR_CODE.test(value)) return undefined;
  if (LONG_DIGIT_RUN.test(value)) return undefined;
  return value;
}

/**
 * Korelasyon kimliği YALNIZ sistemin gerçekten ürettiği kesin formatta kabul edilir: UUID.
 * Başka her şey (serbest metin, sayı dizisi, "req-abc-123") ÇIKARILIR — kesin format
 * bilinmiyorsa alanı taşımak, sızıntı riskini alan adına güvenerek kabul etmek olurdu.
 */
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function safeCorrelationId(value: unknown): string | undefined {
  return typeof value === 'string' && UUID.test(value) ? value : undefined;
}

/** JS identifier formatı (`TypeError`, `AbortError`). Uymazsa `UnknownError`. */
const SAFE_IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;

function safeErrorName(value: unknown): string | undefined {
  if (typeof value !== 'string' || !SAFE_IDENTIFIER.test(value)) return undefined;
  if (LONG_DIGIT_RUN.test(value)) return undefined;
  return value;
}

/** Ham hatadan YALNIZ güvenli metadata çıkarır. Mesaj/stack/gövde ASLA taşınmaz. */
function sanitizeReporterFailure(
  phase: 'MUTATION' | 'REFRESH',
  reporterError: unknown,
): ReporterFailurePayload {
  const payload: ReporterFailurePayload = {
    reason: REPORTER_FAILURE,
    phase,
    errorName: 'UnknownError',
  };
  if (reporterError && typeof reporterError === 'object') {
    const e = reporterError as Record<string, unknown>;
    const ctorName = (e.constructor as { name?: unknown } | undefined)?.name;
    payload.errorName = safeErrorName(e.name) ?? safeErrorName(ctorName) ?? 'UnknownError';

    // Alan ADI güvenilir sayılmaz: değerin KENDİ formatı doğrulanır.
    const code = safeErrorCode(e.code);
    if (code) payload.code = code;

    const correlationId = safeCorrelationId(e.correlationId) ?? safeCorrelationId(e.requestId);
    if (correlationId) payload.correlationId = correlationId;
  }
  return payload;
}

/**
 * Merkezî reporter'ın kendi fallback kanalı varsa oraya, yoksa kontrollü `console.error`'a
 * düşer — HER İKİSİ de SANITIZE EDİLMİŞ payload alır. Bu fonksiyon HİÇBİR koşulda hata
 * atmaz; sanitizer'ın kendisi arızalansa bile outcome DEĞİŞMEZ.
 */
function reportReporterFailure(phase: 'MUTATION' | 'REFRESH', reporterError: unknown): void {
  let payload: ReporterFailurePayload;
  try {
    payload = sanitizeReporterFailure(phase, reporterError);
  } catch {
    // Sanitizer arızalandı → ham veriye ASLA düşülmez, en dar şekil kullanılır.
    payload = { reason: REPORTER_FAILURE, phase, errorName: 'Unknown' };
  }

  try {
    const fallback = globalThis.__clientErrorFallback__;
    if (typeof fallback === 'function') {
      fallback(payload);
      return;
    }
  } catch {
    /* fallback kanalı da arızalı → kontrollü console'a düş */
  }
  try {
    // eslint-disable-next-line no-console
    console.error(REPORTER_FAILURE, payload);
  } catch {
    /* son çare kanalı da yoksa sessiz kal — akış BOZULMAZ */
  }
}

export type MutationOutcome<T> =
  | { status: 'SUCCESS'; data: T; stale: null }
  | { status: 'SUCCESS_STALE'; data: T; stale: string }
  | { status: 'FAILED'; error: ActionErrorContract };

export const REFRESH_STALE_NOTICE =
  'Kayıt YAPILDI, ancak liste yenilenemedi. Görünen liste güncel olmayabilir.';

/**
 * Mutation'ı çalıştırır, ardından ikincil tazelemeyi AYRI ele alır.
 *
 * - mutation hatası  → `FAILED`  (hiçbir başarı yan etkisi tetiklenmemeli)
 * - refresh hatası   → `SUCCESS_STALE` (kayıt durur; kullanıcı stale uyarısı görür)
 * - ikisi de tamam   → `SUCCESS`
 *
 * `onObserve` verilirse HER İKİ hata da oraya iletilir (merkezî gözlemlenebilirlik);
 * bileşen unmount olsa bile bu yol çalışır.
 */
export async function runMutation<T>({
  mutate,
  refresh,
  failureMessage,
  staleMessage = REFRESH_STALE_NOTICE,
  onObserve,
}: {
  mutate: () => Promise<T>;
  refresh?: () => Promise<unknown>;
  failureMessage: string;
  staleMessage?: string;
  onObserve?: (phase: 'MUTATION' | 'REFRESH', error: unknown) => void;
}): Promise<MutationOutcome<T>> {
  const observe = (phase: 'MUTATION' | 'REFRESH', error: unknown) => {
    if (!onObserve) return;
    try {
      onObserve(phase, error);
    } catch (reporterError) {
      // Reporter arızası kullanıcı işlem akışını BOZMAZ (outcome değişmez) fakat TAMAMEN
      // SESSİZ de kalmaz — gözlemlenebilirlik katmanının kendi arızası kararlı bir reason
      // code ile son çare kanalına düşer. Bu, PRIMARY handling'in YERİNE geçmez.
      reportReporterFailure(phase, reporterError);
    }
  };

  let data: T;
  try {
    data = await mutate();
  } catch (error) {
    observe('MUTATION', error);
    // refresh HİÇ çağrılmaz — mutation olmadıysa tazelenecek bir şey yoktur.
    return { status: 'FAILED', error: toActionError(error, failureMessage) };
  }

  if (!refresh) return { status: 'SUCCESS', data, stale: null };

  try {
    await refresh();
  } catch (error) {
    // Mutation BAŞARILI kaldı — geri çevrilmez. Yalnız görünüm bayatladı.
    // `data` sunucudan dönen kararlı kaydı taşır; stale durumunda SAKLANIR fakat
    // yerel sahte kayıt üretmek için KULLANILMAZ (tazeleme yine sunucudan yapılır).
    observe('REFRESH', error);
    return { status: 'SUCCESS_STALE', data, stale: staleMessage };
  }

  return { status: 'SUCCESS', data, stale: null };
}

/**
 * REFRESH-ONLY yeniden deneme — `SUCCESS_STALE` bandındaki "Listeyi yenile" düğmesi.
 *
 * Mutation callback'ini ASLA çağırmaz: kayıt zaten yapılmıştır, tekrar göndermek ÇİFT KAYIT
 * üretir. Yalnız okuma yolunu tekrar dener.
 *
 * @returns `true` → tazeleme başarılı (çağıran stale bandını TEMİZLER)
 *          `false` → hâlâ başarısız (band ve retry düğmesi KORUNUR)
 */
export async function runRefreshOnly(
  refresh: () => Promise<unknown>,
  onObserve?: (phase: 'REFRESH', error: unknown) => void,
): Promise<boolean> {
  try {
    await refresh();
    return true;
  } catch (error) {
    if (onObserve) {
      try {
        onObserve('REFRESH', error);
      } catch (reporterError) {
        reportReporterFailure('REFRESH', reporterError);
      }
    }
    return false;
  }
}
