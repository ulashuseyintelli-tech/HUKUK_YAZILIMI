/**
 * G4c-3: BalanceShadowCompareModule — yaprak tüketici (döngü kaçınma).
 *
 * InterestEngineModule (CaseBalanceService) + SummaryEngineModule (SummaryEngineService) import eder.
 * Bu modülü interest-engine/summary-engine İMPORT ETMEZ → döngü YOK.
 * (summary-engine zaten interest-engine'i import ediyor; compare'i interest-engine'e koymak döngü olurdu.)
 */

import { Module } from '@nestjs/common';
import { InterestEngineModule } from '../interest-engine/interest-engine.module';
import { SummaryEngineModule } from '../summary-engine/summary-engine.module';
import { BalanceShadowCompareService } from './balance-shadow-compare.service';
import { BalanceShadowCompareController } from './balance-shadow-compare.controller';

@Module({
  imports: [InterestEngineModule, SummaryEngineModule],
  controllers: [BalanceShadowCompareController],
  providers: [BalanceShadowCompareService],
})
export class BalanceShadowCompareModule {}
