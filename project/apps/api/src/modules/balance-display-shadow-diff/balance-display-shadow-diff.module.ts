import { Module } from '@nestjs/common';
import { CaseModule } from '../case/case.module';
import { InterestEngineModule } from '../interest-engine/interest-engine.module';
import { BalanceDisplayShadowDiffController } from './balance-display-shadow-diff.controller';
import { BalanceDisplayShadowDiffService } from './balance-display-shadow-diff.service';
import { BalanceDisplayShadowDiffMetrics } from './balance-display-shadow-diff.metrics';
import { BalanceDisplayShadowDiffEventLogger } from './balance-display-shadow-diff-event-logger';

@Module({
  imports: [CaseModule, InterestEngineModule],
  controllers: [BalanceDisplayShadowDiffController],
  providers: [BalanceDisplayShadowDiffService, BalanceDisplayShadowDiffMetrics, BalanceDisplayShadowDiffEventLogger],
})
export class BalanceDisplayShadowDiffModule {}
