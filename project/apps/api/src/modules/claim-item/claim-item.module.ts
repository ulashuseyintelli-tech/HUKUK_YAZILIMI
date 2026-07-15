import { Module } from '@nestjs/common';
import { ClaimItemService } from './claim-item.service';
import { ClaimItemController } from './claim-item.controller';
import { PrismaModule } from '../../prisma/prisma.module';
import { ClaimEngineModule } from '../claim-engine/claim-engine.module';
import { OfficeApprovalModule } from '../office-approval/office-approval.module';
import { ClaimItemWriteGateService } from './claim-item-write-gate.service';
import { ClaimItemWriterRouterService } from './claim-item-writer-router.service';
import { DomainEventIngestModule } from '../icrabot/domain-event-ingest';

@Module({
  imports: [PrismaModule, ClaimEngineModule, OfficeApprovalModule, DomainEventIngestModule],
  controllers: [ClaimItemController],
  providers: [ClaimItemService, ClaimItemWriteGateService, ClaimItemWriterRouterService],
  exports: [ClaimItemService, ClaimItemWriteGateService, ClaimItemWriterRouterService],
})
export class ClaimItemModule {}
