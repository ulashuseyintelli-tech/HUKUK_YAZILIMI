import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { PrismaModule } from "../../prisma/prisma.module";
import { NotificationService } from "./notification.service";
import { NotificationController } from "./notification.controller";
import { SmsProviderService } from "./sms-provider.service";
import { EmailProviderService } from "./email-provider.service";

@Module({
  imports: [PrismaModule, ConfigModule],
  controllers: [NotificationController],
  providers: [NotificationService, SmsProviderService, EmailProviderService],
  exports: [NotificationService, SmsProviderService, EmailProviderService],
})
export class NotificationModule {}
