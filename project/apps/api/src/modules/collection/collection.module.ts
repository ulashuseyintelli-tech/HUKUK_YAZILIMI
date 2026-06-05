import { Module } from "@nestjs/common";
import { CollectionController } from "./collection.controller";
import { CollectionService } from "./collection.service";
import { PrismaModule } from "../../prisma/prisma.module";
import { DomainEventIngestModule } from "../icrabot/domain-event-ingest";

@Module({
  imports: [PrismaModule, DomainEventIngestModule],
  controllers: [CollectionController],
  providers: [CollectionService],
  exports: [CollectionService],
})
export class CollectionModule {}
