import { Module } from '@nestjs/common';
import { PrismaModule } from '@/prisma/prisma.module';
import { ClientIntelStatementController } from './client-intel-statement.controller';
import { ClientIntelStatementService } from './client-intel-statement.service';
import { OfficeApprovalModule } from '../office-approval/office-approval.module';

/**
 * Müvekkil İstihbarat Beyanı modülü (Faz 4.0).
 * Bağımsız modül — mevcut debtor/intelligence hattına dokunmaz (yalnız yumuşak istihbarat beyanı).
 * Faz 4 dış-form promote bu servisi reuse edecek.
 * I1A: AuditService @Global (AuditModule) — ek import gerekmez. OfficeApprovalModule
 * retract/falsePositive/supersede capability-gate (isApproverEligible) için gerekli.
 */
@Module({
  imports: [PrismaModule, OfficeApprovalModule],
  controllers: [ClientIntelStatementController],
  providers: [ClientIntelStatementService],
  exports: [ClientIntelStatementService],
})
export class ClientIntelStatementModule {}
