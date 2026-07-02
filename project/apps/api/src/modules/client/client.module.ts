import { Module } from '@nestjs/common';
import { ClientAddressController } from './client-address.controller';
import { ClientAddressService } from './client-address.service';
import { ClientController } from './client.controller';
import { ClientService } from './client.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { ClientIntakeLinkModule } from '../client-intake-link/client-intake-link.module';
import { OfficeApprovalModule } from '../office-approval/office-approval.module';
import { EscalationModule } from '../escalation/escalation.module';
import { PoaExpiryDeliveryService } from '../automation/poa-expiry-delivery.service';

@Module({
  imports: [PrismaModule, AuditModule, ClientIntakeLinkModule, OfficeApprovalModule, EscalationModule],
  controllers: [ClientController, ClientAddressController],
  providers: [ClientService, ClientAddressService, PoaExpiryDeliveryService],
  exports: [ClientService],
})
export class ClientModule {}
