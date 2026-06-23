import { Module, forwardRef } from "@nestjs/common";
import { CaseService } from "./case.service";
import { CaseController } from "./case.controller";
import { OcrModule } from "../ocr/ocr.module";
import { AddressDiscoveryModule } from "../address-discovery/address-discovery.module";
import { InterestEngineModule } from "../interest-engine/interest-engine.module";
import { ExpenseRequestModule } from "../expense-request/expense-request.module";
import { DomainEventIngestModule } from "../icrabot/domain-event-ingest";
import { CollectionModule } from "../collection/collection.module";
// RFA-016: inline taraf oluşturmayı guard'lı servislere devretmek için (duplicate bypass kapatma).
import { ClientModule } from "../client/client.module";
import { LawyerModule } from "../lawyer/lawyer.module";
import { DebtorModule } from "../debtor/debtor.module";
import { ResponsibleCandidatesService } from "./responsible-candidates.service";
import { TemporalResponsibilityService } from "./temporal-responsibility.service";

@Module({
  imports: [
    OcrModule,
    forwardRef(() => AddressDiscoveryModule),
    forwardRef(() => InterestEngineModule),
    forwardRef(() => ExpenseRequestModule),
    DomainEventIngestModule,
    // G3d: tahsilat create/cancel tek otorite (CollectionService).
    CollectionModule,
    // RFA-016: case.create artık inline tx.client/lawyer/debtor.create YAPMAZ; bu servislerin
    // guard'lı create'ini çağırır (modüller CaseModule'ü import etmez → circular yok).
    ClientModule,
    LawyerModule,
    DebtorModule,
  ],
  controllers: [CaseController],
  providers: [CaseService, ResponsibleCandidatesService, TemporalResponsibilityService],
  exports: [CaseService, TemporalResponsibilityService],
})
export class CaseModule {}
