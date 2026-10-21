// OK-02 (owner kararı Ek 108, 22.10.2026): anonim büro kaydı ucu varsayılan KAPALI.
// `POST /auth/register` yalnız `OFFICE_PUBLIC_REGISTRATION_ENABLED=true` iken çalışır; aksi halde
// istek bu kapıda (ValidationPipe'tan, servis çağrısından ve her türlü veri erişiminden ÖNCE)
// 403 ile reddedilir. Yeni büro yalnız iç kurulum yoluyla açılır.
// Bayrak açıkken davranış DEĞİŞMEZ (AuthService.register aynen çalışır).
// Desen: PasswordResetService.isPasswordRecoveryEnabled / UserInviteService.enabled
// (yalnız tam "true" — harf duyarsız — açık sayılır; boş / eksik / başka değer = kapalı).
//
// Çağrıldığı yer: AuthController.register() -> POST /auth/register
import { CanActivate, ForbiddenException, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

export const OFFICE_PUBLIC_REGISTRATION_FLAG = "OFFICE_PUBLIC_REGISTRATION_ENABLED";

export function isOfficePublicRegistrationEnabled(config: Pick<ConfigService, "get">): boolean {
  return String(config.get(OFFICE_PUBLIC_REGISTRATION_FLAG) ?? "").toLowerCase() === "true";
}

@Injectable()
export class PublicRegistrationEnabledGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(): boolean {
    if (!isOfficePublicRegistrationEnabled(this.config)) {
      throw new ForbiddenException("Kayıt devre dışı");
    }
    return true;
  }
}
