import { IsNotEmpty, IsString, MinLength } from "class-validator";

/**
 * D5-SEC-R01 — portal parola SIFIRLAMA gövdesi için API tarafı doğrulama.
 *
 * Politika YENİ DEĞİLDİR: portal sıfırlama sayfası (`app/portal/reset-password/page.tsx`) en az 8 karakter ister; personel
 * (`auth.dto.ts`) ve davet (`user-invite.dto.ts`) aynı `@IsString() @MinLength(8)` kuralını API'de uygular. Önceden sıfırlama
 * gövdesi satır içi tip (`{ token; password }`) olduğu için global ValidationPipe metatype'ı `Object` görüp HİÇ doğrulamıyordu.
 *
 * D5-SEC-R02 (owner kararı 2026-09-28): portal PROFİL parola değiştirme de aynı kurala geçer (web profil sayfası 8'e
 * çekildi; API `PortalChangePasswordDto` ile uygular). Kural yalnız YENİ parola belirlenirken uygulanır; mevcut parolalarla
 * giriş etkilenmez, zorunlu değişiklik YOKTUR.
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

export class PortalChangePasswordDto {
  @IsString({ message: "Mevcut şifre gerekli" })
  @IsNotEmpty({ message: "Mevcut şifre gerekli" })
  oldPassword: string;

  @IsString({ message: `Yeni şifre en az ${PORTAL_PASSWORD_MIN_LENGTH} karakter olmalıdır` })
  @MinLength(PORTAL_PASSWORD_MIN_LENGTH, { message: `Yeni şifre en az ${PORTAL_PASSWORD_MIN_LENGTH} karakter olmalıdır` })
  newPassword: string;
}
