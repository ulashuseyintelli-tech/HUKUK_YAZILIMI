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

  // OWN-01: davet belirli bir Lawyer/StaffMember kaydından açıldıysa, oluşan User bu profile
  // deterministik olarak bağlanır (Lawyer.userId/StaffMember.userId). Karşılıklı dışlayıcı;
  // ikisi de verilmezse davranış eskisi gibi (bağımsız/profilsiz davet).
  @IsString()
  @IsOptional()
  lawyerId?: string;

  @IsString()
  @IsOptional()
  staffMemberId?: string;
}

/** Public accept-invite: ham token + kullanıcının kendi belirlediği parola. */
export class AcceptInviteDto {
  @IsString()
  token: string;

  @IsString()
  @MinLength(8)
  password: string;
}
