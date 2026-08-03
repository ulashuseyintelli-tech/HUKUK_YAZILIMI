import { Module } from '@nestjs/common';
import { ClientAddressController } from './client-address.controller';
import { ClientAddressService } from './client-address.service';
import { ClientController } from './client.controller';
import { ClientService } from './client.service';
// C3-B01 (§13/5): KVKK açık rıza kaydı — registry + consent servis/controller.
import { ClientConsentController } from './client-consent.controller';
import { ClientConsentService } from './client-consent.service';
// C3-B02 (§13/6): aydınlatma versiyon/teslim + ilgili kişi başvuru akışı.
import { ClientDisclosureService } from './client-disclosure.service';
import { ClientDataSubjectRequestService } from './client-data-subject-request.service';
import { ClientKvkkRightsController } from './client-kvkk-rights.controller';
import { PrismaModule } from '../../prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { ClientIntakeLinkModule } from '../client-intake-link/client-intake-link.module';
import { OfficeApprovalModule } from '../office-approval/office-approval.module';
import { EscalationModule } from '../escalation/escalation.module';
import { PoaExpiryDeliveryService } from '../automation/poa-expiry-delivery.service';
import { ClientNotificationModule } from '../client-notification/client-notification.module';
import { PoaModule } from '../poa/poa.module';

@Module({
  imports: [PrismaModule, AuditModule, ClientIntakeLinkModule, OfficeApprovalModule, EscalationModule, ClientNotificationModule, PoaModule],
  controllers: [ClientController, ClientAddressController, ClientConsentController, ClientKvkkRightsController],
  providers: [ClientService, ClientAddressService, PoaExpiryDeliveryService, ClientConsentService, ClientDisclosureService, ClientDataSubjectRequestService],
  exports: [ClientService, ClientConsentService, ClientDisclosureService, ClientDataSubjectRequestService],
})
export class ClientModule {}
