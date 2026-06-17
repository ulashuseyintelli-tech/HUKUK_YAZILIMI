import { Module } from '@nestjs/common';
import { PrismaModule } from '@/prisma/prisma.module';
import { ClientIntakePublicController } from './client-intake-public.controller';
import { ClientIntakePublicService } from './client-intake-public.service';
import { PublicIntakeRateLimitGuard } from './public-intake-rate-limit.guard';

/**
 * PUBLIC İntake modülü (Faz 4.4) — AUTH'suz dış form (GET şema + POST submit).
 * Kanonik/review/promote DEĞİL; yalnız CLIENT_SUBMITTED yazar. Bağımsız modül.
 */
@Module({
  imports: [PrismaModule],
  controllers: [ClientIntakePublicController],
  providers: [ClientIntakePublicService, PublicIntakeRateLimitGuard],
  exports: [ClientIntakePublicService],
})
export class ClientIntakePublicModule {}
