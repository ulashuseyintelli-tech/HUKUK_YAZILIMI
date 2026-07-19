import { IsEmail, IsString, MinLength, IsOptional } from "class-validator";

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
