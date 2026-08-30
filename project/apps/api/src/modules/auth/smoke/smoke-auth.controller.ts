import {
  Body,
  Controller,
  ForbiddenException,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";

import { LoginRateLimitGuard } from "../guards/login-rate-limit.guard";
import { SmokeAllowed } from "./smoke-allowed.decorator";
import { SmokeAuthService } from "./smoke-auth.service";
import { SmokeLoginDto, SmokeProvisionDto } from "./dto/smoke-auth.dto";
import { SMOKE_CLAIMS_REQUEST_KEY, SmokeTokenClaims } from "./smoke-principal.constants";

/**
 * C36 — smoke auth yüzeyi. AÇIK İSİMLİ ve DAR.
 *
 * Bu controller RELEASE13'te YOKTUR; rollback sonrası `/auth/smoke/*` 404 döner.
 * Bu, legacy fail-closed'un üçüncü katmanıdır.
 *
 * Normal `/auth/login` DEĞİŞTİRİLMEMİŞTİR ve smoke principal'ı kabul etmez.
 */
@Controller("auth/smoke")
export class SmokeAuthController {
  constructor(private readonly smokeAuth: SmokeAuthService) {}

  /**
   * Smoke login. Owner allowlist md.1.
   *
   * Yanıt yalnız token taşır; kullanıcı/tenant gövdesi DÖNMEZ (yüzey minimum).
   */
  @Post("login")
  @SmokeAllowed()
  @UseGuards(LoginRateLimitGuard)
  async login(@Body() dto: SmokeLoginDto) {
    const token = await this.smokeAuth.login(
      dto.email,
      dto.tenantSlug,
      dto.credential,
      new Date(),
    );
    return { token };
  }

  /**
   * Smoke principal provisioning. Owner §5:
   *   · public internetten genel erişilebilir OLAMAZ  → loopback zorunlu
   *   · imzalı envelope                                → keyfi payload yetkisi yok
   *   · exact nonce/window                             → replay reddi
   *   · tek mutation + lost-response reconciliation    → kör retry yok
   *
   * `@SmokeAllowed()` TAŞIMAZ: bu uç smoke token ile DEĞİL, imzalı envelope ile
   * çağrılır. Smoke token ile çağrılırsa global guard reddeder.
   */
  @Post("provision")
  async provision(@Req() req: unknown, @Body() dto: SmokeProvisionDto) {
    SmokeAuthController.assertLoopback(req);
    const now = new Date();
    this.smokeAuth.verifyEnvelope(dto.envelope, dto.signatureBase64, now);
    return this.smokeAuth.provision(dto.envelope, dto.credential, now);
  }

  /**
   * Kanonik revoke / session invalidation. Owner allowlist md.3.
   * Yalnız principal'ın KENDİSİ çağırabilir (smoke token'daki `spid` kullanılır).
   */
  @Post("revoke")
  @SmokeAllowed()
  async revoke(@Req() req: Record<string, unknown>) {
    const claims = req?.[SMOKE_CLAIMS_REQUEST_KEY] as SmokeTokenClaims | undefined;
    if (!claims) throw new UnauthorizedException();
    return this.smokeAuth.revoke(claims.spid, new Date());
  }

  /**
   * Loopback/host-bound kontrolü. Public internetten çağrılabilen genel
   * smoke-registration endpoint'i YASAKTIR (owner §5).
   */
  private static assertLoopback(req: unknown): void {
    const r = req as { ip?: unknown; socket?: { remoteAddress?: unknown } } | null;
    const candidates = [r?.ip, r?.socket?.remoteAddress].filter(
      (v): v is string => typeof v === "string",
    );
    const loopback = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);
    const ok = candidates.length > 0 && candidates.every((c) => loopback.has(c));
    if (!ok) {
      throw new ForbiddenException("Smoke provisioning yalnız loopback üzerinden çağrılabilir");
    }
  }
}
