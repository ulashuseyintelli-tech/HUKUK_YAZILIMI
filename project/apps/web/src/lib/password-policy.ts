/**
 * PERSONEL (büro kullanıcısı) parola politikası — web tarafı tek tanım.
 *
 * API karşılığı `apps/api/src/modules/auth/password-policy.ts` (`STAFF_PASSWORD_MIN_LENGTH`). İki değer eşit olmalıdır;
 * API testi `staff-password-min-length.spec.ts` bu dosyayı okuyarak denetler.
 * Owner kararı 12.11.2026: en az 6 karakter.
 *
 * Kullananlar: davet kabulü (`/auth/accept-invite`), sıfırlama (`/auth/reset-password`), self-service değiştirme
 * (`/settings/security`). Müvekkil portalı ekranları (`/portal/*`) kapsam DIŞIDIR (portal kuralı ayrı).
 */
export const STAFF_PASSWORD_MIN_LENGTH = 6;

/** Davet kabulü (ilk parola belirleme) mesajı. */
export const STAFF_PASSWORD_MIN_LENGTH_MESSAGE = `Parola en az ${STAFF_PASSWORD_MIN_LENGTH} karakter olmalıdır.`;

/** Değiştirme ve sıfırlama (yeni parola) mesajı. */
export const STAFF_NEW_PASSWORD_MIN_LENGTH_MESSAGE = `Yeni parola en az ${STAFF_PASSWORD_MIN_LENGTH} karakter olmalıdır.`;
