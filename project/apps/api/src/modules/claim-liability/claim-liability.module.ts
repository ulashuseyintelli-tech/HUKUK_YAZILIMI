import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { CaseViewScopeModule } from '../case/case-view-scope.module';
import { ClaimItemModule } from '../claim-item/claim-item.module';
import { OfficeApprovalModule } from '../office-approval/office-approval.module';
import { ClaimLiabilityController } from './claim-liability.controller';
import { ClaimLiabilitySelectionService } from './claim-liability-selection.service';

/**
 * Seçimlik kalem bazlı borçlu sorumluluğu (karar günlüğü 2026-11-15, DEBTOR-OD07-CLAIM-LIABILITY-SELECTION-SA01).
 *
 * Modül yalnız SEÇİM komutlarını taşır. Hesap (saf alan modülü) ve okuma / mahsup kapasitesi düz işlevlerdir; tahsilat
 * ve mahsup motoru onları doğrudan içe aktarır (paralel motor ya da muhasebe sistemi YOKTUR).
 */
@Module({
  imports: [PrismaModule, CaseViewScopeModule, OfficeApprovalModule, ClaimItemModule],
  controllers: [ClaimLiabilityController],
  providers: [ClaimLiabilitySelectionService],
  exports: [ClaimLiabilitySelectionService],
})
export class ClaimLiabilityModule {}
