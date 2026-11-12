import { IsString, MinLength } from "class-validator";
import { STAFF_NEW_PASSWORD_MIN_LENGTH_MESSAGE, STAFF_PASSWORD_MIN_LENGTH } from "../../auth/password-policy";

/** OFFICE-AUTH-P01: self-service parola değiştirme. Mevcut parola doğrulanmadan işlenmez. Uzunluk: personel parola politikası. */
export class ChangePasswordDto {
  @IsString()
  currentPassword: string;

  @IsString()
  @MinLength(STAFF_PASSWORD_MIN_LENGTH, { message: STAFF_NEW_PASSWORD_MIN_LENGTH_MESSAGE })
  newPassword: string;

  @IsString()
  newPasswordConfirmation: string;
}
