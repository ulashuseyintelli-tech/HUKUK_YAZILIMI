import { IsString, MinLength } from "class-validator";
import { STAFF_NEW_PASSWORD_MIN_LENGTH_MESSAGE, STAFF_PASSWORD_MIN_LENGTH } from "../../password-policy";

/** OFFICE-AUTH-P02: parola sıfırlama. Uzunluk: personel parola politikası (ChangePasswordDto ile aynı tanım). */
export class ResetPasswordDto {
  @IsString()
  token: string;

  @IsString()
  @MinLength(STAFF_PASSWORD_MIN_LENGTH, { message: STAFF_NEW_PASSWORD_MIN_LENGTH_MESSAGE })
  password: string;

  @IsString()
  passwordConfirmation: string;
}
