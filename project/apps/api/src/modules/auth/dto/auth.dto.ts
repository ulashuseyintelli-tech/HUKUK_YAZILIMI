import { IsEmail, IsString, MinLength, IsOptional, IsIn, Matches, ValidateIf } from "class-validator";
import { StaffType } from "@prisma/client";

/** K-A1 a′ (owner kararı 2026-10-29/30): ilk hesap bir KİŞİ KARTINA bağlı doğar — avukat ise Lawyer, değilse StaffMember. */
export const REGISTER_PERSON_TYPES = ["LAWYER", "STAFF"] as const;
export type RegisterPersonType = (typeof REGISTER_PERSON_TYPES)[number];

export class RegisterDto {
  @IsString()
  firmName: string;

  @IsString()
  name: string;

  @IsString()
  @IsOptional()
  surname?: string;

  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  password: string;

  /**
   * K-A1 a′: "avukat / avukat değil" seçimi ZORUNLU. ADMIN rolü kişi ya da avukatlık kanıtı DEĞİLDİR; kanıt karttır.
   * Avukat olmayan kişiye avukat kartı AÇILMAZ (STAFF → StaffMember).
   */
  @IsIn(REGISTER_PERSON_TYPES)
  personType: RegisterPersonType;

  /** K-A1 a′: kişi kimliği (TC Kimlik No) ZORUNLU; mod-10/11 doğrulaması servis sınırında (isValidTckn). */
  @IsString()
  @Matches(/^\d{11}$/, { message: "tckn 11 haneli sayı olmalıdır" })
  tckn: string;

  /** STAFF için zorunlu personel türü (StaffType). LAWYER için verilmez. */
  @ValidateIf((o: RegisterDto) => o.personType === "STAFF")
  @IsIn(Object.values(StaffType))
  staffType?: StaffType;
}

export class LoginDto {
  @IsEmail()
  email: string;

  @IsString()
  password: string;

  // AUTH-01: tenant-aware login zorunlu girdisi. Global (tenant-scope'suz) email
  // çözümlemesi kaldırıldı — aynı e-posta farklı tenant'larda var olabilir (@@unique([tenantId,email])).
  @IsString()
  tenantSlug: string;
}

export class FindTenantsForEmailDto {
  @IsEmail()
  email: string;
}
