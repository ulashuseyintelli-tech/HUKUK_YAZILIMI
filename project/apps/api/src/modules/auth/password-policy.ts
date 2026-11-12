/**
 * PERSONEL (büro kullanıcısı) parola politikası — tek tanım.
 *
 * Owner kararı 12.11.2026: asgari uzunluk 6 karakter. Önceden self-service değiştirme ve sıfırlama 12, kayıt ve davet
 * kabulü 8 karakter istiyordu.
 *
 * Uygulandığı yerler:
 * - kayıt (`RegisterDto`);
 * - davet kabulü (`AcceptInviteDto`);
 * - self-service değiştirme (`ChangePasswordDto`);
 * - sıfırlama (`ResetPasswordDto`).
 *
 * Web karşılığı `apps/web/src/lib/password-policy.ts`. İki değer eşit olmalıdır;
 * `__tests__/staff-password-min-length.spec.ts` denetler.
 *
 * Kural yalnız YENİ parola belirlenirken uygulanır. Giriş, mevcut parolaya politika uygulamaz; mevcut parolalar değişmez.
 * Müvekkil portalı kapsam DIŞIDIR: `PORTAL_PASSWORD_MIN_LENGTH` (D5-SEC-R02).
 */
export const STAFF_PASSWORD_MIN_LENGTH = 6;

/** Kayıt ve davet kabulü (ilk parola belirleme) mesajı. */
export const STAFF_PASSWORD_MIN_LENGTH_MESSAGE = `Parola en az ${STAFF_PASSWORD_MIN_LENGTH} karakter olmalıdır`;

/** Değiştirme ve sıfırlama (yeni parola) mesajı. */
export const STAFF_NEW_PASSWORD_MIN_LENGTH_MESSAGE = `Yeni parola en az ${STAFF_PASSWORD_MIN_LENGTH} karakter olmalıdır`;
