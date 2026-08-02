import { Module } from "@nestjs/common";
import { DebtorService } from "./debtor.service";
import { DebtorController } from "./debtor.controller";
import { CaseDebtorService } from "./case-debtor.service";
import { CaseDebtorController } from "./case-debtor.controller";
import { ThirdPartyService } from "./third-party.service";
import { ThirdPartyController } from "./third-party.controller";
import { DebtorCommunicationService } from "./communication.service";
import { CommunicationController } from "./communication.controller";
import { AddressService } from "./address.service";
import { AddressController } from "./address.controller";
import { DebtorCrossCaseNotificationService } from "./debtor-cross-case-notification.service";
import { DebtorCrossCaseNotificationTaskLinkService } from "./debtor-cross-case-notification-task-link.service";
import { CollectionModule } from "../collection/collection.module";
import { CaseDebtorLifecycleGuardModule } from "../case-debtor-lifecycle-guard/case-debtor-lifecycle-guard.module";
import { PermissionDiagnosticsModule } from "../permission-diagnostics/permission-diagnostics.module";
import { AuditModule } from "../audit/audit.module";
import { OfficeApprovalModule } from "../office-approval/office-approval.module";
import { LegalDeadlineModule } from "../legal-deadline/legal-deadline.module";
import { LawyerModule } from "../lawyer/lawyer.module";
import { ExternalCaseStatusAuthorityService } from "./external-case-status-authority.service";
import { ExternalCaseStatusTransitionService } from "./external-case-status-transition.service";

@Module({
  // G3d: ThirdPartyService alacak haczi tahsilatını kanonik CollectionService'ten yansıtır.
  // P2b-2b-1: CaseDebtorController'da EDIT_PARTIES observe hook için GuidedOpenObserveService.
  // Task D1A: AuditModule (create/update/delete audit) + OfficeApprovalModule (delete capability gate).
  // MPB-028(a) PR-4: LegalDeadlineModule — DebtorService'in LEGAL_TIME_CUTOVER flag'i altında
  // kanonik finalizationDate hesabı için LegalPeriodCalculationService'e ihtiyacı var.
  // DEBTOR-EXTERNAL-CASE-STATUS-INTEGRITY-P1-I15-D2-I02: LawyerModule — ExternalCaseStatus
  // AuthorityService'in CaseLawyer-atama çözümlemesi için ActingLawyerResolverService'i
  // (I01, canonical) reuse etmesi gerekiyor — ikinci bir resolver icat EDİLMEDİ.
  imports: [
    CollectionModule,
    CaseDebtorLifecycleGuardModule,
    PermissionDiagnosticsModule,
    AuditModule,
    OfficeApprovalModule,
    LegalDeadlineModule,
    LawyerModule,
  ],
  controllers: [
    DebtorController,
    CaseDebtorController,
    ThirdPartyController,
    CommunicationController,
    AddressController,
  ],
  providers: [
    DebtorService,
    CaseDebtorService,
    ThirdPartyService,
    DebtorCommunicationService,
    AddressService,
    DebtorCrossCaseNotificationService,
    DebtorCrossCaseNotificationTaskLinkService,
    ExternalCaseStatusAuthorityService,
    ExternalCaseStatusTransitionService,
  ],
  exports: [
    DebtorService,
    CaseDebtorService,
    ThirdPartyService,
    DebtorCommunicationService,
    AddressService,
    DebtorCrossCaseNotificationService,
  ],
})
export class DebtorModule {}
