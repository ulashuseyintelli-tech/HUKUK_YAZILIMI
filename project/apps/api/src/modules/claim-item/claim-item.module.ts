import { Module } from '@nestjs/common';
import { ClaimItemService } from './claim-item.service';
import { ClaimItemController } from './claim-item.controller';
import { PrismaModule } from '../../prisma/prisma.module';
import { ClaimEngineModule } from '../claim-engine/claim-engine.module';
import { OfficeApprovalModule } from '../office-approval/office-approval.module';
import { ClaimItemWriteGateService } from './claim-item-write-gate.service';
import { ClaimItemWriterRouterService } from './claim-item-writer-router.service';
import { DomainEventIngestModule } from '../icrabot/domain-event-ingest';
import {
  CEK_AUTO_GENERATE_FORMATION_OPTIONS,
  CekAutoGenerateFormationService,
  cekAutoGenerateFormationOptionsFromEnv,
} from './formation-cek/cek-auto-generate-formation.service';

@Module({
  imports: [PrismaModule, ClaimEngineModule, OfficeApprovalModule, DomainEventIngestModule],
  controllers: [ClaimItemController],
  providers: [
    ClaimItemService,
    ClaimItemWriteGateService,
    ClaimItemWriterRouterService,
    // K3 PR-3: çek formation akışı; bayraklar varsayılan KAPALI (yalnız tam 'true' ile açılır).
    { provide: CEK_AUTO_GENERATE_FORMATION_OPTIONS, useFactory: () => cekAutoGenerateFormationOptionsFromEnv() },
    CekAutoGenerateFormationService,
  ],
  // K3-L Faz 2b: CaseService dosya açılışında (commit sonrası) çek tazminatı K3 talebini bu servisle açar
  exports: [ClaimItemService, ClaimItemWriteGateService, ClaimItemWriterRouterService, CekAutoGenerateFormationService],
})
export class ClaimItemModule {}
