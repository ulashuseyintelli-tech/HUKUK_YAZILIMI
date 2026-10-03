/**
 * Aşama masraf seti — İSTEK ANAHTARI (idempotency) saf kararları.
 *
 * Ölçülen kusur (main ef16f07f, gerçek HTTP + disposable PostgreSQL): POST /expense-requests/case/:caseId/stage/:stageCode
 * her çağrıda yeni talep + muhasebe günlüğü yazar; çift tıklama ya da ağ yeniden denemesi aynı tutarlı birden fazla talep
 * üretir (3 istek → 3 × 4.750 TL). Owner kararı (2026-10-03, madde 4): genel "ikinci talep yasağı" YOK (meşru ikinci haciz /
 * masraf yeni işlemdir); aynı kullanıcı işleminin tekrarı aynı anahtarı taşır ve tek talep döndürür.
 *
 * Kurallar:
 * - Anahtar istemciden gelir (gövde `idempotencyKey`), isteğe bağlıdır; kapsam (büro, anahtar).
 * - Aynı büro + anahtar + aynı içerik (caseId, stageCode) → MEVCUT talep, yeni yazım yok.
 * - Aynı anahtar farklı içerik → 409 IDEMPOTENCY_KEY_CONFLICT.
 * - İptal edilmiş talebin anahtarı yeniden kullanılmaz → 409 IDEMPOTENCY_KEY_CANCELLED (yeniden yapmak için yeni anahtar).
 * - Anahtarsız çağrılar bu korumanın DIŞINDADIR (bugünkü davranış); "mükerrer riski kapandı" DENMEZ.
 *
 * Bu yardımcı kayıt YAZMAZ, veritabanına DOKUNMAZ; yalnız doğrulama ve karar üretir.
 */
import { createHash } from 'crypto';

export const IDEMPOTENCY_KEY_INVALID = 'IDEMPOTENCY_KEY_INVALID' as const;
export const IDEMPOTENCY_KEY_CONFLICT = 'IDEMPOTENCY_KEY_CONFLICT' as const;
export const IDEMPOTENCY_KEY_CANCELLED = 'IDEMPOTENCY_KEY_CANCELLED' as const;
export const IDEMPOTENCY_KEY_UNSUPPORTED_FOR_OPENING = 'IDEMPOTENCY_KEY_UNSUPPORTED_FOR_OPENING' as const;

export const IDEMPOTENCY_KEY_MAX_LENGTH = 128;
/** Görünür ASCII: harf, rakam, `.` `_` `:` `-`. Boşluk ve kontrol karakteri yok (günlük / kilit anahtarı güvenliği). */
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9._:-]+$/;

export type StageExpenseIdempotencyKeyCheck =
  | { readonly ok: true; readonly key: string | null }
  | { readonly ok: false; readonly code: typeof IDEMPOTENCY_KEY_INVALID; readonly message: string };

/**
 * Gövdeden gelen ham değeri doğrular. Alan YOKSA (undefined / null) anahtarsız çağrıdır → `key: null`. Alan VARSA ama
 * geçersizse (boş, dize değil, çok uzun, izinsiz karakter) reddedilir: sessizce anahtarsız sayılmaz, çünkü istemci korunduğunu
 * sanır.
 *
 * <remarks>
 * Çağrıldığı yerler:
 * - ExpenseRequestService.createStageExpenseSet()
 * </remarks>
 */
export function checkStageExpenseIdempotencyKey(raw: unknown): StageExpenseIdempotencyKeyCheck {
  if (raw === undefined || raw === null) {
    return { ok: true, key: null };
  }
  if (typeof raw !== 'string') {
    return { ok: false, code: IDEMPOTENCY_KEY_INVALID, message: 'idempotencyKey metin olmalıdır' };
  }
  const key = raw.trim();
  if (key.length === 0) {
    return { ok: false, code: IDEMPOTENCY_KEY_INVALID, message: 'idempotencyKey boş olamaz' };
  }
  if (key.length > IDEMPOTENCY_KEY_MAX_LENGTH) {
    return {
      ok: false,
      code: IDEMPOTENCY_KEY_INVALID,
      message: `idempotencyKey en fazla ${IDEMPOTENCY_KEY_MAX_LENGTH} karakter olabilir`,
    };
  }
  if (!IDEMPOTENCY_KEY_PATTERN.test(key)) {
    return {
      ok: false,
      code: IDEMPOTENCY_KEY_INVALID,
      message: 'idempotencyKey yalnız harf, rakam ve . _ : - karakterlerini içerebilir',
    };
  }
  return { ok: true, key };
}

/**
 * Talebin İSTEK girdilerinin özeti. Hesaplanan tutarlar KATILMAZ: dosya durumu iki deneme arasında değişebilir ve aynı
 * kullanıcı işleminin tekrarı yine aynı işlemdir; yalnız "hangi dosya, hangi aşama" aynı olmalıdır.
 *
 * <remarks>
 * Çağrıldığı yerler:
 * - ExpenseRequestService.createStageExpenseSet()
 * </remarks>
 */
export function stageExpenseRequestFingerprint(input: { readonly caseId: string; readonly stageCode: string }): string {
  const canonical = JSON.stringify({ caseId: input.caseId, stageCode: input.stageCode });
  return createHash('sha256').update(canonical).digest('hex');
}

/** Anahtarla bulunan mevcut talebin, karar için gereken alanları. */
export interface StageExpenseIdempotencyExisting {
  readonly requestFingerprint: string | null;
  readonly status: string;
}

export type StageExpenseIdempotencyDecision =
  | { readonly outcome: 'REPLAY' }
  | { readonly outcome: 'CONFLICT'; readonly code: typeof IDEMPOTENCY_KEY_CONFLICT; readonly message: string }
  | { readonly outcome: 'CANCELLED'; readonly code: typeof IDEMPOTENCY_KEY_CANCELLED; readonly message: string };

/**
 * Aynı (büro, anahtar) ile kayıtlı talep bulunduğunda ne yapılacağı. Önce içerik karşılaştırılır (farklı içerik her zaman
 * çakışmadır), sonra iptal durumu bakılır.
 *
 * <remarks>
 * Çağrıldığı yerler:
 * - ExpenseRequestService.createStageExpenseSet() (kilit öncesi hızlı yol, kilit altı yeniden denetim ve P2002 sonrası)
 * </remarks>
 */
export function decideStageExpenseIdempotency(
  existing: StageExpenseIdempotencyExisting,
  requestFingerprint: string,
): StageExpenseIdempotencyDecision {
  if (existing.requestFingerprint !== requestFingerprint) {
    return {
      outcome: 'CONFLICT',
      code: IDEMPOTENCY_KEY_CONFLICT,
      message: 'Aynı idempotencyKey farklı içerikle (dosya / aşama) kullanıldı; yeni işlem için yeni anahtar kullanılmalıdır',
    };
  }
  if (existing.status === 'CANCELLED') {
    return {
      outcome: 'CANCELLED',
      code: IDEMPOTENCY_KEY_CANCELLED,
      message: 'Bu idempotencyKey ile oluşturulan talep iptal edildi; anahtar yeniden kullanılamaz, yeni işlem için yeni anahtar kullanılmalıdır',
    };
  }
  return { outcome: 'REPLAY' };
}
