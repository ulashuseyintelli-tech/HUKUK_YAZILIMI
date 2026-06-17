import { Module } from '@nestjs/common';
import { PrismaModule } from '@/prisma/prisma.module';
import { ClientNotificationModule } from '../client-notification/client-notification.module';
import { OfficeModule } from '../office/office.module';
import { ClientApprovalController } from './client-approval.controller';
import { ClientApprovalService } from './client-approval.service';

/**
 * Müvekkil Onay Defteri modülü (PR-2 + Faz 3.4 mail tetiği).
 * Bağımsız modül (K-M1). Mail için ClientNotificationModule (dispatcher) + OfficeModule reuse.
 */
@Module({
  imports: [PrismaModule, ClientNotificationModule, OfficeModule],
  controllers: [ClientApprovalController],
  providers: [ClientApprovalService],
  exports: [ClientApprovalService],
})
export class ClientApprovalModule {}
