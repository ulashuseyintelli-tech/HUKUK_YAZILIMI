import { Module } from "@nestjs/common";
import { CaseService } from "./case.service";
import { CaseController } from "./case.controller";
import { OcrModule } from "../ocr/ocr.module";

@Module({
  imports: [OcrModule],
  controllers: [CaseController],
  providers: [CaseService],
  exports: [CaseService],
})
export class CaseModule {}
