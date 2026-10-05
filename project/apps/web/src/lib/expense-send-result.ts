/**
 * Masraf talebi penceresi — gönderim denemesinin sonucu (POST /expense-requests/:id/send-email yanıtı → pencere durumu).
 *
 * Karar ve metin SUNUCUDANDIR (mevcut sonuç sözleşmesi: `status` + `reasonCode` + `message` + `requiredInfo`; başarıda
 * `status: EMAIL_ACCEPTED` + `deliveryConfirmed: false`). İstemci neden / gerekli bilgi üretmez, kural seçmez; yalnız yanıtı üç
 * duruma indirger:
 * - `accepted`: e-posta gönderim sunucusu kabul etti (alıcıya teslim DOĞRULANMAZ).
 * - `not-sent`: kesin başarısızlık; çoğunlukla aynı talep üzerinden yeniden denenebilir (`retryable`); talebin kalemleri e-posta
 *   için geçersizse (ör. kalem satırı yok / tutar <= 0) yeniden deneme sonuç değiştirmez → `retryable:false`.
 * - `uncertain`: sonuç belirsiz (gönderilmiş olabilir); BAŞARI sayılmaz, mükerrer e-posta riski yüzünden yeniden denenmez.
 * Yanıt alınamadıysa (ağ / sunucu hatası) `error`: sonuç bilinmiyor, aynı talep üzerinden yeniden denenebilir (sunucu tarafı
 * aynı talep için ikinci e-posta göndermez).
 */

export type ExpenseSendUiState =
  | { readonly kind: 'accepted'; readonly message: string }
  | { readonly kind: 'not-sent'; readonly message: string; readonly requiredInfo: readonly string[]; readonly retryable: boolean }
  | { readonly kind: 'uncertain'; readonly message: string; readonly requiredInfo: readonly string[]; readonly retryable: false }
  | { readonly kind: 'error'; readonly message: string; readonly requiredInfo: readonly string[]; readonly retryable: true };

const ACCEPTED_FALLBACK = 'E-posta gönderim sunucusu tarafından kabul edildi. Alıcıya teslim edildiği doğrulanmaz.';
const UNCERTAIN_FALLBACK = 'Masraf e-postasının gönderilip gönderilmediği doğrulanamadı. Başarılı sayılmadı.';

const asStringList = (value: unknown): readonly string[] =>
  Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string' && v.trim().length > 0) : [];

/**
 * <remarks>
 * Çağrıldığı yerler:
 * - ExpenseRequestModal.handleSubmit() (gönderim ve yeniden deneme)
 * </remarks>
 */
export function interpretExpenseSendResponse(response: unknown): ExpenseSendUiState {
  const r = (response && typeof response === 'object' ? response : {}) as Record<string, unknown>;
  const message = typeof r.message === 'string' && r.message.trim() ? r.message : null;
  const requiredInfo = asStringList(r.requiredInfo);

  if (r.success === true) {
    return { kind: 'accepted', message: message ?? ACCEPTED_FALLBACK };
  }
  // Yapılandırılmış neden yoksa (eski / beklenmeyen yanıt) sonucu tahmin etme: belirsiz say, başarı sayma, yeniden gönderme.
  if (typeof r.reasonCode !== 'string' || r.retryable === undefined) {
    return { kind: 'uncertain', message: message ?? UNCERTAIN_FALLBACK, requiredInfo, retryable: false };
  }
  if (r.retryable === false) {
    // Belirsiz sonuç (gönderilmiş olabilir) ile kesin ama düzeltilemeyen başarısızlık ayrılır: ikincisi "belirsiz" DİYE gösterilmez.
    if (r.reasonCode === 'DELIVERY_UNCERTAIN' || r.reasonCode === 'DELIVERY_NOT_CONFIRMED') {
      return { kind: 'uncertain', message: message ?? UNCERTAIN_FALLBACK, requiredInfo, retryable: false };
    }
    return { kind: 'not-sent', message: message ?? 'Masraf e-postası gönderilemedi.', requiredInfo, retryable: false };
  }
  return { kind: 'not-sent', message: message ?? 'Masraf e-postası gönderilemedi.', requiredInfo, retryable: true };
}

/**
 * Yanıt hiç alınamadığında (ağ / sunucu hatası, zaman aşımı) durum. Sonuç BİLİNMİYOR: başarı sayılmaz.
 *
 * <remarks>
 * Çağrıldığı yerler:
 * - ExpenseRequestModal.handleSubmit() (gönderim isteği hata verdiğinde)
 * </remarks>
 */
export function expenseSendRequestFailed(error: unknown): ExpenseSendUiState {
  const detail = error instanceof Error && error.message ? ` (${error.message})` : '';
  return {
    kind: 'error',
    message: `Gönderim sonucu alınamadı${detail}. Talep oluşturuldu; e-postanın gönderilip gönderilmediği bilinmiyor.`,
    requiredInfo: [],
    retryable: true,
  };
}
