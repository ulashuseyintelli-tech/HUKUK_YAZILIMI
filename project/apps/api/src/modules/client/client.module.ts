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
// C3-B03 (§13/8): legal hold + on-demand 8-koşullu silme değerlendirme kapısı.
import { ClientLegalHoldController } from './client-legal-hold.controller';
import { ClientLegalHoldService } from './client-legal-hold.service';
// C3-B04 (§13/7): özel nitelikli veri — sınıflandırma + erişim kapısı + şifreli saklama.
import { ClientSpecialCategoryController } from './client-special-category.controller';
import { ClientSpecialCategoryService } from './client-special-category.service';
// C3-B05 (§13/9): vekâletname↔capability binding — tek fail-closed efektif yetki kapısı.
import { ClientPoaCapabilityController } from './client-poa-capability.controller';
import { ClientPoaCapabilityService } from './client-poa-capability.service';
// C3-B06 (§13/10): UYAP aktarım gate'i — CLIENT tarafı (UYAP domain-law'ına dokunulmaz).
import { ClientUyapTransferGateService } from './client-uyap-transfer-gate.service';
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
  controllers: [ClientController, ClientAddressController, ClientConsentController, ClientKvkkRightsController, ClientLegalHoldController, ClientSpecialCategoryController, ClientPoaCapabilityController],
  providers: [ClientService, ClientAddressService, PoaExpiryDeliveryService, ClientConsentService, ClientDisclosureService, ClientDataSubjectRequestService, ClientLegalHoldService, ClientSpecialCategoryService, ClientPoaCapabilityService, ClientUyapTransferGateService],
  exports: [ClientService, ClientConsentService, ClientDisclosureService, ClientDataSubjectRequestService, ClientLegalHoldService, ClientSpecialCategoryService, ClientPoaCapabilityService, ClientUyapTransferGateService],
})
export class ClientModule {}
