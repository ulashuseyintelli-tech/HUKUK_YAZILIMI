// PR-1 — Avukat IBAN sözleşme uyumu (frontend tarafı).
//
// BACKEND SÖZLEŞMESİ (değiştirilmez — apps/api/.../lawyer.service.ts, CANDIDATE-H1 RATIFIED):
//   if (data.iban !== undefined) {
//     if (typeof iban !== "string" || iban.trim() === "" || iban.includes("*"))
//       throw 400 INVALID_IBAN_UPDATE
//   }
// Yani `iban` ya HİÇ gönderilmeli (mevcut değer Prisma undefined-skip ile korunur),
// ya da geçerli TAM değer olarak gönderilmeli. Maskeli read-model değerinin round-trip ile
// gerçek IBAN'ı ezmesi bilinçli olarak engellenmiştir.
//
// SORUN: form state'i `iban: lawyer?.iban || ""` üretiyordu; IBAN'ı olmayan avukatta boş string
// gönderiliyor, backend 400 atıyor, arayüz hatayı yutuyordu → IBAN'sız hiçbir avukat
// düzenlenemiyordu (onay yetkisi bayrağı dahil hiçbir alan kaydedilemiyordu).
//
// ÇÖZÜM: gönderim öncesi payload'ı sözleşmeye uydur. Backend'e DOKUNULMAZ.

/** IBAN normalizasyonu: boşlukları at, büyük harfe çevir. */
export function normalizeIban(raw: string): string {
  return raw.replace(/\s+/g, "").toUpperCase();
}

/**
 * `iban` alanını backend sözleşmesine uygun hale getirir.
 *
 * - alan yoksa            → payload aynen döner
 * - boş / yalnız boşluk   → alan payload'dan TAMAMEN ÇIKARILIR (mevcut değer korunur)
 * - maskeli ('*' içeren)  → alan ÇIKARILIR (maskeli değer gerçek IBAN'ı ezemez)
 * - string değilse        → alan ÇIKARILIR (null/undefined/sayı round-trip'i)
 * - dolu ve geçerli       → normalize edilip GÖNDERİLİR
 *
 * Not: burada IBAN'ın biçimsel doğruluğu (uzunluk/checksum) DOĞRULANMAZ; bu backend'in ve
 * ayrı bir doğrulama katmanının işidir. Buradaki tek sorumluluk, sözleşmeye aykırı
 * "boş/maskeli" değerlerin gönderilmemesidir.
 */
export function sanitizeLawyerIbanPayload<T extends Record<string, unknown>>(
  data: T,
): Omit<T, "iban"> & { iban?: string } {
  if (!data || !("iban" in data)) {
    return data as Omit<T, "iban"> & { iban?: string };
  }

  const { iban, ...rest } = data as Record<string, unknown>;

  if (typeof iban !== "string") {
    return rest as Omit<T, "iban"> & { iban?: string };
  }

  const trimmed = iban.trim();
  if (trimmed === "" || trimmed.includes("*")) {
    return rest as Omit<T, "iban"> & { iban?: string };
  }

  return { ...(rest as Record<string, unknown>), iban: normalizeIban(trimmed) } as Omit<T, "iban"> & {
    iban?: string;
  };
}
