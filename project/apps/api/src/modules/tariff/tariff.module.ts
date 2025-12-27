import { Module } from '@nestjs/common';
import { TariffService } from './tariff.service';
import { TariffController } from './tariff.controller';
import { GazetteWatcherService } from './gazette-watcher.service';

@Module({
  providers: [TariffService, GazetteWatcherService],
  controllers: [TariffController],
  exports: [TariffService, GazetteWatcherService],
})
export class TariffModule {}
