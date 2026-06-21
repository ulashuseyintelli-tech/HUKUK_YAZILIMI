import { Module } from "@nestjs/common";
import { PrismaModule } from "@/prisma/prisma.module";
import { OfficeModule } from "../office/office.module";
import { OperationalEscalationService } from "./operational-escalation.service";
import { TenantNotifier } from "./tenant-notifier.service";
import { EscalationController } from "./escalation.controller";

@Module({
  imports: [PrismaModule, OfficeModule],
  controllers: [EscalationController],
  providers: [OperationalEscalationService, TenantNotifier],
})
export class EscalationModule {}
