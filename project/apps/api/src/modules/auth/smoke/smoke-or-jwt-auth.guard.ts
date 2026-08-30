import { ExecutionContext, Injectable } from "@nestjs/common";

import { JwtAuthGuard } from "../guards/jwt-auth.guard";
import { SmokeAuthService } from "./smoke-auth.service";
import { SMOKE_CLAIMS_REQUEST_KEY, SmokeTokenClaims } from "./smoke-principal.constants";

/**
 * C36 — `/auth/me` için smoke-farkında kimlik guard'ı.
 *
 * NORMAL YOL BİREBİR KORUNUR: smoke claim'i yoksa `JwtAuthGuard`'a AYNEN devredilir.
 * Yani normal kullanıcıların davranışı, hata mesajları ve `tokenVersion`/lifecycle
 * kontrolleri DEĞİŞMEZ.
 *
 * SMOKE YOLU: claim'ler `SmokeAuthorizationGuard` (APP_GUARD) tarafından ZATEN
 * imza/audience/issuer bakımından doğrulanmış ve route allowlist'ten geçmiştir.
 * Burada ek olarak DB durumu (status/revoke/expiry/generation/isActive) HER İSTEKTE
 * yeniden doğrulanır — geçerli imza tek başına yetmez.
 *
 * NEDEN `/auth/me` NORMAL `JwtAuthGuard` İLE ÇALIŞAMAZ: `JwtStrategy.validate()`
 * → `AuthService.validateUser()` → `!user.isActive` → 401. Smoke principal kalıcı
 * olarak pasif olduğu için normal yol onu (doğru biçimde) reddeder.
 */
@Injectable()
export class SmokeOrJwtAuthGuard extends JwtAuthGuard {
  constructor(private readonly smokeAuth: SmokeAuthService) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const claims = request?.[SMOKE_CLAIMS_REQUEST_KEY] as SmokeTokenClaims | undefined;

    if (!claims) {
      // Smoke DEĞİL → normal passport akışı, davranış değişmeden.
      return (await super.canActivate(context)) as boolean;
    }

    // Smoke yolu: DB durumu her istekte yeniden doğrulanır.
    request.user = await this.smokeAuth.resolveActiveSmokeUser(claims, new Date());
    return true;
  }
}
