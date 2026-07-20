import { IsString, MinLength } from "class-validator";

/** OFFICE-AUTH-P01: self-service parola değiştirme. Mevcut parola doğrulanmadan işlenmez. */
export class ChangePasswordDto {
  @IsString()
  currentPassword: string;

  @IsString()
  @MinLength(12, { message: "Yeni parola en az 12 karakter olmalıdır" })
  newPassword: string;

  @IsString()
  newPasswordConfirmation: string;
}
