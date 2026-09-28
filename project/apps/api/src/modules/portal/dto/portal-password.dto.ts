import { IsNotEmpty, IsString, MinLength } from "class-validator";

/**
 * D5-SEC-R01 — portal parola SIFIRLAMA gövdesi için API tarafı doğrulama.
 *
 * Politika YENİ DEĞİLDİR: portal sıfırlama sayfası (`app/portal/reset-password/page.tsx`) en az 8 karakter ister; personel
 * (`auth.dto.ts`) ve davet (`user-invite.dto.ts`) aynı `@IsString() @MinLength(8)` kuralını API'de uygular. Önceden sıfırlama
 * gövdesi satır içi tip (`{ token; password }`) olduğu için global ValidationPipe metatype'ı `Object` görüp HİÇ doğrulamıyordu.
 *
 * KAPSAM DIŞI (owner kararı): portal PROFİL sayfası parola değiştirmede 6 karakter kabul eder; change-password'e burada
 * kural EKLENMEDİ (API'de 8 zorunlu kılmak mevcut sayfadaki 6–7 karakterlik değişiklikleri bozardı).
 */
export const PORTAL_PASSWORD_MIN_LENGTH = 8;

export class PortalResetPasswordDto {
  @IsString({ message: "Geçersiz veya süresi dolmuş token" })
  @IsNotEmpty({ message: "Geçersiz veya süresi dolmuş token" })
  token: string;

  @IsString({ message: `Şifre en az ${PORTAL_PASSWORD_MIN_LENGTH} karakter olmalıdır` })
  @MinLength(PORTAL_PASSWORD_MIN_LENGTH, { message: `Şifre en az ${PORTAL_PASSWORD_MIN_LENGTH} karakter olmalıdır` })
  password: string;
}
