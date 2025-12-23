import { Module, forwardRef } from '@nestjs/common';
import { ClaimItemService } from './claim-item.service';
import { ClaimItemController } from './claim-item.controller';
import { PrismaModule } from '../../prisma/prisma.module';
import { ClaimEngineModule } from '../claim-engine/claim-engine.module';

@Module({
  imports: [PrismaModule, ClaimEngineModule],
  controllers: [ClaimItemController],
  providers: [ClaimItemService],
  exports: [ClaimItemService],
})
export class ClaimItemModule {}
