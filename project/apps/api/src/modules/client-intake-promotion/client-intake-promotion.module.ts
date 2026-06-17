import { Module } from '@nestjs/common';
import { PrismaModule } from '@/prisma/prisma.module';
import { ClientIntakePromotionController } from './client-intake-promotion.controller';
import { ClientIntakePromotionService } from './client-intake-promotion.service';

/**
 * Client Intake PROMOTE modülü (Faz 4.6) — AYRI köprü modülü.
 * Dış-form verisini kanoniğe (ClientIntelStatement) yazan TEK yer.
 * 4.5 ReviewQueueModule'a dokunmaz; review ≠ promote sınırı korunur.
 */
@Module({
  imports: [PrismaModule],
  controllers: [ClientIntakePromotionController],
  providers: [ClientIntakePromotionService],
  exports: [ClientIntakePromotionService],
})
export class ClientIntakePromotionModule {}
