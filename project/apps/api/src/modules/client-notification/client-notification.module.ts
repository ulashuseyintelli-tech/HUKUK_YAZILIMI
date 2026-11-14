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
import { NotificationHistoryPermissionController } from "./notification-history-permission.controller";
import { NotificationHistoryPermissionService } from "./notification-history-permission.service";
import { ClientNotificationHistoryAccessService } from "./client-notification-history-access.service";
import { ExpenseSendApprovalService } from './expense-send-approval.service';
import { CaseViewScopeModule } from "../case/case-view-scope.module";

@Module({
  imports: [
    CaseViewScopeModule, // F02 P3 tarama: dosya kapısı
    PrismaModule,
    OfficeModule,
    MessageTemplateModule,
    AuditModule,
    OfficeApprovalModule,
  ],
  controllers: [ClientNotificationController, NotificationDispatchController, NotificationHistoryPermissionController],
  providers: [
    ClientNotificationService,
    NotificationDispatcherService,
    ClientNotificationAuthorityAdapter,
    NotificationHistoryPermissionService,
    ClientNotificationHistoryAccessService,
    ExpenseSendApprovalService,
  ],
  exports: [ClientNotificationService, NotificationDispatcherService, ExpenseSendApprovalService, ClientNotificationHistoryAccessService],
})
export class ClientNotificationModule {}
