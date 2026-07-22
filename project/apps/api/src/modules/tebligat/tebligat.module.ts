import { Module } from "@nestjs/common";
import { TebligatController } from "./tebligat.controller";
import { TebligatService } from "./tebligat.service";
import { PttTrackingService } from "./ptt-tracking.service";
import { UetsService } from "./uets.service";
import { PrismaModule } from "../../prisma/prisma.module";
import { DebtorModule } from "../debtor/debtor.module"; // PR-D5-b-1: Tebligat→CaseDebtor senkronu
import { CaseDebtorLifecycleGuardModule } from "../case-debtor-lifecycle-guard/case-debtor-lifecycle-guard.module";
import { ServiceOccurrenceService } from "./service-occurrence/service-occurrence.service";
import { ServiceOccurrenceRecordedEventAccessor } from "./service-occurrence/service-occurrence-recorded-event.accessor"; // DEBTOR-OF01-HISTORY-P04-A2
import { DomainEventIngestModule } from "../icrabot/domain-event-ingest/domain-event-ingest.module"; // DEBTOR-OF01-HISTORY-P03

@Module({
  imports: [PrismaModule, DebtorModule, CaseDebtorLifecycleGuardModule, DomainEventIngestModule],
  controllers: [TebligatController],
  providers: [TebligatService, PttTrackingService, UetsService, ServiceOccurrenceService, ServiceOccurrenceRecordedEventAccessor],
  exports: [TebligatService, PttTrackingService, UetsService, ServiceOccurrenceService, ServiceOccurrenceRecordedEventAccessor],
})
export class TebligatModule {}
