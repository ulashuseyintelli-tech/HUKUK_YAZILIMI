import { Module } from '@nestjs/common';
import { CaseModule } from '../case/case.module';
import { InterestEngineModule } from '../interest-engine/interest-engine.module';
import { BalanceDisplayShadowDiffController } from './balance-display-shadow-diff.controller';
import { BalanceDisplayShadowDiffService } from './balance-display-shadow-diff.service';
import { BalanceDisplayShadowDiffMetrics } from './balance-display-shadow-diff.metrics';

@Module({
  imports: [CaseModule, InterestEngineModule],
  controllers: [BalanceDisplayShadowDiffController],
  providers: [BalanceDisplayShadowDiffService, BalanceDisplayShadowDiffMetrics],
})
export class BalanceDisplayShadowDiffModule {}
