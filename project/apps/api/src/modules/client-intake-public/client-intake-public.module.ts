import { Module } from '@nestjs/common';
import { PrismaModule } from '@/prisma/prisma.module';
import { ClientIntakePublicController } from './client-intake-public.controller';
import { ClientIntakePublicService } from './client-intake-public.service';
import { PublicIntakeRateLimitGuard } from './public-intake-rate-limit.guard';
import {
  createPublicIntakeRedisClient,
  PUBLIC_INTAKE_REDIS_CLIENT,
  PublicIntakeRateLimitStore,
} from './public-intake-rate-limit.store';

/**
 * PUBLIC İntake modülü (Faz 4.4) — AUTH'suz dış form (GET şema + POST submit).
 * Kanonik/review/promote DEĞİL; yalnız CLIENT_SUBMITTED yazar. Bağımsız modül.
 */
@Module({
  imports: [PrismaModule],
  controllers: [ClientIntakePublicController],
  providers: [
    ClientIntakePublicService,
    { provide: PUBLIC_INTAKE_REDIS_CLIENT, useFactory: createPublicIntakeRedisClient },
    PublicIntakeRateLimitStore,
    PublicIntakeRateLimitGuard,
  ],
  exports: [ClientIntakePublicService],
})
export class ClientIntakePublicModule {}
