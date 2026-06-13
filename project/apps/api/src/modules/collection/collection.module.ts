import { Module } from "@nestjs/common";
import { CollectionController } from "./collection.controller";
import { CollectionService } from "./collection.service";
import { PrismaModule } from "../../prisma/prisma.module";
import { DomainEventIngestModule } from "../icrabot/domain-event-ingest";
import { SummaryEngineModule } from "../summary-engine/summary-engine.module";

@Module({
  // G3a: SummaryEngineModule → CollectionService kanonik ledger forward write için.
  imports: [PrismaModule, DomainEventIngestModule, SummaryEngineModule],
  controllers: [CollectionController],
  providers: [CollectionService],
  exports: [CollectionService],
})
export class CollectionModule {}
