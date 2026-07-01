import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { V28EngineModule } from '../icrabot/v28-engine/v28-engine.module';
import { OfficeApprovalModule } from '../office-approval/office-approval.module';
import { AccountingJournalWriterService } from '../accounting-journal';
import { AccountingJournalTrialBalanceModule } from '../accounting-journal/accounting-journal-trial-balance.module';
import { CollectionDispositionService } from './collection-disposition.service';
import { PaymentReceivedRegistrar } from './payment-received.registrar';
import { CollectionReversalService } from './collection-reversal.service';
import { PaymentReversedRegistrar } from './payment-reversed.registrar';
import { DispositionPostingService } from './disposition-posting.service';
import { DistributionRecommendationService } from './distribution-recommendation.service';
import { DispositionController } from './disposition.controller';
import { ClientPayoutService } from './client-payout.service';
import { ClientPayoutController } from './client-payout.controller';
import { ClientAccountingJournalMovementsReaderService } from './client-accounting-journal-movements-reader.service';
import { ClientAccountingMovementsReadService } from './client-accounting-movements-read.service';
import { ClientAccountingSummaryShadowReportService } from './client-accounting-summary-shadow-report.service';
import { ClientSettlementReadService } from './client-settlement-read.service';
import { ClientAccountingController } from './client-accounting.controller';
import { ClientOffsetService } from './client-offset.service';
import { ClientOffsetController } from './client-offset.controller';
import { ClientPayoutManualReversalController } from './client-payout-manual-reversal.controller';
import { ClientPayoutManualReversalReadService } from './client-payout-manual-reversal-read.service';
import { ClientPayoutManualReversalService } from './client-payout-manual-reversal.service';
import { FinanceApprovalIntentBuilder } from './finance-approval-intent.builder';
import { FinanceRiskEngine } from './finance-risk.engine';
import { CaseFeeAgreementService } from './case-fee-agreement.service';
import { CaseFeeAgreementController } from './case-fee-agreement.controller';

/**
 * TM3 M1/M2/M3/M1R - Muvekkil Settlement Bridge (Claude domaini).
 * M1:  PAYMENT_RECEIVED outbox event'i -> CollectionDisposition draft (handler registration; D2).
 * M2:  disposition posting (kullanici onayi -> POSTED). ClientStatementLine yazimi M2'de DEGIL -
 *      ClientStatement.collect() POSTED disposition line'larini okur (model A).
 * M3:  ClientPayout (CLIENT_PAYABLE settlement -> CLIENT_PAYOUT_SENT). LEDGER DEGIL; BalanceLedger'a yazmaz (D1).
 * M1R: PAYMENT_REVERSED outbox event'i -> aktif (HELD) disposition'i REVERSED yapar / POSTED'i
 *      manuel-reversal-required olarak consume eder (ayri exact key; M1 handler'ina dokunmaz).
 */
@Module({
  imports: [PrismaModule, V28EngineModule, OfficeApprovalModule, AccountingJournalTrialBalanceModule],
  controllers: [
    DispositionController,
    ClientPayoutController,
    ClientAccountingController,
    ClientOffsetController,
    ClientPayoutManualReversalController,
    CaseFeeAgreementController,
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
    AccountingJournalWriterService,
    ClientPayoutService,
    ClientSettlementReadService,
    ClientAccountingJournalMovementsReaderService,
    ClientAccountingMovementsReadService,
    ClientAccountingSummaryShadowReportService,
    ClientOffsetService,
    ClientPayoutManualReversalService,
    ClientPayoutManualReversalReadService,
    CaseFeeAgreementService,
  ],
  // FAZ-1b: ClientSettlementReadService export → expense-request modülü (UYAP gate) computeExpenseRemaining'i kullanır.
  // FAZ-2: CaseFeeAgreementService export → PR-3 distribution-recommendation entegrasyonu tüketecek (şimdilik dormant).
  exports: [
    CollectionDispositionService,
    CollectionReversalService,
    ClientSettlementReadService,
    ClientAccountingSummaryShadowReportService,
    CaseFeeAgreementService,
  ],
})
export class ClientSettlementModule {}