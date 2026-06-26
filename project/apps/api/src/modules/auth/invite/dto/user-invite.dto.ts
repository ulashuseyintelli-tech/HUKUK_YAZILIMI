import { IsEmail, IsString, MinLength, IsOptional, IsIn } from "class-validator";

/** Admin tarafından gerçek kişi için davet oluşturma. Parola İÇERMEZ (kullanıcı belirler). */
export class CreateInviteDto {
  @IsEmail()
  email: string;

  @IsString()
  name: string;

  @IsString()
  @IsOptional()
  surname?: string;

  // Login rolü: davetli kişinin sistemdeki rolü (varsayılan USER).
  @IsString()
  @IsOptional()
  @IsIn(["ADMIN", "USER", "VIEWER"])
  role?: "ADMIN" | "USER" | "VIEWER";
}

/** Public accept-invite: ham token + kullanıcının kendi belirlediği parola. */
export class AcceptInviteDto {
  @IsString()
  token: string;

  @IsString()
  @MinLength(8)
  password: string;
}
