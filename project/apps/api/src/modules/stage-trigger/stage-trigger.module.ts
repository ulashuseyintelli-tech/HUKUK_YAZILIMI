import { Module, forwardRef } from '@nestjs/common';
import { StageTriggerService } from './stage-trigger.service';
import { StageTriggerController } from './stage-trigger.controller';
import { PrismaModule } from '@/prisma/prisma.module';
import { CostPackageModule } from '@/modules/cost-package/cost-package.module';
import { CaseBalanceModule } from '@/modules/case-balance/case-balance.module';
import { PolicyEngineModule } from '@/modules/policy-engine/policy-engine.module';

@Module({
  imports: [
    PrismaModule,
    CostPackageModule,
    CaseBalanceModule,
    forwardRef(() => PolicyEngineModule), // CPE entegrasyonu için
  ],
  controllers: [StageTriggerController],
  providers: [StageTriggerService],
  exports: [StageTriggerService],
})
export class StageTriggerModule {}
