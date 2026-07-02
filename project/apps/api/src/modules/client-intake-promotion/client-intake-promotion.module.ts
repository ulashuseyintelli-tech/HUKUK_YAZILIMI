import { Module } from '@nestjs/common';
import { PrismaModule } from '@/prisma/prisma.module';
import { ClientIntakePromotionController } from './client-intake-promotion.controller';
import { ClientIntakePromotionService } from './client-intake-promotion.service';
import { OfficeApprovalModule } from '../office-approval/office-approval.module';

/**
 * Client Intake PROMOTE modülü (Faz 4.6) — AYRI köprü modülü.
 * Dış-form verisini kanoniğe (ClientIntelStatement) yazan TEK yer.
 * 4.5 ReviewQueueModule'a dokunmaz; review ≠ promote sınırı korunur.
 * I1A: AuditService @Global — ek import gerekmez. OfficeApprovalModule promote/
 * promoteAddress/promoteSoft capability-gate (isApproverEligible) için gerekli
 * (cross-cutting altyapı — review≠promote mimari sınırını ihlal etmez).
 */
@Module({
  imports: [PrismaModule, OfficeApprovalModule],
  controllers: [ClientIntakePromotionController],
  providers: [ClientIntakePromotionService],
  exports: [ClientIntakePromotionService],
})
export class ClientIntakePromotionModule {}
