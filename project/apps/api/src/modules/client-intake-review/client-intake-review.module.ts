import { Module } from '@nestjs/common';
import { PrismaModule } from '@/prisma/prisma.module';
import { ClientIntakeReviewController } from './client-intake-review.controller';
import { ClientIntakeReviewService } from './client-intake-review.service';

/**
 * Client Intake Review Queue modülü (Faz 4.5).
 *
 * ⛔ MİMARİ SINIR: YALNIZ PrismaModule import eder. PromotionModule veya kanonik
 * modüller (ClientIntelStatement/Debtor/Asset) BURAYA İMPORT EDİLEMEZ — review ≠ promote.
 * Bu sınır, "approve'a basınca hemen oluştur" kaymasını yapısal olarak engeller.
 */
@Module({
  imports: [PrismaModule],
  controllers: [ClientIntakeReviewController],
  providers: [ClientIntakeReviewService],
  exports: [ClientIntakeReviewService],
})
export class ClientIntakeReviewModule {}
