import { Prisma } from '@prisma/client';

/**
 * Otomasyon olay tüketimi — (büro, tebligat olayı, kural / eylem) başına TEK sonuç (owner kararı 11, 2026-10-05).
 *
 * Ölçülen kusur (main 6681b1d5 / fdc1f23ba): süresi dolmuş aynı ödeme emri tebligatı, dosya her işlendiğinde `NOTIFICATION_EXPIRED`
 * kuralını yeniden tetikliyordu (kural aşamaya da tebligatın tüketilip tüketilmediğine de bakmıyordu): iki işlemede 2 karar kaydı, 2 aşama
 * değişikliği kaydı, 2 × 252 TL yeniden tebligat masraf talebi, sayaç 2. Eşzamanlı çağrılarda da aynı sonuç.
 *
 * Kural: işaret TEBLİGATIN KENDİSİNDE (NotificationQueue.metadata.automationConsumed.<EYLEM>) tutulur ve EYLEM başınadır — bir
 * tebligatın FARKLI kural / eylemleri birbirini engellemez; tebligatı toptan "tüketildi" yapmak (ör. durumunu EXPIRED'a çekmek) meşru
 * farklı eylemleri de engellerdi ve owner tarafından yasaklandı. Yeni tablo / migration YOKTUR.
 *
 * ATOMİKLİK: işaret tek bir koşullu UPDATE ile yazılır (satır kilidi). Eşzamanlı iki işleme aynı satıra yazmaya çalışırsa ikincisi
 * birincinin tamamlanmasını bekler, koşulu yeniden değerlendirir ve 0 satır günceller (kaybeder). İşaret, olayın yan etkileriyle (karar
 * kaydı, aşama değişikliği, sayaç) AYNI transaction'dadır: süreç yan etkiler yazılmadan ölürse işaret de geri alınır; yeniden
 * başlayınca olay tekrar işlenir. Para yan etkisi (masraf seti) ayrıca veritabanı benzersiz anahtarıyla (büro + istek anahtarı)
 * korunur ve işaretten ÖNCE yazılır; işaret yazıldıysa masraf seti zaten vardır.
 */

/** İşaretlerin tutulduğu NotificationQueue.metadata alt anahtarı. */
export const AUTOMATION_CONSUMED_KEY = 'automationConsumed' as const;

/** Masraf seti istek anahtarı: aynı olay + eylem için sabit (≤ 128 karakter, izinli karakter kümesi). */
export function eventIdempotencyKey(action: string, notificationId: string): string {
  return `automation:${action}:${notificationId}`;
}

/** Bu eylem için olay tüketilmiş mi? (yalnız okuma; kesin karar `claimNotificationEvent`'tedir.) */
export function isEventConsumed(metadata: unknown, action: string): boolean {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return false;
  const consumed = (metadata as Record<string, unknown>)[AUTOMATION_CONSUMED_KEY];
  if (!consumed || typeof consumed !== 'object' || Array.isArray(consumed)) return false;
  return Object.prototype.hasOwnProperty.call(consumed, action);
}

/**
 * (büro, tebligat, eylem) olayını ATOMİK olarak sahiplenir. `true` = bu çağrı sahiplendi (yan etkileri yazmalı); `false` = olay bu
 * eylem için zaten tüketilmiş (ya da tebligat bu büro / dosyaya ait değil) → yan etki YAZILMAZ.
 *
 * Çağıran bu fonksiyonu yan etkileriyle AYNI transaction'da çağırmalıdır (işaret ile yan etki arasında yarım kalma boşluğu olmasın).
 *
 * <remarks>
 * Çağrıldığı yerler:
 * - WorkflowEngine.executeEventRule() → POST /automation/cases/:id/process, 5 dakikalık otomasyon döngüsü, saatlik tebligat denetimi
 * </remarks>
 */
export async function claimNotificationEvent(
  tx: Prisma.TransactionClient,
  params: { tenantId: string; caseId: string; notificationId: string; action: string; now?: Date },
): Promise<boolean> {
  const stamp = (params.now ?? new Date()).toISOString();
  const affected = await tx.$executeRaw`
    UPDATE "NotificationQueue" AS nq
    SET "metadata" = (CASE WHEN jsonb_typeof(nq."metadata") = 'object' THEN nq."metadata" ELSE '{}'::jsonb END)
          || jsonb_build_object(
               ${AUTOMATION_CONSUMED_KEY}::text,
               (CASE WHEN jsonb_typeof(nq."metadata"->${AUTOMATION_CONSUMED_KEY}::text) = 'object'
                     THEN nq."metadata"->${AUTOMATION_CONSUMED_KEY}::text ELSE '{}'::jsonb END)
                 || jsonb_build_object(${params.action}::text, ${stamp}::text)
             ),
        "updatedAt" = NOW()
    WHERE nq."id" = ${params.notificationId}
      AND nq."caseId" = ${params.caseId}
      AND EXISTS (SELECT 1 FROM "Case" AS c WHERE c."id" = nq."caseId" AND c."tenantId" = ${params.tenantId})
      AND NOT jsonb_exists(
            (CASE WHEN jsonb_typeof(nq."metadata"->${AUTOMATION_CONSUMED_KEY}::text) = 'object'
                  THEN nq."metadata"->${AUTOMATION_CONSUMED_KEY}::text ELSE '{}'::jsonb END),
            ${params.action}::text)
  `;
  return affected === 1;
}
