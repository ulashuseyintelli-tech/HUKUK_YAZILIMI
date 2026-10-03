import { Module, forwardRef } from '@nestjs/common';
import { StageTriggerService } from './stage-trigger.service';
import { StageTriggerController } from './stage-trigger.controller';
import { PrismaModule } from '@/prisma/prisma.module';
import { CostPackageModule } from '@/modules/cost-package/cost-package.module';
import { CaseBalanceModule } from '@/modules/case-balance/case-balance.module';
import { ExpenseRequestModule } from '@/modules/expense-request/expense-request.module';
import { PolicyEngineModule } from '@/modules/policy-engine/policy-engine.module';

@Module({
  imports: [
    PrismaModule,
    CostPackageModule,
    CaseBalanceModule,
    ExpenseRequestModule, // Açılış masrafı şartı (masraf kapısı) için
    forwardRef(() => PolicyEngineModule), // CPE entegrasyonu için
  ],
  controllers: [StageTriggerController],
  providers: [StageTriggerService],
  exports: [StageTriggerService],
})
export class StageTriggerModule {}
