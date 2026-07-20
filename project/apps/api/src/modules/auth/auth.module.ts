import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { ConfigService } from "@nestjs/config";
import { AuthService } from "./auth.service";
import { AuthController } from "./auth.controller";
import { JwtStrategy } from "./strategies/jwt.strategy";
import { UserModule } from "../user/user.module";
import { TenantModule } from "../tenant/tenant.module";
import { NotificationModule } from "../notification/notification.module";
import { UserInviteService } from "./invite/user-invite.service";
import { UserInviteController } from "./invite/user-invite.controller";
import { PasswordResetService } from "./password-reset/password-reset.service";
import { PasswordResetController } from "./password-reset/password-reset.controller";

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: "jwt" }),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get("JWT_SECRET"),
        signOptions: {
          expiresIn: config.get("JWT_EXPIRES_IN", "7d"),
        },
      }),
    }),
    UserModule,
    TenantModule,
    // K1-7: invite e-postası için EmailProviderService (NotificationModule export eder).
    // OFFICE-AUTH-P02: credential-recovery e-postası için de aynı servis kullanılır.
    // AuditService global (AuditModule @Global), ConfigService global → ek import gerekmez.
    NotificationModule,
  ],
  controllers: [AuthController, UserInviteController, PasswordResetController],
  providers: [AuthService, JwtStrategy, UserInviteService, PasswordResetService],
  exports: [AuthService],
})
export class AuthModule {}
