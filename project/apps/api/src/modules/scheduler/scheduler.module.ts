import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from '../../prisma/prisma.module';
import { SchedulerService } from './scheduler.service';
import { SchedulerController } from './scheduler.controller';
import { SchedulerMetricsService } from './scheduler-metrics.service';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    PrismaModule,
  ],
  controllers: [SchedulerController],
  providers: [SchedulerService, SchedulerMetricsService],
  exports: [SchedulerService],
})
export class SchedulerModule {}
