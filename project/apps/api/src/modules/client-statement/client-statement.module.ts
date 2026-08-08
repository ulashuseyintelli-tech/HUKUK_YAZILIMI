import { Module } from '@nestjs/common';
import { PrismaModule } from '@/prisma/prisma.module';
import { ClientNotificationModule } from '../client-notification/client-notification.module';
import { OfficeModule } from '../office/office.module';
import { InterestEngineModule } from '../interest-engine/interest-engine.module';
import { ClientStatementController } from './client-statement.controller';
import { ClientStatementService } from './client-statement.service';
import { ClientStatementPdfService } from './client-statement-pdf.service';
import {
  ClientStatementMonthlyDeliveryService,
  CLIENT_STATEMENT_DELIVERY_LEDGER_PORT,
  CLIENT_STATEMENT_DELIVERY_PORT,
} from './client-statement-monthly-delivery.service';
import { ClientStatementNotificationDeliveryAdapter } from './client-statement-notification-delivery.adapter';
import { ClientStatementPrismaDeliveryLedgerAdapter } from './client-statement-prisma-delivery-ledger.adapter';

/**
 * Müvekkil Ekstresi modülü (PR-3 + Faz 3.4 "ekstre hazır" maili).
 * Bağımsız modül (K-M1). Mail için ClientNotificationModule (dispatcher) + OfficeModule reuse.
 *
 * CAD C3-B04: aylık koşu (ClientStatementMonthlyDeliveryService) VARSAYILAN KAPALI'dır —
 * `CLIENT_STATEMENT_MONTHLY_DELIVERY` env'i açıkça 'true' değilse CRON KAYDI BİLE
 * yapılmaz (kanonik cron envanteri W3-F03 doğrulaması değişmez).
 *
 * Teslim portu (CLIENT_STATEMENT_DELIVERY_PORT) owner ratifikasyonuyla (OPTION A)
 * MEVCUT bildirim zincirine bağlanmıştır: dispatcher → ClientNotificationService.
 * X3-B03 kalıcı Prisma defterini CLIENT_STATEMENT_DELIVERY_LEDGER_PORT'a bağlar;
 * defter yalnız claim/retry metadata'sı taşır, PDF/body içeriği taşımaz. Doğrudan
 * provider çağrısı YASAK. Portlar kayıtlı olsa da aylık koşu bayrağı KAPALI olduğu
 * için production'da hiçbir mail üretilmez/gönderilmez.
 */
@Module({
  imports: [PrismaModule, ClientNotificationModule, OfficeModule, InterestEngineModule],
  controllers: [ClientStatementController],
  providers: [
    ClientStatementService,
    ClientStatementPdfService,
    ClientStatementMonthlyDeliveryService,
    ClientStatementNotificationDeliveryAdapter,
    ClientStatementPrismaDeliveryLedgerAdapter,
    { provide: CLIENT_STATEMENT_DELIVERY_PORT, useExisting: ClientStatementNotificationDeliveryAdapter },
    { provide: CLIENT_STATEMENT_DELIVERY_LEDGER_PORT, useExisting: ClientStatementPrismaDeliveryLedgerAdapter },
  ],
  exports: [ClientStatementService],
})
export class ClientStatementModule {}
