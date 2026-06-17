import { Module } from "@nestjs/common";
import { ClientNotificationController } from "./client-notification.controller";
import { ClientNotificationService } from "./client-notification.service";
import { NotificationDispatcherService } from "./notification-dispatcher.service";
import { NotificationDispatchController } from "./notification-dispatch.controller";
import { PrismaModule } from "../../prisma/prisma.module";
import { OfficeModule } from "../office/office.module";
import { MessageTemplateModule } from "../message-template/message-template.module";

@Module({
  imports: [PrismaModule, OfficeModule, MessageTemplateModule],
  controllers: [ClientNotificationController, NotificationDispatchController],
  providers: [ClientNotificationService, NotificationDispatcherService],
  exports: [ClientNotificationService, NotificationDispatcherService],
})
export class ClientNotificationModule {}
