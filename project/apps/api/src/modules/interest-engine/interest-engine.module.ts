import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from '../../prisma/prisma.module';
import { InterestEngineService } from './interest-engine.service';
import { RateScheduleService } from './rate-schedule.service';
import { PaymentAllocationService } from './payment-allocation.service';
import { PolicyGateService } from './policy-gate.service';
import { InterestAuditLogService } from './audit-log.service';
import { RateSyncService } from './rate-sync.service';
import { CekTazminatService } from './cek-tazminat.service';
import { InterestEngineController } from './interest-engine.controller';

@Module({
  imports: [PrismaModule, ScheduleModule.forRoot()],
  controllers: [InterestEngineController],
  providers: [
    InterestEngineService,
    RateScheduleService,
    PaymentAllocationService,
    PolicyGateService,
    InterestAuditLogService,
    RateSyncService,
    CekTazminatService,
  ],
  exports: [InterestEngineService, RateScheduleService, CekTazminatService],
})
export class InterestEngineModule {}
