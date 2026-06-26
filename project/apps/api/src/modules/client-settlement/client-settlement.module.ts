import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { V28EngineModule } from '../icrabot/v28-engine/v28-engine.module';
import { CollectionDispositionService } from './collection-disposition.service';
import { PaymentReceivedRegistrar } from './payment-received.registrar';

/**
 * TM3 M1 — Müvekkil Settlement Bridge (Claude domaini).
 * PAYMENT_RECEIVED outbox event'i → CollectionDisposition draft. Domain logic bu modülde;
 * V28EngineModule yalnız ActionHandlerService (handler registration) için import edilir (D2).
 */
@Module({
  imports: [PrismaModule, V28EngineModule],
  providers: [CollectionDispositionService, PaymentReceivedRegistrar],
  exports: [CollectionDispositionService],
})
export class ClientSettlementModule {}
