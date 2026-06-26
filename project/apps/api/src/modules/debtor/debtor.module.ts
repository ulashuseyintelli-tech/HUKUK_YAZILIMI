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
import { CollectionModule } from "../collection/collection.module";
import { CaseDebtorLifecycleGuardModule } from "../case-debtor-lifecycle-guard/case-debtor-lifecycle-guard.module";
import { PermissionDiagnosticsModule } from "../permission-diagnostics/permission-diagnostics.module";

@Module({
  // G3d: ThirdPartyService alacak haczi tahsilatını kanonik CollectionService'ten yansıtır.
  // P2b-2b-1: CaseDebtorController'da EDIT_PARTIES observe hook için GuidedOpenObserveService.
  imports: [CollectionModule, CaseDebtorLifecycleGuardModule, PermissionDiagnosticsModule],
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
  ],
  exports: [
    DebtorService,
    CaseDebtorService,
    ThirdPartyService,
    DebtorCommunicationService,
    AddressService,
  ],
})
export class DebtorModule {}
