import { Global, Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";

import { SmokeAuthController } from "./smoke-auth.controller";
import { SmokeAuthService } from "./smoke-auth.service";
import { SmokeAuthorizationGuard } from "./smoke-authorization.guard";
import { SmokeOrJwtAuthGuard } from "./smoke-or-jwt-auth.guard";
import { SmokeTokenService } from "./smoke-token.service";

/**
 * C36 — SMOKE modülü.
 *
 * `APP_GUARD` uygulama GENELİNDE enhancer olarak kaydolur ve controller-level
 * `@UseGuards`'DAN ÖNCE çalışır. Deny-by-default davranışı bu sıraya dayanır ve
 * VARSAYIM DEĞİLDİR: gerçek full-app HTTP testiyle kanıtlanır
 * (`smoke-deny-by-default-http.spec.ts`).
 *
 * `@Global()`: `SmokeOrJwtAuthGuard` başka bir modüldeki controller'da
 * (`AuthController`) kullanıldığı için provider'ların oradan da çözülebilmesi gerekir.
 */
@Global()
@Module({
  controllers: [SmokeAuthController],
  providers: [
    SmokeTokenService,
    SmokeAuthService,
    SmokeOrJwtAuthGuard,
    { provide: APP_GUARD, useClass: SmokeAuthorizationGuard },
  ],
  exports: [SmokeTokenService, SmokeAuthService, SmokeOrJwtAuthGuard],
})
export class SmokeModule {}
