/**
 * Seçimlik kalem bazlı borçlu sorumluluğu — seçim yazma bayrağı.
 *
 * Bayrak YALNIZ yeni seçim oluşturmayı (önizleme / talep / onay yürütmesi) açar ya da kapatır. Mevcut seçimler, okuma,
 * sorumluluk sınırları ve mahsup bayraktan BAĞIMSIZ çalışır; bayrağın kapanması hiçbir seçimi ya da mali kaydı
 * etkisizleştirmez. Varsayılan: KAPALI (ortam değişkeni tanımlı değilse ya da "true" değilse).
 */
export function isClaimLiabilitySelectionEnabled(): boolean {
  return process.env.CLAIM_LIABILITY_SELECTION_ENABLED?.toLowerCase() === 'true';
}
