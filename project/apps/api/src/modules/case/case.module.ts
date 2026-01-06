import { Module, forwardRef } from "@nestjs/common";
import { CaseService } from "./case.service";
import { CaseController } from "./case.controller";
import { OcrModule } from "../ocr/ocr.module";
import { AddressDiscoveryModule } from "../address-discovery/address-discovery.module";
import { InterestEngineModule } from "../interest-engine/interest-engine.module";

@Module({
  imports: [
    OcrModule, 
    forwardRef(() => AddressDiscoveryModule),
    forwardRef(() => InterestEngineModule),
  ],
  controllers: [CaseController],
  providers: [CaseService],
  exports: [CaseService],
})
export class CaseModule {}
