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
import { LegalDeadlineModule } from "../legal-deadline/legal-deadline.module"; // DEBTOR-OF01-HISTORY-P04-C-I01
import { V28EngineModule } from "../icrabot/v28-engine/v28-engine.module"; // DEBTOR-OF01-HISTORY-P04-C-I01
import { ServiceOccurrenceRecordedConsumerService } from "./service-occurrence/service-occurrence-recorded.consumer"; // DEBTOR-OF01-HISTORY-P04-C-I01
import { ServiceOccurrenceRecordedRegistrar } from "./service-occurrence/service-occurrence-recorded.registrar"; // DEBTOR-OF01-HISTORY-P04-C-I01

@Module({
  imports: [
    PrismaModule,
    DebtorModule,
    CaseDebtorLifecycleGuardModule,
    DomainEventIngestModule,
    LegalDeadlineModule,
    V28EngineModule,
  ],
  controllers: [TebligatController],
  providers: [
    TebligatService,
    PttTrackingService,
    UetsService,
    ServiceOccurrenceService,
    ServiceOccurrenceRecordedEventAccessor,
    ServiceOccurrenceRecordedConsumerService,
    ServiceOccurrenceRecordedRegistrar,
  ],
  exports: [TebligatService, PttTrackingService, UetsService, ServiceOccurrenceService, ServiceOccurrenceRecordedEventAccessor],
})
export class TebligatModule {}
