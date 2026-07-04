import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { PrismaModule } from "../../prisma/prisma.module";
import { NotificationService } from "./notification.service";
import { NotificationController } from "./notification.controller";
import { SmsProviderService } from "./sms-provider.service";
import { EmailProviderService } from "./email-provider.service";
import { PermissionDiagnosticsModule } from "../permission-diagnostics/permission-diagnostics.module";

@Module({
  // P2b-2: SEND_NOTIFICATION observe hook için GuidedOpenObserveService
  imports: [PrismaModule, ConfigModule, PermissionDiagnosticsModule],
  controllers: [NotificationController],
  providers: [NotificationService, SmsProviderService, EmailProviderService],
  exports: [NotificationService, SmsProviderService, EmailProviderService],
})
export class NotificationModule {}
