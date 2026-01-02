import { Module } from '@nestjs/common';
import { StageTriggerService } from './stage-trigger.service';
import { StageTriggerController } from './stage-trigger.controller';
import { PrismaModule } from '@/prisma/prisma.module';
import { CostPackageModule } from '@/modules/cost-package/cost-package.module';
import { CaseBalanceModule } from '@/modules/case-balance/case-balance.module';

@Module({
  imports: [PrismaModule, CostPackageModule, CaseBalanceModule],
  controllers: [StageTriggerController],
  providers: [StageTriggerService],
  exports: [StageTriggerService],
})
export class StageTriggerModule {}
