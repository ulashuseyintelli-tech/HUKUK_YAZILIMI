import { Module, forwardRef } from "@nestjs/common";
import { CaseService } from "./case.service";
import { CaseController } from "./case.controller";
import { OcrModule } from "../ocr/ocr.module";
import { AddressDiscoveryModule } from "../address-discovery/address-discovery.module";
import { InterestEngineModule } from "../interest-engine/interest-engine.module";
import { ExpenseRequestModule } from "../expense-request/expense-request.module";
import { DomainEventIngestModule } from "../icrabot/domain-event-ingest";
import { CollectionModule } from "../collection/collection.module";

@Module({
  imports: [
    OcrModule,
    forwardRef(() => AddressDiscoveryModule),
    forwardRef(() => InterestEngineModule),
    forwardRef(() => ExpenseRequestModule),
    DomainEventIngestModule,
    // G3d: tahsilat create/cancel tek otorite (CollectionService).
    CollectionModule,
  ],
  controllers: [CaseController],
  providers: [CaseService],
  exports: [CaseService],
})
export class CaseModule {}
