import { Module, forwardRef } from '@nestjs/common';
import { ClaimItemService } from './claim-item.service';
import { ClaimItemController } from './claim-item.controller';
import { PrismaModule } from '../../prisma/prisma.module';
import { ClaimEngineModule } from '../claim-engine/claim-engine.module';
import { OfficeApprovalModule } from '../office-approval/office-approval.module';

@Module({
  imports: [PrismaModule, ClaimEngineModule, OfficeApprovalModule],
  controllers: [ClaimItemController],
  providers: [ClaimItemService],
  exports: [ClaimItemService],
})
export class ClaimItemModule {}
