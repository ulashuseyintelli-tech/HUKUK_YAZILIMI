import { Module } from "@nestjs/common";
import { DebtorService } from "./debtor.service";
import { DebtorController } from "./debtor.controller";
import { CaseDebtorService } from "./case-debtor.service";
import { CaseDebtorController } from "./case-debtor.controller";
import { ThirdPartyService } from "./third-party.service";
import { ThirdPartyController } from "./third-party.controller";
import { DebtorCommunicationService } from "./communication.service";
import { CommunicationController } from "./communication.controller";

@Module({
  controllers: [
    DebtorController,
    CaseDebtorController,
    ThirdPartyController,
    CommunicationController,
  ],
  providers: [
    DebtorService,
    CaseDebtorService,
    ThirdPartyService,
    DebtorCommunicationService,
  ],
  exports: [
    DebtorService,
    CaseDebtorService,
    ThirdPartyService,
    DebtorCommunicationService,
  ],
})
export class DebtorModule {}
