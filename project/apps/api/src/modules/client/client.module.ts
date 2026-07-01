import { Module } from '@nestjs/common';
import { ClientAddressController } from './client-address.controller';
import { ClientAddressService } from './client-address.service';
import { ClientController } from './client.controller';
import { ClientService } from './client.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { ClientIntakeLinkModule } from '../client-intake-link/client-intake-link.module';
import { OfficeApprovalModule } from '../office-approval/office-approval.module';

@Module({
  imports: [PrismaModule, AuditModule, ClientIntakeLinkModule, OfficeApprovalModule],
  controllers: [ClientController, ClientAddressController],
  providers: [ClientService, ClientAddressService],
  exports: [ClientService],
})
export class ClientModule {}
