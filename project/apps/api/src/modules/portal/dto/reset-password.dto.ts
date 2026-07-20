import { IsString, Matches, MinLength } from "class-validator";

export class ResetPasswordDto {
  // generateRawResetToken(): crypto.randomBytes(32).toString("hex") → tam 64 hex karakter.
  @IsString()
  @Matches(/^[0-9a-f]{64}$/, { message: "Geçersiz token biçimi" })
  token: string;

  @IsString()
  @MinLength(8)
  newPassword: string;
}
