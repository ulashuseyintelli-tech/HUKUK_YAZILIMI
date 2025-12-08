import { Module } from "@nestjs/common";
import { DebtorService } from "./debtor.service";
import { DebtorController } from "./debtor.controller";

@Module({
  controllers: [DebtorController],
  providers: [DebtorService],
  exports: [DebtorService],
})
export class DebtorModule {}
