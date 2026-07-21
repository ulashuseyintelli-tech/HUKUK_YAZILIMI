import { IsString, MinLength } from "class-validator";

/** OFFICE-AUTH-P02: parola sıfırlama. Politika ChangePasswordDto ile tutarlı (min 12 karakter). */
export class ResetPasswordDto {
  @IsString()
  token: string;

  @IsString()
  @MinLength(12, { message: "Yeni parola en az 12 karakter olmalıdır" })
  password: string;

  @IsString()
  passwordConfirmation: string;
}
