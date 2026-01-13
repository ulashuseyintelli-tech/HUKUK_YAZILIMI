import { Module } from '@nestjs/common';
import { FeeEngineService, TARIFF_REPOSITORY } from './fee-engine.service';
import { FeeEngineController } from './fee-engine.controller';
import { TariffModule } from '../tariff/tariff.module';
import { TariffService } from '../tariff/tariff.service';

@Module({
  imports: [TariffModule],
  providers: [
    FeeEngineService,
    {
      provide: TARIFF_REPOSITORY,
      useExisting: TariffService,
    },
  ],
  controllers: [FeeEngineController],
  exports: [FeeEngineService],
})
export class FeeEngineModule {}
