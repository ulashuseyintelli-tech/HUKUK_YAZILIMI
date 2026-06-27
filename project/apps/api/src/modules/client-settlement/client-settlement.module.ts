import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { V28EngineModule } from '../icrabot/v28-engine/v28-engine.module';
import { CollectionDispositionService } from './collection-disposition.service';
import { PaymentReceivedRegistrar } from './payment-received.registrar';
import { CollectionReversalService } from './collection-reversal.service';
import { PaymentReversedRegistrar } from './payment-reversed.registrar';
import { DispositionPostingService } from './disposition-posting.service';
import { DispositionController } from './disposition.controller';
import { ClientPayoutService } from './client-payout.service';
import { ClientPayoutController } from './client-payout.controller';

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
  imports: [PrismaModule, V28EngineModule],
  controllers: [DispositionController, ClientPayoutController],
  providers: [
    CollectionDispositionService,
    PaymentReceivedRegistrar,
    CollectionReversalService,
    PaymentReversedRegistrar,
    DispositionPostingService,
    ClientPayoutService,
  ],
  exports: [CollectionDispositionService, CollectionReversalService],
})
export class ClientSettlementModule {}
