import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { V28EngineModule } from '../icrabot/v28-engine/v28-engine.module';
import { CollectionDispositionService } from './collection-disposition.service';
import { PaymentReceivedRegistrar } from './payment-received.registrar';
import { DispositionPostingService } from './disposition-posting.service';
import { DispositionController } from './disposition.controller';

/**
 * TM3 M1/M2 — Müvekkil Settlement Bridge (Claude domaini).
 * M1: PAYMENT_RECEIVED outbox event'i → CollectionDisposition draft (handler registration; D2).
 * M2: disposition posting (kullanıcı onayı → POSTED). ClientStatementLine yazımı M2'de DEĞİL —
 *     ClientStatement.collect() POSTED disposition line'larını okur (model A).
 */
@Module({
  imports: [PrismaModule, V28EngineModule],
  controllers: [DispositionController],
  providers: [CollectionDispositionService, PaymentReceivedRegistrar, DispositionPostingService],
  exports: [CollectionDispositionService],
})
export class ClientSettlementModule {}
