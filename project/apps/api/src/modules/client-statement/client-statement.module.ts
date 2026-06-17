import { Module } from '@nestjs/common';
import { PrismaModule } from '@/prisma/prisma.module';
import { ClientNotificationModule } from '../client-notification/client-notification.module';
import { OfficeModule } from '../office/office.module';
import { ClientStatementController } from './client-statement.controller';
import { ClientStatementService } from './client-statement.service';

/**
 * Müvekkil Ekstresi modülü (PR-3 + Faz 3.4 "ekstre hazır" maili).
 * Bağımsız modül (K-M1). Mail için ClientNotificationModule (dispatcher) + OfficeModule reuse.
 */
@Module({
  imports: [PrismaModule, ClientNotificationModule, OfficeModule],
  controllers: [ClientStatementController],
  providers: [ClientStatementService],
  exports: [ClientStatementService],
})
export class ClientStatementModule {}
