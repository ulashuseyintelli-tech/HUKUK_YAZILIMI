import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { V28EngineModule } from '../icrabot/v28-engine/v28-engine.module';
import { OfficeApprovalModule } from '../office-approval/office-approval.module';
import { CollectionDispositionService } from './collection-disposition.service';
import { PaymentReceivedRegistrar } from './payment-received.registrar';
import { CollectionReversalService } from './collection-reversal.service';
import { PaymentReversedRegistrar } from './payment-reversed.registrar';
import { DispositionPostingService } from './disposition-posting.service';
import { DistributionRecommendationService } from './distribution-recommendation.service';
import { DispositionController } from './disposition.controller';
import { ClientPayoutService } from './client-payout.service';
import { ClientPayoutController } from './client-payout.controller';
import { ClientSettlementReadService } from './client-settlement-read.service';
import { ClientAccountingController } from './client-accounting.controller';
import { ClientOffsetService } from './client-offset.service';
import { ClientOffsetController } from './client-offset.controller';
import { ClientPayoutManualReversalController } from './client-payout-manual-reversal.controller';
import { ClientPayoutManualReversalService } from './client-payout-manual-reversal.service';
import { FinanceApprovalIntentBuilder } from './finance-approval-intent.builder';
import { FinanceRiskEngine } from './finance-risk.engine';

/**
 * TM3 M1/M2/M3/M1R — Müvekkil Settlement Bridge (Claude domaini).
 * M1:  PAYMENT_RECEIVED outbox event'i → CollectionDisposition draft (handler registration; D2).
 * M2:  disposition posting (kullanıcı onayı → POSTED). ClientStatementLine yazımı M2'de DEĞİL —
 *      ClientStatement.collect() POSTED disposition line'larını okur (model A).
 * M3:  ClientPayout (CLIENT_PAYABLE settlement → CLIENT_PAYOUT_SENT). LEDGER DEĞİL; BalanceLedger'a yazmaz (D1).
 * M1R: PAYMENT_REVERSED outbox event'i → aktif (HELD) disposition'ı REVERSED yapar / POSTED'i
 *      manuel-reversal-required olarak consume eder (ayrı exact key; M1 handler'ına dokunmaz).
 */
@Module({
  imports: [PrismaModule, V28EngineModule, OfficeApprovalModule],
  controllers: [
    DispositionController,
    ClientPayoutController,
    ClientAccountingController,
    ClientOffsetController,
    ClientPayoutManualReversalController,
  ],
  providers: [
    CollectionDispositionService,
    PaymentReceivedRegistrar,
    CollectionReversalService,
    PaymentReversedRegistrar,
    DispositionPostingService,
    DistributionRecommendationService,
    FinanceRiskEngine,
    FinanceApprovalIntentBuilder,
    ClientPayoutService,
    ClientSettlementReadService,
    ClientOffsetService,
    ClientPayoutManualReversalService,
  ],
  exports: [CollectionDispositionService, CollectionReversalService],
})
export class ClientSettlementModule {}
