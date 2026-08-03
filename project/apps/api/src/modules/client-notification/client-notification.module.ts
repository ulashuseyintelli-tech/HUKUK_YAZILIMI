import { Module } from "@nestjs/common";
import { ClientNotificationController } from "./client-notification.controller";
import { ClientNotificationService } from "./client-notification.service";
import { NotificationDispatcherService } from "./notification-dispatcher.service";
import { NotificationDispatchController } from "./notification-dispatch.controller";
import { PrismaModule } from "../../prisma/prisma.module";
import { OfficeModule } from "../office/office.module";
import { MessageTemplateModule } from "../message-template/message-template.module";
import { AuditModule } from "../audit/audit.module";
import { OfficeApprovalModule } from "../office-approval/office-approval.module";
import { ClientNotificationAuthorityAdapter } from "./client-notification-authority.adapter";

@Module({
  imports: [
    PrismaModule,
    OfficeModule,
    MessageTemplateModule,
    AuditModule,
    OfficeApprovalModule,
  ],
  controllers: [ClientNotificationController, NotificationDispatchController],
  providers: [
    ClientNotificationService,
    NotificationDispatcherService,
    ClientNotificationAuthorityAdapter,
  ],
  exports: [ClientNotificationService, NotificationDispatcherService],
})
export class ClientNotificationModule {}
