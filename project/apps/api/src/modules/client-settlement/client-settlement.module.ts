import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { V28EngineModule } from '../icrabot/v28-engine/v28-engine.module';
import { CollectionDispositionService } from './collection-disposition.service';
import { PaymentReceivedRegistrar } from './payment-received.registrar';
import { DispositionPostingService } from './disposition-posting.service';
import { DispositionController } from './disposition.controller';
import { ClientPayoutService } from './client-payout.service';
import { ClientPayoutController } from './client-payout.controller';

/**
 * TM3 M1/M2/M3 — Müvekkil Settlement Bridge (Claude domaini).
 * M1: PAYMENT_RECEIVED → CollectionDisposition draft (handler registration; D2).
 * M2: disposition posting (POSTED). ClientStatement.collect() POSTED proceeds okur (model A).
 * M3: ClientPayout (CLIENT_PAYABLE settlement → CLIENT_PAYOUT_SENT). LEDGER DEĞİL; BalanceLedger'a yazmaz (D1).
 */
@Module({
  imports: [PrismaModule, V28EngineModule],
  controllers: [DispositionController, ClientPayoutController],
  providers: [CollectionDispositionService, PaymentReceivedRegistrar, DispositionPostingService, ClientPayoutService],
  exports: [CollectionDispositionService],
})
export class ClientSettlementModule {}
