import { Module } from "@nestjs/common";
import { TebligatController } from "./tebligat.controller";
import { TebligatService } from "./tebligat.service";
import { PttTrackingService } from "./ptt-tracking.service";
import { UetsService } from "./uets.service";
import { PrismaModule } from "../../prisma/prisma.module";
import { DebtorModule } from "../debtor/debtor.module"; // PR-D5-b-1: Tebligat→CaseDebtor senkronu
import { CaseDebtorLifecycleGuardModule } from "../case-debtor-lifecycle-guard/case-debtor-lifecycle-guard.module";
import { ServiceOccurrenceService } from "./service-occurrence/service-occurrence.service";

@Module({
  imports: [PrismaModule, DebtorModule, CaseDebtorLifecycleGuardModule],
  controllers: [TebligatController],
  providers: [TebligatService, PttTrackingService, UetsService, ServiceOccurrenceService],
  exports: [TebligatService, PttTrackingService, UetsService, ServiceOccurrenceService],
})
export class TebligatModule {}
