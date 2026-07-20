import { IsEmail, IsString } from "class-validator";

/** OFFICE-AUTH-P02: şifremi unuttum isteği. tenantSlug zorunlu — User @@unique([tenantId,email]). */
export class ForgotPasswordDto {
  @IsEmail()
  email: string;

  @IsString()
  tenantSlug: string;
}
