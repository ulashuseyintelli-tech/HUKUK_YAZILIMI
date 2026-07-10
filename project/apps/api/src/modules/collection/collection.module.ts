import { Module } from "@nestjs/common";
import { CollectionController } from "./collection.controller";
import { CollectionService } from "./collection.service";
import { PrismaModule } from "../../prisma/prisma.module";
import { DomainEventIngestModule } from "../icrabot/domain-event-ingest";
import { SummaryEngineModule } from "../summary-engine/summary-engine.module";
import { CaseDebtorLifecycleGuardModule } from "../case-debtor-lifecycle-guard/case-debtor-lifecycle-guard.module";
import { AccountingJournalWriterService } from "../accounting-journal";
import { OfficeApprovalModule } from "../office-approval/office-approval.module";

@Module({
  // G3a: SummaryEngineModule → CollectionService kanonik ledger forward write için.
  imports: [
    PrismaModule,
    DomainEventIngestModule,
    SummaryEngineModule,
    CaseDebtorLifecycleGuardModule,
    OfficeApprovalModule,
  ],
  controllers: [CollectionController],
  providers: [CollectionService, AccountingJournalWriterService],
  exports: [CollectionService],
})
export class CollectionModule {}
