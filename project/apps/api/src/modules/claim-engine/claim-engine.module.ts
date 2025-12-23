import { Module } from '@nestjs/common';
import { ClaimEngineService } from './claim-engine.service';
import { ClaimEngineController } from './claim-engine.controller';

@Module({
  providers: [ClaimEngineService],
  controllers: [ClaimEngineController],
  exports: [ClaimEngineService],
})
export class ClaimEngineModule {}
