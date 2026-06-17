import { Module } from '@nestjs/common';
import { PrismaModule } from '@/prisma/prisma.module';
import { ClientApprovalController } from './client-approval.controller';
import { ClientApprovalService } from './client-approval.service';

/**
 * Müvekkil Onay Defteri modülü (PR-2).
 * Bağımsız modül (K-M1) — mevcut expense-request/policy-engine hattına dokunmaz.
 */
@Module({
  imports: [PrismaModule],
  controllers: [ClientApprovalController],
  providers: [ClientApprovalService],
  exports: [ClientApprovalService],
})
export class ClientApprovalModule {}
