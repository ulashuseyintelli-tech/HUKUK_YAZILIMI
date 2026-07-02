import { Module } from '@nestjs/common';
import { PrismaModule } from '@/prisma/prisma.module';
import { ClientNotificationModule } from '../client-notification/client-notification.module';
import { OfficeModule } from '../office/office.module';
import { OfficeApprovalModule } from '../office-approval/office-approval.module';
import { ClientIntakeLinkController } from './client-intake-link.controller';
import { ClientIntakeLinkService } from './client-intake-link.service';

/**
 * Müvekkil İntake Linki modülü (Faz 4.3).
 * Personel-tarafı link üretimi + INTAKE_LINK mail (Faz 3 dispatcher reuse).
 * Public submit/review/promote AYRI fazlar (4.4/4.5/4.6). Bağımsız modül.
 * I1A: AuditService @Global — ek import gerekmez. OfficeApprovalModule revoke
 * capability-gate (isApproverEligible) için gerekli.
 */
@Module({
  imports: [PrismaModule, ClientNotificationModule, OfficeModule, OfficeApprovalModule],
  controllers: [ClientIntakeLinkController],
  providers: [ClientIntakeLinkService],
  exports: [ClientIntakeLinkService],
})
export class ClientIntakeLinkModule {}
