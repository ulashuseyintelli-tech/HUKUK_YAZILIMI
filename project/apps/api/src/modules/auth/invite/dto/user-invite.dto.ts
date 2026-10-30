import { IsEmail, IsString, MinLength, IsOptional, IsIn } from "class-validator";

/** Admin tarafından gerçek kişi için davet oluşturma. Parola İÇERMEZ (kullanıcı belirler). */
export class CreateInviteDto {
  @IsEmail()
  email: string;

  // K-A1 (30.10.2026): ad / soyad artık KARTTAN türetilir; istemci beyanı yalnız geriye uyumluluk için kabul edilir ve YOK SAYILIR.
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  surname?: string;

  // Login rolü: davetli kişinin sistemdeki rolü (varsayılan USER).
  @IsString()
  @IsOptional()
  @IsIn(["ADMIN", "USER", "VIEWER"])
  role?: "ADMIN" | "USER" | "VIEWER";

  // OWN-01: davet belirli bir Lawyer/StaffMember kaydından açıldıysa, oluşan User bu profile
  // deterministik olarak bağlanır (Lawyer.userId/StaffMember.userId). Karşılıklı dışlayıcı.
  // K-A1 (owner ek talimatı 30.10.2026): TAM BİRİ ZORUNLU — kartsız davet 400 (servis katmanı; yan etki yok).
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
