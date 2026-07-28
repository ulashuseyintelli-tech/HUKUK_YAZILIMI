import { Module } from "@nestjs/common";
import { JwtModule, JwtModuleOptions } from "@nestjs/jwt";
import { PortalController } from "./portal.controller";
import { PortalService } from "./portal.service";
import { ClientFinancialDisclosurePortalService } from "./client-financial-disclosure-portal.service";
import { PortalAuthGuard } from "./portal-auth.guard";
import { PrismaModule } from "../../prisma/prisma.module";
import { AuditModule } from "../audit/audit.module";
import { OfficeApprovalModule } from "../office-approval/office-approval.module";
// CLIENT-P2-CREDENTIAL-RECOVERY-P01: reset-token e-postası için EmailProviderService
// (NotificationModule export eder) — AuthModule'ün K1-7 invite akışıyla aynı desen.
import { NotificationModule } from "../notification/notification.module";

/**
 * H4: JWT_SECRET yoksa sessiz sabit fallback'e DÜŞMEZ — açık hata fırlatır (fail-closed).
 * auth.module.ts/jwt.strategy.ts ile aynı ilke (fallback'siz secret); portal ayrıca boot
 * anında (registerAsync factory) doğrular, ana auth ise ilk sign/verify'da hata verir.
 */
export function portalJwtModuleOptions(): JwtModuleOptions {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error(
      "JWT_SECRET ortam değişkeni tanımlı değil — portal auth güvenli şekilde başlatılamaz.",
    );
  }
  return {
    secret,
    signOptions: { expiresIn: "7d" },
  };
}

@Module({
  imports: [
    PrismaModule,
    AuditModule,
    OfficeApprovalModule,
    NotificationModule,
    JwtModule.registerAsync({
      useFactory: portalJwtModuleOptions,
    }),
  ],
  controllers: [PortalController],
  providers: [PortalService, PortalAuthGuard, ClientFinancialDisclosurePortalService],
  exports: [PortalService],
})
export class PortalModule {}
