import { Module } from "@nestjs/common";
import { PrismaModule } from "../../prisma/prisma.module";
import { CaseDebtorLifecycleGuardService } from "./case-debtor-lifecycle-guard.service";

@Module({
  imports: [PrismaModule],
  providers: [CaseDebtorLifecycleGuardService],
  exports: [CaseDebtorLifecycleGuardService],
})
export class CaseDebtorLifecycleGuardModule {}
