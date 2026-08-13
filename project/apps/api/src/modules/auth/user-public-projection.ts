/**
 * OFFICE-P5-SECURITY-COMPLETION-R01 / F-B01-01 — /auth/me public response boundary.
 *
 * BULGU (P5-B01 evidence, doğrulanmış): GET /api/auth/me tam Prisma User satırını
 * döndürüyordu — passwordHash (bcrypt) ve tokenVersion (session-revocation sayacı) dahil.
 * Zincir: JwtStrategy.validate → AuthService.validateUser (select'siz findUnique) →
 * argümansız @CurrentUser() → `{ user }`. Global serializer/@Exclude yok; sanitizeUser
 * private'tır ve bu yolda çağrılmıyordu.
 *
 * KAPSAM SABİT (owner-ratified PHASE B): yalnız aşağıdaki İKİ alan ve YALNIZ /auth/me.
 * login/register yanıtlarının bugünkü şekli BİLEREK değiştirilmez (bounded patch);
 * passwordChangedAt gibi diğer alanlar owner kapsamında olmadığı için dokunulmaz.
 *
 * Mekanizma lawyer-public-projection emsalidir: alan SİLİNİR (anahtar tamamen YOK),
 * null'a çekilmez — null da bir sözleşmedir ve "bu alan var" bilgisini sızdırır.
 * Dönüş tipi Omit<> olduğu için derleyici de alanı okumaya çalışan kodu reddeder.
 */

/** /auth/me yanıtında ASLA bulunmayacak User credential-material alanları. */
export const AUTH_ME_CREDENTIAL_FIELDS = ["passwordHash", "tokenVersion"] as const;

export type AuthMeCredentialField = (typeof AUTH_ME_CREDENTIAL_FIELDS)[number];

/** /auth/me public user tipi: credential-material alanlar TİP düzeyinde de yoktur. */
export type PublicAuthMeUser<T> = Omit<T, AuthMeCredentialField>;

/**
 * Tek User satırını /auth/me public yanıtına çevirir. Credential-material anahtarlar
 * TAMAMEN kaldırılır (`null`'a çekilmez). Nested `tenant` dahil diğer tüm alanlar
 * olduğu gibi korunur. Idempotenttir: alanlar zaten yoksa girdi anlamsal olarak değişmez.
 */
export function toPublicAuthMeUser<T extends object>(row: T): PublicAuthMeUser<T> {
  const clone: Record<string, unknown> = { ...(row as Record<string, unknown>) };
  for (const field of AUTH_ME_CREDENTIAL_FIELDS) {
    delete clone[field];
  }
  return clone as PublicAuthMeUser<T>;
}
