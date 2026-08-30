import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as jwt from "jsonwebtoken";

import {
  SMOKE_AUTH_PURPOSE,
  SMOKE_SECRET_ENV,
  SMOKE_TOKEN_AUDIENCE,
  SMOKE_TOKEN_ISSUER,
  SMOKE_TOKEN_TTL_SECONDS,
  SmokeTokenClaims,
} from "./smoke-principal.constants";

/**
 * C36 — smoke token imzalama/doğrulama.
 *
 * AYRI SECRET (`JWT_SMOKE_SECRET`), normal `JWT_SECRET`'tan BAĞIMSIZDIR. Bu, legacy
 * fail-closed'un ÜÇÜNCÜ bağımsız katmanıdır: RELEASE13 `secretOrKey: JWT_SECRET` ile
 * doğrular, dolayısıyla smoke token'ın İMZASINI hiç doğrulayamaz — DB durumuna bakmadan
 * bile reddeder.
 *
 * Diğer iki katman:
 *   L1 (bu dosya) imza/secret ayrımı
 *   L2 `User.isActive=false` → R13 `validateUser()` her JWT'de 401 atar
 *   L3 R13'te `/auth/smoke/*` route'u YOKTUR → 404
 *
 * FAIL-CLOSED: secret yoksa VEYA `JWT_SECRET` ile AYNIYSA smoke özelliği tamamen
 * devre dışıdır (imzalama da doğrulama da yapılmaz). Aynı secret, smoke token'ın
 * normal strategy tarafından kabul edilmesi riskini doğururdu.
 */
@Injectable()
export class SmokeTokenService {
  private readonly logger = new Logger(SmokeTokenService.name);

  constructor(private readonly config: ConfigService) {}

  /**
   * Kullanılabilir smoke secret'ı döner; yoksa `null`.
   * Secret DEĞERİ hiçbir zaman log'lanmaz — yalnız yokluk/çakışma durumu bildirilir.
   */
  private resolveSecret(): string | null {
    const smoke = this.config.get<string>(SMOKE_SECRET_ENV);
    if (!smoke || smoke.length === 0) {
      return null;
    }
    const normal = this.config.get<string>("JWT_SECRET");
    if (normal && smoke === normal) {
      // Bilerek fail-closed: aynı secret, ayrışma garantisini yok eder.
      this.logger.error(
        `${SMOKE_SECRET_ENV} JWT_SECRET ile AYNI — smoke auth devre dışı (fail-closed).`,
      );
      return null;
    }
    return smoke;
  }

  /** Smoke auth bu runtime'da etkin mi? (secret varlığı + ayrışma) */
  isEnabled(): boolean {
    return this.resolveSecret() !== null;
  }

  /**
   * Smoke token üretir. TTL owner hükmü gereği en fazla 10 dakikadır.
   * Ham token DÖNÜŞ DEĞERİDİR; log'lanmaz ve hiçbir yere yazılmaz.
   */
  sign(input: { userId: string; smokePrincipalId: string; authGeneration: number }): string | null {
    const secret = this.resolveSecret();
    if (!secret) return null;

    return jwt.sign(
      {
        sub: input.userId,
        spid: input.smokePrincipalId,
        gen: input.authGeneration,
        authPurpose: SMOKE_AUTH_PURPOSE,
      },
      secret,
      {
        audience: SMOKE_TOKEN_AUDIENCE,
        issuer: SMOKE_TOKEN_ISSUER,
        expiresIn: SMOKE_TOKEN_TTL_SECONDS,
      },
    );
  }

  /**
   * Token'ı SMOKE token olarak doğrulamayı dener.
   *
   * Dönüş `null` ise "bu bir smoke token DEĞİL" demektir ve çağıran normal auth
   * yolunu HİÇ DEĞİŞTİRMEDEN sürdürür. Doğrulama başarısızlığı (süresi geçmiş,
   * imzası bozuk, audience/issuer uyuşmaz) da `null` döner — smoke yetkisi
   * ASLA hatalı doğrulamadan türetilmez.
   *
   * NOT: bu fonksiyon DB'ye BAKMAZ. Status/generation kontrolü her istekte ayrıca
   * `SmokeAuthService.resolveActiveSmokeUser()` içinde yapılır.
   */
  tryVerify(token: string): SmokeTokenClaims | null {
    const secret = this.resolveSecret();
    if (!secret) return null;

    try {
      const decoded = jwt.verify(token, secret, {
        audience: SMOKE_TOKEN_AUDIENCE,
        issuer: SMOKE_TOKEN_ISSUER,
      });
      if (!decoded || typeof decoded !== "object") return null;

      const claims = decoded as Record<string, unknown>;
      if (claims.authPurpose !== SMOKE_AUTH_PURPOSE) return null;
      if (typeof claims.sub !== "string" || claims.sub.length === 0) return null;
      if (typeof claims.spid !== "string" || claims.spid.length === 0) return null;
      if (typeof claims.gen !== "number" || !Number.isInteger(claims.gen)) return null;

      return {
        sub: claims.sub,
        spid: claims.spid,
        gen: claims.gen,
        authPurpose: SMOKE_AUTH_PURPOSE,
        aud: SMOKE_TOKEN_AUDIENCE,
        iss: SMOKE_TOKEN_ISSUER,
      };
    } catch {
      return null;
    }
  }
}
