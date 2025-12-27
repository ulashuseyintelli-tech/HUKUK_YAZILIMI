import { Module } from '@nestjs/common';
import { FeeEngineService } from './fee-engine.service';
import { FeeEngineController } from './fee-engine.controller';

@Module({
  providers: [FeeEngineService],
  controllers: [FeeEngineController],
  exports: [FeeEngineService],
})
export class FeeEngineModule {}
