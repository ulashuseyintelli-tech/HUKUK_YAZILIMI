import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from '../../prisma/prisma.module';
import { SchedulerService } from './scheduler.service';
import { SchedulerController } from './scheduler.controller';
import { SchedulerMetricsService } from './scheduler-metrics.service';
import { TebligatModule } from '../tebligat/tebligat.module'; // PR-S2: cron tebligat senkronu ortak yola alındı

@Module({
  imports: [
    ScheduleModule.forRoot(),
    PrismaModule,
    TebligatModule, // PR-S2: TebligatService inject (cycle yok: tebligat→scheduler referansı yok)
  ],
  controllers: [SchedulerController],
  providers: [SchedulerService, SchedulerMetricsService],
  exports: [SchedulerService],
})
export class SchedulerModule {}
