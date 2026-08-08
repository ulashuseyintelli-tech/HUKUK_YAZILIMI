import { Module } from '@nestjs/common';
import { PrismaModule } from '@/prisma/prisma.module';
import { ClientNotificationModule } from '../client-notification/client-notification.module';
import { OfficeModule } from '../office/office.module';
import { ClientStatementController } from './client-statement.controller';
import { ClientStatementService } from './client-statement.service';
import { ClientStatementPdfService } from './client-statement-pdf.service';
import { ClientStatementMonthlyDeliveryService } from './client-statement-monthly-delivery.service';

/**
 * Müvekkil Ekstresi modülü (PR-3 + Faz 3.4 "ekstre hazır" maili).
 * Bağımsız modül (K-M1). Mail için ClientNotificationModule (dispatcher) + OfficeModule reuse.
 *
 * CAD C3-B04: aylık koşu (ClientStatementMonthlyDeliveryService) VARSAYILAN KAPALI'dır —
 * `CLIENT_STATEMENT_MONTHLY_DELIVERY` env'i açıkça 'true' değilse CRON KAYDI BİLE
 * yapılmaz (kanonik cron envanteri W3-F03 doğrulaması değişmez). Teslim
 * portu (CLIENT_STATEMENT_DELIVERY_PORT) burada BİLEREK kayıtlı değildir → koşu
 * PLAN_ONLY çalışır; gerçek gönderim kalıcı outbox ile C3-B05'te bağlanır.
 */
@Module({
  imports: [PrismaModule, ClientNotificationModule, OfficeModule],
  controllers: [ClientStatementController],
  providers: [ClientStatementService, ClientStatementPdfService, ClientStatementMonthlyDeliveryService],
  exports: [ClientStatementService],
})
export class ClientStatementModule {}
