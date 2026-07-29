/**
 * OFFICE-CREDENTIAL-FIELD-RESPONSE-CONTAINMENT-P01 — Lawyer public response boundary.
 *
 * BULGU (doğrulanmış): `Lawyer` satırının credential alanları (`uyapToken`,
 * `eSignatureSerial`) public API yanıtlarına çıkıyordu. Kök neden bir yetki hatası
 * DEĞİL, örtük DTO'dur: servis metotları Prisma satırını `select` olmadan okuyup
 * doğrudan döndürüyor, global bir serializer/`@Exclude` da yok. Sonuç: tenant
 * içindeki HERHANGİ bir kimliği doğrulanmış kullanıcı `GET /lawyers/:id` ile
 * (ve `GET /office` içinde nested olarak) UYAP oturum kimlik bilgisini okuyabiliyordu.
 *
 * İLKE: persistence modeli ≠ public API response modeli. Bu modül o sınırı tek bir
 * yerde tanımlar; her Lawyer döndüren yüzey buradan geçer.
 *
 * NEDEN BLACKLIST DEĞİL DE PROJECTION: alan SİLİNİR (anahtar tamamen YOK), `null`'a
 * çekilmez — `null` da bir sözleşmedir ve "bu alan var" bilgisini sızdırır. Dönüş tipi
 * `Omit<...>` olduğu için derleyici de alanı okumaya çalışan kodu REDDEDER; koruma
 * hem çalışma zamanında hem tip düzeyindedir.
 *
 * NEDEN PRISMA `omit` DEĞİL: bu repo Prisma 5.22 kullanıyor; client-level `omit`
 * orada `omitApi` preview flag'i (schema değişikliği + repo genelinde yeniden
 * generate) gerektirir. Bu görev bounded response-containment'tır; schema/preview
 * yüzeyine dokunmaz.
 *
 * KAPSAM SABİT: yalnız aşağıdaki iki alan. Yeni alan eklemek kanıt gerektirir
 * (owner §5) — bu liste bilinçli olarak dar ve testle sabitlenmiştir.
 */

/** Public yanıtta ASLA bulunmayacak Lawyer credential alanları. */
export const LAWYER_CREDENTIAL_FIELDS = ['uyapToken', 'eSignatureSerial'] as const;

export type LawyerCredentialField = (typeof LAWYER_CREDENTIAL_FIELDS)[number];

/** Public Lawyer response tipi: credential alanları TİP düzeyinde de yoktur. */
export type PublicLawyer<T> = Omit<T, LawyerCredentialField>;

/**
 * Tek Lawyer satırını public response'a çevirir. Credential anahtarları TAMAMEN
 * kaldırılır (`null`'a çekilmez). Diğer tüm alanlar — `displayName`, maskelenmiş
 * alanlar, nested ilişkiler — olduğu gibi korunur.
 *
 * Idempotenttir: alanlar zaten yoksa girdi anlamsal olarak değişmez.
 */
export function toPublicLawyer<T extends object>(row: T): PublicLawyer<T> {
  const clone: Record<string, unknown> = { ...(row as Record<string, unknown>) };
  for (const field of LAWYER_CREDENTIAL_FIELDS) {
    delete clone[field];
  }
  return clone as PublicLawyer<T>;
}

/** Liste yüzeyleri için; boş dizide boş dizi döner. */
export function toPublicLawyers<T extends object>(rows: readonly T[]): PublicLawyer<T>[] {
  return rows.map((r) => toPublicLawyer(r));
}

/**
 * Nested `lawyers` taşıyan bir kapsayıcıyı (ör. `Office`) public response'a çevirir.
 * Yalnız `lawyers` dizisi projekte edilir; kapsayıcının diğer alanları DEĞİŞMEZ.
 */
export function withPublicLawyers<L extends object, T extends { lawyers: L[] }>(
  container: T,
): Omit<T, 'lawyers'> & { lawyers: PublicLawyer<L>[] } {
  return { ...container, lawyers: toPublicLawyers(container.lawyers) };
}
