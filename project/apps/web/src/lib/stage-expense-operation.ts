// Aşama masraf seti — KULLANICI İŞLEMİ başına TEK istek anahtarı (owner 2026-10-03, madde 4).
//
// Kural: anahtar işlem BAŞLADIĞINDA bir kez üretilir; çift tıklama / yeniden deneme / ağ hatası sonrası tekrar AYNI anahtarı
// gönderir (sunucu tek talep döndürür). Meşru YENİ işlem (ör. ikinci haciz masrafı) yeni bir işlem başlatır ve YENİ anahtar
// alır. Anahtarı her çağrıda yeniden üretmek korumayı SIFIRLAR: bu yüzden çağıranlar `api.createStageExpenses`'i doğrudan
// değil, bu işlem nesnesi üzerinden kullanır.
//
// Anahtarsız çağrılar (ve sunucudaki aşama değişimi iş akışı yolu) mükerrer korumasının DIŞINDADIR; bu yardımcı yalnız
// anahtar gönderen istemcilere koruma sağlar.
import { api } from './api';
import { createIdempotencyKey } from './idempotency-key';

export interface StageExpenseOperation {
  /** İşlemin anahtarı; işlem ömrü boyunca değişmez. */
  readonly idempotencyKey: string;
  /** İsteği gönderir; tekrar çağrılırsa AYNI anahtarı gönderir. */
  submit(): Promise<unknown>;
}

/**
 * Yeni bir kullanıcı işlemi başlatır (yeni anahtar). Yalnız "Aşama masraf seti oluştur" eylemine basıldığında çağrılır;
 * düğmeye tekrar basma ya da yeniden deneme AYNI işlem nesnesinin `submit()`'ini çağırır.
 *
 * <remarks>
 * Çağrıldığı yerler:
 * - (henüz çağıran bileşen yok: web'de `createStageExpenses`'i kullanan ekran bulunmuyor; yeni ekran bu yardımcıyı kullanmalı)
 * </remarks>
 */
export function startStageExpenseOperation(caseId: string, stageCode: string): StageExpenseOperation {
  const idempotencyKey = createIdempotencyKey('stage-expense');
  return {
    idempotencyKey,
    submit: () => api.createStageExpenses(caseId, stageCode, idempotencyKey),
  };
}
