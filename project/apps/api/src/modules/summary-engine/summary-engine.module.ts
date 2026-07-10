import { Module } from '@nestjs/common';
import { SummaryEngineService } from './summary-engine.service';
import { SummaryEngineController } from './summary-engine.controller';
import { PrismaModule } from '../../prisma/prisma.module';
import { FeeEngineModule } from '../fee-engine/fee-engine.module';
import { InterestEngineModule } from '../interest-engine/interest-engine.module';
import { ClaimItemModule } from '../claim-item/claim-item.module';

@Module({
  imports: [PrismaModule, FeeEngineModule, InterestEngineModule, ClaimItemModule],
  controllers: [SummaryEngineController],
  providers: [SummaryEngineService],
  exports: [SummaryEngineService],
})
export class SummaryEngineModule {}
