import { Module } from "@nestjs/common";
import { GreetingController } from "./greeting.controller";
import { GreetingService } from "./greeting.service";
import { PrismaModule } from "../../prisma/prisma.module";
import { ClientNotificationModule } from "../client-notification/client-notification.module";

@Module({
  imports: [PrismaModule, ClientNotificationModule],
  controllers: [GreetingController],
  providers: [GreetingService],
  exports: [GreetingService],
})
export class GreetingModule {}
