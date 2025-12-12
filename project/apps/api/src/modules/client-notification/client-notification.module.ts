import { Module } from "@nestjs/common";
import { ClientNotificationController } from "./client-notification.controller";
import { ClientNotificationService } from "./client-notification.service";
import { PrismaModule } from "../../prisma/prisma.module";
import { OfficeModule } from "../office/office.module";

@Module({
  imports: [PrismaModule, OfficeModule],
  controllers: [ClientNotificationController],
  providers: [ClientNotificationService],
  exports: [ClientNotificationService],
})
export class ClientNotificationModule {}
