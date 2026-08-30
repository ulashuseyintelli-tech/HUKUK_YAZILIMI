import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";

import { SMOKE_ALLOWED_KEY } from "./smoke-allowed.decorator";
import {
  SMOKE_CLAIMS_REQUEST_KEY,
  SMOKE_DENIED_MESSAGE,
} from "./smoke-principal.constants";
import { SmokeTokenService } from "./smoke-token.service";

/**
 * C36 — GLOBAL DENY-BY-DEFAULT (APP_GUARD).
 *
 * ═══ NEDEN GLOBAL GUARD, INTERCEPTOR DEĞİL ═══
 *
 * C15-PR2'nin `TenantLifecycleInterceptor`'ı bilinçli olarak interceptor'dır: ORADA
 * `request.user` gerekiyordu ve global guard'lar controller-level `JwtAuthGuard`'DAN
 * ÖNCE çalıştığı için `request.user` henüz set edilmemiş olurdu.
 *
 * BURADA O KISIT YOKTUR: bu guard `request.user`'a HİÇ BAKMAZ; bearer token'ı
 * KENDİSİ çıkarır ve KENDİ secret'ıyla doğrular. Dolayısıyla mümkün olan EN ERKEN
 * noktada çalışabilir ve bu, fail-closed açısından kesinlikle daha güçlüdür:
 *
 *   global guard  →  controller/route guard  →  interceptor  →  PIPE  →  handler
 *   ^^^^^^^^^^^^
 *   burası
 *
 * Sonuçlar:
 *   · SMOKE reddi ValidationPipe'tan ÖNCE olur → "geçersiz body 400'ü" ile
 *     karışmaz; gövde hiç parse edilmeden reddedilir.
 *   · Controller'ın doğru guard kullanmasına HİÇ bağlı değildir; `@UseGuards`
 *     TAŞIMAYAN bir route bile smoke token'a kapalıdır.
 *   · Metadata'sız YENİ route otomatik olarak DENY tarafındadır (fail-closed).
 *
 * ═══ NORMAL TRAFİĞE ETKİSİ SIFIR ═══
 *
 * Token yoksa veya token smoke olarak doğrulanamıyorsa guard `true` döner ve
 * hiçbir şeyi değiştirmez. Smoke özelliği kapalıyken (secret yok) `tryVerify`
 * daima `null` döner → bu katman tamamen no-op'tur.
 */
@Injectable()
export class SmokeAuthorizationGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly smokeToken: SmokeTokenService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    // HTTP dışı bağlamlar (cron/microservice) smoke token taşımaz.
    if (context.getType() !== "http") return true;

    const request = context.switchToHttp().getRequest();
    const token = SmokeAuthorizationGuard.extractBearer(request);
    if (!token) return true;

    const claims = this.smokeToken.tryVerify(token);
    if (!claims) return true; // smoke token DEĞİL → normal yol dokunulmadan sürer

    // Buradan itibaren istek DOĞRULANMIŞ bir smoke token taşıyor.
    // Claim'ler ileri taşınır ki allowlisted handler'ın guard'ı token'ı yeniden parse etmesin.
    request[SMOKE_CLAIMS_REQUEST_KEY] = claims;

    const allowed = this.reflector.getAllAndOverride<boolean>(SMOKE_ALLOWED_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // `=== true` KASITLI: metadata yok (undefined), false, veya beklenmeyen bir değer
    // → hepsi DENY. Varsayılan izin YOKTUR.
    if (allowed !== true) {
      throw new ForbiddenException(SMOKE_DENIED_MESSAGE);
    }

    return true;
  }

  /** `Authorization: Bearer <token>` başlığından ham token'ı çıkarır. */
  private static extractBearer(request: unknown): string | null {
    const headers = (request as { headers?: Record<string, unknown> } | null)?.headers;
    if (!headers) return null;
    const raw = headers["authorization"] ?? headers["Authorization"];
    if (typeof raw !== "string") return null;
    if (!raw.startsWith("Bearer ")) return null;
    const token = raw.slice("Bearer ".length).trim();
    return token.length > 0 ? token : null;
  }
}
